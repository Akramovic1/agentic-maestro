#!/bin/bash
# Quotes the convention bullets ("- " lines) that match ANY keyword (case-insensitive, fixed
# strings), verbatim, so a brief carries only the rules a task needs. Each quoted bullet keeps the
# heading of the section it came from and all of its indented continuation lines; a keyword that
# matches only a continuation line still returns the whole bullet. Every output line is prefixed
# with its source file name.
# Usage: conv.sh <conventions-dir-or-file> <keyword> [keyword ...]
# Exit: 0 ok; 2 usage or missing input; otherwise the (awk) quoting failure's exit code.
if [ "$#" -lt 2 ]; then
  echo "conv.sh: usage: conv.sh <conventions-dir-or-file> <keyword> [keyword ...]" >&2
  exit 2
fi
S=$1; shift
if [ ! -e "$S" ]; then
  echo "conv.sh: no such file or directory: $S" >&2
  exit 2
fi

files=()
if [ -d "$S" ]; then
  for f in "$S"/*.md; do
    [ -f "$f" ] && files+=("$f")
  done
else
  files=("$S")
fi
if [ "${#files[@]}" -eq 0 ]; then
  echo "conv.sh: no *.md files in $S" >&2
  exit 2
fi

DELIM=$(printf '\037')
KW=""
for k in "$@"; do KW="${KW}${DELIM}${k}"; done

echo "<conventions>"
echo "Binding project conventions for this task, quoted verbatim (do not open the conventions files, the instruction file, the spec or the decision records):"
awk -v kw="$KW" -v d="$DELIM" '
function hits(s,   i, low) {
  low = tolower(s)
  for (i = 1; i <= m; i++) if (index(low, kws[i]) > 0) return 1
  return 0
}
function flush(   i) {
  if (!inblk) return
  if (hit) {
    if (blkhead != "") print curfile ": " blkhead
    for (i = 1; i <= k; i++) print curfile ": " blk[i]
  }
  inblk = 0; k = 0; hit = 0
}
BEGIN {
  n = split(kw, parts, d)
  for (i = 1; i <= n; i++) if (parts[i] != "") kws[++m] = tolower(parts[i])
  heading = ""
}
FNR == 1 { flush(); heading = ""; curfile = FILENAME }
/^- / { flush(); inblk = 1; k = 1; blk[1] = $0; blkhead = heading; hit = hits($0); next }
inblk && /^[ \t]/ { blk[++k] = $0; if (hits($0)) hit = 1; next }
{ flush() }
/^#/ { heading = $0 }
END { flush() }
' "${files[@]}"
st=$?
if [ "$st" -ne 0 ]; then
  echo "conv.sh: quoting failed (awk exit $st)" >&2
  exit "$st"
fi
echo "</conventions>"
