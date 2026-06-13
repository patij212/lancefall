# Flagship Audio Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove THE LAST LANCE's professional audio direction in real gameplay with one authored AURORA arena suite, one authored WARDEN boss suite, core authored combat SFX, and graceful procedural fallback.

**Architecture:** Keep the existing `AudioEngine` scheduler as the transport, reactive-SFX layer, and failure fallback. Add focused modules for manifest data, browser asset loading, musical state decisions, sample-aligned stem playback, and sample SFX. Once a complete authored scene is decoded, crossfade from the procedural foundation on the next bar; if any required asset fails, the current procedural score continues uninterrupted.

**Tech Stack:** Vite, vanilla TypeScript, Web Audio API, Vitest, FFmpeg/FFprobe, existing Audio Lab.

---

## Scope Decisions

- The flagship arena suite is **AURORA**.
- The flagship boss is **THE WARDEN** because it is early, repeatable, and already the default boss identity.
- Music remains fixed at 112 BPM, 4/4, and A minor for this slice.
- Runtime music scenes are four bars long and may transition at any bar using a bar-aligned playback offset.
- Authored music scenes use six aligned stems: `drums_core`, `drive`, `bass`, `harmony`, `hook`, and `atmosphere`.
- The existing procedural score remains audible until a complete authored scene is ready, then fades out as a group.
- Authored SFX layer onto the existing synthesized transients. Missing samples never suppress existing feedback.
- Phase 0 does not add all six bosses, biome palettes, service-worker caching, new settings controls, or final OST packaging.
- Preserve the current implementations and any concurrent uncommitted work in `src/audio.ts`, `src/audioLab.ts`, and `audiolab.html`. Read and merge with them.
- Do not modify `Game.bossDeath()`. GitNexus marks it **CRITICAL** risk. Warden-defeat audio must use the existing `bossMusic(false)` followed by `bossStinger()` sequence.

## File Map

**Create**

- `src/audioManifest.ts`: pure flagship asset schema, scene data, SFX data, and validation.
- `src/audioManifest.test.ts`: manifest completeness and timing tests.
- `src/audioAssetManager.ts`: codec selection, fetch/decode, memory accounting, and status.
- `src/audioAssetManager.test.ts`: loading, fallback, failure, and accounting tests.
- `src/musicDirector.ts`: pure arena/Warden scene selection and stem-gain decisions.
- `src/musicDirector.test.ts`: scene, phase, hysteresis, and gain tests.
- `src/stemPlayer.ts`: aligned `AudioBufferSourceNode` scene playback and crossfades.
- `src/stemPlayer.test.ts`: pure bar-offset and transition-plan tests.
- `src/sampleSfx.ts`: authored sample playback, local variation RNG, and voice limiting.
- `src/sampleSfx.test.ts`: priority and voice-limit tests.
- `src/hybridMusic.ts`: orchestration facade between the existing engine and the focused modules.
- `src/hybridMusic.test.ts`: state forwarding and graceful-fallback tests with fakes.
- `tools/audio/encode-flagship.mjs`: encode 48 kHz WAV masters to runtime Opus and MP3 assets.
- `tools/audio/validate-flagship.mjs`: validate names, duration, alignment, codecs, and compressed budget.
- `docs/audio/flagship-production-brief.md`: exact music/SFX production brief and export matrix.
- `docs/audio/flagship-listening-report.md`: comparison procedure and recorded quality-gate results.
- `public/audio/flagship/**`: encoded runtime assets.

**Modify**

- `package.json`: add `audio:encode` and `audio:validate` scripts.
- `src/audio.ts`: create the procedural/authored split, own `HybridMusic`, and layer sample SFX through existing public methods.
- `src/game.ts`: send read-only Warden phase state to audio from `frame()`.
- `src/audioLab.ts`: expose hybrid status, authored stem controls, and Warden-state audition controls.
- `audiolab.html`: add only the minimum markup/styles required by the new Audio Lab controls.
- `README.md`: replace the obsolete "no assets" statement and document the hybrid system.

---

### Task 1: Define the Flagship Asset Contract

**Files:**
- Create: `src/audioManifest.ts`
- Create: `src/audioManifest.test.ts`

- [ ] **Step 1: Write the failing manifest tests**

Create `src/audioManifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  FLAGSHIP_AUDIO_MANIFEST,
  MUSIC_STEMS,
  sceneById,
  validateAudioManifest,
} from './audioManifest';

describe('flagship audio manifest', () => {
  it('contains four AURORA scenes and three WARDEN scenes', () => {
    const ids = FLAGSHIP_AUDIO_MANIFEST.music.map((scene) => scene.id);
    expect(ids).toEqual([
      'aurora_verse',
      'aurora_build',
      'aurora_chorus',
      'aurora_drop',
      'warden_spiral',
      'warden_fan',
      'warden_enraged',
    ]);
  });

  it('keeps every scene aligned to four bars at 112 BPM', () => {
    for (const scene of FLAGSHIP_AUDIO_MANIFEST.music) {
      expect(scene.bpm).toBe(112);
      expect(scene.beatsPerBar).toBe(4);
      expect(scene.bars).toBe(4);
      expect(Object.keys(scene.stems).sort()).toEqual([...MUSIC_STEMS].sort());
    }
  });

  it('provides Opus and MP3 URLs for every music stem and SFX variant', () => {
    for (const scene of FLAGSHIP_AUDIO_MANIFEST.music) {
      for (const stem of MUSIC_STEMS) {
        expect(scene.stems[stem].opus).toMatch(/\.ogg$/);
        expect(scene.stems[stem].mp3).toMatch(/\.mp3$/);
      }
    }
    for (const sfx of FLAGSHIP_AUDIO_MANIFEST.sfx) {
      expect(sfx.variants.length).toBeGreaterThan(0);
      for (const variant of sfx.variants) {
        expect(variant.opus).toMatch(/\.ogg$/);
        expect(variant.mp3).toMatch(/\.mp3$/);
      }
    }
  });

  it('passes its own validator and supports total scene lookup', () => {
    expect(validateAudioManifest(FLAGSHIP_AUDIO_MANIFEST)).toEqual([]);
    expect(sceneById('warden_enraged').id).toBe('warden_enraged');
    expect(sceneById('not-real')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/audioManifest.test.ts
```

Expected: FAIL because `src/audioManifest.ts` does not exist.

- [ ] **Step 3: Implement the manifest schema and flagship data**

Create `src/audioManifest.ts` with these public contracts and values:

```ts
export const MUSIC_STEMS = ['drums_core', 'drive', 'bass', 'harmony', 'hook', 'atmosphere'] as const;
export type MusicStemId = (typeof MUSIC_STEMS)[number];

export type MusicSceneId =
  | 'aurora_verse'
  | 'aurora_build'
  | 'aurora_chorus'
  | 'aurora_drop'
  | 'warden_spiral'
  | 'warden_fan'
  | 'warden_enraged';

export type FlagshipSfxId =
  | 'dash_fire'
  | 'perfect_dash'
  | 'lance_hit'
  | 'overdrive'
  | 'last_breath'
  | 'warden_arrival'
  | 'warden_phase'
  | 'warden_fan'
  | 'warden_defeat';

export interface CodecAssetSet {
  opus: string;
  mp3: string;
}

export interface MusicSceneManifest {
  id: MusicSceneId;
  bpm: 112;
  beatsPerBar: 4;
  bars: 4;
  key: 'A minor';
  loadGroup: 'core';
  stems: Record<MusicStemId, CodecAssetSet>;
}

export interface SfxManifest {
  id: FlagshipSfxId;
  gain: number;
  priority: 1 | 2 | 3;
  maxVoices: number;
  variants: CodecAssetSet[];
}

export interface AudioManifest {
  version: 1;
  music: MusicSceneManifest[];
  sfx: SfxManifest[];
}

const codecSet = (base: string): CodecAssetSet => ({
  opus: `${base}.ogg`,
  mp3: `${base}.mp3`,
});

const stemsFor = (scene: MusicSceneId): Record<MusicStemId, CodecAssetSet> =>
  Object.fromEntries(
    MUSIC_STEMS.map((stem) => [stem, codecSet(`/audio/flagship/music/${scene}/${stem}`)]),
  ) as Record<MusicStemId, CodecAssetSet>;

const musicScene = (id: MusicSceneId): MusicSceneManifest => ({
  id,
  bpm: 112,
  beatsPerBar: 4,
  bars: 4,
  key: 'A minor',
  loadGroup: 'core',
  stems: stemsFor(id),
});

const variants = (id: FlagshipSfxId, count: number): CodecAssetSet[] =>
  Array.from({ length: count }, (_, i) => codecSet(`/audio/flagship/sfx/${id}_${i + 1}`));

export const FLAGSHIP_AUDIO_MANIFEST: AudioManifest = {
  version: 1,
  music: [
    musicScene('aurora_verse'),
    musicScene('aurora_build'),
    musicScene('aurora_chorus'),
    musicScene('aurora_drop'),
    musicScene('warden_spiral'),
    musicScene('warden_fan'),
    musicScene('warden_enraged'),
  ],
  sfx: [
    { id: 'dash_fire', gain: 0.55, priority: 2, maxVoices: 3, variants: variants('dash_fire', 3) },
    { id: 'perfect_dash', gain: 0.7, priority: 3, maxVoices: 2, variants: variants('perfect_dash', 3) },
    { id: 'lance_hit', gain: 0.5, priority: 2, maxVoices: 8, variants: variants('lance_hit', 4) },
    { id: 'overdrive', gain: 0.7, priority: 3, maxVoices: 1, variants: variants('overdrive', 1) },
    { id: 'last_breath', gain: 0.7, priority: 3, maxVoices: 1, variants: variants('last_breath', 1) },
    { id: 'warden_arrival', gain: 0.7, priority: 3, maxVoices: 1, variants: variants('warden_arrival', 1) },
    { id: 'warden_phase', gain: 0.55, priority: 3, maxVoices: 2, variants: variants('warden_phase', 2) },
    { id: 'warden_fan', gain: 0.45, priority: 3, maxVoices: 2, variants: variants('warden_fan', 2) },
    { id: 'warden_defeat', gain: 0.75, priority: 3, maxVoices: 1, variants: variants('warden_defeat', 1) },
  ],
};

export function sceneById(id: string): MusicSceneManifest | null {
  return FLAGSHIP_AUDIO_MANIFEST.music.find((scene) => scene.id === id) ?? null;
}

export function validateAudioManifest(manifest: AudioManifest): string[] {
  const errors: string[] = [];
  const sceneIds = new Set<string>();
  for (const scene of manifest.music) {
    if (sceneIds.has(scene.id)) errors.push(`duplicate music scene: ${scene.id}`);
    sceneIds.add(scene.id);
    if (scene.bpm !== 112 || scene.beatsPerBar !== 4 || scene.bars !== 4) {
      errors.push(`invalid timing contract: ${scene.id}`);
    }
    for (const stem of MUSIC_STEMS) {
      const asset = scene.stems[stem];
      if (!asset?.opus || !asset.mp3) errors.push(`missing codec asset: ${scene.id}/${stem}`);
    }
  }
  const sfxIds = new Set<string>();
  for (const sfx of manifest.sfx) {
    if (sfxIds.has(sfx.id)) errors.push(`duplicate sfx: ${sfx.id}`);
    sfxIds.add(sfx.id);
    if (!sfx.variants.length) errors.push(`no variants: ${sfx.id}`);
    if (sfx.gain <= 0 || sfx.maxVoices < 1) errors.push(`invalid sfx mix contract: ${sfx.id}`);
  }
  return errors;
}
```

- [ ] **Step 4: Run the manifest tests**

Run:

```bash
npm test -- src/audioManifest.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add src/audioManifest.ts src/audioManifest.test.ts
git commit -m "feat(lancefall): define flagship audio manifest"
```

---

### Task 2: Add the Production Brief and Asset Pipeline

**Files:**
- Create: `docs/audio/flagship-production-brief.md`
- Create: `tools/audio/encode-flagship.mjs`
- Create: `tools/audio/validate-flagship.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the production brief**

Create `docs/audio/flagship-production-brief.md` with:

- Creative brief: "Neon elegy turned lethal dancefloor."
- AURORA emotional arc: isolated verse, gathering build, luminous chorus, transcendent drop.
- WARDEN identity: distorted ceremonial pulse, tritone pressure, mechanical spiral motion, fan-phase call-and-response, low-health enrage.
- THE LANCE THEME requirement: recognizable in AURORA hook, WARDEN countermelody, perfect dash, and WARDEN defeat.
- Exact 112 BPM, A minor, 4/4, four-bar export requirement.
- Exact six-stem matrix for all seven scenes.
- Exact SFX variant matrix from `FLAGSHIP_AUDIO_MANIFEST`.
- Export rules: 48 kHz, 24-bit WAV, identical scene-stem sample counts, no limiter on individual stems, controlled tails, mono-compatible low end.
- Mix references: full AURORA and WARDEN reference mixes exported beside source masters for listening tests.
- Quality gate: the authored AURORA/WARDEN slice must beat the current procedural score in blind comparison before Phase 1 begins.

- [ ] **Step 2: Add the encoding script**

Create `tools/audio/encode-flagship.mjs`. It must:

1. Read the exact scene and SFX names from a local arrays matching the manifest.
2. Read masters from `audio-src/flagship/music/<scene>/<stem>.wav` and `audio-src/flagship/sfx/<id>_<variant>.wav`.
3. Create mirrored directories under `public/audio/flagship`.
4. Run FFmpeg with these exact runtime settings:

```js
const opusArgs = ['-y', '-i', input, '-ar', '48000', '-c:a', 'libopus', '-b:a', '112k', outputOgg];
const mp3Args = ['-y', '-i', input, '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '160k', outputMp3];
```

Use `spawnSync('ffmpeg', args, { stdio: 'inherit' })` and exit non-zero on the first failed encode.

- [ ] **Step 3: Add the validation script**

Create `tools/audio/validate-flagship.mjs`. It must:

- Fail when a required master or runtime asset is missing.
- Use `ffprobe -v error -show_entries stream=sample_rate,channels,duration -of json <file>`.
- Require 48 kHz for every master and runtime asset.
- Require every music master in a scene to have the same duration within 1 ms.
- Require every music scene duration to equal four bars at 112 BPM within 10 ms:

```js
const EXPECTED_SCENE_SECONDS = (60 / 112) * 4 * 4;
```

- Require stereo music assets and mono or stereo SFX.
- Sum runtime asset bytes and fail above 8 MB.
- Print a compact per-scene duration table and final compressed-byte total.

- [ ] **Step 4: Add package scripts**

Modify `package.json` scripts:

```json
"audio:encode": "node tools/audio/encode-flagship.mjs",
"audio:validate": "node tools/audio/validate-flagship.mjs"
```

- [ ] **Step 5: Verify the scripts fail clearly before assets exist**

Run:

```bash
npm run audio:validate
```

Expected: FAIL with a specific missing-file path under `audio-src/flagship`.

- [ ] **Step 6: Commit the production pipeline**

```bash
git add docs/audio/flagship-production-brief.md tools/audio/encode-flagship.mjs tools/audio/validate-flagship.mjs package.json
git commit -m "build(lancefall): add flagship audio asset pipeline"
```

---

### Task 3: Produce and Encode the Flagship Assets

**Files:**
- Create locally, ignored by git: `audio-src/flagship/**.wav`
- Create and commit: `public/audio/flagship/**.ogg`
- Create and commit: `public/audio/flagship/**.mp3`

- [ ] **Step 1: Export the seven authored music scenes**

Export all six aligned stems for:

```text
aurora_verse
aurora_build
aurora_chorus
aurora_drop
warden_spiral
warden_fan
warden_enraged
```

Each file must be exactly four bars at 112 BPM, 48 kHz, 24-bit WAV.

- [ ] **Step 2: Export the authored SFX variants**

Export:

```text
dash_fire_1..3
perfect_dash_1..3
lance_hit_1..4
overdrive_1
last_breath_1
warden_arrival_1
warden_phase_1..2
warden_fan_1..2
warden_defeat_1
```

- [ ] **Step 3: Encode and validate**

Run:

```bash
npm run audio:encode
npm run audio:validate
```

Expected: PASS, seven aligned music scenes, all SFX variants present, total runtime audio at or below 8 MB.

- [ ] **Step 4: Perform the production listening gate**

Compare the authored AURORA and WARDEN full mixes against the current procedural AURORA and WARDEN bounces at matched perceived loudness. Confirm:

- The AURORA chorus and drop are materially larger than the verse.
- THE LANCE THEME remains recognizable across arena and boss material.
- WARDEN spiral, fan, and enraged states are distinguishable.
- The mix remains comfortable for a continuous 30-minute loop.
- Critical SFX remain audible over the peak AURORA and WARDEN arrangements.

Do not continue to runtime integration if the authored material does not beat the current score.

- [ ] **Step 5: Commit runtime assets only**

```bash
git add public/audio/flagship
git commit -m "assets(lancefall): add flagship audio vertical slice"
```

---

### Task 4: Implement Codec-Aware Asset Loading

**Files:**
- Create: `src/audioAssetManager.ts`
- Create: `src/audioAssetManager.test.ts`

- [ ] **Step 1: Write failing asset-manager tests**

Cover:

- Opus selected when supported.
- MP3 selected when Opus is unsupported.
- Fetch/decode failure is recorded and returns `null`.
- Repeated requests reuse the decoded buffer.
- Decoded memory is calculated as `length * numberOfChannels * 4`.

Use an injected fake fetcher and decoder so tests remain browser-independent.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/audioAssetManager.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement `AudioAssetManager`**

The public surface must be:

```ts
import type { AudioManifest, CodecAssetSet, FlagshipSfxId, MusicSceneId, MusicStemId } from './audioManifest';

export type RuntimeCodec = 'opus' | 'mp3';

export interface AudioAssetStatus {
  codec: RuntimeCodec;
  loaded: number;
  failed: string[];
  decodedBytes: number;
}

export class AudioAssetManager {
  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly manifest: AudioManifest,
    private readonly fetcher: typeof fetch = fetch,
    codec?: RuntimeCodec,
    private readonly decoder: (data: ArrayBuffer) => Promise<AudioBuffer> = (data) => ctx.decodeAudioData(data),
  ) {
    this.codec = codec ?? AudioAssetManager.detectCodec();
  }

  readonly codec: RuntimeCodec;
  async preloadCore(): Promise<void>;
  getMusic(scene: MusicSceneId, stem: MusicStemId): AudioBuffer | null;
  getSfx(id: FlagshipSfxId): readonly AudioBuffer[];
  status(): AudioAssetStatus;
  static detectCodec(audio: HTMLAudioElement = document.createElement('audio')): RuntimeCodec;
}
```

Implementation rules:

- `detectCodec()` returns `opus` when `audio.canPlayType('audio/ogg; codecs="opus"')` is non-empty, otherwise `mp3`.
- Store one `Promise<AudioBuffer | null>` per URL to deduplicate in-flight work.
- Copy the fetched `ArrayBuffer` before `decodeAudioData`.
- Never throw from `preloadCore`; record URL failures and continue.
- Keep music and SFX buffers in separate maps keyed by scene/stem and SFX id.

- [ ] **Step 4: Run the asset-manager tests**

```bash
npm test -- src/audioAssetManager.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audioAssetManager.ts src/audioAssetManager.test.ts
git commit -m "feat(lancefall): add audio asset manager"
```

---

### Task 5: Implement the Pure Music Director

**Files:**
- Create: `src/musicDirector.ts`
- Create: `src/musicDirector.test.ts`

- [ ] **Step 1: Write failing director tests**

Test these exact decisions:

- Arena bar 0 selects `aurora_verse`.
- Arena bar 8 selects `aurora_build`.
- Arena bar 16 selects `aurora_chorus`.
- Arena bar 48 maps the bridge to `aurora_build`.
- Arena bar 52 selects `aurora_drop`.
- Warden phase 0 selects `warden_spiral`.
- Warden phase 1 selects `warden_fan`.
- Warden at or below 34% HP selects `warden_enraged` regardless of attack phase.
- `hook` gain increases with COHERENCE.
- `drive` gain increases with intensity.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/musicDirector.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the director**

Use this public surface:

```ts
import type { MusicSceneId, MusicStemId } from './audioManifest';
import { sectionAt } from './musicTransport';

export interface BossMusicState {
  kind: string;
  phase: number;
  subPhase: number;
  hpFrac: number;
}

export interface MusicDirectorState {
  intensity: number;
  coherence: number;
  boss: BossMusicState | null;
}

export interface MusicDecision {
  scene: MusicSceneId;
  gains: Record<MusicStemId, number>;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function sceneFor(state: MusicDirectorState, absoluteBar: number): MusicSceneId {
  if (state.boss?.kind === 'warden') {
    if (state.boss.hpFrac <= 0.34) return 'warden_enraged';
    return state.boss.phase === 1 ? 'warden_fan' : 'warden_spiral';
  }
  const section = sectionAt(absoluteBar).section;
  if (section === 'prechorus' || section === 'bridge') return 'aurora_build';
  if (section === 'chorus') return 'aurora_chorus';
  if (section === 'drop') return 'aurora_drop';
  return 'aurora_verse';
}

export function stemGains(state: MusicDirectorState): Record<MusicStemId, number> {
  const intensity = clamp01(state.intensity);
  const coherence = clamp01(state.coherence);
  return {
    drums_core: 1,
    drive: 0.15 + intensity * 0.85,
    bass: 0.85 + intensity * 0.15,
    harmony: 0.45 + coherence * 0.55,
    hook: clamp01((coherence - 0.28) / 0.72),
    atmosphere: 0.35 + coherence * 0.65,
  };
}

export function decideMusic(state: MusicDirectorState, absoluteBar: number): MusicDecision {
  return { scene: sceneFor(state, absoluteBar), gains: stemGains(state) };
}
```

- [ ] **Step 4: Run the director tests**

```bash
npm test -- src/musicDirector.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/musicDirector.ts src/musicDirector.test.ts
git commit -m "feat(lancefall): add flagship music director"
```

---

### Task 6: Implement Sample-Aligned Stem Playback

**Files:**
- Create: `src/stemPlayer.ts`
- Create: `src/stemPlayer.test.ts`

- [ ] **Step 1: Write failing pure scheduling tests**

Test:

- `sceneDurationSeconds(112, 4, 4)` is approximately `8.571428`.
- `sceneOffsetSeconds(0, scene)` is `0`.
- `sceneOffsetSeconds(1, scene)` is one bar.
- `sceneOffsetSeconds(4, scene)` wraps to `0`.
- `nextBarTime()` returns the current time on a bar downbeat and the next bar otherwise.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/stemPlayer.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement `StemPlayer`**

The public surface must be:

```ts
import { MUSIC_STEMS, type MusicSceneManifest, type MusicStemId } from './audioManifest';

export function sceneDurationSeconds(bpm: number, beatsPerBar: number, bars: number): number {
  return (60 / bpm) * beatsPerBar * bars;
}

export function sceneOffsetSeconds(absoluteBar: number, scene: MusicSceneManifest): number {
  const barSeconds = (60 / scene.bpm) * scene.beatsPerBar;
  return (((absoluteBar % scene.bars) + scene.bars) % scene.bars) * barSeconds;
}

export function nextBarTime(now: number, musicTime: number, barSeconds: number): number {
  const remainder = ((musicTime % barSeconds) + barSeconds) % barSeconds;
  return remainder < 1e-6 ? now : now + (barSeconds - remainder);
}

export class StemPlayer {
  constructor(
    private readonly ctx: BaseAudioContext,
    destination: AudioNode,
    private readonly bufferFor: (sceneId: string, stem: MusicStemId) => AudioBuffer | null,
  );
  play(scene: MusicSceneManifest, absoluteBar: number, at: number, gains: Record<MusicStemId, number>): boolean;
  setGains(gains: Record<MusicStemId, number>, at?: number): void;
  setStemMuted(stem: MusicStemId, muted: boolean): void;
  stop(at?: number): void;
  get activeScene(): string | null;
}
```

Implementation rules:

- Create one master gain per active scene.
- Create one looping `AudioBufferSourceNode` and one gain per stem.
- Refuse to start a scene unless all six stem buffers are available.
- Start every source with the same `at` and `sceneOffsetSeconds(absoluteBar, scene)`.
- Use a 250 ms equal-time gain crossfade between old and new scene masters.
- Stop old sources 50 ms after their fade reaches zero.
- Apply stem mute after authored gain calculation, not by stopping sources.
- Disconnect all finished sources and gains.

- [ ] **Step 4: Run tests**

```bash
npm test -- src/stemPlayer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stemPlayer.ts src/stemPlayer.test.ts
git commit -m "feat(lancefall): add aligned stem player"
```

---

### Task 7: Implement Priority-Limited Authored SFX

**Files:**
- Create: `src/sampleSfx.ts`
- Create: `src/sampleSfx.test.ts`

- [ ] **Step 1: Write failing priority tests**

Test:

- A priority-3 cue displaces a priority-1 cue when the global voice cap is full.
- A priority-1 cue is dropped when only priority-3 cues are active.
- Per-ID voice caps are enforced.
- Variant selection uses the injected RNG and never imports or mutates world RNG.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/sampleSfx.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement `SampleSfxDirector`**

Use this public surface:

```ts
import type { FlagshipSfxId, SfxManifest } from './audioManifest';

export interface SampleSfxPlayOptions {
  at?: number;
  pan?: number;
  gainMul?: number;
}

export interface ActiveSampleVoice {
  id: FlagshipSfxId;
  priority: 1 | 2 | 3;
  stop: () => void;
}

export function chooseVoiceToCull(active: readonly ActiveSampleVoice[], incomingPriority: number): number {
  let pick = -1;
  let lowest = incomingPriority;
  for (let i = 0; i < active.length; i++) {
    if (active[i].priority < lowest) {
      lowest = active[i].priority;
      pick = i;
    }
  }
  return pick;
}

export class SampleSfxDirector {
  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly destination: AudioNode,
    private readonly manifests: readonly SfxManifest[],
    private readonly buffersFor: (id: FlagshipSfxId) => readonly AudioBuffer[],
    private readonly random: () => number,
    private readonly maxVoices = 24,
  );
  play(id: FlagshipSfxId, options?: SampleSfxPlayOptions): boolean;
  stopAll(): void;
  get activeVoices(): number;
}
```

Implementation rules:

- Return `false` without side effects when an SFX buffer is unavailable.
- Select a variant with the injected local RNG.
- Apply manifest gain multiplied by `gainMul`.
- Use `StereoPannerNode` when `pan` is supplied.
- Enforce both global and per-ID voice caps.
- Never drop a priority-3 cue for a lower-priority cue.
- Remove voices and disconnect nodes on `source.onended`.

- [ ] **Step 4: Run tests**

```bash
npm test -- src/sampleSfx.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sampleSfx.ts src/sampleSfx.test.ts
git commit -m "feat(lancefall): add priority-limited sample sfx"
```

---

### Task 8: Orchestrate the Hybrid Runtime

**Files:**
- Create: `src/hybridMusic.ts`
- Create: `src/hybridMusic.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

Use fake asset, stem-player, and SFX dependencies. Test:

- Procedural gain remains `1` while assets are loading or failed.
- A complete authored scene starts only on a bar downbeat.
- Procedural gain fades toward zero after authored playback starts.
- Arena scene follows the song spine.
- Warden phase and HP state select the correct boss scene.
- `setBossState()` emits Warden arrival, phase, and fan samples only at state edges.
- `stop()` stops authored playback and restores procedural gain.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/hybridMusic.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement `HybridMusic`**

Use this public surface:

```ts
import type { FlagshipSfxId, MusicSceneId, MusicSceneManifest, MusicStemId } from './audioManifest';
import { AudioAssetManager, type AudioAssetStatus } from './audioAssetManager';
import type { BossMusicState } from './musicDirector';
import { SampleSfxDirector } from './sampleSfx';
import { StemPlayer } from './stemPlayer';

export interface HybridAudioStatus {
  authoredActive: boolean;
  activeScene: string | null;
  pendingScene: string | null;
  assets: AudioAssetStatus;
  boss: BossMusicState | null;
}

export interface HybridAssetSource {
  preloadCore(): Promise<void>;
  getMusic(scene: MusicSceneId, stem: MusicStemId): AudioBuffer | null;
  getSfx(id: FlagshipSfxId): readonly AudioBuffer[];
  status(): AudioAssetStatus;
}

export interface HybridStemPlayer {
  play(scene: MusicSceneManifest, absoluteBar: number, at: number, gains: Record<MusicStemId, number>): boolean;
  setGains(gains: Record<MusicStemId, number>, at?: number): void;
  setStemMuted(stem: MusicStemId, muted: boolean): void;
  stop(at?: number): void;
  readonly activeScene: string | null;
}

export interface HybridSampleSfx {
  play(id: FlagshipSfxId, options?: { at?: number; pan?: number; gainMul?: number }): boolean;
  stopAll(): void;
  readonly activeVoices: number;
}

export interface HybridMusicDeps {
  assets?: HybridAssetSource;
  stemPlayer?: HybridStemPlayer;
  sampleSfx?: HybridSampleSfx;
}

export class HybridMusic {
  constructor(
    ctx: BaseAudioContext,
    musicDestination: AudioNode,
    proceduralBus: GainNode,
    sfxDestination: AudioNode,
    deps?: HybridMusicDeps,
  );
  preloadCore(): Promise<void>;
  tick(step: number, at: number): void;
  setIntensity(value: number): void;
  setCoherence(value: number): void;
  setBossState(kind: string | null, phase?: number, subPhase?: number, hpFrac?: number): void;
  playSfx(id: FlagshipSfxId, options?: { at?: number; pan?: number; gainMul?: number }): boolean;
  setStemMuted(stem: MusicStemId, muted: boolean): void;
  stop(): void;
  status(): HybridAudioStatus;
}
```

Implementation rules:

- Construct `AudioAssetManager`, `StemPlayer`, and `SampleSfxDirector` internally when their structural interfaces are not supplied through `HybridMusicDeps`.
- Use a local `mulberry32` instance for SFX variation.
- Begin `preloadCore()` after the user gesture creates the context.
- On every bar downbeat, call `decideMusic()`.
- Start or change scenes only when all six requested stem buffers exist.
- Fade `proceduralBus.gain` to `0.0001` over 250 ms only after `StemPlayer.play()` succeeds.
- Keep the current authored scene when the requested next scene is missing.
- Restore `proceduralBus.gain` to `1` on stop.
- Detect Warden state edges:
  - no boss to Warden: `warden_arrival`
  - phase change or first crossing below 34% HP: `warden_phase`
  - Warden phase 1 `subPhase` increment: `warden_fan`

- [ ] **Step 4: Run tests**

```bash
npm test -- src/hybridMusic.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hybridMusic.ts src/hybridMusic.test.ts
git commit -m "feat(lancefall): orchestrate hybrid flagship audio"
```

---

### Task 9: Integrate Hybrid Playback into `AudioEngine`

**Files:**
- Modify: `src/audio.ts`

- [ ] **Step 1: Run required GitNexus impact analysis**

Run impact analysis for:

- `AudioEngine`
- `buildGraph`
- `playStep`
- `setIntensity`
- `setCoherence`
- `bossMusic`
- `bossStinger`
- `thunk`
- `whoosh`
- `perfectDashSnare`
- `overdriveBurst`
- `lastBreath`
- `stopDrone`

Expected: review all direct callers. Warn before proceeding if any result is HIGH or CRITICAL.

- [ ] **Step 2: Add the hybrid dependencies and buses**

Modify `AudioEngine` so:

- A new `proceduralMusicBus` sits between all existing procedural music sub-buses and `musicBus`.
- A new `HybridMusic | null` field is constructed in `buildGraph()` with `musicBus`, `proceduralMusicBus`, and `sfxBus`.
- `ensure()` starts `void this.hybrid.preloadCore()` after graph creation.
- The existing `musicBus`, master chain, mix snapshots, and analyser remain intact.

Required connection shape:

```text
procedural drums/bass/harmony/lead/boss -> proceduralMusicBus -> musicBus
authored StemPlayer output -------------------------------> musicBus
sample SFX -----------------------------------------------> sfxBus
```

- [ ] **Step 3: Forward transport and state**

Modify:

```ts
private playStep(step: number, t: number): void {
  this.hybrid?.tick(step, t);
  // existing procedural scheduling continues as fallback;
  // proceduralMusicBus is faded by HybridMusic after authored playback succeeds
}
```

Also forward:

- `setIntensity(n)` to `hybrid.setIntensity(n)`
- `setCoherence(c, tier)` to `hybrid.setCoherence(c)`
- `stopDrone()` to `hybrid.stop()`

Add:

```ts
setBossState(kind: EnemyKind | null, phase = 0, subPhase = 0, hpFrac = 1): void {
  this.hybrid?.setBossState(kind, phase, subPhase, hpFrac);
}
```

- [ ] **Step 4: Layer authored samples through existing public methods**

At the start of the existing methods, add:

```ts
this.hybrid?.playSfx('dash_fire');
this.hybrid?.playSfx('perfect_dash', { at });
this.hybrid?.playSfx('lance_hit', { pan, gainMul: Math.min(1.25, 0.85 + combo * 0.01) });
this.hybrid?.playSfx('overdrive');
this.hybrid?.playSfx('last_breath');
```

Map them respectively to `whoosh`, `perfectDashSnare`, `thunk`, `overdriveBurst`, and `lastBreath`. Keep the existing synthesized implementation after each call.

Forward `bossMusic(true, kind)` to `hybrid.setBossState(kind, 0, 0, 1)` so the runtime emits the arrival cue immediately and the next `frame()` update continues from that state without duplication.

Track the last boss kind inside `AudioEngine`. In `bossStinger()`, layer `warden_defeat` only when the immediately preceding boss shutdown was Warden, then clear that remembered kind. In `death()`, clear it so a player death cannot cause a later false defeat cue.

- [ ] **Step 5: Expose Audio Lab controls**

Add:

```ts
get hybridStatus() {
  return this.hybrid?.status() ?? null;
}

setAuthoredStemMute(stem: MusicStemId, muted: boolean): void {
  this.hybrid?.setStemMuted(stem, muted);
}
```

- [ ] **Step 6: Run unit tests and build**

```bash
npm test
npm run build
```

Expected: all tests PASS and build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/audio.ts
git commit -m "feat(lancefall): integrate hybrid audio engine"
```

---

### Task 10: Send Read-Only Warden State from the Game Loop

**Files:**
- Modify: `src/game.ts`

- [ ] **Step 1: Run required GitNexus impact analysis**

Run impact analysis for `Game.frame`.

Expected: LOW risk based on the planning-time analysis. Do not modify `bossDeath()`.

- [ ] **Step 2: Add the read-only audio-state update**

Immediately after the existing intensity update block in `frame()`, add:

```ts
const audioBoss = this.world.boss;
this.audio.setBossState(
  audioBoss?.kind ?? null,
  audioBoss?.phase ?? 0,
  audioBoss?.subPhase ?? 0,
  audioBoss ? audioBoss.hp / Math.max(1, audioBoss.maxHp) : 1,
);
```

This path must only read world state and update cosmetic audio state. It must not mutate gameplay, consume RNG, or enter the fixed-step simulation.

- [ ] **Step 3: Run deterministic and full tests**

```bash
npm test -- src/rng.test.ts src/beat.test.ts src/bossThemes.test.ts
npm test
npm run build
```

Expected: all tests PASS and build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/game.ts
git commit -m "feat(lancefall): drive Warden adaptive audio state"
```

---

### Task 11: Extend the Existing Audio Lab Without Rewriting It

**Files:**
- Modify: `src/audioLab.ts`
- Modify: `audiolab.html`

- [ ] **Step 1: Inspect and preserve the current implementation and any dirty changes**

Before editing:

```bash
git diff -- lancefall/src/audioLab.ts lancefall/audiolab.html
```

Work with the current Audio Console implementation. Do not replace it with an older version.

- [ ] **Step 2: Run required GitNexus impact analysis**

Run impact analysis for the Audio Lab functions that will be modified, including `buildMixer` and `buildDeck`.

- [ ] **Step 3: Add hybrid status and authored stem controls**

Extend the current mixer with:

- Runtime codec
- Loaded/failed asset count
- Decoded-memory MB
- Current authored scene
- Pending scene
- Authored-active indicator
- Six authored-stem mute controls

Poll `audio.hybridStatus` at the existing 120 ms UI cadence.

- [ ] **Step 4: Add Warden audition controls**

Add controls that call:

```ts
audio.setBossState('warden', 0, 0, 1);
audio.setBossState('warden', 1, 1, 0.7);
audio.setBossState('warden', 0, 0, 0.34);
audio.setBossState(null);
```

Label them `SPIRAL`, `FAN`, `ENRAGED`, and `EXIT`.

- [ ] **Step 5: Verify in the browser**

Run:

```bash
npm run dev
```

Open `http://localhost:5197/audiolab.html` with the Browser plugin and verify:

- Start gate creates audio context and begins loading.
- Procedural AURORA plays immediately.
- Authored AURORA enters on a bar downbeat after loading.
- Scene changes do not click or gap.
- Warden controls switch music by the next bar.
- Authored stem mute controls are audible and reversible.
- Missing-asset simulation leaves procedural audio running.
- No console errors occur.

- [ ] **Step 6: Commit**

```bash
git add src/audioLab.ts audiolab.html
git commit -m "feat(lancefall): add hybrid audio lab controls"
```

---

### Task 12: Document, Measure, and Pass the Vertical-Slice Gate

**Files:**
- Create: `docs/audio/flagship-listening-report.md`
- Modify: `README.md`

- [ ] **Step 1: Update the README**

Replace the obsolete claim that audio is fully synthesized with a concise description of:

- Authored AURORA and WARDEN stems
- Procedural fallback and reactive punctuation
- Sampled plus procedural combat SFX
- Audio Lab workflow
- `npm run audio:encode` and `npm run audio:validate`

- [ ] **Step 2: Create the listening report**

Record:

- Date and build commit
- Test devices: headphones, laptop speakers, phone/small speaker, mono, low volume
- Current-score versus flagship-slice comparison method
- AURORA verse/chorus/drop contrast result
- WARDEN spiral/fan/enraged recognition result
- THE LANCE THEME recognition result
- 30-minute fatigue rating
- Loudness and true-peak measurements
- Any asset failures observed
- Final pass/fail decision for the Phase 0 gate

- [ ] **Step 3: Run the complete verification suite**

```bash
npm run audio:validate
npm test
npm run build
```

Expected:

- Audio validation PASS
- All Vitest tests PASS
- Production build PASS

- [ ] **Step 4: Run a 30-minute gameplay soak**

Verify:

- No audible clicks, gaps, dropouts, or runaway voices
- No console errors
- First audible procedural response occurs within 150 ms after the start gesture
- Full Warden music switch completes within one bar of arrival
- Decoded audio remains at or below 64 MB on desktop and 40 MB on the mobile test target
- Representative five-minute gameplay capture measures approximately -20 LUFS-I ±2 LU and no higher than -1 dBTP
- Warden arrives and changes phases cleanly
- Death during Warden does not produce a false Warden-defeat cue
- Restart after death restores correct procedural/authored playback
- Muting or missing authored assets leaves a coherent procedural run
- Daily challenge behavior remains deterministic

- [ ] **Step 5: Run GitNexus change detection**

Run:

```text
detect_changes(scope: "compare", base_ref: "main")
```

Review every affected process. Resolve unexpected gameplay-flow changes before committing.

- [ ] **Step 6: Commit documentation and gate result**

```bash
git add README.md docs/audio/flagship-listening-report.md
git commit -m "docs(lancefall): record flagship audio quality gate"
```

---

## Completion Criteria

Phase 0 is complete only when:

1. The authored AURORA and WARDEN scenes play sample-aligned in real gameplay.
2. Scene changes occur on bar boundaries without clicks or gaps.
3. Warden spiral, fan, and enraged arrangements are distinguishable.
4. Core authored player and Warden SFX layer successfully over existing procedural transients.
5. Asset loading or decoding failure leaves the procedural score intact.
6. Runtime assets remain at or below 8 MB compressed.
7. The 30-minute soak, device checks, full test suite, production build, and GitNexus scope review pass.
8. The flagship slice beats the current audio in the documented listening comparison.

Do not begin the broader Phase 1 runtime foundation or additional content production until this gate is approved.
