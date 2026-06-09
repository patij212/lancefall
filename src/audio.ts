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
  private ducked = false;

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
  // boss tension layer
  private bossVoice: { osc: OscillatorNode; gain: GainNode } | null = null;

  // procedural music (beat-driven, A-minor pentatonic — can't sound "wrong")
  private musicTimer = 0;
  private musicStep = 0;
  private nextNoteT = 0;
  private musicHeat = 0;
  private bossArp = false;
  private readonly bpm = 112;

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
    this.musicBus.gain.setTargetAtTime(music * (this.ducked ? 0.15 : 1), t, 0.02);
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

  /** OVERDRIVE activation — a 3-layer hero stinger: sub sweep (weight) + rising
   *  noise shred (bullets dissolving) + a bright staggered F-A-C chord (triumph). */
  overdriveBurst(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    // (a) deep sub sweep 90 → 32 Hz
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    const sg = ctx.createGain();
    sub.frequency.setValueAtTime(90, t);
    sub.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.0008, t + 0.6);
    sub.connect(sg);
    sg.connect(this.sfxBus);
    sub.start(t);
    sub.stop(t + 0.62);
    sub.onended = () => { sub.disconnect(); sg.disconnect(); };
    // (b) rising high-passed noise shred
    const n = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(800, t);
    f.frequency.exponentialRampToValueAtTime(5000, t + 0.4);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.28, t + 0.03);
    ng.gain.exponentialRampToValueAtTime(0.0006, t + 0.5);
    n.connect(f);
    f.connect(ng);
    ng.connect(this.sfxBus);
    n.start(t);
    n.stop(t + 0.5);
    n.onended = () => { n.disconnect(); f.disconnect(); ng.disconnect(); };
    // (c) bright sawtooth chord F-A-C, staggered attack
    [349.23, 440, 523.25].forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      const g = ctx.createGain();
      const st = t + i * 0.04;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.17, st + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0006, st + 0.6);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(st);
      o.stop(st + 0.62);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    });
  }

  /** LAST BREATH — the bullet-time second wind: a deep slowed heartbeat thump +
   *  a reverse-swell "inhale" that signals time dilating around you. */
  lastBreath(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    // (a) deep heartbeat — a low sine that drops and lingers
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    const sg = ctx.createGain();
    sub.frequency.setValueAtTime(70, t);
    sub.frequency.exponentialRampToValueAtTime(38, t + 0.6);
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
    sg.gain.exponentialRampToValueAtTime(0.0008, t + 0.9);
    sub.connect(sg);
    sg.connect(this.sfxBus);
    sub.start(t);
    sub.stop(t + 0.92);
    sub.onended = () => { sub.disconnect(); sg.disconnect(); };
    // (b) reverse-swell inhale — band-passed noise rising then cutting (time stretch)
    const n = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.7);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.22, t + 0.5);
    ng.gain.exponentialRampToValueAtTime(0.0006, t + 0.78);
    n.connect(f);
    f.connect(ng);
    ng.connect(this.sfxBus);
    n.start(t);
    n.stop(t + 0.8);
    n.onended = () => { n.disconnect(); f.disconnect(); ng.disconnect(); };
  }

  /** COMBO ERUPTION — a bright detonation when a high combo cashes in: a sub kick
   *  + a fast rising sweep + a major-third stab. Punchier/shorter than OVERDRIVE. */
  comboErupt(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    // (a) sub kick
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    const sg = ctx.createGain();
    sub.frequency.setValueAtTime(150, t);
    sub.frequency.exponentialRampToValueAtTime(48, t + 0.2);
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    sg.gain.exponentialRampToValueAtTime(0.0008, t + 0.3);
    sub.connect(sg);
    sg.connect(this.sfxBus);
    sub.start(t);
    sub.stop(t + 0.32);
    sub.onended = () => { sub.disconnect(); sg.disconnect(); };
    // (b) fast rising sweep (the shockwave)
    const n = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(4200, t + 0.22);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.24, t + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0006, t + 0.28);
    n.connect(f);
    f.connect(ng);
    ng.connect(this.sfxBus);
    n.start(t);
    n.stop(t + 0.3);
    n.onended = () => { n.disconnect(); f.disconnect(); ng.disconnect(); };
    // (c) bright C-E stab
    [523.25, 659.25].forEach((freq) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0006, t + 0.35);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(t);
      o.stop(t + 0.37);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    });
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
    this.startMusic();
  }

  /** Heat 0..1+: fades in more voices and opens the filter as the wave climbs. */
  setIntensity(n: number): void {
    this.musicHeat = n;
    const ctx = this.ctx;
    if (!ctx || !this.droneOn || !this.droneFilter) return;
    const t = ctx.currentTime;
    const k = Math.min(1, n);
    this.droneFilter.frequency.setTargetAtTime(700 + k * 2800, t, 0.5);
    const targets = [0.16, k > 0.33 ? 0.1 : 0.0001, k > 0.55 ? 0.09 : 0.0001, k > 0.8 ? 0.07 : 0.0001];
    this.drone.forEach((v, i) => v.gain.gain.setTargetAtTime(targets[i] ?? 0.0001, t, 0.5));
  }

  // ── procedural music: a lookahead beat sequencer ──────────────────────

  private startMusic(): void {
    const ctx = this.ctx;
    if (!ctx || this.musicTimer) return;
    this.musicStep = 0;
    this.nextNoteT = ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 25);
  }

  private stopMusic(): void {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = 0;
    }
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const sixteenth = 60 / this.bpm / 4;
    while (this.nextNoteT < ctx.currentTime + 0.1) {
      this.playStep(this.musicStep % 16, this.nextNoteT);
      this.nextNoteT += sixteenth;
      this.musicStep++;
    }
  }

  // A-minor pentatonic across two octaves (consonant by construction)
  private static PENTA = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63, 392];
  private static ARP = [5, 7, 9, 7, 6, 9, 7, 5]; // indices into PENTA, per beat

  private playStep(s: number, t: number): void {
    const heat = this.musicHeat;
    // KICK on every beat — drive
    if (s % 4 === 0) this.kick(t, 0.16);
    // BASS pulse on beats 1 and 3
    if (s === 0 || s === 8) this.bassNote(t, 110, 0.18);
    if (s === 8 && heat > 0.5) this.bassNote(t, 146.83, 0.12); // a little movement when hot
    // ARP on offbeat 8ths, density rising with heat
    const onArp = heat > 0.25 && s % 2 === 1 && (heat > 0.6 || s % 4 === 1);
    if (onArp) {
      const idx = Math.floor(this.musicStep / 2) % AudioEngine.ARP.length;
      const base = AudioEngine.PENTA[AudioEngine.ARP[idx] % AudioEngine.PENTA.length];
      const freq = this.bossArp ? base * 0.75 : base; // boss: drop a touch, darker
      this.pluck(t, freq, 0.22, Math.min(0.06, 0.03 + heat * 0.04));
    }
  }

  private kick(t: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.18);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  private bassNote(t: number, freq: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.24);
    osc.onended = () => {
      osc.disconnect();
      lp.disconnect();
      g.disconnect();
    };
  }

  private pluck(t: number, freq: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  /** Layer in a dissonant tritone voice while a boss is alive (and remove it). */
  bossMusic(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.bossArp = on; // the arp drops darker during a boss fight
    const t = ctx.currentTime;
    if (on) {
      if (this.bossVoice || !this.droneFilter) return;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55 * Math.pow(2, 6 / 12); // tritone above the root — tension
      osc.detune.value = 5;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      osc.connect(g);
      g.connect(this.droneFilter);
      osc.start(t);
      g.gain.setTargetAtTime(0.06, t, 0.4);
      this.bossVoice = { osc, gain: g };
    } else {
      if (!this.bossVoice) return;
      const v = this.bossVoice;
      this.bossVoice = null;
      v.gain.gain.setTargetAtTime(0.0001, t, 0.2);
      v.osc.stop(t + 0.6);
      v.osc.onended = () => {
        v.osc.disconnect();
        v.gain.disconnect();
      };
    }
  }

  /** Triumphant rising chord when a boss is felled. */
  bossStinger(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const freqs = [440, 554, 659, 880];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      const st = t + i * 0.05;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.16, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0006, st + 0.5);
      osc.connect(g);
      g.connect(this.sfxBus);
      osc.start(st);
      osc.stop(st + 0.55);
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
      };
    });
  }

  stopDrone(): void {
    const ctx = this.ctx;
    if (!ctx || !this.droneOn) return;
    this.stopMusic();
    this.bossArp = false;
    this.bossMusic(false);
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
    this.ducked = on;
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
