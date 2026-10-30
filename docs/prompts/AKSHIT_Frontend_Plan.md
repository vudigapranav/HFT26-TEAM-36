# Frontend plan — Akshit (+ Pranav) · connected to the real backend

> The backend API works end to end on `main`: login → portfolio → quiz → assessment → run → hint → submit → report.
> The frontend doesn't exist yet. The judges see it, so it's now the top priority.
> All frontend code lives in `src/frontend/` (owned by Akshit and Pranav). Branches: `akshit/f…` and `pranav/f…`.
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

## 4. Screens and who builds them

| # | Screen | Owner | Must show |
|---|---|---|---|
| F0 | Project setup, proxy, API client, layout, routing | **Akshit** | `src/frontend` Vite app; `api.ts` wrapper (JSON, error parsing, 401 → login) |
| F1 | Landing + register/login | Akshit | Product line "Put your code under torque"; field errors; logout |
| F2 | Portfolio upload | **Pranav** | JSON drop zone + paste box + "use sample" button (`tests/fixtures/portfolios/normal-web.json`); field errors; parsed result: domain + confidence, claimed topics, **warnings** (yellow), **injection flags** (red) |
| F3 | Quiz → focus lane | Pranav | ≤10 MCQs, one per screen or one list; result card with lane domain/topics/skills |
| F4 | **Coding environment** (the main screen) | **Akshit** | file tabs + Monaco; Run / Submit; test results table (visible tests with status, hidden as "3/3 pass"); output console (run only); **server-synced timer** (poll status every 15 s, count down locally); tier bar (Novice active; Adept/Master locked until K10); **Hint** button with level badge (disabled in Novice once K10 lands); assistant panel placeholder (Adept/Master); autosave indicator (debounced PUT ~1.5 s after typing) |
| F5 | Integrity capture (inside F4 only) | Akshit | `visibilitychange` → tab_hidden/tab_visible; `copy`/`paste` on the editor (paste `size` = text length); batch and send every 10 s or 20 events; **only while the coding screen is open** |
| F6 | Report | Pranav | big final score /100; outcome; per-task cards (passed/total, time, hints, AI breakdown: independence, hint yield, test discipline, gate); focus areas; integrity signals; "Start a new assessment" |
| F7 | Generation progress (stub now) | Pranav | progress steps + validation receipts (filled in when K6 lands; static "seed task ready ✓" today) |
| F8 | Polish + demo path | both | loading/empty/error states, responsive down to 1280 px laptop, consistent design, a scripted demo run |

**Order:** F0 (Akshit) → F1 + F2 in parallel → F3 + F4 → F5 + F6 → F7 + F8.

---

## 5. Rules

- Never show or store anything secret: no reference code or hidden test contents. The API already withholds them, so don't add workarounds.
- Never compute grades in the browser. Show what the API returns.
- Server time wins: the timer comes from `remaining_sec`; on 0, call status and move to the report.
- Every async action shows loading, success and error states. Disable buttons while a request is in flight (prevents double-submit).
- Only commit inside `src/frontend/` (plus your own status log). The pre-push hook blocks anything else.
- Small commits, push at least every 30 minutes, `/ship` before every push.

---

## 6. Prompts (Claude Code)

**F0 — Akshit (do first):**
```
I'm Akshit (frontend). Branch akshit/f0-setup from origin/main. Read docs/prompts/AKSHIT_Frontend_Plan.md fully,
plus src/backend/README.md (frontend setup section) and src/backend/contracts/public.ts.
Create src/frontend: Vite + React + TypeScript, react-router-dom, @monaco-editor/react. Dev server on localhost:5173
with the /api proxy from §2 (strip /api, keep Origin). Add src/frontend/src/api.ts: typed fetch wrapper for every
call in §3 (JSON bodies, parse { error: { code, message, fields } }, 401 → redirect to /login). Routes: /, /login,
/portfolio, /quiz, /assessment/:id, /report/:id. A simple app shell (header with product name + logout) and CSS
variables for colors/spacing (light + dark). Types: import from '@torquecode/contracts' if src/frontend is in
pnpm-workspace.yaml; otherwise define minimal local types in src/types.ts with a TODO to switch.
Add an npm script "dev", "build", "typecheck". Verify: pnpm --dir src/frontend build passes; with the backend running
(APP_MODE=auth, AUTH_ORIGIN=http://localhost:5173) GET /api/auth/me returns 401 through the proxy.
Then /ship.
```

**F4 + F5 — Akshit (the main screen):**
```
Branch akshit/f4-coding-screen from origin/main. Build /assessment/:id per §4 F4 and F5 of
docs/prompts/AKSHIT_Frontend_Plan.md, using the api.ts client.
On load: GET status + GET task. Left: statement (markdown) and visible tests. Center: file tabs + Monaco (read-only for
non-editable files). Right/bottom: results table, output console, hint panel, assistant placeholder.
Autosave: debounced PUT files. Run/Submit: POST with {} after a successful autosave; render visible tests and the hidden
aggregate; on 503 SANDBOX_UNAVAILABLE show a clear banner (no grade). Timer: server remaining_sec, poll status every 15 s.
Tier bar: Novice active, Adept/Master locked (wired to /tier/upgrade later). Hint: POST hint, show level + text, 409 → "no
hints left". Integrity: visibilitychange/copy/paste → batched POST events only while this screen is mounted.
On timer 0 or after Submit, offer "View report" → /report/:reportId. Then /ship.
```

**F2 + F3 + F6 — Pranav:**
```
Branch pranav/f2-portfolio-quiz-report from origin/main (after Akshit's F0 is merged). Read
docs/prompts/AKSHIT_Frontend_Plan.md §3–§4. Build /portfolio (F2), /quiz (F3) and /report/:id (F6) using api.ts.
Portfolio: drop zone + textarea + "Use sample" (bundle a copy of tests/fixtures/portfolios/normal-web.json into
src/frontend/src/samples/), show field errors, and the parsed profile with warnings (yellow) and injection flags (red).
Quiz: render questions, submit answers, show the focus lane, then POST /assessments and navigate to
/assessment/:id (handle 422 SEED_TOPIC_UNAVAILABLE with a clear message: "the current demo task needs arrays").
Report: final score, outcome, per-task cards with the AI-efficiency breakdown, focus areas, integrity signals.
Then /ship.
```
