# Submission draft: TEAM-36 · PAARK

> Draft prepared 31 Oct 2026, 08:15 IST. **Pranav opens the submission PR himself.** Fill every `UNKNOWN` before submitting.

**PR title:** `[SUBMISSION] TEAM-36 - PAARK - <track>`. Track: **UNKNOWN** (take it from the official event page).

**Target:** the event's official repository (cbitosc). This is the only PR that goes there.

---

## Body

### TorqueCode: put your code under torque
Portfolio-driven adaptive coding assessment. A candidate uploads a JSON portfolio; TorqueCode builds a 60-minute
assessment from their claimed domain and DSA topics, runs their code in an isolated Docker sandbox, grades it only with
deterministic tests, and reports correctness, time, hint use and an AI-usage efficiency score.

- **Live demo:** UNKNOWN (not deployed yet; see `docs/deploy/VERCEL_VM_RUNBOOK.md`)
- **Demo video:** UNKNOWN (record per `docs/demo/DEMO_CHECKLIST.md`)
- **Repository:** https://github.com/vudigapranav/HFT26-TEAM-36

### What works (on main; verified by tests)
- Email/password accounts (Argon2id, hashed opaque sessions, origin checks, rate limits), PostgreSQL persistence.
- Portfolio intake with strict validation, topic normalization, domain detection and injection flags; onboarding quiz.
- One 60-minute session; "Unlock next questions" after submitting every question in a set, at most twice; levels never
  named in the assessment UI.
- Six reviewed Python task families. The model only selects a family/scenario; every released task is checked by an
  independent oracle in 3 isolated runs (starter must fail exactly its F2P tests).
- Split-container Docker grading (no network, resource limits, the trusted grader is separate from candidate code).
- Hints + guarded assistant only on later question sets; AI usage score computed only from logs.
- Report: per-task pass rates, time, AIE breakdown, integrity signals, claims vs demonstrated, report history.

### Verification status (fill in with real results only)
| Check | Result |
|---|---|
| Backend suite, PostgreSQL 16 + real Docker (`pnpm test:auth`, main `670c925`) | 27 files, 399 passed, 0 skipped (cloud container, 31 Oct 07:45) |
| API journey `scripts/e2e-journey.py` on a local built backend | passed (demo portfolio, 31 Oct 07:47); assistant 503 without a key |
| Browser journey (Prompt 3, PR #59) | UNKNOWN (in progress) |
| Deployed journey on Vercel + VM | UNKNOWN (not deployed) |
| Attack suite against the deployed URL | UNKNOWN |

### Honest limits
Python tasks only; a bounded library of six reviewed families; finite oracle checks, not proofs; performance is one
measured workload, not a complexity proof; contextualization uses profile/domain/claims, not the candidate's
repositories; a portfolio that claims no `arrays` topic gets a clear 422 instead of questions; AI used on a second device
can't be detected (camera proctoring is future scope); the sandbox is hackathon-grade Docker isolation.

### Team
Pranav (lead, frontend, intake/scoring), Akshit (frontend), Karthik (backend lead), Rithvik (sandbox, AI, deployment),
Aryan (pitch, seed tasks).
