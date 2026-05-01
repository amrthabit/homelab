# Roadmap

Things discussed but not yet built. Loosely ordered by how often the user mentioned them.

## Network topology diagram (in-progress design)

See `pi/webui/frontend/src/components/network-diagram-brief.md` for the full
brief. TL;DR — fixed nodes (Gigahub / switch / Pi / Nest / HA / OptiPlex /
clients) with SVG edges; live overlays show 24h uptime per link, animated
data-flow dots, lock icons on restricted links. **Dynamic layer**: store
per-MAC attachment over time (Wi-Fi AP / switch port / VLAN), detect changes,
surface "device moved", "device joined", "device left" events.

Phase 1: static current state, ~2h
Phase 2: snapshot recorder in `poll.py` + new `attach` and `topo_events`
sqlite tables, ~1h
Phase 3: change indicators on the diagram + per-edge / per-node event
tooltips, ~1h

## MAC registry / probation system (kid-policy framework)

The big one from the early design discussions. Goal: any new MAC joining the
network defaults to "probation" (heavily throttled or gaming-blocked) until
explicitly approved. Mom-friendly approval UI on the dashboard.

Architecture:
- New table: `mac_registry(mac, first_seen, policy)` where policy ∈
  `unrestricted | budget | prohibited | blocked`
- New nftables sets: `prohibited_macs`, `budget_macs` — driven from the registry
- DHCP hook: every new lease → insert with `policy=prohibited` if MAC unknown
- Approval UI: each unknown MAC shows up in webui with "Approve / Block / Budget" buttons
- Time-budget enforcement: count active-traffic seconds per MAC per week, escalate at thresholds

Notes from early discussions:
- Whitelist: just the user's work laptop. Cellular hotspot is the fallback if it ever fails authentication.
- Default for everything else: prohibition (gaming destinations blocked) until approved.
- Specifically blocking gaming traffic via destination IP ranges (Steam, Xbox Live, PSN, Riot, Battle.net) is harder-to-bypass than per-device.
- VPN blocking is an arms race; don't try to win it.

## Pi-hole

DNS-level visibility + ad blocking. Replace dnsmasq's DNS forwarding with
Pi-hole pointing to upstream `1.1.1.1`. Devices on VLAN 20 + 30 already get
Pi as DNS — switching to Pi-hole would auto-give them the visibility view.
~30 min.

## Per-device usage tracking on Pi (wired devices)

Gigahub gives us per-Wi-Fi-client `bytes_sent`/`bytes_received`. For wired
devices on VLAN 20 + 30 (which all flow through the Pi), we can track on the
Pi via nftables byte counters per MAC. Then the existing `<Chart>` works for
both. Sketch:
- Add a `counter` rule per MAC in the forward chain (regenerate nftables.conf when MAC list changes)
- Periodic dump into `metrics(key='wired.tx.<mac>', value=bytes)` from `poll.py`
- UI: same chart as Wi-Fi devices

## Statistics card from Gigahub

We already have access to per-PHY ethernet stats and per-radio Wi-Fi stats
(see `gigahub.py`). Build a "Statistics" section showing total tx/rx per LAN
port, per Wi-Fi band, IGMP streams (Bell IPTV multicast). All read-only,
guest API has access. ~1h.

## System Logs from Gigahub

The `getEvents` JSON-RPC method exists (we saw the admin UI use it). It's a
long-poll endpoint — the page subscribes and the router pushes events.
Failed login attempts, system events, etc. would land here.

To implement: aiohttp client that POSTs `{method: getEvents}` and waits;
parse the response; insert into a `gigahub_events` table; show in the UI.

Probing showed `getEvents` times out with simple call — likely needs a
subscription handshake first via `subscribeForNotification`. Look at the
admin UI's request stream for the exact dance (use `pi/webui/backend/probe_gigahub.py` in `logs` mode).

## WAN exposure (VPN + web server with rate limiting)

User's stated goal: VLAN 30 hosts a VPN endpoint and a web server, both
exposed via Gigahub port forwarding to the WAN. Need:
- Gigahub port forwarding rules (probably has to be set via admin UI; sagemcom_api may expose `Device/NAT/PortMappings` for writes)
- nftables INPUT-chain rate limiting on the exposed services
- fail2ban or equivalent on Pi (for SSH if exposed) — install + config

## "My Usage" page integration

Bell admin UI has a "My Usage" page showing per-device % over 30 days. We
captured the requests via Playwright — it's just iterating the same
`Device/WiFi/AccessPoints/AccessPoint/AssociatedDevices/AssociatedDevice[MACAddress='X']`
path and computing percentages from cumulative `bytes_sent`+`bytes_received`.
We already pull this data on every poll. The "30-day window" claim is misleading —
counters reset on reboot/AP-reassoc.

If we want true 30-day rolling: store deltas in `metrics`, sum over 30 days
client-side. Already have all the data.

## Activity feed improvements

Currently shows last 20 device join/leave events from `active_last_change`.
Could be extended to:
- Pull from a proper `gigahub_events` table once `getEvents` is wired up
- Show authentication failures, port up/down events
- Filter by severity / type

## Mobile UI polish

Most of the UI is responsive. Things still rough on phones:
- Long Gigahub device hostnames — ellipsis works but could show on tap
- Hover tooltips obviously don't work — tap-to-show is implemented for sparklines, could add for charts
- Section header right-side (uptime) could overflow on very small screens

## Multi-user / mom-friendly auth

UI is currently unauthenticated (LAN-only). Adding a mom-mode would mean:
- Simple PIN or passkey on certain destructive toggles (e.g. blanket VLAN 20 WAN OFF when she's relying on a Nest)
- Read-only mode for guest viewers
- Single shared admin password for full control

Not urgent — household trust model is fine for now.

## Notifications

Push or email when:
- New unknown MAC joins (per the registry system)
- Device flagged as offline > N hours unexpectedly
- Failed admin login attempt

Implementation: webhooks to ntfy.sh, Pushover, or HA's own notification system.

## Better Gigahub `setValue` integration

We're entirely read-only against the Gigahub. With admin creds we can in theory
mutate things (port forwarding, Wi-Fi password, blacklist a MAC). Risk of
breaking Bell-managed config is real — would need careful testing on a non-prod
fork first. Defer indefinitely unless a specific need surfaces.

## Backups

The Pi's sqlite db (`/var/lib/homelab/uptime.db`) is the only state worth
backing up that isn't in git. State.json is also non-git but trivially
regenerable.

Could add a daily cron that copies both into the repo's `pi/backups/` and
commits — or to a remote. Tiny, ~50 MB max.
