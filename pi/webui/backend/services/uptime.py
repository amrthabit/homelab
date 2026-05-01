"""Read uptime samples from sqlite for sparklines and history."""
import sqlite3
import time
from .. import config
from ..models import SparkData, HistoryPoint


def _query(query: str, args: tuple = ()) -> list[tuple]:
    if not config.UPTIME_DB.exists():
        return []
    con = sqlite3.connect(config.UPTIME_DB)
    rows = con.execute(query, args).fetchall()
    con.close()
    return rows


def sparkline(mac: str) -> SparkData:
    now = int(time.time())
    start = now - config.SPARK_HOURS * 3600
    rows = _query("SELECT ts, up FROM samples WHERE mac = ? AND ts >= ? ORDER BY ts", (mac, start))
    bcount = [0] * config.SPARK_HOURS
    bup = [0] * config.SPARK_HOURS
    for ts, up in rows:
        idx = int((ts - start) / 3600)
        if 0 <= idx < config.SPARK_HOURS:
            bcount[idx] += 1
            bup[idx] += up
    pcts: list[int | None] = [
        None if bcount[i] == 0 else round(100 * bup[i] / bcount[i]) for i in range(config.SPARK_HOURS)
    ]
    seen = [p for p in pcts if p is not None]
    avg = round(sum(seen) / len(seen), 1) if seen else None
    return SparkData(buckets=pcts, avg=avg, samples=len(rows))


def history(mac: str) -> list[HistoryPoint]:
    now = int(time.time())
    start = now - config.HISTORY_DAYS * 86400
    rows = _query("SELECT ts, up FROM samples WHERE mac = ? AND ts >= ? ORDER BY ts", (mac, start))
    buckets: dict[int, dict[str, int]] = {}
    for ts, up in rows:
        h = ts // 3600
        b = buckets.setdefault(h, {"up": 0, "total": 0})
        b["up"] += up
        b["total"] += 1
    cur_h = now // 3600
    out: list[HistoryPoint] = []
    for h in range(cur_h - config.HISTORY_DAYS * 24 + 1, cur_h + 1):
        b = buckets.get(h)
        pct = round(100 * b["up"] / b["total"]) if b else None
        out.append(HistoryPoint(h=h, pct=pct, ts=h * 3600))
    return out
