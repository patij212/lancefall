// CODEX bestiary content — every enemy / elite / boss as a card. Extracted from ui.ts
// (the monolith split) and enriched to the v7 mock: a per-kind KILL COUNT chip (from the
// live save.killsByKind), a role tag, a per-category "discovered" tally, and a boss
// VANQUISHED / "at large" state + episode numeral. All data is real — kills come from the
// Phase-0 capture; role tags + boss lore are authored in bestiary.ts. Rendered each open
// so the counts stay current.

import { el } from './dom';
import { BESTIARY, CODEX_CATEGORIES } from '../bestiary';
import { sigilSvgMarkup } from '../cipherSigils';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

// The CIPHER teaching crib (mock): a fixed mark→letter legend that spells TURING — the
// thematic key behind the real per-seed cipher ("an ode to Alan Turing", see cipher.ts). Each
// mark is one of the designed cipher sigils (by index); the live boss cipher is a deterministic
// per-seed permutation, so this legend teaches HOW to read a mark, not the answer.
const CIPHER_CRIB: ReadonlyArray<readonly [string, number]> = [
  ['T', 4], ['U', 7], ['R', 5], ['I', 2], ['N', 8], ['G', 6],
];

/** The "READ THE KEY · THE CIPHER" explainer + 6-mark legend for the CODEX panel. */
export function renderCipherLegend(): HTMLElement {
  const box = el('div', { class: 'cipher-box' });
  box.append(
    el(
      'div',
      { class: 'cipher-explain' },
      'Each boss locks its core behind a substitution cipher. A crib is pre-lit; ',
      el('b', {}, 'derive the next mark'),
      " and dash the core wearing it to decrypt — a wrong dash strikes the mark from the legend. Break all six to read the Sovereign's last key.",
    ),
  );
  const legend = el('div', { class: 'cipher-legend' });
  for (const [letter, sigil] of CIPHER_CRIB) {
    const gl = el('div', { class: 'gl' });
    gl.innerHTML = sigilSvgMarkup(sigil, 'ckey-sig'); // static sigil SVG (no untrusted input)
    legend.append(
      el('div', { class: 'cipher-pair' }, gl, el('div', { class: 'ar' }, '↓'), el('div', { class: 'lt' }, letter)),
    );
  }
  box.append(legend);
  return box;
}

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
