# Profile Avatars — Design Spec

**Date:** 2026-06-20
**Status:** Design locked, ready for implementation plan
**Project:** lancefall (THE LAST LANCE)

## 1. Overview

Add **24 collectible profile avatars** to LANCEFALL — ornate, animated neon "medallion" emblems
players choose as their identity. Avatars are pure procedural SVG (no binary assets), unified by a
shared tiered medallion frame, each with a bespoke central *sigil scene* and a signature animation.

**Goals**
- Give every player a distinctive identity that shows wherever *their* name shows.
- Reward progression: 8 free from the start, 16 unlocked by milestones the player has already earned.
- Keep it pure, testable, theme-able, and consistent with the existing canvas/SVG-only codebase.

**Non-goals (this pass)** — see §10 for follow-ups.
- No leaderboard / ghost / duel avatar display (that needs a Worker + D1 schema change).
- No "AVATAR UNLOCKED" toast moment (unlocks are derived; can be added later).
- No new binary assets or image pipeline.

## 2. Decisions (locked during brainstorming)

| Decision | Choice |
|----------|--------|
| Theme | **Mixed roster** — free sigils + boss crests + decryption line + prestige line |
| Format | **Procedural SVG** — pure functions returning inline SVG strings |
| Placement | **Profile/account panel only**, changeable anytime |
| Display reach | **Local-only first** — profile panel + title cockpit (where YOUR name shows) |
| Unlock model | **8 free + 16 earned** |
| Unlock logic | **Derived from existing save fields** via a pure `isAvatarUnlocked(id, save)` predicate |
| Frame ornament | **Escalates by tier** (I / II / III) — rank reads in the metal |
| Fidelity bar | The v3/scene prototypes (shatter / resonance / strike / implode) are the standard |

## 3. Visual standard

### 3.1 Medallion anatomy (shared frame)
From outside in: outer glow halo → (tier II+) radial **ray-burst** → (tier II+) engine-turned
**guilloché** → reeded coin edge (dashed ring) → metallic **bezel band** (brushed light-sweep gradient)
→ inner bevel groove → a slow counter-rotating **rune ring** → the **hex window** (clipped scene field)
→ inner hairline hex → corner **rivets/studs**. A traveling **light-glint** sweeps the bezel
(1 / 2 / 3 glints by tier). The silhouette is a hexagon set in a circular medallion.

### 3.2 Tier system
Frame ornamentation is driven by `tier: 1 | 2 | 3` on the avatar def:

- **Tier I (free sigils)** — slim single bezel, **no** ray-burst, **no** guilloché, 6 small studs,
  1 glint. Clean and delicate; the life is internal.
- **Tier II (boss crests, most earned)** — ray-burst, guilloché, rotating gear-tooth outer ring,
  heavier double frame, 12 studs, 2 glints.
- **Tier III (apex prestige)** — adds sunburst crown ticks, crenellation ring, laurel flourishes,
  triple ring, glowing star-point regalia on the upper vertices, 3 glints.

### 3.3 Per-sigil scene + motion
Each avatar fills its hex window with a *composed scene* (never a lone object in void): a supporting
environment keyed to its motif, plus a signature **motion verb**. Proven archetypes:
- **strike** (THE LANCE) — lunge + impact shockwave + spark burst, recoil; field = target reticle,
  momentum streaks, combo chevrons, fall-motes, rune ring, full-field impact flash.
- **resonance** (COHERENCE) — concentric rings, radial spokes, morphing interference waveform,
  breathing faceted core, orbiting comet-bodies.
- **shatter** (THE FALLEN CROWN) — a spike splinters into ~11 flying shards + dust on a seamless
  loop, crack web propagates across the band.
- **implode** (THE HOLLOW) — broken ring over a void, rings collapse inward, particles spiral in,
  the lost key-glyph flickers for one instant per cycle.

Other avatars get their own verb (see §4): *sweep, warp, ignite, rise, hold, etc.*

### 3.4 Accessibility & performance
- **`reduceMotion`** (Settings.reduceMotion / `prefers-reduced-motion`): every avatar freezes to a
  fully-composed **still frame** — no layout shift, no missing elements. Builders take an
  `animated: boolean` option; when false, emit the static composition (no `<animate*>` tags).
- **`reduceFlashing`**: damp the full-field flashes/bloom (lower opacity, no rapid strobe).
- **Picker grid** renders a **lightweight variant** (static or single-glint) for 24-at-once perf;
  the focused **preview** plays full motion.
- SVG `role="img"` with `<title>`/`<desc>`; picker tiles carry `aria-label` (name + locked state + hint).

### 3.5 Theming
Each avatar has a **canonical accent** (lore-driven — boss accents come from `bestiary.ts`). The
accent is the avatar's identity, not the active theme. (A future option could tint by theme; out of scope.)

### 3.6 ID namespacing (critical implementation note)
SVG `<defs>` (gradients, filters, clipPaths) use `id`s. Rendering multiple avatars on one page (the
grid) **will collide** duplicate ids and corrupt fills. Every builder MUST accept a `uid` (instance
prefix) and suffix all internal ids + `url(#…)` refs with it (e.g. `bzC-${uid}`). `renderAvatar`
generates/threads the uid.

## 4. The 24-avatar roster

Accent, tier, glyph brief, motion, and the **derived unlock predicate** (against real `SaveData`
fields; thresholds are tunable knobs, marked *~*).

### FREE — the sigil set (tier I, always unlocked)
| id | Name | Accent | Glyph & scene | Motion |
|----|------|--------|---------------|--------|
| `lance` | THE LANCE | `#7df9ff` | slender shaft + leaf spearhead, binding wraps, pennon; reticle + momentum field (lance scaled ~0.9 to sit inside the envelope) | strike |
| `ring` | COHERENCE | `#7df9ff` | concentric resonance rings, spokes, interference wave, faceted core | resonance |
| `beat` | THE BEAT | `#7df9ff` | metronome pulse + on-beat pip ring, expanding beat-rings | pulse |
| `fall` | LANCEFALL | `#9bb6ff` | falling star over a horizon line, descending light streaks | fall |
| `graze` | GRAZE | `#7df9ff` | a dot threading a near-miss arc, skimming sparks | skim |
| `comet` | DASH | `#7df9ff` | comet head + segmented trail, motion blur | dash |
| `skyline` | THE CITY | `#7df9ff` | neon skyline silhouette, lit windows, parallax | flicker |
| `chevron` | VANGUARD | `#7df9ff` | stacked ascending combo chevrons, rising | climb |

### THE SIX WHO LET IT FALL — boss crests (tier II; tier III for Sovereign)
Unlock: `save.killsByKind[<bossId>] > 0` (boss kills tally per kind — see `game.ts` CODEX tally).
| id | Name | Accent | Glyph & scene | Motion | Unlock |
|----|------|--------|---------------|--------|--------|
| `warden` | THE WARDEN'S SEAL | `#ff3b6b` | barred portcullis, "barred-from-inside" beam, lock-shield + keyhole, embers | gate / pulse | `killsByKind.warden > 0` |
| `weaver` | THE WEAVER'S KNOT | `#a855f7` | tangled cipher-thread knot, weaving strands | weave | `killsByKind.weaver > 0` |
| `beacon` | THE DARK BEACON | `#38bdf8` | unlit lighthouse eye, a dead sweeping beam | sweep | `killsByKind.beacon > 0` |
| `mirrorblade` | THE MIRRORBLADE | `#ef4444` | mirrored twin-lance, your-own-colour reflection | mirror | `killsByKind.mirrorblade > 0` |
| `hollow` | THE HOLLOW | `#6ee7b7` | broken ring + void, inward spiral, flickering lost key | implode | `killsByKind.hollow > 0` |
| `sovereign` | THE FALLEN CROWN | `#fde047` | **(tier III)** broken five-spike crown, gravity warp, shatter | shatter / warp | `killsByKind.sovereign > 0 \|\| stillpointChoice !== 'none'` |

### THE CITY REMEMBERS — decryption line (tier II)
| id | Name | Accent | Glyph & scene | Motion | Unlock |
|----|------|--------|---------------|--------|--------|
| `codebreaker` | THE CODEBREAKER | `#8b7dff` | cipher rotor wheel, glyph→plaintext flip | rotate | `decryptedWords.length >= ~0.25 × vocabulary().length` |
| `remember` | REMEMBER EVERYTHING | `#7df9ff` | restored skyline, every window igniting | rise | `decryptedWords.length >= vocabulary().length` (100%) |
| `choice` | THE CHOICE | `#fde047`/`#6ee7b7` | split light/dark sigil, the two readings | balance | `stillpointChoice !== 'none'` |
| `vigil` | THE VIGIL | `#ffd76b` | a single held flame, steady | hold | `stillpointChoice === 'catch'` (the Vigil) |

### THE PILOT — prestige line (tier II; tier III for `eternal`)
| id | Name | Accent | Glyph & scene | Motion | Unlock |
|----|------|--------|---------------|--------|--------|
| `heat` | HEATFORGED | `#ff7a3b` | flame-wreathed crest, heat shimmer | burn | `maxHeat >= ~5` |
| `untouched` | UNTOUCHED | `#bff8ff` | unbroken shield ring, pristine | shield | `achievements` includes a flawless id (`flawlessgauntlet` / `flawlessbossrush` / `flawlesskey`) |
| `daybreak` | DAYBREAK | `#ffd76b` | radiant sunburst (OVERDRIVE) | flare | `lifeDaybreaks >= ~50` |
| `lastbreath` | LAST BREATH | `#7df9ff` | hourglass + clutch spark, time-slow | clutch | `lifeLastBreath >= ~25` |
| `solstice` | SOLSTICE | `#fde047` | gold flagship sun (SOLSTICE PROTOCOL) | shine | `winsByMode.longestday > 0` |
| `eternal` | ETERNAL | `#fff3c0` | **(tier III)** ouroboros-lance / ∞, all six fallen | eternal | `ngPlusLevel >= 1 \|\| all six boss crests unlocked` |

**Counts:** 8 free (tier I) · 14 tier II · 2 tier III. 8 free + 16 earned = 24. ✓

> Thresholds (*~*) and the exact `flawless*` / `winsByMode` keys are confirmed during implementation
> against `achievements.ts`, `modes.ts` (`longestday`), and `intercepts.ts` (`vocabulary()`).

## 5. Architecture — `src/avatars.ts` (pure)

A single pure module (no DOM, no rng, no game state) — testable in isolation.

```ts
export type AvatarTier = 1 | 2 | 3;
export type AvatarMotion = 'strike' | 'resonance' | 'shatter' | 'implode' | /* … */ string;

export interface AvatarDef {
  id: string;
  name: string;
  tier: AvatarTier;
  accent: string;            // canonical hex
  group: 'free' | 'boss' | 'cipher' | 'pilot';
  unlockHint: string;        // shown on locked tiles ("Fell the Warden")
  isUnlocked: (s: SaveData) => boolean;
  /** pure SVG-string builder; uid namespaces all internal ids; opts toggle animation/size */
  svg: (opts: { uid: string; size: number; animated: boolean; variant?: 'full' | 'tile' }) => string;
}

export const AVATARS: AvatarDef[];                       // length 24
export function avatarById(id: string): AvatarDef | undefined;
export function isAvatarUnlocked(id: string, s: SaveData): boolean;
export function unlockedAvatars(s: SaveData): AvatarDef[];
export function renderAvatar(id: string, opts?: Partial<…>): string;  // generates uid, returns SVG
export const DEFAULT_AVATAR = 'lance';
```

**Shared SVG primitives** (internal helpers, all uid-aware): `frame(tier, accent, uid)` (bezel + rays
+ guilloché + studs + glints + rune ring), `hexClip(uid)`, `defsFor(accent, uid)` (gradients/filters).
Each sigil builder composes `frame()` + its bespoke scene. Keep each sigil scene in a small focused
function; if `avatars.ts` grows large, split scenes into `src/render/avatars/<id>.ts` builders that
`avatars.ts` imports (mirrors the existing `render/` and `bosses/` split convention).

## 6. Save model

Add one field to `SaveData`:

```ts
/** chosen profile avatar id; coerced to DEFAULT_AVATAR if unknown or not unlocked */
selectedAvatar: string;   // default 'lance'
```

- **No `unlockedAvatars` array** — unlocks are derived (§4), so veterans retroactively own everything.
- **Additive, no SAVE_VERSION bump** — follows the established additive-field pattern (e.g. `taught`);
  `defaultSave()` sets `'lance'`, the migrate generic loader tolerates it.
- **Sanitize on load:** if `selectedAvatar` is unknown or `!isAvatarUnlocked(selectedAvatar, save)`,
  coerce to `DEFAULT_AVATAR` (tamper/regression safety). Add to the existing save sanitizer path.
- Setting the avatar calls the same change/flush path other cosmetic selections use.

## 7. Picker UI (profile panel)

A new **AVATAR** section in the profile/account panel (follow the `build<Name>Panel(deps) → Panel`
extraction convention used by the other panels):
- **Grid** of all 24 medallions (tile variant, ~72–80px). Unlocked = selectable; locked = dimmed +
  lock glyph + `unlockHint` as caption/tooltip. Selected tile gets a highlight ring.
- **Focused preview** plays the **full** animation of the highlighted avatar with its name + group +
  tier + unlock state.
- **Interaction:** click/tap to select (unlocked only); keyboard + d-pad nav; 64px+ touch targets;
  `aria-label` per tile. Selecting writes `save.selectedAvatar` and persists.
- **Cockpit integration:** render `selectedAvatar` (tile variant, small) beside the player handle on
  the title cockpit — the one place YOUR name shows locally.
- UI wiring stays thin; all rendering/logic lives in `avatars.ts` (ui.ts has zero test coverage).

## 8. Testing — `src/avatars.test.ts`

- `AVATARS.length === 24`; ids unique; exactly 8 `group:'free'` all tier 1; tier counts (8/14/2).
- Every `svg()` returns a string starting `<svg`, contains `role="img"` + `<title>`, and is
  well-formed enough to parse.
- **uid namespacing:** two renders with different uids share **no** `id="…"`; refs resolve internally.
- `animated:false` output contains **no** `<animate`/`<animateTransform>`/`<animateMotion>` tags.
- `isAvatarUnlocked`: a fresh `defaultSave()` unlocks **exactly the 8 free**; crafted saves unlock
  specific avatars (e.g. `killsByKind.warden=1` → `warden`; `maxHeat=5` → `heat`; full
  `decryptedWords` → `remember`; `stillpointChoice='catch'` → `vigil` + `choice`).
- `selectedAvatar` sanitizer: unknown id and locked id both coerce to `'lance'`; an unlocked id passes.
- A happy-dom render smoke test for the picker grid + a save round-trip test for the new field.

## 9. Build sequence (for the plan)

1. `avatars.ts` skeleton: types, `frame()`/`defsFor()`/`hexClip()` uid-aware primitives, tier system.
2. The 8 free sigils (port the locked LANCE + COHERENCE prototypes; build the other 6).
3. The 6 boss crests (port CROWN + HOLLOW + WARDEN; build the other 3).
4. The 4 cipher + 6 pilot sigils.
5. `isUnlocked` predicates + `unlockedAvatars` + tests (grounded against real constants).
6. Save field + default + sanitizer + tests.
7. Profile-panel AVATAR picker + cockpit display.
8. `reduceMotion`/`reduceFlashing` static variants + tile variant.
9. Full test pass + `vite preview` (minified) verify + `reduceMotion` verify.

## 10. Out of scope / follow-ups
- Avatar display on online leaderboard / ghosts / duels (Worker + D1 `avatar` column, `/score` + `/save`).
- "AVATAR UNLOCKED" toast on the run-end milestone moment.
- Theme-tinted accent variants; seasonal/event avatars beyond the 24.
