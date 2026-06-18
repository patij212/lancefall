# UI mock-parity — diagnosis, harness, and the closing pass

A Playwright harness (`capture.mjs`) drives **both** the live game (Vite dev) and the
design mockups (`mockups-ui/public/*.html`) into every UI state, screenshots each at a
matched **1440×900** viewport, and builds `out/gallery.html` pairing **LIVE (shipped)**
beside **MOCK (target)** per state.

## How to run

```bash
npm run dev                       # starts Vite (note the port it picks, e.g. 5201)
LIVE_URL=http://localhost:5201 node tools/ui-capture/capture.mjs           # all 23 states
LIVE_URL=http://localhost:5201 node tools/ui-capture/capture.mjs cockpit   # one state (fast iterate)
# open tools/ui-capture/out/gallery.html
```

23 states; 20 with both sides. `inspect` / `credits` / `howto` are **live-only** (the live
game grew nav entries the mock never designed).

## Why the prior sessions couldn't close the gap (the diagnosis)

Two disciplined sessions hand-ported the cockpit but the gap stayed wide. The git arc was
clean (atomic commits, no reverts, tests/tsc green) — they just optimized the wrong signal:
tests-green / offline-previews, **never the running screen beside the mock**. Compounded by
polishing-instead-of-transcribing, a transliteration tax across two CSS dialects, and a
silent font substitution (Space Grotesk for the mock's Orbitron/Rajdhani). The fix was the
feedback loop above + transcribing values, not nudging by eye.

## What was closed (this pass — all committed on branch v6)

| Area | Change | Commit |
|------|--------|--------|
| **Fonts** | Vendored Orbitron + Rajdhani (@fontsource, CSP-safe). Wordmark + hero/mode titles → Orbitron; panel headers → Rajdhani. The single biggest identity win. | `01c4bb1` |
| **Cockpit** | Mock ambient edge-glow behind the frame; cooler/brighter label ramp. Now mirrors the mock's identity + tone. | `b27484d` |
| **In-game HUD** | Restructured to the mock's six-corner layout (score+combo TL, cipher TC, coherence TR, dash BL, DAYBREAK overdrive BC, armor BR). Rajdhani labels, Orbitron combo, amber overdrive, cyan stamina, indigo armor. `updateHud` untouched (leaf refs). | `f98569c` |
| **Panels (global)** | Cool label ramp promoted to global `--text-muted` (lifts every panel at once); settings sliders gained live amber value-chips. | `eb9532c` |
| **Pause** | Eyebrow + Orbitron title + live stat grid (SCORE/COMBO/WAVE/TIME, wired from game.ts) + controls hint. | `db3e3ba` |

Every change was tsc-clean and verified in the harness before commit.

## Session 3 — what owner feedback corrected, and what was fixed

Owner (3rd session): "still far from parity, you left out a lot more." Correct. Sessions 1–2
(and my first pass) over-claimed parity by judging downscaled full-screen thumbnails. Built
`compare.mjs` + `panels.mjs` (element-level crops + computed-style diffs) to see real detail.

Fixed + verified this session:
- **Ship selector** was a broken inline column overflowing the loadout → now a proper SELECT
  SHIP modal (grid of hull tiles). `5bcc89d`
- **BESTIARY button** added to the cosmetics modal (→ codex). `5bcc89d`
- **Ship display** ring/grid scaled to the mock's showpiece (146px ring + bright orbit/grid). `ff498e6`
- **Close-X** on every modal (injected via openModal). `31d9131`

## Remaining — NOT minor; these are the real "far from parity" gaps (deep per-panel work)

The panel CHROME matches (`.screen-modal .panel` already transcribes the mock card). The gap is
panel CONTENT/STRUCTURE — verified via `panels.mjs` crops:

- **UPGRADES tree — structural mismatch.** Live = a 4×3 GRID under "THE LANCE" with 4 categories
  (MOBILITY/OFFENSE/SUSTAIN/FORTUNE). Mock = 3 VERTICAL BRANCHES (MOMENTUM/THE EDGE/FORTUNE),
  each a column of big glowing ring-nodes linked top→bottom. Matching means reworking the
  meta-tree layout + likely the category model in `meta.ts` (touches save data + balance) — a
  design decision, not a transcribe. **Biggest single gap.**
- **STATS — different sections.** Mock has PERSONAL BEST BY MODE (horizontal bar chart) + NEMESIS
  (who-ends-your-runs bar chart). Live shows an achievements grid instead. Need to build the two
  bar-chart components and add them.
- **CODEX — different lead/layout.** Mock leads with the ENEMIES grid (+ per-enemy kill counts);
  live leads with THE FALL · MEMORIES decrypt fragments. Reorder + add kill counts to enemy cards.
- **Cockpit density/scale.** Live cockpit is taller than the mock (12 nav buttons incl.
  INSPECT/CREDITS/HOWTO the mock lacks), so the scale-to-fit fitter (min of w/h ratio, clamped
  1.85) shrinks it — the whole cockpit reads smaller/insettier than the mock. Fix = tighten
  vertical density or rethink the nav, carefully (risk of layout breakage).
- **Cosmetics content** populates from save (palette/trail swatches); empty on a fresh save —
  confirm whether owner wants locked options shown.
- Minor: settings slider fill cyan vs mock amber; pause per-button key badges; hero missing the
  "DAILY" tag + "YOUR TRAIL IS THE LANCE" verb line. GHOST header stat = intentionally deferred
  (duels parked) — do NOT add.

Method for the next pass: open the target on both sides with `panels.mjs`/`compare.mjs`, read the
crop + style diff, transcribe to exact values, re-shoot. Do NOT judge from full-screen thumbnails.
