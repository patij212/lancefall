import { describe, it, expect } from 'vitest';
import { deedsMet, type RunDeedCtx } from './cityVoice';

const EMPTY: RunDeedCtx = { bossKindsKilled: [], sovereignDown: false, bestCombo: 0, bossKills: 0, daybreaks: 0, maxDashChain: 0, timeSec: 0, wave: 0 };

describe('deedsMet — citizens wake through play', () => {
  it('no deeds met on an empty run', () => {
    expect(deedsMet(EMPTY)).toEqual([]);
  });
  it('felling a figure wakes its citizen', () => {
    expect(deedsMet({ ...EMPTY, bossKindsKilled: ['warden'] })).toContain('gatewarden');
    expect(deedsMet({ ...EMPTY, bossKindsKilled: ['beacon'] })).toContain('ferryman');
  });
  it('the Sovereign kill wakes BOTH the Courier and the Vintner', () => {
    const got = deedsMet({ ...EMPTY, bossKindsKilled: ['sovereign'], sovereignDown: true });
    expect(got).toContain('courier');
    expect(got).toContain('vintner');
  });
  it('combo milestones wake the lamplighter (x10) then the candle-maker (x25)', () => {
    expect(deedsMet({ ...EMPTY, bestCombo: 12 })).toEqual(['lamplighter']);
    expect(deedsMet({ ...EMPTY, bestCombo: 26 })).toEqual(expect.arrayContaining(['lamplighter', 'candlemaker']));
  });
  it('depth/time/skill deeds', () => {
    expect(deedsMet({ ...EMPTY, wave: 8 })).toContain('archivist');
    expect(deedsMet({ ...EMPTY, wave: 12 })).toEqual(expect.arrayContaining(['archivist', 'cartographer']));
    expect(deedsMet({ ...EMPTY, timeSec: 95 })).toContain('bellringer');
    expect(deedsMet({ ...EMPTY, timeSec: 215 })).toEqual(expect.arrayContaining(['bellringer', 'gardener']));
    expect(deedsMet({ ...EMPTY, maxDashChain: 4 })).toContain('clockwright');
    expect(deedsMet({ ...EMPTY, daybreaks: 1 })).toContain('stargazer');
    expect(deedsMet({ ...EMPTY, bossKills: 3 })).toContain('weaver-cloth');
  });
});
