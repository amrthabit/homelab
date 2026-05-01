#!/bin/bash
# Runs on first boot of DietPi via /boot/Automation_Custom_Script.sh hook.
# Installs VLAN networking with safe DHCP fallback.

set -e

apt-get update
apt-get install -y vlan

modprobe 8021q
grep -qxF '8021q' /etc/modules || echo '8021q' >> /etc/modules

# Main /etc/network/interfaces — minimal, with DHCP fallback on eth0
cat > /etc/network/interfaces << 'EOF'
# Managed by homelab/pi/Automation_Custom_Script.sh
source interfaces.d/*

# eth0 falls back to DHCP on untagged ports (e.g. plugged into Gigahub directly)
allow-hotplug eth0
iface eth0 inet dhcp
EOF

# VLAN sub-interfaces — only get traffic on a tagged trunk port
cat > /etc/network/interfaces.d/vlans << 'EOF'
# VLAN 10 — uplink (Gigahub subnet, Pi management)
auto eth0.10
iface eth0.10 inet static
    address 192.168.2.2
    netmask 255.255.255.0
    gateway 192.168.2.1
    vlan-raw-device eth0

# VLAN 20 — IoT (Pi is gateway, no WAN by default)
auto eth0.20
iface eth0.20 inet static
    address 192.168.20.1
    netmask 255.255.255.0
    vlan-raw-device eth0

# VLAN 30 — trusted wired (Pi is gateway, full WAN)
auto eth0.30
iface eth0.30 inet static
    address 192.168.30.1
    netmask 255.255.255.0
    vlan-raw-device eth0
EOF

# IP forwarding for inter-VLAN routing
grep -qxF 'net.ipv4.ip_forward=1' /etc/sysctl.conf || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf

# Authorise SSH key for root (paste your laptop key in advance)
mkdir -p /root/.ssh
chmod 700 /root/.ssh
cat > /root/.ssh/authorized_keys << 'EOF'
__SSH_PUBKEY__
EOF
chmod 600 /root/.ssh/authorized_keys

echo "Setup complete. Reboot to apply."
