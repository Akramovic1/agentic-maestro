#!/bin/bash
# Installs agentic-maestro for Claude Code, Codex and OpenCode by linking (or copying) this checkout
# into each agent's skills directory.
#
# Usage: ./install.sh [--claude] [--agents] [--opencode] [--agent-def] [--copy] [--uninstall]
#   --claude     ~/.claude/skills/agentic-maestro          (Claude Code; OpenCode reads it too)
#   --agents     ~/.agents/skills/agentic-maestro          (Codex; OpenCode and other Agent Skills hosts)
#   --opencode   ~/.config/opencode/skills/agentic-maestro (OpenCode only)
#   --agent-def  ~/.claude/agents/maestro-executor.md      (Claude Code sub-agent definition; never overwritten)
#   --copy       copy instead of symlink (a copy does not follow `git pull`)
#   --uninstall  remove what this script installed (only links/copies of this skill)
# No target flag means --claude --agents, which covers all three agents.
# Exit: 0 done; 1 a destination exists and is not this skill (left untouched); 2 usage.
set -u
SRC=$(cd "$(dirname "$0")" && pwd -P)
NAME=agentic-maestro
copy=0; uninstall=0; targets=()
for a in "$@"; do
  case "$a" in
    --claude) targets+=("$HOME/.claude/skills/$NAME") ;;
    --agents) targets+=("$HOME/.agents/skills/$NAME") ;;
    --opencode) targets+=("$HOME/.config/opencode/skills/$NAME") ;;
    --agent-def) targets+=("AGENTDEF") ;;
    --copy) copy=1 ;;
    --uninstall) uninstall=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "install.sh: unknown option '$a' (see --help)" >&2; exit 2 ;;
  esac
done
[ "${#targets[@]}" -eq 0 ] && targets=("$HOME/.claude/skills/$NAME" "$HOME/.agents/skills/$NAME")

is_ours() { # a link to this checkout, or a copy of this skill
  if [ -L "$1" ]; then [ "$(cd "$1" 2>/dev/null && pwd -P)" = "$SRC" ]; return; fi
  [ -f "$1/SKILL.md" ] && grep -q "^name: $NAME\$" "$1/SKILL.md"
}

rc=0
for t in "${targets[@]}"; do
  if [ "$t" = AGENTDEF ]; then
    def="$HOME/.claude/agents/maestro-executor.md"
    if [ "$uninstall" = 1 ]; then
      if [ -f "$def" ] && cmp -s "$def" "$SRC/templates/claude-agent-executor.md"; then rm "$def" && echo "removed $def"
      elif [ -e "$def" ]; then echo "kept $def (edited since install)"; fi
    elif [ -e "$def" ]; then echo "kept $def (already exists)"
    else mkdir -p "$(dirname "$def")" && cp "$SRC/templates/claude-agent-executor.md" "$def" && echo "installed $def"; fi
    continue
  fi
  if [ "$uninstall" = 1 ]; then
    if [ -L "$t" ] && is_ours "$t"; then rm "$t" && echo "removed $t"
    elif [ -d "$t" ] && is_ours "$t"; then rm -r "$t" && echo "removed $t"
    elif [ -e "$t" ]; then echo "install.sh: $t is not this skill; left untouched" >&2; rc=1; fi
    continue
  fi
  if [ -e "$t" ] || [ -L "$t" ]; then
    if [ -L "$t" ] && is_ours "$t"; then echo "ok        $t -> $SRC"; continue; fi
    echo "install.sh: $t already exists and is not a link to $SRC; left untouched (run --uninstall or remove it)" >&2
    rc=1; continue
  fi
  mkdir -p "$(dirname "$t")" || { rc=1; continue; }
  if [ "$copy" = 1 ]; then
    mkdir "$t" && (cd "$SRC" && tar --exclude .git --exclude .agent-logs --exclude .agent-briefs --exclude .agent-runs -cf - .) | (cd "$t" && tar -xf -) && echo "copied    $t"
  else
    ln -s "$SRC" "$t" && echo "linked    $t -> $SRC"
  fi || rc=1
done
exit "$rc"
