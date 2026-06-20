// HEAT — the ascension-ladder modal. Extracted from ui.ts: a score-multiplier curve + a card per
// Heat level, with HEAT 0 doubling as a legend of what the ladder modifies. The shell is built
// once; `open(save)` repaints the curve + cards for the save's selected level. Selecting a level
// just calls back to the host (which persists it and re-opens) — the panel stays presentational.

import { el } from './dom';
import { HEAT_LEVELS } from '../heat';
import type { SaveData } from '../save';
import type { Panel } from './panel';
import { vigilHeatFloor } from '../cityVoice';

/** What the HEAT ladder needs from its host UI. */
export interface HeatPanelDeps {
  /** commit the chosen Heat level — the host persists it and repaints the loadout. */
  onSelect: (level: number) => void;
  /** dismiss the modal (the DONE button). */
  onClose: () => void;
}

const HEAT_ICON =
  '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3c2.2 3 4 5.2 4 8.2a4 4 0 0 1-8 0c0-1.1.4-2.1 1.1-3 .3 1 .9 1.6 1.7 1.7C12.2 8.8 11 6 12 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';

// the six dials Heat turns up — shown on the HEAT 0 / COLD card as a legend (mode-agnostic).
const HEAT_DIMS: [string, string][] = [
  ['SPEED', 'Enemies & bullets move faster'],
  ['DENSITY', 'More enemies on screen'],
  ['BOSSES', 'Bosses arrive sooner'],
  ['REVIVES', 'Fewer second-wind revives'],
  ['ARMOR', 'Fewer shield pips — each soaks one lethal hit'],
  ['GRAZE', 'Tighter near-miss reward window'],
];

export function buildHeatPanel(deps: HeatPanelDeps): Panel {
  // ── shell (built once) ──
  const icon = el('div', { class: 'panel-head-icon' });
  icon.innerHTML = HEAT_ICON;
  const head = el('div', { class: 'panel-head' }, icon, el('div', { class: 'panel-head-titles' }, el('div', { class: 'panel-eyebrow' }, 'ASCENSION LADDER'), el('h2', { class: 'panel-head-title' }, 'HEAT')));
  const lead = el('p', { class: 'panel-lead' }, 'An optional ascension ladder — more pressure, more score. Heat 0 is free and fair; the rest is the veteran’s chase. Score multiplier by level →');
  const curve = el('div', { class: 'heat-mult' });
  curve.id = 'heat-curve';
  const grid = el('div', { class: 'p-grid cols2' });
  grid.id = 'heat-grid';
  const close = el('button', { class: 'btn btn-primary' }, 'DONE');
  close.addEventListener('click', () => deps.onClose());
  const body = el('div', { class: 'heat-body' }, lead, curve, grid, close);
  const root = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, el('div', { class: 'panel panel-wide' }, head, body));

  const open = (save: SaveData): void => {
    const floor = vigilHeatFloor(save);
    const maxMul = HEAT_LEVELS[HEAT_LEVELS.length - 1].scoreMul;
    // score-multiplier CURVE (mock .heat-mult) — difficulty → reward at a glance; selected lit.
    curve.replaceChildren();
    for (const lvl of HEAT_LEVELS) {
      const bar = el('div', { class: 'heat-mult-bar' + (save.selectedHeat === lvl.level ? ' on' : '') });
      bar.style.height = `${Math.round((lvl.scoreMul / maxMul) * 100)}%`;
      bar.style.background = lvl.accent;
      bar.style.color = lvl.accent;
      bar.title = `H${lvl.level} ${lvl.name} — ×${lvl.scoreMul.toFixed(2)} score`;
      curve.append(bar);
    }
    grid.replaceChildren();
    for (const lvl of HEAT_LEVELS) {
      const selected = save.selectedHeat === lvl.level;
      const hx = lvl.accent.replace('#', '');
      const n = parseInt(hx.length === 3 ? hx.split('').map((c) => c + c).join('') : hx, 16);
      const card = el('button', { class: 'p-card heat-pcard' + (selected ? ' sel' : ''), type: 'button' });
      card.style.setProperty('--ca', lvl.accent);
      card.style.setProperty('--ca-rgb', `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`);
      const dot = el('span', { class: 'p-dot' });
      dot.style.background = lvl.accent;
      dot.style.color = lvl.accent;
      const mult = el('span', { class: 'heat-card-mult' }, `×${lvl.scoreMul.toFixed(2)}`);
      const top = el('div', { class: 'p-card-top' }, dot, el('div', { class: 'p-card-name' }, `HEAT ${lvl.level} · ${lvl.name}`), mult);
      if (lvl.level === 0) {
        // HEAT 0 has no modifiers, so it spends that slot as the LEGEND: WHAT the ladder turns up
        // (the other cards show by HOW MUCH). Spans both columns to read as a banner, not a stub.
        card.style.gridColumn = '1 / -1';
        const legend = el('div', { class: 'heat-legend' });
        for (const [k, meaning] of HEAT_DIMS) {
          legend.append(el('div', { class: 'heat-legend-row' }, el('span', { class: 'heat-legend-k' }, k), el('span', { class: 'heat-legend-d' }, meaning)));
        }
        card.append(
          top,
          el('div', { class: 'p-card-desc' }, 'The baseline — every dial at standard. Raising Heat trades safety for more score & shards. What each level turns up:'),
          legend,
          el('div', { class: 'heat-legend-foot' }, 'Same modifiers in every mode — they stack on top of that mode’s own rules.'),
        );
      } else {
        // k/v modifier grid — the mechanical cost behind the prose (mock .heat-mods).
        const mods: [string, string][] = [];
        if (lvl.enemySpeedAdd > 0) mods.push(['SPEED', `+${Math.round(lvl.enemySpeedAdd * 100)}%`]);
        if (lvl.spawnMulMod < 1) mods.push(['DENSITY', `+${Math.round((1 - lvl.spawnMulMod) * 100)}%`]);
        if (lvl.bossIntervalMod < 1) mods.push(['BOSSES', `+${Math.round((1 - lvl.bossIntervalMod) * 100)}%`]);
        if (lvl.revivesLost > 0) mods.push(['REVIVES', `−${lvl.revivesLost}`]);
        if (lvl.shieldsLost > 0) mods.push(['ARMOR', `−${lvl.shieldsLost}`]);
        if (lvl.grazeRadiusMod < 1) mods.push(['GRAZE', `−${Math.round((1 - lvl.grazeRadiusMod) * 100)}%`]);
        const modGrid = el('div', { class: 'heat-mods' });
        modGrid.style.gridTemplateColumns = `repeat(${Math.min(3, mods.length)}, 1fr)`;
        for (const [k, v] of mods) {
          modGrid.append(el('div', { class: 'heat-mod' }, el('div', { class: 'k' }, k), el('div', { class: 'v bad' }, v)));
        }
        card.append(top, el('div', { class: 'p-card-desc' }, lvl.desc), modGrid);
      }
      // THE VIGIL'S WEIGHT — levels below the floor are locked (the vigil demands the dark)
      if (lvl.level < floor) {
        card.disabled = true;
        card.title = `the vigil holds the floor at HEAT ${floor}`;
        card.classList.add('vigil-locked');
      } else {
        card.addEventListener('click', () => deps.onSelect(lvl.level));
      }
      grid.append(card);
    }
  };

  return { root, open };
}
