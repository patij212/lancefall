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
  // One encode per run, shared by the auto-preview (game-over) AND the SEND THE ECHO button:
  // the first caller kicks it off, later callers reuse the in-flight promise / cached result.
  // runToken tags the run so an encode that finishes after a restart can't leak across runs.
  private cached: ShareGif | null = null;
  private inflight: Promise<ShareGif | null> | null = null;
  private runToken = 0;
  private encodeWorker: Worker | null = null;

  /** Begin capturing the canvas into the rolling frame buffer. */
  start(canvas: HTMLCanvasElement): void {
    if (this.active) return;
    this.canvas = canvas;
    this.frames = [];
    // a new run invalidates the prior run's clip: drop the cache, bump the token so any
    // still-running encode discards its result, and kill its worker so it can't linger.
    this.cached = null;
    this.inflight = null;
    this.runToken++;
    this.encodeWorker?.terminate();
    this.encodeWorker = null;
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

  /** The last captured frame — "the first-light frame, the instant the run resolved" — as a
   *  PNG data URL for the game-over preview card, or null if nothing was captured. Cosmetic /
   *  IO only: draws to an offscreen canvas, never reads world.rng. */
  lastFrameImage(): string | null {
    const f = this.frames[this.frames.length - 1];
    if (!f || this.w < 1 || this.h < 1) return null;
    try {
      const c = document.createElement('canvas');
      c.width = this.w;
      c.height = this.h;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(f), this.w, this.h), 0, 0);
      return c.toDataURL('image/png');
    } catch {
      return null; // canvas/ImageData unavailable (older browsers / headless) — fall back to the chrome
    }
  }

  /**
   * Encode the buffered frames into a BRANDED, animated GIF (off-thread) and resolve with
   * the blob + caption — the watermark (score + seed + site) is burned into every frame.
   * DEDUPED per run: the first call kicks off the encode, concurrent/later calls share the
   * same in-flight promise, and a finished encode is cached so a second caller (the share
   * button after the auto-preview) gets it instantly. Resolves null when there's nothing to
   * encode. The cache + token are reset by start(), so a fresh run never reuses a stale clip.
   */
  encodeShare(meta: ShareMeta): Promise<ShareGif | null> {
    if (this.cached) return Promise.resolve(this.cached);
    if (this.inflight) return this.inflight;
    if (this.frames.length < MIN_FRAMES) return Promise.resolve(null);
    const token = this.runToken;
    this.inflight = this.doEncode(meta)
      .then((gif) => {
        if (token !== this.runToken) return null; // a new run started mid-encode — discard
        if (gif) this.cached = gif;
        return gif;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /** Run one encode (off-thread, with a main-thread fallback). Pure IO — no cache logic. */
  private doEncode(meta: ShareMeta): Promise<ShareGif | null> {
    const mark = buildWatermark(meta);
    const caption = buildShareCaption(meta);
    const buffers = this.frames.map((f) => f.buffer.slice(0)); // copies to transfer
    const wrap = (gif: ArrayBuffer | Uint8Array): ShareGif => {
      const buf = gif instanceof Uint8Array ? (gif.buffer.slice(0) as ArrayBuffer) : gif;
      return { blob: new Blob([buf], { type: 'image/gif' }), caption };
    };

    return new Promise<ShareGif | null>((resolve) => {
      let worker: Worker | null = null;
      const clearWorker = (): void => {
        if (this.encodeWorker === worker) this.encodeWorker = null;
      };
      const fallback = (): void => {
        void this.encodeOnMainThread(mark)
          .then((gif) => resolve(gif ? wrap(gif) : null))
          .catch(() => resolve(null));
      };
      try {
        worker = new Worker(new URL('./gifWorker.ts', import.meta.url), { type: 'module' });
      } catch {
        worker = null;
      }
      if (worker) {
        this.encodeWorker = worker;
        worker.onmessage = (e: MessageEvent<{ gif: ArrayBuffer }>) => {
          resolve(wrap(e.data.gif));
          worker?.terminate();
          clearWorker();
        };
        worker.onerror = () => {
          worker?.terminate();
          clearWorker();
          fallback();
        };
        try {
          worker.postMessage({ frames: buffers, w: this.w, h: this.h, delayCs: DELAY_CS, mark }, buffers);
        } catch {
          worker.terminate();
          clearWorker();
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

/** Decode a GIF blob's first frame to a PNG blob via an offscreen canvas. The async
 *  Clipboard API only accepts image/png on most desktops (Chromium rejects image/gif), so
 *  COPY IMAGE pastes a watermarked still; the animated GIF stays on SHARE / DOWNLOAD. */
function gifFirstFrameToPng(gif: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(gif);
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 1;
        c.height = img.naturalHeight || 1;
        const ctx = c.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('no 2d ctx'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        c.toBlob((png) => {
          URL.revokeObjectURL(url);
          png ? resolve(png) : reject(new Error('toBlob failed'));
        }, 'image/png');
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('gif decode failed'));
    };
    img.src = url;
  });
}

/** Copy the clip to the clipboard as an image. Resolves true on success. Copies a PNG of
 *  the first frame (the format clipboards actually accept); the Promise is handed straight to
 *  ClipboardItem so the user-gesture activation survives the async decode. */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  if (!canCopyImage()) return false;
  try {
    const png = blob.type === 'image/png' ? Promise.resolve(blob) : gifFirstFrameToPng(blob);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
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
