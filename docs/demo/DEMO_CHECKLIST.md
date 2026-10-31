# Demo checklist, walkthrough and backup recording

> Nothing here claims an account, report, recording or deployment exists. Tick items only after doing them.

## T-30 min
- [ ] Decide the demo target: deployed Vercel URL (only if its journey passed) or local (`deploy/start.sh` + `pnpm --filter torquecode-frontend dev`).
- [ ] `/health` shows `runner_available: true`.
- [ ] Featherless key set on the backend; one assistant question answered in rehearsal (otherwise use the 503 cut line).
- [ ] `python3 scripts/e2e-journey.py` (with `BASE`/`ORIGIN` for the target) ends "Journey PASSED".
- [ ] A fresh demo account registered **during rehearsal**, credentials kept privately (never in the repo).
- [ ] One completed assessment and report on that account, for the "past reports" moment.
- [ ] Backup recording saved locally and its link added to README + `docs/demo/submission.md`.
- [ ] Browser zoom 125%, notifications off, second tab with the report already open.

## Walkthrough (≈4 min)
1. **Problem (20 s):** AI makes portfolios easy to fake; static tests ignore what the candidate claims.
2. **Upload (30 s):** `docs/demo/demo-portfolio.json`, then show the normalized topics, domain, and the injection flag on `demo-portfolio-injection.json`.
3. **Generation (20 s):** progress with validation receipts: "independent oracle, 3 runs", "starter fails F2P".
4. **Set 1 (45 s):** find the bug, Run (visible tests), Submit (hidden as aggregates only). Point out: no level names.
5. **Unlock → set 2 (45 s):** hint ladder; guarded assistant refuses "write the whole function" and helps with a real question.
6. **Set 3 (20 s):** the Master question's performance requirement; submit.
7. **Report (40 s):** pass rates, time, AIE breakdown, integrity signals (the paste), claims vs demonstrated, report history.
8. **Close (20 s):** deterministic grading only, an LLM never judges correctness; honest limits; future scope.

## Backup recording
- macOS: `Cmd+Shift+5` → Record Selected Portion → browser window, microphone on; or QuickTime → New Screen Recording.
- Record the walkthrough above end to end in one take (3–4 min), on the same target you will demo.
- Export 1080p MP4, check the audio, and upload it unlisted (YouTube or Drive). Put the link in README line 6 and the submission body.
- Keep the file on the demo laptop's desktop too, in case the network fails.
