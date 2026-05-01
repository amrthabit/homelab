#!/bin/bash
# Pull latest, build frontend, restart service. Run on the Pi from /opt/homelab/pi/webui/.
set -e

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEBUI="$REPO_ROOT/pi/webui"

echo "[deploy] pulling repo..."
git -C "$REPO_ROOT" pull --ff-only

echo "[deploy] backend deps..."
[ -d "$WEBUI/venv" ] || python3 -m venv "$WEBUI/venv"
"$WEBUI/venv/bin/pip" install --quiet flask jinja2

echo "[deploy] frontend build..."
cd "$WEBUI/frontend"
[ -d node_modules ] || npm install --silent
npm run build

echo "[deploy] dnsmasq + nftables config..."
cp "$REPO_ROOT/pi/dnsmasq.conf" /etc/dnsmasq.d/homelab.conf
"$WEBUI/venv/bin/python" -c "
from pathlib import Path
import json
from jinja2 import Environment, FileSystemLoader
state = json.loads(Path('/var/lib/homelab/state.json').read_text() if Path('/var/lib/homelab/state.json').exists() else '{\"vlan10_to_vlan30\": true, \"vlan20_wan\": false, \"iot_wan_macs\": [], \"trusted_wan_blocked_macs\": []}')
env = Environment(loader=FileSystemLoader('$WEBUI/templates'), trim_blocks=True, lstrip_blocks=True)
Path('/etc/nftables.conf').write_text(env.get_template('nftables.conf.j2').render(state=state))
"
nft -f /etc/nftables.conf
systemctl restart dnsmasq

echo "[deploy] systemd units..."
sed "s|__WEBUI__|$WEBUI|g" "$WEBUI/homelab-ui.service.template" > /etc/systemd/system/homelab-ui.service
sed "s|__WEBUI__|$WEBUI|g" "$WEBUI/homelab-poll.service.template" > /etc/systemd/system/homelab-poll.service
cp "$WEBUI/homelab-poll.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now homelab-poll.timer
systemctl restart homelab-ui

echo "[deploy] done. http://$(hostname -I | awk '{print $1}')"
