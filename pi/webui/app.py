#!/usr/bin/env python3
"""Homelab control plane — Flask UI on the Pi bridge box."""
import json
import subprocess
from pathlib import Path

from flask import Flask, render_template, request, jsonify, redirect, url_for
from jinja2 import Environment, FileSystemLoader

APP_DIR = Path(__file__).parent.resolve()
STATE_FILE = Path("/var/lib/homelab/state.json")
NFTABLES_CONF = Path("/etc/nftables.conf")
NFTABLES_TEMPLATE = APP_DIR / "templates" / "nftables.conf.j2"

DEFAULT_STATE = {
    "vlan10_to_vlan30": True,
    "vlan20_wan": False,
}

app = Flask(__name__)


def load_state() -> dict:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not STATE_FILE.exists():
        save_state(DEFAULT_STATE)
        return dict(DEFAULT_STATE)
    return json.loads(STATE_FILE.read_text())


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def render_nftables(state: dict) -> str:
    env = Environment(loader=FileSystemLoader(NFTABLES_TEMPLATE.parent), trim_blocks=True, lstrip_blocks=True)
    return env.get_template(NFTABLES_TEMPLATE.name).render(state=state)


def apply_nftables(state: dict) -> tuple[bool, str]:
    rendered = render_nftables(state)
    NFTABLES_CONF.write_text(rendered)
    result = subprocess.run(["nft", "-f", str(NFTABLES_CONF)], capture_output=True, text=True)
    if result.returncode != 0:
        return False, result.stderr
    return True, "applied"


def sh(cmd: list[str]) -> str:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception as e:
        return f"err: {e}"


def get_dhcp_leases() -> list[dict]:
    leases_path = Path("/var/lib/misc/dnsmasq.leases")
    if not leases_path.exists():
        return []
    leases = []
    for line in leases_path.read_text().splitlines():
        parts = line.split()
        if len(parts) >= 4:
            leases.append({"mac": parts[1], "ip": parts[2], "hostname": parts[3]})
    return leases


def get_interfaces() -> str:
    return sh(["ip", "-br", "addr"])


def get_routes() -> str:
    return sh(["ip", "route"])


def get_firewall() -> str:
    return sh(["nft", "list", "ruleset"])


def get_stats() -> dict:
    uptime = sh(["uptime", "-p"])
    load = Path("/proc/loadavg").read_text().split()[:3]
    meminfo = Path("/proc/meminfo").read_text().splitlines()
    mem_total = int(meminfo[0].split()[1])
    mem_avail = int(meminfo[2].split()[1])
    mem_used_pct = round((1 - mem_avail / mem_total) * 100, 1)
    temp = sh(["vcgencmd", "measure_temp"]).replace("temp=", "")
    return {
        "uptime": uptime,
        "load": " ".join(load),
        "mem_used_pct": mem_used_pct,
        "mem_total_gb": round(mem_total / 1024 / 1024, 1),
        "temp": temp,
    }


@app.route("/")
def index():
    state = load_state()
    return render_template(
        "index.html",
        state=state,
        interfaces=get_interfaces(),
        routes=get_routes(),
        firewall=get_firewall(),
        leases=get_dhcp_leases(),
        stats=get_stats(),
    )


@app.route("/toggle/<key>", methods=["POST"])
def toggle(key):
    state = load_state()
    if key not in state:
        return jsonify({"error": "unknown key"}), 400
    state[key] = not state[key]
    save_state(state)
    ok, msg = apply_nftables(state)
    if not ok:
        return jsonify({"error": msg}), 500
    return redirect(url_for("index"))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=80, debug=False)
