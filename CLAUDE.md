# TorqueCode — rules for every Claude Code session

Several people build this repo at the same time from separate Claude Code setups (Karthik, Rithvik, Pranav; sometimes Akshit and Aryan). These rules keep the code consistent. Follow them in every session.

## ⚠️ Latest product decision — read before any assessment, tier, API or UI work

**Question-set unlock rule [LOCKED — Pranav, 2026-10-31 03:00; replaces the earlier 15/20/25-minute split and the "all tests pass" unlock].**
- **One 60-minute session, one timer, no per-level time budgets.**
- **Everyone starts on the Novice question set.** A candidate who never unlocks spends the whole 60 minutes on Novice questions.
- **Unlock condition = attempted, not solved.** Once the candidate has **attempted every question in the current set** (attempted = at least one **Submit** on that question; the answer does **not** need to be correct), an **"Unlock next questions"** button appears. Unlocking is the candidate's choice.
- **At most 2 unlocks** per session: Novice set → Adept set → Master set.
- **Never name the level in the assessment UI.** No "Novice / Adept / Master" labels, no named tier bar. Show only "Unlock next questions" (and, if needed, neutral labels like "Question set 2"). The backend still tracks the tier internally (`novice | adept | master`), because the PS tiers drive which questions are served, the AI rules and scoring.
- **Earlier questions stay open** after unlocking; the candidate can go back and keep improving them until time runs out. No demotion.
- **AI help (hints + guarded assistant) only on Adept/Master questions** (PS). The UI shows the assistant panel on those questions without naming the level.
- The **report** (after the session) may name the levels: per-level results are part of the PS's task-wise metrics.
- Scoring is unchanged: AIE only for Adept/Master questions; a session with no attempted Adept/Master question scales correctness to 100 (§12, Q4).

Full text: `docs/TorqueCode_Context.md` §5 and §15 (Q1/Q3). Anything in older prompts, status logs or code comments that says 15/20/25 minutes, "unlock when all tests pass" or shows "Novice/Adept/Master" in the assessment UI is **superseded**.

**Deployment + ownership decision [LOCKED — Pranav, 2026-10-31 03:50].**
- **Frontend on Vercel; backend + Docker sandbox + PostgreSQL on one cloud VM with Docker** (not AWS). Vercel can't start containers, so the backend never runs on Vercel.
- **Same-origin through Vercel:** the Vercel app rewrites `/api/:path*` → `https://<backend-host>/:path*`. The browser only ever talks to the Vercel origin, so cookies stay first-party (`__Host-`, Secure, SameSite=Lax) and **no CORS** is added. `AUTH_ORIGIN` = the Vercel production URL.
- **Behind that proxy the backend must read the client IP from a trusted proxy header** (e.g. `x-forwarded-for` / `x-real-ip`, only when an explicit `TRUST_PROXY` setting is on); otherwise every user shares Vercel's IP and the login rate limit blocks everyone.
- **This is a shipping app, not a demo toy:** everything a candidate creates (profile, assessment, question sets, files, runs, events, reports, report history per user) is stored in **PostgreSQL**, survives restarts, and has no 100-item in-memory cap (Karthik, K11).
- **All the AI must work for real** (updated 04:17): **Karthik builds K5** (deterministic validation engine) right after K10, then **K11**; **Rithvik builds K6** (live Featherless generation) on top of K5, plus R6b cloud deployment. Generated tests are **structured data rendered by a trusted template**, never trusted LLM-written Python. The seed bank stays the fallback; the guarded assistant is live since K10.
- Admin panel: not needed.

## Always-loaded project context

@docs/TorqueCode_Context.md
@docs/TorqueCode_Backend_Plan.md
@docs/BACKEND_DECISIONS.md

- `TorqueCode_Context.md` — **what** to build. Its labels are PS / LOCKED / RECOMMENDED / OPEN / ADDITIONAL / FUTURE SCOPE.
- `TorqueCode_Backend_Plan.md` — **who** owns which area and task.
- `BACKEND_DECISIONS.md` — **how** to code it: language, framework, database, sandbox approach, file structure, test commands. Written by Karthik (backend lead) in task K0.

If `BACKEND_DECISIONS.md` doesn't exist yet or says "pending", the only backend work allowed is task K0. Don't pick a language or framework yourself.

## Who is working

The branch name tells you the owner: `karthik/…`, `rithvik/…`, `pranav/…`, `akshit/…`, `aryan/…`.

If the branch is `main` or has no owner prefix, **stop and ask the user who they are and which task (e.g. K3, R2, P1) they are doing**. Never code on `main`.

## Before writing any code

Run **`/start <task-id>`**, or do these steps by hand:

1. Pull the latest work: `git fetch origin && git rebase origin/main`.
2. Read every file in `docs/status/`. These are the other people's latest changes and warnings.
3. Read the shared data models. Their location is in `BACKEND_DECISIONS.md`. Use them; never make your own copies.
4. Do **one task** from the backend plan. Write the tests first, then the code.

## File ownership (enforced by the pre-push hook)

Only edit files in areas your branch owner owns. See backend plan §2, and the exact map in `scripts/owners.json`.

If you need a change in someone else's area (especially the shared data models, owned by Karthik), **don't edit it**. Tell the user what change to request from the owner.

## Hard rules

- Never let an LLM decide whether code is correct. Grading is deterministic tests only.
- Only the Featherless client in `src/backend/llm/` may call Featherless. Everything else goes through its LLM chat seam.
- Never send server-only data (reference solutions, hidden tests, hint ladders) to the browser.
- Never implement anything labelled **FUTURE SCOPE**.
- Don't start **ADDITIONAL** items until the MVP works end to end.
- Never guess an **OPEN** decision. Leave a named `TODO(OPEN-Qn)` and a swappable interface.
- Never commit `.env` or any key. Only `.env.example`, with empty values.
- Don't copy code from earlier projects. All code must be written during the hackathon.

## Before every push

Run **`/ship`**. It:

- re-reads all context files fresh, since they may have changed since this session started
- checks ownership and the rules above
- runs your tests and updates your status file
- commits, pushes your branch and opens a PR

Never push to `main`, and never use `--no-verify`.
