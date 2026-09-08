# Harrier — landing site

The public landing page for **Harrier**, an AI agent that finds jobs, tailors a résumé
for each one, and applies for you — all from your own machine. Currently in **beta**: the first
three applications are free, then a $49 license good for one year.

Live: <https://getharrier.com/>

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

## The Buy button

The CTA leads with the free tier — `npm install -g harrier-ai`, three applications free — and
offers a licence as the secondary control. That Buy button is in the markup and **activates itself
the moment its `href` is a real Payment Link**:

```html
<a class="btn" href="#" data-payment-link>Buy a license — $49 …</a>
```

Swap `href="#"` for the live `https://buy.stripe.com/…` link and it appears. Until then the inline
script removes it on load, so the site cannot ship a Buy control that goes nowhere — the failure
mode is a missing button, never a dead one.

**The advertised numbers are promises.** "Three free applications" and "$49 / one year" must match
`DEFAULT_FREE_SUBMIT_CAP` and the Stripe price in the product repo, and the wording in
`terms.html`. Change one, change all three.

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
like `frame-ancestors` or HSTS — HTTPS itself is enforced by Pages). **Upgrade path:** the site
now runs on its custom domain (`getharrier.com`); the remaining step is putting **Cloudflare** in
front of it (proxied / orange-cloud) and setting the real response headers there (CSP,
`X-Frame-Options: DENY`, `Referrer-Policy`, `Strict-Transport-Security`,
`X-Content-Type-Options: nosniff`). That closes the header-only gap without touching the markup.

If you edit the inline script, its hash changes — recompute it and update the `script-src` hash in
the CSP `<meta>`, or the script will be blocked.

## Anti-scraper / anti-indexing

A public URL is fetchable by anyone; these measures only stop *well-behaved* crawlers (search
engines + compliant AI bots) from indexing or training on the site — reducing where it shows up.
Three tiers:

1. **Per-page `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noai,
   noimageai">`** on every page — a per-page layer that works regardless of host, kept as defense
   in depth alongside the now-authoritative root `robots.txt`.
2. **`robots.txt`** (Disallow all + a named blocklist of AI crawlers: GPTBot, Google-Extended,
   ClaudeBot, PerplexityBot, CCBot, Bytespider, etc.). **Now effective** — the site is served at
   its custom-domain root, so this is fetched as `getharrier.com/robots.txt`.
3. **Cloudflare in front of the custom domain** (same upgrade as the header gap above) — its "Block
   AI Scrapers/Crawlers" + bot-fight can actually *challenge/block* non-compliant bots, which
   robots.txt (advisory only) cannot.

**Indexing:** `index.html` is open to search engines. `terms.html`, `privacy.html` and
`report.html` stay `noindex` — they carry the contact address and have no search value — and
`robots.txt` disallows them a second time. The named AI-training crawlers stay blocked
everywhere, and every page keeps `noai, noimageai`.

## Regenerating the OG image / favicon

Both are static PNGs. They were rendered headlessly from small standalone HTML files (dark aurora
+ product name + aggregate stats for the card; the flight-path mark for the icon). To change them,
edit those source HTML files and re-screenshot at 1200×630 / 64×64.

## Stats

The numbers on the page are **real, all-time, aggregate figures for Harrier's first user**, and are
**rounded down** so they never overstate. No personal or employer data appears anywhere on the site.

## Verifying the site

Two gates, and they are not interchangeable.

```sh
export PLAYWRIGHT_RESOLVE_FROM=/path/to/a/package.json   # any install that has playwright
node verify/run.mjs            # LOCAL  — serves the repo from disk; run before you push
node verify/run.mjs --live     # LIVE   — checks getharrier.com as a visitor receives it
```

The local gate checks what we publish. The live gate checks what Cloudflare hands over, which is a
different thing: it sits in front of the site and rewrites the HTML at the edge. On 2026-08-19 that
difference cost every contact link on every page — Email Obfuscation rewrote each `mailto:` into a
`/cdn-cgi/l/email-protection` stub whose decoder our own CSP blocks, so the homepage's main call to
action silently went nowhere while nothing in this repo had changed.

Both run automatically (`.github/workflows/verify.yml`): on every push, and the live gate again daily —
because the thing that breaks this site is a setting changing in a dashboard, not a commit.

`sh tools/check-edge-injection.sh` answers "is Cloudflare injecting anything right now" on its own. Note
that a plain `curl` will tell you it is not: the injection only happens when the request looks like a
browser, which is why that script sends a browser User-Agent.
