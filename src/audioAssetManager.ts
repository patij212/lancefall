// src/audioAssetManager.ts — codec-aware fetch/decode/cache for flagship audio. Browser bits
// (fetch, decodeAudioData, codec probing) are INJECTABLE so the logic is unit-testable and
// node-safe. Never throws from preloadCore: a failed asset is recorded and the rest plays,
// so the procedural fallback can fill any gap and a run is never broken by missing audio.

import type { AudioManifest, CodecAssetSet } from './audioManifest';

export type RuntimeCodec = 'opus' | 'mp3';

export interface AudioAssetStatus {
  codec: RuntimeCodec;
  loaded: number;
  failed: string[];
  decodedBytes: number;
}

export class AudioAssetManager {
  readonly codec: RuntimeCodec;
  private readonly music = new Map<string, AudioBuffer | null>(); // key: `${sourceId}/${trackKey}`
  private readonly sfx = new Map<string, AudioBuffer[]>();
  private readonly inflight = new Map<string, Promise<AudioBuffer | null>>(); // dedup by URL
  private readonly failed: string[] = [];
  private decodedBytes = 0;

  constructor(
    ctx: BaseAudioContext,
    private readonly manifest: AudioManifest,
    private readonly fetcher: typeof fetch = fetch,
    codec?: RuntimeCodec,
    private readonly decoder: (data: ArrayBuffer) => Promise<AudioBuffer> = (data) => ctx.decodeAudioData(data),
  ) {
    this.codec = codec ?? AudioAssetManager.detectCodec();
  }

  static detectCodec(audio: { canPlayType(t: string): string } = document.createElement('audio')): RuntimeCodec {
    return audio.canPlayType('audio/ogg; codecs="opus"') ? 'opus' : 'mp3';
  }

  private urlFor(set: CodecAssetSet): string {
    return this.codec === 'opus' ? set.opus : set.mp3;
  }

  private loadUrl(url: string): Promise<AudioBuffer | null> {
    const cached = this.inflight.get(url);
    if (cached) return cached;
    const p = this.fetcher(url)
      .then((r) => r.arrayBuffer())
      .then((data) => this.decoder(data.slice(0))) // copy: decodeAudioData detaches the buffer
      .then((buf) => {
        this.decodedBytes += buf.length * buf.numberOfChannels * 4;
        return buf;
      })
      .catch(() => {
        this.failed.push(url);
        return null;
      });
    this.inflight.set(url, p);
    return p;
  }

  async preloadCore(): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    for (const src of this.manifest.music) {
      for (const [key, set] of Object.entries(src.tracks)) {
        if (!set) continue;
        jobs.push(this.loadUrl(this.urlFor(set)).then((b) => this.music.set(`${src.id}/${key}`, b)));
      }
    }
    for (const sfx of this.manifest.sfx) {
      const variants = sfx.variants.map((set) => this.loadUrl(this.urlFor(set)));
      jobs.push(
        Promise.all(variants).then((bufs) => this.sfx.set(sfx.id, bufs.filter((b): b is AudioBuffer => b !== null))),
      );
    }
    await Promise.all(jobs);
  }

  getTrack(sourceId: string, trackKey: string): AudioBuffer | null {
    return this.music.get(`${sourceId}/${trackKey}`) ?? null;
  }

  getSfx(id: string): readonly AudioBuffer[] {
    return this.sfx.get(id) ?? [];
  }

  status(): AudioAssetStatus {
    let loaded = 0;
    for (const b of this.music.values()) if (b) loaded++;
    for (const arr of this.sfx.values()) loaded += arr.length;
    return { codec: this.codec, loaded, failed: this.failed, decodedBytes: this.decodedBytes };
  }
}
