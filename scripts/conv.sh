#!/bin/bash
# Quotes the convention bullets ("- " lines) that match ANY keyword (case-insensitive), verbatim, in a
# <conventions> block, so a brief carries only the rules a task needs.
# Usage: conv.sh <conventions-dir-or-file> <keyword> [keyword ...]
S=$1; shift; pat=$(IFS='|'; echo "$*")
echo "<conventions>"
echo "Binding project conventions for this task, quoted verbatim (do not open the conventions files, the instruction file, the spec or the decision records):"
if [ -d "$S" ]; then cat "$S"/*.md; else cat "$S"; fi | grep -h '^- ' | grep -iE "$pat" | awk '!seen[$0]++'
echo "</conventions>"
