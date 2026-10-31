# TorqueCode — *Put your code under torque.*

> **Team PAARK · `HFT26-TEAM-36` · CBIT Hacktoberfest '26**
> Problem statement: **Portfolio-Driven Adaptive Coding & Technical Assessment Platform**

📊 **Pitch deck:** [`docs/TorqueCode_Pitch.pptx`](docs/TorqueCode_Pitch.pptx) · 📖 **Product context:** [`docs/TorqueCode_Context.md`](docs/TorqueCode_Context.md) · ▶️ **Run it:** [Quick start](#-quick-start)

---

## 📋 Team Information

| Attribute | Details |
| :--- | :--- |
| **Team Name** | **PAARK** |
| **Team Number** | `TEAM-36` (`HFT26-TEAM-36`) |
| **Registration ID** | `HFEST26-EHPLQEBX` |
| **Problem Statement** | Portfolio-Driven Adaptive Coding & Technical Assessment Platform |
| **Team Leader** | Vudiga Pranav (vudigapranav@gmail.com) |
| **Institution** | CBIT Hyderabad |

| Member | Role |
| :--- | :--- |
| **Vudiga Pranav** | Team lead, repo owner and PR merges; portfolio intake, onboarding quiz, AI efficiency score, report builder |
| **Venkata Karthik Samula** | Backend lead: API, database, auth, sessions, contracts, seed bank, generation + validation engine, integration |
| **K Rithvik Reddy** | Docker sandbox runner, Featherless client, guarded assistant + hints, deployment |
| **D Akshit Taran** | Frontend: UI, user flows, frontend integration |
| **M Aryan Sai Tej** | Pitch and presentation; seed-bank tasks |

---

## 🎯 The problem

Coding assessments use static questions that ignore what a candidate has actually built, and AI coding tools make it hard to tell whether candidates really understand the skills on their own portfolios.

## 💡 Our solution

**TorqueCode** makes candidates prove their portfolio claims. It reads a structured JSON portfolio, works out the candidate's domain (Web, ML, Security, Backend) and the DSA topics they claim, and puts them inside a **small, realistic, multi-file codebase** where they fix bugs or build features. That's not LeetCode from a blank file. **Every grade comes from deterministic tests, never from an LLM's opinion.**

TorqueCode is an **assessment** platform, not a learning platform: the report shows what the candidate knows, how well, and where they're weak.


## 🔁 How it works

1. **Sign in** and upload your portfolio as **JSON or a text PDF** (the PDF is turned into JSON in your browser for you to check).
2. A short **focus quiz** narrows what to test, only within the skills you claimed.
3. **Questions are prepared** from your own projects: TorqueCode reads the features you describe (orders, logs, datasets, …), picks matching reviewed coding tasks that use only your claimed DSA topics, and verifies every task before you see it.
4. **One 60-minute session** in fullscreen: everyone starts on the first question set; submit every question to unlock the next (at most two unlocks). Later sets add hints and a guarded AI assistant that never gives the answer.
5. **Run** checks visible tests; **Submit** grades with hidden tests in an isolated Docker sandbox.
6. The **report** shows tests fixed, time, hints, the AI-efficiency score, claims vs demonstrated, focus areas and integrity signals (tab switches, fullscreen exits, time away).

**Every grade comes from deterministic tests, never from an LLM.** The AI only chooses among pre-verified tasks and gives guarded hints.

## 🏗️ Architecture

```
Browser (React + Vite + Monaco)
   │  /api/*  (same origin; Vercel rewrite in production)
   ▼
Fastify API (TypeScript) ── PostgreSQL 16
   ├── Docker runner: Python 3.13 + pytest, split trusted grader / untrusted worker, no network
   ├── K5 validation: independent oracles, reference ×3, starter regression, receipts cache
   └── Featherless AI (Qwen): task selection from a verified shortlist + guarded assistant
```

## 🚀 Quick start

**You need:** Docker Desktop (running), Node.js 24.22.1+, git. pnpm is fetched automatically through `npx`.

```bash
git clone https://github.com/vudigapranav/HFT26-TEAM-36.git
cd HFT26-TEAM-36
```

**1. Add your own API keys (optional but recommended).** Create a `.env` file in the repo root. It is git-ignored; never commit it.

```bash
cp .env.example .env
```

Then fill in your own keys:

| Variable | Needed for | Where to get it |
| :--- | :--- | :--- |
| `FEATHERLESS_API_KEY` | AI task selection and the guarded assistant | your account at [featherless.ai](https://featherless.ai) |
| `E2B_API_KEY` | only if you run code in E2B cloud sandboxes instead of Docker (`RUNNER=e2b`) | your account at [e2b.dev](https://e2b.dev) |

Without a Featherless key everything still works: questions fall back to the verified bank, hints still work, and the assistant shows a clear "unavailable" message.

**2. Start the backend** (PostgreSQL in Docker, the sandbox image, database migrations, API on `127.0.0.1:3001`):

```bash
deploy/start.sh
```

**3. Start the website** (in a second terminal):

```bash
npx pnpm@11.25.0 web:serve
```

**4. Open** <http://127.0.0.1:4177/#/register>. Use `127.0.0.1`, not `localhost` (the backend only accepts that exact origin).

| Task | Command |
| :--- | :--- |
| Check the whole stack | `deploy/verify.sh` |
| Restart after pulling changes | `deploy/start.sh --restart` |
| Stop (data kept) | `deploy/stop.sh` |
| Reset the local database | `deploy/stop.sh --purge --yes` |
| Use E2B instead of Docker for grading | `npx pnpm@11.25.0 --filter @torquecode/backend e2b:template` once, then `RUNNER=e2b deploy/start.sh --restart` |

> If `deploy/start.sh` says a port or password problem, an old local database volume is usually the cause: run `deploy/stop.sh --purge --yes` and start again.

## 🧪 Tests

```bash
npx pnpm@11.25.0 install --frozen-lockfile --ignore-scripts
npx pnpm@11.25.0 typecheck
npx pnpm@11.25.0 test                                   # backend (+ PostgreSQL/Docker suites when available)
npx pnpm@11.25.0 --filter torquecode-frontend test       # frontend checks
npx pnpm@11.25.0 --filter torquecode-frontend run test:ui
node src/frontend/tests/e2e/journey.mjs                  # full browser journey against a running stack (needs Playwright)
```

## ☁️ Deployment

Frontend on **Vercel** (project root `src/frontend`; `vercel.json` rewrites `/api/*` to the backend), backend + PostgreSQL + Docker sandbox on **one Ubuntu VM** with Caddy HTTPS (`deploy/cloud/setup-vm.sh`). API keys live only in the VM's `/etc/torquecode/backend.env`; Vercel only needs `TORQUECODE_PROXY_SECRET`. Details: [`deploy/cloud/README.md`](deploy/cloud/README.md).

## 🔒 Security and integrity

- Candidate code runs in fresh Docker containers: no network, non-root, read-only, CPU/memory/process/time/output limits; the trusted grader and the candidate's code run in separate containers.
- Hidden tests, reference solutions and hint ladders never reach the browser.
- The AI cannot write code, tests or answers; every released task passes independent verification first.
- Integrity signals are browser-observed evidence for review, never an automatic verdict. No camera, microphone or screen recording.
- Keys stay on the server, in `.env` or the VM's env file.

## ⚠️ Limitations

- Candidate code is Python only; 6 reviewed task families (each needs an independent answer oracle).
- TorqueCode checks skills consistent with the portfolio, not authorship of the projects.
- It can't detect help from a second device; browser focus signals are evidence, not proof.

## 📁 Repository layout

```
src/frontend/          React + Vite + Monaco web app, landing page, Vercel config
src/backend/api/       Fastify app, auth, assessments, persistence, wiring
src/backend/intake/    portfolio parsing, project evidence, quiz
src/backend/generation/ task families, evidence-based selection, K5 validation, receipts
src/backend/runner/    Docker and E2B sandboxes, grading harness
src/backend/llm/       Featherless client, guarded assistant, hints
src/backend/scoring/   AI-efficiency score, report builder
deploy/                local start/stop/verify scripts, cloud VM kit
docs/                  product context, pitch deck, demo portfolios
```

All code was written during the hackathon. Open-source libraries are used under their licenses.
