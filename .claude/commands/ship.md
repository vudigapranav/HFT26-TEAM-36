---
description: Re-read all TorqueCode context, check the work against it, test, update status, commit and push this branch
argument-hint: [optional note for teammates]
---

You are about to push TorqueCode code. Do these steps in order. **Stop at the first failure**, explain it, and fix it before continuing.

1. **Branch check.** Get the current branch. If it's `main` or doesn't start with `karthik/`, `rithvik/`, `pranav/`, `akshit/` or `aryan/`, stop.

2. **Sync.** Run `git fetch origin && git rebase origin/main`. Commit or stash first if needed. If there are conflicts in files you don't own, stop and tell the user. If a dependency lockfile conflicts, keep both sides' additions and regenerate it, or ask Karthik.

3. **Re-read every context file fresh.** Teammates may have changed them since this session started.
   - `docs/TorqueCode_Context.md`
   - `docs/TorqueCode_Backend_Plan.md`
   - `docs/BACKEND_DECISIONS.md`
   - all of `docs/status/`
   - the shared data models
   - `scripts/owners.json`

4. **Ownership.** List every changed file with `git diff --name-only origin/main...HEAD` plus uncommitted changes. Each one must be allowed for this owner (or be shared) in `scripts/owners.json`. If one isn't, revert that file's changes and tell the user what to request from its owner.

5. **Check the change against the context and decisions.** Go through the diff and confirm:
   - it uses the language, framework and structure in `BACKEND_DECISIONS.md`
   - models come from the shared data models, not a local copy
   - seams match plan §3
   - no LLM judges correctness
   - only the Featherless client in `src/backend/llm/` calls Featherless
   - no server-only data reaches any API response
   - nothing labelled FUTURE SCOPE is implemented
   - no ADDITIONAL work is started before the MVP is done
   - no OPEN decision is silently decided
   - no secrets are committed

   List anything that doesn't match and fix it.

6. **Tests and type checks.** Run the test command for this owner's area from `BACKEND_DECISIONS.md`, plus the type check or lint if one is listed. Frontend: run its lint/test script if one exists. Everything must pass. Don't skip or delete failing tests to make them pass.

7. **Status file.** Append an entry to `docs/status/<owner>.md` in this format:

   ```
   ## <YYYY-MM-DD HH:MM> — <task-id> — <one-line summary>
   - Changed: <files/areas>
   - Seams/contracts affected: <none | what changed and who must update>
   - Teammates should know: <anything that affects their work> $ARGUMENTS
   - Next: <next step>
   ```

8. **Commit and push.**
   - Commit with a message like `feat(<task-id>): <summary>`.
   - Run `git push -u origin HEAD`.
   - The pre-push hook re-checks ownership and secrets. If it blocks the push, fix the cause. Never use `--no-verify`.

9. **Pull request.**
   - If `gh` is available, open (or update) a PR from this branch into `main`, titled `<TASK-ID>: <summary>`, with the status entry as the body.
   - If `gh` isn't available, print the GitHub compare link for the user.

   Remind the user: backend PRs are reviewed by Karthik, then merged by Pranav.
