#!/usr/bin/env bash
# SUGI ASAYAKE — Oracle Cloud Always Free VM bootstrap (2026-09-13).
#
# Target: Ubuntu 24.04 in ap-tokyo-1 (x86 E2.1.Micro today; Ampere A1 when
# capacity allows), in the same VCN as the Always Free HeatWave MySQL DB
# system. Two roles: SSH jump host the laptops tunnel through to reach the
# DB (its endpoint is private-only), and -- on a big enough shape -- the app
# host (Node + pm2 + cloudflared). See docs/OCI-MIGRATION.md.
#
# Installs, idempotently: swap, ufw (22 only; the site leaves through the
# Cloudflare tunnel, no inbound web port), fail2ban, a MySQL client (for the
# Aiven -> HeatWave dump/restore), Node 22, pnpm, pm2, cloudflared.
# INSTALL_MYSQL=1 additionally installs a local MySQL server (fallback only).
#
# Usage, on the VM as the default `ubuntu` user:
#   sudo bash setup-vm.sh
set -euo pipefail

INSTALL_MYSQL="${INSTALL_MYSQL:-0}"
log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

log "System packages"
export DEBIAN_FRONTEND=noninteractive
# A stale Oracle MySQL repo entry from an earlier run (expired signing key)
# would make this very first update fail; clear it before anything else.
rm -f /etc/apt/sources.list.d/mysql.list
apt-get update -qq
apt-get install -y -qq curl gnupg lsb-release ufw fail2ban unzip ca-certificates jq git build-essential >/dev/null
timedatectl set-timezone Asia/Ulaanbaatar || true

# OCI instances ship without swap; 2G keeps a build, a dump or a model load
# from OOM-killing the app -- essential on the 1GB Micro shape.
if ! swapon --show | grep -q swapfile; then
  log "Swap (2G)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "MySQL client"
# Oracle rotates its apt repo signing key; the 2023 key EXPIRED in 2026 and
# apt then refuses the whole repo. Try the Oracle 8.4 repo with every key it
# publishes; if it still fails to verify, fall back to Ubuntu's 8.0 client --
# for a dump/restore either client is fine.
rm -f /etc/apt/sources.list.d/mysql.list /usr/share/keyrings/mysql.gpg
{ curl -fsSL https://repo.mysql.com/RPM-GPG-KEY-mysql-2025 2>/dev/null || true; curl -fsSL https://repo.mysql.com/RPM-GPG-KEY-mysql-2023 2>/dev/null || true; } | gpg --dearmor -o /usr/share/keyrings/mysql.gpg 2>/dev/null || true
echo "deb [signed-by=/usr/share/keyrings/mysql.gpg] http://repo.mysql.com/apt/ubuntu/ $(lsb_release -cs) mysql-8.4-lts" > /etc/apt/sources.list.d/mysql.list
if apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq mysql-client >/dev/null 2>&1; then
  echo "mysql-client from the Oracle 8.4 repo"
else
  echo "Oracle repo not verifiable -- using Ubuntu mysql-client"
  rm -f /etc/apt/sources.list.d/mysql.list /usr/share/keyrings/mysql.gpg
  apt-get update -qq
  apt-get install -y -qq mysql-client >/dev/null
fi
if [ "$INSTALL_MYSQL" = "1" ]; then
  apt-get install -y -qq mysql-server >/dev/null
  systemctl enable --now mysql >/dev/null
fi

log "Firewall (22 only; the site exits via cloudflared)"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
# OCI images carry an iptables REJECT rule ahead of ufw's chains -- the
# classic "opened the port, still times out". Removed so any future ufw rule
# behaves as written.
iptables -D INPUT -j REJECT --reject-with icmp-host-prohibited 2>/dev/null || true
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null

if ! command -v node >/dev/null; then
  log "Node 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
command -v pnpm >/dev/null || npm install -g pnpm@10 >/dev/null
command -v pm2 >/dev/null || npm install -g pm2 >/dev/null

if ! command -v cloudflared >/dev/null; then
  log "cloudflared"
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -qq && apt-get install -y -qq cloudflared >/dev/null
fi

log "DONE"
echo "node $(node -v) | pnpm $(pnpm -v) | pm2 $(pm2 -v) | cloudflared $(cloudflared --version 2>/dev/null | head -1) | $(mysql --version)"
echo "Next: docs/OCI-MIGRATION.md step 2 (dump Aiven -> HeatWave from this VM)."
