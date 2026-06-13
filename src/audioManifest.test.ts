import { describe, it, expect } from 'vitest';
import {
  FLAGSHIP_AUDIO_MANIFEST,
  tracksForLayering,
  sourceById,
  validateAudioManifest,
  type AudioManifest,
  type MusicSourceManifest,
} from './audioManifest';
import { isLicenseAllowed } from './audioProvenance';

describe('flagship audio manifest', () => {
  it('exposes the four AURORA and three WARDEN sources', () => {
    expect(FLAGSHIP_AUDIO_MANIFEST.music.map((s) => s.id)).toEqual([
      'aurora_verse',
      'aurora_build',
      'aurora_chorus',
      'aurora_drop',
      'warden_spiral',
      'warden_fan',
      'warden_enraged',
    ]);
  });

  it('gives every source a numeric bpm, a key, and an allowed license', () => {
    for (const s of FLAGSHIP_AUDIO_MANIFEST.music) {
      expect(typeof s.bpm).toBe('number');
      expect(s.bpm).toBeGreaterThan(0);
      expect(typeof s.key).toBe('string');
      expect(s.key.length).toBeGreaterThan(0);
      expect(isLicenseAllowed(s.license)).toBe(true);
    }
  });

  it("matches each source's track keys to its layering", () => {
    for (const s of FLAGSHIP_AUDIO_MANIFEST.music) {
      const keys = Object.keys(s.tracks).sort();
      expect(keys).toEqual(tracksForLayering(s.layering).slice().sort());
    }
    // the contract itself
    expect(tracksForLayering('loop')).toEqual(['main']);
    expect(tracksForLayering('stems')).toEqual([
      'drums_core', 'drive', 'bass', 'harmony', 'hook', 'atmosphere',
    ]);
    for (const k of tracksForLayering('layers')) expect(['bed', 'energy', 'lead']).toContain(k);
  });

  it('provides .ogg + .mp3 for every music track and SFX variant', () => {
    for (const s of FLAGSHIP_AUDIO_MANIFEST.music) {
      for (const set of Object.values(s.tracks)) {
        expect(set!.opus).toMatch(/\.ogg$/);
        expect(set!.mp3).toMatch(/\.mp3$/);
      }
    }
    for (const sfx of FLAGSHIP_AUDIO_MANIFEST.sfx) {
      expect(sfx.variants.length).toBeGreaterThan(0);
      for (const v of sfx.variants) {
        expect(v.opus).toMatch(/\.ogg$/);
        expect(v.mp3).toMatch(/\.mp3$/);
      }
    }
  });

  it('passes its own validator and supports lookup', () => {
    expect(validateAudioManifest(FLAGSHIP_AUDIO_MANIFEST)).toEqual([]);
    expect(sourceById('warden_enraged')?.id).toBe('warden_enraged');
    expect(sourceById('not-real')).toBeNull();
  });
});

describe('validateAudioManifest catches contract breaks', () => {
  const base = (over: Partial<MusicSourceManifest> = {}): MusicSourceManifest => ({
    id: 's', suite: 'aurora', role: 'verse', bpm: 110, key: 'A minor', layering: 'loop',
    tracks: { main: { opus: '/x/main.ogg', mp3: '/x/main.mp3' } },
    conformed: true, license: 'CC0', integratedLufs: -20, truePeakDbtp: -1, ...over,
  });
  const wrap = (s: MusicSourceManifest): AudioManifest => ({ version: 1, music: [s], sfx: [] });

  it('flags a rejected license', () => {
    expect(validateAudioManifest(wrap(base({ license: 'CC-BY-NC' }))).length).toBe(1);
  });

  it('flags track keys that do not match the layering', () => {
    const errs = validateAudioManifest(wrap(base({ layering: 'loop', tracks: { bed: { opus: '/x/bed.ogg', mp3: '/x/bed.mp3' } } })));
    expect(errs.length).toBe(1);
    expect(errs[0]).toMatch(/track/i);
  });

  it('flags a duplicate source id', () => {
    const s = base();
    expect(validateAudioManifest({ version: 1, music: [s, s], sfx: [] }).length).toBeGreaterThan(0);
  });
});
