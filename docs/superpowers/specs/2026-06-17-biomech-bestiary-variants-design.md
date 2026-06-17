# Biomechanical Bestiary — Variants Sheet (Design)

**Date:** 2026-06-17
**Status:** Approved (design); pending spec review
**Owner:** Claude (enemy-art mock pass, user-directed)

## Goal

Produce one comprehensive **biomechanical** bestiary mock that shows **every** enemy in
the LANCEFALL roster, and for each enemy shows the **visual variants we have** plus, for
the enemies that don't yet have one, **two new biomech variants** drawn in the language of
the five designs the user liked (the recovered Proposal B / `worker.js` `drawB_*` style).

Nothing existing is removed: the full SVG bestiary roster is kept, the recovered
Proposal B canvas heroes are reused verbatim.

## Decisions (locked with user 2026-06-17)

- **Medium for new variants:** HTML5 Canvas 2D, rich + animated (radial glow, layered
  carapace plates, neon rim, bio-vein detail, motion). Same medium the game renders in
  (`src/render.ts`), so the look ports later.
- **Variants per entity:** **2 new canvas takes each — everyone, heroes included.**
- **Scope:** Everything — 13 enemies + 1 Champion (elite) + 6 bosses = **20 entities**.
- **Heroes keep their reference:** Darter, Orbiter, Lancer, Seeker, Warden additionally
  show their recovered liked **Biomech B ★** card as the "evolve-toward" anchor, alongside
  their 2 new takes.

## Constraints / invariants (from PERFECT_10_SPEC.md)

- **Silhouette coding survives.** Each creature keeps its canonical colorblind shape
  (Darter=arrowhead, Orbiter=hex disc, Splitter/Mini=diamond, Bloomer=square,
  Lancer=barrel-triangle, Bomber=circle, Wisp=triangle pack, Drifter=crescent,
  Shade=blinking square, Brooder=hex pod, Herald=wall bar, Seeker=eye). The biomech
  detail is *additive* on top of the silhouette, never replaces it.
- **Constant neon threat-rim.** Every creature carries a bright rim regardless of state —
  legibility is never sacrificed to mood.
- **Codex accent colours.** Each entity uses its canonical accent (carried from the SVG
  bestiary `--c` values).
- **Reduce-motion aware.** The mock respects `prefers-reduced-motion`: animation loops
  fall back to a static representative frame.

## Artifact

A single self-contained file: **`mockups/biomech-bestiary-variants.html`**.
- Reuses the proven canvas helpers from `worker.js`: `glow()`, `rgba()`, `ngon()`.
- Reuses the recovered `drawB_*` hero functions verbatim.
- Leaves `enemies-biomech.html`, `worker.js`, and `proposal-*.html` untouched.

## Structure

CSS grid of **per-card mini-canvases** (each card runs its own RAF loop; SVG cards are
inline `<svg>`). Grouped into three sections: **Enemies (13) · Elite (1) · Bosses (6)**.

One row per entity:

| Entity type | Col 1 | Col 2 | Col 3 | Col 4 |
|---|---|---|---|---|
| Hero (Darter, Orbiter, Lancer, Seeker, Warden) | Silhouette (SVG) | **Biomech B ★** (recovered liked) | **v2-A** (new) | **v2-B** (new) |
| Non-hero enemy / elite / boss | Silhouette (SVG) | **v2-A** (new) | **v2-B** (new) | — |

Each card: a label strip (variant name + medium + hex), the visual, and on the row header
the entity NAME · role · one-line silhouette note.

## Style DNA for new variants (the "liked-5" language)

Each new creature draw function must include, in this layering order:
1. `glow(r*3, accent, ~0.35)` radial halo.
2. Dark carapace plates (`#1xxxxx`-class near-black fills) bounded by a bright `acc` rim.
3. Bio-vein / sensor detail (thin accent strokes, dot nodes) hinting at the AI verb.
4. A pulsing or rotating core / sensor, driven by the shared time `t`.
5. The canonical silhouette as the overall envelope.

## Build order (render-gated checkpoints)

1. **Scaffold** — data-driven page shell, helpers, all 20 SVG silhouette cards + 5 liked-B
   hero cards + init RAF loop. Render → confirm framework + hero-B parity with `shot-b.png`.
2. **Hero new takes (5×2=10)** — Darter, Orbiter, Lancer, Seeker, Warden v2-A/B. These set
   the style bar (compared directly against liked-B). Render → review.
3. **Enemies new takes (9×2=18)** — Splitter, Mini, Bloomer, Bomber, Wisp, Drifter, Shade,
   Brooder, Herald. Render → review.
4. **Elite + bosses new takes (6×2=12)** — Champion, Weaver, Beacon, Mirrorblade, Hollow,
   Sovereign. Render → review.
5. **Full-page render + cleanup** — final snapshot, remove scratch.

Total new canvas creature functions: **40** (20 entities × 2).

Each batch is screenshotted via Playwright (`mockups/_recovered/render.cjs` pattern) so
review is on real pixels.

## Out of scope

- No changes to `src/render.ts` or in-game rendering (that's the later port).
- No new enemy behaviors/verbs (visual only).
- No automated tests beyond the visual render check (it's a static mock artifact).

## Verification

- Page loads with no console errors; all 20 entities render.
- Hero B cards visually match `mockups/shot-b.png`.
- Each new variant preserves its canonical silhouette and carries a constant neon rim.
- `prefers-reduced-motion` renders static frames.
