// ACCOUNT — sign-in / cloud-save account panel. Offline-first: when leaderboardEnabled()
// is false (no VITE_LEADERBOARD_URL set) it renders an inert "unavailable" note and
// shows no sign-in buttons. When backend is configured: anonymous state shows two OAuth
// sign-in buttons (clicking them opts in via startLink — sign-in IS the consent gesture);
// linked state shows the verified name and hides them. The shell is built once; open(save)
// repaints the body from account.accountState(). Mirrors the leaderboard panel shell.

import { el } from './dom';
import * as account from '../account';
import { leaderboardEnabled } from '../api';
import type { SaveData } from '../save';
import type { Panel } from './panel';

export interface AccountPanelDeps {
  /** kick off the OAuth flow for the given provider. */
  onSignIn: (provider: 'discord' | 'google') => void;
  /** dismiss the modal (DONE button). */
  onClose: () => void;
}

export interface AccountPanel extends Panel {
  open(save: SaveData): void;
}

export function buildAccountPanel(deps: AccountPanelDeps): AccountPanel {
  // ── shell (built once) ──
  const head = el('div', { class: 'panel-head' },
    el('div', { class: 'panel-head-titles' },
      el('div', { class: 'panel-eyebrow' }, 'CLOUD SAVE'),
      el('h2', { class: 'panel-head-title' }, 'ACCOUNT'),
    ),
  );

  const body = el('div', { class: 'account-body' });

  const close = el('button', { class: 'btn btn-primary' }, 'DONE');
  close.addEventListener('click', () => deps.onClose());

  const root = el('div', { class: 'screen screen-dim screen-settings screen-modal hidden' },
    el('div', { class: 'panel' }, head, body, close),
  );

  const open = (_save: SaveData): void => {
    body.replaceChildren();

    // Offline-first gate: when no backend is configured, show a plain note and bail.
    // This is separate from opt-in — a player who hasn't opted in yet can still reach
    // sign-in (clicking the button IS the opt-in via startLink calling optIn()).
    if (!leaderboardEnabled()) {
      body.append(
        el('div', { class: 'event-flavor' },
          'Cloud accounts are unavailable in this build. Progress is saved locally on this device.',
        ),
      );
      return;
    }

    const state = account.accountState();

    if (state.kind === 'linked') {
      // ── linked state ──
      const displayName = state.name ?? 'Unknown';
      body.append(
        el('div', { class: 'account-status' },
          `Signed in as ${displayName} ✓ — your progress syncs across devices.`,
        ),
        el('div', { class: 'event-flavor account-note' },
          'Your save is backed up to the cloud. Sign in from another device to continue your run.',
        ),
      );
    } else {
      // ── anonymous state ──
      body.append(
        el('div', { class: 'account-status' },
          "You're playing anonymously — sign in to sync across devices and claim a verified name.",
        ),
        el('div', { class: 'account-sign-in-row' },
          (() => {
            const discord = el('button', { class: 'btn btn-ghost' }, 'Sign in with Discord');
            discord.addEventListener('click', () => deps.onSignIn('discord'));
            return discord;
          })(),
          (() => {
            const google = el('button', { class: 'btn btn-ghost' }, 'Sign in with Google');
            google.addEventListener('click', () => deps.onSignIn('google'));
            return google;
          })(),
        ),
        el('div', { class: 'event-flavor account-note' },
          'Signing in links your device to your account. Your local progress carries over.',
        ),
      );
    }
  };

  return { root, open };
}
