# Rithvik — FINAL prompts (Claude Code) · 31 Oct 04:30

> Replaces every older Rithvik prompt **and** the ChatGPT "final execution directive" where they conflict. `git pull` + fresh Claude Code session first (`/start <id>` … `/ship`).

**Locked rules (read CLAUDE.md top section):** one 60-minute timer; everyone starts on the first question set; submitting every question in a set (correct or not) allows "Unlock next questions", max 2; no level names in the candidate UI/API; AI help only on Adept/Master questions. Frontend on Vercel, backend + Docker + PostgreSQL on one cloud VM, `/api` rewritten same-origin. **Karthik: K5 ✅ → K11 → K8.  Rithvik: admission limit → K6 → R6b.**
PR base is always `vudigapranav/HFT26-TEAM-36` → `main`, never cbitosc. Never push to main, never `--no-verify`, never commit `.env`. Pranav's reviewer merges.

**Done & merged:** R0–R5, R3 (#29), R5-live (#34), R7 (#39), R6 (#40). **K5 is merged (Karthik, #44)** — `Ports.validateTask` is real; build on it.
**Left, in order:** 1) runner admission limit → 2) **K6 live generation** → 3) **R6b cloud VM + Vercel** (when Pranav gives the VM) → 4) support.
**Architecture decision (final):** backend runs on the HOST (no Docker socket in any container); treat it as a privileged service: loopback-only, behind Caddy HTTPS, systemd, firewall 443 + SSH only. Don't claim host Docker access removes host-compromise risk.

---

## 0. On the demo laptop (terminal, once — finishes R6)

```sh
git clone https://github.com/vudigapranav/HFT26-TEAM-36.git && cd HFT26-TEAM-36 && git config core.hooksPath .githooks && deploy/start.sh && deploy/verify.sh --outage
```
Paste the output into docs/status/rithvik.md.

---

## 1. Runner admission limit (`/start R9`, ≤30 min, branch rithvik/runner-admission)

```
Only runner/dockerRunner.ts + runner tests + your status file.
Process-wide limit on simultaneous Docker operations (one operation = worker + grader): default 2 (RUNNER_MAX_CONCURRENT), FIFO queue of max 8 (RUNNER_MAX_QUEUE). Queue full → unavailable "runner busy" (never a grade). AbortSignal while queued removes the entry and never starts Docker. Slots released exactly once on success, error and timeout. Shared across all runner factory instances in the process; document that it is process-local.
Tests (deterministic, fake docker CLI): 2 admitted, 3rd waits, FIFO order, queue-full rejection, abort while queued, error/timeout release, no slot leaks over repeated runs, two factory instances share the limit; existing R3 suites still pass; real-Docker check if available.
Nothing else in this PR. Then /ship.
```

---

## 2. K6 — live AI task generation (`/start K6`, branch rithvik/k6-generation)

```
Implement Ports.generateAssessment in src/backend/generation/generate.ts on top of the REAL merged K5 (Ports.validateTask, src/backend/generation/validate.ts) and your R4 client (Ports.chat). Read validate.ts first: it already checks schema, topics/imports (Python AST tools), format, leakage, reference 3× and starter F2P/P2P through R3, and the Master perf gate (perf test ids must match /performance|perf|large_window/).
STRUCTURED TESTS (non-negotiable): the model never writes test Python. It proposes data only, e.g. {"entrypoint": "app.summary:peak_requests", "cases": [{"args": [[2,7,3]], "visibility": "visible"}, ...]}. A FIXED trusted template in generation/ renders the pytest files (plain-data calls only — R3 harness format), and expected values come from RUNNING the reference through Ports.runTests — never from the model.
Pipeline: normalized profile + claimed topics + tier → versioned prompts in generation/prompts/ (portfolio text delimited as untrusted) → spec + reference files (<file path="..."> sections + small JSON header, parsed defensively) → structured cases (+ optional brute force for Karthik's differential gate) → expected outputs computed → starter derived deterministically (tools/mutate.py: off-by-one / flipped comparison / missing edge case for bug fixes; tools/stub.py for features) → 3-level hint ladder → validateTask → release only valid:true. Retry ≤3 with the failing gate's safe reason; then the seed task for that tier (never call it personalized). One task per tier.
Assistant: in llm/assistant.ts stop labelling task text "(trusted)" — generated titles/statements are lower-trust context; add narrow prompt-injection tests (malicious instruction inside a valid task statement).
Integration: Karthik's K11 runs generation as a background job and calls Ports.generateAssessment with a progress callback + AbortSignal; respect your runner admission limit; Featherless down or key missing → seed bank with ZERO LLM calls.
Tests (chat mocked): valid generation, malformed output, missing reference, unclaimed topic, unsupported format, model-supplied wrong expected values ignored, provider timeout, retries, seed fallback, cancellation, prompt injection. Plus `pnpm gen:smoke` — one real generation from tests/fixtures/portfolios/normal-web.json with LLM_EVAL_CAP_USD=0.20; record model, latency, tokens, cost and the receipt. Mocked tests are not live verification.
Then /ship.
```

---

## 3. R6b — cloud VM + Vercel (`/start R6b`, branch rithvik/r6b-cloud) — only when Pranav provides the VM

```
Architecture (final): Vercel frontend → /api rewrite over HTTPS → Caddy on an Ubuntu VM → Fastify on 127.0.0.1 as a systemd service under a dedicated user → PostgreSQL 16 in Compose bound to localhost → your R3 worker + grader containers → Featherless outbound only.
1. deploy/cloud/: setup guide + scripts (Docker Engine + Compose, Node 24 + pinned pnpm, Caddy auto-HTTPS, systemd unit, ufw: 443 + restricted SSH), .env with chmod 600 (never git), NODE_ENV=production, AUTH_ORIGIN=https://<vercel-app>, TRUST_PROXY=true (Karthik's K11), RUNNER=docker, FEATHERLESS_* from the VM .env.
2. vercel.json for Akshit (his folder — send him the exact file): {"rewrites":[{"source":"/api/:path*","destination":"https://<backend-host>/:path*"},{"source":"/(.*)","destination":"/index.html"}]}. No CORS, no secrets in the frontend.
3. Verify on the real VM + public Vercel URL: register/login, portfolio, quiz, assessment, unlocks, Run/Submit on Docker, assistant on a later question, report, restart backend → data still there (needs K11), Docker stopped → 503 and no grade, spoofed X-Forwarded-For can't bypass rate limits, no public Postgres/Docker. Record exact steps + results in your status file; never claim a deployment you didn't run.
Then /ship.
```

---

## 4. Only if time remains (`/start R8`)

Help Akshit connect the frontend on the VM/Vercel; re-run `pnpm llm:eval` against an Adept and a Master task (cap $0.10); speed up runs if one takes > 3 s (measure first).

## Deferred (write them in your status log as known limits; don't build now)
Featherless cost fallback when model metadata fails · `deploy/stop.sh` process ownership · cumulative IPC byte budget · prose-level answer leaks in the assistant.
