# Flagship Audio Vertical Slice — v2 (Free-Licensed Assets + Adaptive Tempo)

> **Supersedes** `2026-06-13-flagship-audio-vertical-slice.md`. The v1 plan assumed
> bespoke, composer-produced 6-stem suites locked to 112 BPM / A minor. This v2 keeps
> v1's engineering discipline and module decomposition but replaces the unbuildable
> "produce pro stems" dependency with **free, commercially-licensed source material**,
> and generalises the contract so authored music can be a single loop, a few layers,
> or full stems. It also implements an **adaptive per-track beat grid**.
>
> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development`
> or `superpowers:executing-plans`. Steps use `- [ ]` checkboxes. Every code task is TDD:
> write the failing test, run it red, implement, run it green, commit.

**Goal:** Prove the hybrid direction in real gameplay with **one authored AURORA arena
source and one authored WARDEN boss source assembled from free CC0/CC-BY/Pixabay material**,
**free pro sampled combat SFX**, an **adaptive beat grid** that follows the active track's
tempo, and a procedural engine that (a) supplies the vertical reactivity authored loops
lack and (b) is the resilient fallback when assets are missing.

**Tech Stack:** Vite, vanilla TypeScript, Web Audio API, Vitest, FFmpeg/FFprobe (+ a
time-stretch tool: `rubberband-cli` preferred, `ffmpeg atempo` fallback), the existing
Audio Lab / `musicTransport` / `beat` modules.

---

## Locked Decisions (owner-approved)

1. **License bar — CC0 + CC-BY + Pixabay + royalty-free game licenses (e.g. Sonniss).**
   Every shipped asset must carry a provenance record. The validator **hard-rejects**
   NC, SA, GPL, AI-generated, and unlicensed material. CC-BY requires a visible credits screen.
2. **Adaptive per-track beat grid.** The dash-on-beat grid and grading follow the
   **deterministically-intended** active track's BPM (not asset-load timing), changing only
   on bar boundaries. Daily determinism is a hard gate.
3. **Stems are optional.** A music source is `loop` (1 file), `layers` (2–3 sub-mixes),
   or `stems` (6). `loop` is the default for free full-tracks; the **procedural engine
   provides vertical intensity layering on top** of non-stemmed sources.
4. The flagship arena source is **AURORA**; the flagship boss is **THE WARDEN**.
5. Phase 0 does **not** add all bosses, biome palettes, service-worker caching, or OST packaging.
6. **Do not modify `Game.bossDeath()`** (GitNexus CRITICAL). Warden-defeat audio reuses the
   existing `bossMusic(false)` → `bossStinger()` sequence.

---

## Architecture

```
Game state ─► Music Director ─► (a) horizontal source selection (deterministic)
                              ─► (b) authored layer gains   ─► Layer Player ─► musicBus
                              ─► (c) procedural intensity    ─► proceduralMusicBus ─► musicBus
                              ─► (d) intended BPM/key        ─► Tempo Conductor ─► BeatClock (dash grade) + Transport
Audio Manifest ─► Asset Manager (codec probe, fetch/decode, cache, provenance) ─► Layer Player / Sample SFX
SFX Director (free sampled) ─► sfxBus       Procedural engine = reactive punctuation + resilient fallback
```

**Division of labour that makes free assets work:**
- **Authored source** = identity/groove/atmosphere **bed** (a free loop, or assembled layers).
- **Procedural engine** = the **vertical reactive layer** (drums/lead rising with intensity &
  COHERENCE), constrained to the authored track's key — this *replaces* the per-stem fades a
  full multitrack would have given, so a single free loop still feels adaptive.
- **THE LANCE THEME stays procedural** (free tracks can't contain our motif). Authored beds
  carry hooks/atmosphere; the procedural layer carries the recurring mnemonic identity.
- **SFX** = free pro samples layered over existing synthesized transients (missing samples
  never suppress the synth).

**Determinism rule (non-negotiable):** every value that can influence gameplay reward — i.e.
the dash-on-beat grade — derives only from deterministic game state. The intended track (hence
BPM) is a pure function of music-state; audio playback may lag behind while assets load, but the
**grid never waits on a decoded buffer**. SFX variation uses a local `mulberry32`, never world RNG.

---

## File Map

**Create**
- `src/audioManifest.ts` (+ `.test.ts`) — `MusicSourceManifest` (layering + per-source bpm/key + provenance), SFX manifest, validator.
- `src/audioProvenance.ts` (+ `.test.ts`) — license policy: allow CC0/CC-BY/Pixabay/royalty-free; reject NC/SA/GPL/AI/unlicensed; CC-BY ⇒ attribution required.
- `src/audioAssetManager.ts` (+ `.test.ts`) — codec probe, fetch/decode, dedup, memory accounting, status.
- `src/musicDirector.ts` (+ `.test.ts`) — pure source selection + authored-layer gains + **procedural-intensity gain** + intended `{bpm,key}`.
- `src/tempoConductor.ts` (+ `.test.ts`) — pure: maps deterministic music-state → scheduled bar-aligned BPM changes for the BeatClock + transport.
- `src/layerPlayer.ts` (+ `.test.ts`) — aligned N-track playback (N=1/2/3/6) + equal-power crossfades.
- `src/sampleSfx.ts` (+ `.test.ts`) — priority/voice-limited sampled SFX, injected RNG.
- `src/hybridMusic.ts` (+ `.test.ts`) — orchestration facade; routes vertical layering to authored stems where present, procedural where not.
- `tools/audio/conform-flagship.mjs` — time-stretch each music master to its target grid, bar-trim to a clean loop, loudness-normalize.
- `tools/audio/encode-flagship.mjs` — WAV → Opus(.ogg) + MP3.
- `tools/audio/validate-flagship.mjs` — names, alignment, codecs, **license/provenance gate**, budget.
- `docs/audio/flagship-sourcing-brief.md` — curation brief + the exact source shortlist.
- `docs/audio/CREDITS.md` + `public/audio/flagship/provenance.json` — machine-readable provenance ledger.
- `docs/audio/flagship-listening-report.md` — gate results.
- `public/audio/flagship/**` — encoded runtime assets.

**Modify**
- `src/beat.ts` — generalise `BeatClock` to accept a **bar-aligned BPM change** (`retempo(bpm, atMusicTime)`), without breaking the existing fixed-tempo path.
- `src/musicTransport.ts` — already takes `bpm`; thread the conductor's current BPM through `transportAt` callers.
- `src/game.ts` — drive the BeatClock tempo + read-only Warden state from `frame()` (no sim mutation, no RNG, **no `bossDeath()` change**).
- `src/audio.ts` — own `HybridMusic`; add `proceduralMusicBus`; layer sampled SFX through existing public methods.
- `src/audioLab.ts` + `audiolab.html` — hybrid status, authored-layer controls, Warden + tempo audition, provenance readout.
- `package.json` — `audio:conform`, `audio:encode`, `audio:validate` scripts.
- `README.md` — replace the "fully synthesized" claim; document the hybrid + sourcing workflow.

---

### Task 0: Licensing Policy + Provenance Gate (front-load the legal risk)

**Files:** Create `src/audioProvenance.ts`, `src/audioProvenance.test.ts`, `docs/audio/flagship-sourcing-brief.md`, `public/audio/flagship/provenance.json` (seed/empty).

- [ ] **Failing tests** — assert:
  - `isLicenseAllowed('CC0' | 'CC-BY' | 'pixabay' | 'royalty-free')` ⇒ true.
  - `isLicenseAllowed('CC-BY-NC' | 'CC-BY-SA' | 'GPL' | 'ai-generated' | 'unknown')` ⇒ false.
  - `requiresAttribution('CC-BY')` ⇒ true; `requiresAttribution('CC0' | 'pixabay')` ⇒ false.
  - `validateProvenance(entries)` returns one error per asset that is missing `{source,url,license,author}`, has a rejected license, or is CC-BY without `attribution`.
- [ ] **Implement** the pure policy module + types:
  ```ts
  export type AudioLicense = 'CC0' | 'CC-BY' | 'pixabay' | 'royalty-free'
    | 'CC-BY-NC' | 'CC-BY-SA' | 'GPL' | 'ai-generated' | 'unknown';
  export interface ProvenanceEntry { asset: string; source: string; url: string;
    license: AudioLicense; author: string; attribution?: string; }
  export const ALLOWED: ReadonlySet<AudioLicense> = new Set(['CC0','CC-BY','pixabay','royalty-free']);
  export const isLicenseAllowed = (l: AudioLicense) => ALLOWED.has(l);
  export const requiresAttribution = (l: AudioLicense) => l === 'CC-BY';
  export function validateProvenance(entries: ProvenanceEntry[]): string[] { /* … */ }
  ```
- [ ] **Sourcing brief** — record the curated shortlist and the rule that one genre/era keeps
  the bed coherent. Candidate pools: Pixabay Music (no-attribution), Kevin MacLeod / incompetech
  (CC-BY synth), Eric Matyas / soundimage.org (CC-BY), OpenGameArt + FMA (filter CC0/CC-BY);
  SFX: **Sonniss GDC bundle** + freesound CC0.
- [ ] Commit: `feat(lancefall): audio licensing policy + provenance gate`.

---

### Task 1: Manifest v2 — Sources, Layering, Provenance

**Files:** Create `src/audioManifest.ts`, `src/audioManifest.test.ts`.

- [ ] **Failing tests** — assert:
  - AURORA exposes its arrangement sources (`aurora_verse`, `aurora_build`, `aurora_chorus`, `aurora_drop`) and WARDEN exposes (`warden_spiral`, `warden_fan`, `warden_enraged`).
  - Every source has a `layering` of `'loop' | 'layers' | 'stems'` and `tracks` whose key-set matches that layering (`loop`⇒`['main']`; `layers`⇒subset of `['bed','energy','lead']`; `stems`⇒the six stems).
  - Every source carries a numeric `bpm`, a `key`, and a `license` in the allowed set.
  - Every track and SFX variant provides `opus` (`.ogg`) and `mp3` (`.mp3`) URLs.
  - `validateAudioManifest(m)` ⇒ `[]`; it also runs `validateProvenance` over the manifest's provenance.
- [ ] **Implement** the schema (key changes vs v1 in **bold**):
  ```ts
  export type MusicLayering = 'loop' | 'layers' | 'stems';
  export const ALL_TRACK_KEYS = ['main','bed','energy','lead',
    'drums_core','drive','bass','harmony','hook','atmosphere'] as const;
  export interface MusicSourceManifest {
    id: string; suite: 'aurora' | 'warden'; role: string;
    bpm: number; key: string;                 // ← per-source, not a global 112/Amin
    layering: MusicLayering;
    bars?: number; loopSeconds?: number;
    tracks: Partial<Record<(typeof ALL_TRACK_KEYS)[number], CodecAssetSet>>;
    conformed: boolean;                        // tempo-locked at build time?
    license: AudioLicense; attribution?: string;
    integratedLufs: number; truePeakDbtp: number;
  }
  ```
  Keep `SfxManifest` (id, gain, priority 1|2|3, maxVoices, variants) from v1. The flagship
  data may start as `loop` sources (one `main` track each) — the engine treats them identically.
- [ ] Run green; commit: `feat(lancefall): flagship audio manifest v2 (sources + provenance)`.

---

### Task 2: Conform + Encode + Validate Pipeline

**Files:** Create the three `tools/audio/*.mjs`; modify `package.json`.

- [ ] `conform-flagship.mjs` — for each music master: detect/accept its source BPM, **time-stretch
  to the manifest's target BPM** (`rubberband -t <ratio>`; fallback `ffmpeg atempo`), trim to an
  integer-bar loop, and loudness-normalize (`ffmpeg loudnorm` toward the manifest LUFS). Writes
  conformed WAVs and sets `conformed: true`. SFX are normalized but not stretched.
- [ ] `encode-flagship.mjs` — `libopus -b:a 112k` (.ogg) and `libmp3lame -b:a 160k` (.mp3), 48 kHz,
  mirrored under `public/audio/flagship`; exit non-zero on first failure.
- [ ] `validate-flagship.mjs` — must FAIL on: missing master/runtime asset; non-48 kHz; per-source
  track durations differing > 1 ms; loop length not an integer number of bars at the source BPM
  (±10 ms); **any asset missing a `provenance.json` entry or carrying a rejected/NC/SA license**;
  total runtime bytes > 8 MB. Prints a per-source duration/BPM/license table + byte total.
- [ ] `package.json`: `"audio:conform"`, `"audio:encode"`, `"audio:validate"`.
- [ ] `npm run audio:validate` before assets exist ⇒ FAIL with a specific missing path. Commit:
  `build(lancefall): flagship audio conform/encode/validate pipeline`.

---

### Task 3: Acquire, Conform & Encode Free Flagship Assets (replaces v1 "produce stems")

**Files:** `audio-src/flagship/**` (gitignored masters), `public/audio/flagship/**` (committed runtime), `public/audio/flagship/provenance.json`, `docs/audio/CREDITS.md`.

- [ ] **Curate** from the Task 0 shortlist: one cohesive AURORA bed family (verse/build/chorus/drop
  can be sections of one track or 2–4 related tracks) and one WARDEN bed family (spiral/fan/enraged).
  Prefer Pixabay/CC0 to minimise attribution; record **every** pick in `provenance.json`.
- [ ] **Conform + encode + validate** (`npm run audio:conform && audio:encode && audio:validate`).
  Expect: all sources tempo-locked to their manifest BPM, integer-bar loops, provenance complete,
  ≤ 8 MB total.
- [ ] **Production listening gate (manual):** at matched loudness, confirm the **authored bed +
  procedural reactive layer** beats the current procedural-only score; AURORA build/chorus/drop read
  as escalating; WARDEN spiral/fan/enraged are distinguishable; the procedural LANCE THEME still
  reads over the beds; critical SFX cut through. **Do not proceed if it doesn't beat current.**
- [ ] Write `CREDITS.md`; commit runtime assets + provenance: `assets(lancefall): free-licensed flagship audio + provenance`.

---

### Task 4: Codec-Aware Asset Manager

**Files:** `src/audioAssetManager.ts` (+ test). *(Largely v1; generalised to variable track sets.)*

- [ ] **Failing tests:** Opus chosen when supported, MP3 otherwise; fetch/decode failure recorded
  and returns `null`; repeat requests reuse the decoded buffer; decoded bytes = `length*channels*4`;
  a source's tracks load independently and a partial set is reported. Inject a fake fetcher/decoder.
- [ ] **Implement** `AudioAssetManager` (constructor takes ctx, manifest, fetcher, codec?, decoder?):
  `preloadCore()` (never throws; records URL failures), `getTrack(sourceId, key)`, `getSfx(id)`,
  `status() → {codec, loaded, failed[], decodedBytes}`, static `detectCodec()`. Store one
  `Promise<AudioBuffer|null>` per URL; copy the `ArrayBuffer` before `decodeAudioData`.
- [ ] Green; commit: `feat(lancefall): codec-aware audio asset manager`.

---

### Task 5: Music Director (dual-routing) + Tempo Conductor

**Files:** `src/musicDirector.ts`, `src/tempoConductor.ts` (+ tests).

- [ ] **Director failing tests:** arena sections map to the right AURORA source via `sectionAt`;
  Warden phase 0/1 → `warden_spiral`/`warden_fan`; ≤ 34% HP → `warden_enraged`; for a `loop` source
  the **procedural-intensity gain** rises with `intensity` while authored `main` stays at 1; for a
  hypothetical `stems` source the per-stem gains follow intensity/COHERENCE (forward-compat).
- [ ] **Implement** `decideMusic(state, absoluteBar) → { sourceId, layerGains, proceduralGain, bpm, key }`.
  Rule: `proceduralGain = layering==='loop' ? f(intensity,coherence) : reduced`; authored `layerGains`
  cover whatever keys the source has; `bpm`/`key` come from the selected source.
- [ ] **Conductor failing tests (determinism-critical):** `scheduledTempoAt(musicState)` is a **pure
  function of music-state only**; given two identical music-state sequences with *different* simulated
  asset-load timings, the emitted BPM schedule is byte-identical; tempo changes are quantised to bar
  boundaries; with no authored source, BPM falls back to `MUSIC_BPM`.
- [ ] **Implement** `tempoConductor`: tracks the intended source's BPM, emits `{bpm, atMusicTime}`
  only at bar downbeats, ignores whether the asset is decoded.
- [ ] Green; commit: `feat(lancefall): music director (dual-routing) + tempo conductor`.

---

### Task 6: Adaptive Beat Grid (the gameplay-touching change — careful)

**Files:** modify `src/beat.ts` (+ extend `beat.test.ts`).

- [ ] **Failing tests:**
  - `BeatClock.retempo(newBpm, atMusicTime)` re-grids on a bar boundary and the **post-change beat
    phase is continuous** (no jump within the bar) and matches a fresh `makeGrid(newBpm)` clock.
  - **Determinism:** feeding the same `(release time, music-state)` sequence twice — once with tempo
    changes "applied late" simulating asset lag, once "on time" — yields **identical `gradeRelease`
    outcomes**, because grading reads the conductor's intended grid, not playback.
  - The existing fixed-112 path is unchanged when `retempo` is never called (regression guard).
- [ ] **Implement** `retempo` on `BeatClock` (swap the grid at the scheduled bar boundary, preserve
  musical phase). Do **not** alter `gradeRelease`'s math — it already reads the active grid.
- [ ] Green; commit: `feat(lancefall): adaptive (per-track) beat grid`.

---

### Task 7: Aligned Layer Player (generalises v1 StemPlayer)

**Files:** `src/layerPlayer.ts` (+ test).

- [ ] **Failing pure tests:** `sourceDurationSeconds(bpm,beatsPerBar,bars)`; `sourceOffsetSeconds`
  wraps at `bars`; `nextBarTime` returns now on a downbeat else the next bar. (Same math as v1.)
- [ ] **Implement** `LayerPlayer`: one master gain per active source; one looping
  `AudioBufferSourceNode` + gain per **present track key** (1/2/3/6); refuse to start unless **all of
  the requested source's tracks** are available; start every source at the same `at` +
  `sourceOffsetSeconds`; 250 ms equal-power crossfade between source masters; stop old sources 50 ms
  after fade; mute applies post-gain; disconnect finished nodes.
- [ ] Green; commit: `feat(lancefall): aligned layer player`.

---

### Task 8: Priority-Limited Sampled SFX (free libraries)

**Files:** `src/sampleSfx.ts` (+ test). *(Unchanged from v1 design — it was already right.)*

- [ ] **Failing tests:** priority-3 displaces priority-1 at the global cap; priority-1 dropped when
  only priority-3 active; per-ID caps enforced; variant selection uses the **injected** RNG and never
  touches world RNG.
- [ ] **Implement** `SampleSfxDirector` + pure `chooseVoiceToCull`. Return `false` (no side effects)
  when a buffer is missing; apply manifest gain × `gainMul`; `StereoPannerNode` when `pan` given;
  remove voices on `onended`.
- [ ] Green; commit: `feat(lancefall): priority-limited sampled sfx`.

---

### Task 9: Hybrid Orchestrator

**Files:** `src/hybridMusic.ts` (+ test).

- [ ] **Failing tests (fakes for asset/layer/sfx/conductor):** procedural gain stays 1 while loading/
  failed; an authored source starts only on a bar downbeat and only when **all its tracks** exist;
  procedural music gain fades toward 0 **only for `stems` sources**, and is **driven by `proceduralGain`
  (not zeroed) for `loop`/`layers` sources**; arena follows the song spine; Warden state selects the
  right source; `setBossState` emits arrival/phase/fan samples only at state edges; `stop()` restores
  procedural gain and resets tempo to `MUSIC_BPM`.
- [ ] **Implement** `HybridMusic` (constructs AssetManager/LayerPlayer/SampleSfx/Director/Conductor
  unless injected; local `mulberry32`). On each bar downbeat: `decideMusic` → maybe switch source →
  push `proceduralGain` to `proceduralMusicBus` → push `{bpm,atBar}` to the conductor/BeatClock. Keep
  the current source when the next one's tracks are missing.
- [ ] Green; commit: `feat(lancefall): orchestrate hybrid flagship audio`.

---

### Task 10: Integrate into `AudioEngine`

**Files:** modify `src/audio.ts`.

- [ ] **GitNexus impact** on `AudioEngine`, `buildGraph`, `playStep`, `setIntensity`, `setCoherence`,
  `bossMusic`, `bossStinger`, `stopDrone`, and the SFX methods (`whoosh`, `perfectDashSnare`, `thunk`,
  `overdriveBurst`, `lastBreath`). Warn on HIGH/CRITICAL before proceeding.
- [ ] Add `proceduralMusicBus` between the procedural sub-buses and `musicBus`; construct
  `HybridMusic | null` in `buildGraph()`; `ensure()` kicks `void hybrid.preloadCore()`. `playStep`
  calls `hybrid?.tick(step,t)`. Forward `setIntensity`/`setCoherence`/`stopDrone`; add
  `setBossState(kind,phase,subPhase,hpFrac)`. Layer `playSfx(...)` at the head of the five SFX methods
  (synth still runs after). Track last boss kind; emit `warden_defeat` in `bossStinger()` only after a
  Warden shutdown; clear it in `death()`.
- [ ] `npm test && npm run build` green; commit: `feat(lancefall): integrate hybrid audio engine`.

---

### Task 11: Drive Adaptive Tempo + Warden State from the Game Loop

**Files:** modify `src/game.ts`.

- [ ] **GitNexus impact** on `Game.frame`. LOW expected. **Do not touch `bossDeath()`.**
- [ ] After the existing intensity block in `frame()`: send read-only Warden state to audio, and
  apply the conductor's scheduled tempo to `this.beat` via `retempo(bpm, atMusicTime)` **only on bar
  boundaries**. This path reads world/music state only — no sim mutation, no RNG, no fixed-step entry.
- [ ] **Determinism tests:** `npm test -- src/rng.test.ts src/beat.test.ts src/bossThemes.test.ts`
  plus a new test that a fixed Daily seed produces an identical dash-grade sequence with audio
  "loaded" vs "never loaded". `npm test && npm run build` green.
- [ ] Commit: `feat(lancefall): adaptive tempo + Warden audio state from game loop`.

---

### Task 12: Audio Lab — Hybrid + Provenance + Tempo Audition

**Files:** modify `src/audioLab.ts`, `audiolab.html`. *(Extend "THE CONSOLE"; do not rewrite it.)*

- [ ] Inspect the current console first; GitNexus impact on the touched lab functions.
- [ ] Add: runtime codec, loaded/failed counts, decoded MB, active/pending source, authored-active
  indicator, **current BPM + source license/credit readout**, per-track mute, and Warden audition
  buttons `SPIRAL`/`FAN`/`ENRAGED`/`EXIT` calling `setBossState(...)`. Poll at the existing 120 ms cadence.
- [ ] Browser-verify via Playwright at `/audiolab.html`: start gate → procedural immediately →
  authored enters on a downbeat → clean source/tempo changes → mutes audible/reversible →
  missing-asset sim keeps procedural running → **no console errors**.
- [ ] Commit: `feat(lancefall): hybrid + provenance audio lab controls`.

---

### Task 13: Document, Measure, Pass the Gate

**Files:** modify `README.md`; create `docs/audio/flagship-listening-report.md`.

- [ ] README: hybrid system, free-asset sourcing + `provenance.json`, `audio:conform/encode/validate`,
  in-game credits screen for CC-BY.
- [ ] Listening report: date/build, device matrix, current-vs-flagship A/B, AURORA contrast, WARDEN
  recognition, LANCE-THEME recognition, 30-min fatigue, loudness/true-peak, asset-failure behaviour,
  pass/fail.
- [ ] `npm run audio:validate && npm test && npm run build` green.
- [ ] **30-min soak + GitNexus `detect_changes(scope:"compare", base_ref:"main")`** — review every
  affected process; resolve unexpected gameplay-flow changes. Confirm: no clicks/gaps/runaway voices;
  first audio < 150 ms after gesture; Warden switch within one bar; decoded ≤ 64 MB desktop / 40 MB
  mobile; ~ -20 LUFS-I ±2 / ≤ -1 dBTP; death-during-Warden ⇒ no false defeat cue; **Daily deterministic**.
- [ ] Commit: `docs(lancefall): record flagship audio quality gate`.

---

## Completion Criteria (Phase 0 done when)

1. Authored AURORA + WARDEN sources play sample-aligned in real gameplay, switching on bar boundaries
   without clicks/gaps, with the **procedural reactive layer** supplying vertical intensity.
2. The **adaptive beat grid** follows each source's BPM and **Daily stays bit-deterministic** (proven).
3. WARDEN spiral/fan/enraged are distinguishable; AURORA build/chorus/drop escalate.
4. Free **sampled combat SFX** layer over the existing synth; missing assets never break a run.
5. **Every shipped asset has an allowed-license provenance entry**; CC-BY credits screen present.
6. Runtime audio ≤ 8 MB compressed; soak, device checks, full suite, build, and GitNexus scope all pass.
7. The flagship slice **beats the current score** in the documented blind A/B.

Do not begin broader content production until this gate is approved.

## Risks specific to v2

| Risk | Mitigation |
|---|---|
| Free tracks lack a unified identity | Curate within one genre/artist; let the procedural layer + a consistent SFX palette be the unifier; LANCE THEME stays procedural |
| Adaptive tempo desyncs Daily rewards | Tempo derives from deterministic music-state, never asset-load timing; bar-aligned changes; explicit identical-grade determinism test |
| Time-stretch artifacts | Prefer `rubberband`; cap stretch ratio in curation; loudness-normalize post-stretch; the listening gate is the backstop |
| Attribution/licence drift | `provenance.json` + validator hard-gate; CC-BY credits screen; reject NC/SA/GPL/AI/unlicensed |
| Tempo change feels jarring mid-fight | Quantise to bar boundary; keep arena↔boss BPMs within a curated range; validate in the 30-min soak |
