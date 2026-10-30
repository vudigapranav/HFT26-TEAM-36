# TorqueCode — three-minute script and judge Q&A

Draft for Pranav's fact-check. Approximately three minutes at 130–140 words per minute; rehearse with a timer. The spoken script does not include a live-demo pause. Add demo time separately or shorten the script. Status is from the supplied kit, not a fresh check of main.

## Spoken script

### Pranav — slides 1–3

A candidate lists Python, backend development and hashing on their portfolio. A standard coding test gives them the same question as everyone else. What have we learned about the skills they actually claimed?

And when AI can help produce impressive projects, the portfolio alone tells us even less about practical understanding.

We are Team PAARK, and this is TorqueCode: put your code under torque.

TorqueCode is designed to turn portfolio claims into practical assessment tasks. A candidate uploads structured portfolio JSON, completes a short onboarding quiz, then works inside a small codebase: fixing bugs or extending features. The tasks stay within their claimed DSA topics.

The planned session lasts sixty minutes: fifteen for Novice, twenty for Adept and twenty-five for Master. Everyone starts at Novice. Passing every test unlocks the next tier, and the candidate chooses whether to advance.

### Aryan — slides 4–6

Our current backend supports a Novice seed flow. For the demo, we will show the flow confirmed on the presentation machine: portfolio intake, a practical task, visible tests, submission and a report. Tier upgrades, live generation and the assistant endpoint remain in progress in our supplied build snapshot.

The central design choice is how we grade. An LLM never decides correctness. Deterministic tests do. The validation design checks that a reference solution passes and the starter fails the intended tests before a task reaches a candidate.

Code runs in Docker with no network and resource limits. Hidden tests and reference solutions stay on the server. Anti-tamper hardening is still in progress.

In Adept and Master, guarded AI is designed to help without supplying the solution. The model never receives the reference. Input and output checks add protection, although they cannot guarantee perfect resistance.

AI efficiency contributes up to twenty points, calculated from logs: independence, progress after hints and testing discipline, gated by correctness. Solving independently earns the full AI allocation.

### Pranav — slides 7–9

The backend uses TypeScript, Fastify, shared TypeBox contracts and PostgreSQL. Candidate tasks run on Python and pytest; Featherless powers the AI modules.

We are also clear about our limits. We assess demonstrated skills, not project authorship. We cannot stop someone using AI on another device. Repository-based assessments and camera proctoring are future scope.

TorqueCode asks candidates to show how they apply what they claim to know. Thank you.

## Ten likely judge questions

### 1. Can't candidates just use ChatGPT on their phone?

Yes. We cannot prevent second-device assistance. Tab-switch and copy/paste events are integrity signals, not proof of cheating. Camera proctoring is future scope and would not make prevention absolute.

### 2. How do you stop your assistant leaking the answer?

The model never receives the reference or hidden tests. Input guards flag extraction attempts; server-side output guards check code volume and similarity to the reference. Blocks are logged. These are heuristic protections; the live endpoint is still in progress in the supplied snapshot.

### 3. What if the generated task is wrong?

The intended validation gates run the reference and starter against tests, check topic bounds and other constraints, and retry or fall back to a verified seed. Live generation and its validation engine are still in progress. Our two new seed references each passed ten local tests three times, but still need backend/Docker integration checks.

### 4. Why not let an LLM grade the submission?

The problem statement requires deterministic grading. We want repeatable results with inspectable pass/fail evidence. Featherless generates task artifacts and supplies guarded assistance; tests decide correctness. Tests themselves can still be incomplete, so task quality requires validation.

### 5. How is the assessment personalized?

Portfolio intake extracts the domain, stack and normalized claimed topics. The intended generator builds tasks inside those bounds. Current seed fallback is topic-compatible selection, not bespoke generation; the live generation path is still in progress.

### 6. How do you measure AI efficiency without rewarding hint spam?

The score combines independence, pass-rate improvement after assistance and testing after code changes, then gates it by the final submit's correctness. Repeated runs without a code change do not improve testing discipline. Novice has no AI component. Blocked attempts have zero interaction weight and are separately flagged; they do not automatically zero the entire score.

### 7. What prevents candidate code tampering with grading?

The API allows edits only to selected files, supplies trusted tests, hides Submit output and parses results per test ID. Docker supplies isolation. However, candidate code currently shares the pytest interpreter with tests in the supplied runner; hardening is in progress. We do not claim that sophisticated tampering is solved.

### 8. How does it scale?

Scaling is not load-validated yet. Featherless requests share a bounded queue, and code runs in isolated containers. The supplied API checkpoint stores assessment state in memory, so restart resilience and multiple API instances need further work. We have no measured capacity or concurrency claim.

### 9. What happens when Docker or Featherless is unavailable?

If isolated execution is unavailable, the API returns sandbox unavailable and does not fabricate a grade. The AI client has retries and a queue. Seed fallback and a pre-generated demo assessment are the planned resilience path; confirm their full wiring on the demo machine. A failed assistant call must not be logged as successful AI use.

### 10. What can you demonstrate now, and what is unfinished?

The supplied snapshot reports merged auth, intake, quiz, Novice assessment APIs, Docker wiring, scoring and report modules. Assistant modules exist but are not yet wired to the API. Three-tier flow, live generation/validation, hardening, frontend and deployment are in progress. The two new seeds are locally verified deliverables awaiting integration. Pranav should update this answer after the final rehearsal.
