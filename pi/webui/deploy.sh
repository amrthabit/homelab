#!/bin/bash
# Pull latest, build frontend, restart service. Run on the Pi from anywhere.
set -e

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEBUI="$REPO_ROOT/pi/webui"

echo "[deploy] pulling repo..."
git -C "$REPO_ROOT" pull --ff-only

echo "[deploy] backend deps..."
[ -d "$WEBUI/venv" ] || python3 -m venv "$WEBUI/venv"
"$WEBUI/venv/bin/pip" install --quiet -r "$WEBUI/backend/requirements.txt"

echo "[deploy] frontend build..."
cd "$WEBUI/frontend"
[ -d node_modules ] || npm install --silent
npm run build

echo "[deploy] dnsmasq + nftables..."
cp "$REPO_ROOT/pi/dnsmasq.conf" /etc/dnsmasq.d/homelab.conf
"$WEBUI/venv/bin/python" -c "
import sys
sys.path.insert(0, '$WEBUI')
from backend.services import state, nftables
s = state.load()
ok, msg = nftables.apply(s)
print(f'nftables: {msg}')
"
systemctl restart dnsmasq

echo "[deploy] systemd units..."
sed "s|__WEBUI__|$WEBUI|g" "$WEBUI/homelab-ui.service.template" > /etc/systemd/system/homelab-ui.service
sed "s|__WEBUI__|$WEBUI|g" "$WEBUI/homelab-poll.service.template" > /etc/systemd/system/homelab-poll.service
cp "$WEBUI/homelab-poll.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now homelab-poll.timer
systemctl restart homelab-ui

echo "[deploy] done. http://$(hostname -I | awk '{print $1}')"
