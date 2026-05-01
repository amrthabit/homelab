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
- `/etc/network/interfaces` — minimal: `source interfaces.d/*` + `allow-hotplug eth0` + `iface eth0 inet dhcp` (rescue fallback).
- `/etc/network/interfaces.d/vlans` — VLAN sub-interfaces only, no `iface eth0` stanza. Added `metric 100` on eth0.10's gateway so eth0's DHCP route is preferred when both have a gateway to 192.168.2.1.
- Behaviour:
  - On Gigahub direct: eth0 gets DHCP IP, gateway via DHCP. SSH works at the DHCP'd IP. eth0.10 has static IP but no real traffic (no VLAN tags coming in).
  - On switch trunk port 3: eth0 DHCP fails (PVID 1 = VLAN 1, no DHCP server). eth0.10 has static `192.168.2.2` and gateway `192.168.2.1`. SSH at `.2`.

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
- VLAN sub-interfaces will conflict with eth0 DHCP if both come up on the same subnet (192.168.2.x). Mitigated with `metric 100` but worth watching for routing weirdness.
- Reserve `192.168.2.2` on Gigahub DHCP so it's never handed to another device.
