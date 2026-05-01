#!/usr/bin/env python3
"""Periodic poller — runs every minute via systemd timer.

Captures three categories into /var/lib/homelab/uptime.db:

1. samples: per-device up/down (ICMP ping)
2. metrics: time series of every Gigahub + system counter we can read
   - wifi.tx/rx.<mac>      cumulative bytes per Wi-Fi client
   - wifi.signal.<mac>     RSSI in dBm
   - radio.tx/rx.<alias>   cumulative bytes per Wi-Fi radio (2.4/5/6 GHz)
   - phy.tx/rx.<alias>     cumulative bytes per Ethernet PHY (LAN ports + WAN/optical)
   - system.temp           Pi CPU temperature (°C)
   - system.load1          1-minute load average
   - system.mem_used_pct   memory utilisation
"""
import asyncio
import os
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

from sagemcom_api.client import SagemcomClient
from sagemcom_api.enums import EncryptionMethod

DB = Path("/var/lib/homelab/uptime.db")
LEASES = Path("/var/lib/misc/dnsmasq.leases")
RETAIN_DAYS = 30

GIGAHUB_HOST = "192.168.2.1"
GIGAHUB_USER = os.environ.get("GIGAHUB_ADMIN_USER", "guest")
GIGAHUB_PASS = os.environ.get("GIGAHUB_ADMIN_PASS", "")

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
    con.execute(
        "CREATE TABLE IF NOT EXISTS metrics ("
        "key TEXT NOT NULL, ts INTEGER NOT NULL, value REAL NOT NULL, "
        "PRIMARY KEY (key, ts))"
    )
    con.execute("CREATE INDEX IF NOT EXISTS idx_metrics_key_ts ON metrics(key, ts)")
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
        ["ping", "-c", "1", "-W", "1", ip], capture_output=True, timeout=3
    ).returncode == 0


def system_metrics(ts: int) -> list[tuple[str, int, float]]:
    rows: list[tuple[str, int, float]] = []
    try:
        load1 = float(Path("/proc/loadavg").read_text().split()[0])
        rows.append(("system.load1", ts, load1))
    except Exception:
        pass
    try:
        meminfo = Path("/proc/meminfo").read_text().splitlines()
        mem_total = int(meminfo[0].split()[1])
        mem_avail = int(meminfo[2].split()[1])
        rows.append(("system.mem_used_pct", ts, round((1 - mem_avail / mem_total) * 100, 1)))
    except Exception:
        pass
    try:
        out = subprocess.run(["vcgencmd", "measure_temp"], capture_output=True, text=True, timeout=2).stdout
        # "temp=49.9'C"
        temp_str = out.replace("temp=", "").replace("'C", "").strip()
        rows.append(("system.temp", ts, float(temp_str)))
    except Exception:
        pass
    return rows


async def gigahub_metrics(ts: int) -> list[tuple[str, int, float]]:
    rows: list[tuple[str, int, float]] = []
    async with SagemcomClient(GIGAHUB_HOST, GIGAHUB_USER, GIGAHUB_PASS, EncryptionMethod.SHA512) as c:
        await c.login()
        aps = await c.get_value_by_xpath("Device/WiFi/AccessPoints") or []
        radios = await c.get_value_by_xpath("Device/WiFi/Radios") or []
        eths = await c.get_value_by_xpath("Device/Ethernet/Interfaces") or []

        for ap in aps:
            for ad in (ap.get("associated_devices") or []):
                mac = (ad.get("mac_address") or "").lower()
                if not mac:
                    continue
                stats = ad.get("stats") or {}
                tx = int(stats.get("bytes_sent") or 0)
                rx = int(stats.get("bytes_received") or 0)
                rows.append((f"wifi.tx.{mac}", ts, tx))
                rows.append((f"wifi.rx.{mac}", ts, rx))
                sig = ad.get("signal_strength")
                if sig is not None and sig != 0:
                    try:
                        rows.append((f"wifi.signal.{mac}", ts, float(sig)))
                    except Exception:
                        pass

        for r in radios:
            alias = r.get("alias", "")
            stats = r.get("stats") or {}
            tx = int(stats.get("bytes_sent") or 0)
            rx = int(stats.get("bytes_received") or 0)
            if alias:
                rows.append((f"radio.tx.{alias}", ts, tx))
                rows.append((f"radio.rx.{alias}", ts, rx))

        for e in eths:
            alias = e.get("alias", "")
            stats = e.get("stats") or {}
            tx = int(stats.get("bytes_sent") or 0)
            rx = int(stats.get("bytes_received") or 0)
            if alias:
                rows.append((f"phy.tx.{alias}", ts, tx))
                rows.append((f"phy.rx.{alias}", ts, rx))

    return rows


def insert_samples(con: sqlite3.Connection, ts: int) -> None:
    for d in load_devices():
        up = ping(d["ip"])
        con.execute(
            "INSERT OR REPLACE INTO samples (mac, ts, up) VALUES (?, ?, ?)",
            (d["mac"], ts, int(up)),
        )


def insert_metrics(con: sqlite3.Connection, rows: list[tuple[str, int, float]]) -> None:
    con.executemany(
        "INSERT OR REPLACE INTO metrics (key, ts, value) VALUES (?, ?, ?)",
        rows,
    )


def prune(con: sqlite3.Connection, ts: int) -> None:
    cutoff = ts - RETAIN_DAYS * 86400
    con.execute("DELETE FROM samples WHERE ts < ?", (cutoff,))
    con.execute("DELETE FROM metrics WHERE ts < ?", (cutoff,))


async def main_async() -> None:
    con = init_db()
    ts = int(time.time())

    insert_samples(con, ts)
    insert_metrics(con, system_metrics(ts))

    try:
        rows = await gigahub_metrics(ts)
        insert_metrics(con, rows)
    except Exception as e:
        print(f"[poll] gigahub err: {type(e).__name__}: {e}", file=sys.stderr)

    prune(con, ts)
    con.commit()
    con.close()


if __name__ == "__main__":
    asyncio.run(main_async())
