# Akshit — FINAL frontend plan (OpenCode) · 31 Oct 04:45

> Replaces every older Akshit file (`AKSHIT_Frontend_Plan.md` is history). Built against **main @ 19df7ff**: K10 question sets + guarded assistant and K5 validation are merged, so **every endpoint below is real today**.
> You are the only frontend developer. Everything lives in `src/frontend/`. Branches `akshit/f<n>-<name>`. PR base `vudigapranav/HFT26-TEAM-36` → `main` (never cbitosc). Pranav's Claude reviews and merges.
> **This is the part judges see first — make it look like a real product.**

## 0. Rules that matter most (product decisions, locked)

1. **One 60-minute countdown** for the whole assessment (server `remaining_sec`), no per-level timers.
2. **Never show "Novice", "Adept" or "Master"** (or any level/tier bar) anywhere in the assessment screens. Questions are "Question 1, 2, 3…" (or their title). The **report** may show levels.
3. **"Unlock next questions"** button appears **only** when the backend says `unlock_available === true`; hide after `unlocks_used === 2`. Earlier questions stay clickable.
4. **Hint button + AI assistant panel only when the question has `assistant_enabled === true`.**
5. Tab-switch / copy / paste are captured **only on the coding screen**, sent in batches to `/events`.
6. Never compute grades in the browser; never show hidden test contents; never put a key in the frontend.

---

## 1. Stack

Vite + React + TypeScript · `@monaco-editor/react` · `react-router-dom` · plain `fetch` wrapper · CSS variables (or Tailwind if faster) · types from `@torquecode/contracts` (`src/frontend` is already in the pnpm workspace: add `"@torquecode/contracts": "workspace:*"` and `import type { … } from '@torquecode/contracts'`).

## 2. Talking to the backend

- Local: backend `APP_MODE=auth AUTH_ORIGIN=http://localhost:5173 pnpm dev` (port 3001). Vite proxy `/api` → `http://127.0.0.1:3001`, **strip `/api`**, keep the Origin header (`changeOrigin: false`).
- Production (later): Vercel, with `vercel.json` rewriting `/api/:path*` → the cloud VM (Rithvik gives the host). The code doesn't change: **always call relative `/api/...` URLs.**
- JSON bodies (`Content-Type: application/json`), cookies are automatic (HttpOnly; no tokens in JS).
- Errors always look like `{ error: { code, message, request_id, fields? } }` → show `message`; on the portfolio screen show `fields[]` next to the right input.

## 3. API map (exact, from `src/backend/contracts/public.ts` on main)

| Screen | Call | Body → Response |
|---|---|---|
| Login | `POST /api/auth/register` | `{email, password(12–128)}` → 201 `{user:{user_id,email}}` · 409 if exists |
| | `POST /api/auth/login` | same → 200 `{user}` · 401 bad credentials · 429 too many attempts |
| | `GET /api/auth/me` · `POST /api/auth/logout` | → `{user}` / 204 |
| Portfolio | `POST /api/portfolio` | portfolio JSON → `{profile:{domain, domain_confidence, claimed_topics[], tech_stack[], skills[]}, warnings[], injection_flags[]}` · 400 with `fields[]` |
| Quiz | `GET /api/onboarding-quiz` | → `{questions:[{id, prompt, options:[{id,text}]}]}` |
| | `POST /api/onboarding-quiz` | `{answers:[{question_id, option_id}]}` → `{focus_lane:{domain, skills[], topics[]}}` |
| Start | `POST /api/assessments` | `{}` → 201 **AssessmentState** · 409 already active · 422 `SEED_TOPIC_UNAVAILABLE` |
| Coding | `GET /api/assessments/:id/status` | → **AssessmentState** |
| | `GET /api/assessments/:id/tasks/:taskId` | → `{task_id, title, statement_md, files:[{path, content, editable}], visible_tests:[{id,path,content}], dsa_topics[], task_type, language, domain, source, assistant_enabled}` · 403 `TASK_LOCKED` |
| | `PUT /api/assessments/:id/tasks/:taskId/files` | `{files:[only the editable files]}` → `{ok:true}` |
| | `POST /api/assessments/:id/tasks/:taskId/run` | `{}` (uses saved files) → **RunResult** |
| | `POST /api/assessments/:id/tasks/:taskId/submit` | `{}` → **RunResult** (hidden tests only as `hidden:{passed,total}`) |
| | `POST /api/assessments/:id/tier/upgrade` | `{}` → **AssessmentState** · 409 `UNLOCK_NOT_AVAILABLE` |
| | `POST /api/assessments/:id/hint` | `{task_id}` → `{level, text}` · 403 `ASSISTANCE_DISABLED` · 409 `HINTS_EXHAUSTED` |
| | `POST /api/assessments/:id/assistant` | `{task_id, message(≤2000), history?:[{role:'user'|'assistant', content}] (≤12)}` → `{blocked:false, reply}` or `{blocked:true, reason}` · 403 · 503 `LLM_UNAVAILABLE` |
| | `POST /api/assessments/:id/events` | `{events:[{task_id, client_ts, type:'tab_hidden'|'tab_visible'|'copy'|'paste', payload:{size?}}]}` (≤100) → `{ok:true}` |
| Report | `GET /api/reports/:reportId` | → `{final_score, outcome, tasks:[{task_id, passed, total, time_sec, hints_used, aie:{score,max,independence,hint_yield,test_discipline,gate}|null}], focus_areas[], integrity_signals:[{type,count}]}` |

**AssessmentState** = `{assessment_id, report_id, task_id, available_task_ids[], questions:[{task_id, assistant_enabled}], unlock_available, unlocks_used (0–2), status:'active'|'finished', started_at, expires_at, remaining_sec, runner_available?, auto_submit_error?}`
**RunResult** = `{run_id, task_id, mode, visible:[{id, status:'pass'|'fail'|'error'|'timeout', duration_ms}], hidden:{passed,total}|null, passed, total, stdout, stderr, timed_out}`
**503 `SANDBOX_UNAVAILABLE`** on run/submit = the code sandbox is down → show a clear banner, **no grade**.

---

## 4. Screens, in build order

| # | Screen | What it must do |
|---|---|---|
| F0 | Setup | Vite app in `src/frontend`, proxy, fetch wrapper (`api<T>(method, path, body)` that throws the error shape), router, layout, design tokens (dark default + light), `npm run build` works |
| F1 | Landing + login/register | Tagline *"Put your code under torque."*, short pitch, login/register tabs, inline errors, redirect when logged in |
| F2 | Portfolio upload | Drop zone + paste box + "Use sample" (bundle a copy of `docs/demo/demo-portfolio.json`); show domain + confidence, claimed topics as chips, warnings (amber), injection flags (red), field errors |
| F3 | Quiz → start | ≤10 MCQs, one per card or one page; focus lane card; "Start 60-minute assessment" → `POST /assessments` → coding screen; handle 409/422 |
| F4 | **Coding screen** (most judged) | Left: question list (Question 1, 2…, solved/attempted ticks from your own run results) + statement (markdown). Center: Monaco with file tabs (read-only for non-editable files). Bottom: Run / Submit, results table (visible tests + "Hidden: 3/4 passed"), console (stdout/stderr on Run). Top bar: 60-min countdown (sync `status` every 15 s), autosave indicator, **Unlock next questions** (only when `unlock_available`). Right panel only when `assistant_enabled`: "Next hint" + chat with the assistant (blocked → "The assistant can't help with that"; 503 → "Assistant unavailable"). Autosave = debounced PUT files (~1.5 s); Run/Submit after autosave. Timer 0 or status finished → go to report |
| F5 | Integrity capture | `visibilitychange`, `copy`, `paste` (with size) on the coding screen only; batch every 10 s or 20 events |
| F6 | Report | Big final score, outcome sentence, per-question cards (passed/total bar, time, hints, AI-efficiency breakdown when present — levels may be named here), focus areas, integrity signals; simple charts |
| F7 | Polish | Loading skeletons, empty + error states everywhere, keyboard focus, works at 1366×768 and 1920×1080, no console errors |
| F8 | Vercel | `vercel.json` rewrite (Rithvik sends the backend host) + SPA fallback; build passes |

**Look & feel:** dark, focused "IDE" feel with one accent colour; generous spacing; monospace only in code/console; no emoji as icons; a real logo wordmark "TorqueCode".

---

## 5. OpenCode prompts

### 5.1 Session opener — paste at the start of every OpenCode session
```
You are working in the TorqueCode repo (team PAARK, 24-hour hackathon). I am Akshit, the ONLY frontend developer.
Read first and treat as binding: CLAUDE.md (top section = locked product rules), docs/prompts/now/AKSHIT.md (my FINAL plan: rules, API map, screens), src/backend/contracts/public.ts (exact API shapes — never invent fields), docs/status/*.md, scripts/owners.json (I may only edit src/frontend/ and docs/status/akshit.md).
Never work on main; branches start with akshit/. Never show Novice/Adept/Master in the assessment UI. Never compute grades in the browser. Never commit .env or keys.
Run: git fetch origin && git status. Reply with a 5-line summary, then wait.
```

### 5.2 Build prompt — one screen at a time
```
Build screen <F0…F8> from docs/prompts/now/AKSHIT.md §4 against the REAL backend API in §3 (types from @torquecode/contracts). Handle loading, empty and every error code listed for that screen. Keep the rules in §0. When it works in the browser against the local backend, run the Ship prompt.
```

### 5.3 Ship prompt — before every push
```
Ship this work. Stop at the first failure, explain and fix it:
1. Branch starts with akshit/ (never main). git fetch origin && git rebase origin/main.
2. Every changed file is under src/frontend/ or is docs/status/akshit.md — revert anything else.
3. API calls match docs/prompts/now/AKSHIT.md §3 exactly; no level names in assessment screens; no secrets.
4. cd src/frontend && npm run build (or pnpm build) — must pass.
5. Append to docs/status/akshit.md: ## <time> — <F#> — <summary> / Works against real backend: … / Still mocked: … / Backend needs: …
6. Commit "feat(<F#>): <summary>" and git push -u origin HEAD (never --no-verify).
7. Print https://github.com/vudigapranav/HFT26-TEAM-36/compare/main...<branch> and remind me the base must be vudigapranav/HFT26-TEAM-36.
```

---

## 6. If you can't push

Zip the whole `src/frontend` folder (without `node_modules` and `dist`) and send it to Pranav. His Claude commits it on `akshit/frontend`, reviews it and merges it.

## 7. Order of work (aim: F0–F4 working by ~07:00, F5–F7 by ~09:00)

F0 → F1 → F2 → F3 → **F4** → F6 → F5 → F7 → F8. Push after each screen, even if unpolished.
