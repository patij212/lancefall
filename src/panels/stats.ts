// STATS dossier content — the lifetime numbers. Extracted from ui.ts (the monolith split) and
// enriched to the v7 mock: an achievement-completion donut + win-rate hero, a RECORDS grid, BEST
// BY MODE and NEMESIS bars, and a COMBAT·LIFETIME cell grid. The achievement GRID itself now lives
// in the CODEX (its own tab — see panels/achievements.ts); STATS keeps only the completion donut.

import { el, stat } from './dom';
import type { SaveData } from '../save';
import type { Enemy } from '../types';
import { ACHIEVEMENTS } from '../achievements';
import { bossName } from '../boss';
import { modeById } from '../modes';
import { heatLevel } from '../heat';

const BOSS_KINDS = ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'];

// per-row bar accents (mock parity). MODE_COLOR mirrors ui.ts RAIL_ACCENTS; BOSS_COLOR is the
// mock's nemesis palette (beacon filled in). Kept local so this panel module stays decoupled.
const MODE_COLOR: Record<string, string> = {
  casual: '#34d399', endless: '#22d3ee', arena: '#22d3ee', bossrush: '#fb923c',
  daily: '#fbbf24', weekly: '#f59e0b', nightmare: '#f87171', longestday: '#c084fc',
};
const BOSS_COLOR: Record<string, string> = {
  warden: '#ff3b6b', weaver: '#a855f7', beacon: '#38bdf8', mirrorblade: '#ef4444', hollow: '#6ee7b7', sovereign: '#fde047',
};
/** whole-seconds → m:ss (the STATS Longest Run / Fastest Arena records). */
const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
/** "INFERNO" → "Inferno" (heat tier name, mock casing). */
const titleCase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();

/** Achievement-completion donut (static SVG stroke-dash arc — the dossier headline). */
function donutEl(got: number, total: number): HTMLElement {
  const ratio = total ? got / total : 0;
  const R = 40;
  const C = 2 * Math.PI * R;
  const off = (C * (1 - ratio)).toFixed(1);
  const d = el('div', { class: 'st-ring' });
  d.innerHTML =
    `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${R}" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="8"/>` +
    `<circle cx="50" cy="50" r="${R}" fill="none" stroke="#fde047" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off}"/></svg>` +
    `<div class="st-ring-c"><div class="st-ring-pct">${Math.round(ratio * 100)}%</div><div class="st-ring-lbl">${got}/${total}</div></div>`;
  return d;
}

/** Normalized horizontal bars (NEMESIS / BEST BY MODE share this). `accent` is '' for the
 *  rose nemesis bars or 'mode-fill' for the cyan best-by-mode bars (which also widen the
 *  value column via the .mode-row modifier for the longer score). */
function barChart(rows: [string, number, string][], fmt: (n: number) => string): HTMLElement {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  const wrap = el('div', { class: 'nem-bars' });
  for (const [k, n, color] of rows) {
    const fill = el('div', { class: 'nem-fill' });
    const pct = `${Math.max(6, (n / max) * 100)}%`;
    // per-row accent + glow, inline so it renders without the (held) .hbar CSS; --w drives the
    // optional fill-grow animation that style.css layers on for the buttery open.
    fill.style.setProperty('--w', pct);
    fill.style.width = pct;
    fill.style.background = color;
    fill.style.boxShadow = `0 0 8px -1px ${color}`;
    const v = el('div', { class: 'nem-v' }, fmt(n));
    v.style.color = '#dbe6f7'; // mock: light value, colored fill
    wrap.append(
      el('div', { class: 'nem-row' },
        el('div', { class: 'nem-k' }, k),
        el('div', { class: 'nem-track' }, fill),
        v,
      ),
    );
  }
  return wrap;
}

export function renderStats(s: SaveData): HTMLElement[] {
  const out: HTMLElement[] = [];
  const got = ACHIEVEMENTS.filter((a) => s.achievements.includes(a.id)).length;
  const total = ACHIEVEMENTS.length;

  // HERO — donut + top-line lifetime stats (now incl. WIN RATE = lifeWins / totalRuns).
  const winRate = s.totalRuns > 0 ? `${Math.round((s.lifeWins / s.totalRuns) * 100)}%` : '—';
  // hero — donut + 4 top-line stats; HIGH SCORE reads in the cyan accent (mock parity).
  const hiScore = stat('high score', s.highScore.toLocaleString());
  (hiScore.querySelector('.go-stat-v') as HTMLElement).style.color = 'var(--cyan)';
  out.push(
    el('div', { class: 'stats-hero' },
      donutEl(got, total),
      el('div', { class: 'stats-hero-grid' },
        hiScore,
        stat('best combo', `×${s.bestCombo}`),
        stat('runs', String(s.totalRuns)),
        stat('win rate', winRate),
      ),
    ),
  );

  // RECORDS — peak single-run bests (mock set). Times are m:ss; the heat tier name rides as a
  // dim <small>; unset (0) records read "—" / "OFF".
  const rec = (k: string, v: string, small?: string) => {
    const val = el('div', { class: 'rec-v' }, v);
    if (small) val.append(el('small', {}, ` ${small}`));
    return el('div', { class: 'rec' }, el('div', { class: 'rec-k' }, k), val);
  };
  const heat = s.maxHeat > 0 ? heatLevel(s.maxHeat) : null;
  out.push(
    el('div', { class: 'stats-label' }, 'RECORDS'),
    el('div', { class: 'rec-grid' },
      rec('Deepest Wave', s.deepestWave > 0 ? String(s.deepestWave) : '—'),
      rec('Highest Heat', heat ? `H${heat.level}` : 'OFF', heat ? `· ${titleCase(heat.name)}` : undefined),
      rec('Longest Run', s.longestRunSec > 0 ? mmss(s.longestRunSec) : '—'),
      rec('Fastest Arena', s.fastestArenaSec > 0 ? mmss(s.fastestArenaSec) : '—'),
      rec('Biggest Combo', s.bestCombo > 0 ? `×${s.bestCombo}` : '—'),
      rec('Bosses · One Run', s.mostBossesOneRun > 0 ? String(s.mostBossesOneRun) : '—'),
    ),
  );

  // BEST BY MODE — top SCORE per mode, real-mode-id filtered (no mislabel via the fallback).
  const modeBests = (Object.entries(s.bestByMode) as [string, number][])
    .filter(([id, v]) => v > 0 && modeById(id).id === id)
    .sort((a, b) => b[1] - a[1]);
  if (modeBests.length) {
    out.push(
      el('div', { class: 'stats-label' }, 'BEST BY MODE'),
      barChart(modeBests.map(([id, v]) => [modeById(id).name, v, MODE_COLOR[id] ?? '#22d3ee'] as [string, number, string]), (n) => n.toLocaleString()),
    );
  }

  // NEMESIS — the bosses that end your runs most.
  const nem = (Object.entries(s.nemesis) as [string, number][])
    .filter(([k, n]) => n > 0 && BOSS_KINDS.includes(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (nem.length) {
    out.push(
      el('div', { class: 'stats-label' }, 'NEMESIS · who ends your runs'),
      barChart(nem.map(([k, n]) => [bossName(k as Enemy['kind']), n, BOSS_COLOR[k] ?? '#fb7185'] as [string, number, string]), (n) => `${n}✕`),
    );
  }

  // COMBAT · LIFETIME — the cumulative totals as a cell grid.
  const cell = (k: string, v: string) => el('div', { class: 'stat-cell' }, el('div', { class: 'stat-cell-v' }, v), el('div', { class: 'stat-cell-k' }, k));
  out.push(
    el('div', { class: 'stats-label' }, 'COMBAT · lifetime'),
    el('div', { class: 'stat-cells' },
      cell('Total Kills', s.lifeKills.toLocaleString()),
      cell('Bosses Felled', s.lifeBoss.toLocaleString()),
      cell('Shards Earned', s.lifeShards.toLocaleString()),
      cell('Runs Won', s.lifeWins.toLocaleString()),
    ),
  );

  // (The achievement GRID lives in the CODEX now — see panels/achievements.ts. STATS keeps the
  // completion donut in the hero above.)
  return out;
}
