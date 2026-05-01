#!/bin/bash
# Fast deploy. Skips work that hasn't changed. Times every critical section.
set -e
START=$(date +%s)

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEBUI="$REPO_ROOT/pi/webui"
STAMP_DIR="$WEBUI/.deploy-stamps"
mkdir -p "$STAMP_DIR"

# step <label> <cmd...>  — runs cmd, prints "[deploy] label  Ns"
step() {
    local label=$1
    shift
    local s=$(date +%s)
    "$@"
    local d=$(($(date +%s) - s))
    printf "[deploy] %-22s %2ds\n" "$label" "$d"
}

changed() {
    local file="$1"
    local stamp="$STAMP_DIR/$(basename "$file")"
    [ ! -f "$stamp" ] || ! cmp -s "$file" "$stamp"
}
mark() { cp "$1" "$STAMP_DIR/$(basename "$1")"; }

step "git pull" git -C "$REPO_ROOT" pull --ff-only -q

[ -d "$WEBUI/venv" ] || python3 -m venv "$WEBUI/venv"
if changed "$WEBUI/backend/requirements.txt"; then
    step "pip install" "$WEBUI/venv/bin/pip" install -q -r "$WEBUI/backend/requirements.txt"
    mark "$WEBUI/backend/requirements.txt"
fi

cd "$WEBUI/frontend"
if [ ! -d node_modules ] || changed package.json || ([ -f package-lock.json ] && changed package-lock.json); then
    step "npm install" npm install --silent
    mark package.json
    [ -f package-lock.json ] && mark package-lock.json
fi

step "vite build" npx vite build --logLevel warn

step "dnsmasq config" cp "$REPO_ROOT/pi/dnsmasq.conf" /etc/dnsmasq.d/homelab.conf
step "nftables apply" "$WEBUI/venv/bin/python" -c "
import sys
sys.path.insert(0, '$WEBUI')
from backend.services import state, nftables
nftables.apply(state.load())
"
step "dnsmasq reload" systemctl reload-or-restart dnsmasq

if changed "$WEBUI/homelab-ui.service.template"; then
    step "ui service unit" bash -c "sed -e 's|__WEBUI__|$WEBUI|g' -e 's|__REPO__|$REPO_ROOT|g' '$WEBUI/homelab-ui.service.template' > /etc/systemd/system/homelab-ui.service && systemctl daemon-reload"
    mark "$WEBUI/homelab-ui.service.template"
fi
if changed "$WEBUI/homelab-poll.service.template"; then
    step "poll service unit" bash -c "sed -e 's|__WEBUI__|$WEBUI|g' -e 's|__REPO__|$REPO_ROOT|g' '$WEBUI/homelab-poll.service.template' > /etc/systemd/system/homelab-poll.service && systemctl daemon-reload"
    mark "$WEBUI/homelab-poll.service.template"
fi
if changed "$WEBUI/homelab-poll.timer"; then
    step "poll timer" bash -c "cp '$WEBUI/homelab-poll.timer' /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now homelab-poll.timer >/dev/null"
    mark "$WEBUI/homelab-poll.timer"
fi

step "ui restart" systemctl restart homelab-ui

printf "[deploy] %-22s %2ds — http://%s\n" "TOTAL" "$(($(date +%s) - START))" "$(hostname -I | awk '{print $1}')"
