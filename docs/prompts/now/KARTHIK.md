# Karthik — FINAL prompts (Codex) · 31 Oct 04:30

> Replaces every older Karthik prompt. `git pull` + fresh Codex session first.

**Locked rules (read CLAUDE.md top section):** one 60-minute timer; everyone starts on the first question set; submitting every question in a set (correct or not) allows "Unlock next questions", max 2; no level names in the candidate UI/API; AI help only on Adept/Master questions. Frontend on Vercel, backend + Docker + PostgreSQL on one cloud VM, `/api` rewritten same-origin. **Karthik: K5 ✅ → K11 → K8.  Rithvik: admission limit → K6 → R6b.**
PR base is always `vudigapranav/HFT26-TEAM-36` → `main`, never cbitosc. Never push to main, never `--no-verify`, never commit `.env`. Pranav's reviewer merges.

**Done & merged:** K0–K4-lite, K9, **K10 (#42)**, **K5 (#44)**. Great work.
**Left, in order:** 1) K5 receipt honesty fix (10 min) → 2) **K11 PostgreSQL persistence** (the big one) → 3) K8 integration.

---

## 0. Session opener — every new Codex session

```
You are working in the TorqueCode repo (team PAARK, 24-hour hackathon). I am Karthik, the backend lead.

Before doing anything, read these files fully and treat them as binding rules for this whole session:
- CLAUDE.md  (written for Claude Code, but every rule in it applies to you exactly the same)
- docs/TorqueCode_Context.md        (WHAT to build; respect its labels PS/LOCKED/RECOMMENDED/OPEN/ADDITIONAL/FUTURE SCOPE)
- docs/TorqueCode_Backend_Plan.md   (WHO owns which area; my tasks are K0–K8)
- docs/BACKEND_DECISIONS.md         (HOW to code: stack, structure, commands)
- every file in docs/status/        (what Rithvik and Pranav changed)
- scripts/owners.json               (I may only edit paths listed under "karthik" or "shared")

Hard rules: never work on main; my branches start with karthik/; never edit Rithvik's or Pranav's areas
(tell me what to ask them instead); never let an LLM judge correctness; never send server_only data to the
browser; never commit .env or keys; never implement FUTURE SCOPE; never silently decide an OPEN item
(leave TODO(OPEN-Qn)); all code is written fresh during the hackathon.

Run: git fetch origin && git status. Then reply with a 5-line summary of what you understood and wait for my task.
```

## 0b. Ship prompt — before every push

```
Ship this work. Do these steps in order and stop at the first failure, explain it, and fix it:
1. Confirm the branch starts with karthik/ (never main).
2. git fetch origin && git rebase origin/main (commit or stash first). If a conflict is in a file I don't own, stop.
3. Re-read fresh: docs/TorqueCode_Context.md, docs/TorqueCode_Backend_Plan.md, docs/BACKEND_DECISIONS.md,
   all of docs/status/, the shared contracts, scripts/owners.json — teammates may have changed them.
4. List changed files (git diff --name-only origin/main...HEAD plus uncommitted). Every file must be allowed
   for "karthik" or "shared" in scripts/owners.json. Revert any that aren't.
5. Check the diff against the docs: matches BACKEND_DECISIONS.md; uses the shared contracts (no local copies);
   seams match plan §3; no LLM judging correctness; only src/backend/llm/ calls Featherless; no server_only
   data in any API response; no FUTURE SCOPE; no OPEN item silently decided; no secrets. Fix mismatches.
6. Run the test command and typecheck from BACKEND_DECISIONS.md. All must pass. Never delete tests to pass.
7. Append to docs/status/karthik.md:
   ## <YYYY-MM-DD HH:MM> — <task-id> — <summary>
   - Changed: ...
   - Seams/contracts affected: ...
   - Teammates should know: ...
   - Next: ...
8. Commit "feat(<task-id>): <summary>" and run: git push -u origin HEAD
   (the pre-push hook re-checks ownership/secrets; if it blocks, fix the cause; never use --no-verify).
9. Print the PR link: https://github.com/vudigapranav/HFT26-TEAM-36/compare/main...<branch>
   and remind me the base repository must be vudigapranav/HFT26-TEAM-36 (not cbitosc).
```

---

## 1. K5 follow-up — honest receipts (≤10 min, branch karthik/k5-receipts)

```
Small fix to src/backend/generation/validate.ts — the receipts are shown to judges in the UI, so they must not overclaim:
1. 'examples' gate currently always passes ("Visible tests match the manifest"). Either really check statement examples (if the task declares machine-readable examples) or make the reason exact: "No statement examples declared; covered by visible tests" — and do NOT count it as proof of anything else.
2. 'differential' currently only checks that the reference gives identical results across its 3 runs. Rename the reason to "Reference deterministic across 3 runs (no brute-force oracle supplied)"; when a task supplies a brute force (Rithvik's K6 will), compare outputs on small random inputs and only then say "differential".
3. Master performance tests are found by id regex /performance|perf|large_window/ — document this convention in BACKEND_DECISIONS.md so Rithvik's K6 template names perf tests accordingly.
Tests for each. Then Ship.
```

---

## 2. K11 — PostgreSQL persistence for everything ⚡ (branch karthik/k11-persistence)

```
Task K11 — make the assessment side a real database app (shipping app, not a demo). Today api/assessment-store.ts keeps profiles + assessments in memory (lost on restart, max 100).
1. Migration 002 (numbered, transactional, checksummed like 001_auth.sql): portfolios/profiles (per user, latest + history), assessments (session, current tier, unlocks_used, timer, status), assessment_tasks (which seed/generated task per set + order; private task JSON stays server-side), task_files (latest saved editable files per task), runs (run/submit results incl. hidden aggregates — never hidden test source), events (append-only, server timestamps), reports (final report JSON), and generation_jobs (status/progress for Rithvik's K6). FKs to auth_users ON DELETE CASCADE; indexes on (user_id) and (assessment_id, ts).
2. A repository module (parameterized SQL, pg pool, transactions) behind the existing store interface; keep only in-flight run locks in memory. A restart loses NOTHING: on startup re-hydrate timers from expires_at and auto-submit expired active assessments exactly once (idempotent).
3. AI usage can never be lost: persist assistant_message / assistant_blocked / extraction_flagged / hint_served with an AWAITED insert before returning the reply (createAssistant's onEvent is synchronous — collect the events and write them in the route). Insert fails → 503, reply not delivered.
4. Per-user history: GET /reports (caller's reports: id, created_at, final_score, outcome) + existing GET /reports/:id; ownership enforced in SQL.
5. Remove the 100-profile/100-assessment caps; keep sane per-user limits in SQL (1 active assessment, runs/minute).
6. Generation as a background job (for Rithvik's K6): POST /assessments creates the assessment + a generation job and returns immediately; GET /assessments/:id/status exposes job progress + public-safe validation receipts; the job calls Ports.generateAssessment and falls back to the seed bank on failure/timeout. Without K6 merged, the job resolves instantly from the seed bank.
7. TRUST_PROXY=true|false (default false). When true, the client IP for rate limits comes from the first x-forwarded-for hop (Vercel), otherwise unchanged. Document in BACKEND_DECISIONS.md.
Tests (real isolated PostgreSQL, same harness as test:auth): create → save files → run → submit → unlock → assistant (fake chat) → RESTART the app → everything still there; expired assessment auto-submits once after restart; user B can't read A's anything; report list shows only own reports; event-insert failure → 503 and no reply; TRUST_PROXY on/off.
Then Ship.
```

---

## 3. K8 — integration (rolling until feature freeze, branch karthik/k8-integration)

```
1. Contracts: optional Report.claims: Array<{topic, tested_by: string|null, demonstrated: boolean|null}> and an optional claimed_topics/profile input to buildReport (Pranav wires claimsVsDemonstrated in P13 — tell him when merged).
2. BACKEND_DECISIONS.md: record K10, K5, K11, the unlock rule, R3 runner, R5-live results, TRUST_PROXY, perf-test naming.
3. One end-to-end API test always green on main: register → portfolio (docs/demo/demo-portfolio.json) → quiz → assessment → submit set 1 → unlock → set 2 with hint + assistant (fake chat) → unlock → set 3 → report → restart → report still there.
4. Resolve shared-file conflicts (package.json, lockfile, contracts) when teammates' PRs collide.
Then Ship.
```
