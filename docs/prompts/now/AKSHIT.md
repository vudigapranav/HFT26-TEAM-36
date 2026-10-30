# Akshit — all remaining prompts (OpenCode)

> Updated 31 Oct 03:20 by Pranav. **This file replaces all older prompt files for Akshit.** Do the prompts in order, one per session/branch.
> Before anything: `git pull` and start a **fresh** session (the rule at the top of `CLAUDE.md` changed at 03:00).
> PR base is always `vudigapranav/HFT26-TEAM-36` → `main`. **Never cbitosc.** Never push to main, never `--no-verify`, never commit `.env`.

**The product rule now (LOCKED, Pranav 03:00):** one 60-minute timer; everyone starts on Novice questions; after **submitting every question in the current set (correct or not)** the candidate may click **"Unlock next questions"**; max **2** unlocks; **level names are never shown** in the assessment UI (the report may name them); earlier questions stay open; AI help only on Adept/Master questions.

**Status:** nothing from the frontend is on `main` yet — this is now the **biggest risk** for the demo. Push small and often, or send Pranav a zip of `src/frontend` every hour.

How to deliver without a terminal: ask OpenCode to commit and push for you (the Ship prompt below does it). If pushing fails, zip the `src/frontend` folder and send it to Pranav; his Claude commits it on `akshit/frontend` and reviews it.

---

## 0. Session opener — paste at the start of EVERY new OpenCode session

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

ALSO (03:00 product change, overrides anything older): never show "Novice", "Adept", "Master" or a tier bar in the assessment UI; one 60-minute countdown; "Unlock next questions" button only when the backend says unlock_available; AI panel + hint button only when assistant_enabled. See CLAUDE.md top section.
```

## 0b. Ship prompt — paste before EVERY push

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

---

## 1. Build / finish the screens (in this order; skip what's done)

```
Build the TorqueCode frontend in src/frontend exactly per docs/prompts/AKSHIT_Frontend_Plan.md (§1 stack, §2 proxy, §3 API map, §4 screens F0–F8), with these 03:00 changes on top:
- F4 coding screen: NO level names anywhere and NO tier bar. One 60-minute countdown from server remaining_sec. A question list with neutral names ("Question 1", "Question 2" or the task title); earlier questions stay clickable after unlocking.
- "Unlock next questions" button: show ONLY when GET /api/assessments/:id/status has unlock_available === true; click → POST /api/assessments/:id/tier/upgrade with {} → reload status + question list. Hide after 2 unlocks (unlocks_used === 2). Until the backend sends these fields, keep it hidden — no errors.
- Hint button + AI assistant panel ONLY when the task response has assistant_enabled === true. Assistant: POST /api/assessments/:id/assistant {message, history} → show the reply; {blocked:true} → "The assistant can't help with that" (no reason details); 503 → "Assistant unavailable".
- Report page MAY show level names (Novice/Adept/Master) — allowed after the session.
- Keep: Run/Submit, autosave, integrity events (only while the coding screen is mounted), the 503 "sandbox unavailable" banner (no grade shown).
Order: F0 setup + proxy → F1 login → F2 portfolio → F3 quiz + start → F4 coding screen → F5 integrity → F6 report → F7 progress → F8 polish.
After each screen works against the real backend, run the Ship prompt.
```

---

## 2. Demo polish (only after F0–F6 work end to end)

```
Polish for the demo: consistent dark theme with one accent colour; loading and empty states on every screen; clear error messages from the backend error shape; the report page shows overall score, per-question cards, pass rates, time, AI-efficiency breakdown, focus areas and integrity signals with simple charts. Test the whole journey in a fresh browser window at 1366×768 and 1920×1080. Then Ship.
```

---

## 3. Tell Pranav after each push

Which screens work against the real backend, what's still mocked, and anything the backend is missing (field names, errors).
