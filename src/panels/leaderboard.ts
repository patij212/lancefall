// RANKS — the online-leaderboard modal. Extracted from ui.ts: a handle field, per-mode + scope
// tabs, and a podium/standing/rows list fetched from the worker. Offline-first: with no backend
// (`leaderboardEnabled() === false`) it shows a local-only note and no tabs. The shell is built
// once; `open(save, prompt?)` repaints the body. Tab/scope switches share a `loadSeq` guard so a
// slow earlier response can never overwrite a faster later one (the tab-change race).

import { el } from './dom';
import { leaderboardEnabled, fetchLeaderboard } from '../api';
import { sanitizeHandle } from '../save';
import { dateString } from '../rng';
import type { SaveData } from '../save';
import type { Panel } from './panel';

/** What the RANKS panel needs from its host UI. */
export interface LeaderboardPanelDeps {
  /** persist the typed handle (committed on blur/Enter). */
  onSetHandle: (raw: string) => void;
  /** dismiss the modal (the DONE button). */
  onClose: () => void;
}

/** Extends the base contract with the post-run `prompt` flag. */
export interface LeaderboardPanel extends Panel {
  open(save: SaveData, prompt?: boolean): void;
}

const RANKS_ICON =
  '<svg viewBox="0 0 24 24" fill="none"><path d="M9 8h6v13H9zM3 13h6v8H3zM15 5h6v16h-6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';

// must mirror src/modes.ts MODES (and the worker's MODES allow-set) so every submittable mode is
// also viewable — ARENA + SOLSTICE PROTOCOL were submitted but had no board tab.
const MODES: { id: string; name: string }[] = [
  { id: 'endless', name: 'ENDLESS' }, { id: 'arena', name: 'ARENA' }, { id: 'daily', name: 'ECHO OF THE FALL' }, { id: 'weekly', name: 'WEEKLY SIEGE' }, { id: 'nightmare', name: 'NIGHTMARE' }, { id: 'bossrush', name: 'BOSS RUSH' }, { id: 'longestday', name: 'SOLSTICE PROTOCOL' },
];

export function buildLeaderboardPanel(deps: LeaderboardPanelDeps): LeaderboardPanel {
  // ── shell (built once) ──
  const icon = el('div', { class: 'panel-head-icon' });
  icon.innerHTML = RANKS_ICON;
  const head = el('div', { class: 'panel-head' }, icon, el('div', { class: 'panel-head-titles' }, el('div', { class: 'panel-eyebrow' }, 'LEADERBOARDS'), el('h2', { class: 'panel-head-title' }, 'RANKS')));
  const body = el('div', { class: 'leader-body' });
  body.id = 'leader-body';
  const close = el('button', { class: 'btn btn-primary' }, 'DONE');
  close.addEventListener('click', () => deps.onClose());
  const root = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' }, el('div', { class: 'panel panel-wide' }, head, body, close));

  const open = (save: SaveData, prompt = false): void => {
    body.replaceChildren();

    // playtest (Nick): a "name your run" framing when opened right after a run with no handle
    if (prompt) body.append(el('div', { class: 'leader-prompt' }, '★ Name your run — your scores post as ANON until you set a handle.'));

    // handle field — always available (names ghost replays + online submissions). Live preview
    // + char counter so you see exactly what will save (and that blank → ANON) AS YOU TYPE,
    // not only on blur. Both listeners route through the shared sanitizeHandle.
    const nameWrap = el('div', { class: 'leader-name' });
    const label = el('label', {}, 'Your handle');
    const input = el('input', { type: 'text', maxlength: '16', value: save.handle, placeholder: 'ACE' }) as HTMLInputElement;
    const hint = el('div', { class: 'leader-hint' });
    const refreshHint = () => {
      const clean = sanitizeHandle(input.value);
      hint.textContent = clean ? `Saves as “${clean}” · ${clean.length}/16` : 'Leave blank to post as ANON';
    };
    refreshHint();
    input.addEventListener('input', refreshHint); // live feedback as you type
    input.addEventListener('change', () => { deps.onSetHandle(input.value); refreshHint(); }); // commit on blur/Enter
    nameWrap.append(label, input, hint);
    body.append(nameWrap);
    if (prompt) requestAnimationFrame(() => input.focus());

    if (!leaderboardEnabled()) {
      body.append(el('div', { class: 'event-flavor' }, 'Online leaderboards are not configured for this build. Your scores are saved locally; set a handle so they\'re ready when boards go live.'));
      return;
    }

    // candour over a cheat-cap: the game is client-authoritative, so be honest about it
    // (a developer audience respects that more than a silently spoofable "global" board).
    body.append(
      el('div', { class: 'event-flavor leader-note' }, '🛈 Community board — scores are client-reported and unverified.'),
    );

    const modeRow = el('div', { class: 'leader-modes' });
    const scopeRow = el('div', { class: 'leader-modes' });
    const listWrap = el('div', { class: 'leader-list' }, el('div', { class: 'event-flavor' }, 'Loading…'));
    let curMode = 'endless';
    let curWeekly = false;
    let loadSeq = 0; // monotonic token — only the most recent tab/scope load may render (stale responses are dropped)
    const allBtn = el('button', { class: 'btn btn-ghost btn-sm' }, 'ALL-TIME');
    const wkBtn = el('button', { class: 'btn btn-ghost btn-sm' }, '★ THIS WEEK');
    const load = async () => {
      const seq = ++loadSeq;
      const weekly = curWeekly && curMode !== 'daily'; // daily is already date-scoped
      scopeRow.classList.toggle('hidden', curMode === 'daily');
      allBtn.classList.toggle('btn-primary', !weekly);
      wkBtn.classList.toggle('btn-primary', weekly);
      // mark the active mode tab (mock parity + tells you which board you're on)
      for (const b of Array.from(modeRow.children)) b.classList.toggle('btn-primary', (b as HTMLElement).dataset.mode === curMode);
      // DIM the current board in place rather than clearing it. Clearing collapses the list
      // to a one-line "Loading…", and the vertically-centred modal then re-centres on the
      // shorter panel — a visible jump, repeated on every tab change (the jitter). With the
      // list at a fixed CSS height, keeping content keeps the panel rock-steady while fetching.
      listWrap.classList.add('is-loading');
      listWrap.setAttribute('aria-busy', 'true');
      const entries = await fetchLeaderboard(curMode, curMode === 'daily' ? dateString() : undefined, weekly);
      if (seq !== loadSeq || !listWrap.isConnected) return; // superseded by a newer tab, or the panel closed — drop this stale render
      listWrap.classList.remove('is-loading');
      listWrap.removeAttribute('aria-busy');
      listWrap.replaceChildren();
      listWrap.scrollTop = 0; // a freshly loaded board always starts at the top
      if (entries.length === 0) {
        listWrap.append(el('div', { class: 'event-flavor' }, weekly ? 'No scores this week yet — be the first.' : 'No scores yet — be the first.'));
        return;
      }
      // PODIUM (mock-mainui) — the top 3 as a medal podium, gold centered + tallest.
      const top = entries.slice(0, 3);
      const medals = ['🥇', '🥈', '🥉'];
      const order = top.length >= 3 ? [1, 0, 2] : top.map((_, i) => i); // silver · gold · bronze
      const podium = el('div', { class: 'leader-podium' });
      for (const i of order) {
        const e = top[i];
        podium.append(el('div', { class: `podium-spot podium-${i + 1}` },
          el('div', { class: 'podium-medal' }, medals[i]),
          el('div', { class: 'podium-name' }, e.name || '—'),
          el('div', { class: 'podium-score' }, e.score.toLocaleString()),
          // wave/heat meta under each podium score (mock pod-w).
          el('div', { class: 'podium-wave' }, `w${e.wave}${e.heat ? ` · H${e.heat}` : ''}`),
        ));
      }
      listWrap.append(podium);

      // STANDING (mock): the player's own position on this board. The backend serves only the
      // top entries (no global rank/percentile), so this is HONEST + board-relative — it shows
      // when your handle appears in the visible board, otherwise a keep-climbing nudge. No
      // fabricated "top X%". A non-ANON handle is required to disambiguate your row.
      const myHandle = sanitizeHandle(save.handle);
      const mine = myHandle ? entries.find((e) => e.name === myHandle) : undefined;
      if (mine) {
        listWrap.append(el('div', { class: 'leader-standing' },
          el('div', { class: 'standing-rank' }, `#${mine.rank ?? entries.indexOf(mine) + 1}`),
          el('div', { class: 'standing-txt' }, 'Your best — ', el('b', {}, mine.score.toLocaleString())),
          el('div', { class: 'standing-pct' }, `of ${entries.length}+ shown`),
        ));
      } else if (myHandle) {
        listWrap.append(el('div', { class: 'leader-standing unranked' },
          el('div', { class: 'standing-txt' }, "You're not on the top board for this mode yet — post a higher run to claim a spot."),
        ));
      }

      entries.forEach((e, i) => {
        listWrap.append(el('div', { class: 'leader-row' },
          el('span', { class: 'leader-rank' }, `#${e.rank ?? i + 1}`),
          el('span', { class: 'leader-handle' }, e.name || '—'),
          el('span', { class: 'leader-score' }, e.score.toLocaleString()),
          el('span', { class: 'leader-meta' }, `w${e.wave}${e.heat ? ` · H${e.heat}` : ''}`),
        ));
      });
    };
    allBtn.addEventListener('click', () => { curWeekly = false; void load(); });
    wkBtn.addEventListener('click', () => { curWeekly = true; void load(); });
    scopeRow.append(allBtn, wkBtn);
    for (const m of MODES) {
      const b = el('button', { class: 'btn btn-ghost btn-sm', 'data-mode': m.id }, m.name);
      // the WEEKLY SIEGE board is canonically the this-week scope — default to it on select
      b.addEventListener('click', () => { curMode = m.id; if (m.id === 'weekly') curWeekly = true; void load(); });
      modeRow.append(b);
    }
    body.append(modeRow, scopeRow, listWrap);
    void load();
  };

  return { root, open };
}
