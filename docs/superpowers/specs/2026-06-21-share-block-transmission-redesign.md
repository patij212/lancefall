# SHARE THE DAWN → LAST TRANSMISSION — game-over share block redesign

**Date:** 2026-06-21
**Status:** Design approved (visual mockups + copy locked via the brainstorm companion). Awaiting spec review → implementation plan.
**Scope:** Pure presentation. `src/ui.ts` (the game-over share panel) + `src/style.css`, plus one additive field on `GameOverInfo`. No game logic, no save schema, no determinism touch.

## Problem

The game-over screen themes win vs defeat with real care — **win:** "THE LIGHT HOLDS" / "✦ THE SOVEREIGN HAS FALLEN ✦" / coherence 100% / "THE CITY REMEMBERS ITSELF IN FULL"; **defeat:** "THE LIGHT DIMS" / "✶ ECHO OF THE FALL ✶" / low coherence / "REMEMBERS ONLY FRAGMENTS". But the share panel (`.go-share-panel`) is identical in both states: it always reads "SHARE THE DAWN" with the note "the first-light frame, captured the instant the run resolved." That is victory framing bolted onto a defeat, and it reads as half-baked next to the rest of the screen. The four actions are also generic, and one of them — **DUEL A FRIEND** — is now dead, since duels have been removed from the product for now.

## Goals

1. **Theme-aware voice.** On defeat the block speaks the language of the fall, then turns it into a forward call: an **echo → rally** arc (name the loss honestly, then dare a friend to answer). On a win it speaks of first light held.
2. **Visual craft** that matches the rest of the screen — the "LAST TRANSMISSION" radio motif (the game's "ECHO OF THE FALL" already frames a run as a transmission) wearing a **solstice gradient** (the turn of the light).
3. **Drop the dead DUEL button**; reframe sharing as an *invitation to play* ("answer the signal"). Leave the duel system intact for easy re-enable.
4. Build on the already-shipped real-frame preview (the captured "first-light frame") rather than replacing it.

## Non-goals

- No changes to the SHARE modal itself (`panels/share.ts`) — the GIF encode/share/copy flow is unchanged. The redesigned primary CTA still opens it via `onSaveReplay`.
- No removal of the duel system (`panels/duel.ts`, `ghost.ts`, `onCreateChallenge`). Only the panel button is removed.
- No new save fields, no SAVE_VERSION bump.

## The design

### Layout (top → bottom), one component, theme-aware

A single "transmission console" whose gradient direction mirrors between the two outcomes:

| Element | Defeat (`.go-lost`) | Victory (`.go-won`, incl. `choicePending`) |
|---|---|---|
| **Label** | `◌ LAST TRANSMISSION` (violet pip) | `◉ SIGNAL RESTORED` (gold pip) |
| **Signal-feed frame** | the captured frame + scanline overlay + badge `● SIGNAL LOST · SEED ####` + cosmetic waveform (cool) | same frame, warm tint + badge `● FIRST LIGHT · SEED ####` (warm) |
| **Stat strip (3 cells)** | `HELD` (time survived) · `WAVE` · `SCORE` | `CLEARED` (clearTime) · `GRADE` · `SCORE` |
| **Primary CTA** (opens SHARE modal) | **SEND THE ECHO** | **SEND THE DAWN** |
| **Rally line** | *show them it can be held →* | *this is what holding looks like →* |
| **Secondary chips** | `⧉ COPY SCORE` · `⧬ COPY BUILD` | same |

### The gradient — mirrored arcs (the meaning)

- **Defeat:** cold violet at the **top** (the fall / signal lost) warming **down** to gold at the bottom, exactly where the SEND THE ECHO button + rally live. The eye climbs out of the dark toward the call to action.
- **Victory:** **flipped** — bright dawn glows at the **top** and pushes the dark down to the bottom. The light has risen above and won; the gold CTA still pops against the darker base.
- The gradient *direction alone* signals whether the light fell or held — a wordless read that fits the solstice (the turn of the light). Implemented purely off the existing `.go-won` / `.go-lost` classes on `goScreenInner`.

### The broadcast glyph (SVG, not emoji)

Replace the 📡 emoji with a **drawn SVG** matching the game's hand-drawn icon set (`viewBox`, `fill="none"`, `stroke="currentColor"`, ~1.3 stroke width — same idiom as `MODE_ICONS`/`NAV_ICONS`). A transmit/broadcast mark: a small filled emitter dot with two or three concentric arcs radiating up-right (a signal going out). `currentColor` so it inherits the CTA's themed color.

## Code mapping

### `src/ui.ts`

- **`GameOverInfo`** (interface ~line 138): add `seed: number` (for the badge). Everything else needed already exists: `score`, `wave`, `time`, `clearTime`, `won`, `daily`, `previewFrame` (added in the bug-#2 fix). The **grade** is already computed in `showGameOver` (`grade = !won ? '—' : flawless ? 'S' : newBest ? 'A' : 'B'`); reuse it for the win strip cell.
- **`buildGameOver` share section** (~lines 1823–1843): restructure `sharePanel`. Keep the `el(...)`-based construction. Replace the four-button block + the old note with: themed label, the signal-feed frame (the existing `go-gif`/`go-gif-img` becomes the frame, plus a scanline span, badge span, waveform span), the stat strip, the primary CTA (keeps `onSaveReplay`), the rally line, and the two copy chips (`onCopyScore`, `onCopyBuildDna`). **Remove** the `duel` button + its `onCreateChallenge` listener.
- **`showGameOver`** (~line 3990+): in the existing `info.won` branch set the themed strings (label, badge, CTA text, rally, stat-strip cells), reusing the already-computed `grade`/`clearTime`/`time`. Theme is carried by the existing `.go-won`/`.go-lost` toggle — no new class plumbing. `choicePending` counts as won for this block.
- **`game.ts`** `finishGameOver`: add `seed: this.seed` to the `GameOverInfo` it builds (one line; `this.seed` already exists and is what the share watermark uses).

### `src/style.css`

- New `.go-tx-*` (transmission) rules for the label, frame overlays (scanlines, badge, waveform), stat strip, CTA, rally, and chips, scoped under `.go-lost .go-share-panel` / `.go-won .go-share-panel` for the mirrored gradient + cool/warm theming.
- The waveform animation must be gated under `.reduce-motion` (instant/no motion), like the existing `.go-gif-shimmer`/`.go-gif-dot` rules.
- Reuse the existing `.go-gif`/`.go-gif-img` frame styles (from the bug-#2 fix) as the base; layer the scanline/badge/waveform over them.

## Edge cases & error handling

- **No frame captured** (`previewFrame` undefined — a sub-capture-interval run): the frame falls back to its gradient placeholder (already handled in the bug-#2 code); the badge/stat-strip/CTA still render. The block never shows a broken image.
- **`choicePending`** (Sovereign kill, THE CHOICE not yet made): treated as a win for the share block (label "SIGNAL RESTORED", dawn gradient). It coexists with the choice cards already in the lower section.
- **Reduce-motion:** waveform + any glow pulse are disabled; the gradient (static) remains.
- **Daily / dated seed:** the badge's seed text reuses the exact rule from `buildWatermark` (`replay.ts`) — `DAILY <seed>` when `info.daily`, otherwise `SEED <seed>` — so the badge and the GIF watermark always agree.

## Testing / verification

- `ui.ts` has no unit coverage (project-wide; pure logic is tested elsewhere). Verify by driving the real game-over screen via the DEV `window.__lf` hook + manual-frame technique (rAF is throttled in headless preview — drive `__lf.frame(t)` with advancing timestamps; resize the viewport first or the canvas collapses). Check **both** `finishGameOver(false)` and `finishGameOver(true)`:
  - label / badge / CTA text / rally / stat-strip cells switch correctly per outcome,
  - the gradient class theming applies (cold-top defeat, warm-top win),
  - SEND THE ECHO/DAWN opens the SHARE modal; COPY SCORE and COPY BUILD still fire their callbacks,
  - the DUEL button is gone,
  - no-frame fallback keeps the placeholder.
- Run the full Vitest suite + `tsc` + a minified `vite preview` boot (the project has shipped dev-green/prod-broken before).
- A11y: the CTA/chips remain real `<button>`s with discernible text; the SVG glyph is decorative (`aria-hidden`).

## Out of scope / follow-ups

- Bringing duels back (separate decision).
- Animating the waveform to the live beat clock (could reuse the beat grid later; static/idle is fine for v1).
