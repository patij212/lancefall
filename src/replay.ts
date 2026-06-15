// src/replay.ts — the shareable artifact, as a TRUE universal .gif. Captures the
// live canvas (the gray→neon Coherence wash + spear) into a rolling ring buffer
// of downscaled frames on a timer DECOUPLED from the 60fps loop, then encodes an
// animated GIF in a Web Worker (off the main thread) on demand. The exported GIF
// is BRANDED — a score + seed + lancefall.pages.dev watermark is burned into every
// frame — and the share path offers an in-page preview + copy-to-clipboard /
// navigator.share, with a graceful fall-back to a plain download when neither is
// available (offline-friendly). Fully guarded: degrades to a main-thread encode if
// Workers are unavailable, and no-ops if the canvas can't be read. A neon-on-dark
// scene compresses well, so a ~6s 360px clip stays comfortably shareable.
//
// Determinism: cosmetic / IO only. None of this touches world.rng.
import type { Watermark } from './gif';

const CAPTURE_MS = 100; // 10 fps capture
const DELAY_CS = 10; // 10 centiseconds/frame (matches 10 fps)
const TARGET_W = 360; // downscaled width (aspect preserved)
const MAX_FRAMES = 60; // ~6s rolling window
const MIN_FRAMES = 8; // need at least this many to bother

/** What a finished GIF resolves to — the bytes plus the brand line for the UI. */
export interface ShareGif {
  blob: Blob;
  /** human-readable caption to seed navigator.share / clipboard text */
  caption: string;
}

/** The metadata burned into the exported frames + used as the share caption. */
export interface ShareMeta {
  score: number;
  seed: number;
  /** true for a Daily/dated seed (shown as "DAILY" rather than a raw seed) */
  daily?: boolean;
}

const SITE = 'lancefall.pages.dev';

/** Build the 3-line watermark struct from run metadata (pure, no rng). */
export function buildWatermark(meta: ShareMeta): Watermark {
  const seedLine = meta.daily ? `DAILY ${meta.seed}` : `SEED ${meta.seed}`;
  return {
    score: `${meta.score.toLocaleString('en-US')} PTS`,
    seed: seedLine,
    site: SITE,
  };
}

/** Build the share caption text (clipboard / navigator.share fallback). */
export function buildShareCaption(meta: ShareMeta): string {
  return `THE LAST LANCE — held the light for ${meta.score.toLocaleString('en-US')} pts (${
    meta.daily ? 'Daily' : `seed ${meta.seed}`
  }). How much can you hold? ${SITE}`;
}

export class ReplayRecorder {
  private canvas: HTMLCanvasElement | null = null;
  private off: HTMLCanvasElement | null = null;
  private octx: CanvasRenderingContext2D | null = null;
  private frames: Uint8ClampedArray[] = [];
  private timer = 0;
  private w = 0;
  private h = 0;
  private active = false;
  private encoding = false;

  /** Begin capturing the canvas into the rolling frame buffer. */
  start(canvas: HTMLCanvasElement): void {
    if (this.active) return;
    this.canvas = canvas;
    this.frames = [];
    const aspect = canvas.height > 0 && canvas.width > 0 ? canvas.height / canvas.width : 0.4;
    this.w = TARGET_W;
    this.h = Math.max(1, Math.round(TARGET_W * aspect));
    try {
      this.off = document.createElement('canvas');
      this.off.width = this.w;
      this.off.height = this.h;
      this.octx = this.off.getContext('2d', { willReadFrequently: true }); // repeated getImageData readback
    } catch {
      this.octx = null;
    }
    if (!this.octx) return;
    this.active = true;
    this.timer = window.setInterval(() => this.capture(), CAPTURE_MS);
  }

  private capture(): void {
    if (!this.octx || !this.canvas) return;
    try {
      this.octx.drawImage(this.canvas, 0, 0, this.w, this.h);
      const data = this.octx.getImageData(0, 0, this.w, this.h).data;
      this.frames.push(new Uint8ClampedArray(data)); // own a tight copy
      if (this.frames.length > MAX_FRAMES) this.frames.shift();
    } catch {
      /* canvas not ready / unreadable — skip this frame */
    }
  }

  /** Stop capturing. The buffered frames remain available for one save. */
  stop(): void {
    if (!this.active) return;
    this.active = false;
    window.clearInterval(this.timer);
  }

  hasClip(): boolean {
    return this.frames.length >= MIN_FRAMES;
  }

  /**
   * Encode the buffered frames into a BRANDED GIF (off-thread) and resolve with
   * the blob + caption. The watermark (score + seed + site) is burned into every
   * frame. Resolves null when there's nothing to encode or an encode is in flight.
   */
  encodeShare(meta: ShareMeta): Promise<ShareGif | null> {
    if (this.encoding || this.frames.length < MIN_FRAMES) return Promise.resolve(null);
    this.encoding = true;
    const mark = buildWatermark(meta);
    const caption = buildShareCaption(meta);
    const buffers = this.frames.map((f) => f.buffer.slice(0)); // copies to transfer
    const wrap = (gif: ArrayBuffer | Uint8Array): ShareGif => {
      const buf = gif instanceof Uint8Array ? (gif.buffer.slice(0) as ArrayBuffer) : gif;
      return { blob: new Blob([buf], { type: 'image/gif' }), caption };
    };

    return new Promise<ShareGif | null>((resolve) => {
      let worker: Worker | null = null;
      const fallback = (): void => {
        void this.encodeOnMainThread(mark)
          .then((gif) => resolve(gif ? wrap(gif) : null))
          .catch(() => resolve(null))
          .finally(() => {
            this.encoding = false;
          });
      };
      try {
        worker = new Worker(new URL('./gifWorker.ts', import.meta.url), { type: 'module' });
      } catch {
        worker = null;
      }
      if (worker) {
        worker.onmessage = (e: MessageEvent<{ gif: ArrayBuffer }>) => {
          this.encoding = false;
          resolve(wrap(e.data.gif));
          worker?.terminate();
        };
        worker.onerror = () => {
          worker?.terminate();
          fallback();
        };
        try {
          worker.postMessage({ frames: buffers, w: this.w, h: this.h, delayCs: DELAY_CS, mark }, buffers);
        } catch {
          worker.terminate();
          fallback(); // transfer failed — fall back instead of latching
        }
      } else {
        fallback();
      }
    });
  }

  /** Fallback: encode on the main thread (may stutter briefly). */
  private encodeOnMainThread(mark: Watermark): Promise<Uint8Array | null> {
    return import('./gif')
      .then(({ encodeRgbaFrames }) =>
        encodeRgbaFrames(
          this.frames.map((f) => new Uint8Array(f.buffer)),
          this.w,
          this.h,
          DELAY_CS,
          true,
          mark,
        ),
      )
      .catch(() => null);
  }

  /** Plain download of a finished GIF blob (offline / no-share fallback). */
  download(blob: Blob, name = 'lancefall.gif'): void {
    downloadGif(blob, name);
  }
}

/** Trigger a plain browser download of a GIF blob (offline / no-share fallback). */
export function downloadGif(blob: Blob, name = 'lancefall.gif'): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 8000);
}

/** Feature-detect: can we copy an image to the clipboard here? (https + API). */
export function canCopyImage(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof (navigator.clipboard as { write?: unknown }).write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  );
}

/** Feature-detect: can we hand a file to the OS share sheet here? */
export function canShareFile(blob: Blob): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  try {
    const file = new File([blob], 'lancefall.gif', { type: 'image/gif' });
    const nav = navigator as Navigator & { canShare?: (d: { files?: File[] }) => boolean };
    return typeof nav.canShare === 'function' ? nav.canShare({ files: [file] }) : true;
  } catch {
    return false;
  }
}

/** Copy a GIF blob to the clipboard as an image. Resolves true on success. */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  if (!canCopyImage()) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Hand a GIF blob (+ caption) to the OS share sheet. Resolves true on success. */
export async function shareImageFile(blob: Blob, caption: string): Promise<boolean> {
  if (!canShareFile(blob)) return false;
  try {
    const file = new File([blob], 'lancefall.gif', { type: 'image/gif' });
    await navigator.share({ files: [file], title: 'THE LAST LANCE', text: caption });
    return true;
  } catch {
    // user cancelled or share rejected — caller falls back to copy/download
    return false;
  }
}
