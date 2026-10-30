# TorqueCode — rules for every Claude Code session

Several people build this repo at the same time from separate Claude Code setups (Karthik, Rithvik, Pranav; sometimes Akshit and Aryan). These rules keep the code consistent. Follow them in every session.

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
