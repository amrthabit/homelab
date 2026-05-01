"""Paths and constants for the homelab backend."""
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.resolve()
WEBUI_DIR = BACKEND_DIR.parent
REPO_ROOT = WEBUI_DIR.parent.parent

DIST_DIR = WEBUI_DIR / "frontend" / "dist"
NFTABLES_TEMPLATE = WEBUI_DIR / "templates" / "nftables.conf.j2"

STATE_FILE = Path("/var/lib/homelab/state.json")
UPTIME_DB = Path("/var/lib/homelab/uptime.db")
NFTABLES_CONF = Path("/etc/nftables.conf")
LEASES_FILE = Path("/var/lib/misc/dnsmasq.leases")

SPARK_HOURS = 48
HISTORY_DAYS = 30
SNAPSHOT_INTERVAL_SEC = 5  # how often the SSE stream refreshes
import os

GIGAHUB_HOST = "192.168.2.1"
GIGAHUB_USER = os.environ.get("GIGAHUB_ADMIN_USER", "guest")
GIGAHUB_PASS = os.environ.get("GIGAHUB_ADMIN_PASS", "")
GIGAHUB_REFRESH_SEC = 30  # how often to poll Gigahub (slower than snapshot tick)

DEFAULT_STATE = {
    "vlan10_to_vlan30": True,
    "vlan20_wan": False,
    "iot_wan_macs": [],
    "trusted_wan_blocked_macs": [],
}

STATIC_DEVICES = [
    {"mac": "host:192.168.2.1", "ip": "192.168.2.1", "hostname": "Gigahub"},
    {"mac": "host:192.168.2.10", "ip": "192.168.2.10", "hostname": "Pi (self)"},
    {"mac": "host:192.168.2.153", "ip": "192.168.2.153", "hostname": "TL-SG108E"},
]
