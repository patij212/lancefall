// THE FALL — "THE SIX WHO LET IT FALL" timeline. Each of the six bosses as a numbered
// episode (numeral · name · epithet · their confession), sourced straight from the boss
// CODEX entries (name = "THE X · Epithet"; the quote is the curly/straight-quoted clause
// in the blurb). No new content authored — it re-presents what's already canon.

import { el } from './dom';
import { BESTIARY } from '../bestiary';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

export function renderTheSix(): HTMLElement {
  const tl = el('div', { class: 'tl' });
  BESTIARY.filter((b) => b.cat === 'boss').forEach((b, i) => {
    const [name, epithet] = b.name.split('·').map((s) => s.trim());
    const m = b.blurb.match(/[“"]([^”"]+)[”"]/); // first “…” / "…" clause
    const item = el('div', { class: 'tl-item' });
    item.style.setProperty('--accent', b.accent);
    item.append(
      el('div', { class: 'tl-dot' }),
      el('div', { class: 'tl-num' }, ROMAN[i] ?? String(i + 1)),
      el('div', { class: 'tl-name' }, name),
      el('div', { class: 'tl-ep' }, epithet ?? ''),
    );
    if (m) item.append(el('div', { class: 'tl-quote' }, `“${m[1]}”`));
    tl.append(item);
  });
  return tl;
}
