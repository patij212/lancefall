// Migration tests for the v9 STATS-dossier tracking fields. Kept in a separate file from
// migrate.test.ts to stay isolated while that file is co-edited. No SAVE_VERSION assertion —
// the dossier fields are additive (default-filled), so they ride the current version.
import { describe, it, expect } from 'vitest';
import { migrateSave } from './migrate';
import { defaultSave, type RunRecord } from './save';

const rec = (o: Partial<RunRecord> = {}): RunRecord =>
  ({ score: 1000, wave: 5, mode: 'casual', won: false, sec: 120, heat: 0, combo: 7, date: '2026-06-18', ...o });

describe('migrate — v9 dossier fields', () => {
  it('default-fills the new fields on an old save', () => {
    const out = migrateSave({ version: 7, highScore: 9 }, defaultSave());
    expect(out.runHistory).toEqual([]);
    expect(out.playDays).toEqual({});
    expect(out.lifeTimeSec).toBe(0);
    expect(out.runsByMode).toEqual({});
    expect(out.winsByMode).toEqual({});
  });

  it('keeps valid runHistory and caps it to the last 50', () => {
    const many = Array.from({ length: 70 }, (_, i) => rec({ score: i }));
    const out = migrateSave({ runHistory: many }, defaultSave());
    expect(out.runHistory).toHaveLength(50);
    expect(out.runHistory[0].score).toBe(20); // newest 50 → scores 20..69
    expect(out.runHistory[49].score).toBe(69);
  });

  it('drops malformed run records and coerces field types', () => {
    const out = migrateSave(
      { runHistory: [rec(), null, 5, { score: 'x' }, rec({ won: 'yes' as unknown as boolean, wave: 9.7 })] },
      defaultSave(),
    );
    expect(out.runHistory).toHaveLength(2);
    expect(out.runHistory[1].won).toBe(false); // non-true → false
    expect(out.runHistory[1].wave).toBe(9); // floored
  });

  it('resets a non-array runHistory to []', () => {
    expect(migrateSave({ runHistory: 'nope' }, defaultSave()).runHistory).toEqual([]);
  });

  it('clamps playDays counts and keeps only the 200 most-recent date keys', () => {
    const days: Record<string, number> = { '2020-01-01': 3, '2026-06-18': -2, junk: 9 };
    for (let i = 0; i < 250; i++) {
      days[`2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`] = 1;
    }
    const out = migrateSave({ playDays: days }, defaultSave());
    expect(Object.keys(out.playDays).length).toBeLessThanOrEqual(200);
    expect(out.playDays['junk']).toBeUndefined();
    expect(out.playDays['2026-06-18']).toBe(0); // -2 clamped to 0
  });

  it('clamps lifeTimeSec and per-mode counts; drops non-finite map values', () => {
    const out = migrateSave(
      { lifeTimeSec: -50.7, runsByMode: { casual: 4.9, bad: NaN }, winsByMode: { casual: -1 } },
      defaultSave(),
    );
    expect(out.lifeTimeSec).toBe(0);
    expect(out.runsByMode.casual).toBe(4);
    expect(out.runsByMode.bad).toBeUndefined();
    expect(out.winsByMode.casual).toBe(0);
  });
});
