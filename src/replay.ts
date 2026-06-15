// src/replay.ts — the shareable artifact, as a TRUE universal .gif. Captures the
// live canvas (the gray→neon Coherence wash + spear) into a rolling ring buffer
// of downscaled frames on a timer DECOUPLED from the 60fps loop, then encodes an
// animated GIF in a Web Worker (off the main thread) on demand. Fully guarded:
// degrades to a main-thread encode if Workers are unavailable, and no-ops if the
// canvas can't be read. A neon-on-dark scene compresses well, so a ~6s 360px clip
// stays comfortably shareable.

const CAPTURE_MS = 100; // 10 fps capture
const DELAY_CS = 10; // 10 centiseconds/frame (matches 10 fps)
const TARGET_W = 360; // downscaled width (aspect preserved)
const MAX_FRAMES = 60; // ~6s rolling window
const MIN_FRAMES = 8; // need at least this many to bother

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

  /** Encode the buffered frames into a GIF (off-thread) and download it. */
  saveGif(): void {
    if (this.encoding || this.frames.length < MIN_FRAMES) return;
    this.encoding = true;
    const buffers = this.frames.map((f) => f.buffer.slice(0)); // copies to transfer
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('./gifWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      worker = null;
    }
    if (worker) {
      worker.onmessage = (e: MessageEvent<{ gif: ArrayBuffer }>) => {
        this.download(new Blob([e.data.gif], { type: 'image/gif' }));
        worker?.terminate();
      };
      worker.onerror = () => {
        worker?.terminate();
        this.encodeOnMainThread();
      };
      try {
        worker.postMessage({ frames: buffers, w: this.w, h: this.h, delayCs: DELAY_CS }, buffers);
      } catch {
        worker.terminate();
        this.encodeOnMainThread(); // transfer failed — fall back instead of latching
      }
    } else {
      this.encodeOnMainThread();
    }
  }

  /** Fallback: encode on the main thread (may stutter briefly). */
  private encodeOnMainThread(): void {
    void import('./gif')
      .then(({ encodeRgbaFrames }) => {
        const gif = encodeRgbaFrames(
          this.frames.map((f) => new Uint8Array(f.buffer)),
          this.w,
          this.h,
          DELAY_CS,
          true,
        );
        this.download(new Blob([gif.buffer as ArrayBuffer], { type: 'image/gif' }));
      })
      .catch(() => {
        // a failed import/encode must never latch the button on 'encoding' forever
        this.encoding = false;
      });
  }

  private download(blob: Blob): void {
    this.encoding = false;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lancefall.gif';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 8000);
  }
}
