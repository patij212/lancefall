# Biomechanical Bestiary — Cosmetic Skin Gallery · Handoff

**Date:** 2026-06-17 · **Branch:** v6 · **Status:** mockup + cosmetic system complete; in-game port not started.

## What this is
An interactive **cosmetic-skin unlock gallery** for every LANCEFALL enemy, built as a
self-contained canvas mockup and deployed to the existing Cloudflare Worker.

**Live:** https://lancefall-mockups.patij212.workers.dev/bestiary
(linked from the worker index as "BIOMECH VARIANTS"; the original proposals stay at `/a` `/b` `/c`.)

## How we got here (session arc)
1. **Recovery** — the "liked" biomechanical enemy designs were thought lost; found intact in
   `mockups/worker.js` as the Proposal-B `drawB_*` Canvas-2D functions (NOT the drifted SVG
   files). Extracted verbatim to standalone `mockups/proposal-{a,b,c}.html`.
2. **Variant bestiary** — built `mockups/biomech-bestiary-variants.html`: all 20 entities
   (13 enemies + Champion + 6 bosses), each row `[SVG silhouette] + canvas takes`.
3. **4 takes per enemy** — authored 80 distinct biomech canvas takes (silhouettes preserved,
   constant neon threat-rim, Codex accents).
4. **Polish** — additive bloom, form-light, rounded joins; lifted every variant.
5. **Cosmetic system (the deliverable)** — see below.

## The cosmetic system (`mockups/biomech-bestiary-variants.html`)
- **Rarity skins:** each enemy's 4 canvas takes = `Common → Rare → Epic → Legendary`
  (heroes' recovered liked-B ★ = their Legendary). 80 skins total.
- **Real achievement unlocks** (from `src/achievements.ts`, mirroring `src/trails.ts` gating —
  tier = whole-roster set unlock):
  | Tier | Achievement id | Condition |
  |---|---|---|
  | Common | `firstblood` | Spear your first enemy (free) |
  | Rare | `survivor` | Reach wave 10 |
  | Epic | `gauntlet` | Win the Arena |
  | Legendary | `regicide` | Bring down the Sovereign |
- **Gallery UX:** locked = greyed silhouette + `???` + the achievement requirement; click → an
  **ignite reveal**; `localStorage` key `lf-biomech-skins`; legend bar with per-tier counts +
  Unlock-all / Reset.
- **Reactive juice:** additive scaled bloom, source-atop form-light, 124 BPM **beat-breath**,
  **cursor-aware parallax**, Legendary chromatic sheen + orbiting motes.
- **Perf/a11y:** **IntersectionObserver** animates only on-screen unlocked skins (80 bloomed
  canvases at once ≈ 3fps → gated, smooth). `prefers-reduced-motion` → static frame.
  `?eager=1` disables IO gating so full-page screenshots paint every card.

## Files
- `mockups/biomech-bestiary-variants.html` — the gallery (source of truth).
- `mockups/biomech-bestiary-variants.png` — default-state snapshot. `…-allunlocked.png` — showcase.
- `mockups/proposal-{a,b,c}.html` — recovered originals (Proposal B = the liked 5).
- `mockups/worker.js` + `wrangler.toml` — the deploy. `/bestiary` route holds the inlined gallery.
- `mockups/_recovered/` — tooling:
  - `build-worker.cjs` — idempotently re-injects the gallery HTML into `worker.js` (run before deploy).
  - `shoot.cjs` (full page) / `closeup.cjs <names>` (per-entity) — Playwright renders (use `?eager=1`).
  - `gallery-check.cjs` / `remote-check.cjs` / `reduce-check.cjs` — verification harnesses.
- `docs/superpowers/specs/2026-06-17-biomech-bestiary-variants-design.md` — design spec.

## Redeploy
```
cd mockups
node _recovered/build-worker.cjs   # re-inject latest HTML into worker.js
npx wrangler deploy
```

## Remaining work (NOT started — needs a decision)
The only thing left to make these real in-game is the **integration**, deliberately left for
coordination because project memory scopes enemy art/render to a **parallel agent's lane**
(`render.ts` is also a flagged god-object):
1. `skins.ts` data module (like `trails.ts`): skin id → draw fn + rarity + `unlockAch`.
2. `save.ts`: persisted `selectedSkin` per kind + unlocked set (achievements already persist).
3. Cosmetics picker in the UI (alongside dash-trail selection).
4. `render.ts` per-`kind` skin dispatch + a **gameplay-LOD** variant (these are gallery-detail;
   in-game they're ~24px among many) + **perf-tier gating** of bloom/shadowBlur.

**Explicitly declined by the user:** re-theming the 80 into 4 art-coherent whole-roster themes
(Chitin/Foundry/Spectre/Regalia). The per-enemy rarity model stands instead.

See also memory: `biomech-design-source.md`.
