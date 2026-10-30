# Karthik — Codex prompts (backend lead) · checkpoint 00:30

> Tool: **Codex** (ChatGPT). Pranav and Rithvik use Claude Code. The rules are the same for everyone.
> Paste the prompts below **in order**. Each one ends with the **Ship prompt** (§3). Times are IST targets.

---

## 0. The 00:30 checkpoint — what the team will look at

A working backend you can drive from `/docs`, curl, or the e2e test:

1. The backend starts with one command.
2. **POST a sample portfolio** → Pranav's real parser returns a profile (normalized topics, domain) or field-level errors.
3. **Quiz** → returns questions; answers → a focus lane (Pranav; may still be a stub).
4. **Create assessment** → session starts with **seed task 1** (Novice). The server-side timer runs.
5. **Get task** → files + statement only. **No server-only data.**
6. **Run** starter code → visible tests fail. **Run** fixed code → they pass. **Submit** → hidden tests graded. This goes through Rithvik's **Docker runner** if merged, otherwise your local stand-in.
7. **Hint** → returns hint level 1 from the seed task's ladder.
8. Rithvik shows one real Featherless call through his client.

Login, database, generation and validation come **after** the checkpoint. Use an in-memory store until then.

**Your critical path:** K0 (by 23:05) → contracts PR (by 23:25) → server + seed task (by 00:05) → wiring (by 00:25). Pranav and Rithvik are blocked until your contracts PR is merged, so push it early, even if small.

---

## 1. One-time setup (terminal, 2 min)

```bash
# 1) Pranav must first merge the PR "pranav/setup-kit" into main (it adds CLAUDE.md, docs, hooks).
git checkout main && git pull
git config core.hooksPath .githooks        # turns on the pre-push safety check
node -v && python3 --version && docker --version   # note versions for K0
```

**Use Codex CLI or the Codex IDE extension, locally in your clone**, signed in with your ChatGPT account. Don't use Codex cloud tasks. Those push from GitHub's side, so the team's pre-push check never runs and the branch names won't start with `karthik/`.

---

## 2. Session opener — paste at the start of EVERY new Codex session

Codex doesn't load `CLAUDE.md` automatically, so this makes it read the same rules Claude Code reads.

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

---

## 3. Ship prompt — paste before EVERY push

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

After pushing, open the PR with that link and **tell Pranav to merge it**. K0 and the contracts PR must be merged within minutes.

---

## 4. Prompt K0 — coding plan (22:50 → 23:05)

**Before pasting:** read the stack lines below and change any you disagree with. These are defaults taken from the plan's §0.1 proposal. **You decide.** Agree with Rithvik in 5 minutes.

```
Task K0. Branch: karthik/k0-decisions (create from origin/main).

Fill in docs/BACKEND_DECISIONS.md completely (replace "PENDING" with "AGREED — <date>") using these decisions.
Keep the file short and exact; every Claude Code / Codex session loads it.

Stack:
- Backend language: TypeScript on Node (use the installed LTS version; write the exact version), npm, ESM.
- Web framework: Fastify (with @fastify/swagger + swagger-ui so /docs works).
- Shared data models: Zod schemas in src/backend/contracts/schemas.ts; TS types via z.infer. Seam interfaces in
  src/backend/contracts/seams.ts; fake implementations in src/backend/contracts/stubs.ts.
- Wiring: src/backend/api/wiring.ts picks the implementation for each seam (stub → real when merged).
- Storage: in-memory repository behind an interface until the checkpoint; SQLite + Prisma in K2.
- Login: deferred to K2 (email + password, JWT). Endpoints stay open until then; mark TODO(K2).
- Tests: Vitest. Typecheck: tsc --noEmit.
- Sandbox: Docker via `docker run` from Node (Rithvik). Local stand-in runner without Docker for dev (Karthik).
- Candidate task language: Python 3.12 + pytest (JavaScript later).
- Code-analysis tools on candidate code: small Python scripts in src/backend/tools/, JSON in/out (after checkpoint).
- API style: REST + JSON. Errors: { "error": { "code": string, "message": string, "fields"?: Record<string,string> } }.
- Featherless: OpenAI Node SDK with baseURL https://api.featherless.ai/v1, only inside src/backend/llm/ (Rithvik).

Structure inside each area (file names):
- api/: server.ts, routes/*.ts, store.ts (repository interface + in-memory impl), wiring.ts
- contracts/: schemas.ts, seams.ts, stubs.ts, taxonomy.ts (fixed DSA topic list from context §11.1)
- runner/: local/localRunner.ts (Karthik), dockerRunner.ts, grading.ts, images/python/Dockerfile (Rithvik)
- llm/: featherless.ts, hints.ts, assistant.ts, prompts/ (Rithvik)
- intake/: portfolio.ts, domain.ts, quiz.ts, taxonomy.json, quizBank.json, domainRules.json (Pranav)
- scoring/: aie.ts, report.ts (Pranav)
- generation/: validate.ts, generate.ts, prompts/ (Karthik, after checkpoint)
- seed_bank/: <tier>-<nnn>.json TaskSpec files
- tests/: <area>/*.test.ts, fixtures/, e2e/

How to run (write exact commands): install (cd src/backend && npm install), dev server (npm run dev with tsx watch),
all tests (npm test), one area (npm test -- intake), typecheck (npm run typecheck).
The package.json lives at src/backend/package.json.

Also fill the "Change log" with today's entry: "K0 decisions — Karthik, Rithvik, Pranav".
Don't create any code yet. Then run the Ship prompt.
```

---

## 5. Prompt K1a — contracts + seams + stubs (23:05 → 23:25)  ⚡ unblocks everyone

```
Task K1a. Branch: karthik/k1a-contracts (from origin/main, after K0 is merged).

Set up the backend package and the shared contracts. Follow docs/BACKEND_DECISIONS.md exactly.

1. src/backend/package.json (scripts: dev, test, typecheck), tsconfig.json (strict), vitest config. Minimal deps.
2. src/backend/contracts/taxonomy.ts: the fixed DSA topic list from context §11.1 as a const + Zod enum.
3. src/backend/contracts/schemas.ts — Zod schemas + exported types, following context §11 drafts:
   Portfolio (input JSON), CandidateProfile (name, domain web|ml|security|backend, domainConfidence 0..1,
   claimedTopics: Topic[], techStack, skills, projects, warnings: string[]), PortfolioError (field → message),
   QuizQuestion, QuizAnswer, FocusLane (domain + topics; must be a subset of claimed), Limits, TestResult,
   RunResult (§11.3), Event (§11.4, event types as an enum), TaskFile, TaskSpec (§11.2, with a separate
   serverOnly object), ClientTask (TaskSpec WITHOUT serverOnly) + a toClientTask() function that strips it,
   Hint, ChatTurn, AssistantReply (ok | blocked + reason), ValidationReceipt (gate name → pass/fail + reason),
   AIEBreakdown (independence, hintYield, testDiscipline, gate, score ≤ 20), Report, SessionState
   (tiers, current tier, unlocked tiers, startedAt, endsAt).
4. src/backend/contracts/seams.ts — one TypeScript type per seam in docs/TorqueCode_Backend_Plan.md §3, exactly:
   runTests, llmChat, nextHint, assistantReply, generateAssessment, validateTask, parsePortfolio, getQuiz,
   scoreQuiz, computeAIE, buildReport. Async where they do I/O. Add a JSDoc line per seam naming its owner.
5. src/backend/contracts/stubs.ts — a fake implementation of every seam returning valid fake data (Zod-parse it).
6. src/backend/api/wiring.ts — one exported object with every seam, all pointing at stubs for now.
7. Tests: every stub output parses against its schema; toClientTask() output has no serverOnly field
   (deep check, including JSON.stringify not containing "serverOnly" or "reference").

Keep it small and correct. Pranav and Rithvik are waiting on this to code against real types.
Then run the Ship prompt. In the status entry write: "Contracts merged — implement your seam from contracts/seams.ts."
```

---

## 6. Prompt K1b — server, local runner, seed task 1, checkpoint endpoints (23:25 → 00:05)

```
Task K1b (+ minimal K3 for the checkpoint). Branch: karthik/k1b-server (from origin/main, after K1a is merged).

1. src/backend/api/server.ts: Fastify app, /health, Swagger UI at /docs, the error format from BACKEND_DECISIONS.md.
2. src/backend/api/store.ts: repository interface (users later, portfolios, sessions, runs, events) + in-memory implementation.
3. src/backend/runner/local/localRunner.ts: implements the runTests seam WITHOUT Docker (dev stand-in only, clearly
   commented as not isolated): write files + tests to a temp dir, run `python3 -m pytest -q -p no:cacheprovider
   --junitxml=<tmp>/out.xml` with a wall-clock timeout, parse JUnit XML into RunResult, cap stdout/stderr at 64 KB,
   mode "run" = visible tests only, "submit" = visible + hidden; delete the temp dir afterwards.
4. src/backend/seed_bank/novice-001.json: a hand-written Novice TaskSpec (Python): a small realistic module of 2 files
   with ONE localized bug (e.g. an off-by-one or wrong comparison), DSA topics limited to ["arrays","hashing"],
   3 visible tests and 4 hidden tests (pytest), the reference solution (serverOnly), a 3-level hint ladder
   (serverOnly; hints never contain the fix as code). Starter = reference with the single bug injected.
   Add a test (via localRunner) proving: reference passes ALL tests; starter fails at least one test that the
   reference passes (F2P) and passes the rest (P2P).
5. Routes (context §11.5 subset), all using api/wiring.ts — never importing teammates' modules directly:
   POST /portfolio (wiring.parsePortfolio; 422 with field errors), GET + POST /onboarding-quiz,
   POST /assessments (create session: tier novice, seed task novice-001; startedAt/endsAt = +60 min;
   TODO(OPEN-Q1) for time split), GET /assessments/:id/tasks/:taskId (toClientTask only),
   PUT /assessments/:id/tasks/:taskId/files (autosave, only editable files),
   POST .../run and .../submit (wiring.runTests; record runs + events; hidden tests → status only),
   POST /assessments/:id/hint (wiring.nextHint, levels 1→3, logged as events),
   POST /assessments/:id/events (batched frontend events), POST /assessments/:id/tier/upgrade
   (allowed only if next tier unlocked; unlock adept when all novice hidden tests pass — TODO(OPEN-Q1)).
   Every response includes remaining time computed on the server.
6. tests/e2e/checkpoint.test.ts: drives the whole checkpoint flow (portfolio from
   tests/fixtures/portfolios if present, else an inline sample) → quiz → assessment → get task → run starter
   (fails) → run reference files (passes) → submit → hint. Assert no response anywhere contains serverOnly
   data (reference code or hidden test bodies).
Then run the Ship prompt.
```

---

## 7. Prompt K-int — integration for the checkpoint (00:05 → 00:25)

```
Task K8 (checkpoint integration). Branch: karthik/k8-checkpoint-wiring (from origin/main).

1. git fetch origin && git log origin/main --oneline -15, and read docs/status/rithvik.md and docs/status/pranav.md.
2. In src/backend/api/wiring.ts ONLY, switch each seam from its stub to the real implementation that is now on main:
   - parsePortfolio / getQuiz / scoreQuiz → src/backend/intake/ (Pranav) if merged
   - runTests → choose by env RUNNER=docker|local: docker → src/backend/runner/dockerRunner.ts (Rithvik) if merged,
     local → runner/local/localRunner.ts
   - nextHint → src/backend/llm/hints.ts (Rithvik) if merged
   Keep stubs for anything not merged yet, and list them.
3. Run the e2e checkpoint test with RUNNER=local, then RUNNER=docker (if Docker runner is merged and Docker is running).
4. If a teammate's module doesn't fit the contract, DO NOT edit their files. Write exactly what's wrong in
   docs/status/karthik.md under "Teammates should know" and tell me.
5. Add a short "Checkpoint demo" section to docs/status/karthik.md: the exact commands to start the backend and
   run the demo flow, and which seams are real vs stub.
Then run the Ship prompt.
```

---

## 8. After the checkpoint (next prompts will come then)

K2 database + login → K5 validation engine → K6 generation pipeline → K7 seed tasks 2–3 (give to Aryan if possible). Don't start these before 00:30.
