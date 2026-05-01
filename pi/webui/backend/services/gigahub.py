"""Gigahub (Sagemcom F@ST 5689E) device list — async, cached."""
import asyncio
import time

from sagemcom_api.client import SagemcomClient
from sagemcom_api.enums import EncryptionMethod

from .. import config


_cache: dict = {"devices": [], "ts": 0, "error": None}
_lock = asyncio.Lock()


_cache.update({"radios": [], "ssids": [], "aps": []})


async def _fetch() -> dict:
    async with SagemcomClient(
        config.GIGAHUB_HOST,
        config.GIGAHUB_USER,
        config.GIGAHUB_PASS,
        EncryptionMethod.SHA512,
    ) as client:
        await client.login()
        raw_hosts = await client.get_hosts()
        radios_raw = await client.get_value_by_xpath("Device/WiFi/Radios")
        ssids_raw = await client.get_value_by_xpath("Device/WiFi/SSIDs")
        aps_raw = await client.get_value_by_xpath("Device/WiFi/AccessPoints")

        devices = [
            {
                "mac": (d.phys_address or "").lower(),
                "ip": d.ip_address or "",
                "hostname": d.user_host_name or d.host_name or "—",
                "interface": d.interface_type or "—",
                "active": d.active,
                "last_seen": d.active_last_change or "",
            }
            for d in raw_hosts
            if d.phys_address
        ]

        radios = [
            {
                "alias": r.get("alias", ""),
                "band": r.get("operating_frequency_band", ""),
                "channel": r.get("channel", 0),
                "bandwidth": r.get("current_operating_channel_bandwidth", ""),
                "power_pct": r.get("transmit_power", 0),
                "max_bit_rate": r.get("max_bit_rate", 0),
                "status": r.get("status", ""),
                "enabled": bool(r.get("enable", False)),
            }
            for r in (radios_raw or [])
        ]

        ssids = [
            {
                "alias": s.get("alias", ""),
                "ssid": s.get("SSID") or "—",
                "bssid": s.get("BSSID") or "",
                "enabled": bool(s.get("enable", False)),
            }
            for s in (ssids_raw or [])
        ]

        aps = [
            {
                "alias": a.get("alias", ""),
                "enabled": bool(a.get("enable", False)),
                "client_count": len(a.get("associated_devices", []) or []),
            }
            for a in (aps_raw or [])
        ]
        return {"devices": devices, "radios": radios, "ssids": ssids, "aps": aps}


async def refresh() -> None:
    async with _lock:
        try:
            data = await _fetch()
            _cache.update(data)
            _cache["ts"] = int(time.time())
            _cache["error"] = None
        except Exception as e:
            _cache["error"] = f"{type(e).__name__}: {e}"


def cached() -> dict:
    return {
        "devices": list(_cache["devices"]),
        "radios": list(_cache.get("radios", [])),
        "ssids": list(_cache.get("ssids", [])),
        "aps": list(_cache.get("aps", [])),
        "ts": _cache["ts"],
        "error": _cache["error"],
    }


async def periodic() -> None:
    """Background task to refresh the cache every GIGAHUB_REFRESH_SEC."""
    while True:
        await refresh()
        await asyncio.sleep(config.GIGAHUB_REFRESH_SEC)
