import { describe, it, expect, vi } from 'vitest';
import { AudioAssetManager } from './audioAssetManager';
import type { AudioManifest } from './audioManifest';

const MANIFEST: AudioManifest = {
  version: 1,
  music: [{
    id: 'm', suite: 'aurora', role: 'verse', bpm: 112, key: 'A minor', layering: 'loop',
    tracks: { main: { opus: '/m/main.ogg', mp3: '/m/main.mp3' } },
    conformed: true, license: 'CC0', integratedLufs: -20, truePeakDbtp: -1,
  }],
  sfx: [{ id: 's', gain: 0.5, priority: 2, maxVoices: 2, variants: [{ opus: '/s/1.ogg', mp3: '/s/1.mp3' }] }],
};

const ctx = {} as BaseAudioContext;
const fakeBuffer = () => ({ length: 100, numberOfChannels: 2 } as AudioBuffer); // 100*2*4 = 800 bytes
const okFetch = async (_url: string) => ({ arrayBuffer: async () => new ArrayBuffer(8) } as Response);

describe('AudioAssetManager.detectCodec', () => {
  it('prefers Opus when the browser can play it, else MP3', () => {
    expect(AudioAssetManager.detectCodec({ canPlayType: () => 'probably' })).toBe('opus');
    expect(AudioAssetManager.detectCodec({ canPlayType: () => '' })).toBe('mp3');
  });
});

describe('AudioAssetManager loading', () => {
  it('fetches the codec-appropriate URL and decodes tracks + sfx', async () => {
    const fetched: string[] = [];
    const fetcher = async (url: string) => { fetched.push(url); return okFetch(url); };
    const m = new AudioAssetManager(ctx, MANIFEST, fetcher as typeof fetch, 'opus', async () => fakeBuffer());
    await m.preloadCore();
    expect(fetched).toContain('/m/main.ogg'); // opus, not mp3
    expect(fetched).not.toContain('/m/main.mp3');
    expect(m.getTrack('m', 'main')).not.toBeNull();
    expect(m.getSfx('s').length).toBe(1);
  });

  it('accounts decoded bytes as length * channels * 4', async () => {
    const m = new AudioAssetManager(ctx, MANIFEST, okFetch as typeof fetch, 'opus', async () => fakeBuffer());
    await m.preloadCore();
    expect(m.status().decodedBytes).toBe(2 * 800); // 1 music + 1 sfx buffer
  });

  it('records a fetch/decode failure and keeps the rest playable (never throws)', async () => {
    const fetcher = async (url: string) => {
      if (url.endsWith('1.ogg')) throw new Error('404');
      return okFetch(url);
    };
    const m = new AudioAssetManager(ctx, MANIFEST, fetcher as typeof fetch, 'opus', async () => fakeBuffer());
    await expect(m.preloadCore()).resolves.toBeUndefined();
    expect(m.getTrack('m', 'main')).not.toBeNull();
    expect(m.getSfx('s')).toEqual([]); // its only variant failed
    expect(m.status().failed).toContain('/s/1.ogg');
  });

  it('deduplicates in-flight work: a URL decodes once across repeated preloads', async () => {
    const decoder = vi.fn(async () => fakeBuffer());
    const m = new AudioAssetManager(ctx, MANIFEST, okFetch as typeof fetch, 'opus', decoder);
    await m.preloadCore();
    await m.preloadCore();
    expect(decoder).toHaveBeenCalledTimes(2); // 2 unique URLs (1 track + 1 sfx), not 4
  });
});
