# Stable Hosting Implementation Plan

> **For agentic workers:** Follow this plan inline. The repository requires human review before commit or push; do not create a branch or worktree.

**Goal:** Make the existing six-to-eight-player WebSocket game reachable at a fixed HTTPS URL and verify a full match across devices.

**Architecture:** Deploy the existing single Node process as one Render Web Service. The service serves the page and WebSocket endpoint on the same port. Rooms remain in memory, so deployment or process restart ends active matches.

**Tech Stack:** Node.js 24, `ws`, Render Blueprint, Playwright, six-player browser simulation.

## Global Constraints

- All files stay under `D:\workspace`.
- Do not commit or push until a human has inspected `git diff --cached`.
- Do not create a branch or worktree without explicit permission.
- Do not treat automated play as proof of human-play balance.

---

### Task 1: Prepare and check the deployable version

**Files:**
- Create: `D:\workspace\render.yaml`
- Modify: `D:\workspace\last-train\app\README.md`
- Modify: `D:\workspace\last-train\README.md`

- [x] Set `rootDir` to `last-train/app`, install production dependencies with `npm ci --omit=dev`, start with `npm start`, set `HOST=0.0.0.0`, use `/health`, pin Node 24, and turn off automatic deploys.
- [x] Run `npm test`, `npm run check`, and `npm run test:browser` in `D:\workspace\last-train\app`; all checks passed.
- [x] Listen on `0.0.0.0`; `/health` returned `{ "ok": true }` and two independent WebSocket clients created and joined a room.
- [ ] Inspect `git diff` and `git diff --check`; stage only files for this game.
- [x] Run `pwsh -File D:\workspace\tools\dev.ps1 review`; it timed out after 600 seconds without a review verdict.

### Task 2: Publish and verify the fixed URL

**Files:**
- Read: `D:\workspace\render.yaml`
- Read: `D:\workspace\last-train\app\test\public-smoke.mjs`
- Modify: `D:\workspace\last-train\CONTEXT.md`

- [ ] After human diff review, commit and push only the reviewed game and Blueprint files.
- [ ] In Render, create a Blueprint connected to the repository's `render.yaml`, then turn Blueprint Auto Sync off before live play; expected: one healthy web service with a fixed `onrender.com` URL.
- [ ] Set `TEST_URL` to that exact HTTPS URL and run `node test/public-smoke.mjs`; expected: one two-client public check passes.
- [ ] Open the URL on two distinct devices, then organize a six-to-eight-person full match; record connection failures, unclear rules, match duration, and resource pressure without changing live code mid-match.
