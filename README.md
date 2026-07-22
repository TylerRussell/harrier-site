# Harrier — landing site

The public landing page for **Harrier**, an AI agent that finds jobs, tailors a résumé
for each one, and applies for you — all from your own machine. Currently in **private beta**.

Live: <https://tylerrussell.github.io/harrier-site/>

This is a hand-written static site. No framework, no build step, no bundler, no external
requests. Editing copy is editing HTML; **`git push` to `main` is the deploy** (GitHub Pages
rebuilds within a minute).

## Files

```
index.html        The whole page (semantic HTML + one inline <script> for motion)
css/base.css      Tokens, reset, atmosphere (aurora + sweep), nav, hero, buttons
css/sections.css  Funnel, "how it works", trust, FAQ, CTA, footer + scroll reveals
og.png            1200×630 social preview card (regenerate — see below)
favicon.png       64×64 tab icon
```

## Deploy

Pages serves `main` at the repo root (legacy build). To publish a change:

```bash
git add -A && git commit -m "..." && git push
```

That's the entire pipeline. There is nothing to run, no server, no CI.

## The monetize toggle (beta → paid)

The site ships in **beta mode**: the call-to-action is a mailto "Request beta access", and the
paid **Buy** button is present in the markup but **commented out**.

When the monetize flag flips, uncomment the Buy button and point it at the live Stripe Payment
Link. It lives in `index.html`, in the final CTA section, on the line marked:

```html
<!-- MONETIZE: uncomment when the flag flips (private beta → paid). ... -->
<!-- <a class="btn magnetic" href="#" data-payment-link>Buy Harrier ...</a> -->
```

Swap the `href="#"` placeholder for the Payment Link and remove (or keep) the beta CTA above it.

## Security posture

This is static content, but it's hardened as far as a Pages-hosted page allows:

- **Content-Security-Policy** (via `<meta>`): `default-src 'none'` — nothing loads unless
  explicitly allowed. Styles are `'self'` (the two CSS files), the single inline script is
  pinned by its **SHA-256 hash** (no `'unsafe-inline'` for scripts), images are `'self' data:`,
  and `base-uri`/`form-action` are locked to `'none'`. No external origin can load anything.
- **Referrer-Policy** `no-referrer`.
- **Clickjacking**: `frame-ancestors` is ignored in a `<meta>` CSP, so the inline script also
  includes a frame-buster (`if (self !== top) top.location = self.location`) — its hash is the
  one pinned in the CSP.
- **No cookies, no localStorage, no analytics, no fonts/CDNs, no third-party requests.** The page
  makes zero cross-origin requests.
- External links use `rel="noopener noreferrer"` where applicable (the CTAs are `mailto:` links).

**Known limitation:** GitHub Pages cannot set real HTTP response headers, so the CSP and
Referrer-Policy are delivered via `<meta>` (which covers most, but not header-only directives
like `frame-ancestors` or HSTS — HTTPS itself is enforced by Pages). **Upgrade path:** when the
site moves to a custom domain, put **Cloudflare** in front of it and set the real response headers
there (CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `Strict-Transport-Security`,
`X-Content-Type-Options: nosniff`). That closes the header-only gap without touching the markup.

If you edit the inline script, its hash changes — recompute it and update the `script-src` hash in
the CSP `<meta>`, or the script will be blocked.

## Anti-scraper / anti-indexing

A public URL is fetchable by anyone; these measures only stop *well-behaved* crawlers (search
engines + compliant AI bots) from indexing or training on the site — reducing where it shows up.
Three tiers:

1. **Per-page `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noai,
   noimageai">`** on every page — **this is what works today**, because on the `…/harrier-site/`
   project path a crawler reads the *root* `robots.txt` (which this repo doesn't control), not ours.
2. **`robots.txt`** (Disallow all + a named blocklist of AI crawlers: GPTBot, Google-Extended,
   ClaudeBot, PerplexityBot, CCBot, Bytespider, etc.). Becomes **fully effective once the site is
   served at a custom-domain root** (e.g. `harrier.io/robots.txt`).
3. **Cloudflare in front of the custom domain** (same upgrade as the header gap above) — its "Block
   AI Scrapers/Crawlers" + bot-fight can actually *challenge/block* non-compliant bots, which
   robots.txt (advisory only) cannot.

**Launch toggle:** the whole site is `noindex` for private beta. At public launch, remove `noindex`
from `index.html` if you want the marketing page found via search — but keep it on `terms.html` /
`privacy.html` if you'd rather your operator name not be indexed.

## Regenerating the OG image / favicon

Both are static PNGs. They were rendered headlessly from small standalone HTML files (dark aurora
+ product name + aggregate stats for the card; the flight-path mark for the icon). To change them,
edit those source HTML files and re-screenshot at 1200×630 / 64×64.

## Stats

The numbers on the page are **real, all-time, aggregate figures for Harrier's first user**, and are
**rounded down** so they never overstate. No personal or employer data appears anywhere on the site.
