# TorqueCode — React frontend

The complete local frontend converted to Vite + React + TypeScript, React Router and Monaco, following the product/API rules in the supplied AKSHIT.md. The warm visual design and original laptop/falling-code landing animation are retained. This is a separate local project; no GitHub changes or deployment were made.

## Run

> **Imported into the repo on 2026-10-31 (branch `pranav/frontend-import`).** This folder is now part of the pnpm workspace; `package-lock.json` was removed and the dependencies live in the root `pnpm-lock.yaml`. Live-mode integration with the current backend is verified by `tests/e2e/journey.mjs`. Statements below about the standalone preview describe the zip as received.

From the repo root run `pnpm install --frozen-lockfile --ignore-scripts`, then `pnpm --filter torquecode-frontend dev`. Use Node 24. The server uses port 4177.

- Story/landing: http://127.0.0.1:4177/landing/
- React app: http://127.0.0.1:4177/#/login
- Design mockups that are in the repo (3 of the original 11): http://127.0.0.1:4177/designs.html

Use **Try the complete preview** to explore without a backend. The footer settings switch modes and reset the sample session. Submit each question to reveal the next unlock; assistance appears only where enabled. **Finish assessment** opens a preview-only confirmation, saves and submits all available questions, closes the sample session, and offers **View sample report**. Try the complete visual flow at http://127.0.0.1:4177/#/finish-preview. Connected backend mode is unchanged because the real API has no early-finish endpoint.

## Build and checks

From `src/frontend`: `pnpm run build` checks TypeScript and produces `dist`. `pnpm run test:ui` runs the React interaction checks. `pnpm test` checks the demo API and live adapter. `pnpm run preview` serves the production build on port 4177. The Monaco editor and worker are bundled locally and loaded only when entering the coding screen, with no external CDN dependency. The initial application excludes the editor chunk.

## Backend integration

Live mode uses only relative `/api/...` requests, cookies, the actual backend shapes, and no fallback to demo data. Vite forwards `/api` to port 3001, removes the prefix, and preserves the browser Origin (`changeOrigin:false`). Configure the backend with `APP_MODE=auth`, `AUTH_ORIGIN=http://127.0.0.1:4177` and its database/runner/LLM settings before selecting Connected backend. The real backend has not been started or integration-tested for this standalone preview.

One server countdown synchronizes every 15 seconds; all editable files autosave after 1.5 seconds and before Run/Submit or sign-out. Timer expiry is confirmed with the backend. Hidden results show aggregates only. Unlocks use backend flags and a two-upgrade cap. No level labels appear in assessment screens. Activity is captured only while the coding component is mounted and batched every 10 seconds/20 events. A runner failure records no grade. Assistant failures are shown without breaking the editor.

All values in demo mode are sample fixtures, not grades of edited code. Python is never executed in the browser. The sample report represents a separate illustrative assessment. Passwords are not stored. Browser progress uses sessionStorage and mode selection uses localStorage.

## Code structure

- `src/frontend/src/main.tsx`: routing, authentication boundary, persistent layout, toast, preview settings.
- `src/frontend/src/lib.tsx`: typed API wrapper, shared components, app context, save-before-leave hook.
- `src/frontend/src/pages/`: Auth, Portfolio, Quiz, Ready, Workspace and Report React components.
- `src/frontend/src/monaco-setup.ts`: local editor worker, Python support and TorqueCode theme.
- `src/frontend/src/contracts.ts`: standalone type bridge for `@torquecode/contracts`, based on the repository's public API at e04f5d0d0a012ef9261fa5db8eff9401030acabc. In the actual pnpm repository replace this tsconfig alias with its existing `@torquecode/contracts: workspace:*` dependency; the backend contracts remain authoritative.
- `src/frontend/src/api.mjs`, `demo-data.mjs`: explicit preview simulator and real fetch adapter/public fixtures.
- `src/frontend/src/*css`: design tokens, onboarding/report styling, restrained motion, responsive and reduced-motion states.
- `src/frontend/public/landing/`: original canvas laptop/code journey, slowed module cards, and app entry links.
- `src/frontend/public/designs/`: the three PNG mockups that were included (02, 03, 04); the other eight were not in the import.
- `src/frontend/vite.config.ts`, `tsconfig.json`, `package.json`, `package-lock.json`: project configuration.

No deployment host was supplied, so no production API rewrite or Vercel deployment is fabricated. Configure hosting against the actual backend host before publishing. The current scope is a local frontend preview.

Browser automation is disabled in Work settings. Automated component/API tests and production build checks are available; visual animation/responsive browser QA is not claimed.

