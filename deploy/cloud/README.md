# TorqueCode cloud deployment (R6b): Vercel frontend + one Ubuntu VM

> **Status: prepared, NOT deployed.** No VM had been provided when this was written. Nothing here has run on a
> real VM or a public URL. Record real results in `docs/status/rithvik.md` once it has.

```text
browser ─HTTPS─▶ Vercel (frontend; middleware adds X-TorqueCode-Proxy; rewrite /api/* ─▶ https://<backend-host>/*)
                   │ HTTPS
                   ▼
           Caddy :443 on the VM (auto-HTTPS; requests WITHOUT the proxy secret get 403)
                   │ 127.0.0.1:3001
                   ▼
           Fastify backend (systemd, user torquecode, NODE_ENV=production)
             ├─▶ PostgreSQL 16 (Compose, 127.0.0.1:54329, volume torquecode-pgdata)
             ├─▶ docker CLI ─▶ worker + grader containers per Run/Submit (R3; no network, no socket)
             └─▶ api.featherless.ai (outbound HTTPS)
```

## Security model (read before deploying)

- **No Docker socket in any container.** The backend runs on the host and uses the local docker CLI.
- **The `torquecode` user is in the `docker` group, so it is effectively root on this VM.** A compromised backend
  process means a compromised VM. Use a **dedicated** VM with nothing else on it. Running the backend on the host
  doesn't remove that risk; it only keeps it out of a web-facing container. Rootless Docker would need cgroup v2
  delegation to keep R3's CPU, memory and pid limits working; it hasn't been tried.
- **Firewall:** only 443/tcp from anywhere, and 22/tcp from `ADMIN_SSH_CIDR`. PostgreSQL is bound to
  127.0.0.1 by Compose (Docker port publishing bypasses ufw, so loopback binding is the real control). The backend
  listens on 127.0.0.1 only (`api/config.ts` refuses anything else).
- **Trusted proxy chain:** Caddy accepts only requests that carry `X-TorqueCode-Proxy: <secret>`, which Vercel's
  middleware adds. It strips that header and sets `X-Forwarded-For` from Vercel's `X-Real-IP`. Direct traffic to the
  VM gets 403, so nobody can forge client IPs to get around the login rate limit.
  - **Blocker (Karthik, K11):** the backend must read the client IP only when `TRUST_PROXY` is set, trusting exactly
    one hop (Caddy on 127.0.0.1). Without it, every user shares one IP and the auth rate limiter blocks them.
- **Cookies:** `AUTH_ORIGIN=https://<vercel-app>` turns on `__Host-tc_session`, Secure, HttpOnly, SameSite=Lax. The
  browser only ever talks to the Vercel origin (first-party), with no CORS.
- **Secrets:** `/etc/torquecode/backend.env` (root:torquecode 640) and `/etc/caddy/torquecode.env` (root:caddy 640).
  Never in git, never in the frontend. The proxy secret also lives in Vercel's project env.
  - **Access log:** Caddy logs request headers. It redacts `Cookie`/`Authorization` itself, but not our proxy secret,
    so the Caddyfile's log `format filter` deletes `X-Torquecode-Proxy` from every log entry. (Tested locally with
    Caddy: before the filter the secret appeared in clear; after it, 0 occurrences in the log.)
  - **Reruns keep the secret:** `setup-vm.sh` reuses the `PROXY_SECRET` already in `/etc/caddy/torquecode.env`, so a
    rerun doesn't break Vercel. To rotate it on purpose, run `ROTATE_PROXY_SECRET=1 bash setup-vm.sh`, then update
    Vercel and redeploy straight away: every request gets 403 until you do. Tests: `bash deploy/cloud/test-proxy-secret.sh`.

## Prerequisites

1. An Ubuntu 24.04 VM: 4 vCPU, 8 GB RAM, 40 GB disk recommended (each Run/Submit uses two containers; the default
   admission limit is 2 concurrent).
2. A DNS A record `<backend-host>` pointing at the VM, and port 443 reachable (Let's Encrypt TLS-ALPN challenge).
3. The Vercel production URL (Akshit).

## Install (on the VM, as root)

```bash
git clone https://github.com/vudigapranav/HFT26-TEAM-36.git /opt/torquecode
BACKEND_HOST=<backend-host> ACME_EMAIL=<you@example.com> AUTH_ORIGIN=https://<vercel-app> \
  ADMIN_SSH_CIDR=<your-ip>/32 bash /opt/torquecode/deploy/cloud/setup-vm.sh
```

Then add `FEATHERLESS_API_KEY` (and `TRUST_PROXY` once K11 ships it) to `/etc/torquecode/backend.env` and run
`systemctl restart torquecode-backend`. The script prints the proxy secret only when it generates or rotates one:
put it in Vercel.

## Vercel (Akshit's folder: send him these, don't edit `src/frontend` yourself)

- `src/frontend/vercel.json`: see `deploy/cloud/vercel.json.example` (rewrite `/api/:path*` and the SPA fallback).
- `src/frontend/middleware.ts` + `src/frontend/torquecode-proxy-headers.mjs` (Vercel Routing Middleware): copy
  `deploy/cloud/vercel/middleware.ts` and `deploy/cloud/vercel/torquecode-proxy-headers.mjs`, add `@vercel/functions`,
  and set the env var `TORQUECODE_PROXY_SECRET` (Production). For each `/api/*` request it:
  - takes the client IP only from `ipAddress(request)` (`@vercel/functions`), the platform-provided value. Vercel's
    docs say it overwrites `X-Forwarded-For` and doesn't forward external IPs, to prevent spoofing;
  - deletes every client-sent forwarding header (`forwarded`, `x-forwarded-for`, `x-real-ip`, `true-client-ip`,
    `cf-connecting-ip`, `x-client-ip`, …) and any client-sent `x-torquecode-proxy`, then sets `x-real-ip` and
    `x-forwarded-for` to that single IP and adds the secret;
  - fails closed (503) if the secret is missing, or with 400 if there is no valid platform IP. It never forwards a guess.

  Tests (no Vercel needed): `node --test deploy/cloud/vercel/torquecode-proxy-headers.test.mjs`. **Still to verify on
  the real deployment** (the docs don't explicitly cover an external rewrite destination): the headers set by the
  middleware actually reach Caddy (`/health` through Vercel gives 200, not 403), and a request sent through Vercel with
  a forged `X-Forwarded-For` is logged by Caddy with the real client IP.
- The frontend calls relative `/api/...` only. Render generated task `title`/`statement_md` as sanitized markdown,
  never raw HTML.

## Operate

| Task | Command (on the VM) |
|---|---|
| Status / logs | `systemctl status torquecode-backend`, `journalctl -u torquecode-backend -f`, `/var/log/caddy/torquecode.log` |
| Deploy a new version | `cd /opt/torquecode && sudo -u torquecode git pull && sudo -u torquecode npx -y pnpm@11.25.0 install --frozen-lockfile --ignore-scripts && sudo -u torquecode npx -y pnpm@11.25.0 build && systemctl restart torquecode-backend` (assessments in memory are lost until K11) |
| Migrations | re-run the `node dist/api/db/command.js` step from `setup-vm.sh` |
| DB backup | `docker exec torquecode-postgres-1 pg_dump -U torquecode torquecode > /root/torquecode-$(date +%F).sql` |
| Runner image | `sudo -u torquecode docker build -t torquecode-runner-python:dev /opt/torquecode/src/backend/runner/images/python` |
| Leftover containers | `docker ps -aq --filter label=torquecode.runner=1 \| xargs -r docker rm -f` |

Recovery: if Docker stops, Runs return 503 (never a grade); `systemctl restart docker torquecode-backend`. If the
backend fails to start, it's almost always `backend.env` (AUTH_ORIGIN must be https and match Vercel exactly) or
PostgreSQL being down (`docker compose -f /opt/torquecode/deploy/docker-compose.yml --env-file /opt/torquecode/deploy/.env up -d`).

Local setup-health regression checks: `bash deploy/cloud/test-health.sh` (success, retry, exhausted failure).

## Verification checklist (only on the real VM + public Vercel URL; record actual results)

1. On the VM: `curl -fsS http://127.0.0.1:3001/health` shows `runner_available:true`; `BACKEND_PORT=3001 deploy/verify.sh --outage` gives 31/31.
2. From outside: `curl -s -o /dev/null -w '%{http_code}' https://<backend-host>/health` gives **403** (no secret);
   `nc -z <vm-ip> 54329`, `nc -z <vm-ip> 3001` and `nc -z <vm-ip> 2375` all closed.
3. Clean browser on `https://<vercel-app>`: register → login (cookie is `__Host-tc_session`, Secure, HttpOnly) →
   portfolio → quiz → assessment → Run/Submit on Docker → unlock → assistant on a later question → report.
4. A second account can't read the first account's report (404). Responses contain no hidden tests, references or hints.
5. Restart the backend and check the data is still there (**needs K11 persistence**).
6. `systemctl stop docker`, then Run gives 503 and no grade; start Docker again.
7. Repeated logins with a forged `X-Forwarded-For` sent straight to the VM get 403 (Caddy); through Vercel, the rate
   limit applies per real client IP (**needs K11 TRUST_PROXY**).
8. `curl -H 'X-Forwarded-For: 6.6.6.6' https://<vercel-app>/api/health`, then check `/var/log/caddy/torquecode.log`:
   `X-Real-Ip` is your real IP, not 6.6.6.6, and `grep -c "$PROXY_SECRET" /var/log/caddy/torquecode.log` gives 0.
9. Rerun `setup-vm.sh` (no rotation): it reports "Proxy secret unchanged" and requests through Vercel still give 200.
