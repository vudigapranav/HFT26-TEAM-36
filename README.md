# TorqueCode — *Put your code under torque.*

> **Team PAARK · `HFT26-TEAM-36` · CBIT Hacktoberfest '26**
> Problem statement: **Portfolio-Driven Adaptive Coding & Technical Assessment Platform**

🎥 **Demo:** _link coming soon_ · 🌐 **Live URL:** _link coming soon_

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

```
Portfolio JSON ──► Onboarding quiz ──► 60-minute assessment ──────────────────────────► Report
 strict schema,     ~10 MCQs, picks     Novice (15 min) ─► Adept (20) ─► Master (25)     pass rates, time,
 topic normalizing, a focus lane only   no assistant       guarded AI assistant           AI efficiency score,
 domain detection   from claimed skills next tier unlocks when every test passes;       focus areas,
                                        upgrading is the candidate's choice; no demotion  integrity signals
                                        Run = visible tests · Submit = visible + hidden
```

1. **Portfolio intake.** Strict validation with field-level errors; DSA topics normalized to a fixed 19-topic taxonomy (typos and synonyms handled); size caps; all portfolio text treated as untrusted data, with prompt-injection phrases flagged.
2. **Onboarding quiz.** A fixed MCQ bank (no LLM). The focus lane it picks is always a subset of what the portfolio claimed.
3. **Three tiers in one 60-minute session.** Everyone starts at Novice. Tasks may only use the candidate's claimed DSA topics.
4. **Deterministic grading.** Candidate code runs in an isolated Docker container against pytest suites. Hidden tests run only on Submit.
5. **Report.** Per-task pass rates, time taken, hints used, the AI efficiency score with its breakdown, final outcome, focus areas and integrity signals.

## 🏗️ Architecture

```
┌──────────────────────── FRONTEND (browser) ─────────────────────────┐
│ Login · Portfolio upload · Onboarding quiz · Generation progress    │
│ Coding environment (Monaco editor, file tabs, Run/Submit, console,  │
│ tier bar, timer, assistant panel) · Report page                     │
└───────────────┬─────────────────────────────────────────────────────┘
                │ HTTPS · REST + JSON
┌───────────────▼──────────── BACKEND PART A: CORE PLATFORM ──────────┐
│ Auth · Portfolio intake · Session & timer (server-authoritative)    │
│ Tier state machine · Execution runner (containers) · Grading        │
│ Event logging · AIE score calculation · Report builder · Database   │
└───────────────┬─────────────────────────────────────────────────────┘
                │ internal calls (typed seams)
┌───────────────▼──────────── BACKEND PART B: AI ENGINE ──────────────┐
│ Featherless client (single queue) · Task generation pipeline        │
│ Validation engine (deterministic) · Seed bank · Hint ladder         │
│ Guarded assistant (input/output guards)                             │
└─────────────────────────────────────────────────────────────────────┘
                │
        Featherless API (OpenAI-compatible) — key lives ONLY here
```

**Stack:** TypeScript (strict, ESM) on Node 24 · Fastify 5 · TypeBox shared contracts (`@torquecode/contracts`) · PostgreSQL 16 · Argon2id + HttpOnly cookie sessions · Docker sandbox running Python 3.13 + pytest · Featherless AI via the OpenAI-compatible API · pnpm workspace + uv. Full decisions: [`docs/BACKEND_DECISIONS.md`](docs/BACKEND_DECISIONS.md).

## ✅ What's real today vs. what's next

Merged into `main` and covered by tests:

| Area | Status |
| :--- | :--- |
| Email + password login (Argon2id, hashed opaque session tokens, origin checks, rate limits) | ✅ merged |
| Portfolio intake: validation, topic normalization, domain detection, injection flags | ✅ merged |
| Onboarding quiz with claimed-skills-only focus lane | ✅ merged |
| Assessment API: create session, server-side timer, autosave, Run, Submit, hint ladder, integrity events, auto-submit at expiry | ✅ merged (one Novice seed task) |
| Docker sandbox runner wired into the API (`RUNNER=docker`) | ✅ merged |
| AI efficiency score (context §12 rules) and report builder | ✅ merged |
| Featherless client (single queue, retries) and guarded assistant + hint provider | ✅ merged as modules; not yet wired into the API |

In progress during the hackathon: the three-tier flow with Upgrade and assistant endpoints, Adept + Master seed tasks, the validation engine, live task generation, sandbox anti-tamper hardening, deployment and the frontend.

**Future scope (pitch only, not built):** project-based assessments built around the candidate's own repositories, and camera-based proctoring.

## 🚀 Setup

Deployment on the demo machine is documented in [`deploy/README.md`](deploy/README.md) (added with deployment task R6).

Local development, from the repository root (Node 24.22.1+, pnpm 11, uv, Python 3.13; PostgreSQL 16 and Docker for the full flow):

```sh
pnpm install --frozen-lockfile --ignore-scripts
uv sync --project src/backend --python 3.13 --locked
pnpm typecheck
pnpm test
pnpm dev                     # http://127.0.0.1:3001/health
```

Full candidate flow (auth + Docker sandbox):

```sh
docker build -t torquecode-runner-python:dev src/backend/runner/images/python
pnpm db:migrate              # against a dedicated TorqueCode database
APP_MODE=auth RUNNER=docker DATABASE_URL=... AUTH_ORIGIN=http://localhost:5173 pnpm dev
```

Copy `.env.example` to `.env` for local secrets. `.env` is git-ignored; never commit keys.

## 🔒 Security and integrity design

- **Sandbox.** Each Run/Submit is a fresh container: `--network none`, memory/CPU/process (`--pids-limit`) limits, read-only root filesystem with a small `noexec` tmpfs, non-root user `10001`, `--cap-drop ALL`, `no-new-privileges`, wall-clock timeout with kill, capped output. Tests are parsed per test ID from JUnit XML, never from the exit code alone.
- **Hidden tests never leave the server.** Run uses visible tests only; Submit adds hidden tests. The browser gets hidden-test aggregates only (no test code, names or expected output), and Submit stdout/stderr are discarded. Reference solutions and hint ladders are server-only; public responses are projected through explicit allow-lists.
- **Candidates can only edit allow-listed files.** Test, config, unknown and path-traversal paths are rejected before the runner is called.
- **Guarded assistant (Adept/Master).** Layered: the model never sees reference solutions or hidden tests; an input guard catches extraction attempts; a deterministic output guard limits code volume, blocks task-function redefinitions and, when given the reference through a server-side resolver, checks similarity to it. The reference never enters the model's context. Every reply and block is logged.
- **AI efficiency score from logs only.** Up to 20% of the final score, computed deterministically from events (independence, hint yield, test discipline, gated by the final submit's pass rate). Blocked extraction attempts score 0 and are reported as integrity flags. An LLM outage emits no events, so it never counts as AI use.
- **Integrity signals, not verdicts.** Tab switches and copy/paste (meant to be captured only inside the coding environment) are accepted by the events API, timestamped by the server, and counted in the report. They can't forge the run/submit events that scoring relies on.
- **Featherless key** lives only in the backend's `.env`, and only `src/backend/llm/` calls the provider.

## ⚠️ Honest limitations

- TorqueCode verifies skills consistent with the portfolio, not authorship of the listed projects (it sees JSON, not repositories).
- It can't stop AI use on another device; it logs integrity signals only. Camera proctoring is future scope.
- Generated difficulty is approximate; different candidates get different tasks.
- The sandbox is hackathon-grade. Candidate code currently shares the pytest interpreter with the tests, which is being hardened (task R3); production would need stronger isolation.
- Assistant guards are heuristics, and AI hints can occasionally be wrong; hints are never used for grading.

## 📁 Repository layout

```
src/backend/
  api/          Fastify app, auth, sessions, routes, wiring          (Karthik)
  contracts/    shared TypeBox models + seam signatures              (Karthik)
  generation/   generation + validation engine                       (Karthik)
  seed_bank/    hand-verified tasks                                  (Karthik, Aryan)
  runner/       Docker sandbox + grading                             (Rithvik)
  llm/          Featherless client, guarded assistant, hints         (Rithvik)
  intake/       portfolio parsing, domain detection, quiz            (Pranav)
  scoring/      AI efficiency score, report builder                  (Pranav)
  tests/        Vitest + pytest suites
src/frontend/   web app                                              (Akshit)
docs/           product context, backend plan, decisions, status logs, reviews
```

All code was written during the hackathon. Open-source libraries are used under their licenses.
