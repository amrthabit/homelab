#!/bin/bash
# Snapshots everything recoverable on the Pi side into pi/backups/<timestamp>/.
# Run on demand or via cron. Output is committable (no secrets).
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TS=$(date +%Y-%m-%d)
DEST="$REPO_ROOT/pi/backups/$TS"
LATEST="$REPO_ROOT/pi/backups/latest"
mkdir -p "$DEST"

# 1. Pi state files (small, recoverable, no secrets)
[ -f /var/lib/homelab/state.json ] && cp /var/lib/homelab/state.json "$DEST/state.json"
[ -f /var/lib/homelab/uptime.db ] && {
    # Use sqlite .backup so we get a consistent snapshot even while writes happen
    /opt/homelab/pi/webui/venv/bin/python -c "
import sqlite3, pathlib
src = sqlite3.connect('/var/lib/homelab/uptime.db')
dst = sqlite3.connect('$DEST/uptime.db')
src.backup(dst)
src.close(); dst.close()
"
    gzip -f "$DEST/uptime.db"
}

# 2. Live nftables ruleset (rendered from state — useful for diff/audit)
nft list ruleset > "$DEST/nftables-current.nft" 2>/dev/null || true

# 3. Live network interfaces dump
ip -br addr > "$DEST/ip-addr.txt" 2>/dev/null || true
ip route > "$DEST/ip-route.txt" 2>/dev/null || true

# 4. dnsmasq leases (so we know what was online when this snapshot was taken)
[ -f /var/lib/misc/dnsmasq.leases ] && cp /var/lib/misc/dnsmasq.leases "$DEST/dnsmasq.leases"

# 5. Gigahub config dump (read-only, via sagemcom_api as admin)
/opt/homelab/pi/webui/venv/bin/python <<'PY' > "$DEST/gigahub.json" 2>/dev/null || true
import asyncio, json, os
from sagemcom_api.client import SagemcomClient
from sagemcom_api.enums import EncryptionMethod

async def main():
    user = os.environ.get("GIGAHUB_ADMIN_USER", "guest")
    pw = os.environ.get("GIGAHUB_ADMIN_PASS", "")
    out = {}
    async with SagemcomClient("192.168.2.1", user, pw, EncryptionMethod.SHA512) as c:
        await c.login()
        paths = [
            "Device/DeviceInfo",
            "Device/UserInterface",
            "Device/Time",
            "Device/Firewall",
            "Device/NAT/PortMappings",
            "Device/Routing/Routers",
            "Device/DNS",
            "Device/UPnP",
            "Device/WiFi/Radios",
            "Device/WiFi/SSIDs",
            "Device/WiFi/AccessPoints",
            "Device/Hosts/Hosts",
            "Device/Ethernet/Interfaces",
            "Device/IP/Interfaces",
            "Device/PPP/Interfaces",
        ]
        for p in paths:
            try:
                out[p] = await c.get_value_by_xpath(p)
            except Exception as e:
                out[p] = {"error": f"{type(e).__name__}: {e}"}
    print(json.dumps(out, default=str, indent=2))

asyncio.run(main())
PY

# 6. Refresh "latest" pointer
rm -rf "$LATEST"
cp -r "$DEST" "$LATEST"

echo "[backup] done: $DEST"
ls -lah "$DEST"
