# TorqueCode — Backend Work Split (3 people)

> Team PAARK · CBIT Hacktoberfest 2026 · v3 final split
> Read together with `docs/TorqueCode_Context.md`. The context file says **what** the product must do. This file says **who owns which part, in what order, and how the parts connect**.

---

## 0. What this file decides, and what it leaves to the backend team

**This file decides only the split:** who owns which area, task order, what "done" means, and how the parts talk to each other.

**The backend team decides the whole coding plan**, led by Karthik, as the very first task (**K0**). That covers:

- programming language and framework
- database and how login works
- how the sandbox isolates code (for example Docker or a self-hosted Judge0)
- the test framework used for candidate tasks
- the format and location of the shared data models
- the internal file structure inside each area
- how the frontend calls the API (REST, streaming, etc.)
- the test command each person runs before pushing

Karthik records every choice in **`docs/BACKEND_DECISIONS.md`**. Every Claude Code session reads that file, so the three setups stay consistent.

### 0.1 Proposed languages — Karthik confirms or changes in K0

With several Claude Code setups coding at once, the proposal is **TypeScript for the backend, Python only where the work is on Python code itself**. TypeScript's compiler catches mismatches between people's code the moment they happen, and the data models can be shared with the frontend.

| Area | Owner | Proposed language |
|---|---|---|
| API, login, database, sessions/tiers, background jobs | Karthik | TypeScript |
| Shared data models (also used by the frontend) | Karthik | TypeScript |
| Generation + validation logic | Karthik | TypeScript |
| Code-analysis tools: stubbing, bug injection, DSA-topic scan, import check | Karthik | **Python** (small JSON-in/JSON-out scripts) |
| Seed-bank tasks | Karthik / Aryan | **Python** (it's candidate code) |
| Sandbox control, grading, anti-tamper | Rithvik | TypeScript |
| Runner image contents | Rithvik | **Python** + pytest (candidate language) |
| Featherless client, guarded assistant, hints | Rithvik | TypeScript (OpenAI-compatible Node SDK with Featherless's base URL) |
| Intake, quiz, AI score, report | Pranav | TypeScript |
| Deployment | Rithvik | docker compose / scripts |

Framework, database library, package manager and versions are Karthik's choice in K0. The alternative is all-Python; it's simpler for the code-analysis tools, but there are no shared types with the frontend and no compile-time checks between agents.

**Product decisions are not made here.** (Update 31 Oct 03:00: the tier time split and unlock rule are now LOCKED by Pranav — see context §5 and the top of CLAUDE.md.) These include the tier time split, unlock rule, quiz purpose and AI-score scope. They come from the context file §15. Until the team settles each one, it stays a named TODO.

**What doesn't change, whatever the stack** (from the problem statement and context file):

- Grading is deterministic tests only. An LLM never judges correctness.
- Generated tasks are checked before release: the reference passes and the starter fails.
- Only one module calls Featherless.
- Reference solutions, hidden tests and hint ladders never reach the browser.
- Candidate code runs in an isolated sandbox.
- The AI efficiency score (up to 20%) is computed from logs only.

**Original-work rule:** the event README says all code must be written during the hackathon. Use past experience (for example LabSubmit), but don't copy its code. Open-source libraries are fine with attribution.

---

## 1. The split at a glance

| Person | Role | Share | Owns |
|---|---|---|---|
| **Karthik** | **Backend lead** | ~50% | The coding plan (K0); the spine (skeleton, shared data models, database, login, sessions/timer/tiers, all API endpoints, background jobs); the brain (**task generation, validation engine, seed bank**); integrating everyone's code; reviewing backend PRs |
| **Rithvik** | Infrastructure + AI integration | ~30% | **Sandbox** (isolated runner, grading, anti-tamper), **Featherless integration** (client, request queue, model choice, guarded assistant, hint serving), **deployment** for the demo |
| **Pranav** | Small modules | ~20% | Portfolio intake (validation, topic normalization, domain detection), onboarding quiz, AI efficiency score, report builder. No servers, sandbox or LLM calls. |

All three use **Claude Code**.

Why this split:
- **Karthik** owns everything that decides *what* happens, so the core product has one owner and one coding plan.
- **Rithvik** owns everything that talks to the outside world (sandbox, Featherless, the demo machine). These are the riskiest parts and need early testing on real hardware.
- **Pranav's** modules are self-contained logic that fits around his frontend lead and PR-merge work.

Aryan isn't in this backend split. If he has time beside the pitch, the best thing to give him is **writing seed-bank tasks** under Karthik (K7).

---

## 2. Ownership by area

The areas below are owned folders. Karthik can rename them or decide their internal structure in K0; if he does, he updates `scripts/owners.json` in the same PR.

| Folder | Area | Owner |
|---|---|---|
| `src/backend/api/` | App entry, config, database, login, sessions/timer/tiers, all endpoints, background jobs | Karthik |
| `src/backend/contracts/` | **The shared data models** (Portfolio, CandidateProfile, TaskSpec, RunResult, Event, Report, …) — the single source everyone uses | Karthik (others request changes) |
| `src/backend/generation/` | Task generation, validation engine, generation prompts | Karthik (K5 validation) + Rithvik (K6 generation), from 31 Oct 04:17 (both may edit) |
| `src/backend/tools/` | Code-analysis scripts that work on candidate code (stubbing, bug injection, topic scan, import check) | Karthik (K5) + Rithvik (K6), from 31 Oct 04:17 (both may edit) |
| `src/backend/seed_bank/` | Hand-verified fallback tasks | Karthik, Aryan |
| `src/backend/runner/` | Sandbox runner, grading, anti-tamper, runner images. Includes a simple **local stand-in runner** that Karthik adds in K1 and Rithvik replaces. | Rithvik (stand-in: Karthik) |
| `src/backend/llm/` | Featherless client + queue, guarded assistant, hint serving, assistant prompts | Rithvik |
| `deploy/` | Everything needed to run the backend on the demo machine | Rithvik |
| `src/backend/intake/` | Portfolio validation, topic normalization, domain detection, quiz + quiz bank | Pranav |
| `src/backend/scoring/` | AI efficiency score, report builder | Pranav |
| `src/backend/tests/` | Tests; each person tests their own area | Shared |
| `docs/BACKEND_DECISIONS.md` | The coding plan | Karthik |
| `docs/status/<name>.md` | Each person's status log | That person |

**Rule:** you only edit files in areas you own. The pre-push hook enforces this.

**Dependency files** (`package.json`, lockfiles, `requirements*.txt`) are shared, because everyone adds libraries. Only **add** lines, never remove or reorder other people's. If two PRs conflict on a lockfile, Karthik resolves it.

---

## 3. The seams — how the areas talk to each other

These are the only connections between areas. They're described by meaning, not by language. Karthik writes them as real function or interface signatures in K1, as **stubs that return fake data**, so all three can build at once.

| Seam | Owner | Input → output | Used by |
|---|---|---|---|
| **Run tests** | Rithvik | code files + test files + mode (run = visible only, submit = all) + limits → per-test results (pass/fail/error/timeout, time), passed/total, capped output | API (candidate Run/Submit); validation engine |
| **LLM chat** | Rithvik | messages + model + purpose (generation/assistant) + limits → model reply. **The only place Featherless is called.** | Generation; assistant |
| **Next hint** | Rithvik | task + hint level → hint text | API |
| **Assistant reply** | Rithvik | task + candidate's current files + visible failures + message + chat history → reply, or "blocked" with reason | API |
| **Generate assessment** | Karthik | candidate profile + focus lane + progress callback → validated tasks for the three tiers (from generation or seed bank) | API (background job) |
| **Validate task** | Karthik | task + claimed topics → validation receipt (each gate: pass/fail + reason) | Generation; seed-bank checks |
| **Parse portfolio** | Pranav | raw portfolio JSON → candidate profile (normalized topics, domain), or field-by-field errors | API |
| **Quiz** | Pranav | candidate profile → questions; answers → focus lane (only from claimed skills) | API |
| **AI efficiency score** | Pranav | events + run results + task → score (max 20) with breakdown | Report |
| **Build report** | Pranav | session + tasks + runs + events → report data for the frontend | API |

The fields in each model follow the context file §11 drafts. Karthik finalizes them in K1.

---

## 4. Work per person (in order)

Each task has a **"done when"**: it isn't done until that check passes and the PR is merged.

### 4.1 Karthik — backend lead (~50%)

| # | Task | Done when |
|---|---|---|
| K0 | **Coding plan:** with Rithvik (and Pranav's input), confirm or change the languages in §0.1, decide everything else in §0, and fill in `docs/BACKEND_DECISIONS.md`, including the exact test command per area. Time-box it to about 30 minutes. | Rithvik and Pranav have read it and agree; it's merged |
| K1 | **Skeleton (unblocks everyone):** project setup, config, `.env.example`, shared data models, every seam from §3 as a stub, the local stand-in runner, a health endpoint, **seed task 1** (Novice bug-fix) | The others can pull, start the backend, call every stub, and run seed task 1 through the stand-in runner |
| K2 | Database + login | A user can register, log in, and call a protected endpoint |
| K3 | Sessions + tiers: create assessment, one 60-min server-side timer, autosave, question-set unlock (attempt every question → "Unlock next questions", max 2, no level names in the UI — context §5), auto-submit at 60 min | Seed task 1 can be started, run, submitted and unlocked through the API |
| K4 | All API endpoints (context §11.5), wiring in Pranav's and Rithvik's seams; generation as a background job with progress | The frontend can complete the whole journey against the real backend |
| K5 | Validation engine: the gates in context §10.2 B3 (schema, topic bound, import allow-list, reference passes repeatedly, starter fails correctly, statement examples, leakage; then differential and performance) | Seed tasks pass; deliberately broken tasks are rejected with clear reasons |
| K6 | Generation pipeline (context §10.2 B2): staged prompts → parse output → expected outputs computed by running the reference → starter derived deterministically → validate → retry with feedback → seed-bank fallback; includes the 3-level hint ladder | A sample portfolio yields 3 validated tasks, or seed-bank tasks re-skinned to its domain |
| K7 | Seed tasks 2 and 3 (Adept feature across 2–3 files; Master debug + performance), each with reference, starter, visible + hidden tests and hints. **Good to hand to Aryan.** | All seed tasks pass validation |
| K8 | Integration: merge order, contract changes, end-to-end test | Full flow works on seed tasks, then with live generation |

### 4.2 Rithvik — sandbox, Featherless, deployment (~30%)

| # | Task | Done when |
|---|---|---|
| R1 | **Sandbox on the demo machine first:** pick the isolation approach together with K0, then prove it runs on the machine you'll present from (Apple Silicon Macs need arm64-compatible images) | A trivial program runs isolated on the demo machine |
| R2 | **Run tests** seam, real version: no network, memory/CPU/process limits, timeout, read-only except a temp area, non-root, output capped, per-test results; same interface as the stand-in | Seed task 1 runs in the sandbox; infinite loop, fork bomb and huge output are all stopped safely |
| R3 | Anti-tamper grading (context §10.1 A5): test and config files restored every run; hidden tests only on Submit; only pass/fail of hidden tests leaves the backend | A candidate who deletes tests or force-exits still gets graded correctly |
| R4 | **LLM chat** seam: Featherless client, key from env, one queue for all calls, retry on 429, read plan limits at startup; benchmark 2–3 models and pick one for generation and one for the assistant | One call works; parallel calls don't 429; model choice recorded in `docs/BACKEND_DECISIONS.md` (ask Karthik) or your status file |
| R5 | **Next hint** + **Assistant reply** seams (context §10.2 B4): hint ladder first; reference never in the prompt; input guard; deterministic output guard (long code blocks, similarity to the reference); every request, reply and block logged as events | 10 jailbreak attempts from a list you write all get refused or blocked |
| R6 | Deployment: one-command start on the demo machine, `.env` setup, one pre-generated demo assessment loaded, backup screen recording | Full flow works from a clean browser on the demo machine |

**Order note:** R4 is small. If Karthik reaches K6 before R2 is done, do R4 first so generation isn't blocked.

### 4.3 Pranav — small modules (~20%)

| # | Task | Done when |
|---|---|---|
| P1 | **Parse portfolio**: strict validation with field-level errors; normalize DSA topics to the fixed list (typos, synonyms); cap sizes; treat all text as untrusted | 6 sample portfolios (normal, empty topics, typos, huge, injection text, unknown stack) all give correct output or clean errors |
| P2 | Domain detection: deterministic rules on stacks → Web / ML / Security / Backend, with confidence | Each sample gets the domain a human would pick |
| P3 | **Quiz**: ~10 MCQs; focus lane only from claimed skills | A lane is never something the portfolio didn't claim |
| P4 | **AI efficiency score**: context §12 formula, from events only, with breakdown | Tests: no AI + solved = 20; no AI + failed ≠ 20; repeated runs without code changes don't count |
| P5 | **Build report**: per-task pass rates, time, hints, AI efficiency breakdown, outcome, focus areas, claims-vs-demonstrated, integrity signals | Produces the data the frontend report page renders |

P1–P3 are needed early. P4–P5 only need logged events, so they can come later. The 6 sample portfolios from P1 become everyone's test data (in `src/backend/tests/fixtures/portfolios/`).

---

## 5. Milestones (targets — check the official deadline)

| # | Milestone | Needs |
|---|---|---|
| M0 | Coding plan agreed and merged | K0 |
| M1 | Skeleton + shared models + stubs merged; everyone builds against them | K1 |
| M2 | Seed task 1 fully playable through the API in the **real sandbox** | K3, R2, R3 |
| M3 | Portfolio upload → quiz → assessment from the **seed bank** → report | P1–P3, K4, K7, P5 (basic) |
| M4 | Live generation produces at least 1 validated task; seed bank covers failures | R4, K5, K6 |
| M5 | Guarded assistant + hints in Adept/Master; AI efficiency score in the report | R5, P4 |
| M6 | Running on the demo machine with a pre-generated assessment | R6 |
| M7 | **Feature freeze.** Only bug fixes, demo data, README, submission PR | All |

**The rule that protects the demo:** the whole journey must work on **seed-bank tasks by M3**. Live generation is added on top of a working product, never a dependency for it.

---

## 6. Working with three Claude Code setups

The repo carries a small kit so all three setups follow the same rules:

| Piece | What it does |
|---|---|
| `CLAUDE.md` (repo root) | Read automatically at the start of every Claude Code session. Loads the context file, this file and `docs/BACKEND_DECISIONS.md`, plus the hard rules. |
| `/start <task-id>` | Pulls the latest `main`, creates your branch, re-reads all docs + everyone's status files + the shared models, and restates the task before coding. |
| `/ship` | Before every push: re-reads every context file fresh, checks ownership and the rules, runs your tests, appends to your status file, commits, pushes your branch, opens a PR. |
| `docs/status/<name>.md` | One log per person. This is how each setup learns what the other two changed. |
| `.githooks/pre-push` + `scripts/owners.json` | Blocks any push that targets `main`, has no owner prefix in the branch name, touches someone else's area, or adds a `.env`/secret. Works even if someone forgets `/ship`. |

**Each person, once per clone:** `git config core.hooksPath .githooks`

**Habits**
- One task per session: `/start K3` … `/ship`. Use `/clear` between tasks to save Claude Pro usage.
- Branch names: `karthik/k3-sessions`, `rithvik/r2-sandbox`, `pranav/p1-intake`.
- PRs go into the fork's `main`. Karthik reviews backend PRs, then Pranav merges.
- Run the tests yourself before every PR. The AI writes the code; you check that it works.
- Each person keeps their own `.env`. Only Rithvik needs a real Featherless key at first, plus Karthik once K6 starts.

---

## 7. Biggest risks per person

| Person | Risk | Fallback |
|---|---|---|
| Karthik | Lead plus 50% is a heavy load; K0 debate eats time | Time-box K0 to about 30 minutes; hand K7 to Aryan |
| Karthik | Generated tasks rarely pass validation | Seed bank + re-skinning; show validation receipts for the tasks that pass |
| Rithvik | Sandbox misbehaves on the demo machine | R1 is first on purpose; last resort is the stand-in runner with timeouts, called hackathon-grade in the pitch |
| Rithvik | Featherless slow or returns 429 | Single queue, smaller models, pre-generated demo assessment |
| Pranav | Frontend work leaves no time for backend modules | P1–P3 are small; P4–P5 can move to Karthik or Rithvik |
