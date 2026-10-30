# Aryan — status log

Newest entries at the bottom. Written by `/ship`.

## 2026-10-31 03:10 — K7 — Adept + Master seed tasks (adapted to R3 by Pranav's Claude)
- Changed: src/backend/seed_bank/adept_event_dedupe/, src/backend/seed_bank/master_session_window/, docs/pitch/ (deck text, script + Q&A, pytest evidence)
- Seams/contracts affected: none
- R3 compatibility (PR #29 merged first): Adept tests now pass plain `(user_id, event_id, ts)` rows (the split-container grader can't carry objects); the feature is unchanged (EventStore.deduplicated in store.py + summarize_events in service.py). Master's speed test now times the call directly at 30,000 records (< 0.3 s) instead of a subprocess (the grader container has no candidate code to import).
- Verified: plain pytest (reference 10/10 ×3, starter fails exactly f2p, passes p2p) and a local R3 harness simulation with the merged grade.py/worker.py (same results; novice reproduces exactly). Not yet run on real Docker — Rithvik/Karthik please run once.
- Teammates should know: Karthik — K10 can load all three tiers; Adept topics arrays+hashing, Master arrays+sliding_window (demo portfolio claims both).
