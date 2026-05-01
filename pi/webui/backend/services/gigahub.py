"""Gigahub (Sagemcom F@ST 5689E) device list — async, cached."""
import asyncio
import time

from sagemcom_api.client import SagemcomClient
from sagemcom_api.enums import EncryptionMethod

from .. import config


_cache: dict = {"devices": [], "ts": 0, "error": None}
_lock = asyncio.Lock()


async def _fetch() -> list[dict]:
    async with SagemcomClient(
        config.GIGAHUB_HOST,
        config.GIGAHUB_USER,
        config.GIGAHUB_PASS,
        EncryptionMethod.SHA512,
    ) as client:
        await client.login()
        raw = await client.get_hosts()
        return [
            {
                "mac": (d.phys_address or "").lower(),
                "ip": d.ip_address or "",
                "hostname": d.user_host_name or d.host_name or "—",
                "interface": d.interface_type or "—",  # "WiFi" / "Ethernet"
                "active": d.active,
                "last_seen": d.active_last_change or "",
            }
            for d in raw
            if d.phys_address
        ]


async def refresh() -> None:
    """Refresh cache. Called by background task."""
    async with _lock:
        try:
            _cache["devices"] = await _fetch()
            _cache["ts"] = int(time.time())
            _cache["error"] = None
        except Exception as e:
            _cache["error"] = f"{type(e).__name__}: {e}"


def cached() -> dict:
    return {"devices": list(_cache["devices"]), "ts": _cache["ts"], "error": _cache["error"]}


async def periodic() -> None:
    """Background task to refresh the cache every GIGAHUB_REFRESH_SEC."""
    while True:
        await refresh()
        await asyncio.sleep(config.GIGAHUB_REFRESH_SEC)
