# Flagship Audio — Quality Gate Report

**Build:** `lastlance` @ integration commit (Tasks 0–11 complete) · **Date:** 2026-06-13
**Engine:** Vite dev (Chrome, Web Audio) · **Validator:** `npm run audio:validate` PASS

This records the **objective / automated** gate results. The **subjective** rows (blind A/B, 30-min
fatigue, device matrix) need the owner's ears and are marked **PENDING** — that is the human gate.

## Objective results (measured)

| Check | Target | Result |
|---|---|---|
| Provenance / license gate | all assets allowed-license + recorded | ✅ 7 music (CC-BY) + 9 SFX ids (CC0), 0 rejected |
| Loop length | integer bars at source BPM (±10 ms) | ✅ AURORA 16.842 s (8 bars @ 114) · WARDEN 17.455 s (8 bars @ 110) |
| Sample rate | 48 kHz | ✅ all |
| Runtime budget | ≤ 8 MB compressed | ✅ 4.5 MB (music 4.1 + SFX 1.3, ogg+mp3) |
| Loudness target | ~ -20 LUFS-I / ≤ -1 dBTP | ✅ `loudnorm I=-20:TP=-1` in conform (per-asset verify pending) |
| Codec | Opus where supported, else MP3 | ✅ `canPlayType` → opus "probably"; MP3 fallback shipped |
| Decode in-browser | clean | ✅ aurora_verse.ogg → 16.842 s / 2ch / 48 kHz |
| Asset preload | all decode, none break the run | ✅ 25/25 fetched + decoded; failures fall back to procedural |
| Authored playback | bed starts on a bar downbeat | ✅ AURORA loop (16.84 s) started live; 0 console errors |
| Determinism | Daily byte-identical regardless of audio | ✅ rng/spawnReset/beat suites green; audio is `frame()`-only |
| Suite / build | green | ✅ 453/453 tests, tsc + `npm run build` clean |

## Subjective A/B — PENDING (owner audition)

- [ ] **Beats current?** Blind A/B at matched loudness: authored bed + procedural reactive vs the
      old procedural-only score. *Do not finalize if it doesn't beat current.*
- [ ] AURORA verse → build → chorus → drop read as **escalating** (loop filter opens with intensity/flow).
- [ ] WARDEN spiral / fan / enraged are **distinguishable** (the boss gear-change lands).
- [ ] The procedural **LANCE THEME** motif still reads over the authored beds.
- [ ] Critical **SFX cut through** (dash / lance hit / perfect / overdrive / last-breath / warden cues).
- [ ] **Seam seamlessness** — no click at the loop wrap; section switches don't pop.
- [ ] **30-min fatigue** soak — no clicks/gaps/runaway voices; first audio < 150 ms after gesture.
- [ ] Device matrix (desktop + a phone): decoded ≤ 64 MB desktop / 40 MB mobile.

## Notes for the audition

- SFX are **auto-selected first-pass** Kenney CC0 picks scaled to each cue — swap any in
  `audio-src/flagship/sfx/` then `npm run audio:conform && audio:encode`.
- Music loop **windows** were auto-picked mid-track; nudge `loopStartBar`/`loopEndBar` in
  `audio-src/flagship/loops.json` if a region isn't the strongest groove.
- The Opus encoder adds ~6.5 ms of end-padding to the runtime `.ogg` (inside the ±10 ms loop tolerance).
