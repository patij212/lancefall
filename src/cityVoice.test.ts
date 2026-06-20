import { describe, it, expect } from 'vitest';
import { deedsMet, type RunDeedCtx, wakeIsCeremony, vigilHeatFloor, vigilCitizenName, agedEcho } from './cityVoice';
import { defaultSave } from './save';
import { vocabulary } from './intercepts';

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

describe('the dose — only the 8 meaningful wakes get the ceremony', () => {
  it('figure-tied + candle-maker + weaver get the ceremony', () => {
    for (const id of ['gatewarden','chorister','ferryman','glassblower','stonemason','courier','candlemaker','weaver-cloth'])
      expect(wakeIsCeremony(id)).toBe(true);
  });
  it('the common wakes are toasts', () => {
    for (const id of ['lamplighter','bellringer','archivist','cartographer','clockwright','stargazer','gardener','vintner'])
      expect(wakeIsCeremony(id)).toBe(false);
  });
});

function holding(totalRuns: number, vigilSince: number) {
  const s = defaultSave(); s.stillpointChoice = 'catch'; s.totalRuns = totalRuns; s.vigilSince = vigilSince; return s;
}
describe('vigilHeatFloor — holding the light costs more every 5 days', () => {
  it('0 when not holding', () => { expect(vigilHeatFloor(defaultSave())).toBe(0); });
  it('rises by 1 every 5 days held, capped at MAX_HEAT', () => {
    expect(vigilHeatFloor(holding(2, 2))).toBe(0);   // 0 days
    expect(vigilHeatFloor(holding(7, 2))).toBe(1);   // 5 days
    expect(vigilHeatFloor(holding(12, 2))).toBe(2);  // 10 days
    expect(vigilHeatFloor(holding(200, 2))).toBe(7); // capped at MAX_HEAT
  });
  it('resets to 0 once released (no longer catch)', () => {
    const s = holding(50, 2); s.released = true; s.stillpointChoice = 'fall';
    expect(vigilHeatFloor(s)).toBe(0);
  });
});

describe('personified long game', () => {
  it('vigilCitizenName returns a woken citizen name, or null if none woken', () => {
    expect(vigilCitizenName(defaultSave())).toBeNull();
    const s = defaultSave(); s.decryptedWords = vocabulary();
    expect(typeof vigilCitizenName(s)).toBe('string');
  });
  it('agedEcho keeps the shared citizen/memory and only deepens the framing by run count', () => {
    const early = agedEcho(1234, 3);
    const mid = agedEcho(1234, 25);
    const vet = agedEcho(1234, 60);
    expect(early.length).toBeGreaterThan(0);
    expect(mid).toMatch(/THE /);          // run 20+ names the citizen
    expect(vet).toMatch(/time/i);          // run 50+ adds "...the Nth time"
    // the same daySeed → the same underlying memory clause in all three
    const clause = agedEcho(1234, 0);
    expect(mid).toContain(clause.replace(/^[A-Z]/, (m) => m.toLowerCase()).split(' ').slice(-3).join(' '));
  });
});
