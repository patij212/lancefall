// CREDITS — audio attribution (CC BY 3.0 requires visible credit). Static content built once;
// extracted from ui.ts. Returns the modal root directly (no per-open render — nothing changes).

import { el } from './dom';
import { audioCredits } from '../audioManifest';

export function buildCreditsPanel(onClose: () => void): HTMLElement {
  const c = audioCredits();
  const h = el('h2', {}, 'CREDITS');
  const body = el('div', { class: 'howto-body' });
  body.append(el('div', { class: 'howto-rule' }, el('b', {}, 'CREATED BY'), el('span', {}, 'patij212')));
  body.append(el('div', { class: 'howto-rule' }, el('b', {}, '♪ MUSIC'), el('span', {}, 'free-licensed, used under Creative Commons')));
  for (const line of c.music) body.append(el('div', { class: 'credit-line' }, line));
  body.append(el('div', { class: 'howto-rule' }, el('b', {}, 'SOUND'), el('span', {}, '')));
  for (const line of c.sfx) body.append(el('div', { class: 'credit-line' }, line));
  body.append(el('div', { class: 'credit-foot' }, 'The recurring LANCE THEME melody + the procedural reactive layer are original to LANCEFALL.'));
  body.append(el('div', { class: 'credit-foot credit-dedication' }, 'Made for the June Solstice Game Jam — an ode to Alan Turing (1912–1954): code-breaking, algorithms, and the machine that learned to think. Every cipher here is a small tribute.'));
  const close = el('button', { class: 'btn btn-primary' }, 'DONE');
  close.addEventListener('click', onClose);
  return el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, el('div', { class: 'panel panel-wide' }, h, body, close));
}
