# CLAUDE.md — context for any future Claude session

This repo controls a home network: a **Bell Gigahub** (Sagemcom F@ST 5689E) with
a **TL-SG108E managed switch**, a **Pi 5 (8 GB)** acting as bridge/router/firewall,
plus a **ThinkPad** running Home Assistant OS and a **Dell OptiPlex** as servers.

If you (a Claude session) are picking this up cold, this file gets you productive
in 5 minutes.

## Where everything lives

```
pi/                                  # everything related to the bridge box (the Pi)
  baseline.md                        # Pi 5 fresh-install hardware/software baseline
  journal.md                         # chronological log of what worked / what didn't
  nftables.conf                      # static reference (the live one is templated, see below)
  dnsmasq.conf                       # static reference (live: /etc/dnsmasq.d/homelab.conf on Pi)
  network/{interfaces,vlans}         # /etc/network/interfaces references
  webui/
    backend/                         # FastAPI JSON API + SSE stream (uvicorn)
      main.py                        # app entry, lifespan, SPA static serving
      config.py                      # paths, constants, env var loading
      models.py                      # Pydantic models — single source of truth for types
      routers/api.py                 # all /api/* routes
      services/                      # business logic per concern
        snapshot.py                  # /api/snapshot composer
        state.py                     # state.json load/save
        nftables.py                  # render Jinja2 template + apply
        uptime.py                    # sqlite read for sparklines/history/metrics
        system.py                    # /proc/{loadavg,meminfo}, vcgencmd, ip
        devices.py                   # vlan grouping
        gigahub.py                   # Sagemcom API client (cached, periodic refresh)
        sh.py                        # subprocess helper
      probe_gigahub.py               # Playwright probe to capture admin UI requests
      requirements.txt
    frontend/                        # Solid + Vite + Tailwind v4 + lucide-solid
      package.json
      vite.config.ts
      src/
        main.tsx                     # entry
        App.tsx                      # top-level layout, sections, SSE wiring
        api.ts                       # typed HTTP client + SSE subscription
        types.ts                     # mirrors backend Pydantic models
        index.css                    # Tailwind import + theme variables
        components/
          Section.tsx                # collapsible card with localStorage persistence
          DeviceTable.tsx            # VLAN-grouped device list + per-device drill-in
          GigahubTable.tsx           # all Gigahub-known devices, filter/sort
          WifiCard.tsx               # radios + SSIDs (band, BSSID, clients, state)
          Activity.tsx               # recent device join/leave events
          SystemCharts.tsx           # load%, mem%, temp °C — 24h timeseries
          Chart.tsx                  # generic SVG line chart (with hover)
          Sparkline.tsx              # bucket bars (with hover)
          Toggle.tsx                 # ToggleCard + MiniToggle
          network-diagram-brief.md   # design brief for the next chunk
      public/favicon.svg
    templates/
      nftables.conf.j2               # Jinja2-rendered nftables config
    poll.py                          # periodic poller — runs every 60s via systemd timer
    deploy.sh                        # `git pull && conditional build/restart`
    homelab-ui.service.template      # systemd unit for FastAPI (uvicorn)
    homelab-poll.service.template    # systemd unit for the poller (oneshot)
    homelab-poll.timer               # 60s interval for the poller
thinkpad/baseline.md                 # ThinkPad / HA baseline
secrets.env                          # **gitignored** — root pw, switch pw, gigahub admin pw, HA creds
```

## Hardware + IP map

| Device | IP | Role |
|---|---|---|
| Bell Gigahub | `192.168.2.1` | Fibre WAN, DHCP for VLAN 10, Wi-Fi for trusted devices (Near5G, Quattro guest) |
| TL-SG108E switch | `192.168.2.153` | 802.1Q VLAN brain |
| Pi 5 (bridge) | `192.168.2.10` (DHCP-reserved) | Router/firewall/DHCP/DNS for VLAN 20+30, web UI on port 80 |
| ThinkPad — Home Assistant OS | `192.168.30.86` | HA + Z-Wave JS + Matter Server; Terminal+SSH addon on port 22 |
| Dell OptiPlex | (VLAN 30) | Home servers — exact IP varies |
| Nest Wifi (non-Pro) | `192.168.20.122` | Dumb 2.4 GHz AP for IoT, BRIDGE mode |

## VLAN layout

| VLAN | Subnet | Gateway | Purpose |
|---|---|---|---|
| 10 | 192.168.2.0/24 | Gigahub | Trusted clients on the Bell Wi-Fi (Near5G); Pi management |
| 20 | 192.168.20.0/24 | Pi (`.20.1`) | IoT (LIFX, Inovelli, Nest devices). WAN OFF by default per-MAC allowlist. |
| 30 | 192.168.30.0/24 | Pi (`.30.1`) | Trusted wired (HA, Proxmox, OptiPlex). WAN ON by default per-MAC blocklist. |

Switch port assignments — see `pi/journal.md` (search "PVID"). Trunk = port 3 (Pi).

## Deploy workflow

The Pi is a git remote. Push directly:
```
git push pi master    # triggers post-receive hook → deploy.sh on Pi
```

`deploy.sh` is idempotent and skips work that hasn't changed (compares stamp
files in `pi/webui/.deploy-stamps/`). A typical no-frontend-change deploy is ~1s.
A frontend rebuild is ~13s.

For reference:
- `pi` remote — `root@192.168.2.10:/srv/git/homelab.git` (auto-deploys on push)
- `origin` remote — GitHub backup (manual `git push origin master`)

To rebuild from scratch on a fresh Pi: clone, run `pi/webui/deploy.sh`. It
installs venv, pip deps, npm deps, builds, sets up systemd units, restarts.

## Live data flow

- Browser opens `http://192.168.2.10/` (port 80) → SPA loaded from `frontend/dist`.
- SPA opens SSE at `/api/stream`. Backend pushes a fresh `Snapshot` every 5s.
- `Snapshot` includes: state, system stats, VLAN device groups, Gigahub devices/Wi-Fi info, ip/route/firewall dumps.
- Toggles POST to `/api/toggle/<key>`, `/api/iot_wan/<mac>`, `/api/trusted_wan/<mac>`. Backend mutates state, regenerates `nftables.conf` from the Jinja2 template, applies via `nft -f`, broadcasts new snapshot over SSE.
- Time-series: `poll.py` runs every 60s via systemd timer. Records `samples` (ping up/down) and `metrics` (Wi-Fi tx/rx/signal per MAC, radio tx/rx, PHY tx/rx, system load_pct/mem_used_pct/temp). 30-day retention.
- Charts call `/api/metric/<key>?hours=24` and render with the `<Chart>` component.

## Conventions established

- **Backend**: FastAPI + Pydantic, modular `routers/` and `services/`. New features add a service or router file rather than bloating `main.py`.
- **Frontend**: Solid + Tailwind v4 + lucide-solid. No emojis. Collapsible sections via `<Section>`. localStorage persistence for UI toggles + section state + device row expansion (`homelab.section.open.<slug>`, `homelab.openMacs`).
- **Theming**: CSS variables under `@theme {}` in `index.css`. `--color-up` (green), `--color-warn` (amber), `--color-low` (orange), `--color-down` (red), `--color-accent` (blue), `--color-muted` (grey). Use these everywhere.
- **Fixed-width badges** at 56-72px so columns align across tables.
- **Time-series charts**: 1-min raw resolution stored, chart fetches up to 24h, optional `aggregateMax(points, bucketSec)` from `Chart.tsx` if needed.
- **Templates**: nftables and systemd units use Jinja/sed substitution so all paths are derived from the repo location. No hardcoded paths in templates.

## Pi access + Gigahub creds

Read `secrets.env` (gitignored) for:
- `ROOT_PASS` — Pi root login (already on disk; SSH key auth is preferred)
- `SOFTWARE_PASS` — DietPi software password
- `SWITCH_PASS` — TL-SG108E admin
- `GIGAHUB_ADMIN_USER` / `GIGAHUB_ADMIN_PASS` — Gigahub admin (consumed by FastAPI via `EnvironmentFile` in the systemd unit)
- `HASS_USER` / `HASS_PASS` — HA OS

SSH to Pi via key auth: `ssh root@192.168.2.10`. SSH to HA: same host at `192.168.30.86` (only reachable from VLAN 10 with the static route `route -p add 192.168.30.0 mask 255.255.255.0 192.168.2.10` on the user's laptop).

## What works today

Bridge box: routing, NAT, firewall (per-VLAN + per-MAC sets), DHCP, DNS forwarding,
SSE-driven web UI with toggles, system charts, Gigahub Wi-Fi/device data, per-Wi-Fi-device
usage + signal + link rate, sparklines, 30-day uptime history per device, animated
collapse, mobile responsive.

## What's deliberately NOT built yet

See `ROADMAP.md` for the feature wishlist with implementation hints.

## When picking up work

1. Read `pi/journal.md` (chronological "what worked / what didn't" — saves you from
   stepping on past mines)
2. `git log --oneline -30` — recent commit history is a story
3. Open the live UI at `http://192.168.2.10/` and click around to see current state
4. Look at `pi/webui/frontend/src/components/network-diagram-brief.md` if continuing on the topology diagram
5. `ssh root@192.168.2.10 'systemctl status homelab-ui homelab-poll.timer dnsmasq nftables'` — quick health check
6. `ssh root@192.168.2.10 'tail -50 /var/log/dnsmasq.log'` — recent DHCP activity if devices behave weirdly
