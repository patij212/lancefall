// Fully-synthesized audio engine (Web Audio). No asset downloads. All timing is
// scheduled against ctx.currentTime so combo-pitched thunks and the adaptive
// drone never drift. Lazily created on the first user gesture (autoplay policy).

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;

  private masterVol = 0.8;
  private sfxVol = 0.9;
  private musicVol = 0.6;

  // throttle to survive massacres without clipping / main-thread stalls
  private thunkCount = 0;
  private lastThunkT = 0;

  // charge voice
  private chargeOsc: OscillatorNode | null = null;
  private chargeGain: GainNode | null = null;
  private chargeFilter: BiquadFilterNode | null = null;

  // drone voices
  private drone: { osc: OscillatorNode; gain: GainNode }[] = [];
  private droneFilter: BiquadFilterNode | null = null;
  private droneOn = false;

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Create/resume the context. MUST be called from a user gesture. */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.masterVol;

    // soft-clip limiter on the bus so massive chains don't clip harshly
    const limiter = ctx.createWaveShaper();
    limiter.curve = softClip(2.2);
    limiter.oversample = '2x';
    this.master.connect(limiter);
    limiter.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol;
    this.musicBus.connect(this.master);

    // feedback-delay "reverb" send tapped from the sfx bus
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.16;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    const send = ctx.createGain();
    send.gain.value = 0.18;
    this.sfxBus.connect(send);
    send.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.master);

    // cached white-noise buffer
    const len = Math.floor(ctx.sampleRate * 1.0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  setVolumes(master: number, sfx: number, music: number): void {
    this.masterVol = master;
    this.sfxVol = sfx;
    this.musicVol = music;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.02);
    this.musicBus.gain.setTargetAtTime(music * (this.droneOn ? 1 : 1), t, 0.02);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  // ── one-shot helpers ──────────────────────────────────────────────────

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    return src;
  }

  /** Bass "thunk" on a kill — pitched UP with the combo so a clean run plays an
   *  ascending scale. */
  thunk(combo: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (this.thunkCount > 8 && t - this.lastThunkT < 0.02) return;
    this.lastThunkT = t;
    this.thunkCount++;

    const semis = Math.min(combo, 14);
    const base = 90 * Math.pow(2, semis / 12);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(base * 1.6, t);
    osc.frequency.exponentialRampToValueAtTime(base * 0.55, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.18);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
      this.thunkCount = Math.max(0, this.thunkCount - 1);
    };

    // transient click
    const click = this.noiseSource();
    const cg = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    cg.gain.setValueAtTime(0.25, t);
    cg.gain.exponentialRampToValueAtTime(0.0008, t + 0.05);
    click.connect(lp);
    lp.connect(cg);
    cg.connect(this.sfxBus);
    click.start(t);
    click.stop(t + 0.06);
    click.onended = () => {
      click.disconnect();
      lp.disconnect();
      cg.disconnect();
    };
  }

  /** Dash whoosh — filtered noise sweep. */
  whoosh(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.exponentialRampToValueAtTime(2000, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.18);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  }

  /** Slow-mo snap-back — reverse-ish pitch whoosh. */
  slowmoSnap(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(2000, t);
    bp.frequency.exponentialRampToValueAtTime(320, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.24);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  }

  graze(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.05);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.06);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  pickup(streak: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 700 * Math.pow(2, Math.min(streak, 12) / 24);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.08);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.09);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  comboBreak(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.32);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.34);
    osc.onended = () => {
      osc.disconnect();
      lp.disconnect();
      g.disconnect();
    };
  }

  explosion(size = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800 * size, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * size, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.25);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.28);
    src.onended = () => {
      src.disconnect();
      lp.disconnect();
      g.disconnect();
    };
    // low body
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.35 * size, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0006, t + 0.2);
    osc.connect(og);
    og.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.22);
    osc.onended = () => {
      osc.disconnect();
      og.disconnect();
    };
  }

  bossWarn(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.linearRampToValueAtTime(48, t + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.7);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.72);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  death(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const det of [-7, 0, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220 + det, t);
      osc.frequency.exponentialRampToValueAtTime(55 + det, t + 0.7);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2600, t);
      lp.frequency.exponentialRampToValueAtTime(180, t + 0.7);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0006, t + 0.8);
      osc.connect(lp);
      lp.connect(g);
      g.connect(this.sfxBus);
      osc.start(t);
      osc.stop(t + 0.82);
      osc.onended = () => {
        osc.disconnect();
        lp.disconnect();
        g.disconnect();
      };
    }
  }

  // ── charge voice (continuous) ─────────────────────────────────────────

  startCharge(): void {
    const ctx = this.ctx;
    if (!ctx || this.chargeOsc) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 180;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    lp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.05);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    this.chargeOsc = osc;
    this.chargeGain = g;
    this.chargeFilter = lp;
  }

  setCharge(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.chargeOsc || !this.chargeFilter) return;
    const t = ctx.currentTime;
    this.chargeOsc.frequency.setTargetAtTime(180 + level * 360, t, 0.02);
    this.chargeFilter.frequency.setTargetAtTime(400 + level * 2600, t, 0.02);
  }

  endCharge(): void {
    const ctx = this.ctx;
    if (!ctx || !this.chargeOsc || !this.chargeGain) return;
    const t = ctx.currentTime;
    const osc = this.chargeOsc;
    const g = this.chargeGain;
    const lp = this.chargeFilter;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.0001, t, 0.03);
    osc.stop(t + 0.12);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
      lp?.disconnect();
    };
    this.chargeOsc = null;
    this.chargeGain = null;
    this.chargeFilter = null;
  }

  // ── adaptive drone ────────────────────────────────────────────────────

  startDrone(): void {
    const ctx = this.ctx;
    if (!ctx || this.droneOn) return;
    this.droneOn = true;
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 1;
    filter.connect(this.musicBus);
    this.droneFilter = filter;

    // root + fifth + octave, detuned for movement
    const freqs = [55, 55 * 1.5, 110, 110 * 1.5];
    this.drone = freqs.map((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.value = f;
      osc.detune.value = (i - 1.5) * 6;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.16 : 0.0001; // only root audible at first
      osc.connect(g);
      g.connect(filter);
      osc.start(t);
      return { osc, gain: g };
    });
  }

  /** Heat 0..1+: fades in more voices and opens the filter as the wave climbs. */
  setIntensity(n: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.droneOn || !this.droneFilter) return;
    const t = ctx.currentTime;
    const k = Math.min(1, n);
    this.droneFilter.frequency.setTargetAtTime(700 + k * 2800, t, 0.5);
    const targets = [0.16, k > 0.33 ? 0.1 : 0.0001, k > 0.55 ? 0.09 : 0.0001, k > 0.8 ? 0.07 : 0.0001];
    this.drone.forEach((v, i) => v.gain.gain.setTargetAtTime(targets[i] ?? 0.0001, t, 0.5));
  }

  stopDrone(): void {
    const ctx = this.ctx;
    if (!ctx || !this.droneOn) return;
    const t = ctx.currentTime;
    for (const v of this.drone) {
      v.gain.gain.setTargetAtTime(0.0001, t, 0.1);
      v.osc.stop(t + 0.4);
      v.osc.onended = () => {
        v.osc.disconnect();
        v.gain.disconnect();
      };
    }
    this.droneFilter?.disconnect();
    this.drone = [];
    this.droneFilter = null;
    this.droneOn = false;
  }

  duckMusic(on: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(on ? this.musicVol * 0.15 : this.musicVol, t, 0.08);
  }
}

/** Gentle tanh-ish soft-clip curve for the master limiter. */
function softClip(k: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * k);
  }
  return curve;
}
