// src/replay.ts — the shareable artifact. Records a rolling ~6s WebM of the live
// canvas (the gray→neon Coherence wash + spear) so a stranger gets the whole game
// from one clip. Fully guarded: on any browser without canvas.captureStream /
// MediaRecorder / a supported codec, it silently no-ops (hasClip() stays false →
// the SAVE REPLAY button never appears). Off-thread; zero main-loop cost.
//
// Strategy: re-start the recorder every ~6s. Each start→stop cycle is a complete,
// self-contained WebM segment (header included), so the most recent finished
// segment is always a valid clip of the run's final stretch. No fragile chunk
// stitching, no rolling header problem.

const SEGMENT_MS = 6000;

export class ReplayRecorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private lastClip: Blob | null = null;
  private mime = '';
  private rotateTimer = 0;
  private active = false;

  /** Begin capturing the canvas. Safe to call when unsupported (no-ops). */
  start(canvas: HTMLCanvasElement): void {
    if (this.active) return;
    this.lastClip = null;
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) return;
    this.mime = this.pickMime();
    if (!this.mime) return;
    try {
      this.stream = canvas.captureStream(30);
    } catch {
      this.stream = null;
      return;
    }
    this.active = true;
    this.beginSegment();
  }

  private beginSegment(): void {
    if (!this.stream) return;
    this.chunks = [];
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(this.stream, { mimeType: this.mime, videoBitsPerSecond: 4_000_000 });
    } catch {
      this.active = false;
      return;
    }
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    rec.onstop = () => {
      if (this.chunks.length) this.lastClip = new Blob(this.chunks, { type: this.mime });
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.active = false;
      return;
    }
    this.rotateTimer = window.setTimeout(() => this.rotate(), SEGMENT_MS);
  }

  /** Close the current segment (→ a valid clip) and open a fresh one. */
  private rotate(): void {
    if (!this.active || !this.rec) return;
    const prev = this.rec;
    if (prev.state !== 'inactive') prev.stop(); // flush → onstop captures the clip
    this.beginSegment();
  }

  /** Stop capturing. The most recent finished segment remains the saved clip. */
  stop(): void {
    if (!this.active) return;
    this.active = false;
    window.clearTimeout(this.rotateTimer);
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  hasClip(): boolean {
    return this.lastClip !== null;
  }

  /** Trigger a browser download of the latest clip. No-op if none exists. */
  download(filename = 'lancefall-replay.webm'): void {
    if (!this.lastClip) return;
    const url = URL.createObjectURL(this.lastClip);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  private pickMime(): string {
    const cands = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const m of cands) {
      try {
        if (MediaRecorder.isTypeSupported(m)) return m;
      } catch {
        /* ignore */
      }
    }
    return '';
  }
}
