// ACHIEVEMENTS browser — the filterable achievement grid (ALL / UNLOCKED / LOCKED / SKINS) plus
// the optional global rarity line ("X% of players have this"). Lives in the CODEX as its own tab
// (moved out of the STATS dossier, which keeps only the completion donut). Pure render: returns
// the section nodes + a `setRarity` updater the caller invokes when the async global-rarity
// aggregate resolves, morphing the rarity lines onto the existing cards in place (no reflash).

import { el, reconcile } from './dom';
import type { SaveData } from '../save';
import type { AchRarity } from '../api';
import { ACHIEVEMENTS } from '../achievements';

type AchFilter = 'all' | 'got' | 'lock' | 'skin';

export function renderAchievements(s: SaveData, rarity: AchRarity | null): { nodes: HTMLElement[]; setRarity: (r: AchRarity | null) => void } {
  let curRarity = rarity; // mutable so a late-arriving aggregate can morph the grid in place
  const got = ACHIEVEMENTS.filter((a) => s.achievements.includes(a.id)).length;
  const total = ACHIEVEMENTS.length;
  const skinTotal = ACHIEVEMENTS.filter((a) => a.category === 'skin').length;

  // filter tabs (ALL / UNLOCKED / LOCKED / SKINS) + grid. The grid re-renders in place on a tab
  // change; the rarity line shows only when the aggregate is loaded.
  const label = el('div', { class: 'stats-label' }, `ACHIEVEMENTS · ${got}/${total}`);
  const tabs = el('div', { class: 'ach-filter' });
  const grid = el('div', { class: 'ach-grid' });
  let filter: AchFilter = 'all';
  const tabDefs: [AchFilter, string][] = [
    ['all', `ALL · ${total}`],
    ['got', `UNLOCKED · ${got}`],
    ['lock', `LOCKED · ${total - got}`],
    ['skin', `SKINS · ${skinTotal}`],
  ];
  const rarLine = (id: string): HTMLElement | null => {
    if (!curRarity || curRarity.players <= 0) return null;
    const pct = ((curRarity.holders[id] ?? 0) / curRarity.players) * 100;
    const txt = pct >= 1 ? `${Math.round(pct)}%` : pct > 0 ? '<1%' : '0%';
    return el('div', { class: 'ach-rar' }, `${txt} of players have this`);
  };
  // grid morphs in place on a filter change: cards that stay visible keep their node (no flash);
  // filtered-out cards are removed, re-added on widening. Keyed by achievement id.
  const renderGrid = () => {
    const list = ACHIEVEMENTS.filter((a) => {
      if (filter === 'all') return true;
      if (filter === 'skin') return a.category === 'skin';
      const g = s.achievements.includes(a.id);
      return filter === 'got' ? g : !g;
    });
    reconcile(
      grid,
      list,
      (a) => a.id,
      (a) => el('div', { class: 'ach' },
        // mock: a horizontal card — trophy/lock glyph in its own icon cell, text column beside.
        el('div', { class: 'ach-ico' }),
        el('div', { class: 'ach-text' }, el('div', { class: 'ach-name' }, a.name), el('div', { class: 'ach-desc' }, a.desc)),
      ),
      (node, a) => {
        const g = s.achievements.includes(a.id);
        node.className = 'ach' + (g ? ' got' : '');
        (node.querySelector('.ach-ico') as HTMLElement).textContent = g ? '🏆' : '🔒';
        // rarity line — add/refresh/remove in place as the aggregate becomes available.
        const text = node.querySelector('.ach-text') as HTMLElement;
        let rar = text.querySelector('.ach-rar') as HTMLElement | null;
        const r = rarLine(a.id);
        if (r) {
          if (!rar) { rar = el('div', { class: 'ach-rar' }); text.append(rar); }
          rar.textContent = r.textContent;
        } else if (rar) {
          rar.remove();
        }
      },
    );
  };
  // tabs built once; a click toggles .active in place (no rebuild) and re-filters the grid.
  const tabButtons = tabDefs.map(([f, lbl]) => {
    const b = el('button', { class: 'btn-sm', type: 'button' }, lbl);
    b.addEventListener('click', () => { filter = f; syncTabs(); renderGrid(); });
    return b;
  });
  const syncTabs = () => tabButtons.forEach((b, i) => b.classList.toggle('active', tabDefs[i][0] === filter));
  tabs.append(...tabButtons);
  syncTabs();
  renderGrid();
  // when the aggregate arrives, update the closure rarity + re-run the (reconciling) grid so the
  // per-card rarity lines morph in.
  const setRarity = (r: AchRarity | null): void => { curRarity = r; renderGrid(); };
  return { nodes: [label, tabs, grid], setRarity };
}
