// SHARE YOUR RUN — the watermarked ~6s clip preview + share/copy/download. Extracted from ui.ts.
// The host owns the modal lifecycle (open/close, focus-trap) + toasts; this panel owns the preview
// img, the action buttons, and the blob-URL lifecycle. teardown() (registered by the host on the
// modal's close hook) revokes the object URL however the panel is dismissed.

import { el } from './dom';
import { type ShareGif, canCopyImage, canShareFile, copyImageToClipboard, shareImageFile, downloadGif } from '../replay';

export interface SharePanelDeps {
  /** show a transient toast. */
  toast: (msg: string) => void;
  /** dismiss the modal (CLOSE). */
  onClose: () => void;
}

export interface SharePanel {
  readonly root: HTMLElement;
  /** open state the moment SHARE GIF is pressed — clear + show the encoding spinner. */
  beginSpinner(): void;
  /** the encode finished — show the watermarked preview + share/copy/download actions. */
  showPreview(gif: ShareGif): void;
  /** revoke the preview blob + drop the loading state (run on any dismiss). */
  teardown(): void;
}

export function buildSharePanel(deps: SharePanelDeps): SharePanel {
  const h = el('h2', {}, 'SHARE YOUR RUN');
  const shareImg = el('img', { class: 'share-img', alt: 'Your watermarked run clip' }) as HTMLImageElement;
  const shareBody = el('div', { class: 'share-body' }, shareImg);
  const shareActions = el('div', { class: 'share-actions' });
  const close = el('button', { class: 'btn btn-ghost' }, 'CLOSE');
  close.addEventListener('click', () => deps.onClose());
  const panel = el('div', { class: 'panel' }, h, shareBody, shareActions, close);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Share your run');
  const root = el('div', { class: 'screen screen-dim screen-modal hidden' }, panel);

  let shareUrl = '';
  const revoke = (): void => {
    if (shareUrl) {
      URL.revokeObjectURL(shareUrl);
      shareUrl = '';
    }
    shareImg.removeAttribute('src');
  };

  const beginSpinner = (): void => {
    revoke();
    shareImg.classList.add('hidden');
    shareActions.replaceChildren();
    shareBody.classList.add('share-loading');
    shareBody.setAttribute('data-msg', 'encoding clip…');
  };

  const showPreview = (gif: ShareGif): void => {
    revoke();
    shareUrl = URL.createObjectURL(gif.blob);
    shareImg.src = shareUrl;
    shareImg.classList.remove('hidden');
    shareBody.classList.remove('share-loading');
    shareBody.removeAttribute('data-msg');

    shareActions.replaceChildren();
    // Primary affordance: OS share sheet if available (mobile + some desktops),
    // else copy-image-to-clipboard, else fall straight to download.
    if (canShareFile(gif.blob)) {
      const share = el('button', { class: 'btn btn-primary' }, '⤴ SHARE');
      share.addEventListener('click', () => {
        void shareImageFile(gif.blob, gif.caption).then((ok) => {
          if (ok) deps.toast('Shared!');
        });
      });
      shareActions.append(share);
    }
    if (canCopyImage()) {
      const copy = el('button', { class: 'btn btn-primary' }, '⧉ COPY IMAGE');
      copy.addEventListener('click', () => {
        void copyImageToClipboard(gif.blob).then((ok) =>
          deps.toast(ok ? 'GIF copied — paste it anywhere!' : 'Copy unavailable — downloading instead'),
        );
        if (!canCopyImage()) downloadGif(gif.blob);
      });
      shareActions.append(copy);
    }
    const dl = el('button', { class: 'btn btn-ghost' }, '⬇ DOWNLOAD');
    dl.addEventListener('click', () => downloadGif(gif.blob));
    shareActions.append(dl);
    // Always offer copying the caption text too (works fully offline).
    const txt = el('button', { class: 'btn btn-ghost' }, '⧉ COPY TEXT');
    txt.addEventListener('click', () => {
      try {
        void navigator.clipboard?.writeText(gif.caption);
        deps.toast('Caption copied!');
      } catch {
        deps.toast(gif.caption);
      }
    });
    shareActions.append(txt);
  };

  const teardown = (): void => {
    shareBody.classList.remove('share-loading');
    revoke();
  };

  return { root, beginSpinner, showPreview, teardown };
}
