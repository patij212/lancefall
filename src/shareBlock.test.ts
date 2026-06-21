import { describe, it, expect } from 'vitest';
import { shareBlockView } from './shareBlock';

const base = { seed: 20260621, daily: false, time: 252, wave: 7, score: 42800, grade: '—' };

describe('shareBlockView — themed game-over share block copy', () => {
  it('defeat speaks the echo→rally voice with HELD/WAVE/SCORE', () => {
    const v = shareBlockView({ ...base, won: false });
    expect(v.label).toBe('LAST TRANSMISSION');
    expect(v.pip).toBe('cold');
    expect(v.cta).toBe('SEND THE ECHO');
    expect(v.rally).toBe('show them it can be held →');
    expect(v.badge).toBe('● SIGNAL LOST · SEED 20260621');
    expect(v.stats.map((c) => c.k)).toEqual(['HELD', 'WAVE', 'SCORE']);
    expect(v.stats[0].v).toBe('4:12'); // 252s → 4:12
    expect(v.stats[1].v).toBe('7');
    expect(v.stats[2].v).toBe('42,800');
  });

  it('victory speaks of first light held with CLEARED/GRADE/SCORE', () => {
    const v = shareBlockView({ ...base, won: true, clearTime: 588, grade: 'S', score: 128500 });
    expect(v.label).toBe('SIGNAL RESTORED');
    expect(v.pip).toBe('warm');
    expect(v.cta).toBe('SEND THE DAWN');
    expect(v.rally).toBe('this is what holding looks like →');
    expect(v.badge).toBe('● FIRST LIGHT · SEED 20260621');
    expect(v.stats.map((c) => c.k)).toEqual(['CLEARED', 'GRADE', 'SCORE']);
    expect(v.stats[0].v).toBe('9:48'); // 588s → 9:48
    expect(v.stats[1].v).toBe('S');
    expect(v.stats[2].v).toBe('128,500');
  });

  it('a Daily badge says DAILY, matching the GIF watermark', () => {
    expect(shareBlockView({ ...base, won: false, daily: true }).badge).toBe('● SIGNAL LOST · DAILY 20260621');
    expect(shareBlockView({ ...base, won: true, daily: true, clearTime: 0 }).badge).toBe('● FIRST LIGHT · DAILY 20260621');
  });

  it('a win with no clearTime falls back to time survived', () => {
    const v = shareBlockView({ ...base, won: true, clearTime: undefined, time: 600, grade: 'A' });
    expect(v.stats[0]).toEqual({ k: 'CLEARED', v: '10:00' });
  });
});
