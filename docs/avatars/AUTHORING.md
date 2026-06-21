# Authoring LANCEFALL avatars — the craft guide

How to create a profile-avatar medallion (`src/render/avatars/scenes/<id>.ts`) at the fidelity bar.
This is the version-controlled canonical guide; it is mirrored as the local Claude skill
`lancefall-avatars` (which auto-triggers when you work on avatars). The architecture & interface live
in the design specs — this doc adds the **craft**, the **gotchas**, and the **build/verify loop**.

The avatars are collectible **medallions** — each a pure procedural-SVG sigil (intricate, layered,
animated neon art; NOT flat icon-art). One `scene(ctx) => string` per sigil returns the hex-window
content; a shared tiered frame wraps it. The hard part is **fidelity**, not plumbing.

## Read first (don't reinvent the architecture)
- `docs/superpowers/specs/2026-06-20-profile-avatars-design.md` §5 — module structure + the **STABLE
  registry interface** (`AvatarVisual`, `renderAvatar`, `SceneCtx`, …). Match these names exactly.
- `docs/superpowers/specs/2026-06-20-avatars-reference-prototypes.md` — coordinate system, the shared
  `<defs>`, the tiered `frame()`, and the motion recipes. The fidelity gold standard.
- The existing `src/render/avatars/scenes/*.ts` are your pattern library. The bar: `ring.ts`
  (COHERENCE), `sovereign.ts` (THE FALLEN CROWN), and the reworked `fall.ts`/`graze.ts`/`beacon.ts`.

## Module map (where things go)
| File | Purpose |
|------|---------|
| `primitives.ts` | `paletteFor`/`tone` (accent→metal palette), `ref` (uid id helper), `defsFor` |
| `frame.ts` | the tiered medallion (I/II/III) — you do **not** edit it per-sigil |
| `motion.ts` | static-aware recipes: `glint/breathe/spin/twinkle/drift/tween/tweenT/flyOut/when` |
| `scenes/_common.ts` | `coreGlow`, `starfield`, `u('name',uid)` ref helper |
| `scenes/<id>.ts` | ONE file per sigil: `export function scene(ctx: SceneCtx): string` (hex-window content only) |
| `registry.ts` | the stable interface + the `AVATAR_VISUALS` table (add an entry for a new sigil) |

## The craft recipe — what makes them beautiful
The #1 review note, every round, was **"too simple" / "a lone object in a void."** Fidelity = **layered
depth**. Build each scene back-to-front — aim for **~8–15 distinct element groups**:

1. **Atmosphere** — `coreGlow` + `starfield` (+ a nebula / colour wash for depth).
2. **Structure** — concentric rings / arcs / a field keyed to the motif.
3. **Subject** — a *composed scene*, never a lone icon: the subject **plus its supporting
   environment** (a falling star gets a moon + skyline + impact pool; a beacon gets a whole
   lighthouse + sea + sweeping beam; a bell gets light-shafts + kelp + a seabed + sound-rings).
4. **Motion** — one clear **signature verb** (strike/resonance/sweep/implode/weave/shatter/toll/…),
   plus ambient life (twinkle / drift / breathe).
5. **Finish** — facets, glints, sparks, edge highlights, and one bright **focal core**.

Rules of thumb:
- Every sigil is **unique** — never reuse another's central object (don't make everything a lance).
- **"Add complexity" means add layers**, not restyle: a city → searchlights + neon signs + harbor
  reflection + parallax; a flame → blue-hot base + white crown + side wisps + a mandala halo.
- Keep a clear **focal hierarchy** so density reads as *rich*, not muddy (dim competing brights).

## Hard constraints (these WILL bite — the test/owner caught each)
- **uid namespacing (mandatory):** every `id="…"` and every `url(#…)`/`href="#…"` is suffixed with
  `ctx.uid`. 24 medallions render on one grid; un-namespaced ids collide and corrupt fills.
  `registry.test.ts` asserts two uids share no id.
- **Pure & deterministic:** `(ctx) => string`. No DOM, no rng, no `Date.now()`/`Math.random()`.
- **Static-aware:** when `!ctx.animated`, emit a fully-composed **still** — **zero `<animate*>` tags**,
  no missing elements, no layout shift. The `motion.ts` helpers return `''` when static; for any
  element with base `opacity="0"` that animates *in*, give it a visible base opacity in the static
  branch (otherwise it vanishes from the still).
- **Valid SMIL `keyTimes`:** must **start at 0, end at 1**, be monotonic, and have the **same count as
  `values`**. (The locked prototypes shipped invalid keyTimes — browsers silently fell back; fix when porting.)
- **No unused imports/locals:** tsconfig has `noUnusedLocals`/`noUnusedParameters`. After iterating you
  *will* leave an unused `when`/`tone`/`p` — drop it. (The single most common tsc error in this work,
  often after deleting a stray `when(a,'')` no-op.)
- **Animation visibility:** if a hero element fades out and resets (a falling star, a dash), keep its
  visible window **≳80% of the loop** — slow the motion, shorten the dead zone, or phase a second
  element to fill the gap — or a single frame looks empty.

## Verify (every change)
1. `npx tsc --noEmit 2>&1 | grep render/avatars` → must be empty. (A concurrent integration track may
   break full-project `tsc`/build — **filter to your files**; their breakage is not yours.)
2. `npx vitest run src/render/avatars/` → the registry + gallery tests green (this **regenerates the
   gallery** HTML).
3. Screenshot it (`file://` is blocked by Playwright): `python -m http.server 8766` then Playwright →
   `http://localhost:8766/mockups/avatars-gallery.html`; confirm **0 console SVG/SMIL errors**;
   screenshot the card at zoom 3–4 (`document.body.style.zoom`, `card.scrollIntoView`). Review the
   **animated** frame *and* the **STATIC** section. (The Playwright/Chrome instance lock sticks — clear
   it by killing `chrome.exe` whose CommandLine contains `ms-playwright-mcp`.)

## Workflow
1. Brainstorm the concept: a **unique motif + a signature motion verb**, informed by the lore.
2. Build in **small batches** (3–4 sigils), regenerate the gallery, **review with the owner** (they
   open `mockups/avatars-gallery.html`). Iterate per-sigil they flag.
3. **Protect before a rework/polish pass on already-approved sigils:** snapshot the good state —
   `git tag -a avatars-approved-<date> -m "…" <commit>` + a `backup/…` branch. Revert one sigil:
   `git checkout <tag> -- src/render/avatars/scenes/<id>.ts`.
4. Commit per batch, **path-scoped**: `git add src/render/avatars/scenes/<files> mockups/avatars-gallery.html`.
   A concurrent agent edits `ui.ts`/`save.ts`/`avatarUnlocks.ts` — never wholesale `git add -A`.

## Common mistakes → fix
| Symptom | Fix |
|---------|-----|
| flat / "too simple" / lone object | layer it (atmosphere→structure→subject→motion→finish), ~10 element groups |
| reused another sigil's object | give each a unique central motif |
| static frame looks broken/empty | static-aware: no `<animate>`; visible base opacity on animate-in elements |
| console SMIL error | `keyTimes` start 0 / end 1 / monotonic / count == values count |
| `tsc` `noUnusedLocals` | drop the unused import (left over from iterating) |
| medallion empty at a random moment | hero-element dead-zone — keep it visible ≳80% of the loop |
| dense but muddy | sharpen the focal hierarchy; dim competing brights |

## Proven (this is recreatable)
A fresh agent given only the `lancefall-avatars` skill authored a brand-new sigil ("THE DROWNED BELL":
bronze bell + clapper, volumetric god-ray light-shafts, kelp, seabed, expanding toll sound-rings) with
13 layered element-groups, all hard constraints satisfied, tsc-clean — first pass.
