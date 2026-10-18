#!/bin/bash
# Quotes the convention bullets ("- " lines) that match ANY keyword (case-insensitive, fixed
# strings), verbatim, with each bullet's indented continuation lines, so a brief carries only the
# rules a task needs. Every output line is prefixed with its source file name.
# Usage: conv.sh <conventions-dir-or-file> <keyword> [keyword ...]
# Exit: 0 ok, 2 usage or missing input.
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
BEGIN { n = split(kw, parts, d); for (i = 1; i <= n; i++) if (parts[i] != "") kws[++m] = tolower(parts[i]) }
FNR == 1 { cap = 0 }
/^- / {
  low = tolower($0); hit = 0
  for (i = 1; i <= m; i++) if (index(low, kws[i]) > 0) { hit = 1; break }
  if (hit) { cap = 1; print FILENAME ": " $0 } else cap = 0
  next
}
cap && /^[ \t]/ { print FILENAME ": " $0; next }
cap { cap = 0 }
' "${files[@]}"
echo "</conventions>"
