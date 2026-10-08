#!/usr/bin/env bash
# Forced command for the n8n SSH key (capz-loop). In ~/.ssh/authorized_keys:
#
#   command="/home/wadjakorn/development/capz-loop/scripts/loop/n8n-ssh-entry.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA… n8n-capz-loop
#
# The n8n SSH node's "command" arrives as $SSH_ORIGINAL_COMMAND and must be one
# of the stage invocations below — anything else is refused, so the key can
# only start loop stages, never run arbitrary shell.
set -euo pipefail
case "${SSH_ORIGINAL_COMMAND:-}" in
  intake|build|verify|release|"release --propose")
    # shellcheck disable=SC2086 # word-split the vetted args on purpose
    exec "$(dirname "$0")/run-stage.sh" $SSH_ORIGINAL_COMMAND ;;
  *)
    echo "capz-loop: refused command: ${SSH_ORIGINAL_COMMAND:-<none>}" >&2
    exit 126 ;;
esac
