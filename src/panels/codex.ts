// CODEX bestiary content — every enemy / elite / boss as a card. Extracted from ui.ts
// (the monolith split) and enriched to the v7 mock: a per-kind KILL COUNT chip (from the
// live save.killsByKind), a role tag, a per-category "discovered" tally, and a boss
// VANQUISHED / "at large" state + episode numeral. All data is real — kills come from the
// Phase-0 capture; role tags + boss lore are authored in bestiary.ts. Rendered each open
// so the counts stay current.

import { el } from './dom';
import { BESTIARY, CODEX_CATEGORIES } from '../bestiary';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

export function renderBestiary(kills: Record<string, number>): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const { cat, label } of CODEX_CATEGORIES) {
    const entries = BESTIARY.filter((x) => x.cat === cat);
    // ELITES are champion VARIANTS of base kinds (no own kill key), so a "discovered"
    // fraction would always read 0/1 — show the plain label for that category only.
    const showCount = cat !== 'special';
    const discovered = entries.filter((e) => (kills[e.id] ?? 0) > 0).length;
    out.push(el('div', { class: 'stats-label' }, showCount ? `${label} · ${discovered}/${entries.length} discovered` : label));

    const grid = el('div', { class: 'codex-grid' });
    let bossN = 0;
    for (const e of entries) {
      const n = kills[e.id] ?? 0;
      const card = el('div', { class: 'codex-entry' });
      card.style.setProperty('--accent', e.accent);

      const top = el('div', { class: 'codex-top' });
      if (cat === 'boss') {
        bossN++;
        top.append(el('span', { class: 'codex-roman' }, ROMAN[bossN - 1] ?? String(bossN)));
      }
      top.append(el('div', { class: 'codex-name' }, e.name));
      if (cat === 'boss') {
        top.append(el('span', { class: 'codex-chip' + (n > 0 ? ' vanquished' : '') }, n > 0 ? '✓ VANQUISHED' : '— at large —'));
      } else if (n > 0) {
        top.append(el('span', { class: 'codex-chip' }, `${n.toLocaleString()} ✕`));
      }
      card.append(top);

      if (e.role) card.append(el('span', { class: 'codex-role' }, e.role));
      card.append(el('div', { class: 'codex-blurb' }, e.blurb));
      grid.append(card);
    }
    out.push(grid);
  }
  return out;
}
