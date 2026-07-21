// Hover-stability regression test — guards the "button jitters under the cursor" class of bug
// (a transform on the hover target moving it out from under the pointer → un-hover → oscillation).
// Hovers each .btn, samples hover-state + transform for 1.2s, and FAILS on any oscillation:
// the element must stay hovered the entire time and its transform must settle (≤2 distinct values).
// Run: node verify/hover-stability.mjs [url-or-file]   (defaults to the local index.html)
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
// Playwright isn't a dependency of this static site. Resolve it from wherever the operator has it:
// set PLAYWRIGHT_RESOLVE_FROM to any package.json whose node_modules contain playwright.
const resolveFrom = process.env.PLAYWRIGHT_RESOLVE_FROM;
if (!resolveFrom) { console.error('set PLAYWRIGHT_RESOLVE_FROM=/path/to/a/package.json that has playwright'); process.exit(2); }
const { chromium } = createRequire(resolveFrom)('playwright');

const target = process.argv[2] || pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push(String(err)));
await page.goto(target, { waitUntil: 'load' });
await page.waitForTimeout(800); // let entrance animations settle

let failures = 0;
const buttons = await page.locator('a.btn').all();
console.log(`checking ${buttons.length} button(s)…`);
for (const button of buttons) {
  const label = (await button.innerText()).trim().slice(0, 30);
  // Manual scroll (not scrollIntoViewIfNeeded): the page has INTENTIONAL infinite animations
  // (aurora, pulse), so Playwright's element-stability wait would never resolve.
  await button.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  // Deterministic settle (NOT a fixed sleep): the footer button rides a scroll-reveal that
  // translates it into place, so a tuned sleep races the transition and flakes. Poll the box
  // every 100ms until two CONSECUTIVE reads are byte-identical — that's the reveal fully at rest.
  let box = await button.boundingBox();
  const same = (a, b) => a && b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  for (let tries = 0; tries < 60; tries++) {
    await page.waitForTimeout(100);
    const next = await button.boundingBox();
    if (same(box, next)) { box = next; break; }
    box = next;
  }
  if (!box) continue;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500); // let the 350ms hover transition SETTLE — we assert stability, not entry
  const samples = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(100);
    samples.push(await button.evaluate((el) => ({
      hovered: el.matches(':hover'),
      transform: getComputedStyle(el).transform,
    })));
  }
  const unhovered = samples.filter((s) => !s.hovered).length;
  const distinctTransforms = new Set(samples.map((s) => s.transform)).size;
  // Settled state must be: continuously hovered, exactly ONE transform (any oscillation = jitter).
  const ok = unhovered === 0 && distinctTransforms === 1;
  console.log(`  ${ok ? '✓' : '✗'} "${label}" — hovered ${8 - unhovered}/8, ${distinctTransforms} settled transform state(s)`);
  if (!ok) failures++;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
}
if (consoleErrors.length) { console.log('console errors:', consoleErrors); failures++; }
await browser.close();
console.log(failures ? `FAIL (${failures})` : 'PASS — no hover jitter, no console errors');
process.exit(failures ? 1 : 0);
