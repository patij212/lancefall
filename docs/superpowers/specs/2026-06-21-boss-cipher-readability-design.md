# Boss cipher — readability & polish pass

**Date:** 2026-06-21
**Status:** approved (mockup-validated), implementing
**Scope:** visual only. The cipher *mechanic*, the pure `cipher.ts` reducer, the seeded
generation, and all determinism stay byte-identical. Two surfaces change: the orbiting
cipher **cores** (canvas) and the **READ THE KEY** HUD legend (DOM).

## Problem

The boss cipher (Warden, Weaver, Beacon, Sovereign — all draw through the shared
`sovereign_core` cores + the `.hud-cipher` legend) is functional but hard to read and
unpolished:

- The 10 cipher marks are confusable Greek letters (`Σ Δ Λ Φ Ψ Ω Θ Ξ Π Γ` — Σ/Ξ, and
  Θ/Ω/Φ all read as "circle"), small on a spinning core.
- Cores are fuzzy gold glow-blobs; the mark sits on a bright fill and washes out under
  bloom + the COHERENCE wash.
- The HUD legend is a cramped two-row "message + key" in 12px mono; matching a key pair
  to the right orbiting core is a lot of visual hops.

## Design

### 1. Designed sigil set (replaces the Greek alphabet)

10 marks with deliberately distinct silhouettes: orb, spire, rift, cascade, beam, ward
(hex), burst, crescent, trident, coil. **One source of truth**: each is an SVG path `d`
(+ optional centre dot) normalised to a 100×100 box. Drawn via `Path2D` on the canvas
cores and inline `<svg>` in the DOM legend — a mark looks identical in both places.

The Warden's **Caesar** cipher keeps its shifted **letters** (the mark *is* a letter);
rendered in the same neon chrome as a sigil.

### 2. Cores — "a lock to crack" (canvas, `render.ts` `drawSovereignCore`)

- A **dark inner disc** behind the mark guarantees it reads through any bloom/wash.
- A slowly-rotating **notched key-ring** (the only moving part; the mark stays upright).
- The mark is the hero: large, upright, soft accent glow.
- **Per-boss tint** for the live (to-key) state — `--accent` from the boss:
  Warden `#ff3b6b`, Weaver `#a855f7`, Beacon `#38bdf8`, Sovereign `#fde047`.
- **State reads three ways** (brightness + shape + ✓ — never hue alone):
  - **to-key** → boss accent, gentle breathing glow (invites the dash)
  - **decoded** → green `#34d399`, **recedes** (dimmer, no glow) so the eye goes to what's left
  - **next** → white-hot, only under the opt-in `cipherAssist` (no give-away otherwise)

### 3. HUD legend — one console row of step-chips (DOM, `ui.ts` + `style.css`)

Replaces the two-row message+key with a single `.ck` console strip of `.chip`s in dash
order. Each chip: the plaintext **letter** (Orbitron) / a hairline divider / the **mark**
(sigil or Caesar letter). You read the word *and* each step's target mark in one place.

- Big and legible: ~58px chips, 20px letter, ~34px mark; marks brightened to read on the
  dark chip; scales off the existing `--hud-scale`.
- States: **done** dims + ✓, **next** lifts + white glow, **upcoming** accent, **hidden**
  (Caesar crib / Beacon partial) shows the letter with the mark withheld (lock).
- Header carries the accent dot + `READ THE KEY`; the Sovereign's `ROTOR +n` rides on the right.
- Rebuilt only when the cipher signature changes (cls|accent|progress|rotor|revealed),
  not every frame.

## Files

| File | Change |
|------|--------|
| `src/cipherSigils.ts` | **new, pure** — `SIGILS` path data, `SIGIL_COUNT`, `sigilFor`, `sigilSvgMarkup` (string) |
| `src/cipher.ts` | `CipherState.accent: string` (view-only, alongside `cls`); `makeCipher` defaults it to Sovereign gold |
| `src/bosses/sovereign.ts` | both creation sites set `world.cipher.accent = cipherAccentFor(boss.kind)` |
| `src/cipherDecode.ts` | swap the symbol contract: `Mark = {kind:'sigil',index} \| {kind:'letter',char}`; `markForSlot` (was `coreSymbolForSlot`), `rotateMark` (was `rotateSymbol`), `decodeView.markForSlot`/`key[].mark`; keep caesar/partial/rotor logic |
| `src/render.ts` | rewrite `drawSovereignCore`: lock chrome + sigil/letter + per-boss accent + a11y gating |
| `src/ui.ts` | rebuild the cipher HUD block into the `.ck` step-chip console |
| `src/style.css` | new `.ck`/`.chip` rules (scaled by `--hud-scale`); retire the in-game `.cipher-glyph/-msg/-key/-pair` rules not used by the CODEX box |
| `src/panels/codex.ts` | refresh the "READ THE KEY" teaching legend to the new sigils/chips |
| `src/cipherDecode.test.ts` | rewrite to the `Mark` contract (solvability + class behaviour preserved) |
| `src/cipherSigils.test.ts` | **new** — 10 distinct marks, stable lookup, well-formed SVG |

## Determinism & a11y

- `accent` is deterministic (boss kind → fixed colour), set outside `world.rng`, never read
  by the reducer. `.order`/`.glyphs`/seeded generation untouched → Daily stays bit-identical.
- The ring rotation + breathing glow gate off `reduceMotion` (hold still); the next-core /
  decrypt flash softens under `reduceFlashing`; state always reads via brightness + shape +
  the ✓, so the per-boss tint is never load-bearing (colourblind-safe).

## Out of scope

The Bombe / Daily-cipher console, the cockpit CIPHER STORM backdrop, and the boss biomech
bodies are separate systems — untouched.

## Sigil paths (normalised 0..100, centre 50,50)

```
0 orb       M74 50 A24 24 0 1 0 26 50 A24 24 0 1 0 74 50   + dot(50,50,5)
1 spire     M50 20 L79 73 L21 73 Z M35 56 L65 56
2 rift      M50 18 L80 50 L50 82 L20 50 Z M50 31 L50 69
3 cascade   M26 45 L50 28 L74 45 M26 67 L50 50 L74 67
4 beam      M50 20 L50 80 M34 20 L66 20 M34 80 L66 80
5 ward      M50 18 L78 34 L78 66 L50 82 L22 66 L22 34 Z
6 burst     M50 20 L50 80 M27 33 L73 67 M73 33 L27 67
7 crescent  M68 27 A30 30 0 1 0 68 73   + dot(72,50,4.5)
8 trident   M50 80 L50 20 M50 37 L34 22 M50 37 L66 22 M41 80 L59 80
9 coil      M40 60 L40 40 L60 40 L60 60 L34 60 L34 32 L72 32
```
