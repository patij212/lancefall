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
  INTERCEPTS, interceptProgress, isInterceptComplete, isLongestDay, masterProgress, nextWordInIntercept, tokenView, wordCost, wordRarity,
} from '../intercepts';
import { choiceTail, lastWordResolved, LAST_WORD_PLACEHOLDER, LAST_WORD_CAPTION, LONGEST_DAY_REFRAME } from '../ending';
import { CONSOLE_PUZZLES, BOMBE_MAX_LEVEL, BRANCH_MAX, upgradeBranchCost, bombeAutoCracks, bombeCostMul } from '../bombe';
import { fragmentBalance } from '../lore';
import { DAILY_CIPHER_REWARD, dailyCipher, letterFrequency } from '../dailyCipher';
import { seedFromDate, dateString } from '../rng';

/** What THE BOMBE console needs from its host UI (the host persists + re-opens). */
export interface BombePanelDeps {
  /** decrypt the cheapest undecrypted word of an intercept (spend Fragments). */
  onDecrypt: (interceptId: string) => void;
  /** upgrade one of the three Bombe specialisation branches (THRIFT/SPEED/INSIGHT). */
  onUpgradeBombe: (branch: 'thrift' | 'speed' | 'insight') => void;
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
    el('div', { class: 'panel-eyebrow' }, 'CODEBREAKER'), el('h2', { class: 'panel-head-title' }, 'THE CODEBREAKER')));
  const lead = el('p', { class: 'panel-lead' },
    'The transmissions of the fall, enciphered. Spend Memory Fragments to decrypt them word by word — a word cracked here resolves across every transmission. Build THE CODEBREAKER to crack faster.');

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

  // Three branch upgrade buttons (THRIFT / SPEED / INSIGHT)
  const BRANCHES = [
    { id: 'thrift', label: 'THRIFT', desc: 'cost discount' },
    { id: 'speed',  label: 'SPEED',  desc: 'free cracks/run' },
    { id: 'insight',label: 'INSIGHT',desc: 'key words first' },
  ] as const;
  const branchBtns = BRANCHES.map(({ id, label }) => {
    const btn = el('button', { class: 'btn btn-sm bombe-branch-btn' }, label);
    btn.addEventListener('click', () => deps.onUpgradeBombe(id));
    return btn;
  });
  const branchEls = BRANCHES.map(({ label, desc }, i) => {
    const lvlEl = el('span', { class: 'bombe-branch-lvl' });
    const nameEl = el('span', { class: 'bombe-branch-name' }, `${label} — ${desc}`);
    return el('div', { class: 'bombe-branch' }, nameEl, lvlEl, branchBtns[i]);
  });
  const branchesRow = el('div', { class: 'bombe-branches' }, ...branchEls);

  const statusRow = el('div', { class: 'bombe-statusrow' }, machine, el('div', { class: 'bombe-statuscol' }, fragLine, bombeStatus));

  const listLabel = el('div', { class: 'stats-label' }, 'TRANSMISSIONS');
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

  const body = el('div', { class: 'bombe-body' }, lead, overnight, master, statusRow, branchesRow, listLabel, list, dailyLabel, daily, pzLabel, puzzles, close);
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
      const insightActive = (save.bombeBranches?.insight ?? 0) > 0;
      const suffix = insightActive ? ' (key words first — INSIGHT)' : '';
      overnight.textContent = `⚙ THE CODEBREAKER ran overnight — cracked ${ov.length} word${ov.length === 1 ? '' : 's'}: ${ov.join(', ')}${suffix}`;
    }

    // ── master cipher meter (the longest-day progress) ──
    const mp = masterProgress(save);
    const pct = Math.round(mp.frac * 100);
    masterBar.style.width = `${pct}%`;
    masterBar.className = 'bombe-master-fill' + (pct >= 100 ? ' done' : '');
    masterLabel.textContent = pct >= 100
      ? `MASTER CIPHER — 100% · THE LONGEST DAY · ${mp.done}/${mp.total} words`
      : `MASTER CIPHER — ${pct}% decrypted · ${mp.done}/${mp.total} words`;

    // ── Bombe status + branch upgrade controls + the working-machine motif ──
    fragLine.textContent = `◆ ${bal} Memory Fragment${bal === 1 ? '' : 's'}`;
    const lvl = save.bombeLevel;
    const branches = save.bombeBranches ?? { thrift: 0, speed: 0, insight: 0 };
    const thriftPct = Math.round((1 - bombeCostMul(branches.thrift)) * 100);
    const speedCracks = bombeAutoCracks(branches.speed);
    const insight = branches.insight;
    if (lvl <= 0) {
      bombeStatus.textContent = 'THE CODEBREAKER — not yet built · choose a branch to start';
    } else {
      const parts: string[] = [];
      if (branches.thrift > 0) parts.push(`−${thriftPct}% cost`);
      if (speedCracks > 0) parts.push(`${speedCracks} free crack${speedCracks === 1 ? '' : 's'}/run`);
      if (insight > 0) parts.push('key words first');
      bombeStatus.textContent = `THE CODEBREAKER — Lv ${lvl}/${BOMBE_MAX_LEVEL} · ${parts.join(' · ')}`;
    }
    machine.className = 'bombe-machine' + (lvl > 0 ? ' running' : '');
    machine.style.setProperty('--lvl', String(lvl));

    // update the three branch buttons
    const branchKeys = ['thrift', 'speed', 'insight'] as const;
    branchKeys.forEach((key, i) => {
      const branchLvl = branches[key];
      const maxed = branchLvl >= BRANCH_MAX;
      const cost = upgradeBranchCost(branchLvl);
      const affordable = bal >= cost;
      const lvlEl = branchEls[i].querySelector('.bombe-branch-lvl') as HTMLElement;
      lvlEl.textContent = maxed ? `${BRANCH_MAX}/${BRANCH_MAX} MAXED` : `${branchLvl}/${BRANCH_MAX} · ◆${cost}`;
      branchBtns[i].textContent = maxed ? 'MAXED' : `UPGRADE ◆${cost}`;
      branchBtns[i].className = 'btn btn-sm bombe-branch-btn' + (maxed ? ' hidden' : affordable ? ' btn-primary' : '');
      branchBtns[i].disabled = maxed || !affordable;
    });

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
        // THE LAST CIPHER — choice-authored tail (only for int-what-remains)
        if (ic.id === 'int-what-remains') {
          const tail = el('div', { class: 'bombe-choicetail bombe-pz-hint' });
          card.appendChild(tail);
        }
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
        if (ic.id === 'int-what-remains') {
          const resolved = lastWordResolved(save);
          const lw = el('span', {
            class: 'bombe-tok last-word' + (resolved ? ' r-key' : ' enc'),
            title: resolved ? '' : LAST_WORD_CAPTION,
          }, (resolved ?? LAST_WORD_PLACEHOLDER) + ' ');
          text.appendChild(lw);
        }
        const btn = card.querySelector('.bombe-decrypt') as HTMLButtonElement;
        const next = nextWordInIntercept(save, ic);
        if (!next) {
          btn.classList.add('hidden');
        } else {
          btn.classList.remove('hidden');
          const cost = Math.max(1, Math.round(wordCost(next) * bombeCostMul(branches.thrift)));
          btn.textContent = `DECRYPT ◆${cost}`;
          btn.className = 'btn btn-sm bombe-decrypt' + (bal >= cost ? ' btn-primary' : '');
          btn.disabled = bal < cost;
        }
        // THE LAST CIPHER — reconcile the choice-tail for int-what-remains
        if (ic.id === 'int-what-remains') {
          const tail = card.querySelector('.bombe-choicetail') as HTMLElement | null;
          if (tail) {
            const ct = choiceTail(save);
            if (ct) {
              tail.textContent = ct;
              // gold for catch (held the light), dusk/cool blue for fall (let it go)
              tail.style.color = save.stillpointChoice === 'fall' ? '#8bb4d0' : 'var(--amber)';
            } else {
              tail.textContent = isLongestDay(save)
                ? LONGEST_DAY_REFRAME
                : '— this cipher is not solved; it is chosen, on the longest day —';
              tail.style.color = '';
            }
          }
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
      dailyDone.textContent = isSolved ? `✓ SOLVED — +◆${DAILY_CIPHER_REWARD} Fragments` : '';
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
        // enigma puzzles get a ROTOR tag to distinguish the stepping-cipher mechanic
        const kindTag = p.kind === 'enigma' ? el('span', { class: 'bombe-ic-prog', style: 'margin-left:0; color: var(--amber);' }, 'ROTOR') : null;
        const headChildren = kindTag
          ? [el('div', { class: 'bombe-pz-prompt' }), el('div', { class: 'bombe-ic-head', style: 'margin:0 0 6px;' }, kindTag)]
          : [el('div', { class: 'bombe-pz-prompt' })];
        const card = el('div', { class: 'bombe-puzzle' },
          ...headChildren,
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
