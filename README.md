# TorqueCode — *Put your code under torque.*

> **Team PAARK · `HFT26-TEAM-36` · CBIT Hacktoberfest '26**
> Problem statement: **Portfolio-Driven Adaptive Coding & Technical Assessment Platform**

🎥 **Demo video:** _TODO: add link_ · 🌐 **Live URL:** _TODO: add link_ · ▶️ **How to run the demo:** [`deploy/README.md`](deploy/README.md)

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
 strict schema,     ~10 MCQs, picks     everyone starts on Novice questions; one timer      pass rates, time,
 topic normalizing, a focus lane only   no assistant       guarded AI assistant           AI efficiency score,
 domain detection   from claimed skills attempt every question → "Unlock next questions"  focus areas,
                                        (max 2 unlocks; levels never named; no demotion)  integrity signals
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

Merged into `main` and covered by tests (checked at `main` @ `19df7ff`):

| Area | Status |
| :--- | :--- |
| Email + password login (Argon2id, hashed opaque session tokens, origin checks, rate limits) | ✅ merged |
| Portfolio intake: validation, topic normalization, domain detection, injection flags | ✅ merged |
| Onboarding quiz with claimed-skills-only focus lane | ✅ merged |
| Question sets in one 60-minute session: everyone starts on the first set; after submitting every question (right or wrong) the candidate may click "Unlock next questions", at most twice; levels are never named in the assessment API; earlier questions stay open (K10, PR #42) | ✅ merged |
| Assessment API: server-side timer, autosave, Run, Submit, integrity events, auto-submit at expiry, neutral question IDs, locked sets refused (403) | ✅ merged |
| Hints and the guarded assistant endpoint, only on later question sets (K10, PR #42; R5 guards, measured against the live model in R5-live) | ✅ merged; the assistant needs a Featherless key, otherwise it returns 503 |
| Six reviewed Python task families (`generation/families.ts`): 2 Novice (request peak, second-largest distinct), 2 Adept multi-file features (event dedupe with hashing; bucket rollup, arrays only), 2 Master debugging tasks with a pinned performance workload (session window with sliding_window; error-budget spans, arrays only). Any portfolio that claims arrays reaches all three sets (#60, #63) | ✅ merged; seeds checked on the real Docker runner |
| Docker sandbox runner with anti-tamper split-container grading (R2, R3) | ✅ merged |
| Deterministic task validation engine: schema, claimed topics + reviewed implementation provenance, import allow-list, trusted grading template, pinned contract/examples, leakage, reference vs **independent TypeScript oracle** in 3 isolated runs, starter F2P/P2P, Master performance workload (K5, hardened in #60) | ✅ merged; every released task (generated or fallback) must be `semantic_verified` |
| Task generation (K6, #54 → #60): the model only **selects** a reviewed family and scenario; contracts, code, tests and expected answers come from reviewed templates and oracles. Provider down → verified seed fallback, marked `seed_bank` | ✅ merged |
| PostgreSQL persistence of profiles, assessments, files, runs, events, generation jobs and reports; restart-safe expiry; report history `GET /reports` (K11, #56) | ✅ merged |
| AI efficiency score (context §12) and report builder that only counts unlocked question sets | ✅ merged |
| One-command local deployment: PostgreSQL 16 in Compose, backend on the host, verify script (R6) | ✅ merged; verified on Windows, not yet on the demo Mac |

**Claims vs demonstrated (P13):** reports include the assessment's claimed topics, the task that tested each one, and whether its final submission demonstrated that topic. Unattempted claims are explicitly marked untested. Claims are captured when the assessment starts, so re-uploading a portfolio does not rewrite earlier results.

**Not finished yet (31 Oct, 08:15 IST):**
- **Frontend** (React + Vite + Monaco, live-only client of this API): PR #59, under local end-to-end verification. Not merged.
- **Cloud deployment** (Vercel frontend + one VM for backend, Docker sandbox and PostgreSQL): kit prepared in `deploy/cloud/` (R6b, #55) and runbook in [`docs/deploy/VERCEL_VM_RUNBOOK.md`](docs/deploy/VERCEL_VM_RUNBOOK.md). **Not deployed**: no VM host, Vercel URL or live verification yet.
- **K8 final integration** (PR #58): needs a rebase onto the independent-validation policy; see [`docs/reviews/2026-10-31-pr58-review.md`](docs/reviews/2026-10-31-pr58-review.md).

**Future scope (pitch only, not built):** project-based assessments built around the candidate's own repositories, and camera-based proctoring.

## 🚀 Setup

**How to run the demo:** `deploy/start.sh`, then `deploy/verify.sh`. Details in [`deploy/README.md`](deploy/README.md). The commands below are for local development.

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

- **Sandbox.** Each Run/Submit uses fresh containers, split in two: an untrusted **worker** with only the candidate's code, and a trusted **grader** with the tests. Candidate code never sees the test files, expected answers or the report. Both containers get `--network none`, memory/CPU/process (`--pids-limit`) limits, read-only root filesystem with a small `noexec` tmpfs, non-root user `10001`, `--cap-drop ALL`, `no-new-privileges`, wall-clock timeout with kill, capped output. The grade comes from the grader's own report stream, never from the candidate's exit code.
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
- The sandbox is hackathon-grade, standard Docker isolation. Hidden-test **inputs** reach candidate code because it receives the arguments; only test source and expected outputs are secret. Production would need stronger isolation.
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

### Current task validation scope

K5/K6 now use six reviewed Python families with independent answer oracles. The model selects a family/scenario; fixed templates supply the contract, code and examples. Unsupported or unverified tasks are withheld, and seed fallback must pass the same correctness checks. This supports bounded domain contextualization, not arbitrary task generation or every candidate technology stack. See [the validation policy](docs/BACKEND_DECISIONS.md#2026-10-31--independent-validation-policy-supersedes-earlier-k5k6-descriptions).
