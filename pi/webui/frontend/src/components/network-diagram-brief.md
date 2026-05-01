# Network Diagram — Design Brief

This is a brief for the next Claude that picks up this work. Live state for
the dashboard already comes via `/api/snapshot` (full state every 5s) and
`/api/metric/<key>` (24h time series). The topology diagram should be a new
collapsible Section in the Solid frontend at `pi/webui/frontend/src/components/NetworkDiagram.tsx`.

## Goal
Show the home network as a graph — nodes are physical devices, edges are
ethernet links / Wi-Fi associations. Overlay live + historical state so the
viewer can answer:

- Is everything where it should be right now?
- Has anything moved, joined, or disconnected recently?
- Where is data flowing and what's restricted?

## Known topology (fixed nodes)
```
[Internet]
    |
[Gigahub] (192.168.2.1) ── Wi-Fi: Near5G, Quattro, Near, etc.
    |
[TL-SG108E switch] (192.168.2.153)
    ├── port 1 ── Gigahub LAN
    ├── port 2 ── Nest Wifi WAN (untagged VLAN 20)
    ├── port 3 ── Pi 5 (192.168.2.10) trunk: VLAN 10 (untagged) + VLAN 20/30 tagged
    ├── port 4 ── ThinkPad / HA OS (192.168.30.86)  VLAN 30 untagged
    ├── port 5 ── OptiPlex (servers)                VLAN 30 untagged
    ├── port 6-7 ── spare
    └── port 8 ── management / your laptop
[Nest Wifi]  ── 2.4 GHz "Near" SSID ── IoT clients (VLAN 20)
```

Devices on the Wi-Fi (Gigahub or Nest) are dynamic — they come and go. Wired
ports are mostly fixed but should also be tracked.

## Visual design
- **Custom Solid + SVG** (no external graph lib). Manual node positions.
- Each node = a card-like rectangle: device icon (lucide-solid Router/Cable/Wifi/Server), hostname, MAC tail, status dot.
- Each edge = SVG path. Color encodes 24h uptime average (`var(--color-up)` 100%, `--warn` mid, `--down` poor, `--border` no data).
- For active links, animate small dots flowing along the path (CSS `animation: dash`).
- Lock icon on edges where WAN is restricted (e.g. Pi → Internet for VLAN 20 default-deny).
- On hover: edge → tooltip with last N hours uptime + delta-throughput; node → tooltip with hostname/IP/MAC/last seen.
- On click: expand a drawer (reuse the existing collapsible Section pattern) showing per-device sparkline + history.

## Dynamic / historical layer
We want to detect topology *changes* over time, not just show the current state.

### Snapshots (extend poll.py)
Every minute, record the current attachment of each known device:
- Wi-Fi clients: which AP alias (PRIV0 / VID2 / GUEST1 / ...) → maps to SSID + band
- Wired clients on Pi-controlled VLANs: which IP, which VLAN
- Wired clients on Gigahub LAN: which Gigahub port (if exposed by sagemcom_api — probe `Device/Hosts/Hosts/Host[*]/AssociatedDevice`)

Schema (new sqlite table):
```sql
CREATE TABLE attach (
  ts INTEGER NOT NULL,
  mac TEXT NOT NULL,
  attach_kind TEXT NOT NULL,   -- "wifi-ap" | "switch-port" | "vlan"
  attach_id TEXT NOT NULL,     -- "VID2" | "PHY3" | "vlan-30"
  PRIMARY KEY (ts, mac)
);
CREATE INDEX idx_attach_mac_ts ON attach(mac, ts);
```

### Change detection
On each poll, diff the current attachment vs the most recent prior row per MAC.
Differences → events table:
```sql
CREATE TABLE topo_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  mac TEXT NOT NULL,
  hostname TEXT,
  kind TEXT NOT NULL,    -- "joined" | "left" | "moved" | "renamed"
  from_attach TEXT,
  to_attach TEXT
);
```

### Display
- Diagram badge: count of events in last 24h ("3 changes recently")
- Hovering an edge: small inline list "5 devices moved to here in last 24h"
- Hovering a node: "Joined network 2d ago", "Moved from 2.4 GHz to 5 GHz May 1"
- A separate "Activity" section already exists — extend or reuse for this.

## Phasing
- **Phase 1** (~2h): static diagram with current snapshot data. Hover/click drilldown reusing existing patterns.
- **Phase 2** (~1h): extend poll.py to record attach + detect events.
- **Phase 3** (~1h): show change indicators on the diagram + event tooltips.

## Constraints / preferences
- Stay within Solid + Tailwind + lucide-solid. No new heavy deps.
- Mobile-friendly (the rest of the UI is, this should be too). Probably scrollable on small screens.
- Persist UI state via localStorage (same `homelab.section.open.*` pattern).
- Use the existing `<Section>` collapsible wrapper.
- Use the existing `<Chart>` for inline time series.

## Files of interest
- `pi/webui/backend/services/gigahub.py` — Gigahub data + Wi-Fi association map (already exists)
- `pi/webui/backend/services/uptime.py` — sqlite metric helpers (extend with attach helpers)
- `pi/webui/poll.py` — poller (extend with attach snapshotting)
- `pi/webui/backend/models.py` — Pydantic models (add TopologyNode, TopologyEdge, TopoEvent)
- `pi/webui/frontend/src/components/NetworkDiagram.tsx` — new component (you'll create)
