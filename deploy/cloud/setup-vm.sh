#!/usr/bin/env bash
# One-time (idempotent) setup of a fresh Ubuntu 24.04 VM for TorqueCode. Run as root:
#   BACKEND_HOST=api.example.com ACME_EMAIL=you@example.com AUTH_ORIGIN=https://app.vercel.app \
#   ADMIN_SSH_CIDR=203.0.113.4/32 bash deploy/cloud/setup-vm.sh
# NOT YET RUN on a real VM (no VM provided at the time of writing). See deploy/cloud/README.md.
set -euo pipefail
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
say() { printf '==> %s\n' "$*"; }
[ "$(id -u)" = 0 ] || die "run as root (sudo -i)"
. /etc/os-release; [ "${ID:-}" = ubuntu ] || die "Ubuntu required (found ${ID:-unknown})"
: "${BACKEND_HOST:?set BACKEND_HOST (DNS A record -> this VM)}"
: "${ACME_EMAIL:?set ACME_EMAIL}"
: "${AUTH_ORIGIN:?set AUTH_ORIGIN (https://<vercel-app>)}"
: "${ADMIN_SSH_CIDR:?set ADMIN_SSH_CIDR (your IP/32); SSH is closed to everyone else}"
case "$AUTH_ORIGIN" in https://*) ;; *) die "AUTH_ORIGIN must be https://";; esac
REPO_URL="${REPO_URL:-https://github.com/vudigapranav/HFT26-TEAM-36.git}"
APP=/opt/torquecode

say "Packages: Docker Engine + Compose, Node 24, Caddy, Python 3, ufw"
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg git ufw python3 debian-keyring debian-archive-keyring apt-transport-https
install -m 0755 -d /etc/apt/keyrings
[ -f /etc/apt/keyrings/docker.asc ] || curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
[ -f /etc/apt/keyrings/nodesource.gpg ] || curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
[ -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ] || curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -q
apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin nodejs caddy
systemctl enable --now docker

say "Firewall: 443 open, SSH only from $ADMIN_SSH_CIDR, everything else closed"
ufw --force reset >/dev/null
ufw default deny incoming; ufw default allow outgoing
ufw allow 443/tcp
ufw allow from "$ADMIN_SSH_CIDR" to any port 22 proto tcp
ufw --force enable
# Docker publishes ports through iptables and bypasses ufw: PostgreSQL is bound to 127.0.0.1 in
# deploy/docker-compose.yml, and runner containers publish nothing (--network none).

say "Service user and checkout"
id torquecode >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/torquecode --shell /usr/sbin/nologin torquecode
usermod -aG docker torquecode  # needed to start runner containers; root-equivalent on this VM
[ -d "$APP/.git" ] || git clone "$REPO_URL" "$APP"
chown -R torquecode:torquecode "$APP"
run_as() { sudo -u torquecode -H "$@"; }

say "Database (Compose, 127.0.0.1 only), runner image, build, migrations (deploy/start.sh steps)"
if [ ! -f "$APP/deploy/.env" ]; then
  PASSWORD="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  sed "s/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=$PASSWORD/" "$APP/deploy/.env.example" > "$APP/deploy/.env"
  chown torquecode:torquecode "$APP/deploy/.env"; chmod 600 "$APP/deploy/.env"
fi
. <(grep -E '^(POSTGRES_PASSWORD|POSTGRES_PORT)=' "$APP/deploy/.env")
run_as docker compose -f "$APP/deploy/docker-compose.yml" --env-file "$APP/deploy/.env" up -d --wait postgres
run_as docker build -t torquecode-runner-python:dev "$APP/src/backend/runner/images/python"
( cd "$APP" && run_as npx -y pnpm@11.25.0 install --frozen-lockfile --ignore-scripts && run_as npx -y pnpm@11.25.0 build )
DATABASE_URL="postgres://torquecode:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-54329}/torquecode"
( cd "$APP/src/backend" && run_as env DATABASE_URL="$DATABASE_URL" node dist/api/db/command.js )

say "Secrets: /etc/torquecode/backend.env (root:torquecode 640)"
install -d -m 750 -o root -g torquecode /etc/torquecode
if [ ! -f /etc/torquecode/backend.env ]; then
  sed -e "s#^AUTH_ORIGIN=.*#AUTH_ORIGIN=${AUTH_ORIGIN}#" -e "s#^DATABASE_URL=.*#DATABASE_URL=${DATABASE_URL}#" \
    "$APP/deploy/cloud/backend.env.example" > /etc/torquecode/backend.env
fi
chown root:torquecode /etc/torquecode/backend.env; chmod 640 /etc/torquecode/backend.env
grep -q '^FEATHERLESS_API_KEY=.' /etc/torquecode/backend.env || echo "NOTE: add FEATHERLESS_API_KEY to /etc/torquecode/backend.env (AI is off until then)"

say "Caddy (HTTPS) and the backend service"
# The secret is kept across reruns (Vercel holds a copy); rotate only with ROTATE_PROXY_SECRET=1.
. "$APP/deploy/cloud/proxy-secret.sh"
ensure_proxy_secret /etc/caddy/torquecode.env "${ROTATE_PROXY_SECRET:-0}"
install -d -m 750 /etc/caddy
cp "$APP/deploy/cloud/Caddyfile" /etc/caddy/Caddyfile
cat > /etc/caddy/torquecode.env <<EOF
BACKEND_HOST=${BACKEND_HOST}
ACME_EMAIL=${ACME_EMAIL}
PROXY_SECRET=${PROXY_SECRET}
EOF
chmod 640 /etc/caddy/torquecode.env; chown root:caddy /etc/caddy/torquecode.env
install -d -m 755 /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironmentFile=/etc/caddy/torquecode.env\n' > /etc/systemd/system/caddy.service.d/torquecode.conf
install -d -o caddy -g caddy /var/log/caddy
cp "$APP/deploy/cloud/torquecode-backend.service" /etc/systemd/system/torquecode-backend.service
systemctl daemon-reload
systemctl enable --now torquecode-backend
systemctl restart caddy

say "Local health"
. "$APP/deploy/cloud/health.sh"
wait_backend_health http://127.0.0.1:3001/health || die "backend not healthy: journalctl -u torquecode-backend"
echo
if [ "$PROXY_SECRET_STATE" = existing ]; then
  echo "Proxy secret unchanged (kept from /etc/caddy/torquecode.env). Rotate with ROTATE_PROXY_SECRET=1."
else
  echo "Proxy secret ${PROXY_SECRET_STATE}. Set it in the Vercel project (Akshit) as TORQUECODE_PROXY_SECRET, then redeploy:"
  echo "  ${PROXY_SECRET}"
  echo "Stored in /etc/caddy/torquecode.env (root:caddy 640). It is printed only when generated or rotated."
  [ "$PROXY_SECRET_STATE" = rotated ] && echo "Until Vercel is updated, every request is refused (403)."
fi
