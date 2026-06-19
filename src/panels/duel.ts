// ACCEPT A DUEL — paste a friend's seed-duel code to race their ghost on their exact seed, or take
// the dev's pinned gauntlet. Extracted from ui.ts. Opened only via open(code) (the share-link
// deep-link); the button actions route through typed deps callbacks.

import { el } from './dom';

export interface DuelPanelDeps {
  /** accept a pasted duel code (already trimmed + non-empty). */
  onAccept: (code: string) => void;
  /** take the dev's pinned fixed-seed gauntlet. */
  onChallengeDev: () => void;
  /** dismiss the modal. */
  onClose: () => void;
}

export interface DuelPanel {
  readonly root: HTMLElement;
  /** open pre-filled with a code arriving from a shared `#duel=` link. */
  open(code: string): void;
}

export function buildDuelPanel(deps: DuelPanelDeps): DuelPanel {
  const h = el('h2', {}, '⚔ ACCEPT A DUEL');
  const blurb = el('div', { class: 'event-flavor' }, 'A friend sent you a duel code? Paste it below. You\'ll fall through their exact seed, racing their translucent ghost — beat their score to win.');
  const input = el('textarea', { class: 'duel-input', rows: '4', placeholder: 'Paste duel code…' }) as HTMLTextAreaElement;
  const accept = el('button', { class: 'btn btn-primary' }, 'ACCEPT DUEL');
  accept.addEventListener('click', () => {
    const code = input.value.trim();
    if (!code) return;
    deps.onClose();
    input.value = '';
    deps.onAccept(code);
  });
  const cancel = el('button', { class: 'btn btn-ghost' }, 'CANCEL');
  cancel.addEventListener('click', () => deps.onClose());
  // CHALLENGE THE DEV: a pinned fixed-seed run (races the author ghost if bundled).
  const devBlurb = el('div', { class: 'event-flavor' }, 'Or take the dev\'s gauntlet: a pinned fixed seed everyone shares. Beat it, then ⚔ DUEL your run back.');
  const dev = el('button', { class: 'btn btn-ghost' }, '⚑ CHALLENGE THE DEV');
  dev.addEventListener('click', () => { deps.onClose(); deps.onChallengeDev(); });
  const root = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' },
    el('div', { class: 'panel' }, h, blurb, input, el('div', { class: 'go-row' }, accept, cancel), devBlurb, el('div', { class: 'go-row' }, dev)),
  );

  const open = (code: string): void => {
    input.value = code;
    requestAnimationFrame(() => { input.focus(); input.select(); });
  };

  return { root, open };
}
