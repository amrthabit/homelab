#!/bin/bash
# Fast deploy. Skips work that hasn't changed.
set -e
START=$(date +%s)

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEBUI="$REPO_ROOT/pi/webui"
STAMP_DIR="$WEBUI/.deploy-stamps"
mkdir -p "$STAMP_DIR"

changed() {
    local file="$1"
    local stamp="$STAMP_DIR/$(basename "$file")"
    [ ! -f "$stamp" ] || ! cmp -s "$file" "$stamp"
}
mark() { cp "$1" "$STAMP_DIR/$(basename "$1")"; }

# 1. git pull (cheap)
git -C "$REPO_ROOT" pull --ff-only -q

# 2. pip install only when requirements.txt changed
[ -d "$WEBUI/venv" ] || python3 -m venv "$WEBUI/venv"
if changed "$WEBUI/backend/requirements.txt"; then
    echo "[deploy] pip install (changed)"
    "$WEBUI/venv/bin/pip" install -q -r "$WEBUI/backend/requirements.txt"
    mark "$WEBUI/backend/requirements.txt"
fi

# 3. npm install only when package.json or lock changed
cd "$WEBUI/frontend"
if [ ! -d node_modules ] || changed package.json || ([ -f package-lock.json ] && changed package-lock.json); then
    echo "[deploy] npm install (changed)"
    npm install --silent
    mark package.json
    [ -f package-lock.json ] && mark package-lock.json
fi

# 4. Vite build (fast — no tsc)
echo "[deploy] vite build"
npx vite build --logLevel warn

# 5. dnsmasq + nftables (idempotent, fast)
cp "$REPO_ROOT/pi/dnsmasq.conf" /etc/dnsmasq.d/homelab.conf
"$WEBUI/venv/bin/python" -c "
import sys
sys.path.insert(0, '$WEBUI')
from backend.services import state, nftables
nftables.apply(state.load())
"
systemctl reload-or-restart dnsmasq

# 6. Systemd units (only update if templates changed)
if changed "$WEBUI/homelab-ui.service.template"; then
    sed -e "s|__WEBUI__|$WEBUI|g" -e "s|__REPO__|$REPO_ROOT|g" "$WEBUI/homelab-ui.service.template" > /etc/systemd/system/homelab-ui.service
    mark "$WEBUI/homelab-ui.service.template"
    systemctl daemon-reload
fi
if changed "$WEBUI/homelab-poll.service.template"; then
    sed -e "s|__WEBUI__|$WEBUI|g" -e "s|__REPO__|$REPO_ROOT|g" "$WEBUI/homelab-poll.service.template" > /etc/systemd/system/homelab-poll.service
    mark "$WEBUI/homelab-poll.service.template"
    systemctl daemon-reload
fi
if changed "$WEBUI/homelab-poll.timer"; then
    cp "$WEBUI/homelab-poll.timer" /etc/systemd/system/
    mark "$WEBUI/homelab-poll.timer"
    systemctl daemon-reload
    systemctl enable --now homelab-poll.timer >/dev/null
fi

# 7. Restart UI service (always, picks up new dist + code)
systemctl restart homelab-ui

echo "[deploy] done in $(($(date +%s) - START))s — http://$(hostname -I | awk '{print $1}')"
