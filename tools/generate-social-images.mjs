// Regenerates og.png (1200x630 share card) and favicon.png (64x64) from index.html.
//
// WHY THIS EXISTS: both were hand-made once and then silently rotted. By 2026-07-25 og.png still read
// "Your autonomous job applier" (the page had said "hunter" for a day), still showed the retired
// lump-sum stats ("3,500+ roles found") that averages replaced, still carried the old line-chart logo,
// and still pointed at the pre-domain GitHub Pages URL — so every shared link previewed a headline and
// numbers the live page contradicted. Nobody noticed because a binary can't be reviewed in a diff.
//
// So nothing here is retyped: the feather, the headline, the stats and the domain are all PARSED OUT OF
// index.html at run time. If the page changes and this isn't re-run, the check below fails loudly rather
// than letting the card drift again.
//
//   node tools/generate-social-images.mjs           # regenerate both
//   node tools/generate-social-images.mjs --check   # CI-style: fail if the page has moved on
//
// Needs Playwright. This repo has no node_modules of its own, so point NODE_PATH at an install that has
// it (PLAYWRIGHT_DIR does the same job for the resolver below):
//   NODE_PATH=/path/to/some/node_modules node tools/generate-social-images.mjs
//
// The private application repo's name is deliberately NOT written here. This file is published; a comment
// naming a private repository is a small, permanent disclosure of something nobody outside needs to know.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// This repo is a static site with no node_modules of its own, and ESM resolves bare specifiers from the
// SCRIPT's location (not cwd), so `import 'playwright'` can't be satisfied here and NODE_PATH doesn't
// apply to ESM. Borrow a Playwright install from any checkout that has one, via PLAYWRIGHT_DIR:
//
//   PLAYWRIGHT_DIR=/path/to/some-repo/node_modules/playwright/index.mjs node tools/generate-social-images.mjs
//
// Required, with no baked-in default on purpose: a default would hardcode one machine's directory layout
// into a public repository, which both leaks that layout and silently breaks for everyone else.
const playwrightDir = process.env.PLAYWRIGHT_DIR;
if (!playwrightDir || !fs.existsSync(playwrightDir)) {
  console.error(
    'generate-social-images: set PLAYWRIGHT_DIR to a playwright/index.mjs path ' +
      '(e.g. PLAYWRIGHT_DIR=/path/to/repo/node_modules/playwright/index.mjs).',
  );
  process.exit(1);
}
const { chromium } = await import(pathToFileURL(playwrightDir).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/** Pull a single capture group out of index.html, or die loudly — a silent miss is how it rotted before. */
function extract(pattern, label) {
  const match = html.match(pattern);
  if (!match) throw new Error(`generate-social-images: could not find ${label} in index.html`);
  return match[1].trim();
}

// The brand mark, verbatim — same markup the nav renders, so the card can never show a stale logo.
const featherSvg = extract(/(<svg viewBox="0 0 24 24"[\s\S]*?<\/svg>)/, 'the feather mark');
// Headline: strip the per-word <span>s the hero animation needs.
const headline = extract(/<h1 class="headline">([\s\S]*?)<\/h1>/, 'the headline')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const domain = extract(/<link rel="canonical" href="https:\/\/([^/"]+)/, 'the canonical domain');
// The four hero stats, as rendered — value + label, in page order.
// Values take several shapes on the page ("~20", "46%", "16"), so match any leading figure rather than
// assuming the tilde — a too-strict pattern here silently drops stats from the card.
const stats = [...html.matchAll(/<span><b>(~?[\d.]+%?)<\/b>\s*([^<]+)<\/span>/g)].map((m) => ({
  value: m[1],
  label: m[2].trim(),
}));
if (stats.length !== 4) throw new Error(`generate-social-images: expected 4 hero stats, found ${stats.length}`);

const card = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:#000;color:#fff;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
    display:flex;flex-direction:column;justify-content:center;padding:0 86px;position:relative;overflow:hidden}
  /* The same warm bloom the site's hero sits in, so the card feels like the page it links to. */
  .glow{position:absolute;inset:0;background:
    radial-gradient(900px 520px at 22% 4%, rgba(255,140,66,.20), transparent 62%),
    radial-gradient(620px 420px at 96% 96%, rgba(255,140,66,.10), transparent 68%)}
  .row{position:relative;display:flex;align-items:center;gap:15px;margin-bottom:40px}
  .row svg{width:47px;height:47px}
  .brand{font-size:37px;font-weight:700;letter-spacing:-.02em}
  h1{position:relative;font-size:83px;line-height:1.03;letter-spacing:-.035em;font-weight:700;max-width:15ch}
  h1 .a{background:linear-gradient(100deg,#ffd9b8,#ff8c42);-webkit-background-clip:text;background-clip:text;color:transparent}
  .stats{position:relative;display:flex;gap:34px;margin-top:44px;flex-wrap:wrap}
  .stat b{display:block;font-size:35px;font-weight:700;letter-spacing:-.02em;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .stat span{font-size:16px;color:#a8a8a8;letter-spacing:.01em}
  .foot{position:relative;margin-top:52px;display:flex;align-items:center;gap:13px;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:19px;color:#8a8a8a}
  .pill{border:1px solid rgba(255,140,66,.45);color:#ff8c42;border-radius:999px;padding:5px 15px;font-size:15px}
</style></head><body>
  <div class="glow"></div>
  <div class="row">${featherSvg}<span class="brand">Harrier</span></div>
  <h1>${headline.replace(/(job hunter\.?)$/i, '<span class="a">$1</span>')}</h1>
  <div class="stats">${stats
    .map((s) => `<div class="stat"><b>${s.value}</b><span>${s.label}</span></div>`)
    .join('')}</div>
  <div class="foot"><span class="pill">In beta</span><span>${domain}</span></div>
</body></html>`;

// The favicon is the mark alone on the site's own near-black tile — no text survives 64px.
const icon = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0}
  body{width:64px;height:64px;background:#0a0a0a;display:flex;align-items:center;justify-content:center;
    border-radius:14px;overflow:hidden}
  svg{width:46px;height:46px}
</style></head><body>${featherSvg}</body></html>`;

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const ogPage = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await ogPage.setContent(card, { waitUntil: 'load' });
  const ogBuffer = await ogPage.screenshot({ type: 'png' });

  const iconPage = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 2 });
  await iconPage.setContent(icon, { waitUntil: 'load' });
  const iconBuffer = await iconPage.screenshot({ type: 'png', omitBackground: true });

  if (process.argv.includes('--check')) {
    // Byte-compare rather than trust a timestamp: this is what a CI job would run to catch a page edit
    // that never regenerated the card.
    const stale = ['og.png', 'favicon.png'].filter((name, i) => {
      const expected = i === 0 ? ogBuffer : iconBuffer;
      const current = fs.readFileSync(path.join(ROOT, name));
      return !current.equals(expected);
    });
    if (stale.length) {
      console.error(`✗ stale social images: ${stale.join(', ')} — run: node tools/generate-social-images.mjs`);
      process.exit(1);
    }
    console.log('✓ og.png and favicon.png match index.html');
  } else {
    fs.writeFileSync(path.join(ROOT, 'og.png'), ogBuffer);
    fs.writeFileSync(path.join(ROOT, 'favicon.png'), iconBuffer);
    console.log(`✓ og.png (${ogBuffer.length} B) + favicon.png (${iconBuffer.length} B)`);
    console.log(`  headline: ${headline}`);
    console.log(`  stats   : ${stats.map((s) => `${s.value} ${s.label}`).join(' · ')}`);
    console.log(`  domain  : ${domain}`);
  }
} finally {
  await browser.close();
}
