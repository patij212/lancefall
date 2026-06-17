# LANCEFALL — Session Handoff (2026-06-17)

Focus this session: **ship silhouettes** (canonical, in `src/`) + the **UI mock** loadout
portrait & hangar backdrop (deploy-only mocks). Branch: `v6`.

## What shipped

### 1. Ship silhouettes — `src/shipModels.ts` (COMMITTED)
Redesigned the two hulls the user flagged as weak; the other four (Lance, Tempest,
Reaver, Phantom) are unchanged. Geometry is the canonical source shared by the in-game
renderer, the title ship-select chips, and the UI mock — so all three stay identical.

- **GLAIVE** → a **wide swallowtail spear** (glass cannon, "wide spear"). Sharp nose,
  broad shoulders, forked swallowtail tail. Went 3 rounds: forward-trident → rear-trident
  dart (read like Phantom) → final wide swallowtail. Lesson baked in: a new hull must be
  judged **against the full roster** (esp. Phantom/Reaver/Lance) for distinctness, not in
  isolation.
- **BASTION** → a **broad armoured warship** (tank). Pointed ram-prow, forward-swept
  wing-sponsons, wide weighted stern, forward bridge core. Point-up / broad-base = the
  inverse of a shield (the user's complaint about the first attempt).
- Verified: `npx vitest run src/shipModels.test.ts` → **9/9 pass**; `shipModels.ts` is
  `tsc --noEmit` clean. **User-approved** ("the ships all look good") — treat as LOCKED.

### 2. UI mocks — DEPLOY-ONLY (not committed, per project convention)
Source lives in `.superpowers/brainstorm/54811-1781613310/content/` (`mock-mainui.html` =
cockpit, `mock-v6.html` = title). Delivered via the live Cloudflare Worker, **not** git.

- **Ship-system parity:** both mocks render ships through the same embedded `shipSVG`
  renderer + `SHIP_MODELS` geometry (mirrors `src/shipModels.ts`), "Top-Lit Gun-Metal"
  look (engine wash · volumetric body · specular sheen · plating inset · rim-light ·
  reactor core). `mock-v6`'s loadout portrait was ported from a stale inline Lance to this
  shared renderer this session.
- **Hangar-grid backdrop** added behind the loadout portrait in BOTH mocks: a CSS
  perspective grid pad (`perspective(105px) rotateX(68deg)` + radial/linear masks),
  `currentColor`-tinted so it follows the equipped hull (cyan/Lance, magenta/Glaive…),
  **static** (no animation → zero perf cost), reduced-motion-safe.

## Live deployment
- Worker `lancefall-ui` (Cloudflare, account `1f37738153bc…`, OAuth as patij212@wp.pl,
  **Workers-write, no Pages scope** → use `wrangler deploy`, not `wrangler pages`).
- Config + assets: `lancefall/mockups-ui/` (`wrangler.toml` → `[assets] directory=./public`;
  `public/{index,cockpit,title,runend,ingame,favicon.svg}`). cockpit=mock-mainui,
  title=mock-v6, runend=mock-choice-v1, ingame=mock-ingame.
- URL: https://lancefall-ui.patij212.workers.dev — **latest Version `d73a2e83`**.
- Update flow: edit the mock in `.superpowers/.../content/`, `cp` it to
  `mockups-ui/public/<name>.html`, then `cd mockups-ui && npx wrangler deploy`.
- Local preview: `python -m http.server 8770` from the lancefall root (append `?cb=N` —
  the server 304-caches edits). The only console error anywhere is a harmless
  `/favicon.ico` 404 (the deploy uses `favicon.svg`).

## Known issues / not mine
- `src/ui.ts` has 3 unused-var lints (`glossActive` / `glossTimer` / `glossSeenSession`,
  TS6133) — pre-existing from the **parallel agent's** in-progress `ui.ts`/icons work.
  Left untouched on purpose (user said "leave the lints").
- Uncommitted in `src/` from the parallel agent (NOT mine, do not sweep into ship commits):
  `icons.ts`, `icons.test.ts`. The session also started with `render.ts`/`tune.ts` dirty.
- GitNexus index was mid-rebuild all session → `impact`/`detect_changes` unavailable, so
  the pre-commit blast-radius check couldn't run. The shipModels change is pure cosmetic
  geometry data (two const arrays), covered by passing unit tests — low risk.

## Suggested next steps
- The UI-mock thread is wrapped (all four surfaces mocked + deployed; ships locked).
- Real next move per `docs/PERFECT_10_SPEC.md`: **port the cockpit mock into `src/`**
  (Tier 1.1) — the mocks are standalone DOM/CSS and not yet wired to the game.
- Enemy biomech art (`render.ts` per-`kind` rewrite) is still parked pending the user's
  per-enemy variant picks (see `mockups/enemies-compare.html`).
