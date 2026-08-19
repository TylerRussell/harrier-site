// Recompute the CSP script-src hash for a page with an inline <script>.
//
// A meta-CSP pins each inline script by the SHA-256 of its EXACT body. Edit one character of that script
// without recomputing, and the browser refuses to run it — the page still renders, so the failure looks
// like "the buttons do nothing" rather than anything security-shaped. Doing this by hand is how that
// happens, so it is a script:
//
//   node tools/csp-hash.mjs report.html          # rewrite the pin in place
//   node tools/csp-hash.mjs report.html --check   # exit 1 if the pin is stale (CI-style)
import crypto from 'node:crypto';
import fs from 'node:fs';

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('usage: node tools/csp-hash.mjs <file.html> [--check]');
  process.exit(2);
}
const check = flags.includes('--check');
const html = fs.readFileSync(file, 'utf8');

// The LAST <script> without a src is the inline one these pages carry. Matching the body exactly matters:
// the hash covers the bytes between the tags, with no trimming of any kind.
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 1) {
  console.error(`${file}: expected exactly one inline <script>, found ${scripts.length}`);
  process.exit(2);
}
const digest = crypto.createHash('sha256').update(scripts[0][1], 'utf8').digest('base64');
const pin = `'sha256-${digest}='`.replace("='", "'"); // digest already ends with padding when needed

const CSP = /(<meta http-equiv="Content-Security-Policy" content="[^"]*script-src )('[^']*')/;
const found = CSP.exec(html);
if (!found) {
  console.error(`${file}: no script-src directive found in the CSP meta tag`);
  process.exit(2);
}
const want = `'sha256-${digest}'`;
if (found[2] === want) {
  console.log(`${file}: CSP hash is current (${want})`);
  process.exit(0);
}
if (check) {
  console.error(`${file}: CSP hash is STALE.\n  pinned: ${found[2]}\n  actual: ${want}\n  fix: node tools/csp-hash.mjs ${file}`);
  process.exit(1);
}
fs.writeFileSync(file, html.replace(CSP, `$1${want}`));
console.log(`${file}: CSP hash updated to ${want}`);
