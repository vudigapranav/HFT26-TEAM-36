# Frontend integration — Claude Code prompts for Pranav (31 Oct, updated 07:50)

Run these **in order**, one Claude Code session each (`/clear` between them), on Pranav's Mac in the repo.
Every commit is authored as `vudigapranav <vudigapranav@gmail.com>`; **no `Co-Authored-By` trailers**. Never push to `main`, never `--no-verify`, never commit `.env`.

## Status at 07:50

- **Prompt 1: done.** #60 (independent validation) is merged into main as d6e120e; your status entry is PR #61.
- **Prompt 2: running on Pranav's Mac** on `pranav/frontend-import`. Before pushing, run `git pull --rebase origin pranav/frontend-import`: this file was updated on that branch.
- **Backend blocker fixed: PR #63** (`pranav/arrays-families`) adds arrays-only Adept and Master families, so `normal-web.json` and every portfolio that claims arrays get all 3 question sets. Full suite: 399 passed, 0 skipped, with PostgreSQL 16 and the real Docker runner. Merge #63 before Prompt 3.
- **Also open:** #62 (Rithvik, Windows-safe build copy), #58 (Karthik K8; must be rebased onto #60, see the comment on the PR).

## What was already done (verified, not assumed)

- Akshit's zip is imported on branch **`pranav/frontend-import`** under `src/frontend/` (PR open, not merged).
- `package-lock.json` was removed; the frontend dependencies are in the root `pnpm-lock.yaml`. `pnpm install --frozen-lockfile --ignore-scripts` passes.
- `pnpm --filter torquecode-frontend build` passes (warning: Workspace chunk ~3.7 MB). Frontend `pnpm test` 11/11 and `pnpm run test:ui` 5/5 pass. Backend typecheck passes; backend vitest without a DB: 325 passed, 80 skipped (DB/Docker suites). One earlier run of that command failed and three re-runs passed, so there may be a flaky test.
- **Not done yet:** live-mode integration with the current backend, a real browser run, and Vercel config.

## Gaps found by reading the code (fix all of these)

| # | Gap | Where |
|---|---|---|
| G1 | The app starts in **demo mode** by default (`getMode()==='live' ? 'live' : 'demo'`). Production must be live-only. | `src/lib.tsx` `useModel`, footer settings in `main.tsx` |
| G2 | `src/contracts.ts` is a stale copy of the backend contracts from e04f5d0. Missing: `generation` (status/progress/receipts/source), `Report.claims`, `semantic_verified` / `structural_valid` / `not_applicable` receipts and the `GET /reports` history type. | `tsconfig.json` paths alias → `src/contracts.ts` |
| G3 | There's no handling for **`409 ASSESSMENT_GENERATING`**. After `POST /assessments` the backend withholds questions until validation finishes, but Ready/Workspace immediately call `GET /tasks/:id`. | `pages/Ready.tsx`, `pages/Workspace.tsx` |
| G4 | `409 ASSESSMENT_ACTIVE` on `POST /assessments` (one active assessment per user) isn't turned into "resume"; it relies on a sessionStorage id that is lost in a new browser. | `pages/Ready.tsx` |
| G5 | The report page doesn't render `claims` (demonstrated / not demonstrated / not tested), and nothing uses `GET /reports` (report history, paginated with `next_cursor` → `?before=`). | `pages/Report.tsx` |
| G6 | **Finish assessment** only exists in demo mode; the backend has **no early-finish endpoint**. | `components/FinishAssessment.tsx`, `Workspace.tsx:77,105` |
| G7 | 8 of the 11 design PNGs are missing from the zip (01, 05–11). `Ready.tsx` shows `/designs/07-coding-workspace.png` → broken image. `/landing` and `designs.html` reference them too. | `public/designs/` |
| G8 | No `vercel.json`, so the `/api/:path*` rewrite to the VM backend (LOCKED deployment decision) is missing. | `src/frontend/` |
| G9 | The 3.7 MB Workspace chunk: Monaco is not split out. | `vite.config.ts` |
| G10 | Error codes the UI must map to clear messages: `SEED_TOPIC_UNAVAILABLE` (422: the portfolio claims no `arrays`, so no question can be served; tell the candidate to add arrays to `dsa_topics_solved`), `SANDBOX_UNAVAILABLE` (503), `LLM_UNAVAILABLE` (503), `EXECUTION_IN_PROGRESS`, `HINTS_EXHAUSTED`, `HINT_IN_PROGRESS`, `ASSISTANT_IN_PROGRESS`, `UNLOCK_NOT_AVAILABLE`, `ASSESSMENT_FINISHED`, `PORTFOLIO_REQUIRED`, `PERSISTENCE_UNAVAILABLE`, 429 with `Retry-After`. | `lib.tsx` `ErrorNotice` |

---

## Prompt 1 — publish the local validation commit 047d5d9 and reconcile PR #58

```
You are on Pranav's Mac in the TorqueCode repo (vudigapranav/HFT26-TEAM-36). Read CLAUDE.md, docs/BACKEND_DECISIONS.md, docs/reviews/2026-10-31-independent-validation.md and docs/status/*.md first.

1. `git fetch origin`. Branch `pranav/independent-task-validation` has a LOCAL-ONLY commit 047d5d9 ("fix(validation): verify trusted task families with independent oracles"), based on b0fad23. Confirm with `git log --oneline -3 pranav/independent-task-validation` and `git status` (must be clean).
2. Rebase it onto origin/main if main moved. Resolve conflicts by keeping the independent-oracle verification (semantic_verified, structural_valid, family provenance). Never restore the earlier path where the reference supplies its own expected answers.
3. Run: `pnpm install --frozen-lockfile --ignore-scripts && pnpm typecheck && pnpm build && RUNNER=docker TORQUECODE_REQUIRE_DB=1 TORQUECODE_ALL_DB_TESTS=1 pnpm test:auth && pnpm test:python && pnpm ownership:check`. Report the exact counts. Do not call anything "verified" that was skipped.
4. Push the branch and open a PR to vudigapranav/HFT26-TEAM-36 main (NEVER base cbitosc). The body says what changed, the exact test results and the limitations from the handoff (Python only, 4 reviewed families, finite oracle checks, no live provider verified).
5. Check PR #58 (karthik/k8-final). List every test or code path that assumes a fallback seed needs no semantic verification, or that accepts `valid:true` / fixture / unavailable as verified. Do NOT edit Karthik's files on his branch. Post a PR comment on #58 listing the exact changes he needs to rebase onto the validation PR.
6. Merge the validation PR only if every step-3 check passed with no skips of the required suites. Use squash or merge as the repo has done before, authored as vudigapranav, no Co-Authored-By trailers.
7. Append what you did and the exact results to docs/status/pranav.md (on a new pranav/ branch + PR if main moved).
```

## Prompt 2 — make the frontend a real, live-only client of the current backend

```
You are on branch pranav/frontend-import (git fetch; rebase onto origin/main first; keep its pnpm-lock.yaml changes). Read CLAUDE.md (the LOCKED unlock rule and the deployment decision), docs/TorqueCode_Context.md §5, §11, §13, §14, docs/BACKEND_DECISIONS.md (K2, K9, K10, K11 and the independent-validation sections), docs/prompts/now/FRONTEND_INTEGRATION.md (gap table G1–G10), and every file under src/frontend/src.
Rules: never invent an endpoint or field. Every request and response type must come from @torquecode/contracts (src/backend/contracts/public.ts and http.ts). If the UI needs something the backend doesn't provide, show a neutral message and list it in the PR. Don't name Novice/Adept/Master anywhere in the assessment UI (the report may). Never display hidden-test content.

Do, with tests for each:
1. G2 contracts: add "@torquecode/contracts": "workspace:*" to src/frontend/package.json, remove the tsconfig paths alias and DELETE src/frontend/src/contracts.ts; import the real types. Fix every type error the real contracts expose; those are the real API drift. Update pnpm-lock.yaml with `pnpm install --ignore-scripts` and check `pnpm install --frozen-lockfile --ignore-scripts` passes.
2. G1 live-only: live mode is the default and the only mode in production builds. Keep demo-data.mjs only for tests and for an explicit `VITE_DEMO=1` dev build; remove the footer mode switch from production. A failed live request must never fall back to sample data.
3. Auth: register (email + password 12–128 chars, confirm) → 201 → login → `/auth/me` restores the session on reload → logout clears it. Map 401/409/429 (Retry-After) to clear messages.
4. Portfolio + quiz: POST /portfolio shows profile, warnings (e.g. the empty-topic arrays/strings fallback) and injection_flags; field errors per field. GET/POST /onboarding-quiz.
5. G3/G4 start: POST /assessments → poll GET /assessments/:id/status every 2 s while generation.status is queued|generating|validating, showing progress and each receipt (gate, pass/fail/skipped, reason; show semantic verification when present, and source generated vs seed_bank). Only call GET /tasks/:id when the status is ready or there's no generation field. Handle 409 ASSESSMENT_GENERATING by continuing to poll. On 409 ASSESSMENT_ACTIVE, find and resume the active assessment. If the backend has no way to find it without a stored id, say so in the PR and show "You already have an active assessment" with a resume action using the stored id.
6. Workspace: server timer from remaining_sec/expires_at (re-sync every 15 s), autosave PUT .../files (exact editable set only), Run/Submit, show only visible test details plus hidden aggregates, the "Unlock next questions" button only when unlock_available is true (max 2), neutral "Question set N" labels, Hint and Assistant panels only when questions[i].assistant_enabled is true. Integrity events (tab_hidden/tab_visible/copy/paste) batched to /events only while the workspace is mounted. G10 error mapping.
7. G6 finish: there's no early-finish endpoint. In live mode replace "Finish assessment" with "Submit all questions": submit each available question, then tell the candidate the session ends when the timer reaches 0 and the report is live meanwhile (GET /reports/:id works during an active session as a current snapshot). Don't fake a finished state. List "early finish endpoint" as a backend request for Karthik in the PR; don't add it yourself.
8. G5 report: render total score, per-task rows (level names allowed here), pass rates, time, hints, AIE breakdown, integrity signals, claims (demonstrated / not demonstrated / not tested) and focus areas. Add a "Past reports" page using GET /reports with next_cursor → ?before=.
9. G7: remove every reference to a missing design PNG (Ready.tsx's 07 image, designs.html, landing) or replace it with an asset that exists in the repo. Make sure `grep -rn "designs/" src/frontend` points only to files that exist.
10. G9: lazy-load Monaco in its own chunk (manualChunks or dynamic import) so the initial bundle has no editor code. Report the chunk sizes before and after.
Then: `pnpm --filter torquecode-frontend build`, `pnpm --filter torquecode-frontend test`, `pnpm --filter torquecode-frontend run test:ui`, `pnpm typecheck`, `pnpm ownership:check`. Commit as vudigapranav (no Co-Authored-By trailers) in small commits, push and update the PR. Don't merge yet; Prompt 3 is the gate.
```

## Prompt 3 — merge gate: real end-to-end run against main (after Prompt 2 is pushed)

```
You are on Pranav's Mac in the TorqueCode repo. Read CLAUDE.md, docs/BACKEND_DECISIONS.md and docs/prompts/now/FRONTEND_INTEGRATION.md.
Nothing counts unless it actually ran. Report every step as pass/fail with the evidence (status code, screenshot path, test output). Never print or commit secrets.

0. Sync: `git fetch origin`. Check that PR #63 (pranav/arrays-families) is merged into main (`gh pr view 63`). If it isn't, stop and tell me; don't continue on an old main. Then on pranav/frontend-import: `git pull --rebase origin pranav/frontend-import && git rebase origin/main`, then `pnpm install --frozen-lockfile --ignore-scripts && pnpm typecheck && pnpm build`.
1. Backend, real stack, on a fresh dedicated database (never an existing one):
   - Postgres 16 (docker run --rm -d --name tc-e2e-pg -e POSTGRES_PASSWORD=<random> -p 127.0.0.1:55432:5432 postgres:16), DATABASE_URL=postgres://postgres:<random>@127.0.0.1:55432/postgres
   - `pnpm db:migrate`
   - `docker build -t torquecode-runner-python:dev src/backend/runner/images/python`
   - Start the backend: APP_MODE=auth RUNNER=docker AUTH_ORIGIN=http://127.0.0.1:4177 PORT=3001, plus FEATHERLESS_API_KEY and the model variables from my private .env if present.
   - `curl -s http://127.0.0.1:3001/health` must show runner_available:true.
2. Frontend: `pnpm --filter torquecode-frontend dev` (127.0.0.1:4177; Vite proxies /api to 3001 and strips the prefix).
3. Write src/frontend/tests/e2e/journey.spec.ts with Playwright (use the installed Chromium; don't run `playwright install` if it's already there) and run it headless against http://127.0.0.1:4177. Steps:
   a. register a new random email + 14-char password → login → reload the page and confirm the session survives (/auth/me)
   b. upload src/backend/tests/fixtures/portfolios/normal-web.json → profile and warnings show → quiz → start
   c. the generation-progress screen shows receipts → questions appear (no Novice/Adept/Master text anywhere: assert on page text)
   d. Question set 1: edit a file, Run (visible results), Submit every question → "Unlock next questions" appears → unlock
   e. Question set 2: the hint and assistant panels are visible. Ask for a hint; send one assistant message (accept a reply, or the clean "assistant unavailable" message on 503 LLM_UNAVAILABLE). Submit every question → unlock
   f. Question set 3: one Master question is present. Submit it. No further unlock button. Calling POST /tier/upgrade via fetch returns 409.
   g. paste text into the editor (integrity signal), reload mid-session (timer and edited files restored)
   h. "Submit all questions" → open the report: total score, per-task rows with level names, pass rates, AIE breakdown, integrity signals, claims (demonstrated / not demonstrated / not tested)
   i. Past reports lists this report → logout → login → the report still opens
   j. negative: a second browser context with a portfolio that has no arrays (src/backend/tests/fixtures/portfolios/typo-topics.json) shows the SEED_TOPIC_UNAVAILABLE message, not a blank screen
4. Save screenshots of every step to src/frontend/tests/e2e/screenshots/ (gitignored) and fix every frontend bug you find. Re-run until all steps pass. Backend bugs: don't edit Karthik's or Rithvik's files; write the exact reproduction (request, response, expected) into the PR body and tell me.
5. Also run: `pnpm --filter torquecode-frontend test`, `pnpm --filter torquecode-frontend run test:ui`, `pnpm ownership:check`.
6. When every step passes: push (commits as vudigapranav, no Co-Authored-By trailers), update PR #59's body with the step table and exact results, append to docs/status/pranav.md, then merge #59. Stop the Postgres container you started.
```

## Prompt 4 — deploy: Vercel frontend + VM backend

```
Read CLAUDE.md (deployment decision), deploy/README.md and docs/status/rithvik.md.
1. Get the backend's public HTTPS host from Rithvik's deploy notes (R6b). If it isn't written down anywhere, STOP and ask me. Never invent a hostname.
2. Add src/frontend/vercel.json:
   {"framework":"vite","installCommand":"pnpm install --frozen-lockfile --ignore-scripts","buildCommand":"pnpm --filter torquecode-frontend build","outputDirectory":"dist",
    "rewrites":[{"source":"/api/:path*","destination":"https://<BACKEND_HOST>/:path*"},{"source":"/((?!api/|landing/|designs/|assets/).*)","destination":"/index.html"}]}
   Check against the Vercel docs (use Context7 or the web) that the root directory and pnpm workspace settings are right for a monorepo with the project root at src/frontend; adjust and explain.
3. Tell me the exact VM env to set: APP_MODE=auth, RUNNER=docker, TRUST_PROXY=true, AUTH_ORIGIN=https://<vercel-production-domain>, DATABASE_URL, FEATHERLESS_API_KEY + model vars. The backend must only be reachable through the proxy path that sets x-forwarded-for.
4. Deploy (vercel CLI if I'm logged in, otherwise give me the dashboard steps), then run Prompt 3's Playwright journey against the Vercel URL with BASE_URL=<vercel url> from a clean browser context. Record the results in docs/status/pranav.md and docs/demo/.
5. Branch pranav/deploy-vercel, PR, merge after the journey passes.
```

## Prompt 5 — feature freeze, demo safety and submission

```
Read CLAUDE.md, docs/TorqueCode_Context.md §13 and §17, docs/demo/*, README.md and every docs/status/*.md.
1. README: problem, solution, architecture diagram (frontend Vercel → /api rewrite → Fastify + Postgres + R3 Docker runner + Featherless), setup (exact commands that actually work today), the live demo link, test results with dates, honest limitations (context §17 plus: Python only, 6 reviewed task families, finite oracle checks, measured performance workload, portfolios without arrays are refused with a clear message). Every claim must point to a test or a file; remove anything unverified.
2. Demo safety: pre-create one demo account and a completed report on the deployed app (record the email only in my private notes, never in the repo); record a 3–4 minute screen capture of the full journey as a backup.
3. Run the release check (pnpm release:check or the script in scripts/ if present) and the attack suite v2 against the deployed URL; paste the counts.
4. Final status entries for everyone in docs/status/*.md; check for unmerged PRs and list them for me.
5. Don't open the submission PR to cbitosc yourself. Prepare its title "[SUBMISSION] TEAM-36 - PAARK - <track>" and body in docs/demo/submission.md and tell me when it's ready; I'll open it.
```
