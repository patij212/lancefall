import { describe, it, expect } from 'vitest';
import { MODES, modeById, modeBrief } from './modes';

describe('modes', () => {
  it('modeById returns the match, or ENDLESS as a safe fallback', () => {
    expect(modeById('endless').id).toBe('endless');
    expect(modeById('nightmare').id).toBe('nightmare');
    expect(modeById('bogus').id).toBe('endless'); // junk → fallback, never throws
  });

  it('has the 6 expected modes incl. THE LONGEST DAY', () => {
    expect(MODES.length).toBe(6);
    expect(MODES.map((m) => m.id)).toContain('longestday');
  });
});

describe('modeBrief', () => {
  it('gives a valid tier + reward string for every mode', () => {
    for (const m of MODES) {
      const b = modeBrief(m);
      expect(['STANDARD', 'HARD', 'BRUTAL']).toContain(b.tier);
      expect(b.reward).toBe(`×${m.shardMul} shards`);
    }
  });

  it('reads difficulty + identity purely from the RunConfig', () => {
    expect(modeBrief(modeById('endless')).tier).toBe('STANDARD');
    expect(modeBrief(modeById('nightmare')).tier).toBe('BRUTAL');
    expect(modeBrief(modeById('arena')).note).toBe('WINNABLE');
    expect(modeBrief(modeById('bossrush')).note).toBe('WINNABLE');
    expect(modeBrief(modeById('longestday')).note).toBe('CIPHER');
    expect(modeBrief(modeById('daily')).note).toBe('SEEDED');
    expect(modeBrief(modeById('endless')).note).toBe('');
  });
});
