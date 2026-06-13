// src/audioManifest.ts — PURE flagship audio contract (no ctx/DOM/rng). Generalises v1's
// rigid 6-stem-only scheme: a music source can be a single `loop`, a few `layers`, or full
// `stems` (Deep Dive C — free full-tracks ship as `loop`s). Per-source bpm/key (the beat grid
// is adaptive, Deep Dive A) and a provenance license the validator + build-time gate enforce.

import { isLicenseAllowed, requiresAttribution, type AudioLicense } from './audioProvenance';

export type MusicLayering = 'loop' | 'layers' | 'stems';

export const ALL_TRACK_KEYS = [
  'main', 'bed', 'energy', 'lead', // loop / layers
  'drums_core', 'drive', 'bass', 'harmony', 'hook', 'atmosphere', // stems
] as const;
export type MusicTrackKey = (typeof ALL_TRACK_KEYS)[number];

const LOOP_KEYS: MusicTrackKey[] = ['main'];
const LAYER_KEYS: MusicTrackKey[] = ['bed', 'energy', 'lead'];
const STEM_KEYS: MusicTrackKey[] = ['drums_core', 'drive', 'bass', 'harmony', 'hook', 'atmosphere'];

/** The exact track keys a source of the given layering must provide. */
export function tracksForLayering(layering: MusicLayering): MusicTrackKey[] {
  return layering === 'loop' ? LOOP_KEYS : layering === 'layers' ? LAYER_KEYS : STEM_KEYS;
}

export interface CodecAssetSet {
  opus: string; // .ogg (Opus)
  mp3: string;
}

export type MusicSuite = 'aurora' | 'warden';

export interface MusicSourceManifest {
  id: string;
  suite: MusicSuite;
  role: string; // verse/build/chorus/drop | spiral/fan/enraged
  bpm: number; // per-source — the beat grid adapts (Deep Dive A)
  key: string;
  layering: MusicLayering;
  bars?: number;
  loopSeconds?: number;
  tracks: Partial<Record<MusicTrackKey, CodecAssetSet>>;
  conformed: boolean; // has it been loop-prepped (Deep Dive C)?
  license: AudioLicense;
  attribution?: string; // required iff CC-BY
  integratedLufs: number;
  truePeakDbtp: number;
}

export interface SfxManifest {
  id: string;
  gain: number;
  priority: 1 | 2 | 3;
  maxVoices: number;
  variants: CodecAssetSet[];
}

export interface AudioManifest {
  version: 1;
  music: MusicSourceManifest[];
  sfx: SfxManifest[];
}

const codec = (base: string): CodecAssetSet => ({ opus: `${base}.ogg`, mp3: `${base}.mp3` });

// Flagship music: AURORA arena + WARDEN boss. All ship as `loop` sources (Deep Dive C). bpm/key
// are placeholders until Task-3 curation; `provenance.json` is the build-time source of truth.
const loopSource = (id: string, suite: MusicSuite, role: string, bpm: number, key: string): MusicSourceManifest => ({
  id, suite, role, bpm, key, layering: 'loop',
  tracks: { main: codec(`/audio/flagship/music/${id}/main`) },
  conformed: false, license: 'CC0', integratedLufs: -20, truePeakDbtp: -1,
});

const variants = (id: string, n: number): CodecAssetSet[] =>
  Array.from({ length: n }, (_, i) => codec(`/audio/flagship/sfx/${id}_${i + 1}`));

export const FLAGSHIP_AUDIO_MANIFEST: AudioManifest = {
  version: 1,
  music: [
    // AURORA — one song, four loop regions; share BPM + key (Deep Dive C).
    loopSource('aurora_verse', 'aurora', 'verse', 112, 'A minor'),
    loopSource('aurora_build', 'aurora', 'build', 112, 'A minor'),
    loopSource('aurora_chorus', 'aurora', 'chorus', 112, 'A minor'),
    loopSource('aurora_drop', 'aurora', 'drop', 112, 'A minor'),
    // WARDEN — its own family; a deliberate boss gear-change, BPM kept in the ~100–128 band.
    loopSource('warden_spiral', 'warden', 'spiral', 100, 'A minor'),
    loopSource('warden_fan', 'warden', 'fan', 100, 'A minor'),
    loopSource('warden_enraged', 'warden', 'enraged', 100, 'A minor'),
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

export function sourceById(id: string): MusicSourceManifest | null {
  return FLAGSHIP_AUDIO_MANIFEST.music.find((s) => s.id === id) ?? null;
}

/** Structural + licence validation. Empty ⇒ the manifest is well-formed. (The build-time
 *  validator additionally checks real files + the provenance.json ledger.) */
export function validateAudioManifest(m: AudioManifest): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const s of m.music) {
    if (seen.has(s.id)) errors.push(`duplicate music source: ${s.id}`);
    seen.add(s.id);
    if (!(s.bpm > 0) || !s.key) errors.push(`${s.id}: invalid bpm/key`);
    if (!isLicenseAllowed(s.license)) errors.push(`${s.id}: rejected license "${s.license}"`);
    if (requiresAttribution(s.license) && !s.attribution) errors.push(`${s.id}: CC-BY requires attribution`);
    const want = tracksForLayering(s.layering).slice().sort();
    const have = Object.keys(s.tracks).sort();
    if (have.length !== want.length || want.some((k, i) => k !== have[i])) {
      errors.push(`${s.id}: track keys [${have.join(',')}] do not match ${s.layering} layering [${want.join(',')}]`);
    }
    for (const [k, set] of Object.entries(s.tracks)) {
      if (!set?.opus || !set.mp3) errors.push(`${s.id}/${k}: missing opus/mp3 url`);
    }
  }
  const sfxSeen = new Set<string>();
  for (const sfx of m.sfx) {
    if (sfxSeen.has(sfx.id)) errors.push(`duplicate sfx: ${sfx.id}`);
    sfxSeen.add(sfx.id);
    if (!sfx.variants.length) errors.push(`${sfx.id}: no variants`);
    if (sfx.gain <= 0 || sfx.maxVoices < 1) errors.push(`${sfx.id}: invalid mix contract`);
  }
  return errors;
}
