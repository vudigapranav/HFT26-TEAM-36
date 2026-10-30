# Aryan — all remaining prompts (ChatGPT)

> Updated 31 Oct 03:20 by Pranav. **This file replaces all older prompt files for Aryan.** Do the prompts in order, one per session/branch.
> Before anything: `git pull` and start a **fresh** session (the rule at the top of `CLAUDE.md` changed at 03:00).
> PR base is always `vudigapranav/HFT26-TEAM-36` → `main`. **Never cbitosc.** Never push to main, never `--no-verify`, never commit `.env`.

**The product rule now (LOCKED, Pranav 03:00):** one 60-minute timer; everyone starts on Novice questions; after **submitting every question in the current set (correct or not)** the candidate may click **"Unlock next questions"**; max **2** unlocks; **level names are never shown** in the assessment UI (the report may name them); earlier questions stay open; AI help only on Adept/Master questions.

**Done:** K7 seed tasks (merged after Claude adapted them to the new grading) and the pitch drafts (`docs/pitch/`, fact-checked). **Left:** slides → rehearsal → screenshots + backup video.

Use the **same ChatGPT chat** as before (it has the context). If it's a new chat, upload `docs/TorqueCode_Context.md`, `docs/pitch/PITCH_DECK_TEXT.md`, `docs/pitch/PITCH_SCRIPT_AND_QA.md` and `docs/demo/PITCH_FACTS.md` first.

---

## 1. Slide layout

```
My deck text is final in docs/pitch/PITCH_DECK_TEXT.md (updated: one 60-minute session; attempt every question → "Unlock next questions", up to twice; levels never named during the test; tampering with grading is blocked by design — candidate code runs in a separate container from the tests; the AI assistant was tested on the real model: 8 of 12 answered replies leaked the fix before our fixes, 0 leaks in 22 scenarios after). Use ONLY facts from PITCH_FACTS.md.
Turn it into slide-by-slide layout instructions for Google Slides/PowerPoint: dark background, one accent colour, max 4 bullets per slide, one visual per slide (architecture diagram, a 3-box journey, a layered "shield" for grading + assistant). Give exact text per slide and where screenshots go (placeholders: login, coding screen, report).
```

## 2. Short versions of the script

```
Write (a) a 60-second version and (b) a 2-minute version of the pitch script for two speakers (Pranav, Aryan), using only the facts. Mark where the live demo goes. Keep "in progress" items honest.
```

## 3. Judge Q&A drill

```
Quiz me: ask me the 10 judge questions from PITCH_SCRIPT_AND_QA.md one at a time plus 5 new tough ones (scalability, cost per assessment, what if Docker is down, how is it different from HackerRank/LeetCode, why Featherless). After each of my answers, tell me what was missing or overstated compared with the facts.
```

---

## 4. Without ChatGPT

- Build the slides (title, problem, solution + journey, demo, honest grading, assistant + AI score, architecture, limits + future scope, team).
- Rehearse with Pranav **twice**, timed.
- When the frontend works (~09:00–10:00): take screenshots for the demo slide and help Pranav record the backup video.
- Send the final deck to Pranav for a fact-check before submitting.
