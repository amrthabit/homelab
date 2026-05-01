# ThinkPad — Home Assistant OS

Captured: 2026-05-01

## Identity
| | |
|---|---|
| Hostname | `homeassistant` |
| IP | `192.168.30.86` (DHCP from Pi dnsmasq) |
| MAC | `02:b2:a6:37:0a:fe` (locally-administered, virtualised NIC) |
| HAOS version | `16.3` (latest is 17.2) |
| Supervisor agent | 1.7.2 |
| Architecture | amd64 |
| Kernel | 6.12.51-haos |

## Hardware
- Chassis: vm
- Virtualization: kvm (HA OS itself runs as a VM image — primary thing on this box)
- Disk: 30.8 GB (9.8 GB used)
- RAM: 5.7 GiB total, 1.1 GiB used
- Swap: 1.9 GiB

## Running addons
- Matter Server (started)
- Z-Wave JS (started)
- Terminal & SSH (started, port 22 — used for management)

## Access
- Web UI: `http://192.168.30.86:8123`
- SSH (via Terminal & SSH addon): `ssh root@192.168.30.86`
- Reachable from VLAN 10 only because of the laptop static route + Pi forward rule

## Notes
- DHCP'd, not static. To pin: add `dhcp-host=02:b2:a6:37:0a:fe,192.168.30.86` to `/etc/dnsmasq.d/homelab.conf` on Pi.
- Updates available: HAOS 16.3 → 17.2, Matter Server 8.1.1 → 8.4.0, Z-Wave JS, Terminal & SSH 10.0.2 → 10.1.0.
