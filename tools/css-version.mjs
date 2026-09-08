// Stamp every <link rel="stylesheet"> with ?v=<content hash>.
//
// Cloudflare caches CSS for four hours (max-age=14400). The HTML revalidates far sooner, so a
// `git push` that changes a stylesheet ships new markup against the OLD stylesheet — the page is
// live and subtly wrong, and nothing fails. That is how index.html shipped a footer whose link
// spacing rule had been deployed but not yet served.
//
// The fix is the same shape as tools/csp-hash.mjs: derive a token from the file's own bytes, write
// it into the reference, and let a changed file produce a changed URL that no cache can have.
//
//   node tools/css-version.mjs               # rewrite every page's stylesheet links in place
//   node tools/css-version.mjs --check       # exit 1 if any stamp is stale (CI-style)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.slice(2).includes('--check');
const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const LINK = /<link rel="stylesheet" href="([^"?]+\.css)(\?v=[a-f0-9]+)?">/g;

const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 8);

let stale = 0;
let changed = 0;
for (const page of PAGES) {
  const file = path.join(ROOT, page);
  const html = fs.readFileSync(file, 'utf8');
  const next = html.replace(LINK, (whole, href, current) => {
    const target = path.join(ROOT, href);
    if (!fs.existsSync(target)) {
      console.error(`${page}: references a stylesheet that does not exist — ${href}`);
      process.exitCode = 2;
      return whole;
    }
    const want = `?v=${hash(target)}`;
    if (current !== want) stale++;
    return `<link rel="stylesheet" href="${href}${want}">`;
  });
  if (next === html) continue;
  changed++;
  if (!check) fs.writeFileSync(file, next);
}

if (check) {
  if (stale) {
    console.error(`css-version: ${stale} stale stylesheet stamp(s) across ${changed} page(s) — run: node tools/css-version.mjs`);
    process.exit(1);
  }
  console.log('css-version: every stylesheet stamp is current');
} else {
  console.log(stale ? `css-version: stamped ${stale} stylesheet link(s) across ${changed} page(s)` : 'css-version: already current');
}
