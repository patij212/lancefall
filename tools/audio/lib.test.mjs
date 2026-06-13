import { describe, it, expect } from 'vitest';
import {
  barSeconds,
  loopSeconds,
  nearestBars,
  isIntegerBarLoop,
  snapToZeroCrossing,
  equalPowerGains,
  opusArgs,
  mp3Args,
  ALLOWED_AUDIO_LICENSES,
  isAudioLicenseAllowed,
  expectedRuntimePaths,
  expectedSfxPaths,
  findMissing,
  validateManifestAssets,
  validateSfxAssets,
  provenanceForAsset,
  durationTable,
} from './lib.mjs';

describe('loop-prep math (Deep Dive C)', () => {
  it('a 4-bar 4/4 loop at 112 BPM is ~8.5714 s', () => {
    expect(barSeconds(112)).toBeCloseTo((60 / 112) * 4, 9);
    expect(loopSeconds(112, 4)).toBeCloseTo(8.571428, 5);
  });

  it('nearestBars rounds a measured loop length back to whole bars', () => {
    expect(nearestBars(8.5714, 112)).toBe(4);
    expect(nearestBars(8.0, 112)).toBe(4); // 8.0/2.142857 = 3.73 → 4
    expect(nearestBars(17.1428, 112)).toBe(8);
  });

  it('isIntegerBarLoop accepts true integer-bar lengths within tolerance, rejects drift', () => {
    expect(isIntegerBarLoop(8.5714, 112, 10)).toBe(true);
    expect(isIntegerBarLoop(8.5714 + 0.005, 112, 10)).toBe(true); // 5 ms drift OK
    expect(isIntegerBarLoop(8.0, 112, 10)).toBe(false); // ~571 ms off the nearest bar
    expect(isIntegerBarLoop(8.5714 + 0.05, 112, 10)).toBe(false); // 50 ms drift fails
  });
});

describe('seam baking helpers', () => {
  it('equalPowerGains is constant-power: a^2 + b^2 === 1 across the fade', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const { a, b } = equalPowerGains(t);
      expect(a * a + b * b).toBeCloseTo(1, 9);
    }
    expect(equalPowerGains(0).a).toBeCloseTo(1, 9); // start: full tail
    expect(equalPowerGains(1).b).toBeCloseTo(1, 9); // end: full head
  });

  it('snapToZeroCrossing finds the nearest sign change to a target cut point', () => {
    const s = [1, 1, -1, -1, 1, 1]; // crossings before idx 2 and before idx 4
    expect(snapToZeroCrossing(s, 0, 6)).toBe(1); // nearest crossing edge to target 0 is i=1
    expect(snapToZeroCrossing(s, 5, 6)).toBe(3); // nearest to target 5 is i=3
  });

  it('snapToZeroCrossing returns the target when no crossing is in the window', () => {
    expect(snapToZeroCrossing([1, 1, 1, 1], 2, 4)).toBe(2);
  });
});

describe('encode argument construction', () => {
  it('opusArgs builds a 48 kHz libopus invocation at 112k', () => {
    const args = opusArgs('in.wav', 'out.ogg');
    expect(args).toContain('libopus');
    expect(args).toContain('112k');
    expect(args).toContain('48000');
    expect(args[0]).toBe('-i');
    expect(args[1]).toBe('in.wav');
    expect(args.at(-1)).toBe('out.ogg');
  });

  it('mp3Args builds a 48 kHz libmp3lame invocation at 160k', () => {
    const args = mp3Args('in.wav', 'out.mp3');
    expect(args).toContain('libmp3lame');
    expect(args).toContain('160k');
    expect(args).toContain('48000');
    expect(args.at(-1)).toBe('out.mp3');
  });
});

describe('license gate (mirrors src/audioProvenance.ts)', () => {
  it('allows CC0/CC-BY/pixabay/royalty-free, rejects NC/SA/GPL/AI/unknown', () => {
    for (const ok of ['CC0', 'CC-BY', 'pixabay', 'royalty-free']) {
      expect(isAudioLicenseAllowed(ok)).toBe(true);
      expect(ALLOWED_AUDIO_LICENSES.has(ok)).toBe(true);
    }
    for (const bad of ['CC-BY-NC', 'CC-BY-SA', 'GPL', 'ai-generated', 'unknown']) {
      expect(isAudioLicenseAllowed(bad)).toBe(false);
    }
  });
});

describe('expected runtime paths + missing detection', () => {
  const sources = [
    { id: 'aurora_verse', tracks: ['main'] },
    { id: 'warden_spiral', tracks: ['main'] },
  ];

  it('derives one ogg + mp3 per track under the flagship dir', () => {
    const paths = expectedRuntimePaths(sources, { dir: 'public/audio/flagship', codecs: ['ogg', 'mp3'] });
    expect(paths).toContain('public/audio/flagship/aurora_verse/main.ogg');
    expect(paths).toContain('public/audio/flagship/aurora_verse/main.mp3');
    expect(paths).toContain('public/audio/flagship/warden_spiral/main.ogg');
    expect(paths.length).toBe(4);
  });

  it('derives numbered ogg + mp3 variants per SFX id under the sfx dir', () => {
    const paths = expectedSfxPaths(
      [{ id: 'dash_fire', variants: 3 }, { id: 'overdrive', variants: 1 }],
      { dir: 'public/audio/flagship/sfx', codecs: ['ogg', 'mp3'] },
    );
    expect(paths).toContain('public/audio/flagship/sfx/dash_fire_1.ogg');
    expect(paths).toContain('public/audio/flagship/sfx/dash_fire_3.mp3');
    expect(paths).toContain('public/audio/flagship/sfx/overdrive_1.ogg');
    expect(paths.length).toBe(3 * 2 + 1 * 2);
  });

  it('findMissing reports exactly the paths the existsFn says are absent', () => {
    const present = new Set(['a', 'c']);
    expect(findMissing(['a', 'b', 'c', 'd'], (p) => present.has(p))).toEqual(['b', 'd']);
  });

  it('reports every expected path as missing when nothing is on disk yet', () => {
    const paths = expectedRuntimePaths(sources, { dir: 'public/audio/flagship', codecs: ['ogg', 'mp3'] });
    expect(findMissing(paths, () => false)).toEqual(paths);
  });
});

describe('validateManifestAssets — the build gate', () => {
  const ok = () => ({
    id: 'aurora_verse',
    suite: 'aurora',
    bpm: 112,
    key: 'A minor',
    layering: 'loop',
    trackDurations: { main: 8.5714 },
    loopSeconds: 8.5714,
    sampleRate: 48000,
    license: 'CC0',
    hasProvenance: true,
    bytes: 900_000,
  });

  it('passes a clean single source', () => {
    expect(validateManifestAssets([ok()])).toEqual([]);
  });

  it('flags a non-48 kHz asset', () => {
    const r = ok();
    r.sampleRate = 44100;
    const errs = validateManifestAssets([r]);
    expect(errs.some((e) => /44100/.test(e) && /48000/.test(e))).toBe(true);
  });

  it('flags per-source track durations differing by more than 1 ms', () => {
    const r = ok();
    r.trackDurations = { main: 8.5714, bed: 8.5814 }; // 10 ms apart
    const errs = validateManifestAssets([r]);
    expect(errs.some((e) => /aurora_verse/.test(e) && /duration/i.test(e))).toBe(true);
  });

  it('flags a loop length that is not an integer number of bars at the source BPM', () => {
    const r = ok();
    r.loopSeconds = 8.0;
    r.trackDurations = { main: 8.0 };
    const errs = validateManifestAssets([r]);
    expect(errs.some((e) => /aurora_verse/.test(e) && /bar/i.test(e))).toBe(true);
  });

  it('hard-rejects a non-allowed license', () => {
    const r = ok();
    r.license = 'CC-BY-NC';
    const errs = validateManifestAssets([r]);
    expect(errs.some((e) => /license/i.test(e) && /CC-BY-NC/.test(e))).toBe(true);
  });

  it('flags an asset with no provenance entry', () => {
    const r = ok();
    r.hasProvenance = false;
    const errs = validateManifestAssets([r]);
    expect(errs.some((e) => /provenance/i.test(e))).toBe(true);
  });

  it('flags a runtime budget over 8 MB total', () => {
    const big = ok();
    big.bytes = 9 * 1024 * 1024;
    const errs = validateManifestAssets([big]);
    expect(errs.some((e) => /8 MB|budget/i.test(e))).toBe(true);
  });

  it('accepts an arena pool of DISTINCT-bpm sources (no shared-suite rule — the grid adapts)', () => {
    const a = ok(); // 112 bpm
    const b = ok();
    b.id = 'aurora_chorus';
    b.bpm = 120;
    b.loopSeconds = 8.0; // 4 bars @ 120
    b.trackDurations = { main: 8.0 };
    expect(validateManifestAssets([a, b])).toEqual([]);
  });
});

describe('provenanceForAsset — exact match, not substring', () => {
  const entries = [
    { asset: 'music/warden_fan/main', license: 'CC-BY' },
    { asset: 'sfx/warden_fan', license: 'CC0' },
  ];
  it('resolves the right entry when a music id and an SFX id collide (warden_fan)', () => {
    expect(provenanceForAsset(entries, 'music/warden_fan/main').license).toBe('CC-BY');
    expect(provenanceForAsset(entries, 'sfx/warden_fan').license).toBe('CC0');
  });
  it('returns null for an unknown asset', () => {
    expect(provenanceForAsset(entries, 'sfx/missing')).toBeNull();
  });
});

describe('validateSfxAssets — the SFX half of the gate', () => {
  const ok = () => ({ id: 'dash_fire', sampleRate: 48000, license: 'CC0', hasProvenance: true, bytes: 2000 });
  it('passes a clean CC0 48 kHz SFX', () => {
    expect(validateSfxAssets([ok()])).toEqual([]);
  });
  it('flags a non-48 kHz SFX', () => {
    expect(validateSfxAssets([{ ...ok(), sampleRate: 44100 }]).some((e) => /44100/.test(e))).toBe(true);
  });
  it('rejects a non-allowed SFX license', () => {
    expect(validateSfxAssets([{ ...ok(), license: 'CC-BY-NC' }]).some((e) => /license/i.test(e))).toBe(true);
  });
  it('flags an SFX with no provenance entry', () => {
    expect(validateSfxAssets([{ ...ok(), hasProvenance: false }]).some((e) => /provenance/i.test(e))).toBe(true);
  });
});

describe('durationTable', () => {
  it('renders one row per source with bpm and license', () => {
    const table = durationTable([
      { id: 'aurora_verse', suite: 'aurora', bpm: 112, loopSeconds: 8.5714, license: 'CC0', bytes: 900_000 },
    ]);
    expect(table).toMatch(/aurora_verse/);
    expect(table).toMatch(/112/);
    expect(table).toMatch(/CC0/);
  });
});
