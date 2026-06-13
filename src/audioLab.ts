// src/audioLab.ts — DEV-ONLY sound bench (served at /audiolab.html in `npm run dev`).
// Inline playback (no downloads), live song-section preview + transport readout, per-layer
// solo/mute, every SFX, and offline WAV export. Not in the prod build (only index.html).

import { AudioEngine } from './audio';
import type { EnemyKind } from './types';
import { transportAt, sectionAt } from './musicTransport';

const audio = new AudioEngine();
const app = document.getElementById('app')!;
const gate = document.getElementById('gate')!;
const startBtn = document.getElementById('start')!;

// a separate AudioContext for INLINE playback of rendered clips (the live engine keeps
// its own context for the live soundtrack + SFX).
let pctx: AudioContext | null = null;
const ensurePlayback = (): AudioContext => (pctx ??= new (window.AudioContext ?? (window as any).webkitAudioContext)());

let coh = 0.0;
let tier = 0;
let heat = 0.3;
let chargeOn = false;
const pushCoherence = (): void => audio.setCoherence(coh, tier);

startBtn.addEventListener('click', () => {
  audio.ensure();
  audio.setVolumes(0.85, 0.9, 0.6);
  ensurePlayback();
  gate.remove();
});

// ── tiny DOM helpers ────────────────────────────────────────────────────────
type Attrs = Record<string, string>;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  for (const c of kids) n.append(c);
  return n;
}
function panel(title: string): HTMLElement {
  const p = el('div', { class: 'panel' });
  p.append(el('h2', {}, title));
  return p;
}
function btn(parent: HTMLElement, label: string, on: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', cls ? { class: cls } : {}, label);
  b.addEventListener('click', on);
  parent.append(b);
  return b;
}
function row(parent: HTMLElement): HTMLElement {
  const r = el('div', { class: 'row' });
  parent.append(r);
  return r;
}
function slider(parent: HTMLElement, label: string, min: number, max: number, step: number, value: number, on: (v: number) => void): void {
  const span = el('span', { class: 'val' }, value.toFixed(2));
  const l = el('label', { class: 'setting' }, `${label} `, span);
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) }) as HTMLInputElement;
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    span.textContent = v.toFixed(2);
    on(v);
  });
  parent.append(l, input);
}

const cols = el('div', { class: 'cols' });
app.append(cols);

// ── render helpers (offline bounce) ──────────────────────────────────────────
interface RenderOpts { seconds: number; coherence?: number; tier?: number; heat?: number; track?: 'aurora' | 'surge'; boss?: string; coherenceTo?: number; heatTo?: number; tierTo?: number; startBar?: number }
async function renderClip(o: RenderOpts): Promise<AudioBuffer> {
  return new AudioEngine().renderOffline(o as Parameters<AudioEngine['renderOffline']>[0]);
}
function analyzeBuffer(buf: AudioBuffer): { peak: number; rms: number; dbPeak: number; dbRms: number; zcr: number } {
  const ch = buf.getChannelData(0);
  let peak = 0, sumsq = 0, zc = 0, prev = 0;
  for (let i = 0; i < ch.length; i++) {
    const x = ch[i], a = x < 0 ? -x : x;
    if (a > peak) peak = a;
    sumsq += x * x;
    if ((x >= 0) !== (prev >= 0)) zc++;
    prev = x;
  }
  const db = (v: number): number => +(20 * Math.log10(v || 1e-9)).toFixed(1);
  return { peak: +peak.toFixed(4), rms: +Math.sqrt(sumsq / ch.length).toFixed(4), dbPeak: db(peak), dbRms: db(Math.sqrt(sumsq / ch.length)), zcr: +(zc / ch.length).toFixed(5) };
}
function audioBufferToWav(buf: AudioBuffer): Blob {
  const numCh = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length, blockAlign = numCh * 2, dataLen = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataLen), dv = new DataView(ab);
  const ws = (off: number, s: string): void => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, numCh, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * blockAlign, true);
  dv.setUint16(32, blockAlign, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, dataLen, true);
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buf.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < numCh; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2; }
  return new Blob([ab], { type: 'audio/wav' });
}
(window as any).__renderAnalyze = async (o: RenderOpts) => analyzeBuffer(await renderClip(o));
(window as any).__renderWav = async (o: RenderOpts) => {
  const bytes = new Uint8Array(await audioBufferToWav(await renderClip(o)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

// ── INLINE PLAYER (waveform + playhead + loop + click-seek + A/B) ────────────
const player = (() => {
  let buf: AudioBuffer | null = null;
  let src: AudioBufferSourceNode | null = null;
  let playing = false, loop = true, startedAt = 0, offset = 0, raf = 0;
  const slots: Record<'A' | 'B', { buf: AudioBuffer; label: string } | null> = { A: null, B: null };
  const canvas = el('canvas', { class: 'wave' }) as HTMLCanvasElement;
  canvas.width = 600; canvas.height = 90;
  const c2d = canvas.getContext('2d')!;
  const nameEl = el('span', { class: 'nowlabel' }, 'no clip loaded');
  const timeEl = el('span', { class: 'val' }, '0.0s');

  const pos = (): number => {
    if (!buf) return 0;
    let p = playing ? offset + (ensurePlayback().currentTime - startedAt) : offset;
    if (loop && buf.duration > 0) p %= buf.duration;
    return Math.min(Math.max(0, p), buf.duration);
  };
  const drawWave = (): void => {
    c2d.clearRect(0, 0, canvas.width, canvas.height);
    if (!buf) return;
    const ch = buf.getChannelData(0), W = canvas.width, H = canvas.height, mid = H / 2, block = Math.floor(ch.length / W) || 1;
    c2d.fillStyle = '#1b2236';
    c2d.fillRect(0, 0, W, H);
    c2d.strokeStyle = '#5beaff';
    c2d.beginPath();
    for (let x = 0; x < W; x++) {
      let max = 0;
      for (let i = 0; i < block; i++) { const v = Math.abs(ch[x * block + i] || 0); if (v > max) max = v; }
      c2d.moveTo(x + 0.5, mid - max * mid);
      c2d.lineTo(x + 0.5, mid + max * mid);
    }
    c2d.stroke();
  };
  const drawPlayhead = (): void => {
    drawWave();
    if (!buf) return;
    const x = (pos() / buf.duration) * canvas.width;
    c2d.strokeStyle = '#fde047';
    c2d.beginPath();
    c2d.moveTo(x, 0);
    c2d.lineTo(x, canvas.height);
    c2d.stroke();
  };
  const tick = (): void => {
    if (!playing) return;
    timeEl.textContent = pos().toFixed(1) + 's';
    drawPlayhead();
    raf = requestAnimationFrame(tick);
  };
  const stop = (): void => {
    if (src) { try { src.stop(); } catch { /* already stopped */ } src.disconnect(); src = null; }
    playing = false;
    cancelAnimationFrame(raf);
  };
  const play = (from = 0): void => {
    const pc = ensurePlayback();
    stop();
    if (!buf) return;
    src = pc.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.connect(pc.destination);
    offset = from;
    startedAt = pc.currentTime;
    src.start(0, from);
    playing = true;
    src.onended = () => { if (!loop) { playing = false; offset = 0; cancelAnimationFrame(raf); drawPlayhead(); } };
    tick();
  };
  const load = (b: AudioBuffer, label: string, autoplay = true): void => {
    stop();
    buf = b;
    offset = 0;
    nameEl.textContent = label + `  (${b.duration.toFixed(1)}s)`;
    drawWave();
    if (autoplay) play(0);
  };
  canvas.addEventListener('click', (e) => { if (buf) play((e.offsetX / canvas.width) * buf.duration); });
  return {
    canvas, nameEl, timeEl, load, play, stop,
    setLoop: (v: boolean) => { loop = v; if (src) src.loop = v; },
    storeTo: (k: 'A' | 'B') => { if (buf) slots[k] = { buf, label: nameEl.textContent || k }; },
    recall: (k: 'A' | 'B') => { const s = slots[k]; if (s) load(s.buf, s.label); },
  };
})();

// ── TRANSPORT / NOW PLAYING (top) ─────────────────────────────────────────────
{
  const p = panel('Transport · inline player');
  const live = el('div', { class: 'hint' }, '⏸ live soundtrack stopped');
  p.append(live);
  setInterval(() => {
    const mt = audio.musicTime;
    if (audio.musicRunning && mt > 0) {
      const pos = transportAt(mt);
      const s = sectionAt(pos.bar);
      live.textContent = `▶ LIVE  ${audio.soundtrackId.toUpperCase()}  ·  ${s.section.toUpperCase()}  ·  bar ${s.barInSection + 1}/${s.sectionBars}  beat ${pos.beatInBar + 1}  ·  coh ${coh.toFixed(2)}  heat ${heat.toFixed(2)}`;
    } else {
      live.textContent = '⏸ live soundtrack stopped — press ▶ Start music below';
    }
  }, 120);
  p.append(player.canvas);
  const r = row(p);
  btn(r, '▶ play', () => player.play(0), 'primary');
  btn(r, '■ stop', () => player.stop(), 'warn');
  const loopWrap = el('label', { class: 'setting setting-toggle' }, el('span', {}, 'loop'));
  const loopCb = el('input', { type: 'checkbox' }) as HTMLInputElement;
  loopCb.checked = true;
  loopCb.addEventListener('change', () => player.setLoop(loopCb.checked));
  loopWrap.append(loopCb);
  r.append(loopWrap);
  const r2 = row(p);
  btn(r2, 'store → A', () => player.storeTo('A'));
  btn(r2, 'store → B', () => player.storeTo('B'));
  btn(r2, 'recall A', () => player.recall('A'));
  btn(r2, 'recall B', () => player.recall('B'));
  p.append(player.nameEl, ' ', player.timeEl);
  cols.append(p);
}

// ── SECTION PREVIEW (render a section + play it inline, instantly) ────────────
{
  const p = panel('Section preview (inline)');
  const SECTIONS: [string, number, number][] = [
    ['INTRO/verse', 0, 12], ['PRE-CHORUS', 8, 12], ['CHORUS', 16, 14], ['BRIDGE', 48, 10], ['DROP', 52, 10],
  ];
  const trackOf = (): 'aurora' | 'surge' => audio.soundtrackId;
  const r = row(p);
  for (const [label, startBar, secs] of SECTIONS) {
    btn(r, label, async () => {
      player.nameEl.textContent = `rendering ${label}…`;
      const buf = await renderClip({ seconds: secs, startBar, track: trackOf(), coherence: coh, heat, tier });
      player.load(buf, `${trackOf().toUpperCase()} · ${label} (coh ${coh.toFixed(2)})`);
    });
  }
  btn(row(p), '▶ FULL ARC (dark→bright, 46s)', async () => {
    player.nameEl.textContent = 'rendering full arc…';
    const buf = await renderClip({ seconds: 46, track: trackOf(), coherence: 0.1, heat: 0.2, tier: 0, coherenceTo: 0.92, heatTo: 0.85, tierTo: 3 });
    player.load(buf, `${trackOf().toUpperCase()} · full arc`);
  }, 'primary');
  p.append(el('p', { class: 'hint' }, 'Renders the chosen section at the current COHERENCE/heat and plays it looped. Uses the selected track.'));
  cols.append(p);
}

// ── LAYERS — solo / mute (live soundtrack) ───────────────────────────────────
{
  const p = panel('Layers · solo / mute (live)');
  const grid = el('div', { class: 'layergrid' });
  const refresh = (): void => {
    grid.querySelectorAll<HTMLButtonElement>('button[data-m]').forEach((b) => {
      const st = audio.layerState(b.dataset.m!);
      b.classList.toggle('on', st.muted);
    });
    grid.querySelectorAll<HTMLButtonElement>('button[data-s]').forEach((b) => {
      const st = audio.layerState(b.dataset.s!);
      b.classList.toggle('on', st.soloed);
    });
  };
  for (const name of audio.layerNames) {
    const rowEl = el('div', { class: 'layerrow' }, el('span', { class: 'layername' }, name));
    const m = el('button', { 'data-m': name, class: 'ms' }, 'M');
    m.addEventListener('click', () => { const st = audio.layerState(name); audio.setLayerMute(name, !st.muted); refresh(); });
    const s = el('button', { 'data-s': name, class: 'ms solo' }, 'S');
    s.addEventListener('click', () => { const st = audio.layerState(name); audio.setLayerSolo(st.soloed ? null : name); refresh(); });
    rowEl.append(m, s);
    grid.append(rowEl);
  }
  p.append(grid);
  btn(row(p), 'clear solo + unmute all', () => { audio.setLayerSolo(null); for (const n of audio.layerNames) audio.setLayerMute(n, false); refresh(); });
  p.append(el('p', { class: 'hint' }, 'Affects the LIVE soundtrack (press Start music). Solo overrides mute. Takes effect within a beat.'));
  cols.append(p);
}

// ── SOUNDTRACK (live drivers) ─────────────────────────────────────────────────
{
  const p = panel('Soundtrack (live)');
  const pick = row(p);
  btn(pick, 'AURORA (dreamy)', () => audio.setSoundtrack('aurora'), 'primary');
  btn(pick, 'SURGE (aggressive)', () => audio.setSoundtrack('surge'));
  const r = row(p);
  btn(r, '▶ Start music', () => audio.startDrone(), 'primary');
  btn(r, '■ Stop', () => audio.stopDrone(), 'warn');
  slider(p, 'COHERENCE (brightness + hook bloom)', 0, 1, 0.01, coh, (v) => { coh = v; pushCoherence(); });
  slider(p, 'Combo tier (root transpose 0–6)', 0, 6, 1, tier, (v) => { tier = Math.round(v); pushCoherence(); });
  slider(p, 'Heat (density / arrangement energy)', 0, 1, 0.01, heat, (v) => { heat = v; audio.setIntensity(v); });
  cols.append(p);
}

// ── BOSS THEMES ───────────────────────────────────────────────────────────────
{
  const p = panel('Boss themes');
  const kinds: EnemyKind[] = ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'];
  const sel = el('select', {});
  for (const k of kinds) sel.append(el('option', { value: k }, k.toUpperCase()));
  p.append(sel);
  const r = row(p);
  btn(r, 'Boss ON', () => audio.bossMusic(true, (sel as HTMLSelectElement).value as EnemyKind), 'primary');
  btn(r, 'Boss OFF', () => audio.bossMusic(false));
  btn(r, 'stinger', () => audio.bossStinger());
  btn(r, 'warn', () => audio.bossWarn());
  cols.append(p);
}

// ── MIX STATES ────────────────────────────────────────────────────────────────
{
  const p = panel('Mix states');
  const r = row(p);
  btn(r, 'COMBAT', () => audio.setMixState('combat'), 'primary');
  btn(r, 'MENU', () => audio.setMixState('menu'));
  btn(r, 'OVERDRIVE', () => audio.setMixState('overdrive'));
  btn(r, 'DEATH', () => audio.setMixState('death'));
  cols.append(p);
}

// ── SFX ───────────────────────────────────────────────────────────────────────
{
  const p = panel('Kill / combat SFX');
  let comboN = 0, pan = 0;
  slider(p, 'thunk combo', 0, 30, 1, comboN, (v) => (comboN = Math.round(v)));
  slider(p, 'pan (L ◀ ▶ R)', -1, 1, 0.05, pan, (v) => (pan = v));
  const r = row(p);
  btn(r, 'thunk', () => audio.thunk(comboN, pan));
  btn(r, 'auto-combo ▶', () => { let cc = 0; const id = setInterval(() => { audio.thunk(cc, Math.sin(cc * 0.4)); if (++cc > 24) clearInterval(id); }, 110); });
  const r2 = row(p);
  btn(r2, 'explosion S', () => audio.explosion(0.8, pan));
  btn(r2, 'explosion L', () => audio.explosion(1.4, pan));
  btn(r2, 'graze', () => audio.graze());
  btn(r2, 'pickup', () => audio.pickup(6));
  btn(r2, 'combo break', () => audio.comboBreak());
  cols.append(p);
}

// ── DASH / CHARGE ──────────────────────────────────────────────────────────────
{
  const p = panel('Dash / charge');
  const r = row(p);
  btn(r, 'whoosh', () => audio.whoosh());
  btn(r, 'slow-mo snap', () => audio.slowmoSnap());
  btn(r, 'perfect-dash snare', () => audio.perfectDashSnare(audio.clock + 0.02));
  btn(r, 'start charge', () => { audio.startCharge(); chargeOn = true; });
  slider(p, 'charge level', 0, 1, 0.01, 0, (v) => chargeOn && audio.setCharge(v));
  btn(row(p), 'end charge', () => { audio.endCharge(); chargeOn = false; });
  cols.append(p);
}

// ── HERO MOMENTS ────────────────────────────────────────────────────────────────
{
  const p = panel('Hero moments');
  const r = row(p);
  btn(r, 'OVERDRIVE burst', () => audio.overdriveBurst());
  btn(r, 'COMBO ERUPTION', () => audio.comboErupt());
  btn(r, 'LAST BREATH', () => audio.lastBreath());
  btn(r, 'power-up', () => audio.powerup());
  btn(r, 'death', () => audio.death(), 'warn');
  cols.append(p);
}

// ── MASTER VOLUMES + WAV EXPORT ───────────────────────────────────────────────
{
  const p = panel('Master volumes · WAV export');
  let m = 0.85, s = 0.9, mu = 0.6;
  const apply = (): void => audio.setVolumes(m, s, mu);
  slider(p, 'master', 0, 1, 0.01, m, (v) => { m = v; apply(); });
  slider(p, 'sfx', 0, 1, 0.01, s, (v) => { s = v; apply(); });
  slider(p, 'music', 0, 1, 0.01, mu, (v) => { mu = v; apply(); });
  const out = el('p', { class: 'hint' }, 'Export the current section/arc as a WAV.');
  const dlCur = async (): Promise<void> => {
    const buf = await renderClip({ seconds: 46, track: audio.soundtrackId, coherence: 0.1, heat: 0.2, tier: 0, coherenceTo: 0.92, heatTo: 0.85, tierTo: 3 });
    const a = analyzeBuffer(buf);
    out.textContent = `peak ${a.dbPeak}dB · rms ${a.dbRms}dB · brightness ${a.zcr}`;
    const url = URL.createObjectURL(audioBufferToWav(buf));
    const link = el('a', { href: url, download: `lancefall-${audio.soundtrackId}-arc.wav` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  btn(row(p), '⤓ download full-arc WAV', () => void dlCur());
  p.append(out);
  cols.append(p);
}
