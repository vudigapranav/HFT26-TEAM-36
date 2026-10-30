# TorqueCode — nine-slide deck text

Draft for Pranav's fact-check before final slide production. Product status comes from the supplied kit's snapshot of main at `7313627`, 31 October 2026, 02:10; it has not been independently refreshed from GitHub. Local seed-task verification is recorded separately in `PYTEST_OUTPUT.md` and does not mean those tasks are merged or integrated.

## Slide 1 — TorqueCode

- Put your code under torque.
- Portfolio-driven adaptive coding assessment
- Team PAARK · TEAM-36 · CBIT Hacktoberfest 2026

Speaker note: A portfolio lists what a candidate says they know. TorqueCode asks them to apply those skills in a practical codebase. Introduce Pranav and Aryan without claiming the complete journey is already deployed.

## Slide 2 — The assessment gap

- Static questions overlook a candidate's projects and background.
- A polished portfolio does not demonstrate the skills it claims.
- AI-assisted code makes practical understanding harder to assess.

Speaker note: Use a hypothetical candidate who lists backend development and hashing. A generic test may miss those claims; a portfolio description alone cannot demonstrate them. We assess skills consistent with a portfolio, not authorship of its projects. This is the problem statement's framing, not a measured market statistic.

## Slide 3 — The TorqueCode assessment

- Portfolio JSON → onboarding quiz → assessment → report
- Tasks stay within the candidate's claimed DSA topics.
- One session: Novice 15 min → Adept 20 min → Master 25 min
- All tests passing unlocks the next tier; advancing is optional.

Speaker note: The intended work is debugging or extending an existing codebase. Everyone starts at Novice, without AI. Adept and Master offer guarded assistance. Three-tier flow and live generation remain **in progress** in the supplied snapshot; the current API supports a Novice seed flow.

## Slide 4 — Demo walkthrough

- [DEMO] Sign in and upload the prepared portfolio JSON.
- [DEMO] Inspect a seed task, edit code and run visible tests.
- [DEMO] Submit and inspect test results and the report.
- **In progress:** tier upgrades, live assistant and generated-task flow

Speaker note: Replace these placeholders with only the flow rehearsed on the actual demo machine. The demo portfolio must include arrays, hashing and sliding_window; preserve two_pointers if using the earlier P10 sample. The two new tasks have passed local Python checks but still require backend loading and Docker re-testing. Do not promise a live upgrade or assistant demonstration until Pranav confirms it works. Keep a pre-generated fallback and a recording if the team prepares them.

## Slide 5 — Grading through tests

- Deterministic tests decide correctness; the LLM does not grade.
- Docker isolates execution with network, resource and time limits.
- Hidden tests and reference solutions stay on the server.
- **In progress:** live validation and sandbox anti-tamper hardening

Speaker note: The validation design requires the reference to pass and the starter to fail the intended tests before release. The runner parses per-test JUnit results rather than relying on exit code alone. Run uses visible tests; Submit adds hidden tests and returns hidden aggregates without stdout/stderr. Isolation is implemented according to the supplied snapshot, but candidate/test interpreter sharing still creates a known tampering risk. Do not claim production-grade grading integrity.

## Slide 6 — Guarded assistance and AI efficiency

- Guarded AI hints are for Adept and Master only.
- The assistant never receives the reference solution.
- Input and output guards limit extraction and solution leakage.
- Up to 20 points reflect independence, hint yield and test discipline.

Speaker note: The score is deterministic from logged interactions and gated by the final submit's pass rate. No AI plus a solved task receives the full AI allocation. Novice is scored on correctness alone; a Novice-only session scales correctness to 100. Blocked attempts are integrity flags and have zero interaction weight under context §12; do not imply they automatically zero the entire score. Assistant modules are merged in the supplied snapshot; the live endpoint is **in progress**. Guards are heuristics, not a guarantee against leakage.

## Slide 7 — Architecture

- Browser → core platform → AI engine → Featherless
- TypeScript · Fastify 5 · shared TypeBox contracts
- PostgreSQL 16 · Argon2id · HttpOnly cookie sessions
- Python 3.13 + pytest execute candidate tasks in Docker.

Speaker note: Karthik owns the core platform, contracts, generation and validation; Rithvik owns sandbox, Featherless and deployment; Pranav owns intake, quiz, scoring and reporting; Akshit owns the frontend. Only the backend LLM module calls Featherless, through one queue. The supplied model choices are Qwen/Qwen3-Coder-30B-A3B-Instruct for generation and Qwen/Qwen3-30B-A3B-Instruct-2507 for assistance. Frontend, live generation and deployment remain **in progress**. Authentication persists in PostgreSQL, but the supplied checkpoint keeps assessment/portfolio state in process memory; do not claim crash-resilient assessment storage.

## Slide 8 — Integrity and honest limits

- Tab switches and copy/paste are signals, not cheating verdicts.
- Skills can be assessed; project authorship is not established.
- Second-device AI use and production isolation remain limitations.
- **Future scope:** repository-based assessments and camera proctoring

Speaker note: Difficulty calibration is approximate and hints can be wrong. The supplied snapshot reports 222 automated tests passing, 28 additional infrastructure-dependent tests, a 39-check adversarial API suite and a 2,000-input intake fuzz test. Attribute those figures to the snapshot and have Pranav recheck before presenting; they were not rerun here. Keep them in notes rather than filling the slide with stale numbers. The two seed suites verified locally here are additional unmerged artifacts, not an updated main test count.

## Slide 9 — Team PAARK

- Pranav — lead, integration, intake, quiz, scoring and reporting
- Karthik — backend lead · Rithvik — sandbox, AI integration and deployment
- Akshit — frontend · Aryan — seed tasks, pitch and presentation
- Thank you · TorqueCode: Put your code under torque.

Speaker note: Close by returning to the candidate: the assessment should show how they apply their claimed skills. Invite questions and use the prepared answers without overstating unfinished work. Demo URL: [TBD]. Repository URL: [TBD].
