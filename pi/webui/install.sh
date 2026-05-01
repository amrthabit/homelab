#!/bin/bash
# Deploy homelab webui to /opt/homelab. Run from the repo's pi/webui directory.
set -e

DEST=/opt/homelab
mkdir -p "$DEST"

# Sync files
cp app.py "$DEST/"
cp -r templates "$DEST/"
cp -r static "$DEST/"

# Python venv
apt-get install -y python3-venv python3-pip
python3 -m venv "$DEST/venv"
"$DEST/venv/bin/pip" install --quiet flask jinja2

# Initial state file
mkdir -p /var/lib/homelab
[ -f /var/lib/homelab/state.json ] || echo '{"vlan10_to_vlan30": true, "vlan20_wan": false}' > /var/lib/homelab/state.json

# Generate initial nftables.conf from template
"$DEST/venv/bin/python" -c "
from pathlib import Path
import json
from jinja2 import Environment, FileSystemLoader
state = json.loads(Path('/var/lib/homelab/state.json').read_text())
env = Environment(loader=FileSystemLoader('$DEST/templates'), trim_blocks=True, lstrip_blocks=True)
Path('/etc/nftables.conf').write_text(env.get_template('nftables.conf.j2').render(state=state))
"
nft -f /etc/nftables.conf

# Systemd service
cp homelab-ui.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now homelab-ui

echo "Done. Visit http://192.168.2.10:8080"
