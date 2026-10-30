# Frontend plan — Akshit (sole frontend owner) · connected to the real backend

> The backend API works end to end on `main`: login → portfolio → quiz → assessment → run → hint → submit → report.
> The frontend doesn't exist yet. The judges see it, so it's now the top priority.
> **Akshit builds the whole frontend** using **OpenCode**. Pranav reviews and merges; Pranav's assistant reviews every PR.
> All frontend code lives in `src/frontend/`. Branches: `akshit/f<n>-<name>`.
> PR base is always `vudigapranav/HFT26-TEAM-36` `main`, never cbitosc.

---

## 1. Stack (decided)

| Area | Choice | Why |
|---|---|---|
| Build | **Vite + React + TypeScript** | Fast to set up; TypeScript matches the backend so the API types are shared |
| Editor | **Monaco** (`@monaco-editor/react`) | The team's pick; VS Code-like multi-file editing |
| Routing | `react-router-dom` | 7 screens |
| Data | Plain `fetch` wrapper + React state | No extra state library needed in 24 hours |
| Styling | Plain CSS with variables, or Tailwind if Akshit is faster with it | Keep it simple and consistent |
| Types | `@torquecode/contracts` (the backend's public schemas) | One source of truth; never hand-copy API types |

**Workspace (one line, Karthik's file):** add `- src/frontend` to `pnpm-workspace.yaml`. Then in `src/frontend/package.json`:
`"@torquecode/contracts": "workspace:*"` and import types like `import type { Task, RunResult, Report } from '@torquecode/contracts'`.
Until Karthik merges that line, build the screens against mock data with locally named types, and switch to the
contracts package the moment it's on `main`.

---

## 2. Connecting to the backend (exactly as Karthik's README says)

- Start the backend: `APP_MODE=auth`, `DATABASE_URL=<local postgres>`, **`AUTH_ORIGIN=http://localhost:5173`**, then `pnpm db:migrate` and `pnpm dev` (port 3001).
- Vite dev proxy: `/api` → `http://127.0.0.1:3001`, **strip the `/api` prefix**, and keep the browser's Origin header.
- Always call relative URLs (`/api/auth/login`), using the **same hostname** (`localhost`) everywhere.
- Every POST/PUT must send JSON (`Content-Type: application/json`). The browser adds the Origin header itself.
- Login uses HttpOnly cookies, so there's no token handling in JS. Use `credentials: 'same-origin'` (the default).

```ts
// vite.config.ts (sketch)
server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false,
  rewrite: p => p.replace(/^\/api/, '') } } }
```

---

## 3. API map (backend paths, call as `/api<path>`)

| Screen | Call | Request → response | Errors to handle |
|---|---|---|---|
| Register / login | `POST /auth/register`, `POST /auth/login` | `{email, password}` (password 12–128 chars) → `{user}` + cookie | 400 fields, 401, 429 rate limit |
| Session check | `GET /auth/me` | → `{user}` | 401 → login page |
| Logout | `POST /auth/logout` | → 204 | — |
| Portfolio upload | `POST /portfolio` | portfolio JSON → `{profile, warnings, injection_flags}` | 400/422 `error.fields[]` per field; 413 too large |
| Quiz | `GET /onboarding-quiz` | → `{questions:[{id, prompt, options:[{id,text}]}]}` | 4xx if no portfolio yet |
| Quiz answers | `POST /onboarding-quiz` | `{answers:[{question_id, option_id}]}` → `{focus_lane:{domain, skills, topics}}` | 4xx bad answers |
| Start | `POST /assessments` | `{}` → `{assessment_id, task_id, report_id, current_tier, remaining_sec, expires_at, runner, policy_todos}` | 422 `SEED_TOPIC_UNAVAILABLE` (portfolio must claim `arrays` for the current seed task); one active assessment per user |
| Status / timer | `GET /assessments/:id/status` | → same shape; **server-owned `remaining_sec`** | — |
| Task | `GET /assessments/:id/tasks/:taskId` | → `{title, statement_md, tier, dsa_topics, files:[{path,content,editable}], visible_tests:[{id,path,content}]}` | — |
| Autosave | `PUT /assessments/:id/tasks/:taskId/files` | `{files:[{path, content, editable:true}]}` → `{ok:true}` | 400 non-editable or invalid path |
| Run / Submit | `POST .../run`, `POST .../submit` | `{}` (uses saved files) or `{files:[…]}` → `{visible:[{id,status,duration_ms}], hidden:{passed,total}\|null, passed, total, stdout, stderr, timed_out}` | **503 `SANDBOX_UNAVAILABLE`**: show "runner unavailable", never a grade |
| Hint | `POST /assessments/:id/hint` | `{}` → `{level, text}` (max 3) | 409 hints used up |
| Integrity events | `POST /assessments/:id/events` | `{events:[{task_id, client_ts, type:'tab_hidden'\|'tab_visible'\|'copy'\|'paste', payload:{size?}}]}` (1–100 per call) | — |
| Report | `GET /reports/:id` | → `{final_score, outcome, tasks:[{passed,total,time_sec,hints_used,aie}], focus_areas, integrity_signals}` | — |
| Coming later | `POST /assessments/:id/tier/upgrade` (K10), `POST /assessments/:id/assistant` (R5) | build the UI with a disabled state now | 404/503 until merged |

All errors look like `{ error: { code, message, request_id, fields?: [{path, message}] } }`. Show `message`, and highlight each field from `fields`.

**Runner note:** until Karthik's K9 connects Docker, running **edited** code returns 503 (only the untouched starter or
the fixed version run). Show it clearly. The UI must work as-is when the Docker runner is connected.

---

## 4. Screens, in build order (all Akshit)

| # | Screen | Target | Must show |
|---|---|---|---|
| F0 | Setup, proxy, API client, layout, routing | 30 min | `src/frontend` Vite app; `api.ts` wrapper (JSON, error parsing, 401 → login); app shell; CSS variables (light + dark) |
| F1 | Landing + register/login | 30 min | Product line "Put your code under torque"; field errors; logout |
| F2 | Portfolio upload | 45 min | JSON drop zone + paste box + "Use sample" (bundled copy of `normal-web.json`); field errors; parsed result: domain + confidence, claimed topics, **warnings** (yellow), **injection flags** (red) |
| F3 | Quiz → focus lane → start | 30 min | ≤10 MCQs; lane card (domain/topics/skills); then `POST /assessments` → coding screen; handle 422 `SEED_TOPIC_UNAVAILABLE` |
| F4 | **Coding environment** (main screen, most judged) | 2 h | file tabs + Monaco; Run / Submit; results table (visible tests + hidden as "3/3 pass"); output console (run only); **server-synced timer**; tier bar (Novice active; Adept/Master locked until K10); Hint button + level badge; assistant panel placeholder; autosave indicator |
| F5 | Integrity capture (inside F4 only) | 30 min | `visibilitychange` → tab_hidden/tab_visible; `copy`/`paste` on the editor (paste `size`); batched POST every 10 s or 20 events; only while F4 is mounted |
| F6 | Report | 45 min | big final score /100; outcome; per-task cards (passed/total, time, hints, AI breakdown); focus areas; integrity signals; "Start new assessment" |
| F7 | Generation progress (stub until K6) | 20 min | steps + validation receipts; today a static "Seed task ready ✓" |
| F8 | Polish + demo path | rest | loading/empty/error states; 1280 px laptop layout; consistent design; a scripted demo run end to end |

**Priority if time runs short:** F0 → F1 → F2 → F3 → **F4** → F6 are the demo path. F5, F7, F8 come after.

---

## 5. Rules

- Never show or store anything secret: no reference code or hidden test contents. The API already withholds them, so don't add workarounds.
- Never compute grades in the browser. Show what the API returns.
- Server time wins: the timer comes from `remaining_sec`; on 0, call status and move to the report.
- Every async action shows loading, success and error states. Disable buttons while a request is in flight (prevents double-submit).
- Only commit inside `src/frontend/` (plus `docs/status/akshit.md`). The pre-push hook blocks anything else.
- Small commits, push at least every 30 minutes, run the **Ship prompt** before every push.

---

## 6. OpenCode prompts

**One-time setup (terminal):**
```bash
git checkout main && git pull && git config core.hooksPath .githooks
```
Run OpenCode **locally in the repo folder** so the pre-push safety hook runs on every push.

### 6.1 Session opener — paste at the start of EVERY new OpenCode session
```
You are working in the TorqueCode repo (team PAARK, 24-hour hackathon). I am Akshit, the ONLY frontend developer.
Read these first and treat them as binding rules for this whole session:
- CLAUDE.md (written for Claude Code, but every rule applies to you exactly the same)
- docs/prompts/AKSHIT_Frontend_Plan.md (my plan: stack, proxy, API map, screens F0–F8, rules)
- src/backend/README.md (frontend setup section and endpoint table)
- src/backend/contracts/public.ts (the exact API data shapes — never invent fields)
- docs/status/*.md (what the backend team changed)
- scripts/owners.json (I may only edit src/frontend/ and docs/status/akshit.md)
Never work on main; my branches start with akshit/. Never commit .env or keys. Never compute grades in the browser.
Run: git fetch origin && git status. Reply with a 5-line summary, then wait for my task.
```

### 6.2 Ship prompt — paste before EVERY push
```
Ship this work. Stop at the first failure, explain it, and fix it:
1. Branch must start with akshit/ (never main).
2. git fetch origin && git rebase origin/main (commit or stash first).
3. Re-read docs/prompts/AKSHIT_Frontend_Plan.md, src/backend/contracts/public.ts and docs/status/*.md — they may have changed.
4. List changed files (git diff --name-only origin/main...HEAD plus uncommitted). Every file must be under src/frontend/
   or be docs/status/akshit.md. Revert anything else.
5. Check: API calls match §3 exactly (paths, bodies, error shape); no secrets; no grading in the browser.
6. cd src/frontend && npm run typecheck && npm run build (or the pnpm equivalents). Must pass.
7. Append to docs/status/akshit.md:
   ## <YYYY-MM-DD HH:MM> — <F#> — <summary>
   - Changed: ...   - Backend needs: ...   - Next: ...
8. Commit "feat(<F#>): <summary>" and run: git push -u origin HEAD
   (the pre-push hook checks ownership and secrets; never use --no-verify).
9. Print: https://github.com/vudigapranav/HFT26-TEAM-36/compare/main...<branch>  (base must be vudigapranav, NOT cbitosc).
```

### 6.3 F0 — setup (first)
```
Task F0. Branch akshit/f0-setup from origin/main.
Create src/frontend: Vite + React + TypeScript, react-router-dom, @monaco-editor/react. Dev server on localhost:5173
with the /api proxy from §2 (strip /api, keep Origin). src/frontend/src/api.ts: typed fetch wrapper for EVERY call in §3
(JSON bodies, parse { error: { code, message, fields } }, 401 → redirect to /login). Routes: /, /login, /portfolio,
/quiz, /assessment/:id, /report/:id. App shell (header: TorqueCode + logout) and CSS variables (light + dark).
Types: import from '@torquecode/contracts' if src/frontend is listed in pnpm-workspace.yaml; otherwise minimal local
types in src/types.ts with a TODO to switch. Scripts: dev, build, typecheck.
Verify: build passes; with the backend running (APP_MODE=auth, AUTH_ORIGIN=http://localhost:5173) GET /api/auth/me
returns 401 through the proxy. Then run the Ship prompt.
```

### 6.4 F1 + F2 + F3 — login, portfolio, quiz
```
Task F1–F3. Branch akshit/f1-f3-onboarding from origin/main. Follow §3–§4.
F1 /login: register + login forms, field errors from error.fields, 429 message, then go to /portfolio; logout in header.
F2 /portfolio: drop zone + textarea + "Use sample" (copy tests/fixtures/portfolios/normal-web.json into
src/frontend/src/samples/); POST /portfolio; show field errors, or the parsed profile: domain + confidence, claimed
topics, warnings (yellow), injection flags (red). Button → /quiz.
F3 /quiz: GET questions, one answer each, POST answers, show the focus lane card, then "Start assessment" →
POST /assessments → /assessment/:assessment_id (store task_id and report_id). 422 SEED_TOPIC_UNAVAILABLE →
"The current demo task needs a portfolio that claims arrays."
Then run the Ship prompt.
```

### 6.5 F4 + F5 — coding screen (the most important)
```
Task F4–F5. Branch akshit/f4-coding-screen from origin/main. Build /assessment/:id per §4 F4 and F5.
On load: GET status + GET task. Left: statement (markdown) + visible tests. Center: file tabs + Monaco (read-only for
non-editable files). Right/bottom: results table, output console, hint panel, assistant placeholder.
Autosave: debounced PUT files (~1.5 s). Run/Submit: POST {} after a successful autosave; render visible tests and
the hidden aggregate; on 503 SANDBOX_UNAVAILABLE show a clear banner (no grade). Timer: server remaining_sec, poll
status every 15 s, count down locally. Tier bar: Novice active; Adept/Master locked (upgrade wired later). Hint: POST,
show level + text; 409 → "No hints left". Integrity: visibilitychange/copy/paste → batched POST events only while
this screen is mounted. After Submit or timer 0 → "View report" → /report/:reportId.
Then run the Ship prompt.
```

### 6.6 F6 + F7 — report + progress
```
Task F6–F7. Branch akshit/f6-report from origin/main.
F6 /report/:id: GET report → big final score /100, outcome, per-task cards (passed/total, time, hints, AI breakdown:
independence, hint yield, test discipline, gate), focus areas, integrity signals, "Start new assessment".
F7: a progress component shown between quiz and coding screen: steps + validation receipts (static "Seed task
ready ✓" today; wire to GET status progress when K6 lands). Then run the Ship prompt.
```

### 6.7 F8 — polish (after the demo path works)
```
Task F8. Branch akshit/f8-polish. Loading/empty/error states everywhere, disabled buttons in flight, 1280 px laptop
layout, consistent spacing/typography/colors, keyboard focus states. Walk the full demo path twice from a clean
browser and fix every rough edge. Then run the Ship prompt.
```
