// The assertions. Each takes a loaded page (and the base URL) and returns an array of failure strings —
// empty means pass. Kept separate from the runner so the SAME checks run against a local static server
// before deploy and against the live origin after, with no chance of the two drifting.
//
// WHAT LOCAL CANNOT COVER, stated here so a green local run is never mistaken for full coverage:
// Cloudflare sits in front of the live site and rewrites the HTML at the edge. Serving from disk skips it
// entirely. The email-obfuscation rewrite that broke every contact link on 2026-08-19 was invisible
// locally by construction — only the live run can see it. Hence two gates, not one.

/** Anchors whose destination is a Cloudflare email-protection stub, i.e. a link that goes nowhere. */
export async function contactLinksWork(page) {
  const bad = await page.evaluate(() =>
    [...document.querySelectorAll('a')]
      .map((a) => ({ href: a.getAttribute('href') || '', text: (a.textContent || '').trim() }))
      .filter((l) => /cdn-cgi\/l\/email-protection/.test(l.href) || /email[\s ]*protected/i.test(l.text))
      .map((l) => `${JSON.stringify(l.text.slice(0, 40))} -> ${l.href.slice(0, 60)}`),
  );
  return bad.map(
    (l) =>
      `contact link is broken: ${l}\n      Cloudflare Email Obfuscation rewrote it and the decoder is blocked by our CSP.` +
      `\n      Fix: wrap the anchor in <!--email_off-->…<!--/email_off-->, and turn the feature off in Scrape Shield.`,
  );
}

/** Every mailto must carry a real address — a rewritten or empty one is a dead end for the visitor. */
export async function mailtoLinksResolve(page, { expectAtLeast = 1 } = {}) {
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '').filter((h) => h.startsWith('mailto:')),
  );
  const failures = links
    .filter((h) => !/^mailto:[^@\s]+%40|^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/.test(h))
    .map((h) => `mailto link has no usable address: ${h.slice(0, 60)}`);
  if (links.length < expectAtLeast) {
    failures.push(
      `expected at least ${expectAtLeast} mailto link(s), found ${links.length} — ` +
        'the contact path may have been rewritten away entirely',
    );
  }
  return failures;
}

/**
 * Scripts the CDN injects into pages we never wrote. These are ACCOUNT SETTINGS, not repository state —
 * nobody can fix them by pushing a commit — so they are reported as WARNINGS and do not fail the build.
 * A gate that fails forever on something the committer cannot change stops being read, which costs more
 * than the thing it was warning about.
 *
 * The genuine risk IS gated: if an injected script's request actually COMPLETES, data left the visitor's
 * browser and that is a failure. Today the page CSP blocks it, so this stays a warning until the CSP is
 * ever loosened — at which point it becomes a hard failure by itself, with no one needing to remember.
 */
export async function edgeInjection(page, completedOffOrigin = []) {
  const injected = await page.evaluate(() =>
    [...document.querySelectorAll('script[src]')]
      .map((s) => s.getAttribute('src') || '')
      .filter((src) => /cloudflareinsights|cdn-cgi\/scripts/.test(src)),
  );
  const warnings = injected.map((src) =>
    src.includes('cloudflareinsights')
      ? `Cloudflare Web Analytics beacon injected (blocked by CSP, so nothing is collected): ${src.slice(0, 60)}\n      Turn it off: dash.cloudflare.com > ACCOUNT (not the domain) > Analytics & Logs > Web Analytics.`
      : `Cloudflare script injected (blocked by CSP): ${src.slice(0, 60)}\n      Turn it off: dash.cloudflare.com > getharrier.com > Scrape Shield.`,
  );
  const failures = completedOffOrigin
    .filter((url) => /cloudflareinsights|cdn-cgi\/scripts/.test(url))
    .map((url) => `an injected CDN script actually LOADED — data is leaving the visitor's browser: ${url.slice(0, 80)}`);
  return { warnings, failures };
}

/**
 * Nothing may be fetched from another origin BY OUR OWN CODE — the site's whole posture is self-contained.
 * Requests for CDN-injected scripts are excluded here and handled by edgeInjection() instead: counting
 * them twice would blame the page for something the edge did to it, and would make this check unfixable
 * from the repository.
 */
export function offOriginRequests(recorded, baseUrl) {
  const host = new URL(baseUrl).host;
  return recorded
    .filter((url) => {
      if (/cloudflareinsights|cdn-cgi\/scripts/.test(url)) return false;
      try {
        return new URL(url).host !== host;
      } catch {
        return false;
      }
    })
    .map((url) => `off-origin request: ${url.slice(0, 90)}`);
}

/** Errors the PAGE caused. CSP blocks of injected CDN scripts are reported by noEdgeInjection instead —
 *  counting them here would blame the page for something the edge did to it. */
export function pageErrors(recorded) {
  return recorded
    .filter((text) => !/cloudflareinsights|cdn-cgi\/scripts/.test(text))
    .map((text) => `console/page error: ${text.slice(0, 160)}`);
}

/** A page that scrolls sideways is broken on a phone. */
export async function noHorizontalScroll(page) {
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  return overflows ? ['page scrolls horizontally at this viewport'] : [];
}

/** Every in-site link must resolve. A 404 in the footer is the kind of thing nobody clicks until a buyer does. */
export async function internalLinksResolve(page, baseUrl) {
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href') || '')
      .filter((h) => h && !/^(mailto:|https?:|#|\/cdn-cgi)/.test(h)),
  );
  const failures = [];
  for (const href of [...new Set(hrefs)]) {
    const target = new URL(href, baseUrl).href;
    try {
      const response = await page.request.get(target);
      if (!response.ok()) failures.push(`internal link ${href} -> HTTP ${response.status()}`);
    } catch (error) {
      failures.push(`internal link ${href} -> ${String(error).slice(0, 60)}`);
    }
  }
  return failures;
}

/** The report page must actually compose a report the intake can parse. This is the page people reach
 *  when everything else is broken, so "it renders" is not a sufficient assertion. */
export async function reportPageComposes(page) {
  const failures = [];
  await page.fill('#what', 'verification run — this text must reach the payload');
  await page.waitForTimeout(300);
  const text = await page.textContent('#preview');
  if (!text?.includes('===HARRIER-REPORT-V1-BEGIN===')) return ['report page produced no machine block'];

  const payload = text.split('===HARRIER-REPORT-V1-BEGIN===')[1].split('===HARRIER-REPORT-V1-END===')[0];
  let bundle;
  try {
    bundle = JSON.parse(Buffer.from(payload.replace(/\s+/g, ''), 'base64').toString('utf8'));
  } catch (error) {
    return [`report payload does not decode: ${String(error).slice(0, 80)}`];
  }
  if (!bundle.user?.message?.includes('verification run')) failures.push('report payload lost the message');
  if (!/^HR-\d{4}-\d{2}-\d{2}-\d{6}-[a-z]{4}$/.test(bundle.report_id || '')) {
    failures.push(`report id is not in the scrub-safe format: ${bundle.report_id}`);
  }
  const href = await page.getAttribute('#send', 'href');
  if (!href?.startsWith('mailto:')) failures.push('report page send button is not a mailto');
  if ((href || '').length > 2000) failures.push(`report mailto is ${href.length} chars — too long to open`);
  return failures;
}
