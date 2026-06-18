# UI gap — live vs mock (visual-diff pass)

A Playwright harness (`capture.mjs`) drives **both** the live game (Vite dev) and the
design mockups (`mockups-ui/public/*.html`) into every UI state, screenshots each at a
matched **1440×900** viewport, and builds `out/gallery.html` pairing **LIVE (shipped)**
beside **MOCK (target)** per state.

## How to run

```bash
npm run dev                       # starts Vite (note the port it picks)
LIVE_URL=http://localhost:5201 node tools/ui-capture/capture.mjs
# open tools/ui-capture/out/gallery.html
```

23 states captured: 20 with both sides; `inspect` / `credits` / `howto` are **live-only**
(those nav entries don't exist in the mock — the live game grew more menus than were designed).

## The verdict: the gap is NOT uniform

The earlier text diagnosis said the prior sessions "polished blind." The side-by-side
proves it and *localizes* the gap. Two patterns dominate:

1. **A global tone deficit on every screen.** The live UI is systematically **dimmer,
   lower-contrast, and less saturated** than the mock. The mock reads warm and "lit"; the
   live reads muted. Suspects: the `--coh` saturation/glow drive sits lower at rest, glow
   opacities are weaker, the label ramp is darker, and the display typeface is Space Grotesk
   (vendored) vs the mock's Orbitron — together they sap the "alive" quality.
2. **Density collapses on the two most complex screens.** Simple screens are near parity;
   the dense ones (cockpit hero, in-game HUD) are the least finished — exactly the screens
   you can't converge by eye without a reference open beside you.

## Per-screen parity (eyeball estimate)

| State | Parity | The gap |
|-------|:------:|---------|
| **Cockpit (title)** | ~50% | Skeleton is right (rail · hero · DESCEND · loadout · nav). But the **hero center is sparse** — no mode tabs (STANDARD/ASCENT/DAILY) or stat strip; **DESCEND is a hollow dark bar** vs the mock's glowing filled hex; rail/loadout less rich; whole screen dim. |
| **In-game HUD** | ~40% | Biggest gap. The mock's **bottom dock (stamina / overdrive / armor pills)** and **wave/boss banner** are barely built in live (just a small beat meter); combo/wave treatment minimal. |
| **Settings** | ~70% | Structure matches (preset tabs + sub-tabs + sliders). Live is dimmer, **missing slider value-chips**, no close-X, tighter spacing. |
| **Pause** | ~75% | Clean & centered, but lacks the mock's **in-context HUD-behind**, stat row, and wider framing. |
| **Perk draft** | ~80% | Close — real glyph-art cards incl. the IMPALER fusion. (Harness shows it over empty bg because it's invoked outside a run.) |
| **Run-end / THE CHOICE** | ~85% | **Near parity** — both choice cards, full stat grid, dawn skyline. Live slightly flatter; weaker dawn wash. |
| Upgrades / Ranks / Stats / Codex / Heat / Cosmetics / Build | mixed | See gallery; mostly the same dim/low-contrast tone deficit on otherwise-correct structure. |

## What this says about *how to close it*

- **Fix the tone deficit globally first** — it's one lever (resting `--coh`/saturation, glow
  intensities, label ramp, and the Orbitron/Rajdhani font decision) that lifts *every* screen
  at once. Cheapest, highest-leverage win.
- **Then transcribe the two dense screens** (cockpit hero, HUD dock) value-for-value against
  the mock with this gallery open — don't nudge by eye.
- **Re-run this harness after each change.** That's the feedback loop the prior sessions
  never had: the number that matters is "does it match the panel on the right," and now you
  can see it.
