#!/bin/sh
# The public-site PII gate: refuse to publish anything that leaks personal data, a private repo's name,
# or a local filesystem path. Public git history is permanent, so this runs before every push.
#
# WHY THIS IS A SCRIPT AND NOT A GREP IN THE WORKFLOW: the first version lived inline in verify.yml and
# failed immediately — on itself. A file that DEFINES the forbidden patterns necessarily contains them,
# so the scan matched its own pattern list. Putting the list in one file that excludes itself is the fix,
# and it also means CI and a human run the byte-identical check instead of two drifting copies.
#
#   sh tools/pii-gate.sh          # exits 1 and prints every hit
set -eu
SELF="tools/pii-gate.sh"

# The operator's name in terms.html / privacy.html is DELIBERATELY not on this list: it is the named
# contracting party in a published contract and cannot be a GitHub handle. `tyler.russell248@gmail.com`
# is likewise approved — it is the published support address.
PATTERNS='315.?727.?8764|Diamond Lake|55419|sk_(test|live)_|whsec_|BEGIN.*PRIVATE KEY|Minneapolis|Sonali|/Users/|job-applier-agent|pipeline\.db'

HITS=$(grep -rInE "$PATTERNS" . \
  --exclude-dir=.git --exclude-dir=.preview --exclude-dir=node_modules \
  --exclude="$(basename "$SELF")" || true)

if [ -n "$HITS" ]; then
  echo "PII / private-repo reference found — these must not be published:"
  echo "$HITS"
  exit 1
fi
echo "pii-gate: clean"
