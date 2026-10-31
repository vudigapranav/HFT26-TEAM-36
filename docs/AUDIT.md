# Release audit — 31 Oct 2026

What was checked before publishing, with the evidence. Statuses are exact: only items marked
**working and tested** ran successfully here (Linux, Node 24.22.1, PostgreSQL 16, Docker runner,
production frontend bundle).

## Working and tested

| Area | Evidence |
|---|---|
| Auth, portfolio (JSON + PDF draft), quiz, 3 question sets, unlocks, hints, assistant (clean "unavailable" without a provider), report, past reports | `src/frontend/tests/e2e/journey.mjs` in Chromium: 12/12 steps |
| Portfolio-grounded selection (project evidence → eligible reviewed families → bounded model choice → K5) | `src/backend/tests/generation/personalization.test.ts` 13/13 incl. real-Docker K5 for 3 portfolios; results in `docs/demo/personalization-eval.md` |
| K5 receipts reused only for identical tasks/policy/code/harness/runner image | same suite (invalidation cases); prep 74.7 s → 38.5 s cold, 4.1 s warm through the real API |
| Timer starts when questions are released | `remaining_sec` 3599–3600 at release |
| Advancement prompt (server decides eligibility), End assessment via `POST /assessments/:id/finish` | journey steps d, e, h |
| Credit beyond the starter (untouched starter scores 0), domain spellings/confidence, quiz ≥ 2 choices | backend scoring/intake/assessment suites |
| Anti-cheat: fullscreen entry from Start, Warning 1/2/3+ with deduplicated interruptions, fullscreen exit + Return to fullscreen, reload detection, End assessment confirmation, integrity summary with review status | journey steps c, g, k, h; `src/frontend/tests/live/integrity.test.tsx` 3/3 |
| Integrity events stored server-side (`window_blur`, `fullscreen_exit`, `page_reload`, `duration_ms`) | events route + report suites; report shows "Needs review · 3 interruptions · 2 fullscreen exits" in the journey |

## Implemented but unverified here

- Featherless stage B (model reorders the evidence shortlist) and the live assistant: this
  environment's network policy blocks `api.featherless.ai`; covered by deterministic mocks only.
- A real browser tab switch: headless Chromium never hides a background page; the tab-switch path
  is covered by the jsdom monitor test, and fullscreen exits drive the browser journey.
- E2B runner (`RUNNER=e2b`): verified live on Pranav's Mac (reference passes, starter fails, ~9.6 s
  per submit); not the default.

## Not implemented

Adept qualification with demotion back to Novice, project ZIP upload, C++/Java/SQL runners, and
more than the 6 reviewed task families (each new family needs an independent oracle).

## Honest limits

Browser focus signals are evidence for review, not proof of cheating; the client counter is for
warnings only and the server stores the events. Esc, OS shortcuts and closing the page are never
blocked. Python is the only candidate language.
