"""Device discovery — DHCP leases + static, grouped by VLAN, with sparklines."""
from .. import config
from ..models import Vlan, Device, SparkData
from . import uptime


def vlans() -> list[Vlan]:
    iot: list[Device] = []
    trusted: list[Device] = []
    if config.LEASES_FILE.exists():
        for line in config.LEASES_FILE.read_text().splitlines():
            parts = line.split()
            if len(parts) < 4:
                continue
            ip = parts[2]
            d = Device(
                mac=parts[1],
                ip=ip,
                hostname=parts[3] if parts[3] != "*" else "—",
                spark=uptime.sparkline(parts[1]),
            )
            if ip.startswith("192.168.20."):
                iot.append(d)
            elif ip.startswith("192.168.30."):
                trusted.append(d)
    mgmt = [
        Device(mac=s["mac"], ip=s["ip"], hostname=s["hostname"], spark=uptime.sparkline(s["mac"]))
        for s in config.STATIC_DEVICES
    ]
    return [
        Vlan(name="VLAN 20 (IoT)", kind="iot", devices=iot),
        Vlan(name="VLAN 30 (Trusted)", kind="trusted", devices=trusted),
        Vlan(name="VLAN 10 + Mgmt", kind="mgmt", devices=mgmt),
    ]
