"""Pydantic models — single source of truth for backend + frontend types."""
from typing import Literal
from pydantic import BaseModel


class State(BaseModel):
    vlan10_to_vlan30: bool
    vlan20_wan: bool
    iot_wan_macs: list[str]
    trusted_wan_blocked_macs: list[str]


class Stats(BaseModel):
    uptime: str
    load: str
    mem_used_pct: float
    mem_total_gb: float
    temp: str


class SparkData(BaseModel):
    buckets: list[int | None]
    avg: float | None
    samples: int


class Device(BaseModel):
    hostname: str
    ip: str
    mac: str
    spark: SparkData


class Vlan(BaseModel):
    name: str
    kind: Literal["iot", "trusted", "mgmt"]
    devices: list[Device]


class WifiStats(BaseModel):
    ap_alias: str
    signal_dbm: int
    noise_dbm: int
    tx_kbps: int
    rx_kbps: int
    uptime_sec: int
    bytes_tx: int
    bytes_rx: int
    standard: str
    security: str


class GigahubDevice(BaseModel):
    mac: str
    ip: str
    hostname: str
    interface: str
    active: bool
    last_seen: str
    wifi: WifiStats | None = None


class WifiRadio(BaseModel):
    alias: str
    band: str
    channel: int
    bandwidth: str
    power_pct: int
    max_bit_rate: int
    status: str
    enabled: bool


class WifiSsid(BaseModel):
    alias: str
    ssid: str
    bssid: str
    enabled: bool
    band: str
    client_count: int


class GigahubInfo(BaseModel):
    devices: list[GigahubDevice]
    radios: list[WifiRadio]
    ssids: list[WifiSsid]
    ts: int
    error: str | None


class Snapshot(BaseModel):
    state: State
    stats: Stats
    vlans: list[Vlan]
    gigahub: GigahubInfo
    interfaces: str
    routes: str
    firewall: str


class HistoryPoint(BaseModel):
    h: int
    pct: int | None
    ts: int


class ToggleResult(BaseModel):
    ok: bool
    msg: str
    state: State
