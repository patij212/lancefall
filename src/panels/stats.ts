// STATS dossier content — the lifetime numbers + achievements grid. Extracted from ui.ts
// (the monolith split) and enriched to the v7 mock: a win-rate hero cell, a COMBAT·LIFETIME
// cell grid, achievement filter tabs (ALL / UNLOCKED / LOCKED), and the global rarity line
// ("X% of players have this") whenever the backend aggregate is available (else omitted).
//
// Returns an array of sections so the caller drops them straight into the scroll body
// (body.replaceChildren(...renderStats(...))) — no transparent wrapper box.

import { el, stat } from './dom';
import type { SaveData } from '../save';
import type { Enemy } from '../types';
import type { AchRarity } from '../api';
import { ACHIEVEMENTS } from '../achievements';
import { bossName } from '../boss';
import { modeById } from '../modes';

const BOSS_KINDS = ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'];
type AchFilter = 'all' | 'got' | 'lock';

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
function barChart(rows: [string, number][], accent: '' | 'mode-fill', fmt: (n: number) => string): HTMLElement {
  const max = Math.max(...rows.map((r) => r[1]));
  const wrap = el('div', { class: 'nem-bars' });
  for (const [k, n] of rows) {
    const fill = el('div', { class: 'nem-fill' + (accent ? ' ' + accent : '') });
    fill.style.width = `${Math.max(8, (n / max) * 100)}%`;
    wrap.append(
      el('div', { class: 'nem-row' + (accent === 'mode-fill' ? ' mode-row' : '') },
        el('div', { class: 'nem-k' }, k),
        el('div', { class: 'nem-track' }, fill),
        el('div', { class: 'nem-v' + (accent === 'mode-fill' ? ' mode-v' : '') }, fmt(n)),
      ),
    );
  }
  return wrap;
}

export function renderStats(s: SaveData, rarity: AchRarity | null): HTMLElement[] {
  const out: HTMLElement[] = [];
  const got = ACHIEVEMENTS.filter((a) => s.achievements.includes(a.id)).length;
  const total = ACHIEVEMENTS.length;

  // HERO — donut + top-line lifetime stats (now incl. WIN RATE = lifeWins / totalRuns).
  const winRate = s.totalRuns > 0 ? `${Math.round((s.lifeWins / s.totalRuns) * 100)}%` : '—';
  out.push(
    el('div', { class: 'stats-hero' },
      donutEl(got, total),
      el('div', { class: 'stats-hero-grid' },
        stat('high score', s.highScore.toLocaleString()),
        stat('best combo', `x${s.bestCombo}`),
        stat('runs', String(s.totalRuns)),
        stat('win rate', winRate),
      ),
    ),
  );

  // RECORDS — personal bests (all from existing SaveData).
  const rec = (k: string, v: string) => el('div', { class: 'rec' }, el('div', { class: 'rec-k' }, k), el('div', { class: 'rec-v' }, v));
  out.push(
    el('div', { class: 'stats-label' }, 'RECORDS'),
    el('div', { class: 'rec-grid' },
      rec('Deepest Wave', s.deepestWave > 0 ? String(s.deepestWave) : '—'),
      rec('Best Wave', s.bestWave > 0 ? String(s.bestWave) : '—'),
      rec('Highest Heat', s.maxHeat > 0 ? `H${s.maxHeat}` : 'OFF'),
      rec('Day Streak', s.playStreak > 0 ? `${s.playStreak}d` : '—'),
      rec('Bosses Down', String(s.lifeBoss)),
      rec('Shards Earned', s.lifeShards.toLocaleString()),
    ),
  );

  // BEST BY MODE — top SCORE per mode, real-mode-id filtered (no mislabel via the fallback).
  const modeBests = (Object.entries(s.bestByMode) as [string, number][])
    .filter(([id, v]) => v > 0 && modeById(id).id === id)
    .sort((a, b) => b[1] - a[1]);
  if (modeBests.length) {
    out.push(
      el('div', { class: 'stats-label' }, 'BEST BY MODE'),
      barChart(modeBests.map(([id, v]) => [modeById(id).name, v]), 'mode-fill', (n) => n.toLocaleString()),
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
      barChart(nem.map(([k, n]) => [bossName(k as Enemy['kind']), n]), '', (n) => `${n}✕`),
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

  // ACHIEVEMENTS — filter tabs (ALL / UNLOCKED / LOCKED) + grid. The grid re-renders in
  // place on a tab change; the rarity line shows only when the aggregate is loaded.
  out.push(el('div', { class: 'stats-label' }, `ACHIEVEMENTS · ${got}/${total}`));
  const tabs = el('div', { class: 'ach-filter' });
  const grid = el('div', { class: 'ach-grid' });
  let filter: AchFilter = 'all';
  const tabDefs: [AchFilter, string][] = [
    ['all', `ALL · ${total}`],
    ['got', `UNLOCKED · ${got}`],
    ['lock', `LOCKED · ${total - got}`],
  ];
  const rarLine = (id: string): HTMLElement | null => {
    if (!rarity || rarity.players <= 0) return null;
    const pct = ((rarity.holders[id] ?? 0) / rarity.players) * 100;
    const txt = pct >= 1 ? `${Math.round(pct)}%` : pct > 0 ? '<1%' : '0%';
    return el('div', { class: 'ach-rar' }, `${txt} of players have this`);
  };
  const renderGrid = () => {
    const list = ACHIEVEMENTS.filter((a) => {
      if (filter === 'all') return true;
      const g = s.achievements.includes(a.id);
      return filter === 'got' ? g : !g;
    });
    grid.replaceChildren(
      ...list.map((a) => {
        const g = s.achievements.includes(a.id);
        // mock: a horizontal card — trophy/lock glyph in its own icon cell, text column beside.
        const text = el('div', { class: 'ach-text' },
          el('div', { class: 'ach-name' }, a.name),
          el('div', { class: 'ach-desc' }, a.desc),
        );
        const r = rarLine(a.id);
        if (r) text.append(r);
        return el('div', { class: 'ach' + (g ? ' got' : '') },
          el('div', { class: 'ach-ico' }, g ? '🏆' : '🔒'),
          text,
        );
      }),
    );
  };
  const renderTabs = () => {
    tabs.replaceChildren(
      ...tabDefs.map(([f, lbl]) => {
        const b = el('button', { class: 'btn-sm' + (f === filter ? ' active' : '') }, lbl);
        b.addEventListener('click', () => {
          filter = f;
          renderTabs();
          renderGrid();
        });
        return b;
      }),
    );
  };
  renderTabs();
  renderGrid();
  out.push(tabs, grid);
  return out;
}
