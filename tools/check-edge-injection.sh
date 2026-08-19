#!/bin/sh
# Does Cloudflare inject anything into getharrier.com, and does it actually run?
#
# WHY A SCRIPT: the injection is USER-AGENT DEPENDENT. A plain `curl https://getharrier.com/` gets a page
# with no beacon in it, which looks like proof that nothing is injected — it is not. Cloudflare only
# rewrites the HTML when the request looks like a browser. This sends a browser User-Agent so the answer
# is the one a real visitor gets.
#
#   sh tools/check-edge-injection.sh
set -eu
URL="${1:-https://getharrier.com/}"
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

echo "checking $URL"
echo
BODY=$(curl -s --max-time 15 -H "User-Agent: $UA" -H 'Accept: text/html,application/xhtml+xml' "$URL")

printf 'proxied by Cloudflare : '
curl -sI --max-time 15 "$URL" | grep -qi '^server: cloudflare' && echo 'yes' || echo 'no'

printf 'Web Analytics beacon  : '
if printf '%s' "$BODY" | grep -q 'cloudflareinsights'; then
  TOKEN=$(printf '%s' "$BODY" | sed -n 's/.*"token":"\([a-f0-9]*\)".*/\1/p' | head -1)
  echo "INJECTED (site token ${TOKEN:-none})"
  echo '                        -> dash.cloudflare.com > your ACCOUNT (not the domain) > Analytics & Logs'
  echo '                           > Web Analytics. Match that token to the site, then remove it.'
else
  echo 'not injected'
fi

printf 'Email obfuscation     : '
if printf '%s' "$BODY" | grep -q 'email-decode.min.js'; then
  echo 'INJECTED'
  echo '                        -> dash.cloudflare.com > getharrier.com > Scrape Shield'
  echo '                           > Email Address Obfuscation: off'
else
  echo 'not injected'
fi

echo
echo 'Note: the page CSP blocks the beacon from LOADING, so no analytics data is collected today.'
echo 'Both injections still cost every visitor two console errors, and the beacon is one CSP edit'
echo 'away from being live. Removing them at the source is the fix; the CSP is the backstop.'
