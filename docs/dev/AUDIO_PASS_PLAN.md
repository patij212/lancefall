# AUDIO PASS — Professional sound + banger soundtrack

Owner request (2026-06-13): "fully professional, immersive audio with a banger soundtrack players vibe with for hours." Mode: **full overhaul, autonomous build**. This extends §8 of `NEXT_PASS_PLAN.md` (the locked soundtrack plan) with the **sound-design / mix layer** that §8 was light on.

## Invariants (must not regress)
- **Audio is 100% cosmetic.** NEVER read/write `world.rng`. Audio humanization uses `mulberry32` seeded from a constant/step index (the `cmusRng` pattern) → Daily stays bit-identical.
- **Offline-first.** Zero asset downloads. Reverb IR is rendered once via `OfflineAudioContext` at boot. No `fetch`/`decodeAudioData`.
- **`MUSIC_BPM=112` frozen** (beat grid + dash-grading + combo-transpose SoT). Keep `musicEpoch`/`musicTime` semantics (game.ts:728 reconcile depends on them).
- **One controller per knob.** `setCoherence` solely owns drone/choir/lead gains+filter. `setIntensity` owns arp density only.

## Diagnosis (why it sounds bad)
Clicky envelopes (`0.0001→peak→0.0006` then hard `stop()`), raw unfiltered saw/tri, **no master compression** (only a static tanh soft-clip), **dead mono** (no StereoPanner), **bone-dry music** (delay reverb is SFX-only), and it's **ambient texture not a song** (static one-chord drone, no hook/chords/structure).

## Phases (each committed + tested)

**A — Master/bus chain + space (the "produced" foundation).**
`tune.ts` AUDIO_MASTER + AUDIO_REVERB. `audio.ts`: master = `DynamicsCompressor` (glue) → makeup → tanh soft-clip (brickwall) → destination. Offline-rendered convolution reverb (synth IR: predelay + exp-decay noise); music + SFX reverb sends. Music sub-bus tree under `musicBus`: `drumsBus / bassBus / harmonyBus / leadBus / bossBus`. Re-point existing voices.

**B — Click-free envelopes + warmth + stereo/positional.**
Reusable click-free `env()` (true-0 start, short linear release before `stop()`). Rebuild every SFX: detuned osc pairs + lowpass shaping to kill harshness; `StereoPanner` per one-shot (optional `pan` arg, -1..1). Positional pan on kills/explosions from world `x` (`(x-640)/640`). Per-shot humanization (gain/pitch jitter) via `mulberry32`. `tune.ts` AUDIO_SFX.

**C — Pure transport + score modules (keystone) + tests.**
`musicTransport.ts` (PURE): `musicTime`+bpm → `{bar, beatInBar, sixteenth, step, section}` + macro-form A→A'→B→A. `musicScore.ts` (PURE data): THE LANCE THEME (pentatonic-index hook: rising arch → +leap turning point → stepwise descent gap-fill → unresolved 2nd-degree end), bass chord progression (A-F-C-G offsets, **bass-only** so pentatonic top never clashes), per-section rhythm masks, per-biome + per-boss motifs. `+ *.test.ts`.

**D — New music engine: LANCE THEME lead + chords + layers + pump + macro-form.**
`audio.ts scheduleMusic` driven by transport/score. New **LEAD stem** (detuned-twin-saw through `leadFilter`, plays THE LANCE THEME, gain fades in at `coherence>leadOnset≈0.35` — the hook is the reward of a clean run; transposes with `rootMul` so the earworm IS the scoreboard). Moving bass (chord progression). **Sidechain pump** (scheduled gain dips on bass/harmony keyed off kick times — the synthwave signature). **PERC/BREAK stem** (heat-gated hats/ghost-snare). `setCoherence` extended to own `leadGain/leadFilter`. Humanization via `cmusRng`. `tune.ts`: COHERENCE_AUDIO `leadOnset/leadGain/leadFilterBase`, AUDIO_PUMP, MACRO_FORM. `game.ts`: call `setCoherence` EVERY frame (glides smooth it); keep `setIntensity` throttled.

**E — Per-boss motifs + mix snapshots.**
`bossThemes.ts`: optional `motif?: number[]` + `motifGain?` (data-only) + test. `audio.ts`: schedule boss motif on the lead at bar boundaries; `setMixState(COMBAT/MENU/BOSS/OVERDRIVE/DEATH)` coordinated per-bus snapshots replacing binary `duckMusic`. `game.ts` call-sites updated.

**F — Audio lab dev page.** `audiolab.html` + `src/audioLab.ts`: buttons for every SFX, transport play/stop, layer toggles, coherence/heat/tier/boss sliders — so the owner can HEAR it. Dev-only (not in the prod `vite build` input).

**G — Verify.** `npm test` + `npm run build` green; `detect_changes`; commit per phase; update memory + DEVLOG.

---
## STATUS: SHIPPED (2026-06-13)
All 6 phases (A–F) built, tested, committed on branch `lastlance` (commits `0d4696b`..`1a5c618`). 358 tests green (+28), clean prod build with the lab excluded, engine Playwright-smoke-tested error-free. Determinism held by construction (no sim/rng files touched). Not yet deployed — run `npm run deploy` (or `npm run build && wrangler pages deploy`) to push live. Audition locally via `npm run dev` → `/audiolab.html`.
