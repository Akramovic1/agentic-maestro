#!/bin/bash
# Prints a code excerpt for a brief: the first line matching a regex and the next N lines.
# Usage: excerpt.sh <file> <regex> [lines=40]
F=$1; P=$2; N=${3:-40}
n=$(grep -nE "$P" "$F" | head -1 | cut -d: -f1)
[ -z "$n" ] && { echo "(no match for $P in $F)"; exit 0; }
echo "--- $F:$n ---"; sed -n "${n},$((n+N-1))p" "$F"
