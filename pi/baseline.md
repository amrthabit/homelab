# Pi 5 Baseline (fresh DietPi install)

Captured: 2026-05-01, ~22 min uptime

## Hardware
| | |
|---|---|
| Model | Raspberry Pi 5 Model B Rev 1.0 |
| CPU | 4-core ARM Cortex-A76, max 2.4GHz |
| RAM | 8GB |
| Storage | 128GB SD card |
| MAC (eth0) | 2c:cf:67:0a:97:12 |

## OS
| | |
|---|---|
| Distro | Debian GNU/Linux 13 (trixie) |
| DietPi | v10.3.3 |
| Kernel | 6.12.75+rpt-rpi-v8 aarch64 |

## Baseline Resource Usage
| Resource | Value |
|---|---|
| CPU temp | 49.9°C (idle) |
| RAM used | 184MB / 7.8GB (2.4%) |
| RAM available | 7.6GB |
| Swap | none |
| Disk used | 1.4GB / 119GB (2%) |
| Load average | 0.05, 0.17, 0.13 |

## Running Services (fresh)
- `ssh` — OpenSSH server
- `cron` — task scheduler
- `getty@tty1` — console login
- `systemd-journald` — logging
- `systemd-udevd` — device manager

## Network (fresh)
- `eth0` — 192.168.2.175/24 (DHCP from Gigahub), UP
- `wlan0` — disabled (onboard wifi disabled in config.txt)

## Notes
- No swap configured (DietPi default)
- EEPROM update pending (reboot to apply: 2025-12-08 build)
- Dropbear uninstalled, OpenSSH active on port 22
- SSH key auth configured for root
