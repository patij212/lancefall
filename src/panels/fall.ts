// THE FALL — "THE SIX WHO LET IT FALL" timeline. Each of the six bosses as a numbered
// episode (numeral · name · epithet · their confession), sourced straight from the boss
// CODEX entries (name = "THE X · Epithet"; the quote is the curly/straight-quoted clause
// in the blurb). No new content authored — it re-presents what's already canon.

import { el } from './dom';
import { BESTIARY } from '../bestiary';
import type { SaveData } from '../save';
import { CITIZENS, isCitizenWoken } from '../citizens';
import { sixthReveal, daysHeld } from '../ending';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

export function renderTheSix(): HTMLElement {
  const tl = el('div', { class: 'tl' });
  BESTIARY.filter((b) => b.cat === 'boss').forEach((b, i) => {
    const [name, epithet] = b.name.split('·').map((s) => s.trim());
    const m = b.blurb.match(/[""]([^""]+)[""]/); // first "…" / "…" clause
    const item = el('div', { class: 'tl-item' });
    item.style.setProperty('--accent', b.accent);
    item.append(
      el('div', { class: 'tl-dot' }),
      el('div', { class: 'tl-num' }, ROMAN[i] ?? String(i + 1)),
      el('div', { class: 'tl-name' }, name),
      el('div', { class: 'tl-ep' }, epithet ?? ''),
    );
    if (m) item.append(el('div', { class: 'tl-quote' }, `"${m[1]}"`));
    tl.append(item);
  });
  return tl;
}

/** YOUR LANCEFALL — the player's permanent, revisitable record of THE CHOICE. */
export function renderYourLancefall(save: SaveData): HTMLElement {
  const box = el('div', { class: 'your-lancefall' });
  const woke = CITIZENS.filter((c) => isCitizenWoken(save, c)).length;
  if (save.stillpointChoice === 'none') {
    box.append(el('div', { class: 'yl-pending' }, 'The last word is unread. Descend, fell the Sovereign, and choose.'));
    return box;
  }
  const held = save.released
    ? 'You held the light, then let the day turn. It is finished.'
    : save.stillpointChoice === 'fall'
      ? 'You let the day turn. It is finished.' // chose to let it go at the kill — never held
      : `You hold the longest day. Day held: ${daysHeld(save)}.`;
  const verb = save.stillpointChoice === 'catch' && !save.released ? 'YOU HOLD THE LIGHT' : 'YOU LET IT GO';
  box.append(
    el('div', { class: 'yl-verb' }, verb),
    el('div', { class: 'yl-line' }, held),
    el('div', { class: 'yl-meta' }, `Chosen ${save.choiceDate || '—'} · ${woke}/16 remembered`),
  );
  return box;
}

/** THE SIXTH — the accreting confession list (one per woken citizen). */
export function renderTheSixth(save: SaveData): HTMLElement {
  const box = el('div', { class: 'the-sixth' });
  const r = sixthReveal(save);
  box.append(el('div', { class: 'sixth-thesis' }, r.thesis));
  if (r.faces.length) {
    const list = el('div', { class: 'sixth-list' });
    for (const f of r.faces) list.append(el('div', { class: 'sixth-row' }, el('b', {}, f.name), ' — ' + f.line));
    box.append(list);
  }
  if (r.unwokenPull) box.append(el('div', { class: 'sixth-pull' }, r.unwokenPull));
  if (r.deepest) box.append(el('div', { class: 'sixth-deepest' }, r.deepest));
  return box;
}
