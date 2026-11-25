#!/bin/bash
# Reports which analyzers an audit or a security check can run on this machine, so a report says
# "not covered" for a missing tool instead of implying a clean result. It runs nothing but each
# tool's own version command, installs nothing and reads no project file.
#
# Usage: scripts/toolcheck.sh contracts|api|all [--require <tool>[,<tool>...]]
#   contracts  forge, anvil, slither, aderyn, semgrep, echidna, medusa, halmos
#   api        semgrep, codeql, osv-scanner, gitleaks, trivy
#   all        both lists
# Output: one tab-separated line per tool: <tool> <present|missing> <purpose> <version or ->
# Exit: 0 printed; 1 a tool named in --require is missing; 2 usage.
set -u
usage() { echo "usage: toolcheck.sh contracts|api|all [--require <tool>[,<tool>...]]" >&2; exit 2; }
[ "$#" -ge 1 ] || usage
profile=$1; shift
require=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --require) [ "$#" -ge 2 ] || usage; require=$2; shift 2 ;;
    *) usage ;;
  esac
done

CONTRACTS="forge|build, tests, coverage, invariant and fuzz tests
anvil|local and forked chain for reproductions
slither|static analysis of Solidity
aderyn|static analysis of Solidity
semgrep|pattern and taint rules
echidna|property-based fuzzing
medusa|property-based fuzzing
halmos|symbolic testing"
API="semgrep|pattern and taint rules
codeql|data-flow queries
osv-scanner|known vulnerabilities in dependencies
gitleaks|secrets in the repository and its history
trivy|dependency, container and configuration scan"

case "$profile" in
  contracts) list=$CONTRACTS ;;
  api) list=$API ;;
  all) list=$(printf '%s\n%s\n' "$CONTRACTS" "$API" | awk -F'|' '!seen[$1]++') ;;
  *) usage ;;
esac

missing=""
while IFS='|' read -r tool purpose; do
  [ -n "$tool" ] || continue
  if command -v "$tool" >/dev/null 2>&1; then
    version=$("$tool" --version 2>/dev/null | head -n 1 | tr '\t' ' ')
    printf '%s\tpresent\t%s\t%s\n' "$tool" "$purpose" "${version:--}"
  else
    printf '%s\tmissing\t%s\t-\n' "$tool" "$purpose"
    missing="$missing $tool"
  fi
done <<EOF
$list
EOF

rc=0
if [ -n "$require" ]; then
  for want in $(printf '%s' "$require" | tr ',' ' '); do
    case " $missing " in *" $want "*) echo "toolcheck.sh: required tool missing: $want" >&2; rc=1 ;; esac
    printf '%s\n' "$list" | grep -q "^$want|" || { echo "toolcheck.sh: '$want' is not in the $profile list" >&2; rc=1; }
  done
fi
exit "$rc"
