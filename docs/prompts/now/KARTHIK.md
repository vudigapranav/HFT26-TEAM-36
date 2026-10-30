# Karthik — all remaining prompts (Codex)

> Updated 31 Oct 03:20 by Pranav. **This file replaces all older prompt files for Karthik.** Do the prompts in order, one per session/branch.
> Before anything: `git pull` and start a **fresh** session (the rule at the top of `CLAUDE.md` changed at 03:00).
> PR base is always `vudigapranav/HFT26-TEAM-36` → `main`. **Never cbitosc.** Never push to main, never `--no-verify`, never commit `.env`.

**The product rule now (LOCKED, Pranav 03:00):** one 60-minute timer; everyone starts on Novice questions; after **submitting every question in the current set (correct or not)** the candidate may click **"Unlock next questions"**; max **2** unlocks; **level names are never shown** in the assessment UI (the report may name them); earlier questions stay open; AI help only on Adept/Master questions.

**State of main:** K1–K4-lite, K9 merged. Rithvik's R3 (split-container grading), R4 (Featherless), R5 (guarded assistant, live-tested) merged. K7 seeds merged: `novice_request_summary`, `adept_event_dedupe` (arrays+hashing), `master_session_window` (arrays+sliding_window). **K10 is DONE (#42).** **Your order now (Pranav, 04:17): K5 (validation, incl. the contract change) → K11 (PostgreSQL persistence) → K8.** K6 generation is Rithvik's.

---

## 0. Session opener — paste at the start of EVERY new Codex session

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

## 0b. Ship prompt — paste before EVERY push

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

## 1. K10 — question-set flow + assistant endpoint — ✅ DONE (#42)

```
Task K10. Branch karthik/k10-tiers from latest origin/main. Read CLAUDE.md "Latest product decision" and context §5 first — they override any older tier rule (15/20/25 minutes, unlock when all tests pass: both are GONE).
1. One 60-minute server timer for the whole session. No per-tier budgets. Auto-submit at expiry as today.
2. A "question set" = all tasks of one tier. Load the three seeds as the three sets: novice_request_summary, adept_event_dedupe, master_session_window. Code it for N tasks per set.
3. Unlock rule: the next set becomes AVAILABLE once every task in the current set has at least one Submit — correctness NOT required. Then the candidate MAY call POST /assessments/:id/tier/upgrade; before that → 409 UNLOCK_NOT_AVAILABLE. Max 2 unlocks (novice → adept → master); a 3rd → 409. A set whose dsa_topics the profile didn't claim is not offered (no fake task; unlock just isn't available).
4. Earlier sets stay open after unlocking: GET/PUT/run/submit keep working on them until expiry. Tasks of locked sets → 403. No demotion.
5. Status/task responses expose: unlock_available (bool), unlocks_used (0|1|2), the available task ids (in order), and per task assistant_enabled (bool). Do NOT put tier names ("novice"/"adept"/"master") in any candidate-facing assessment response (status, task, run, submit, hint, assistant). Keep tier internal. The REPORT may name tiers.
6. Events: tier_unlocked / tier_upgraded with payload {unlocks_used}.
7. Hints + assistant only on adept/master tasks (403 on novice), decided server-side from the task's tier.
8. Wire the LLM in api/wiring.ts: import { chat } from '../llm/featherless.js' and add chat to Ports. assistantReply = createAssistant({ chat, referenceFiles: server-side PrivateTask lookup, onEvent: built PER REQUEST so session_id comes from the authenticated session }). Check ownership + task tier + quota (TODO(OPEN-ASSISTANT-LIMITS), default 10 messages/task) BEFORE calling it. Add POST /assessments/:id/assistant {message, history?} → {reply} | {blocked:true, reason}. Only public task data + current files + visible failures go in. Hints: llm/hints.ts createHintProvider over the task's hint_ladder.
9. Contracts: add 'LLM_UNAVAILABLE' (and 'INVALID_REQUEST') to Unavailable['code']; map LLM_UNAVAILABLE → 503. Missing FEATHERLESS key → 503, the server still starts.
10. Pass ALL of the session's tasks to buildReport — Pranav's report (P11) filters to the tiers the candidate reached using session.current_tier.
11. Housekeeping: add "- src/frontend" to pnpm-workspace.yaml. Update docs/BACKEND_DECISIONS.md (Q1/Q3 locked by Pranav as above; remove OPEN-Q1 from /status policy_todos).
Tests: unlock unavailable until every current-set task has a submit; a FAILING submit still counts; 3rd unlock refused; earlier tasks still runnable after unlock; locked task 403; no tier names in any candidate assessment response (scan the JSON); novice hint/assistant 403; assistant on an adept task with a fake chat returns a reply and logs assistant_message; a blocked extraction logs assistant_blocked + extraction_flagged and never returns reference text; LLM down → 503 and no AI event; expiry auto-submits; report covers all attempted tasks; every response passes Value.Check against the public contracts.
Then run the Ship prompt.
```

---

## 2. K5 — validation engine (NOW, after K10) — Pranav 04:17: Karthik keeps K5

```
Task K5 — deterministic validation engine. Branch karthik/k5-validation from latest origin/main. Rithvik builds K6 (generation) on top of your validateTask — agree the task format with him early.
0. Contract first (you own contracts): add 'format' to Gate['gate'] and 'skipped' to Gate['status'] in contracts/internal.ts. A receipt with any 'fail' is valid:false; 'skipped' never counts as 'pass'. Push this tiny change FIRST as its own PR so Rithvik can build against it.
1. Implement Ports.validateTask in src/backend/generation/validate.ts. Each gate → {gate, status, reason}:
   - schema: task, files, tests well-formed; bounded test-id count/length and total metadata size
   - topics: task.dsa_topics ⊆ claimed_topics; static AST scan of the reference (tools/topic_scan.py, Python ast, JSON in/out, never import/eval candidate code) flags constructs of unclaimed topics (e.g. heapq when heap isn't claimed)
   - imports: allow-listed modules only (tools/import_check.py); test files may import only pytest + the task's own modules
   - format: a run returning unavailable "Task not supported by the isolated runner" FAILS (tests must call candidate functions with plain data — runner/harness/README.md)
   - reference: passes ALL tests, 3 runs in a row, through Ports.runTests (Rithvik's R3 runner)
   - starter: f2p_ids fail, p2p_ids pass, no syntax errors
   - examples: examples in statement_md match the reference's real output (where the task declares them)
   - performance (Master): reference well inside the limit; starter fails the perf test
   - leakage: starter not too similar to the reference (normalized token similarity); hints contain no reference lines/long code
   - differential: reference vs brute force on small random inputs (when the task supplies a brute force)
   Runner unavailable (no Docker) → runner gates "skipped", never "pass".
2. Generated test code is UNTRUSTED: reject test files that import os/sys/subprocess/importlib/builtins, touch pytest hooks/plugins/conftest, or define fixtures that reach outside the task. (Rithvik's K6 will render tests from structured cases through a trusted template; your gate is the backstop.)
3. Tests: all three seeds pass every gate; broken copies are rejected with clear reasons (reference fails; starter passes everything; unclaimed heapq; hint containing a reference line; test file importing subprocess; object-passing test → format fail). Receipts are public-safe (gate names, status, counts — never test source/expected values) so the frontend can show "Reference passes 10/10 ✓".
Then run the Ship prompt.
```

---

## 3. K11 — PostgreSQL persistence for everything (right after K5) ⚡ demo-critical

```
Task K11 — make the assessment side a real database app. Branch karthik/k11-persistence from latest origin/main (after K5). Read CLAUDE.md "Deployment + ownership decision" first.
Today api/assessment-store.ts keeps profiles + assessments in process memory (lost on restart, max 100). Replace that with PostgreSQL, keeping the same route behaviour:
1. Migration 002 (numbered, transactional, checksummed like 001_auth.sql): tables for portfolios/profiles (per user, latest + history), assessments (session, current tier/unlocks, timer, status), assessment_tasks (which seed/generated task per set, order), task_files (latest saved editable files per task), runs (run/submit results incl. hidden aggregates — never hidden test source), events (append-only, server timestamps), reports (final report JSON per assessment). Foreign keys to auth_users, ON DELETE CASCADE, indexes on (user_id), (assessment_id, ts).
2. A repository module (parameterized SQL, pg pool, transactions) behind the existing store interface; the API keeps a small in-process cache only for in-flight run locks. Server restart must lose NOTHING: re-hydrate timers from expires_at on startup and auto-submit any expired active assessment exactly once (idempotent).
3. Per-user report history: GET /reports (list the caller's reports: id, created_at, final_score, outcome) and GET /reports/:id (unchanged). Ownership enforced in SQL (WHERE user_id = $1).
4. Remove the 100-profile / 100-assessment caps; keep sane per-user limits (e.g. 1 active assessment, 50 runs/minute) enforced in SQL.
4b. Assistant usage must never be lost: persist assistant_message / assistant_blocked / extraction_flagged events with an AWAITED insert before the reply is returned (if the insert fails, return 503 and don't deliver the reply). createAssistant's onEvent is synchronous — collect events and write them in the route after the call.
5. Trusted proxy (needed for Vercel): add TRUST_PROXY=true|false (default false). When true, take the client IP for rate limiting from x-forwarded-for's first hop / x-real-ip; when false, keep today's behaviour. Document it in BACKEND_DECISIONS.md.
6. Tests: a real-PostgreSQL integration test (use the existing isolated test-auth harness pattern): create assessment → save files → run → submit → restart the app object → status, files, runs, events and report are all still there; expired assessment auto-submits once after restart; user B can't read user A's anything; report list only shows own reports.
Then run the Ship prompt.
```

> **K6 (live generation) is Rithvik's.** You build K5 (validation) first, then K11.

---

## 4. K8 — integration (rolling, until the feature freeze)

```
Task K8 — integration. Branch karthik/k8-integration.
1. Contracts: add an optional `claims: Array<{topic, tested_by: string|null, demonstrated: boolean|null}>` to Report, and an optional profile (or claimed_topics) input to the buildReport seam (Pranav's exact request is in docs/status/pranav.md, P8/P11). Tell Pranav when merged so he wires claimsVsDemonstrated (one line).
2. BACKEND_DECISIONS.md: record the unlock rule, R3 runner, R5-live results (from docs/status/rithvik.md), K7 seeds.
3. Keep ONE end-to-end API test green on every merge: register → portfolio (docs/demo/demo-portfolio.json) → quiz → assessment → submit set 1 → unlock → set 2 with a hint → unlock → set 3 → report (fake chat, local or Docker runner).
4. Merge order help: when a teammate's PR conflicts with yours on shared files (package.json, lockfile, contracts), resolve it on your branch.
Then Ship.
```
