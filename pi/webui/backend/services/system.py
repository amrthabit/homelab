"""System stats — uptime, load, memory, temperature."""
from pathlib import Path
from .sh import sh
from ..models import Stats


def stats() -> Stats:
    raw = sh(["uptime", "-p"])
    # `uptime -p` returns e.g. "up 1 day, 3 hours, 25 minutes" — keep largest unit only.
    if raw.startswith("up "):
        first = raw[3:].split(",")[0].strip()
        uptime = f"up {first}" if first else raw
    else:
        uptime = raw
    load = Path("/proc/loadavg").read_text().split()[:3]
    meminfo = Path("/proc/meminfo").read_text().splitlines()
    mem_total = int(meminfo[0].split()[1])
    mem_avail = int(meminfo[2].split()[1])
    mem_used_pct = round((1 - mem_avail / mem_total) * 100, 1)
    temp = sh(["vcgencmd", "measure_temp"]).replace("temp=", "")
    return Stats(
        uptime=uptime,
        load=" ".join(load),
        mem_used_pct=mem_used_pct,
        mem_total_gb=round(mem_total / 1024 / 1024, 1),
        temp=temp,
    )


def interfaces() -> str:
    return sh(["ip", "-br", "addr"])


def routes() -> str:
    return sh(["ip", "route"])


def firewall() -> str:
    return sh(["nft", "list", "ruleset"])
