import { describe, it, expect } from 'vitest';
import { defaultSave, type SaveData, type RunRecord } from '../save';
import { radarAxes, archetypeName, trendDeltaPct, fmtDuration, heatmapWindow, modeStats } from './statsDerive';

const save = (o: Partial<SaveData> = {}): SaveData => ({ ...defaultSave(), ...o });
const rec = (o: Partial<RunRecord> = {}): RunRecord =>
  ({ score: 1000, wave: 5, mode: 'casual', won: false, sec: 60, heat: 0, combo: 1, date: '2026-06-01', ...o });

describe('fmtDuration', () => {
  it('formats hours+minutes and minutes-only', () => {
    expect(fmtDuration(51720)).toBe('14h 22m');
    expect(fmtDuration(760)).toBe('13m'); // 12m40s rounds up
    expect(fmtDuration(0)).toBe('0m');
  });
});

describe('radarAxes', () => {
  it('returns 6 axes with the dominant normalized to 1 and all in [0,1]', () => {
    const s = save({ totalRuns: 10, lifeKills: 900, lifeWins: 1, lifeGrazes: 0, lifeDaybreaks: 0, lifeLastBreath: 0, deepestWave: 3 });
    const ax = radarAxes(s);
    expect(ax).toHaveLength(6);
    expect(Math.max(...ax.map((a) => a.norm))).toBeCloseTo(1, 5);
    expect(ax.every((a) => a.norm >= 0 && a.norm <= 1)).toBe(true);
  });
});

describe('archetypeName', () => {
  it('is the newcomer label under 5 runs', () => {
    expect(archetypeName(save({ totalRuns: 3 }))).toBe('FINDING YOUR LANCE');
  });
  it('names the dominant trait', () => {
    const s = save({ totalRuns: 20, deepestWave: 29, lifeKills: 10, lifeWins: 0, lifeGrazes: 0, lifeDaybreaks: 0, lifeLastBreath: 0 });
    expect(archetypeName(s)).toBe('THE DELVER');
  });
});

describe('trendDeltaPct', () => {
  it('is null with fewer than 10 runs', () => {
    expect(trendDeltaPct([rec(), rec()])).toBeNull();
  });
  it('computes last-10 vs first-10 percentage', () => {
    const runs = [...Array(10)].map(() => rec({ score: 100 })).concat([...Array(10)].map(() => rec({ score: 150 })));
    expect(trendDeltaPct(runs)).toBe(50);
  });
});

describe('heatmapWindow', () => {
  it('returns `days` entries ending today with counts joined', () => {
    const now = new Date(2026, 5, 18); // local June 18 2026
    const out = heatmapWindow({ '2026-06-18': 4, '2026-06-17': 1 }, now, 7);
    expect(out).toHaveLength(7);
    expect(out[6]).toEqual({ date: '2026-06-18', count: 4 });
    expect(out[5]).toEqual({ date: '2026-06-17', count: 1 });
    expect(out[0].count).toBe(0);
  });
});

describe('modeStats', () => {
  it('joins plays/wins/best per mode, sorted by plays desc', () => {
    const s = save({ runsByMode: { casual: 4, arena: 9 }, winsByMode: { casual: 2 }, bestByMode: { arena: 5000, casual: 3000 } });
    const ms = modeStats(s);
    expect(ms[0].id).toBe('arena');
    expect(ms[0].winPct).toBe(0);
    expect(ms[1]).toMatchObject({ id: 'casual', plays: 4, winPct: 50, best: 3000 });
  });
});
