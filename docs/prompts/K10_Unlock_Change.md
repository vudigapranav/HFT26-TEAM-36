# K10 — updated rule (03:00, Pranav). Paste this to Karthik's Codex.

If K10 is already in progress, paste the **delta** prompt. If not started, paste the **full** prompt.

## Delta (K10 already started)

```
PRODUCT CHANGE from Pranav (03:00) — overrides the tier rule in my K10 prompt. Read CLAUDE.md "Latest product decision" and context §5 again first.
Change K10 as follows, keep everything else (assistant wiring, LLM_UNAVAILABLE, novice 403 for hint/assistant, contract checks):
1. Remove per-tier time budgets (no 15/20/25). One 60-minute server timer for the whole session.
2. Unlock rule: the next question set becomes AVAILABLE once every question in the current set has at least one Submit (any result — correctness NOT required). Then the candidate MAY call POST /assessments/:id/tier/upgrade. Before that → 409 UNLOCK_NOT_AVAILABLE. Max 2 unlocks (novice → adept → master); a third → 409.
3. A "question set" = all seed/generated tasks of that tier (seed bank has 1 per tier today; code it for N). Earlier sets stay open after unlocking: GET/PUT/run/submit on earlier unlocked tasks keep working until expiry. Locked sets → 403.
4. Status/task responses: expose `unlock_available: boolean`, `unlocks_used: 0|1|2`, the list of available task ids, and per task `assistant_enabled: boolean` — but DO NOT expose tier names in candidate-facing assessment responses (no "novice/adept/master" strings in status/task/run/submit). Internally keep tier. The REPORT may name tiers.
5. Events: keep tier_unlocked / tier_upgraded internally (payload {unlocks_used}).
6. Hints/assistant: allowed only on adept/master tasks (403 on novice tasks), decided server-side from the task's tier.
Tests: unlock unavailable until every current-set task has a submit; a FAILING submit still counts; 3rd unlock refused; earlier tasks still runnable after unlock; locked task 403; no tier names in any candidate assessment response (scan JSON); novice hint/assistant 403; report still covers all attempted tasks.
Update docs/BACKEND_DECISIONS.md (Q1/Q3 now locked by Pranav as above; remove "TODO(OPEN-Q1)" policy_todos from /status). Then Ship. PR base vudigapranav/HFT26-TEAM-36 main.
```

## Full (K10 not started yet)

Use the K10 prompt in `NEXT_0200_All.md`, but replace its "Product rules" block and steps 1, 2 and 6 with points 1–6 of the delta above.
