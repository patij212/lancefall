import { describe, it, expect, vi } from 'vitest';
import { HybridMusic, type HybridMusicDeps } from './hybridMusic';

function makeDeps(playReturns = true) {
  const layerPlayer = {
    activeScene: null as string | null,
    play: vi.fn((source: { id: string }) => {
      if (playReturns) layerPlayer.activeScene = source.id;
      return playReturns;
    }),
    setGains: vi.fn(),
    stop: vi.fn(() => { layerPlayer.activeScene = null; }),
  };
  const sampleSfx = { play: vi.fn(() => true), stopAll: vi.fn(), activeVoices: 0 };
  const host = { setAuthoredActive: vi.fn(), setReactiveGain: vi.fn(), setLoopCutoff: vi.fn(), reanchor: vi.fn() };
  const assets = { preloadCore: vi.fn(async () => {}), getTrack: vi.fn(() => null), getSfx: vi.fn(() => []), status: vi.fn(() => ({ codec: 'opus' as const, loaded: 0, failed: [], decodedBytes: 0 })) };
  const deps: HybridMusicDeps = { assets, layerPlayer, sampleSfx, host };
  return { deps, layerPlayer, sampleSfx, host, assets };
}

const DOWNBEAT = 0; // step % 16 === 0
const NEXT_BAR = 16;

describe('HybridMusic — bar-gated source selection', () => {
  it('only acts on a bar downbeat', () => {
    const { deps, layerPlayer } = makeDeps();
    const h = new HybridMusic(deps);
    h.tick(7, 0); // mid-bar 16th — not a downbeat
    expect(layerPlayer.play).not.toHaveBeenCalled();
    h.tick(DOWNBEAT, 0);
    expect(layerPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('follows the arena song spine and starts the authored source when tracks exist', () => {
    const { deps, layerPlayer, host } = makeDeps(true);
    const h = new HybridMusic(deps);
    h.tick(DOWNBEAT, 0);
    expect(layerPlayer.play.mock.calls[0][0].id).toBe('aurora_verse'); // bar 0 = verse
    expect(host.setAuthoredActive).toHaveBeenLastCalledWith(true, 0); // co-scheduled at the bar time
    expect(host.reanchor).toHaveBeenLastCalledWith(114, 0); // AURORA bpm (Calm System)
    expect(h.activeBpm).toBe(114);
  });

  it('keeps procedural (authored inactive) when the source tracks are missing', () => {
    const { deps, host } = makeDeps(false); // layerPlayer.play returns false
    const h = new HybridMusic(deps);
    h.tick(DOWNBEAT, 0);
    expect(host.setAuthoredActive).not.toHaveBeenCalledWith(true);
    expect(h.activeBpm).toBe(112); // stays the procedural default
  });
});

describe('HybridMusic — vertical routing', () => {
  it('opens the loop cutoff with intensity AND coherence while authored is active', () => {
    const { deps, host } = makeDeps(true);
    const h = new HybridMusic(deps);
    h.setIntensity(0);
    h.tick(DOWNBEAT, 0); // starts aurora_verse, authored active
    const low = host.setLoopCutoff.mock.calls.at(-1)![0];
    h.setIntensity(1);
    h.tick(NEXT_BAR, 1); // still verse (bar 1) — same source
    expect(host.setLoopCutoff.mock.calls.at(-1)![0]).toBeGreaterThan(low);
    h.setIntensity(0);
    h.setCoherence(1);
    h.tick(32, 2); // bar 2 — still verse, same source
    expect(host.setLoopCutoff.mock.calls.at(-1)![0]).toBeGreaterThan(low);
  });
});

describe('HybridMusic — Warden state edges', () => {
  it('emits arrival / phase / fan samples only at state edges, and selects the boss source', () => {
    const { deps, sampleSfx, layerPlayer } = makeDeps(true);
    const h = new HybridMusic(deps);

    h.setBossState('warden', 0, 0, 1);
    expect(sampleSfx.play).toHaveBeenCalledWith('warden_arrival');
    sampleSfx.play.mockClear();
    h.setBossState('warden', 0, 0, 1); // no change → no repeat
    expect(sampleSfx.play).not.toHaveBeenCalled();

    h.setBossState('warden', 1, 0, 1); // phase change
    expect(sampleSfx.play).toHaveBeenCalledWith('warden_phase');
    sampleSfx.play.mockClear();
    h.setBossState('warden', 1, 1, 1); // phase-1 subPhase increment → a fan
    expect(sampleSfx.play).toHaveBeenCalledWith('warden_fan');

    h.tick(DOWNBEAT, 0); // boss music now selected
    expect(layerPlayer.play.mock.calls.at(-1)![0].id).toBe('warden_fan'); // phase 1 → fan source
  });
});

describe('HybridMusic — stop restores procedural', () => {
  it('stops authored playback, clears voices, and re-anchors to procedural 112', () => {
    const { deps, layerPlayer, sampleSfx, host } = makeDeps(true);
    const h = new HybridMusic(deps);
    h.tick(DOWNBEAT, 0); // authored running
    h.stop();
    expect(layerPlayer.stop).toHaveBeenCalled();
    expect(sampleSfx.stopAll).toHaveBeenCalled();
    expect(host.setAuthoredActive).toHaveBeenLastCalledWith(false);
    expect(host.reanchor).toHaveBeenLastCalledWith(112, expect.anything());
    expect(h.activeBpm).toBe(112);
  });
});
