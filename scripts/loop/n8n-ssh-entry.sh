#!/usr/bin/env bash
# Forced command for the n8n SSH key (capz-loop). In ~/.ssh/authorized_keys:
#
#   command="/home/wadjakorn/development/capz-loop/scripts/loop/n8n-ssh-entry.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA… n8n-capz-loop
#
# The n8n SSH node's "command" arrives as $SSH_ORIGINAL_COMMAND and must be one
# of the stage invocations below — anything else is refused, so the key can
# only start loop stages, never run arbitrary shell.
set -euo pipefail
cmd="${SSH_ORIGINAL_COMMAND:-}"
# n8n's SSH node (node-ssh) always sends its Working Directory as a prefix:
# "cd / ; build". Strip exactly one such prefix; the rest is still vetted.
if [[ "$cmd" =~ ^cd\ [^\;\&\|\`\$]+\ \;\ (.*)$ ]]; then
  cmd="${BASH_REMATCH[1]}"
fi
case "$cmd" in
  intake|build|verify|release|"release --propose")
    # shellcheck disable=SC2086 # word-split the vetted args on purpose
    exec "$(dirname "$0")/run-stage.sh" $cmd ;;
  *)
    msg="capz-loop: refused command: ${SSH_ORIGINAL_COMMAND:-<none>}"
    echo "$msg" >&2
    mkdir -p "$HOME/.local/state/capz-loop"
    printf '%s %s\n' "$(date -Is)" "$msg" >>"$HOME/.local/state/capz-loop/runner.log"
    exit 126 ;;
esac
