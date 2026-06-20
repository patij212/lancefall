# Agent prompt — Build the 24 LANCEFALL profile avatars (visual layer)

Copy everything below the line into a fresh agent session (run from the `lancefall/` project root).
The user will collaborate live via the gallery — build it early and iterate per-sigil with them.

---

You are building the **visual layer** for 24 collectible profile avatars in **LANCEFALL** (THE LAST
LANCE), a neon dash-combat bullet-hell roguelite. Each avatar is an ornate, animated **medallion**
rendered as a **pure procedural SVG string** — no binary assets. The user will review your work in a
browser gallery and iterate with you on each sigil's look.

## Read first (do not skip)
1. `docs/superpowers/specs/2026-06-20-profile-avatars-design.md` — the full design. §3 visual standard,
   §4 the 24 roster (each avatar's accent / tier / glyph brief / signature motion), §5.1 the module
   structure and the STABLE registry interface you must expose.
2. `docs/superpowers/specs/2026-06-20-avatars-reference-prototypes.md` — the **fidelity gold standard**:
   coordinate system, the shared `<defs>`, the tiered `frame()` markup, the motion recipes, and a full
   worked sigil (THE LANCE). MATCH this density and motion quality. This is the bar; do not ship flat
   icon-art.
3. `src/bestiary.ts` lines ~34–39 — the canonical boss accent colours (warden `#ff3b6b`, weaver
   `#a855f7`, beacon `#38bdf8`, mirrorblade `#ef4444`, hollow `#6ee7b7`, sovereign `#fde047`).

## Hard constraints
- **Scope: only create files under `src/render/avatars/**` and the gallery emitter.** Do NOT modify
  `save.ts`, `ui.ts`, `game.ts`, `render.ts`, or any other existing game file. The integration (save
  field, unlock predicates, picker, cockpit) is a SEPARATE track that wires into your registry later.
- **Do not bloat huge files.** One file per concern, one file per sigil scene (see structure below).
  Keep each scene file focused and readable.
- **Pure.** No DOM, no `rng`, no `Date.now()`/`Math.random()`, no game state. Builders are
  `(ctx) => string`. Deterministic output for the same inputs.
- **uid namespacing is mandatory.** Every `<defs>` id and every `url(#…)` ref is suffixed with the
  instance `uid` (see reference doc). 24 medallions render on one grid — id collisions corrupt fills.
  Add a `registry.test.ts` assertion that two renders with different uids share no `id="…"`.
- **Match the stable interface** in §5.1 exactly (`AvatarVisual`, `AVATAR_VISUALS`, `AVATAR_IDS`,
  `renderAvatar`, `DEFAULT_AVATAR`, `SceneCtx`). The rest of the game depends on these names.
- **Accessibility/variants.** `renderAvatar` root carries `role="img"` + `<title>`/`<desc>`.
  `ctx.animated === false` ⇒ emit a fully-composed **static** frame (NO `<animate*>` tags, no missing
  elements, no layout shift). `ctx.variant === 'tile'` ⇒ a lightweight form (static or ≤1 glint) for
  the 24-up grid. `variant:'full'` plays the signature motion.
- **Tiers drive the frame** (I/II/III) per §3.2 — frame ornament escalates; the scene is per-avatar.

## File structure to create
```
src/render/avatars/
  primitives.ts      // defsFor(accent, uid), hexClip(uid), id helper, small svg-string utils
  frame.ts           // frame(tier, accent, uid, { animated, variant }) -> medallion frame markup
  motion.ts          // reusable motion recipes (glint, breathe, twinkle, filament, strike, shatter, implode, sweep, …)
  scenes/<id>.ts     // 24 files; export function scene(ctx: SceneCtx): string  (hex-window content only)
  registry.ts        // AvatarVisual type + AVATAR_VISUALS (24) + AVATAR_IDS + avatarVisual + renderAvatar + DEFAULT_AVATAR
  registry.test.ts   // the assertions in §9 (visual layer)
  gallery.test.ts    // emits mockups/avatars-gallery.html for browser review (full+tile, animated+static)
  index.ts           // public re-exports
```

## The 24 (from §4 — id · tier · accent · motion)
Free (tier I, cyan family): `lance` strike · `ring` resonance · `beat` pulse · `fall` fall ·
`graze` skim · `comet` dash · `skyline` flicker · `chevron` climb.
Boss (tier II; `sovereign` tier III): `warden` gate · `weaver` weave · `beacon` sweep ·
`mirrorblade` mirror · `hollow` implode · `sovereign` shatter/warp.
Cipher (tier II): `codebreaker` rotate · `remember` rise · `choice` balance · `vigil` hold.
Pilot (tier II; `eternal` tier III): `heat` burn · `untouched` shield · `daybreak` flare ·
`lastbreath` clutch · `solstice` shine · `eternal` eternal.
(Full glyph/scene briefs + accents are in §4. Give each a FILLED scene — supporting environment +
signature motion — never a lone object in empty void; that was an explicit review note.)

## Workflow (collaborate with the user)
1. Build `primitives.ts` + `frame.ts` + `motion.ts` + `registry.ts` skeleton + `gallery.test.ts`.
   Port the worked THE LANCE scene + COHERENCE from the reference doc first.
2. Run the gallery emitter (`npx vitest run src/render/avatars/gallery.test.ts`) → open
   `mockups/avatars-gallery.html`. **Show the user; get feedback before mass-producing.**
3. Build the remaining sigils in roster order (free → boss → cipher → pilot). After each small batch,
   regenerate the gallery and review with the user; iterate on any sigil they flag.
4. Keep `registry.test.ts` green throughout. Commit per logical group (e.g. "free sigils",
   "boss crests") with descriptive messages.

## Done when
- All 24 in `AVATAR_VISUALS`; `registry.test.ts` green; `npx tsc --noEmit` clean;
  `npm test` clean (your new tests + no regressions).
- `mockups/avatars-gallery.html` shows all 24 at full + tile, animated + static, each at the reference
  fidelity, and the user has signed off on the set.
- Zero changes outside `src/render/avatars/**` + the generated gallery html. The registry interface
  matches §5.1 so the integration track can wire it in with no rework.

## Notes
- The game is Vite + TS + Vitest; tests run with the TS toolchain (use that for the gallery emitter so
  you don't fight a separate build).
- Boss accents come from `bestiary.ts`; the lore (THE SIX WHO LET IT FALL, THE CHOICE, the Vigil,
  SOLSTICE PROTOCOL) is in the design spec — let it inform each glyph's character.
- If a scene file grows complex, that's fine — it's isolated. Prefer clarity over cleverness.
