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

## Remaining (minor cosmetics — deferred, not blocking)

- **Panel close-X**: panels close via the working DONE button; the mock's top-right X would
  need adding to ~12 separate panel builders (low ROI vs risk).
- **Settings slider fill colour**: live cyan vs mock amber (functional; accent only).
- **Pause per-button key badges** (ESC/R/O/Q) and HUD-behind: the restart button's dynamic
  confirm-text made inline key badges fiddly; skipped.
- **Upgrades tree node prominence**: live nodes are a touch smaller/flatter than the mock's.
- **HUD top-center wave/boss banner**: the live HUD doesn't wire a wave-number/boss banner
  (it surfaces wave via narrator/announcements); only the cipher sits top-center.

Re-run the harness after any further change — the number that matters is "does it match the
panel on the right."
