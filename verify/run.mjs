// The site gate. One command, two modes:
//
//   node verify/run.mjs                      # LOCAL — serves the repo from disk, checks it before deploy
//   node verify/run.mjs --live               # LIVE  — checks https://getharrier.com as a visitor sees it
//   node verify/run.mjs --live https://…     # LIVE against a specific origin
//
// Both run the SAME assertions (verify/checks.mjs). They are not interchangeable: Cloudflare rewrites the
// HTML at the edge, so a local run cannot see an injected beacon or a rewritten mailto — the two together
// are the coverage, and the runner says so in its output rather than letting a green local run imply more
// than it proved.
//
// Playwright is not a dependency of this static site. Point PLAYWRIGHT_RESOLVE_FROM at any package.json
// whose node_modules contain it (same convention as hover-stability.mjs).
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as checks from './checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resolveFrom = process.env.PLAYWRIGHT_RESOLVE_FROM;
if (!resolveFrom) {
  console.error('set PLAYWRIGHT_RESOLVE_FROM=/path/to/a/package.json whose node_modules contain playwright');
  process.exit(2);
}
const { chromium } = createRequire(resolveFrom)('playwright');

const live = process.argv.includes('--live');
const explicit = process.argv.find((a) => a.startsWith('http'));
const PAGES = ['/', '/report.html', '/privacy.html', '/terms.html'];
const VIEWPORTS = [1440, 390];
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain' };

/** A minimal static server — no dependency, and it serves exactly what the repo would publish. */
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

const results = [];
// Warnings are reported on every run and never fail the build. The distinction is deliberate: a failure
// must be something a commit can fix. Anything else — an account setting on a CDN we do not control —
// belongs in the output where it is read, not in the exit code where it reds the build forever and
// teaches everyone to ignore the mail.
const record = (label, failures, warnings = []) => results.push({ label, failures, warnings });

const browser = await chromium.launch();
const local = live ? null : await serve();
const base = live ? explicit || 'https://getharrier.com' : local.base;
console.log(`${live ? 'LIVE' : 'LOCAL'} verification of ${base}\n`);

for (const route of PAGES) {
  for (const width of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    const completed = []; // responses that actually arrived — the difference between "asked" and "got"
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('request', (r) => requests.push(r.url()));
    page.on('response', (r) => completed.push(r.url()));
    await page.goto(base + route, { waitUntil: 'networkidle' });

    const where = `${route} @${width}`;
    record(`${where} contact links`, await checks.contactLinksWork(page));
    record(`${where} mailto usable`, await checks.mailtoLinksResolve(page));
    const edge = await checks.edgeInjection(page, completed);
    record(`${where} no edge injection`, edge.failures, edge.warnings);
    record(`${where} no off-origin requests`, checks.offOriginRequests(requests, base));
    record(`${where} no page errors`, checks.pageErrors(errors));
    record(`${where} no horizontal scroll`, await checks.noHorizontalScroll(page));
    if (width === 1440) record(`${where} internal links resolve`, await checks.internalLinksResolve(page, base));
    if (route === '/report.html' && width === 1440) {
      record(`${where} report composes a valid payload`, await checks.reportPageComposes(page));
    }
    await context.close();
  }
}

await browser.close();
local?.server.close();

let failed = 0;
let warned = 0;
for (const { label, failures, warnings } of results) {
  if (failures.length === 0 && warnings.length === 0) {
    console.log(`  ok    ${label}`);
    continue;
  }
  if (failures.length) {
    failed += failures.length;
    console.log(`  FAIL  ${label}`);
    failures.forEach((f) => console.log(`      ${f}`));
  }
  if (warnings.length) {
    warned += warnings.length;
    console.log(`  warn  ${label}`);
    warnings.forEach((w) => {
      console.log(`      ${w}`);
      // A GitHub annotation, so it surfaces on the run summary rather than only in the log body.
      if (process.env.GITHUB_ACTIONS) console.log(`::warning::${w.split('\n')[0]}`);
    });
  }
}

const passed = results.filter((r) => !r.failures.length).length;
console.log(
  `\n${passed}/${results.length} checks passed` +
    (failed ? `, ${failed} failure(s)` : '') +
    (warned ? `, ${warned} warning(s) — see above; warnings never fail the build` : ''),
);
if (!live) {
  console.log(
    '\nNOTE: this was the LOCAL gate. It cannot see anything Cloudflare does at the edge — an injected\n' +
      'analytics beacon or a rewritten mailto is invisible from disk. Run `--live` after deploying.',
  );
}
process.exit(failed ? 1 : 0);
