// src/audioLab.ts — DEV-ONLY "AUDIO CONSOLE" (served at /audiolab.html in `npm run dev`).
// One dark control-surface for one engine: a single TRANSPORT feeds ONE oscilloscope
// STAGE from one of two clearly-armed sources (LIVE engine / RENDER bounce); a DRIVERS
// rail sets intent (coherence/heat/tier), a MIXER drawer plays with the 11 layers + a
// tabbed trigger deck, and an ITERATION LOG tracks each audio pass + captures feedback.
// Not in the prod bundle (only index.html is built).

import { AudioEngine } from './audio';
import type { EnemyKind } from './types';
import { transportAt, sectionAt, SONG_TOTAL_BARS } from './musicTransport';
import { MUSIC_BPM } from './tune';

const audio = new AudioEngine();
let pctx: AudioContext | null = null;
const PCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
const ensurePlayback = (): AudioContext => (pctx ??= new PCtor());

const BARDUR = (60 / MUSIC_BPM) * 4;
const css = (k: string, v: string): void => document.documentElement.style.setProperty(k, v);

// ── shared state ──────────────────────────────────────────────────────────────
type SourceMode = 'live' | 'render';
interface RenderOpts { seconds: number; coherence?: number; tier?: number; heat?: number; track?: 'aurora' | 'surge'; boss?: string; coherenceTo?: number; heatTo?: number; tierTo?: number; startBar?: number; sampleRate?: number }
interface Marker { ts: number; source: SourceMode; track: string; section: string; bar: number; coh: number; heat: number; tier: number; solo: string | null; muted: string[]; note: string; verdict: string }

const state = {
  source: 'live' as SourceMode,
  track: 'aurora' as 'aurora' | 'surge',
  coh: 0.45, heat: 0.4, tier: 0,
  loop: true,
  markers: [] as Marker[],
};
try { state.markers = JSON.parse(localStorage.getItem('lf.audiolab.markers') || '[]'); } catch { /* fresh */ }
const saveMarkers = (): void => localStorage.setItem('lf.audiolab.markers', JSON.stringify(state.markers));

// ── ITERATION LOG seed: the real soundtrack passes already shipped ─────────────
interface Pass { pass: number; date: string; title: string; track: 'aurora' | 'surge'; listenFor: string[]; changed: string[]; render: RenderOpts }
const AUDIO_PASSES: Pass[] = [
  { pass: 1, date: '06-13', title: 'Production master chain + convolution reverb + sub-buses', track: 'aurora', listenFor: ['glue/space vs the old dry mix', 'no harsh clipping in massacres'], changed: ['drone', 'pad'], render: { seconds: 14, track: 'aurora', coherence: 0.55, heat: 0.5, startBar: 0 } },
  { pass: 2, date: '06-13', title: 'Warm click-free stereo SFX + positional kills', track: 'aurora', listenFor: ['no clicky envelopes', 'kills pan L/R'], changed: ['kick', 'perc'], render: { seconds: 12, track: 'aurora', coherence: 0.5, heat: 0.6, startBar: 8 } },
  { pass: 3, date: '06-13', title: 'THE LANCE THEME hook + chords + sidechain pump + layers', track: 'aurora', listenFor: ['hook blooms with coherence', 'pad pumps under the kick'], changed: ['hook', 'bass', 'arp', 'pad'], render: { seconds: 14, track: 'aurora', coherence: 0.85, heat: 0.7, tier: 2, startBar: 16 } },
  { pass: 4, date: '06-13', title: 'SURGE — aggressive second soundtrack (always-on riff)', track: 'surge', listenFor: ['drives hard at zero combo (the riff)', 'distorted lead + deeper pump'], changed: ['riff', 'bass', 'hook'], render: { seconds: 14, track: 'surge', coherence: 0.5, heat: 0.6, startBar: 0 } },
  { pass: 5, date: '06-13', title: 'Complexity + impact: supersaw, octave-lead, moving pad, fills', track: 'aurora', listenFor: ['lead is huge/wide (supersaw)', 'harmony moves chord-to-chord'], changed: ['hook', 'pad', 'perc'], render: { seconds: 14, track: 'aurora', coherence: 0.9, heat: 0.8, tier: 3, startBar: 16 } },
  { pass: 6, date: '06-13', title: 'Harmony engine — real thirds + a leading-tone cadence', track: 'aurora', listenFor: ['major brightness in F/C chords', 'V→i pull (G#→A) on chorus end', 'low coherence stays dark by design'], changed: ['pad', 'choir', 'bass'], render: { seconds: 18, track: 'aurora', coherence: 0.2, heat: 0.4, coherenceTo: 0.95, heatTo: 0.8, tierTo: 3 } },
  { pass: 7, date: '06-13', title: 'Timbre & motion — filter envs, ping-pong delay, sub, sparkle, air', track: 'surge', listenFor: ['notes "breathe" (filter motion)', 'hook echoes (dotted-8th delay)', 'spectrum brightens with coherence'], changed: ['hook', 'bass', 'kick', 'delay'], render: { seconds: 16, track: 'surge', coherence: 0.15, heat: 0.3, coherenceTo: 0.92, heatTo: 0.9, tierTo: 4 } },
  { pass: 8, date: '06-13', title: 'Song-form spine — arrangement breathes (the "too busy" fix)', track: 'aurora', listenFor: ['VERSE sparse → PRE builds → CHORUS blooms', 'riff steps back when the hook sings', 'it goes somewhere'], changed: ['arp', 'hook', 'riff', 'perc'], render: { seconds: 46, track: 'aurora', coherence: 0.1, heat: 0.2, coherenceTo: 0.92, heatTo: 0.85, tierTo: 3 } },
];
const CURRENT_PASS = AUDIO_PASSES[AUDIO_PASSES.length - 1];
// Claude appends future passes here at runtime so the owner scrolls the full evolution.
(window as unknown as { __logPass: (p: Pass) => void }).__logPass = (p: Pass) => { AUDIO_PASSES.push(p); };

// ── render helpers ──────────────────────────────────────────────────────────────
let rendering = false;
async function renderClip(o: RenderOpts): Promise<AudioBuffer> {
  return new AudioEngine().renderOffline(o as Parameters<AudioEngine['renderOffline']>[0]);
}
/** A snappy in-lab audition: cap length + render at a lighter rate (the convolution
 *  reverb makes long, full-rate offline bounces slow), and lock out overlapping renders. */
async function auditionRender(o: RenderOpts, cap = 16): Promise<AudioBuffer | null> {
  if (rendering) return null;
  rendering = true;
  try {
    return await renderClip({ ...o, seconds: Math.min(o.seconds, cap), sampleRate: 22050 } as RenderOpts);
  } finally {
    rendering = false;
  }
}
function audioBufferToWav(buf: AudioBuffer): Blob {
  const nc = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length, ba = nc * 2, dl = len * ba;
  const ab = new ArrayBuffer(44 + dl), dv = new DataView(ab);
  const ws = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + dl, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, nc, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * ba, true); dv.setUint16(32, ba, true); dv.setUint16(34, 16, true);
  ws(36, 'data'); dv.setUint32(40, dl, true);
  const ch: Float32Array[] = [];
  for (let c = 0; c < nc; c++) ch.push(buf.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < nc; c++) { const s = Math.max(-1, Math.min(1, ch[c][i])); dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2; }
  return new Blob([ab], { type: 'audio/wav' });
}
function bufBrightness(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  let zc = 0, prev = 0;
  for (let i = 0; i < d.length; i++) { if ((d[i] >= 0) !== (prev >= 0)) zc++; prev = d[i]; }
  return zc / d.length;
}

// ── tiny DOM helper ──────────────────────────────────────────────────────────────
type A = Record<string, string>;
function el<K extends keyof HTMLElementTagNameMap>(t: K, a: A = {}, ...k: (Node | string)[]): HTMLElementTagNameMap[K] {
  const n = document.createElement(t);
  for (const key in a) n.setAttribute(key, a[key]);
  for (const c of k) n.append(c);
  return n;
}
const typingInField = (): boolean => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');

const $transport = document.getElementById('transport')!;
const $stage = document.getElementById('stage')!;
const $mixer = document.getElementById('mixer')!;
const $rail = document.getElementById('rail')!;

// ════════════════════════════════════════════════════════════════════════════════
//  STAGE CONTROLLER — one screen, two sources. Owns playback + the single rAF draw.
// ════════════════════════════════════════════════════════════════════════════════
const stage = (() => {
  let waveCv: HTMLCanvasElement, ribbonCv: HTMLCanvasElement, specCv: HTMLCanvasElement, meterCv: HTMLCanvasElement;
  let analyser: AnalyserNode | null = null;
  let timeBuf = new Uint8Array(2048), freqBuf = new Uint8Array(1024);
  // render backend
  let renderBuf: AudioBuffer | null = null, renderStartBar = 0, renderLabel = '—', renderBright = 0;
  let rsrc: AudioBufferSourceNode | null = null, startedAt = 0, offset = 0, rPlaying = false;
  const slots: Record<'A' | 'B', { buf: AudioBuffer; startBar: number; label: string } | null> = { A: null, B: null };
  let onUpdate: () => void = () => {};

  const fit = (c: HTMLCanvasElement): CanvasRenderingContext2D => {
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  };
  const trackColor = (): string => (state.track === 'aurora' ? '#57e2ff' : '#ff4d9d');

  // ── playback ──
  const stopRender = (): void => { if (rsrc) { try { rsrc.stop(); } catch { /* */ } rsrc.disconnect(); rsrc = null; } rPlaying = false; };
  const playRender = (from = 0): void => {
    const pc = ensurePlayback();
    stopRender();
    if (!renderBuf) return;
    rsrc = pc.createBufferSource();
    rsrc.buffer = renderBuf;
    rsrc.loop = state.loop;
    rsrc.connect(pc.destination);
    offset = from; startedAt = pc.currentTime; rsrc.start(0, from); rPlaying = true;
    rsrc.onended = () => { if (!state.loop) { rPlaying = false; offset = 0; } };
  };
  const stopLive = (): void => audio.stopDrone();
  const startLive = (): void => { audio.startDrone(); analyser = audio.getAnalyser(); };

  const arm = (s: SourceMode): void => {
    if (state.source === s) return;
    if (s === 'render') stopLive(); else stopRender();
    state.source = s;
    onUpdate();
  };
  const loadRender = (buf: AudioBuffer, startBar: number, label: string): void => {
    renderBuf = buf; renderStartBar = startBar; renderLabel = label; renderBright = bufBrightness(buf);
    stopLive(); state.source = 'render'; onUpdate();
    playRender(0);
  };
  const play = (): void => { if (state.source === 'live') { startLive(); } else { playRender(0); } onUpdate(); };
  const stop = (): void => { stopLive(); stopRender(); onUpdate(); };
  const panic = (): void => { stopLive(); stopRender(); audio.endCharge(); audio.bossMusic(false); onUpdate(); };

  const renderPos = (): number => {
    if (!renderBuf) return 0;
    let p = rPlaying ? offset + (ensurePlayback().currentTime - startedAt) : offset;
    if (state.loop && renderBuf.duration > 0) p %= renderBuf.duration;
    return Math.min(Math.max(0, p), renderBuf.duration);
  };
  // current bar (canonical clock = sectionAt) for whichever source is armed
  const curBar = (): number => {
    if (state.source === 'live') return audio.musicRunning ? transportAt(audio.musicTime).bar : 0;
    return renderStartBar + Math.floor(renderPos() / BARDUR);
  };

  // ── visuals (one rAF) ──
  const drawWave = (): void => {
    const ctx = fit(waveCv), W = waveCv.clientWidth, H = waveCv.clientHeight, mid = H / 2;
    ctx.clearRect(0, 0, W, H);
    if (state.source === 'live' && analyser) {
      analyser.getByteTimeDomainData(timeBuf);
      ctx.strokeStyle = trackColor(); ctx.lineWidth = 1.4; ctx.beginPath();
      for (let x = 0; x < W; x++) { const v = (timeBuf[Math.floor((x / W) * timeBuf.length)] - 128) / 128; (x === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, x, mid + v * mid * 0.92); }
      ctx.stroke();
    } else if (renderBuf) {
      const d = renderBuf.getChannelData(0), block = Math.max(1, Math.floor(d.length / W));
      ctx.fillStyle = trackColor();
      for (let x = 0; x < W; x++) { let mx = 0; for (let i = 0; i < block; i++) { const a = Math.abs(d[x * block + i] || 0); if (a > mx) mx = a; } ctx.fillRect(x, mid - mx * mid * 0.95, 1, mx * mid * 1.9); }
      const ph = (renderPos() / renderBuf.duration) * W;
      ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ph, 0); ctx.lineTo(ph, H); ctx.stroke();
    } else {
      ctx.fillStyle = '#565a72'; ctx.font = "11px 'JetBrains Mono', monospace"; ctx.fillText('arm RENDER + click a section, or press ▶ for LIVE', 12, mid);
    }
  };
  const SECTION_COL: Record<string, string> = { verse: '#2c6b80', prechorus: '#3aa7c8', chorus: '#57e2ff', bridge: '#7d4b8f', drop: '#ff4d9d' };
  const drawRibbon = (): void => {
    const ctx = fit(ribbonCv), W = ribbonCv.clientWidth, H = ribbonCv.clientHeight, bw = W / SONG_TOTAL_BARS;
    ctx.clearRect(0, 0, W, H);
    const active = ((curBar() % SONG_TOTAL_BARS) + SONG_TOTAL_BARS) % SONG_TOTAL_BARS;
    for (let b = 0; b < SONG_TOTAL_BARS; b++) {
      const sec = sectionAt(b), lit = sec.section === sectionAt(active).section && Math.abs(b - active) < sec.sectionBars;
      ctx.fillStyle = SECTION_COL[sec.section] || '#333';
      ctx.globalAlpha = lit ? 0.95 : 0.32;
      ctx.fillRect(b * bw + 0.5, 14, bw - 1, H - 18);
      ctx.globalAlpha = 1;
      if (sec.barInSection === 0) { ctx.fillStyle = '#8a8fb0'; ctx.font = "8px 'Space Grotesk', sans-serif"; ctx.fillText(sec.section.toUpperCase().slice(0, 6), b * bw + 3, 10); }
    }
    const px = (active + (state.source === 'live' ? transportAt(audio.musicTime || 0).beatInBar / 4 : (renderPos() % BARDUR) / BARDUR)) * bw;
    ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, 12); ctx.lineTo(px, H); ctx.stroke();
  };
  const drawSpectrum = (): void => {
    const ctx = fit(specCv), W = specCv.clientWidth, H = specCv.clientHeight;
    ctx.clearRect(0, 0, W, H);
    let bright = renderBright;
    if (state.source === 'live' && analyser) {
      analyser.getByteFrequencyData(freqBuf);
      const bars = 56, step = Math.floor((freqBuf.length * 0.6) / bars);
      let num = 0, den = 0;
      for (let i = 0; i < bars; i++) {
        let s = 0; for (let j = 0; j < step; j++) s += freqBuf[i * step + j];
        s /= step; const v = s / 255;
        ctx.fillStyle = `rgba(87,226,255,${0.3 + v * 0.6})`;
        ctx.fillRect((i / bars) * W, H - v * (H - 4), W / bars - 1, v * (H - 4));
        num += i * s; den += s;
      }
      bright = den > 0 ? (num / den / bars) : 0; // normalized spectral centroid
    } else if (renderBuf) {
      ctx.fillStyle = '#565a72'; ctx.font = "9px 'JetBrains Mono', monospace"; ctx.fillText('frozen render — brightness from ZCR', 8, H / 2);
    }
    // brightness needle (rationed amber)
    const nx = Math.min(1, bright * (state.source === 'live' ? 1 : 12)) * W;
    ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(nx, 0); ctx.lineTo(nx, H); ctx.stroke();
    ctx.fillStyle = '#ffb347'; ctx.font = "8px 'JetBrains Mono', monospace"; ctx.fillText('BRIGHT', 4, 9);
  };
  const drawMeter = (): void => {
    const ctx = fit(meterCv), W = meterCv.clientWidth, H = meterCv.clientHeight;
    ctx.clearRect(0, 0, W, H);
    let rms = 0;
    if (state.source === 'live' && analyser) { analyser.getByteTimeDomainData(timeBuf); let s = 0; for (let i = 0; i < timeBuf.length; i++) { const v = (timeBuf[i] - 128) / 128; s += v * v; } rms = Math.sqrt(s / timeBuf.length); }
    else if (renderBuf && rPlaying) { const d = renderBuf.getChannelData(0), st = Math.floor(renderPos() * renderBuf.sampleRate), win = 1024; let s = 0; for (let i = 0; i < win; i++) { const v = d[st + i] || 0; s += v * v; } rms = Math.sqrt(s / win); }
    const lvl = Math.min(1, rms * 3.2);
    const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#3ddc97'); g.addColorStop(0.7, '#ffb347'); g.addColorStop(1, '#ff5c5c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, lvl * W, H);
    ctx.strokeStyle = '#232742'; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  };
  let rafId = 0;
  const loop = (): void => {
    drawWave(); drawRibbon(); drawSpectrum(); drawMeter();
    onUpdate(); // refresh transport readout
    rafId = requestAnimationFrame(loop);
  };
  return {
    bind(w: HTMLCanvasElement, r: HTMLCanvasElement, s: HTMLCanvasElement, m: HTMLCanvasElement, up: () => void) { waveCv = w; ribbonCv = r; specCv = s; meterCv = m; onUpdate = up; },
    start() { if (!rafId) loop(); },
    arm, play, stop, panic, loadRender,
    seekRender(frac: number) { if (renderBuf) playRender(frac * renderBuf.duration); },
    storeTo(k: 'A' | 'B') { if (renderBuf) slots[k] = { buf: renderBuf, startBar: renderStartBar, label: renderLabel }; },
    recall(k: 'A' | 'B') { const v = slots[k]; if (v) stage.loadRender(v.buf, v.startBar, v.label); },
    get renderLabel() { return renderLabel; },
    get renderBuf() { return renderBuf; },
    curBar,
    isPlaying() { return state.source === 'live' ? audio.musicRunning : rPlaying; },
  };
})();

// ════════════════════════════════════════════════════════════════════════════════
//  TRANSPORT
// ════════════════════════════════════════════════════════════════════════════════
let updateTransport: () => void = () => {};
function buildTransport(): void {
  const t = $transport;
  t.append(el('span', { class: 'wordmark' }, 'LANCEFALL ', el('small', {}, '· AUDIO CONSOLE')));
  const play = el('button', { class: 'playbtn', title: 'play/stop (Space)' }, '▶');
  play.addEventListener('click', () => (stage.isPlaying() ? stage.stop() : stage.play()));
  t.append(play);
  const seg = el('div', { class: 'seg' });
  const segLive = el('button', {}, 'LIVE'), segRender = el('button', {}, 'RENDER');
  segLive.addEventListener('click', () => stage.arm('live'));
  segRender.addEventListener('click', () => stage.arm('render'));
  seg.append(segLive, segRender);
  t.append(seg);
  const clock = el('div', { class: 'clock' });
  t.append(clock);
  const chip = el('button', { class: 'chip aurora' }, 'AURORA');
  chip.addEventListener('click', () => { state.track = state.track === 'aurora' ? 'surge' : 'aurora'; audio.setSoundtrack(state.track); updateTransport(); });
  t.append(chip);
  const loopBtn = el('button', { class: 'ticon' }, 'LOOP ●');
  loopBtn.addEventListener('click', () => { state.loop = !state.loop; loopBtn.textContent = state.loop ? 'LOOP ●' : 'LOOP ○'; });
  const aBtn = el('button', { class: 'ticon' }, '→A'); const bBtn = el('button', { class: 'ticon' }, '→B');
  const rA = el('button', { class: 'ticon' }, 'A'); const rB = el('button', { class: 'ticon' }, 'B');
  aBtn.addEventListener('click', () => stage.storeTo('A')); bBtn.addEventListener('click', () => stage.storeTo('B'));
  rA.addEventListener('click', () => stage.recall('A')); rB.addEventListener('click', () => stage.recall('B'));
  t.append(loopBtn, aBtn, bBtn, rA, rB);
  t.append(el('div', { class: 'spacer' }));
  const meterCv = el('canvas', { class: '' }) as HTMLCanvasElement; meterCv.width = 120; meterCv.height = 14;
  meterCv.style.width = '70px'; meterCv.style.height = '14px';
  t.append(meterCv);
  const copy = el('button', { class: 'ticon', title: 'copy a reproducible feedback state' }, '⧉ STATE');
  copy.addEventListener('click', copyState);
  const wav = el('button', { class: 'ticon', title: 'export armed render as WAV' }, '⤓ WAV');
  wav.addEventListener('click', exportWav);
  const stamp = el('span', { class: 'lbl' }, `PASS ${CURRENT_PASS.pass}`);
  t.append(copy, wav, stamp);
  // share the transport meter canvas with the stage
  transportMeter = meterCv;

  updateTransport = (): void => {
    const live = state.source === 'live';
    segLive.classList.toggle('on', live); segRender.classList.toggle('on', !live);
    seg.classList.toggle('render', !live);
    play.textContent = stage.isPlaying() ? '■' : '▶';
    play.style.color = live ? 'var(--cyan)' : 'var(--amber)';
    chip.className = 'chip ' + state.track; chip.textContent = state.track.toUpperCase();
    const bar = stage.curBar(), s = sectionAt(bar);
    const beat = live ? transportAt(audio.musicTime || 0).beatInBar : 0;
    const pips = Array.from({ length: 4 }, (_, i) => `<span class="pip${i === beat && stage.isPlaying() ? ' on' : ''}"></span>`).join('');
    clock.innerHTML = `<span style="color:${live ? 'var(--cyan)' : 'var(--amber)'}">${live ? '▶ LIVE' : '⏩ RENDER'}</span>  ${s.section.toUpperCase()} <span class="sub">bar ${s.barInSection + 1}/${s.sectionBars}</span> <span class="pips">${pips}</span> <span class="sub">${MUSIC_BPM}BPM</span>`;
  };
  updateTransport();
}
let transportMeter: HTMLCanvasElement;

// ════════════════════════════════════════════════════════════════════════════════
//  STAGE (canvases)
// ════════════════════════════════════════════════════════════════════════════════
function buildStage(): void {
  const mkWell = (id: string, tag: string): HTMLCanvasElement => {
    const well = el('div', { class: 'well', id });
    well.append(el('span', { class: 'welltag lbl' }, tag));
    const cv = el('canvas', {}) as HTMLCanvasElement;
    cv.style.width = '100%'; cv.style.height = '100%';
    well.append(cv);
    $stage.append(well);
    return cv;
  };
  const wave = mkWell('waveWell', 'SCOPE');
  const ribbon = mkWell('ribbonWell', 'SONG');
  const spec = mkWell('spectrumWell', 'SPECTRUM');
  wave.addEventListener('click', (e) => { if (state.source === 'render' && stage.renderBuf) stage.seekRender(e.offsetX / (e.target as HTMLCanvasElement).clientWidth); });
  ribbon.addEventListener('click', async (e) => {
    if (rendering) return;
    const cv = e.target as HTMLCanvasElement;
    const bar = Math.floor((e.offsetX / cv.clientWidth) * SONG_TOTAL_BARS);
    const start = bar - sectionAt(bar).barInSection;
    const secs = Math.max(8, sectionAt(bar).sectionBars * BARDUR);
    cv.style.opacity = '0.5';
    const buf = await auditionRender({ seconds: secs, startBar: start, track: state.track, coherence: state.coh, heat: state.heat, tier: state.tier }, 20);
    cv.style.opacity = '1';
    if (buf) stage.loadRender(buf, start, `${state.track.toUpperCase()} · ${sectionAt(bar).section.toUpperCase()}`);
    updateTransport();
  });
  // bind synchronously — buildTransport (which sets transportMeter) runs before buildStage,
  // and stage.start() runs the rAF AFTER this, so the canvases must already be bound.
  stage.bind(wave, ribbon, spec, transportMeter, () => updateTransport());
}

// ════════════════════════════════════════════════════════════════════════════════
//  RAIL — DRIVERS + LOG tabs
// ════════════════════════════════════════════════════════════════════════════════
function buildRail(): void {
  const tabs = el('div', { class: 'tabs' });
  const tDrivers = el('button', { class: 'on' }, 'DRIVERS'), tLog = el('button', {}, 'ITERATION LOG');
  tabs.append(tDrivers, tLog);
  const body = el('div', { class: 'tabbody' });
  $rail.append(tabs, body);
  const drivers = buildDrivers(), log = buildLog();
  const show = (which: 'd' | 'l'): void => {
    body.innerHTML = ''; body.append(which === 'd' ? drivers : log);
    tDrivers.classList.toggle('on', which === 'd'); tLog.classList.toggle('on', which === 'l');
  };
  tDrivers.addEventListener('click', () => show('d')); tLog.addEventListener('click', () => show('l'));
  show('d');
}

let bloomCv: HTMLCanvasElement;
function buildDrivers(): HTMLElement {
  const wrap = el('div', {});
  // COHERENCE hero with bloom ring
  const coh = el('div', { class: 'driver' });
  const cohHead = el('div', { class: 'head' }, el('span', { class: 'lbl' }, 'COHERENCE'), el('span', { class: 'v' }, '0.45'));
  bloomCv = el('canvas', { class: 'bloomring' }) as HTMLCanvasElement; bloomCv.width = 128; bloomCv.height = 128;
  const cohIn = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0.45' }) as HTMLInputElement;
  const setCoh = (v: number): void => { state.coh = v; (cohHead.lastChild as HTMLElement).textContent = v.toFixed(2); audio.setCoherence(state.coh, state.tier); css('--bloom', String(v)); drawBloom(v); };
  cohIn.addEventListener('input', () => setCoh(parseFloat(cohIn.value)));
  const sweep = el('button', { class: 'sweep' }, 'SWEEP ▸');
  sweep.addEventListener('click', () => { let v = 0; const id = setInterval(() => { v += 0.04; cohIn.value = String(v); setCoh(v); if (v >= 1) clearInterval(id); }, 60); });
  coh.append(cohHead, el('div', { class: 'cohwrap' }, bloomCv, cohIn), sweep);
  wrap.append(coh);
  // HEAT + TIER
  const mk = (name: string, max: number, step: number, val: number, on: (v: number) => void): HTMLElement => {
    const d = el('div', { class: 'driver' });
    const head = el('div', { class: 'head' }, el('span', { class: 'lbl' }, name), el('span', { class: 'v' }, String(val)));
    const inp = el('input', { type: 'range', min: '0', max: String(max), step: String(step), value: String(val) }) as HTMLInputElement;
    inp.addEventListener('input', () => { const v = parseFloat(inp.value); (head.lastChild as HTMLElement).textContent = step < 1 ? v.toFixed(2) : String(v); on(v); });
    d.append(head, inp); return d;
  };
  wrap.append(mk('HEAT', 1, 0.01, 0.4, (v) => { state.heat = v; audio.setIntensity(v); }));
  wrap.append(mk('COMBO TIER', 6, 1, 0, (v) => { state.tier = Math.round(v); audio.setCoherence(state.coh, state.tier); }));
  wrap.append(el('p', { class: 'lbl' }, 'click a SONG block to render that section · SWEEP auto-ramps the bloom'));
  drawBloom(0.45);
  return wrap;
}
function drawBloom(v: number): void {
  if (!bloomCv) return;
  const ctx = bloomCv.getContext('2d')!, w = bloomCv.width, c = w / 2;
  ctx.clearRect(0, 0, w, w);
  ctx.strokeStyle = '#232742'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(c, c, 46, 0, Math.PI * 2); ctx.stroke();
  const col = `hsl(190, ${Math.round(v * 90)}%, ${40 + v * 25}%)`;
  ctx.strokeStyle = col; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(c, c, 46, -Math.PI / 2, -Math.PI / 2 + v * Math.PI * 2); ctx.stroke();
  ctx.shadowColor = col; ctx.shadowBlur = v * 22; ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = col; ctx.font = "600 22px 'JetBrains Mono', monospace"; ctx.textAlign = 'center'; ctx.fillText(v.toFixed(2), c, c + 7);
  ctx.textAlign = 'left';
}

function buildLog(): HTMLElement {
  const wrap = el('div', {});
  wrap.append(el('div', { class: 'passbanner' }, el('div', { class: 'lbl' }, `CURRENT · PASS ${CURRENT_PASS.pass}`), el('div', { class: 'mono', style: 'font-size:12px;color:var(--ink);margin-top:3px' }, CURRENT_PASS.title)));
  // marker form
  const form = el('div', { class: 'markerform' });
  const note = el('textarea', { placeholder: 'feedback note — captures track·section·bar·drivers·solo (M key)' }) as HTMLTextAreaElement;
  let verdict = '';
  const vrow = el('div', { class: 'verdicts' });
  for (const [v, g] of [['up', '👍'], ['down', '👎'], ['warn', '⚠️']] as const) {
    const b = el('button', {}, g);
    b.addEventListener('click', () => { verdict = verdict === v ? '' : v; vrow.querySelectorAll('button').forEach((x) => x.classList.remove('on')); if (verdict) b.classList.add('on'); });
    vrow.append(b);
  }
  const drop = el('button', { class: 'sweep' }, '⛳ DROP MARKER (M)');
  const list = el('div', {});
  const renderList = (): void => {
    list.innerHTML = '';
    const passCards = [...AUDIO_PASSES].reverse().map((p) => passCard(p));
    const markerCards = [...state.markers].reverse().map((m) => markerCard(m, renderList));
    for (const c of [...markerCards, ...passCards]) list.append(c);
  };
  drop.addEventListener('click', () => {
    const bar = stage.curBar(), s = sectionAt(bar);
    state.markers.push({ ts: Date.now(), source: state.source, track: state.track, section: s.section, bar: s.barInSection, coh: state.coh, heat: state.heat, tier: state.tier, solo: soloName, muted: [...mutedNames], note: note.value, verdict });
    saveMarkers(); note.value = ''; verdict = ''; vrow.querySelectorAll('button').forEach((x) => x.classList.remove('on')); renderList();
  });
  form.append(note, el('div', { style: 'display:flex;gap:8px;align-items:center;justify-content:space-between' }, vrow, drop));
  wrap.append(form, list);
  renderList();
  return wrap;
}
function passCard(p: Pass): HTMLElement {
  const card = el('div', { class: 'logcard' });
  card.append(el('h4', {}, `PASS ${p.pass} · ${p.title}`));
  card.append(el('div', { class: 'meta' }, `${p.date} · ${p.track.toUpperCase()}`));
  if (p.listenFor.length) { const ul = el('ul', {}); for (const b of p.listenFor) ul.append(el('li', {}, b)); card.append(el('div', { class: 'lbl' }, 'LISTEN FOR'), ul); }
  const chips = el('div', { class: 'chipset' }); for (const c of p.changed) chips.append(el('span', { class: 'lchip' }, c)); card.append(chips);
  const btns = el('div', { class: 'logbtns' });
  const audition = el('button', {}, '▶ audition');
  audition.addEventListener('click', async () => {
    if (rendering) return;
    audition.textContent = '… rendering';
    state.track = p.track; audio.setSoundtrack(p.track);
    const buf = await auditionRender(p.render, 18);
    if (buf) stage.loadRender(buf, p.render.startBar || 0, `PASS ${p.pass}`);
    audition.textContent = '▶ audition'; updateTransport();
  });
  btns.append(audition);
  card.append(btns);
  return card;
}
function markerCard(m: Marker, refresh: () => void): HTMLElement {
  const card = el('div', { class: 'logcard owner' });
  const v = m.verdict === 'up' ? '👍' : m.verdict === 'down' ? '👎' : m.verdict === 'warn' ? '⚠️' : '·';
  card.append(el('h4', {}, `${v} ${m.note || '(marker)'}`));
  card.append(el('div', { class: 'meta' }, `${m.source.toUpperCase()} · ${m.track.toUpperCase()} · ${m.section.toUpperCase()} bar ${m.bar + 1} · coh ${m.coh.toFixed(2)} heat ${m.heat.toFixed(2)} t${m.tier}${m.solo ? ' · solo:' + m.solo : ''}`));
  const btns = el('div', { class: 'logbtns' });
  const recall = el('button', {}, 'load drivers');
  recall.addEventListener('click', () => { state.track = m.track as 'aurora' | 'surge'; state.coh = m.coh; state.heat = m.heat; state.tier = m.tier; audio.setSoundtrack(state.track); audio.setCoherence(m.coh, m.tier); audio.setIntensity(m.heat); rebuildRailDrivers(); });
  const del = el('button', {}, '✕');
  del.addEventListener('click', () => { state.markers.splice(state.markers.indexOf(m), 1); saveMarkers(); refresh(); });
  btns.append(recall, del); card.append(btns);
  return card;
}
let rebuildRailDrivers: () => void = () => {};

// ════════════════════════════════════════════════════════════════════════════════
//  MIXER — layer strips + utility deck
// ════════════════════════════════════════════════════════════════════════════════
let soloName: string | null = null;
const mutedNames = new Set<string>();
function buildMixer(): void {
  const half = el('div', { class: 'mixhalf' });
  half.append(el('span', { class: 'lbl' }, 'LAYERS · solo / mute (live)'));
  const strips = el('div', { class: 'strips' });
  const leds = new Map<string, HTMLElement>();
  const refresh = (): void => {
    strips.querySelectorAll<HTMLElement>('.strip').forEach((st) => {
      const name = st.dataset.n!;
      st.querySelector<HTMLButtonElement>('.m')!.classList.toggle('on', mutedNames.has(name));
      st.querySelector<HTMLButtonElement>('.s')!.classList.toggle('on', soloName === name);
      st.classList.toggle('dim', !!soloName && soloName !== name);
    });
  };
  for (const name of audio.layerNames) {
    const st = el('div', { class: 'strip', 'data-n': name });
    const led = el('div', { class: 'led' });
    st.append(el('span', { class: 'sname' }, name), led);
    const ms = el('div', { class: 'ms' });
    const s = el('button', { class: 's' }, 'S'), m = el('button', { class: 'm' }, 'M');
    s.addEventListener('click', () => { soloName = soloName === name ? null : name; audio.setLayerSolo(soloName); refresh(); });
    m.addEventListener('click', () => { if (mutedNames.has(name)) mutedNames.delete(name); else mutedNames.add(name); audio.setLayerMute(name, mutedNames.has(name)); refresh(); });
    ms.append(s, m); st.append(ms);
    leds.set(name, led);
    strips.append(st);
  }
  half.append(strips);
  const clr = el('button', { class: 'sweep', style: 'margin-top:8px;align-self:flex-start' }, 'CLEAR');
  clr.addEventListener('click', () => { soloName = null; mutedNames.clear(); audio.setLayerSolo(null); for (const n of audio.layerNames) audio.setLayerMute(n, false); refresh(); });
  half.append(clr);
  $mixer.append(half);
  // activity LEDs (heuristic) on the rAF
  setInterval(() => {
    const bar = stage.curBar(), sec = sectionAt(bar).section, playing = stage.isPlaying() && state.source === 'live';
    const onset: Record<string, boolean> = {
      kick: true, perc: sec === 'prechorus' || sec === 'chorus' || sec === 'drop', bass: true, pad: true, drone: true,
      choir: state.coh > 0.6, arp: (sec === 'prechorus' || sec === 'chorus') && state.heat > 0.25,
      riff: state.track === 'surge' && sec !== 'bridge' && sec !== 'chorus', hook: (sec === 'chorus' || sec === 'drop') && state.coh > 0.3,
      delay: (sec === 'chorus' || sec === 'drop') && state.coh > 0.3, boss: false,
    };
    for (const [name, led] of leds) {
      led.classList.toggle('on', !!(playing && onset[name] && !mutedNames.has(name) && (!soloName || soloName === name)));
    }
  }, 120);

  buildDeck();
}

function buildDeck(): void {
  const deck = el('div', { class: 'deck' });
  const dtabs = el('div', { class: 'dtabs' });
  const body = el('div', { class: 'pads' });
  const panels: Record<string, () => HTMLElement[]> = {
    SFX: () => {
      const fire = (label: string, fn: () => void, primary = false): HTMLButtonElement => {
        const b = el('button', { class: 'pad' + (primary ? ' primary' : '') }, label);
        b.addEventListener('click', () => { fn(); b.classList.add('fired'); setTimeout(() => b.classList.remove('fired'), 120); });
        return b;
      };
      let combo = 0;
      const knob = el('label', {}, 'combo', (() => { const i = el('input', { type: 'range', min: '0', max: '30', step: '1', value: '0', style: 'width:80px' }) as HTMLInputElement; i.addEventListener('input', () => (combo = +i.value)); return i; })());
      return [el('div', { class: 'knobrow' }, knob) as unknown as HTMLButtonElement, fire('thunk', () => audio.thunk(combo, 0)), fire('explosion', () => audio.explosion(1, 0)), fire('graze', () => audio.graze()), fire('pickup', () => audio.pickup(6)), fire('combo break', () => audio.comboBreak())];
    },
    DASH: () => [pad('whoosh', () => audio.whoosh()), pad('slow-mo', () => audio.slowmoSnap()), pad('perfect snare', () => audio.perfectDashSnare(audio.clock + 0.02))],
    HERO: () => [pad('OVERDRIVE', () => audio.overdriveBurst(), true), pad('COMBO ERUPT', () => audio.comboErupt()), pad('LAST BREATH', () => audio.lastBreath()), pad('power-up', () => audio.powerup()), pad('death', () => audio.death())],
    BOSS: () => {
      const sel = el('select', {});
      for (const k of ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign']) sel.append(el('option', { value: k }, k.toUpperCase()));
      return [sel as unknown as HTMLButtonElement, pad('ON', () => audio.bossMusic(true, (sel as HTMLSelectElement).value as EnemyKind), true), pad('OFF', () => audio.bossMusic(false)), pad('stinger', () => audio.bossStinger()), pad('warn', () => audio.bossWarn())];
    },
    MIX: () => (['combat', 'menu', 'overdrive', 'death'] as const).map((s) => pad(s.toUpperCase(), () => audio.setMixState(s))),
  };
  function pad(label: string, fn: () => void, primary = false): HTMLButtonElement {
    const b = el('button', { class: 'pad' + (primary ? ' primary' : '') }, label);
    b.addEventListener('click', () => { fn(); b.classList.add('fired'); setTimeout(() => b.classList.remove('fired'), 120); });
    return b;
  }
  const showTab = (name: string): void => { body.innerHTML = ''; for (const n of panels[name]()) body.append(n); dtabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.textContent === name)); };
  for (const name of Object.keys(panels)) { const b = el('button', {}, name); b.addEventListener('click', () => showTab(name)); dtabs.append(b); }
  deck.append(dtabs, body);
  $mixer.append(deck);
  showTab('SFX');
}

// ── feedback artifact: copy a reproducible state (stamped with the pass) ──────────
function copyState(): void {
  const bar = stage.curBar(), s = sectionAt(bar);
  const txt = `LANCEFALL audio state · PASS ${CURRENT_PASS.pass}
source=${state.source} track=${state.track} section=${s.section} bar=${s.barInSection + 1}
coherence=${state.coh.toFixed(2)} heat=${state.heat.toFixed(2)} tier=${state.tier}
solo=${soloName || 'none'} muted=[${[...mutedNames].join(',')}]
(reproduce: set these drivers on the matching engine pass; cross-pass renders differ)`;
  navigator.clipboard?.writeText(txt);
  const c = $transport.querySelector('.lbl');
  if (c) { const o = c.textContent; c.textContent = 'COPIED ✓'; setTimeout(() => (c.textContent = o), 1200); }
}
async function exportWav(): Promise<void> {
  const buf = stage.renderBuf || (await renderClip({ seconds: 46, track: state.track, coherence: 0.1, heat: 0.2, coherenceTo: 0.92, heatTo: 0.85, tierTo: 3 }));
  const url = URL.createObjectURL(audioBufferToWav(buf));
  const a = el('a', { href: url, download: `lancefall-${state.track}.wav` }); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ── keyboard ──────────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (typingInField()) return;
  if (e.key === ' ') { e.preventDefault(); stage.isPlaying() ? stage.stop() : stage.play(); }
  else if (e.key === 'Escape') stage.panic();
  else if (e.key === 'm' || e.key === 'M') (document.querySelector('.markerform .sweep') as HTMLButtonElement)?.click();
  else if (e.key === 't' || e.key === 'T') (document.querySelector('.chip') as HTMLButtonElement)?.click();
});

// ── boot ────────────────────────────────────────────────────────────────────────
const gate = document.getElementById('gate')!;
document.getElementById('start')!.addEventListener('click', () => {
  audio.ensure(); audio.setVolumes(0.85, 0.9, 0.6); audio.setSoundtrack(state.track); audio.setCoherence(state.coh, state.tier); audio.setIntensity(state.heat);
  ensurePlayback();
  gate.remove();
  buildTransport(); buildStage(); buildMixer(); buildRail();
  rebuildRailDrivers = () => { /* drivers re-read state on next tab open */ updateTransport(); };
  stage.start();
});
