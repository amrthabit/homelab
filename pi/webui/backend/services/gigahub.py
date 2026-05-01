"""Gigahub (Sagemcom F@ST 5689E) device list — async, cached."""
import asyncio
import time

from sagemcom_api.client import SagemcomClient
from sagemcom_api.enums import EncryptionMethod

from .. import config


_cache: dict = {"devices": [], "ts": 0, "error": None}
_lock = asyncio.Lock()


_cache.update({"radios": [], "ssids": []})


def _safe_int(v) -> int:
    try:
        return int(v) if v is not None else 0
    except Exception:
        return 0


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

        # Build a MAC -> Wi-Fi association stats map by walking all APs
        wifi_stats: dict[str, dict] = {}
        for ap in (aps_raw or []):
            for ad in (ap.get("associated_devices") or []):
                mac = (ad.get("mac_address") or "").lower()
                if not mac:
                    continue
                stats = ad.get("stats") or {}
                wifi_stats[mac] = {
                    "ap_alias": ap.get("alias", ""),
                    "signal_dbm": _safe_int(ad.get("signal_strength")),
                    "noise_dbm": _safe_int(ad.get("noise")),
                    "tx_kbps": _safe_int(ad.get("last_data_uplink_rate")),  # client -> AP
                    "rx_kbps": _safe_int(ad.get("last_data_downlink_rate")),  # AP -> client
                    "uptime_sec": _safe_int(ad.get("uptime")),
                    "bytes_tx": _safe_int(stats.get("bytes_sent")),
                    "bytes_rx": _safe_int(stats.get("bytes_received")),
                    "standard": ad.get("operating_standard", ""),
                    "security": ad.get("security_mode", ""),
                }

        devices = []
        for d in raw_hosts:
            if not d.phys_address:
                continue
            mac = d.phys_address.lower()
            devices.append({
                "mac": mac,
                "ip": d.ip_address or "",
                "hostname": d.user_host_name or d.host_name or "-",
                "interface": d.interface_type or "-",
                "active": d.active,
                "last_seen": d.active_last_change or "",
                "wifi": wifi_stats.get(mac),
            })

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

        # SSIDs and APs come back in matching order — pair by index.
        ap_list = aps_raw or []
        ssids = []
        for i, s in enumerate(ssids_raw or []):
            ap = ap_list[i] if i < len(ap_list) else {}
            alias = s.get("alias", "")
            band = "6 GHz" if "_6G" in alias else "5 GHz" if "_5G" in alias else "2.4 GHz"
            ssids.append({
                "alias": alias,
                "ssid": s.get("SSID") or "-",
                "bssid": s.get("BSSID") or "",
                "enabled": bool(s.get("enable", False)),
                "band": band,
                "client_count": len(ap.get("associated_devices", []) or []),
            })
        # Sort: enabled first, then by SSID name, then by band
        ssids.sort(key=lambda x: (not x["enabled"], x["ssid"].lower(), x["band"]))
        return {"devices": devices, "radios": radios, "ssids": ssids}


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
        "ts": _cache["ts"],
        "error": _cache["error"],
    }


async def periodic() -> None:
    """Background task to refresh the cache every GIGAHUB_REFRESH_SEC."""
    while True:
        await refresh()
        await asyncio.sleep(config.GIGAHUB_REFRESH_SEC)
