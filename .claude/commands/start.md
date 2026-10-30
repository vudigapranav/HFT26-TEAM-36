---
description: Start a TorqueCode task — sync, read all context, and restate the task before coding
argument-hint: <task-id, e.g. K3, R2, P1>
---

Start task **$ARGUMENTS** for TorqueCode. Do these steps in order.

1. **Who and what.** Work out the owner from the task ID (K = Karthik, R = Rithvik, P = Pranav) and find that task's row in `docs/TorqueCode_Backend_Plan.md` §4. If there's no task ID, or it isn't in the plan, stop and ask the user.

2. **Sync and branch.**
   - Run `git fetch origin`.
   - If the current branch already starts with the owner's name, run `git rebase origin/main` on it.
   - Otherwise create a branch from `origin/main` named `<owner>/<task-id-lowercase>-<short-name>`, for example `rithvik/r2-sandbox`.
   - If the rebase has conflicts, stop and tell the user.

3. **Read fresh, even if they were loaded at session start:**
   - `docs/TorqueCode_Context.md`
   - `docs/TorqueCode_Backend_Plan.md`
   - `docs/BACKEND_DECISIONS.md`
   - every file in `docs/status/`
   - the shared data models, at the path given in `BACKEND_DECISIONS.md`
   - `scripts/owners.json`

4. **Check the coding plan exists.** If `BACKEND_DECISIONS.md` is still "pending", stop: only task K0 may run until it's filled in. Never choose a language or framework yourself; use the ones it names.

5. **Restate in at most 8 lines:**
   - the task
   - its "done when" check
   - the exact folders this owner may edit
   - the seams it must match (plan §3)
   - anything in other people's status files that affects this task
   - any OPEN decision it touches

6. **Plan the tests first.** List the tests you'll write for the "done when" check, using the test setup in `BACKEND_DECISIONS.md`. Then build: tests, then code, small commits.

Stay inside this owner's folders for the whole task. If you need a change in someone else's area, stop and tell the user exactly what to ask that owner for.
