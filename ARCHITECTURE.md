# Architecture

End-to-end picture of how the homelab is wired and how the dashboard knows
what it knows.

## Physical

```
[Internet — Bell Fibre]
        |
        | fibre/SFP
        v
   ┌──────────┐
   │ Gigahub  │  192.168.2.1   Wi-Fi (Near5G, Quattro guest, Near6G off, ...)
   │ Sagemcom │
   │ F@ST     │
   │ 5689E    │
   └────┬─────┘
        | LAN cable, port 1
        v
  ┌──────────────────────┐
  │ TL-SG108E (8-port)   │  192.168.2.153
  │  port 1: Gigahub LAN │  untagged VLAN 10
  │  port 2: Nest WAN    │  untagged VLAN 20
  │  port 3: Pi 5 trunk  │  untagged VLAN 10 + tagged 20/30  ← bridge box
  │  port 4: ThinkPad    │  untagged VLAN 30
  │  port 5: OptiPlex    │  untagged VLAN 30
  │  port 6,7: spare     │  untagged VLAN 1
  │  port 8: mgmt        │  untagged VLAN 1
  └──────────────────────┘
```

## Network logic

- VLAN 10 = Gigahub's native subnet (`192.168.2.0/24`). Gigahub does DHCP +
  is the gateway. Pi has a DHCP-reserved IP `192.168.2.10` on this VLAN.
- VLAN 20 = IoT (`192.168.20.0/24`). Pi is gateway. dnsmasq on Pi serves DHCP.
  Default forward policy: drop. Allowlist set `iot_wan_allowed` (per-MAC) lets
  specific devices reach the WAN.
- VLAN 30 = Trusted wired (`192.168.30.0/24`). Pi is gateway. dnsmasq on Pi.
  Default forward: allow. Blocklist set `trusted_wan_blocked` (per-MAC) blocks
  specific devices.

## Pi software stack

```
┌────────────────────────────────────────────────────────────────────┐
│ Linux (DietPi 10.3.3 on Debian Trixie, kernel 6.12.75)            │
│                                                                    │
│  systemd                                                           │
│   ├── networking.service          ← /etc/network/interfaces       │
│   ├── nftables.service            ← /etc/nftables.conf            │
│   ├── dnsmasq.service             ← /etc/dnsmasq.d/homelab.conf   │
│   ├── ssh.service                 ← OpenSSH, key auth             │
│   ├── homelab-ui.service          ← uvicorn + FastAPI on :80      │
│   ├── homelab-poll.timer          ← every 60s                     │
│   └── homelab-poll.service        ← oneshot — collects metrics    │
│                                                                    │
│  /opt/homelab/                    ← git checkout, deploy target   │
│    pi/webui/                                                       │
│      backend/  (FastAPI + Pydantic + sse-starlette + sagemcom_api) │
│      frontend/  (Solid + Vite + Tailwind v4 + lucide-solid)        │
│      poll.py                                                       │
│      deploy.sh                                                     │
│                                                                    │
│  /var/lib/homelab/                ← runtime state                  │
│    state.json                       toggles + per-MAC sets         │
│    uptime.db                        sqlite: samples + metrics       │
│                                                                    │
│  /srv/git/homelab.git/            ← bare git remote                │
│    hooks/post-receive              ← runs deploy.sh on push        │
└────────────────────────────────────────────────────────────────────┘
```

## Web UI request flow

```
Browser
  │
  ├── GET /                       ← serves frontend/dist/index.html
  ├── GET /assets/...js,.css      ← Vite-built bundles
  │
  ├── EventSource /api/stream     ← persistent SSE — server pushes Snapshot every 5s
  │
  └── POST /api/toggle/<key>      ← mutates state.json → regen nftables.conf → apply
      POST /api/iot_wan/<mac>     ← mutates per-MAC allowlist
      POST /api/trusted_wan/<mac> ← mutates per-MAC blocklist
      GET  /api/snapshot          ← initial render fallback
      GET  /api/history/<mac>     ← 30-day uptime hourly buckets
      GET  /api/metric/<key>      ← raw time series for a metric, default 24h
      GET  /api/metric/keys       ← list known keys (with optional prefix filter)
```

## Snapshot composition

```python
Snapshot = {
  state:       state.json contents
  stats:       uptime / load% / mem% / temp / mem_total
  vlans:       [
    { name: "VLAN 10 + Mgmt", kind: "mgmt", devices: [Pi self, Gigahub, switch] },
    { name: "VLAN 20 (IoT)",  kind: "iot",  devices: [from dnsmasq.leases] },
    { name: "VLAN 30 (Trusted)", kind: "trusted", devices: [from dnsmasq.leases] },
  ]   # each device has a 48h uptime sparkline derived from `samples` table
  gigahub: {
    devices:   [from sagemcom_api.get_hosts() — every Wi-Fi + wired client Gigahub knows]
    radios:    [3 entries: 2.4 / 5 / 6 GHz]
    ssids:     [7 entries with broadcast name, BSSID, band, client_count]
    ts:        last poll timestamp
    error:     null | last poll error string
  }
  interfaces: `ip -br addr` dump
  routes:     `ip route` dump
  firewall:   `nft list ruleset` dump
}
```

## Polling pipeline (every 60s)

`poll.py` runs as a systemd-timer-driven oneshot:

1. **Pings** every device in `dnsmasq.leases` + 3 static (Gigahub, Pi, switch).
   Stores `(mac, ts, up=0|1)` rows in `samples`.
2. **Reads system metrics**: `/proc/loadavg`, `/proc/meminfo`, `vcgencmd`. Stores
   keys `system.load1`, `system.load_pct`, `system.mem_used_pct`, `system.temp`.
3. **Calls Sagemcom API** via `sagemcom_api` lib (admin auth). For each AP's
   associated devices, records `wifi.tx.<mac>`, `wifi.rx.<mac>`, `wifi.signal.<mac>`.
   For each radio: `radio.tx/rx.<alias>`. For each Ethernet PHY: `phy.tx/rx.<alias>`.
4. **Prunes** rows older than 30 days from both tables.

## nftables generation

`/etc/nftables.conf` is **generated** by `services/nftables.py` from
`pi/webui/templates/nftables.conf.j2` using the current `state.json`. Any UI
toggle mutates state, then re-renders + re-applies. The "blanket VLAN 20 WAN"
toggle changes the rule from per-MAC allowlist to a blanket accept.

## Key design choices

- **Server-rendered snapshots over polling**: we use SSE (push from server) so
  the frontend doesn't poll. SSE clients keep a connection open; uvicorn
  shuts down with `--timeout-graceful-shutdown 2` to avoid blocking restarts.
- **Single source of truth for types**: Pydantic models in `backend/models.py`
  mirror manually-maintained `frontend/src/types.ts`. Could be auto-generated
  from OpenAPI in future (`openapi-typescript`).
- **No build artifacts in git**: `frontend/dist/`, `node_modules/`, `venv/` are
  all gitignored. Built fresh on the Pi during deploy.
- **Hot-reload deploy**: `deploy.sh` skips Vite rebuild if no frontend files
  changed since last deploy, and skips uvicorn restart if no backend files
  changed. ~1s for unrelated changes.
- **Rescue path**: Pi works as a normal DHCP client on any untagged port
  (e.g. plug into Gigahub LAN directly) thanks to `iface eth0 inet dhcp` in
  `/etc/network/interfaces`. The DHCP reservation always gives it `192.168.2.10`.
