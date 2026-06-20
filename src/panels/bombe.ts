// THE BOMBE — the cockpit codebreaker console. Decrypt the intercepts word-by-word (a word cracked
// here resolves across every transmission), watch the MASTER CIPHER resolve grey→neon, build the
// Bombe to crack faster, and solve optional cryptanalysis puzzles. Self-contained panel: the shell
// is built once; open(save, opts) reconciles the meter + lists and plays the decrypt JUICE (the
// just-cracked word flashes resolved across EVERY visible transmission — the cross-intercept reveal,
// seen). All logic lives in intercepts.ts/bombe.ts — the panel only renders + calls back (the host
// persists + re-opens, like the codex memories). A11y: the flash is skipped under reduce-motion
// (a held resolved frame) and softened to a fade under reduce-flashing (no strobe).

import { el, reconcile } from './dom';
import type { Panel } from './panel';
import type { SaveData } from '../save';
import {
  INTERCEPTS, interceptProgress, isInterceptComplete, masterProgress, nextWordInIntercept, tokenView, wordCost, wordRarity,
} from '../intercepts';
import { CONSOLE_PUZZLES, BOMBE_MAX_LEVEL, upgradeBombeCost, bombeAutoCracks, bombeCostMul } from '../bombe';
import { fragmentBalance } from '../lore';
import { dailyCipher, letterFrequency } from '../dailyCipher';
import { seedFromDate, dateString } from '../rng';

/** What THE BOMBE console needs from its host UI (the host persists + re-opens). */
export interface BombePanelDeps {
  /** decrypt the cheapest undecrypted word of an intercept (spend Fragments). */
  onDecrypt: (interceptId: string) => void;
  /** build / upgrade the Bombe meta-tool (spend Fragments). */
  onUpgradeBombe: () => void;
  /** submit a console-puzzle answer. */
  onSolvePuzzle: (puzzleId: string, guess: string) => void;
  /** submit a daily-cipher guess. */
  onSolveDailyCipher: (guess: string) => void;
  /** copy the daily-cipher solved share string to clipboard. */
  onShareDailyCipher: () => void;
  /** dismiss the modal. */
  onClose: () => void;
}

/** Extra context for an open: the just-cracked word (to ripple the cross-reveal) + the words the
 *  Bombe cracked overnight (to surface the "it ran while you were out" payoff once). */
export interface BombeOpenOpts {
  justDecrypted?: string;
  overnight?: string[];
}

/** The richer Panel this factory returns — open() takes the extra juice context. */
export interface BombePanel extends Panel {
  open(save: SaveData, opts?: BombeOpenOpts): void;
}

const FLASH_MS = 900; // how long the cross-reveal flash class lingers before it's cleared

function reduceMotion(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion');
}

export function buildBombePanel(deps: BombePanelDeps): BombePanel {
  // ── shell (built once) ──
  const head = el('div', { class: 'panel-head' }, el('div', { class: 'panel-head-titles' },
    el('div', { class: 'panel-eyebrow' }, 'CODEBREAKER'), el('h2', { class: 'panel-head-title' }, 'THE BOMBE')));
  const lead = el('p', { class: 'panel-lead' },
    'The intercepts of the fall, enciphered. Spend Memory Fragments to decrypt them word by word — a word cracked here resolves across every transmission. Build the Bombe to crack faster.');

  // a one-time "the Bombe ran overnight" banner (shown only when opts.overnight is handed in)
  const overnight = el('div', { class: 'bombe-overnight hidden', role: 'status' });

  const masterBar = el('div', { class: 'bombe-master-fill' });
  const masterLabel = el('div', { class: 'bombe-master-label' });
  const master = el('div', { class: 'bombe-master' }, masterLabel, el('div', { class: 'bombe-master-track' }, masterBar));

  const fragLine = el('div', { class: 'bombe-frag' });
  const bombeStatus = el('div', { class: 'bombe-status' });
  // a little working-machine motif — rotor drums that spin while the Bombe runs (CSS; held under reduce-motion)
  const machine = el('div', { class: 'bombe-machine', 'aria-hidden': 'true' },
    el('span', { class: 'bombe-drum' }), el('span', { class: 'bombe-drum' }), el('span', { class: 'bombe-drum' }));
  const bombeBtn = el('button', { class: 'btn btn-sm bombe-upgrade' }, 'BUILD THE BOMBE');
  bombeBtn.addEventListener('click', () => deps.onUpgradeBombe());
  const statusRow = el('div', { class: 'bombe-statusrow' }, machine, el('div', { class: 'bombe-statuscol' }, fragLine, bombeStatus), bombeBtn);

  const listLabel = el('div', { class: 'stats-label' }, 'INTERCEPTS');
  const list = el('div', { class: 'bombe-list' });

  // ── DAILY CIPHER block (built once; reconciled in open()) ──
  const dailyLabel = el('div', { class: 'stats-label' }, 'DAILY CIPHER');
  const dailyPrompt = el('div', { class: 'bombe-daily-prompt' });
  const dailyHint = el('div', { class: 'bombe-pz-hint' });
  const dailyFreq = el('div', { class: 'bombe-freq' });
  const dailyInput = el('input', { class: 'bombe-pz-input bombe-daily-input', type: 'text', placeholder: 'decode…', 'aria-label': 'daily cipher answer' });
  const dailySolveBtn = el('button', { class: 'btn btn-sm bombe-pz-btn' }, 'SOLVE');
  const dailySolveRow = el('div', { class: 'bombe-pz-solve' }, dailyInput, dailySolveBtn);
  const dailyDone = el('div', { class: 'bombe-pz-done' });
  const dailyShareBtn = el('button', { class: 'btn btn-sm bombe-daily-share hidden' }, 'SHARE');
  const daily = el('div', { class: 'bombe-daily' }, dailyPrompt, dailyHint, dailyFreq, dailySolveRow, dailyDone, dailyShareBtn);
  const submitDaily = () => deps.onSolveDailyCipher(dailyInput.value);
  dailySolveBtn.addEventListener('click', submitDaily);
  dailyInput.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') submitDaily(); });
  dailyShareBtn.addEventListener('click', () => deps.onShareDailyCipher());

  const pzLabel = el('div', { class: 'stats-label' }, 'CONSOLE — CRYPTANALYSIS');
  const puzzles = el('div', { class: 'bombe-puzzles' });

  const close = el('button', { class: 'btn btn-primary' }, 'DONE');
  close.addEventListener('click', () => deps.onClose());

  const body = el('div', { class: 'bombe-body' }, lead, overnight, master, statusRow, listLabel, list, dailyLabel, daily, pzLabel, puzzles, close);
  const root = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, el('div', { class: 'panel panel-wide' }, head, body));

  /** Ripple the cross-reveal: flash EVERY token of the just-cracked word across all transmissions,
   *  so the player SEES that one decrypt resolved the word everywhere (you built a piece of the key).
   *  Skipped under reduce-motion (the tokens are already shown resolved — a held frame). */
  const rippleCrossReveal = (word: string | undefined): void => {
    if (!word || reduceMotion()) return;
    const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(word) : word.replace(/["\\]/g, '\\$&');
    const toks = list.querySelectorAll<HTMLElement>(`.bombe-tok[data-word="${esc}"]`);
    toks.forEach((t, i) => {
      // a tiny per-token stagger so the reveal sweeps across the message (capped so it never drags)
      const delay = Math.min(i * 40, 320);
      t.style.setProperty('--flash-delay', `${delay}ms`);
      t.classList.remove('just');
      // force a reflow so re-adding the class restarts the animation
      void t.offsetWidth;
      t.classList.add('just');
      window.setTimeout(() => t.classList.remove('just'), FLASH_MS + delay);
    });
  };

  const open = (save: SaveData, opts: BombeOpenOpts = {}): void => {
    const bal = fragmentBalance(save);

    // ── the overnight readout (the Bombe "ran while you were out") ──
    const ov = opts.overnight ?? [];
    overnight.classList.toggle('hidden', ov.length === 0);
    if (ov.length) {
      overnight.textContent = `⚙ THE BOMBE ran overnight — cracked ${ov.length} word${ov.length === 1 ? '' : 's'}: ${ov.join(', ')}`;
    }

    // ── master cipher meter (the longest-day progress) ──
    const mp = masterProgress(save);
    const pct = Math.round(mp.frac * 100);
    masterBar.style.width = `${pct}%`;
    masterBar.className = 'bombe-master-fill' + (pct >= 100 ? ' done' : '');
    masterLabel.textContent = pct >= 100
      ? `MASTER CIPHER — 100% · THE LONGEST DAY · ${mp.done}/${mp.total} words`
      : `MASTER CIPHER — ${pct}% decrypted · ${mp.done}/${mp.total} words`;

    // ── Bombe status + upgrade + the working-machine motif ──
    fragLine.textContent = `◆ ${bal} Fragment${bal === 1 ? '' : 's'}`;
    const lvl = save.bombeLevel;
    bombeStatus.textContent = lvl <= 0
      ? 'THE BOMBE — not yet built'
      : `THE BOMBE — Lv ${lvl}/${BOMBE_MAX_LEVEL} · −${Math.round((1 - bombeCostMul(lvl)) * 100)}% cost · ${bombeAutoCracks(lvl)} free crack${bombeAutoCracks(lvl) === 1 ? '' : 's'}/run`;
    machine.className = 'bombe-machine' + (lvl > 0 ? ' running' : '');
    machine.style.setProperty('--lvl', String(lvl));
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
            // rarity tints the glyphs so the load-bearing names/verbs read as worth cracking
            const rar = tv.word ? wordRarity(tv.word) : 'common';
            const cls = 'bombe-tok' + (tv.decrypted ? '' : ' enc') + (rar !== 'common' ? ` r-${rar}` : '');
            const span = el('span', { class: cls }, tv.text + ' ');
            if (tv.word) span.setAttribute('data-word', tv.word);
            return span;
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

    // ── DAILY CIPHER — today's cryptogram; solved state persists in save.solvedDailyCiphers ──
    {
      const daySeed = seedFromDate();
      const dc = dailyCipher(daySeed);
      const today = dateString();
      const isSolved = save.solvedDailyCiphers.includes(today);

      dailyPrompt.textContent = dc.prompt;
      dailyHint.textContent = dc.hint;

      // compact letter-frequency strip (top letters by count)
      const freq = letterFrequency(dc.prompt);
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
      dailyFreq.replaceChildren(
        ...sorted.map(([letter, count]) => {
          const cell = el('div', { class: 'bombe-freq-cell' });
          const lEl = el('span', { class: 'bombe-freq-letter' }, letter.toUpperCase());
          const cEl = el('span', { class: 'bombe-freq-count' }, String(count));
          cell.append(lEl, cEl);
          return cell;
        }),
      );

      daily.className = 'bombe-daily' + (isSolved ? ' done' : '');
      dailySolveRow.classList.toggle('hidden', isSolved);
      dailyDone.textContent = isSolved ? `✓ SOLVED — +◆${4} Fragments` : '';
      dailyShareBtn.classList.toggle('hidden', !isSolved);
      if (!isSolved) dailyInput.value = '';
    }

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
        const submit = () => deps.onSolvePuzzle(p.id, input.value);
        btn.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') submit(); });
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

    // ── the decrypt JUICE: ripple the just-cracked word everywhere (after the lists are rebuilt) ──
    rippleCrossReveal(opts.justDecrypted);
  };

  return { root, open };
}
