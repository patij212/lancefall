// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// feature-detection + clipboard/share live in ../replay — mock so we control availability + avoid
// pulling the gif encoder into the test.
const { canShareFile, canCopyImage } = vi.hoisted(() => ({ canShareFile: vi.fn(() => false), canCopyImage: vi.fn(() => false) }));
vi.mock('../replay', () => ({
  canShareFile, canCopyImage,
  copyImageToClipboard: vi.fn(() => Promise.resolve(true)),
  shareImageFile: vi.fn(() => Promise.resolve(true)),
  downloadGif: vi.fn(),
}));

import { buildSharePanel } from './share';

const gif = () => ({ blob: new Blob(['x'], { type: 'image/gif' }), caption: 'caption' });
const labels = (root: HTMLElement, sel = '.share-actions .btn') => [...root.querySelectorAll(sel)].map((b) => b.textContent ?? '');

beforeEach(() => { canShareFile.mockReturnValue(false); canCopyImage.mockReturnValue(false); });

describe('buildSharePanel', () => {
  it('beginSpinner shows the loading state', () => {
    const panel = buildSharePanel({ toast: () => {}, onClose: () => {} });
    panel.beginSpinner();
    expect(panel.root.querySelector('.share-body')?.classList.contains('share-loading')).toBe(true);
  });

  it('showPreview creates a blob URL and renders the always-available actions', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    const panel = buildSharePanel({ toast: () => {}, onClose: () => {} });
    panel.showPreview(gif());
    expect(create).toHaveBeenCalled();
    expect((panel.root.querySelector('.share-img') as HTMLImageElement).src).toContain('blob:fake');
    expect(labels(panel.root).some((l) => l.includes('DOWNLOAD'))).toBe(true);
    expect(labels(panel.root).some((l) => l.includes('COPY TEXT'))).toBe(true);
    create.mockRestore();
  });

  it('teardown revokes the blob URL', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const panel = buildSharePanel({ toast: () => {}, onClose: () => {} });
    panel.showPreview(gif());
    panel.teardown();
    expect(revoke).toHaveBeenCalledWith('blob:fake');
    revoke.mockRestore();
  });

  it('adds a SHARE button when file-share is available', () => {
    canShareFile.mockReturnValue(true);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    const panel = buildSharePanel({ toast: () => {}, onClose: () => {} });
    panel.showPreview(gif());
    expect(labels(panel.root, '.btn').some((l) => l.includes('SHARE'))).toBe(true);
  });

  it('CLOSE → onClose', () => {
    const onClose = vi.fn();
    const panel = buildSharePanel({ toast: () => {}, onClose });
    ([...panel.root.querySelectorAll('.btn-ghost')].find((b) => b.textContent === 'CLOSE') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });
});
