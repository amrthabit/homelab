#!/usr/bin/env python3
"""Homelab control plane — Flask JSON API + SPA static."""
import json
import sqlite3
import subprocess
import time
from pathlib import Path

from flask import Flask, jsonify, send_from_directory, abort
from jinja2 import Environment, FileSystemLoader

APP_DIR = Path(__file__).parent.resolve()
DIST_DIR = APP_DIR / "frontend" / "dist"
STATE_FILE = Path("/var/lib/homelab/state.json")
UPTIME_DB = Path("/var/lib/homelab/uptime.db")
NFTABLES_CONF = Path("/etc/nftables.conf")
NFTABLES_TEMPLATE = APP_DIR / "templates" / "nftables.conf.j2"

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

SPARK_HOURS = 48
HISTORY_DAYS = 30

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


def get_vlans() -> list[dict]:
    leases_path = Path("/var/lib/misc/dnsmasq.leases")
    iot, trusted = [], []
    if leases_path.exists():
        for line in leases_path.read_text().splitlines():
            parts = line.split()
            if len(parts) < 4:
                continue
            ip = parts[2]
            entry = {"mac": parts[1], "ip": ip, "hostname": parts[3] if parts[3] != "*" else "—"}
            if ip.startswith("192.168.20."):
                iot.append(entry)
            elif ip.startswith("192.168.30."):
                trusted.append(entry)
    return [
        {"name": "VLAN 20 (IoT)", "kind": "iot", "devices": iot},
        {"name": "VLAN 30 (Trusted)", "kind": "trusted", "devices": trusted},
        {"name": "VLAN 10 + Mgmt", "kind": "mgmt", "devices": list(STATIC_DEVICES)},
    ]


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


def db_query(query: str, args: tuple = ()) -> list[tuple]:
    if not UPTIME_DB.exists():
        return []
    con = sqlite3.connect(UPTIME_DB)
    rows = con.execute(query, args).fetchall()
    con.close()
    return rows


def sparkline(mac: str) -> dict:
    now = int(time.time())
    start = now - SPARK_HOURS * 3600
    rows = db_query("SELECT ts, up FROM samples WHERE mac = ? AND ts >= ? ORDER BY ts", (mac, start))
    bcount = [0] * SPARK_HOURS
    bup = [0] * SPARK_HOURS
    for ts, up in rows:
        idx = int((ts - start) / 3600)
        if 0 <= idx < SPARK_HOURS:
            bcount[idx] += 1
            bup[idx] += up
    pcts = [None if bcount[i] == 0 else round(100 * bup[i] / bcount[i]) for i in range(SPARK_HOURS)]
    seen = [p for p in pcts if p is not None]
    avg = round(sum(seen) / len(seen), 1) if seen else None
    return {"buckets": pcts, "avg": avg, "samples": len(rows)}


def history(mac: str) -> list[dict]:
    now = int(time.time())
    start = now - HISTORY_DAYS * 86400
    rows = db_query("SELECT ts, up FROM samples WHERE mac = ? AND ts >= ? ORDER BY ts", (mac, start))
    buckets = {}
    for ts, up in rows:
        h = ts // 3600
        b = buckets.setdefault(h, {"up": 0, "total": 0})
        b["up"] += up
        b["total"] += 1
    cur_h = now // 3600
    out = []
    for h in range(cur_h - HISTORY_DAYS * 24 + 1, cur_h + 1):
        b = buckets.get(h)
        pct = round(100 * b["up"] / b["total"]) if b else None
        out.append({"h": h, "pct": pct, "ts": h * 3600})
    return out


# ---------- API routes ----------

@app.route("/api/snapshot")
def api_snapshot():
    vlans = get_vlans()
    for vlan in vlans:
        for d in vlan["devices"]:
            d["spark"] = sparkline(d["mac"])
    return jsonify({
        "state": load_state(),
        "stats": get_stats(),
        "vlans": vlans,
        "interfaces": sh(["ip", "-br", "addr"]),
        "routes": sh(["ip", "route"]),
        "firewall": sh(["nft", "list", "ruleset"]),
    })


@app.route("/api/history/<path:mac>")
def api_history(mac):
    return jsonify(history(mac))


@app.route("/api/toggle/<key>", methods=["POST"])
def api_toggle(key):
    state = load_state()
    if key not in state or not isinstance(state[key], bool):
        return jsonify({"error": "unknown bool key"}), 400
    state[key] = not state[key]
    save_state(state)
    ok, msg = apply_nftables(state)
    return jsonify({"ok": ok, "msg": msg, "state": state}), (200 if ok else 500)


@app.route("/api/iot_wan/<mac>", methods=["POST"])
def api_iot_wan(mac):
    state = load_state()
    macs = set(state.get("iot_wan_macs", []))
    mac = mac.lower()
    macs.discard(mac) if mac in macs else macs.add(mac)
    state["iot_wan_macs"] = sorted(macs)
    save_state(state)
    ok, msg = apply_nftables(state)
    return jsonify({"ok": ok, "msg": msg, "state": state}), (200 if ok else 500)


@app.route("/api/trusted_wan/<mac>", methods=["POST"])
def api_trusted_wan(mac):
    state = load_state()
    blocked = set(state.get("trusted_wan_blocked_macs", []))
    mac = mac.lower()
    blocked.discard(mac) if mac in blocked else blocked.add(mac)
    state["trusted_wan_blocked_macs"] = sorted(blocked)
    save_state(state)
    ok, msg = apply_nftables(state)
    return jsonify({"ok": ok, "msg": msg, "state": state}), (200 if ok else 500)


# ---------- SPA static ----------

@app.route("/")
def root():
    index = DIST_DIR / "index.html"
    if not index.exists():
        return "<pre>Frontend not built. Run pi/webui/frontend/ build (see deploy.sh).</pre>", 503
    return send_from_directory(DIST_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    target = DIST_DIR / path
    if target.is_file():
        return send_from_directory(DIST_DIR, path)
    # SPA fallback
    return send_from_directory(DIST_DIR, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=80, debug=False)
