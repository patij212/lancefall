// ACCOUNT — sign-in / cloud-save account panel. Offline-first: when leaderboardEnabled()
// is false (no VITE_LEADERBOARD_URL set) it renders an inert "unavailable" note and
// shows no sign-in buttons. When backend is configured: anonymous state shows two OAuth
// sign-in buttons (clicking them opts in via startLink — sign-in IS the consent gesture);
// linked state shows the verified name and hides them. The shell is built once; open(save)
// repaints the body from account.accountState(). Mirrors the leaderboard panel shell.

import { el } from './dom';
import * as account from '../account';
import { leaderboardEnabled } from '../api';
import { AVATAR_VISUALS, renderAvatar } from '../render/avatars';
import { unlockedAvatarIds } from '../avatarUnlocks';
import type { SaveData } from '../save';
import type { Panel } from './panel';

export interface AccountPanelDeps {
  /** kick off the OAuth flow for the given provider. */
  onSignIn: (provider: 'discord' | 'google') => void;
  /** dismiss the modal (DONE button). */
  onClose: () => void;
  /** delete the account and cloud data, then repaint. */
  onDelete: () => Promise<void>;
  /** sign out of the linked account on this device (the cloud account is kept), then repaint. */
  onSignOut: () => void;
  /** profile: the player picked an avatar id (persist + repaint the cockpit logo + this panel). */
  onSelectAvatar: (id: string) => void;
  /** true when decorative motion is suppressed (reduce-motion) — picker avatars render static. */
  motionOff: () => boolean;
}

export interface AccountPanel extends Panel {
  open(save: SaveData): void;
}

/** Shared privacy note rendered in both anonymous and linked states. */
function privacyNote(): HTMLElement {
  return el('div', { class: 'account-privacy event-flavor' },
    'Privacy — signing in stores a provider account id and your game progress, used only to sync ' +
    'across devices and show a verified name. No third-party analytics. ' +
    'You can delete your account anytime to wipe your cloud data.',
  );
}

const GROUP_TAG: Record<string, string> = {
  free: 'THE SIGIL SET', boss: 'THE SIX', cipher: 'THE CITY', pilot: 'THE PILOT', special: 'FROM THE DEEP',
};

/** Profile avatar picker — choose the sigil shown on the cockpit logo when signed in. A big
 *  animated HERO showcases whichever sigil is selected or hovered; a scrollable grid of larger
 *  static tiles lets you browse all of them. The 8 free sigils plus any you've earned are
 *  selectable; locked ones are dimmed and carry their unlock hint. Selecting calls onSelect (the
 *  host persists + repaints the logo + this panel). `animated` (false under reduce-motion) only
 *  drives the hero — tiles are always static for crispness + perf. */
function avatarPicker(save: SaveData, onSelect: (id: string) => void, animated: boolean): HTMLElement {
  const unlocked = unlockedAvatarIds(save);
  const current = unlocked.has(save.selectedAvatar) ? save.selectedAvatar : 'lance';
  const wrap = el('div', { class: 'account-avatars' });
  wrap.append(el('div', { class: 'account-avatars-lbl' }, 'YOUR SIGIL — shown on your cockpit logo'));

  // ── the hero showcase (selected or hovered) ──
  const heroGlyph = el('div', { class: 'av-hero-glyph', 'aria-hidden': 'true' });
  const heroName = el('div', { class: 'av-hero-name' });
  const heroSub = el('div', { class: 'av-hero-sub' });
  const hero = el('div', { class: 'av-hero' }, heroGlyph, el('div', { class: 'av-hero-meta' }, heroName, heroSub));
  const showHero = (id: string): void => {
    const v = AVATAR_VISUALS.find((a) => a.id === id);
    if (!v) return;
    const on = unlocked.has(v.id);
    heroGlyph.style.setProperty('--accent', v.accent);
    heroGlyph.classList.toggle('locked', !on);
    heroGlyph.innerHTML = renderAvatar(v.id, { size: 132, variant: 'full', animated });
    heroName.textContent = v.name;
    heroName.style.color = on ? v.accent : '#6c8a96';
    heroSub.textContent = on
      ? `TIER ${'I'.repeat(v.tier)} · ${GROUP_TAG[v.group] ?? v.group} · ${v.motion}`
      : `LOCKED — ${v.unlockHint}`;
  };
  showHero(current);
  wrap.append(hero);

  // ── the scrollable grid of larger static tiles ──
  const grid = el('div', { class: 'account-avatar-grid' });
  for (const v of AVATAR_VISUALS) {
    const on = unlocked.has(v.id);
    const tile = el('button', {
      class: 'account-avatar-tile' + (v.id === current ? ' selected' : '') + (on ? '' : ' locked'),
      type: 'button',
      style: `--accent:${v.accent}`,
      title: on ? v.name : `${v.name} — ${v.unlockHint}`,
      'aria-label': on ? `Select ${v.name}` : `${v.name}, locked — ${v.unlockHint}`,
    }) as HTMLButtonElement;
    tile.innerHTML = renderAvatar(v.id, { size: 78, variant: 'full', animated: false });
    tile.addEventListener('mouseenter', () => showHero(v.id));
    tile.addEventListener('focus', () => showHero(v.id));
    if (on) tile.addEventListener('click', () => onSelect(v.id));
    else tile.disabled = true;
    grid.append(tile);
  }
  grid.addEventListener('mouseleave', () => showHero(current));
  wrap.append(grid);
  return wrap;
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

  const open = (save: SaveData): void => {
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

      // Inline confirm container (hidden until delete is clicked)
      let confirmRow: HTMLElement | null = null;

      const deleteBtn = el('button', { class: 'btn btn-ghost account-delete-btn' }, 'Delete my account & cloud data');
      deleteBtn.addEventListener('click', () => {
        if (confirmRow) return; // already showing
        confirmRow = el('div', { class: 'account-confirm-row' },
          el('span', { class: 'event-flavor' }, 'This wipes your cloud save + verified name.'),
          (() => {
            const confirm = el('button', { class: 'btn btn-danger account-confirm-btn' }, 'Confirm');
            confirm.addEventListener('click', () => void deps.onDelete());
            return confirm;
          })(),
          (() => {
            const cancel = el('button', { class: 'btn btn-ghost' }, 'Cancel');
            cancel.addEventListener('click', () => {
              if (confirmRow) { confirmRow.remove(); confirmRow = null; }
            });
            return cancel;
          })(),
        );
        deleteBtn.insertAdjacentElement('afterend', confirmRow);
      });

      const logoutBtn = el('button', { class: 'btn btn-ghost account-logout-btn' }, 'Log out');
      logoutBtn.addEventListener('click', () => deps.onSignOut());

      body.append(
        el('div', { class: 'account-status' },
          `Signed in as ${displayName} ✓ — your progress syncs across devices.`,
        ),
        avatarPicker(save, deps.onSelectAvatar, !deps.motionOff()),
        el('div', { class: 'event-flavor account-note' },
          'Your save is backed up to the cloud. Sign in from another device to continue your run.',
        ),
        logoutBtn,
        deleteBtn,
        privacyNote(),
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
        privacyNote(),
      );
    }
  };

  return { root, open };
}
