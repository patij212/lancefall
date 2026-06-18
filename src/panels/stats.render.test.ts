// @vitest-environment happy-dom
// Runtime smoke test for the STATS dossier DOM builder. Renders against a real DOM under
// reduce-motion (instant animation paths — no SVG getTotalLength / rAF timing needed) to catch
// null-derefs / bad imports / empty-state regressions that the type-checker can't.
import { describe, it, expect, beforeEach } from 'vitest';
import { defaultSave, type SaveData, type RunRecord } from '../save';
import { renderStats } from './stats';

beforeEach(() => {
  document.documentElement.className = 'reduce-motion';
  document.body.innerHTML = '';
});

function rec(i: number): RunRecord {
  return { score: 40000 + i * 3000, wave: 6 + (i % 18), mode: 'casual', won: i % 3 === 0, sec: 200 + i, heat: 0, combo: 5 + i, date: `2026-06-${String(1 + (i % 28)).padStart(2, '0')}` };
}

function richSave(): SaveData {
  const s = defaultSave();
  Object.assign(s, {
    highScore: 327540, bestCombo: 52, totalRuns: 148, lifeWins: 56,
    lifeKills: 18640, lifeBoss: 92, lifeShards: 44200, lifeGrazes: 6980, lifeDaybreaks: 410, lifeLastBreath: 88,
    lifeTimeSec: 51720, playStreak: 6, ngPlusLevel: 3, maxHeat: 7, deepestWave: 24,
    longestRunSec: 708, fastestArenaSec: 272, mostBossesOneRun: 5,
    runHistory: Array.from({ length: 30 }, (_, i) => rec(i)),
    playDays: { '2026-06-18': 4, '2026-06-17': 2, '2026-06-10': 1 },
    runsByMode: { casual: 40, arena: 18, daily: 14 },
    winsByMode: { casual: 22, arena: 9 },
    bestByMode: { casual: 180200, arena: 98400, daily: 211300 },
    nemesis: { sovereign: 18, hollow: 12, warden: 7 },
    killsByKind: { drifter: 4240, swarmer: 3110, lancer: 1820, sovereign: 12 },
    unlockedShips: ['lance', 'a', 'b', 'c'],
    meta: { dash: 2, regen: 1 },
    achievements: ['a', 'b', 'c'],
  });
  return s;
}

describe('renderStats — render smoke', () => {
  it('renders all dossier sections for a rich save without throwing', async () => {
    const els = renderStats(richSave());
    document.body.append(...els);
    await new Promise((r) => setTimeout(r, 0)); // flush the scheduled reveal pass

    expect(els.length).toBeGreaterThanOrEqual(9);
    const txt = document.body.textContent || '';
    for (const label of ['PERFORMANCE', 'ACTIVITY', 'BY MODE', 'KILLS BY FOE', 'COMBAT', 'RECORDS', 'COLLECTION']) {
      expect(txt).toContain(label);
    }
    expect(txt).toContain('Total Kills');
    expect(txt).toContain('Bullets Grazed'); // the formerly-hidden lifetime counter
    expect(document.querySelector('.st-radar-arch-n')?.textContent).toBeTruthy(); // archetype shown
    expect(document.querySelectorAll('.st-heat-cell:not(.pad)').length).toBeGreaterThan(150); // ~182-day heatmap
    expect(document.querySelector('.st-trend-line')).toBeTruthy(); // 30 runs → real chart, not empty state
    expect(document.querySelectorAll('.st-coll-row').length).toBe(6);
  });

  it('renders gracefully for a fresh save (empty states, no throw)', async () => {
    const els = renderStats(defaultSave());
    document.body.append(...els);
    await new Promise((r) => setTimeout(r, 0));

    const txt = document.body.textContent || '';
    expect(txt).toContain('Play a few runs'); // trend empty state (<5 runs)
    expect(txt).toContain('Nothing has ended you yet'); // nemesis empty state
    expect(txt).toContain('FINDING YOUR LANCE'); // newcomer archetype
  });
});
