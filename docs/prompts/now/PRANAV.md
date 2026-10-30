# Pranav — all remaining prompts (Claude Code) + checklist

> Updated 31 Oct 03:20 by Pranav. **This file replaces all older prompt files for Pranav.** Do the prompts in order, one per session/branch.
> Before anything: `git pull` and start a **fresh** session (the rule at the top of `CLAUDE.md` changed at 03:00).
> PR base is always `vudigapranav/HFT26-TEAM-36` → `main`. **Never cbitosc.** Never push to main, never `--no-verify`, never commit `.env`.

**The product rule now (LOCKED, Pranav 03:00):** one 60-minute timer; everyone starts on Novice questions; after **submitting every question in the current set (correct or not)** the candidate may click **"Unlock next questions"**; max **2** unlocks; **level names are never shown** in the assessment UI (the report may name them); earlier questions stay open; AI help only on Adept/Master questions.

**Done and merged:** P1–P10, reviews, attack suite. **Left:** P11 → P12 → P13 (after K8), plus coordination.

---

## 1. P11 — report under the unlock rule (`/start P11`)

```
Task P11 — make scoring/report correct under the new question-set unlock rule (CLAUDE.md top section + context §5). Only my areas: src/backend/scoring/, src/backend/tests/scoring/, docs/status/pranav.md.

Problem: buildReportValue averages correctness over EVERY task passed in. Under the new rule the session will contain tasks of all three tiers, but a candidate who never unlocks only ever sees the Novice set. They must not be penalised for questions they never had.

1. Available tasks: a task counts for the report only if its tier was available to the candidate — tier rank ≤ the highest tier reached. Use session.current_tier (novice < adept < master); also accept tier_unlocked / tier_upgraded events as evidence if present. Locked-tier tasks get NO row and do not affect correctness, focus areas or outcome.
2. Correctness = mean final-submit pass rate over AVAILABLE tasks (unchanged formula otherwise). Novice-only sessions keep the Q4 rule: scale correctness to 100. AIE unchanged (Adept/Master attempted tasks only).
3. Outcome text may name levels (the report is allowed to). Add how many question sets were unlocked, e.g. "Unlocked 1 of 2 further question sets."
4. claims.ts: an available task the candidate never attempted (no run/submit event) counts as "not tested" (tested_by null, demonstrated null), and an attempted task wins over an unattempted higher-tier one. Change the signature to also take the events (or a set of attempted task ids); update its tests.
5. Tests first: 3-tier session with current_tier novice → only the novice row, novice-only scaling, score unaffected by adept/master tasks; current_tier adept → novice+adept rows, master excluded; tier_unlocked events honoured; claims: unattempted available task → null/null; attempted lower tier beats unattempted higher tier; everything still passes Value.Check(Report).
Do not touch contracts, api or other people's areas. If you need a contract change (e.g. a report field for unlocks), write the exact request for Karthik in docs/status/pranav.md instead.
Then /ship.
```

---

## 2. P12 — submission readiness (`/start P12`)

```
P12 — submission readiness (docs/, README.md, scripts/ only).
1) README: update "What's real today" from git log + status files (R3, R5-live, K7, unlock rule; K10/R6/frontend only if merged); remove any 15/20/25 wording; Demo video + Live URL placeholders at the top; "How to run the demo" → deploy/README.md.
2) docs/demo/PITCH_FACTS.md: add R5-live numbers exactly as in docs/status/rithvik.md (8 of 12 answered replies leaked before the fixes → 0 leaks in 22 scenarios after; about $0.0018 total; median about 2.1 s per answered call) with its caveats.
3) docs/demo/DEMO_SCRIPT.md: re-check every step against what is merged; mark the cut lines.
4) scripts/pre-submit-check.sh: runs pnpm typecheck, pnpm test, python3 scripts/attack-api.py against a running server, greps the repo for secrets (.env files, sk- keys, Bearer tokens) and prints a checklist with ✅/❌.
No invented numbers. Then /ship.
```

---

## 3. P13 — wire claims into the report (`/start P13`, only after Karthik's K8 adds the Report `claims` field)

```
P13 — Karthik added Report.claims and a profile/claimed_topics input to buildReport. In scoring/report.ts call claimsVsDemonstrated(profile, available tasks, rows, events) and put the result in report.claims. Tests: claims present and Value.Check(Report) passes; untested topics are null/null. Only scoring/ + tests. Then /ship.
```

---

## 4. Not code — your checklist

- [ ] **Now:** send Karthik `docs/prompts/now/KARTHIK.md`, Rithvik `RITHVIK.md`, Akshit `AKSHIT.md`, Aryan `ARYAN.md`. Tell everyone: `git pull` + fresh session.
- [ ] **Organizers:** exact submission deadline? Must the demo be deployed online, or is local OK? Official portfolio JSON schema?
- [ ] **Demo laptop:** decide; install + open Docker Desktop; tell Rithvik (R6 must be proven there).
- [ ] **Featherless key:** in Rithvik's (and the demo machine's) `.env` only.
- [ ] **04:00 check-in:** one line from each person → send to Claude to re-plan.
- [ ] **Frontend risk:** if Akshit has nothing on main by 05:00, move Rithvik (after R6) to help.
- [ ] **~09:00:** feature freeze prep — rehearse the pitch with Aryan twice (timed), run the full demo on the demo laptop from a clean browser, record the backup video.
- [ ] **Submission:** README links filled; final PR **to cbitosc** titled `[SUBMISSION] TEAM-36 - PAARK - <track>` (the only time a PR goes to cbitosc — do it with Claude).
