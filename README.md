# homelab

Home network segmentation, IoT control, and automation. Bell Gigahub →
TL-SG108E managed switch → Pi 5 (bridge box) → ThinkPad/HA + OptiPlex + IoT.

**Live dashboard**: `http://192.168.2.10/` (LAN-only).

**Where to start if you're new**:
- [`CLAUDE.md`](./CLAUDE.md) — context for Claude sessions, file map, conventions
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — physical + software architecture
- [`ROADMAP.md`](./ROADMAP.md) — features designed but not built
- [`RECOVERY.md`](./RECOVERY.md) — disaster recovery for any device
- [`pi/journal.md`](./pi/journal.md) — chronological build log
- [`pi/baseline.md`](./pi/baseline.md) — Pi 5 fresh-install snapshot
- [`thinkpad/baseline.md`](./thinkpad/baseline.md) — Home Assistant OS snapshot

**Deploy**: `git push pi master` (post-receive hook auto-deploys on the Pi).

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

## Status (May 2026)

- [x] Network design finalised
- [x] Switch port/VLAN config + DHCP reservation for Pi
- [x] Pi 5 with DietPi, OpenSSH, key auth
- [x] Pi networking — eth0 untagged on VLAN 10 (DHCP fallback), eth0.20 + eth0.30 sub-interfaces
- [x] Pi nftables — per-VLAN routing, NAT, per-MAC allowlists/blocklists
- [x] Pi dnsmasq — DHCP+DNS for VLAN 20+30, static reservations
- [x] FastAPI + SSE web UI on port 80
- [x] Solid + Vite + Tailwind frontend, dark theme, mobile responsive
- [x] Per-device toggle for IoT WAN access (allowlist) and trusted WAN block (blocklist)
- [x] 48h sparklines + 30d hourly history per device
- [x] System charts (load%, memory%, temp) — 24h, 1m resolution
- [x] Per-Wi-Fi-device throughput + signal charts (24h)
- [x] Comprehensive metrics poller (60s) — Wi-Fi/radio/PHY/system → sqlite
- [x] Gigahub admin integration via `sagemcom_api` (read-only)
- [x] Wi-Fi card showing radios + SSIDs + per-AP client counts
- [x] All-device Gigahub table (filter, sort, search bars for tx/rx)
- [x] Recent device activity timeline
- [x] Git-push-to-deploy via Pi-hosted bare repo + post-receive hook
- [x] Per-step deploy timing + change detection (skip vite/restart when not needed)
- [ ] Network topology diagram (designed, brief in `pi/webui/frontend/src/components/network-diagram-brief.md`)
- [ ] MAC registry + probation system (kid-policy framework — see `ROADMAP.md`)
- [ ] Pi-hole, ntopng — see `ROADMAP.md`
- [ ] WAN exposure with rate limiting + fail2ban — see `ROADMAP.md`
