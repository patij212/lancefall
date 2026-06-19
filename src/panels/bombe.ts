// THE BOMBE — the cockpit codebreaker console. Decrypt the intercepts word-by-word (a word cracked
// here resolves across every transmission), watch the MASTER CIPHER resolve grey→neon, build the
// Bombe to crack faster, and solve optional cryptanalysis puzzles. Self-contained panel: the shell
// is built once; open(save) reconciles the meter + lists. All logic lives in intercepts.ts/bombe.ts
// — the panel only renders + calls back (the host persists + re-opens, like the codex memories).

import { el, reconcile } from './dom';
import type { Panel } from './panel';
import type { SaveData } from '../save';
import {
  INTERCEPTS, interceptProgress, isInterceptComplete, masterProgress, nextWordInIntercept, tokenView, wordCost,
} from '../intercepts';
import { CONSOLE_PUZZLES, BOMBE_MAX_LEVEL, upgradeBombeCost, bombeAutoCracks, bombeCostMul } from '../bombe';
import { fragmentBalance } from '../lore';

/** What THE BOMBE console needs from its host UI (the host persists + re-opens). */
export interface BombePanelDeps {
  /** decrypt the cheapest undecrypted word of an intercept (spend Fragments). */
  onDecrypt: (interceptId: string) => void;
  /** build / upgrade the Bombe meta-tool (spend Fragments). */
  onUpgradeBombe: () => void;
  /** submit a console-puzzle answer. */
  onSolvePuzzle: (puzzleId: string, guess: string) => void;
  /** dismiss the modal. */
  onClose: () => void;
}

export function buildBombePanel(deps: BombePanelDeps): Panel {
  // ── shell (built once) ──
  const head = el('div', { class: 'panel-head' }, el('div', { class: 'panel-head-titles' },
    el('div', { class: 'panel-eyebrow' }, 'CODEBREAKER'), el('h2', { class: 'panel-head-title' }, 'THE BOMBE')));
  const lead = el('p', { class: 'panel-lead' },
    'The intercepts of the fall, enciphered. Spend Memory Fragments to decrypt them word by word — a word cracked here resolves across every transmission. Build the Bombe to crack faster.');

  const masterBar = el('div', { class: 'bombe-master-fill' });
  const masterLabel = el('div', { class: 'bombe-master-label' });
  const master = el('div', { class: 'bombe-master' }, masterLabel, el('div', { class: 'bombe-master-track' }, masterBar));

  const fragLine = el('div', { class: 'bombe-frag' });
  const bombeStatus = el('div', { class: 'bombe-status' });
  const bombeBtn = el('button', { class: 'btn btn-sm bombe-upgrade' }, 'BUILD THE BOMBE');
  bombeBtn.addEventListener('click', () => deps.onUpgradeBombe());
  const statusRow = el('div', { class: 'bombe-statusrow' }, fragLine, bombeStatus, bombeBtn);

  const listLabel = el('div', { class: 'stats-label' }, 'INTERCEPTS');
  const list = el('div', { class: 'bombe-list' });
  const pzLabel = el('div', { class: 'stats-label' }, 'CONSOLE — CRYPTANALYSIS');
  const puzzles = el('div', { class: 'bombe-puzzles' });

  const close = el('button', { class: 'btn btn-primary' }, 'DONE');
  close.addEventListener('click', () => deps.onClose());

  const body = el('div', { class: 'bombe-body' }, lead, master, statusRow, listLabel, list, pzLabel, puzzles, close);
  const root = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, el('div', { class: 'panel panel-wide' }, head, body));

  const open = (save: SaveData): void => {
    const bal = fragmentBalance(save);

    // ── master cipher meter (the longest-day progress) ──
    const mp = masterProgress(save);
    const pct = Math.round(mp.frac * 100);
    masterBar.style.width = `${pct}%`;
    masterBar.className = 'bombe-master-fill' + (pct >= 100 ? ' done' : '');
    masterLabel.textContent = `MASTER CIPHER — ${pct}% decrypted · ${mp.done}/${mp.total} words`;

    // ── Bombe status + upgrade ──
    fragLine.textContent = `◆ ${bal} Fragment${bal === 1 ? '' : 's'}`;
    const lvl = save.bombeLevel;
    bombeStatus.textContent = lvl <= 0
      ? 'THE BOMBE — not yet built'
      : `THE BOMBE — Lv ${lvl}/${BOMBE_MAX_LEVEL} · −${Math.round((1 - bombeCostMul(lvl)) * 100)}% cost · ${bombeAutoCracks(lvl)} free crack${bombeAutoCracks(lvl) === 1 ? '' : 's'}/run`;
    if (lvl >= BOMBE_MAX_LEVEL) {
      bombeBtn.classList.add('hidden');
    } else {
      bombeBtn.classList.remove('hidden');
      const cost = upgradeBombeCost(lvl);
      bombeBtn.textContent = `${lvl <= 0 ? 'BUILD' : 'UPGRADE'} THE BOMBE ◆${cost}`;
      bombeBtn.className = 'btn btn-sm bombe-upgrade' + (bal >= cost ? ' btn-primary' : '');
      bombeBtn.disabled = bal < cost;
    }

    // ── intercept cards (reconciled — morph in place on decrypt; the click closes over the
    //    immutable intercept id, like the codex memories do) ──
    reconcile(
      list,
      INTERCEPTS,
      (ic) => ic.id,
      (ic) => {
        const card = el('div', { class: 'bombe-intercept' },
          el('div', { class: 'bombe-ic-head' }, el('span', { class: 'bombe-ic-title' }), el('span', { class: 'bombe-ic-prog' })),
          el('div', { class: 'bombe-ic-text' }),
          el('button', { class: 'btn btn-sm bombe-decrypt' }, 'DECRYPT'),
        );
        (card.querySelector('.bombe-decrypt') as HTMLButtonElement).addEventListener('click', () => deps.onDecrypt(ic.id));
        return card;
      },
      (card, ic) => {
        const prog = interceptProgress(save, ic);
        const done = isInterceptComplete(save, ic);
        card.className = 'bombe-intercept' + (done ? ' done' : '');
        (card.querySelector('.bombe-ic-title') as HTMLElement).textContent = ic.title;
        (card.querySelector('.bombe-ic-prog') as HTMLElement).textContent = done ? '✓ decrypted' : `${prog.done}/${prog.total}`;
        const text = card.querySelector('.bombe-ic-text') as HTMLElement;
        text.replaceChildren(
          ...ic.tokens.map((t) => {
            const tv = tokenView(save, t);
            return el('span', { class: 'bombe-tok' + (tv.decrypted ? '' : ' enc') }, tv.text + ' ');
          }),
        );
        const btn = card.querySelector('.bombe-decrypt') as HTMLButtonElement;
        const next = nextWordInIntercept(save, ic);
        if (!next) {
          btn.classList.add('hidden');
        } else {
          btn.classList.remove('hidden');
          const cost = Math.max(1, Math.round(wordCost(next) * bombeCostMul(lvl)));
          btn.textContent = `DECRYPT ◆${cost}`;
          btn.className = 'btn btn-sm bombe-decrypt' + (bal >= cost ? ' btn-primary' : '');
          btn.disabled = bal < cost;
        }
      },
    );

    // ── console puzzles (reconciled) ──
    reconcile(
      puzzles,
      CONSOLE_PUZZLES,
      (p) => p.id,
      (p) => {
        const input = el('input', { class: 'bombe-pz-input', type: 'text', placeholder: 'decode…', 'aria-label': 'puzzle answer' });
        const btn = el('button', { class: 'btn btn-sm bombe-pz-btn' }, 'SOLVE');
        const card = el('div', { class: 'bombe-puzzle' },
          el('div', { class: 'bombe-pz-prompt' }),
          el('div', { class: 'bombe-pz-hint' }),
          el('div', { class: 'bombe-pz-solve' }, input, btn),
          el('div', { class: 'bombe-pz-done' }),
        );
        btn.addEventListener('click', () => deps.onSolvePuzzle(p.id, input.value));
        return card;
      },
      (card, p) => {
        const solved = save.solvedPuzzles.includes(p.id);
        card.className = 'bombe-puzzle' + (solved ? ' done' : '');
        (card.querySelector('.bombe-pz-prompt') as HTMLElement).textContent = p.prompt;
        (card.querySelector('.bombe-pz-hint') as HTMLElement).textContent = p.hint;
        (card.querySelector('.bombe-pz-solve') as HTMLElement).classList.toggle('hidden', solved);
        (card.querySelector('.bombe-pz-done') as HTMLElement).textContent = solved ? `✓ SOLVED — ${p.reward}` : '';
      },
    );
  };

  return { root, open };
}
