# Frontend integration — Claude Code prompts for Pranav (31 Oct, 07:10)

Run these **in order**, one Claude Code session each (`/clear` between them), on Pranav's Mac in the repo.
Every commit is authored as `vudigapranav <vudigapranav@gmail.com>`; **no `Co-Authored-By` trailers**. Never push to `main`, never `--no-verify`, never commit `.env`.

## What is already done (verified, not assumed)

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
| G10 | Error codes the UI must map to clear messages: `SANDBOX_UNAVAILABLE` (503), `LLM_UNAVAILABLE` (503), `EXECUTION_IN_PROGRESS`, `HINTS_EXHAUSTED`, `HINT_IN_PROGRESS`, `ASSISTANT_IN_PROGRESS`, `UNLOCK_NOT_AVAILABLE`, `ASSESSMENT_FINISHED`, `PORTFOLIO_REQUIRED`, `PERSISTENCE_UNAVAILABLE`, 429 with `Retry-After`. | `lib.tsx` `ErrorNotice` |

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

## Prompt 3 — real end-to-end run (the merge gate)

```
On branch pranav/frontend-import after Prompt 2. Run the REAL stack locally. Nothing counts unless it actually ran.
1. Backend: dedicated fresh Postgres DB; `pnpm db:migrate`; build the runner image (docker build -t torquecode-runner-python:dev src/backend/runner/images/python, plus the R3 grader image per docs/BACKEND_DECISIONS.md); start with APP_MODE=auth RUNNER=docker AUTH_ORIGIN=http://127.0.0.1:4177 DATABASE_URL=... and FEATHERLESS_API_KEY from my private .env (never print or commit it). Check /health says the runner is available.
2. Frontend: `pnpm --filter torquecode-frontend dev` on 127.0.0.1:4177 (Vite proxies /api to 3001 and strips the prefix).
3. With Playwright (Chromium is installed; don't reinstall), script and run the full journey: register a new email → login → upload src/backend/tests/fixtures/portfolios/<normal>.json → quiz → start → wait through generation progress → Question set 1: edit, Run, Submit each question → Unlock next questions → set 2: Hint, Assistant message (expect a reply, or a clean 503 LLM_UNAVAILABLE message if there's no key), Submit all → Unlock → set 3: Submit all → open the report (scores, claims, AIE, integrity) → Past reports → logout → login again → the report is still there. Also: reload mid-assessment (timer and files restored); try a third unlock (must be refused); paste text (integrity signal appears in the report).
4. Save the Playwright script as src/frontend/tests/e2e/journey.spec.ts plus screenshots in the scratch folder. Report each step pass/fail. Fix frontend bugs you find; for backend bugs, write a precise issue for Karthik/Rithvik and don't edit their files.
5. Only when every step passes: update docs/status/pranav.md and the PR body with the exact results, then merge the PR (as vudigapranav, no trailers).
```

## Prompt 4 — Vercel config (after Rithvik's VM backend URL exists)

```
Add src/frontend/vercel.json: framework vite, buildCommand "pnpm --filter torquecode-frontend build", outputDirectory "dist", rewrites [{"source":"/api/:path*","destination":"https://<BACKEND_HOST>/:path*"}] then the SPA fallback. Use the real backend host from Rithvik's deploy notes (docs/status/rithvik.md / deploy/); if it isn't there, stop and ask me; never invent a hostname. Remind me to set AUTH_ORIGIN=<vercel production URL> and TRUST_PROXY=true on the VM. Then deploy and repeat Prompt 3's journey against the Vercel URL (from a clean browser profile) and record the results.
```
