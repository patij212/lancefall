import { describe, it, expect } from 'vitest';
import { encodeBuildDna, decodeBuildDna } from './buildDna';
import type { BuildDna } from './buildDna';

const sample: BuildDna = {
  v: 1,
  ship: 'phantom',
  heat: 5,
  arch: 'impaler',
  stacks: { longreach: 3, pierce: 2, chain: 1 },
  evos: ['impaler'],
  relics: ['glassspear', 'zealot'],
};

describe('build DNA codec', () => {
  it('round-trips a full build losslessly', () => {
    const out = decodeBuildDna(encodeBuildDna(sample));
    expect(out).toEqual(sample);
  });

  it('produces a compact url-safe string (no +/=)', () => {
    const s = encodeBuildDna(sample);
    expect(s.startsWith('L1')).toBe(true);
    expect(s).not.toMatch(/[+/=]/);
  });

  it('decode is total — returns null on garbage', () => {
    expect(decodeBuildDna('')).toBeNull();
    expect(decodeBuildDna('not-a-dna-string')).toBeNull();
    expect(decodeBuildDna('L1@@@notbase64@@@')).toBeNull();
  });

  it('tolerates a minimal payload (missing optional fields default-fill)', () => {
    const min = encodeBuildDna({ v: 1, ship: 'lance', heat: 0, arch: 'none', stacks: {}, evos: [], relics: [] });
    const out = decodeBuildDna(min);
    expect(out?.ship).toBe('lance');
    expect(out?.evos).toEqual([]);
    expect(out?.relics).toEqual([]);
  });
});
