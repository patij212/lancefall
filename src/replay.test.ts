import { describe, it, expect } from 'vitest';
import { buildWatermark, buildShareCaption } from './replay';

// The replay module is mostly DOM/Worker IO (covered by Playwright + the gif unit
// tests), but the watermark + caption builders are pure functions of run metadata
// and worth locking: the exported GIF MUST carry score + seed + site.

describe('replay — branded watermark + caption (pure)', () => {
  it('buildWatermark carries score, seed, and the site', () => {
    const m = buildWatermark({ score: 127400, seed: 20260615, daily: false });
    expect(m.score).toContain('127,400');
    expect(m.score).toContain('PTS');
    expect(m.seed).toBe('SEED 20260615');
    expect(m.site).toBe('lancefall.pages.dev');
  });

  it('a Daily run labels the seed as DAILY', () => {
    const m = buildWatermark({ score: 5000, seed: 20260615, daily: true });
    expect(m.seed).toBe('DAILY 20260615');
  });

  it('buildShareCaption includes score + the site URL', () => {
    const c = buildShareCaption({ score: 9001, seed: 42, daily: false });
    expect(c).toContain('9,001');
    expect(c).toContain('seed 42');
    expect(c).toContain('lancefall.pages.dev');
  });

  it('the Daily caption says Daily, not a raw seed', () => {
    const c = buildShareCaption({ score: 1, seed: 20260615, daily: true });
    expect(c).toContain('Daily');
    expect(c).not.toContain('seed 20260615');
  });
});
