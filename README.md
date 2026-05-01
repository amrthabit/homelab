# homelab

Home network segmentation, IoT control, and automation.

## Hardware

| Device | Role |
|---|---|
| Bell Gigahub | Fibre WAN (1.5Gbps), main wifi SSID `Near5G` (trusted) |
| TL-SG108E | 8-port managed switch, VLAN brain |
| Raspberry Pi 5 8GB | Bridge box — firewall, routing, DHCP, monitoring |
| Nest Wifi (non-Pro) | Dumb AP for IoT 2.4GHz SSID `Near` |
| ThinkPad mini PC | Proxmox host → Home Assistant VM |
| Dell OptiPlex | Home servers |

## Network Design

```
[Fibre] → [Gigahub] → wifi: Near5G (trusted, uncontrolled)
                  |
                  | eth
                  |
            [TL-SG108E]
            port 1  → Gigahub LAN       (untagged VLAN 10)
            port 2  → Nest WAN          (untagged VLAN 20)
            port 3  → Pi 4 (trunk)      (tagged VLAN 10 + 20)
            port 4  → ThinkPad/Proxmox  (untagged VLAN 10)
            port 5  → Dell OptiPlex     (untagged VLAN 10)
            port 6  → kid's drop        (untagged VLAN 10, future VLAN 30)
            port 7  → spare IoT         (untagged VLAN 20)
            port 8  → management        (untagged VLAN 1)
```

| VLAN | Name | Gateway | Purpose |
|---|---|---|---|
| 10 | Main | Gigahub | Wired servers, HA, trusted devices |
| 20 | IoT | Pi | Near wifi, LIFX, Inovelli, IoT |
| 30 | Kid | Pi | Future — kid's wired drop, MAC rules |

## Pi 4 Services (planned)

- `nftables` — firewall, inter-VLAN routing
- `dnsmasq` — DHCP for VLAN 20
- `Pi-hole` — DNS for VLAN 10 + 20, usage visibility
- `ntopng` — traffic dashboards
- MAC registry — SQLite + Python daemon, new MACs enter prohibition
- Approval UI — Flask app on port 8080, mom-friendly

## MAC Policy

- Known MACs → assigned policy (unrestricted / budget / blocked)
- Unknown MACs → prohibition (gaming destinations blocked) until approved
- Approval via web UI at `http://192.168.10.1:8080`

## Status

- [x] Network design finalised
- [x] Switch port/VLAN table defined
- [x] Pi 5 flashed — DietPi 64-bit (2026-04-20), kernel 6.12.75, SSH confirmed
- [ ] Physical cabling
- [ ] Switch VLAN config
- [ ] Pi networking (VLAN sub-interfaces)
- [ ] Pi services
