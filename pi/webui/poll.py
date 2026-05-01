#!/usr/bin/env python3
"""Poll known devices every minute, record up/down to sqlite."""
import sqlite3
import subprocess
import time
from pathlib import Path

DB = Path("/var/lib/homelab/uptime.db")
LEASES = Path("/var/lib/misc/dnsmasq.leases")
RETAIN_DAYS = 30

# Devices not in dnsmasq leases (static / external)
STATIC_DEVICES = [
    {"mac": "host:192.168.2.1", "ip": "192.168.2.1", "hostname": "Gigahub"},
    {"mac": "host:192.168.2.10", "ip": "192.168.2.10", "hostname": "Pi (self)"},
    {"mac": "host:192.168.2.153", "ip": "192.168.2.153", "hostname": "TL-SG108E"},
]


def init_db() -> sqlite3.Connection:
    DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB)
    con.execute(
        "CREATE TABLE IF NOT EXISTS samples ("
        "mac TEXT NOT NULL, ts INTEGER NOT NULL, up INTEGER NOT NULL, "
        "PRIMARY KEY (mac, ts))"
    )
    con.execute("CREATE INDEX IF NOT EXISTS idx_samples_mac_ts ON samples(mac, ts)")
    return con


def load_devices() -> list[dict]:
    devs = list(STATIC_DEVICES)
    if LEASES.exists():
        for line in LEASES.read_text().splitlines():
            parts = line.split()
            if len(parts) >= 4:
                devs.append({"mac": parts[1], "ip": parts[2], "hostname": parts[3]})
    return devs


def ping(ip: str) -> bool:
    return subprocess.run(
        ["ping", "-c", "1", "-W", "1", ip],
        capture_output=True,
        timeout=3,
    ).returncode == 0


def main():
    con = init_db()
    ts = int(time.time())
    devs = load_devices()
    for d in devs:
        up = ping(d["ip"])
        con.execute(
            "INSERT OR REPLACE INTO samples (mac, ts, up) VALUES (?, ?, ?)",
            (d["mac"], ts, int(up)),
        )
    # Prune samples older than RETAIN_DAYS
    cutoff = ts - RETAIN_DAYS * 86400
    con.execute("DELETE FROM samples WHERE ts < ?", (cutoff,))
    con.commit()
    con.close()


if __name__ == "__main__":
    main()
