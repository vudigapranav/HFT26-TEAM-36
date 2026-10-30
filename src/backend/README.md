# TorqueCode backend — K1

Read `docs/BACKEND_DECISIONS.md` from repository root for the agreed stack, ownership, contracts and open policies. `docs/status/karthik.md` records progress and test evidence.

From repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
uv sync --project src/backend --python 3.13 --locked
pnpm typecheck
pnpm build
pnpm test
pnpm test:python
pnpm smoke:seams
pnpm test:seed1
pnpm dev
```

`GET http://127.0.0.1:3001/health` reports skeleton mode and disabled candidate execution. `pnpm openapi` prints OpenAPI JSON for implemented routes. Only health exists; draft future paths are exported from `@torquecode/contracts/http`.

No database or LLM key is needed. K1 binds only to loopback. PORT defaults to 3001. HOST defaults to 127.0.0.1. APP_MODE defaults to skeleton; other modes fail closed.

Teammates implement `Ports` from `contracts/seams.ts`, reuse the package's public schemas, and replace their injected adapter in `api/` through Karthik. All asynchronous seams accept cancellation. Errors and development fixtures are explicit results. Generation/validation/scoring/report adapters cannot claim success before implementation.

The local runner is exclusively for immutable, hash-pinned seed fixtures and executes real pytest. It rejects edited candidate code. It is process supervision, not isolation: candidate execution and generated tasks require Rithvik's container runner. Do not expose the local runner through HTTP.

Do not run pytest over both starter/reference trees together. `pnpm test:seed1` verifies reference passes on three runs and checks the intentionally failing starter's exact F2P/P2P behavior.

The backend's dependencies are open-source libraries; original TorqueCode application and seed code is written for this hackathon. Package metadata preserves dependency licenses.

`pnpm test` now runs both Vitest and the real pytest reporter regression suite. The approved K1 compatibility exception and exact differences from the later checkpoint prompts are documented in `docs/BACKEND_DECISIONS.md`; teammates must implement the exported current seam signatures.
