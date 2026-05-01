# Disaster recovery

What to do if a device dies and you have to rebuild it from scratch.

## What's automatically backed up

`pi/backup.sh` runs daily (systemd timer `homelab-backup.timer` at 03:00) and
auto-commits the snapshot into `pi/backups/<date>/` plus a `latest/` symlink.

It captures:
- `state.json` — webui toggles, per-MAC allowlist/blocklist
- `uptime.db.gz` — full sqlite of samples + metrics (compressed)
- `nftables-current.nft` — live firewall ruleset (output of `nft list ruleset`)
- `ip-addr.txt`, `ip-route.txt` — current network state
- `dnsmasq.leases` — what was online at the time
- `gigahub.json` — every Gigahub config tree we have admin access to (firewall,
  NAT/port mappings, DNS, UPnP, Wi-Fi radios + SSIDs + APs, Hosts, Ethernet
  interfaces, IP interfaces, PPP)

## Recovery scenarios

### Pi dies (replace SD card or whole device)

1. Flash a new SD card with **DietPi 64-bit** (same image we've used).
2. Boot, log in, set up SSH (default password in `secrets.env`), copy your laptop's pubkey.
3. Install git: `apt-get install -y git`.
4. `git clone https://github.com/amrthabit/homelab /opt/homelab` (or whatever your origin is).
5. Restore secrets: `scp secrets.env root@<pi>:/opt/homelab/secrets.env` (kept locally / in a password manager — see below).
6. Run `/opt/homelab/pi/webui/deploy.sh` once. It installs venv + npm + builds + sets up systemd units.
7. Restore Pi state: copy `pi/backups/latest/state.json` and `uptime.db.gz` into `/var/lib/homelab/` (gunzip the db). Then `systemctl restart homelab-ui`.
8. Set the same DHCP reservation on Gigahub: MAC `2c:cf:67:0a:97:12` → `192.168.2.10`. (If the new Pi has a different MAC, adjust the reservation and `pi/webui/backend/config.py STATIC_DEVICES`.)

### TL-SG108E switch dies

The switch holds VLAN/PVID config in NVRAM. We don't have a programmatic
export — TP-Link's "Easy Smart" line only exports via the Windows config tool.

**Manual export to repo (do this when convenient)**:
1. TP-Link Easy Smart Configuration Utility (Windows app)
2. Discover device → Backup config → save the `.cfg` to `pi/backups/switch/tl-sg108e.cfg`
3. Commit.

**To restore from scratch using just the journal**:

| Setting | Value |
|---|---|
| Admin URL | `http://192.168.2.153` |
| 802.1Q VLAN | enabled |
| VLAN 1 (Default) | members: ports 6, 7, 8 (untagged) |
| VLAN 10 (Uplink) | members: port 1 (untagged), port 3 (untagged), port 8 (untagged) |
| VLAN 20 (IoT) | members: port 2 (untagged), port 3 (tagged) |
| VLAN 30 (Trusted) | members: port 3 (tagged), port 4 (untagged), port 5 (untagged) |

PVIDs:
- Port 1 → 10 (Gigahub LAN)
- Port 2 → 20 (Nest Wi-Fi)
- Port 3 → 1 (Pi trunk — receives tagged frames)
- Port 4 → 30 (ThinkPad / HA)
- Port 5 → 30 (OptiPlex)
- Port 6, 7 → 1 (spare)
- Port 8 → 1 (mgmt)

After applying, hit **Save Config** (top-right), or settings are lost on reboot.

### Gigahub factory-reset

Bell-managed device. Things to redo:
1. **Wi-Fi**: enable band-split if needed; set SSIDs `Near5G` (5 GHz primary), `Quattro` (guest), `Near6G` etc. Passwords: see `secrets.env` (or just reset to whatever).
2. **DHCP reservation**: Tools & settings → My devices → Pi MAC `2c:cf:67:0a:97:12` → reserved IP `192.168.2.10`.
3. **Disabling features that conflict**: keep the Bell Wi-Fi pods/Bell Wi-Fi app feature OFF if you've enabled per-band SSIDs (it'll merge them back).
4. **Static route** (if you set one): not currently used — VLAN 30 is reachable via the Pi's `192.168.2.10` because each laptop adds a per-host static route. If you want a global solution: `route 192.168.30.0/24 via 192.168.2.10` on the Gigahub if it has the field.

The `gigahub.json` daily backup is a read-only diff reference — handy for "what
was the Wi-Fi password I had set?" but not directly importable.

### Home Assistant / ThinkPad

Not in this repo. HA OS has its own backup feature: Settings → System →
Backups → enable automatic + cloud backup. **Configure that separately.**

### secrets.env

Currently lives only in `C:/Users/athabit/repos/homelab/secrets.env` (Windows
laptop) and `/opt/homelab/secrets.env` (Pi). If you lose both, you lose:
- Pi root password (recoverable via SD card edit)
- Switch admin password (recoverable via factory reset)
- Gigahub admin password (printed on the router sticker — recoverable)
- HA OS amr/9823 (recoverable via HA OS recovery)

**Recommended**: drop a copy in your password manager (Bitwarden / 1Password / etc.)
or sync to a cloud-encrypted location. Treat it as a recovery document.

## Verifying a backup

After the timer fires once (next 03:00 or run `systemctl start homelab-backup`
manually), check `pi/backups/<today>/`:
- `state.json` should have your current toggles
- `uptime.db.gz` should be a few MB
- `gigahub.json` should be ~50KB+ of JSON

If `gigahub.json` is missing or all errors, the systemd unit didn't get the
EnvironmentFile (check `/opt/homelab/secrets.env` exists and has
`GIGAHUB_ADMIN_USER`/`GIGAHUB_ADMIN_PASS`).

## Manual backup right now

```
sudo /opt/homelab/pi/backup.sh
```
