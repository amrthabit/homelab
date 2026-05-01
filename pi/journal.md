# Pi setup journal — what worked and what didn't

## DietPi flash
- Used Raspberry Pi Imager → DietPi 64-bit (2026-04-20) on 128GB SD
- Worked. Took ~10 min for first-boot setup including dist-upgrade.
- Picked Pi 4 in imager despite hardware being Pi 5 — fine, kernel detects correctly.
- DietPi-Software wizard: switched SSH server from Dropbear → OpenSSH. Recommended.
- EEPROM update auto-staged on first boot, applied next reboot.

## SSH key auth
- `ssh-copy-id -i ~/.ssh/id_ed25519.pub root@<pi>` — worked first try.
- Did NOT disable password auth yet (user preference for fallback).

## VLAN networking — multiple failed attempts before reaching working config

### Attempt 1: `iface eth0 inet manual` in drop-in
- Wrote `/etc/network/interfaces.d/vlans` with `iface eth0 inet manual` + VLAN sub-interfaces.
- Conflict with main file's `iface eth0 inet dhcp` (loaded *after* the source).
- Result: eth0 still tried DHCP, ambiguous behaviour.

### Attempt 2: comment out main file's dhcp stanza
- `sed -i 's/^iface eth0 inet dhcp/#iface eth0 inet dhcp/' /etc/network/interfaces`
- Removed the DHCP fallback completely. **Lesson: never remove the rescue path.**
- Pi unreachable on Gigahub directly *and* on switch trunk port. Stranded.

### Recovery
- WSL `wsl --mount` failed: "Removable media cannot be set to offline" — known WSL2 limit on USB SD readers.
- Tried PCIE card reader (Realtek) and USB SD adapter (`Generic MassStorageClass`): both blocked by `Set-Disk -IsOffline` rejection.
- Solution: **Paragon Linux File Systems for Windows** trial via `winget install Paragon.LinuxFileSystems`. Mounted ext4 partition as G: drive. Edited `/etc/network/interfaces` and `/etc/network/interfaces.d/vlans` directly from Windows.

### Final working config
- `/etc/network/interfaces` — minimal: `source interfaces.d/*` + `allow-hotplug eth0` + `iface eth0 inet dhcp`.
- `/etc/network/interfaces.d/vlans` — only eth0.20 and eth0.30 sub-interfaces. **No eth0.10** — it conflicts with eth0 (both on 192.168.2.x).
- Switch port 3 changed: PVID 10 (was 1), untagged member of VLAN 10 (was tagged). Pi's eth0 untagged traffic flows on VLAN 10 → reaches Gigahub for DHCP.
- DHCP reservation on Gigahub: MAC `2c:cf:67:0a:97:12` → `192.168.2.10` (Gigahub range starts at .10, can't use .2).
- Behaviour:
  - On switch port 3: eth0 gets `.10` via DHCP through VLAN 10 trunk. eth0.20/30 work with tagged traffic.
  - On Gigahub direct: eth0 gets `.10` via DHCP (same reservation). eth0.20/30 still up but unused (no VLAN tags from Gigahub).
  - Stable management at `192.168.2.10` regardless of where Pi is plugged in.

## Switch (TL-SG108E)
- Default switch IP: assigned by Gigahub DHCP (`192.168.2.153`). Default login `admin`/`admin`. Changed admin password.
- 802.1Q VLAN enabled. Created VLANs 10/20/30. Cleaned up VLAN 1 to `port 8` only.
- PVID: P1=10, P2=20, P3=1 (trunk), P4=30, P5=30, P6-7=1, P8=1.
- **Critical**: hit "Save Config" button after changes, otherwise lost on reboot.
- "Leak" lesson: a port can only be untagged in *one* VLAN. Port 8 was originally untagged in both VLAN 1 and VLAN 10 — fixed by setting it Not Member of VLAN 10.

## Windows networking gotchas
- Network Bridge at 192.168.2.41 (created during earlier USB ethernet adapter troubleshooting) intercepted 192.168.2.x routing — caused "Destination host unreachable" replies that looked like the Pi was offline.
- Removed via `ncpa.cpl` → right-click → Delete.

## Open / pending
- dnsmasq for VLAN 20 and 30 DHCP
- Pi-hole for DNS + visibility
- ntopng for traffic dashboards
- MAC registry + Flask approval UI

## Lessons
- **Always keep a DHCP fallback on eth0** so the Pi is never stranded.
- **A port can only be untagged in one VLAN.** Untagged in two = traffic leaks.
- **Same-subnet IPs on parent + VLAN sub-interface = broken routing.** Either pick different subnets or drop the VLAN sub-interface for that VLAN.
- **Paragon Linux File Systems writes are buffered.** Always check that changes actually persisted after eject — verify by re-reading the file from inside Linux.
- **Removable USB SD readers can't be `wsl --mount`** ed because Windows refuses `Set-Disk -IsOffline` on removable media.
- **Windows ARP cache** is sticky — `Remove-NetNeighbor -IPAddress X -Confirm:$false` (admin) when an IP changes hands.

## Verified
- 2026-05-01: nftables + IP forwarding live (`pi/nftables.conf`). VLAN 30 → internet via NAT, VLAN 20 default-deny WAN, no IoT lateral to trusted. Persisted via `systemctl enable nftables`. Applied with a 60s safety auto-flush in case of lockout.
- 2026-05-01: Fallback works. Pi reachable at `192.168.2.10` from both switch port 3 (trunk) and a Gigahub LAN port directly. Same DHCP reservation, same management IP either way. No ARP flush needed when moving between ports (only needed earlier when the IP itself changed).
