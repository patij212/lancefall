// Fully-synthesized audio engine (Web Audio). No asset downloads. All timing is
// scheduled against ctx.currentTime so combo-pitched thunks and the adaptive
// drone never drift. Lazily created on the first user gesture (autoplay policy).

import { bossTheme } from './bossThemes';
import type { EnemyKind } from './types';
import { COHERENCE_AUDIO, MUSIC_BPM, AUDIO_MASTER, AUDIO_REVERB, AUDIO_SFX, AUDIO_PUMP, AUDIO_MIX, AUDIO_DELAY } from './tune';
import { mulberry32 } from './rng';
import { positionFromStep, sectionAt } from './musicTransport';
import { PENTA, themeFreq, chordAt, chordVoicing, brightnessTier, chordRootMul, PROGRESSIONS } from './musicScore';
import type { Chord } from './musicScore';
import { getTrack, notesAt, type TrackProfile, type SoundtrackId } from './soundtracks';
import { FLAGSHIP_AUDIO_MANIFEST } from './audioManifest';
import { AudioAssetManager } from './audioAssetManager';
import { LayerPlayer } from './layerPlayer';
import { SampleSfxDirector } from './sampleSfx';
import { HybridMusic, type ProceduralHost } from './hybridMusic';

export class AudioEngine {
  // BaseAudioContext so the same graph + scheduler can run on a live AudioContext OR
  // an OfflineAudioContext (the render/verify harness). AudioContext-only members
  // (suspend/resume) are cast at their few call-sites.
  private ctx: BaseAudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;

  // music sub-bus tree (under musicBus) — lets the director fade stems per
  // section and lets the kick sidechain-pump the bass/harmony (synthwave glue).
  private drumsBus!: GainNode;
  private bassBus!: GainNode;
  private harmonyBus!: GainNode; // drone + choir + boss tension chord
  private leadBus!: GainNode; // arp + THE LANCE THEME hook
  private bossBus!: GainNode;
  // production sends
  private musicReverbSend!: GainNode;
  private sfxReverbSend!: GainNode;

  private masterVol = 0.8;
  private sfxVol = 0.9;
  private musicVol = 0.6;
  private mixMul = 1; // current AUDIO_MIX music multiplier (replaces the old binary duck)
  private musicMasterFilter!: BiquadFilterNode; // lowpass on the whole music bus → mix-state muffling
  private airShelf!: BiquadFilterNode; // high-shelf on the music bus, lifted by coherence (spectral brightness)
  private leadDelaySend!: GainNode; // tap from leadBus → tempo-synced ping-pong delay

  // throttle to survive massacres without clipping / main-thread stalls
  private thunkCount = 0;
  private lastThunkT = 0;

  // cosmetic humanization RNG — fixed-seed mulberry32, NEVER world.rng (audio must
  // not perturb a seeded run; the Daily stays bit-identical). Drives per-shot pitch/
  // gain jitter so repeated kills don't sound like an identical machine-gun click.
  private hum = mulberry32(0x1a2b3c4d);
  /** ± `cents` of detune, in cents. */
  private humCents(cents: number = AUDIO_SFX.humCents): number {
    return (this.hum() * 2 - 1) * cents;
  }
  /** A gain multiplier in [1-amt, 1+amt]. */
  private humGain(amt: number = AUDIO_SFX.humGain): number {
    return 1 + (this.hum() * 2 - 1) * amt;
  }

  // charge voice
  private chargeOsc: OscillatorNode | null = null;
  private chargeGain: GainNode | null = null;
  private chargeFilter: BiquadFilterNode | null = null;

  // drone voices
  private drone: { osc: OscillatorNode; gain: GainNode }[] = [];
  private droneFilter: BiquadFilterNode | null = null;
  private droneOn = false;
  // boss tension layer — a per-boss chord of drone voices (see bossThemes.ts)
  private bossVoices: { osc: OscillatorNode; gain: GainNode }[] = [];
  // the active boss's LEAD MOTIF (replaces the LANCE THEME hook during the fight)
  private bossMotif: number[] | null = null;
  private bossMotifGain = 0.09;
  private bossMotifOct = 1;

  // procedural music (beat-driven, A-minor pentatonic — can't sound "wrong")
  private musicTimer = 0;
  private musicStep = 0;
  private nextNoteT = 0;
  private musicHeat = 0;
  private bossArp = false;
  private bossArpMul = 1; // per-boss arp pitch shift (set from the active boss theme)
  private readonly bpm = MUSIC_BPM;
  private musicEpoch = 0; // ctx time of the music's first scheduled note (beat-clock epoch)

  // the selectable soundtrack profile (Settings) — drives groove/density/timbre/theme.
  // Set before ctx exists (just stores data); the scheduler reads it live.
  private track: TrackProfile = getTrack('aurora');

  // ── COHERENCE one-bus (audio half) — Coherence solely owns the drone bloom +
  //    filter now; setIntensity keeps only its arp-density (musicHeat) role. ──
  private rootMul = 1; // current root transpose multiplier (by combo tier)
  private choirVoices: { osc: OscillatorNode; gain: GainNode }[] = [];
  // m9 voicing with an AUDIBLE mid-register 3rd (+3) + 9th (+14) — the old [0,7,12,16,19]
  // buried its only 3rd two octaves up where it read as a faint overtone, not a colour.
  private static CHOIR_SEMIS = [0, 3, 7, 10, 14] as const;

  // THE LANCE THEME lead (the earworm) — its own coherence-gated gain + coherence-
  // opened filter, both SOLELY owned by setCoherence (one controller per knob). The
  // hook is therefore silent until a clean run earns it, then blooms in as the reward.
  private hookGain: GainNode | null = null;
  private hookFilter: BiquadFilterNode | null = null;
  private coherenceVal = 0; // last coherence pushed (the scheduler gates the hook on it)

  // ── HYBRID flagship audio (Deep Dive B): authored beds + sampled SFX over the procedural
  //    engine. All fallback-gated on `authoredActive` — with no/loading assets the procedural
  //    path is byte-identical, and the offline render harness keeps `hybrid` null. ──
  private hybrid: HybridMusic | null = null;
  private sampleSfx: SampleSfxDirector | null = null;
  private loopFilter: BiquadFilterNode | null = null; // lowpass on the authored loop → vertical intensity
  private authoredActive = false; // an authored bed is live → suppress the procedural bed
  private activeBpmVal = MUSIC_BPM; // the ACTIVE source bpm (procedural fallback = MUSIC_BPM)
  private activeEpoch = 0; // ctx-time the active authored loop started (bar-aligned downbeat)
  private reactiveGainVal = 0.35; // procedural reactive (hook/motif/shimmer) level over the bed
  private lastBossKind: EnemyKind | null = null; // remembered for the warden_defeat cue
  private sfxRng = mulberry32(0x9e3779b9); // dedicated cosmetic rng for sampled-SFX variant choice
  // layers the authored bed already supplies — suppressed while an authored source plays; the
  // reactive identity (drone/choir/hook/boss motif/delay) persists as "the procedural instrument".
  private static BED_LAYERS = new Set(['kick', 'bass', 'pad', 'riff', 'arp', 'perc']);

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Seconds on the ACTIVE clock — the authored loop's bar-aligned transport while an authored
   *  source plays (so the felt beat follows the bed at its BPM, Deep Dive A/B), else the procedural
   *  transport. The pure beat clock syncs to this (0 when music isn't running). */
  get musicTime(): number {
    if (!this.ctx) return 0;
    // clamp ≥ 0: a source switch sets activeEpoch to a FUTURE scheduled bar time (~0.1s lookahead),
    // so the raw delta is briefly negative — an unclamped negative would mis-seed the beat reconcile
    // and mis-grade dash-on-beat exactly at bar transitions (matches the transportAt/lab <=0 guards).
    if (this.authoredActive) return Math.max(0, this.ctx.currentTime - this.activeEpoch);
    return this.musicTimer ? this.ctx.currentTime - this.musicEpoch : 0;
  }
  /** The active source's BPM (authored bed while live, else the procedural MUSIC_BPM). The game
   *  loop retempos the cosmetic beat grid to this so the dash-on-beat grid follows the bed. */
  get activeBpm(): number {
    return this.authoredActive ? this.activeBpmVal : this.bpm;
  }
  get musicRunning(): boolean {
    return this.musicTimer !== 0;
  }
  /** Raw audio clock (ctx.currentTime); 0 before the context exists. */
  get clock(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private analyser: AnalyserNode | null = null;
  /** DEV (audio lab): a parallel AnalyserNode tapped off the master sum for live
   *  scope / meter / spectrum. Built on the engine's OWN context (lazily, once) and
   *  connected non-destructively — it only reads, never alters the audible path. */
  getAnalyser(): AnalyserNode | null {
    if (!this.ctx || !this.master) return null;
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.6;
      this.master.connect(this.analyser);
    }
    return this.analyser;
  }

  /** DEV/VERIFY harness — render the music OFFLINE to an AudioBuffer at fixed
   *  (coherence, tier, heat, track, boss). For ear-tests (bounce to WAV) + objective
   *  analysis (peak/RMS/brightness) + a determinism null-test. Call on a THROWAWAY
   *  `new AudioEngine()` — it sets up its own offline context; never touches the live
   *  audio or world.rng. The scheduler is driven manually (no setInterval offline). */
  async renderOffline(opts: {
    seconds: number;
    coherence?: number;
    tier?: number;
    heat?: number;
    track?: SoundtrackId;
    boss?: EnemyKind;
    sampleRate?: number;
    coherenceTo?: number; // if set, coherence ramps coherence→coherenceTo across the render
    heatTo?: number;
    tierTo?: number;
    startBar?: number; // render starting at this absolute bar (preview a specific section)
  }): Promise<AudioBuffer> {
    const sr = opts.sampleRate ?? 44100;
    const seconds = Math.max(1, opts.seconds);
    const OCtor =
      window.OfflineAudioContext ??
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!OCtor) throw new Error('OfflineAudioContext unavailable');
    const octx = new OCtor(2, Math.ceil(sr * seconds), sr);
    this.ctx = octx;
    this.buildGraph(octx);
    this.setSoundtrack(opts.track ?? 'aurora');
    this.setVolumes(0.85, 0.9, 0.72);
    this.buildDroneNodes();
    if (opts.boss) this.bossMusic(true, opts.boss);
    const coh0 = opts.coherence ?? 0.5;
    const heat0 = opts.heat ?? 0.5;
    const tier0 = opts.tier ?? 0;
    const sixteenth = 60 / this.bpm / 4;
    const steps = Math.ceil(seconds / sixteenth);
    const startStep = (opts.startBar ?? 0) * 16; // preview a specific section
    const lerp = (a: number, b: number | undefined, u: number) => (b == null ? a : a + (b - a) * u);
    this.musicStep = startStep;
    this.musicEpoch = 0;
    for (let i = 0; i < steps; i++) {
      const step = startStep + i; // ABSOLUTE step → sectionAt() reads the right section
      const u = steps > 1 ? i / (steps - 1) : 0; // 0..1 progress (for optional ramps)
      this.setIntensity(lerp(heat0, opts.heatTo, u));
      if (step % 16 === 0) this.setCoherence(lerp(coh0, opts.coherenceTo, u), Math.round(lerp(tier0, opts.tierTo, u)));
      this.playStep(step, i * sixteenth + 0.001); // clip starts at t=0
    }
    return await octx.startRendering();
  }

  /** Create/resume the context. MUST be called from a user gesture. */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void (this.ctx as AudioContext).resume();
      return;
    }
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.buildGraph(ctx);
    this.initHybrid(ctx); // live-only (never in the offline render harness) → kicks asset preload
  }

  /** Construct the hybrid flagship layer on a LIVE context and start decoding assets. Kept out
   *  of buildGraph so the offline render harness never fetches/decodes or activates authored music. */
  private initHybrid(ctx: BaseAudioContext): void {
    if (this.hybrid || !this.loopFilter) return;
    const assets = new AudioAssetManager(ctx, FLAGSHIP_AUDIO_MANIFEST);
    const layerPlayer = new LayerPlayer(ctx, this.loopFilter, (id, key) => assets.getTrack(id, key));
    this.sampleSfx = new SampleSfxDirector(ctx, this.sfxBus, FLAGSHIP_AUDIO_MANIFEST.sfx, (id) => assets.getSfx(id), this.sfxRng);
    const host: ProceduralHost = {
      setAuthoredActive: (a) => this.setAuthoredActive(a),
      setReactiveGain: (g) => this.setReactiveGain(g),
      setLoopCutoff: (hz) => this.setLoopCutoff(hz),
      reanchor: (bpm, at) => this.reanchorClock(bpm, at),
    };
    this.hybrid = new HybridMusic({ assets, layerPlayer, sampleSfx: this.sampleSfx, host });
    void assets.preloadCore(); // never throws; a failed asset just keeps the procedural fallback
  }

  // ── ProceduralHost — HybridMusic drives these to suppress/restore the procedural bed, set the
  //    reactive level + loop lowpass, and re-anchor the active clock (all cosmetic/audio-layer). ──
  private setAuthoredActive(active: boolean, at?: number): void {
    this.authoredActive = active;
    if (!this.ctx) return;
    const t = at ?? this.ctx.currentTime;
    // the reactive layer rides at reactiveGain while authored is live, and returns to unity when
    // procedural resumes. leadBus = hook/boss-motif/sparkle; harmonyBus = the sustained COHERENCE
    // drone + choir pad (NOT layer-gated, so it must be ducked here or it muds the full-mix bed —
    // safe: pump()'s sidechain is suppressed while authored since its 'kick' gate is a BED_LAYER).
    const lvl = active ? this.reactiveGainVal : 1;
    this.leadBus.gain.setTargetAtTime(lvl, t, 0.1);
    this.harmonyBus.gain.setTargetAtTime(lvl, t, 0.12);
    if (!active && this.loopFilter) this.loopFilter.frequency.setTargetAtTime(18000, t, 0.1);
  }
  private setReactiveGain(g: number, at?: number): void {
    this.reactiveGainVal = g;
    if (this.ctx && this.authoredActive) {
      const t = at ?? this.ctx.currentTime;
      this.leadBus.gain.setTargetAtTime(g, t, 0.1);
      this.harmonyBus.gain.setTargetAtTime(g, t, 0.12);
    }
  }
  private setLoopCutoff(hz: number, at?: number): void {
    if (this.ctx && this.loopFilter) this.loopFilter.frequency.setTargetAtTime(hz, at ?? this.ctx.currentTime, 0.12);
  }
  private reanchorClock(bpm: number, at: number): void {
    this.activeBpmVal = bpm;
    this.activeEpoch = at || (this.ctx?.currentTime ?? 0);
  }

  /** Read-only boss state from the game loop → drives authored boss-source selection + edge SFX
   *  (warden arrival/phase/fan). Remembers the kind for the warden_defeat cue in bossStinger(). */
  setBossState(kind: EnemyKind | null, phase = 0, subPhase = 0, hpFrac = 1): void {
    if (kind) this.lastBossKind = kind;
    this.hybrid?.setBossState(kind, phase, subPhase, hpFrac);
  }

  /** Build the full bus graph on a context — a live AudioContext, or an
   *  OfflineAudioContext for the render/verify harness. Master chain, sfx/music
   *  buses, sub-bus tree, reverb, noise buffer. */
  private buildGraph(ctx: BaseAudioContext): void {
    const AM = AUDIO_MASTER;
    const AR = AUDIO_REVERB;

    // ── MASTER SUM → PRODUCTION CHAIN → DESTINATION ──
    // master is the single sum point (sfx + music + reverb wet); from there a glue
    // compressor pulls peaks together, makeup recovers level, then a tanh soft-clip
    // is the brickwall safety so massacres never clip harshly.
    this.master = ctx.createGain();
    this.master.gain.value = this.masterVol;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = AM.compThreshold;
    comp.knee.value = AM.compKnee;
    comp.ratio.value = AM.compRatio;
    comp.attack.value = AM.compAttack;
    comp.release.value = AM.compRelease;
    const makeup = ctx.createGain();
    makeup.gain.value = AM.makeup;
    const limiter = ctx.createWaveShaper();
    limiter.curve = softClip(AM.limiterK);
    limiter.oversample = '4x';
    this.master.connect(comp);
    comp.connect(makeup);
    makeup.connect(limiter);
    limiter.connect(ctx.destination);

    // sfx + music sum buses
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);

    // music master lowpass → lets a mix-state DUCK also MUFFLE (distant), not just
    // turn down. Transparent at 20kHz during play; closes for menu/overdrive/death.
    this.musicMasterFilter = ctx.createBiquadFilter();
    this.musicMasterFilter.type = 'lowpass';
    this.musicMasterFilter.frequency.value = AUDIO_MIX.combat.cutoff;
    this.musicMasterFilter.connect(this.master);

    // high-shelf "air" on the music bus — lifted by coherence so the SPECTRUM physically
    // brightens as you flow (not just louder). 0 dB at low coherence (dark by design).
    this.airShelf = ctx.createBiquadFilter();
    this.airShelf.type = 'highshelf';
    this.airShelf.frequency.value = COHERENCE_AUDIO.airShelfHz;
    this.airShelf.gain.value = 0;
    this.airShelf.connect(this.musicMasterFilter);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol;
    this.musicBus.connect(this.airShelf);

    // music sub-bus tree — each stem family gets its own fader under musicBus
    this.drumsBus = ctx.createGain();
    this.bassBus = ctx.createGain();
    this.harmonyBus = ctx.createGain();
    this.leadBus = ctx.createGain();
    this.bossBus = ctx.createGain();
    for (const b of [this.drumsBus, this.bassBus, this.harmonyBus, this.leadBus, this.bossBus]) b.connect(this.musicBus);

    // AUTHORED loop bus: the HybridMusic LayerPlayer feeds this lowpass (loop mix-modulation —
    // its cutoff opens with intensity/COHERENCE, the poor-man's vertical layering on one stereo
    // file) → musicBus, so it shares the coherence air-shelf, mix duck, and master glue.
    this.loopFilter = ctx.createBiquadFilter();
    this.loopFilter.type = 'lowpass';
    this.loopFilter.frequency.value = 18000;
    this.loopFilter.connect(this.musicBus);

    // ── CONVOLUTION REVERB (offline-first synth IR, built once) ──
    // Real space for the music (it was bone dry) + a lusher SFX tail. Tail is
    // lowpassed so it stays dark/lush, never fizzy. Wet returns to the master sum
    // so it shares the glue compressor.
    const conv = ctx.createConvolver();
    conv.buffer = this.makeReverbIR(ctx);
    const revTone = ctx.createBiquadFilter();
    revTone.type = 'lowpass';
    revTone.frequency.value = AR.toneHz;
    const wet = ctx.createGain();
    wet.gain.value = AR.wet;
    conv.connect(revTone);
    revTone.connect(wet);
    wet.connect(this.master);

    this.musicReverbSend = ctx.createGain();
    this.musicReverbSend.gain.value = AR.musicSend;
    this.musicReverbSend.connect(conv);
    this.sfxReverbSend = ctx.createGain();
    this.sfxReverbSend.gain.value = AR.sfxSend;
    this.sfxReverbSend.connect(conv);
    // wettest stems: harmony (pad/choir) + lead; sfx gets a touch. Drums + bass dry.
    this.harmonyBus.connect(this.musicReverbSend);
    this.leadBus.connect(this.musicReverbSend);
    this.sfxBus.connect(this.sfxReverbSend);

    // ── TEMPO-SYNCED PING-PONG DELAY on the lead (the genre's signature "produced"
    // lever; was absent). Dotted-8th echoes cross the stereo field with feedback. ──
    const AD = AUDIO_DELAY;
    const dt = (60 / this.bpm) * AD.beatMul;
    const dL = ctx.createDelay(1);
    const dR = ctx.createDelay(1);
    dL.delayTime.value = dt;
    dR.delayTime.value = dt;
    const fbA = ctx.createGain(); // dL → dR
    const fbB = ctx.createGain(); // dR → dL (the ping-pong loop)
    fbA.gain.value = AD.feedback;
    fbB.gain.value = AD.feedback;
    const panL = ctx.createStereoPanner();
    const panR = ctx.createStereoPanner();
    panL.pan.value = -0.85;
    panR.pan.value = 0.85;
    const delayWet = ctx.createGain();
    delayWet.gain.value = AD.wet;
    this.leadDelaySend = ctx.createGain();
    this.leadDelaySend.gain.value = 1;
    this.leadDelaySend.connect(dL);
    dL.connect(fbA);
    fbA.connect(dR);
    dR.connect(fbB);
    fbB.connect(dL);
    dL.connect(panL);
    dR.connect(panR);
    panL.connect(delayWet);
    panR.connect(delayWet);
    delayWet.connect(this.master);
    // NOTE: only the HOOK feeds the delay (wired in buildDroneNodes via hookGain) — echoing
    // the whole leadBus (arp + riff too) was a big source of clutter. The melody echoes; the
    // texture doesn't.

    // cached white-noise buffer (cosmetic Math.random — never world.rng)
    const len = Math.floor(ctx.sampleRate * 1.0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  /** Build a stereo convolution-reverb impulse: pre-delay of silence, then an
   *  exp-decaying noise tail with slight L/R decorrelation for width. Generated
   *  once at init from Math.random (cosmetic — never the seeded world.rng), so it's
   *  offline-first (no asset download) yet gives the mix genuine spatial depth. */
  private makeReverbIR(ctx: BaseAudioContext): AudioBuffer {
    const AR = AUDIO_REVERB;
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * AR.seconds));
    const pre = Math.floor((rate * AR.predelayMs) / 1000);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      const tail = Math.max(1, len - pre);
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / tail;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, AR.decay);
      }
    }
    return buf;
  }

  setVolumes(master: number, sfx: number, music: number): void {
    this.masterVol = master;
    this.sfxVol = sfx;
    this.musicVol = music;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.02);
    this.musicBus.gain.setTargetAtTime(music * this.mixMul, t, 0.02);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void (this.ctx as AudioContext).suspend();
  }
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void (this.ctx as AudioContext).resume();
  }

  // ── one-shot helpers ──────────────────────────────────────────────────

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    return src;
  }

  /** Click-free, optionally-fat, optionally-panned tonal one-shot — the workhorse
   *  behind most SFX now. Signal: detuned osc pair (warmth) → optional lowpass with
   *  sweep (tames raw-saw buzz) → click-free gain (linear up, exp body, LINEAR ramp
   *  to TRUE zero before stop → no cutoff click) → optional StereoPanner → bus. */
  private voice(o: {
    type: OscillatorType;
    freq: number;
    freqEnd?: number;
    glide?: number; // seconds for the pitch sweep (default: full duration)
    detune?: number; // max detune (cents); the unison voices spread across ±detune
    unison?: number; // # of detuned voices (supersaw) — 1/undefined ⇒ single (or twin if detune set)
    spread?: number; // 0..1 stereo spread of the unison voices (per-voice panning)
    cutoff?: number;
    cutoffEnd?: number;
    filterEnvPeak?: number; // attack-shaped filter: cutoff → this (over attack) → cutoffEnd (motion within the note)
    q?: number;
    attack: number;
    hold?: number;
    decay: number;
    peak: number;
    pan?: number;
    drive?: number; // >1 inserts a tanh waveshaper post-osc for grit/distortion (aggressive timbres)
    bus?: AudioNode; // GainNode by default; a filter when a stem pre-filters (e.g. the lead hook)
    at?: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = o.at ?? ctx.currentTime;
    const dur = Math.max(0.02, o.attack + (o.hold ?? 0) + o.decay);
    const end = t + dur;

    // click-free amplitude envelope (true-zero endpoints)
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.peak, t + Math.max(0.001, o.attack));
    const decayStart = t + o.attack + (o.hold ?? 0);
    if (decayStart > t + o.attack) g.gain.setValueAtTime(o.peak, decayStart);
    const dc = Math.min(AUDIO_SFX.declick, dur * 0.25);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.peak * 0.02), Math.max(decayStart + 0.001, end - dc));
    g.gain.linearRampToValueAtTime(0, end);

    let filt: BiquadFilterNode | null = null;
    if (o.cutoff != null) {
      filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(o.cutoff, t);
      if (o.filterEnvPeak != null) {
        // attack-shaped: snap open to the peak, then settle — gives the note a "finger"
        filt.frequency.linearRampToValueAtTime(o.filterEnvPeak, t + Math.max(0.005, o.attack));
        filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.cutoffEnd ?? o.cutoff), end);
      } else if (o.cutoffEnd != null) {
        filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.cutoffEnd), end);
      }
      if (o.q != null) filt.Q.value = o.q;
      filt.connect(g);
    }
    const inNode: AudioNode = filt ?? g;

    let pan: StereoPannerNode | null = null;
    if (o.pan != null) {
      pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, o.pan));
      g.connect(pan);
      pan.connect(o.bus ?? this.sfxBus);
    } else {
      g.connect(o.bus ?? this.sfxBus);
    }

    // optional tanh waveshaper for grit/distortion (aggressive timbres), post-osc
    let shaper: WaveShaperNode | null = null;
    if (o.drive && o.drive > 1) {
      shaper = ctx.createWaveShaper();
      shaper.curve = softClip(o.drive);
      shaper.oversample = '2x';
      shaper.connect(inNode);
    }
    const oscTarget: AudioNode = shaper ?? inNode;

    // UNISON / SUPERSAW — N detuned voices spread across ±detune cents, optionally
    // panned across the stereo field (per-voice). The single biggest "bigger/fuller"
    // lever (the supersaw): a lush, wide stack. detune-only (no unison) = the 2-osc
    // twin used by the SFX; no detune = a single osc. Backward compatible.
    const n = o.unison && o.unison > 1 ? o.unison : o.detune ? 2 : 1;
    const detAmt = o.detune ?? 0;
    const oscs: OscillatorNode[] = [];
    const voicePans: StereoPannerNode[] = [];
    for (let i = 0; i < n; i++) {
      const frac = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1..1 across the voices
      const osc = ctx.createOscillator();
      osc.type = o.type;
      osc.frequency.setValueAtTime(o.freq, t);
      if (o.freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t + (o.glide ?? dur));
      osc.detune.value = frac * detAmt;
      if (o.spread && n > 1) {
        const vp = ctx.createStereoPanner();
        vp.pan.value = Math.max(-1, Math.min(1, frac * o.spread));
        osc.connect(vp);
        vp.connect(oscTarget);
        voicePans.push(vp);
      } else {
        osc.connect(oscTarget);
      }
      osc.start(t);
      osc.stop(end + 0.02);
      oscs.push(osc);
    }
    oscs[oscs.length - 1].onended = () => {
      for (const osc of oscs) osc.disconnect();
      for (const vp of voicePans) vp.disconnect();
      shaper?.disconnect();
      filt?.disconnect();
      g.disconnect();
      pan?.disconnect();
    };
  }

  /** OVERDRIVE activation — a 3-layer hero stinger: sub sweep (weight) + rising
   *  noise shred (bullets dissolving) + a bright staggered F-A-C chord (triumph). */
  overdriveBurst(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.sampleSfx?.play('overdrive');
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
    // (c) bright, WARM chord F-A-C (detuned twin saws through a lowpass so it's
    //     triumphant, not buzzy), staggered attack, spread across the stereo field.
    const SP = AUDIO_SFX.chordSpread;
    [349.23, 440, 523.25].forEach((freq, i) => {
      this.voice({
        type: 'sawtooth',
        freq,
        detune: AUDIO_SFX.leadDetune,
        cutoff: 3600,
        cutoffEnd: 1600,
        q: 0.6,
        attack: 0.03,
        decay: 0.57,
        peak: 0.16,
        pan: (i - 1) * SP,
        at: t + i * 0.04,
      });
    });
  }

  /** LAST BREATH — the bullet-time second wind: a deep slowed heartbeat thump +
   *  a reverse-swell "inhale" that signals time dilating around you. */
  lastBreath(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.sampleSfx?.play('last_breath');
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
    // (c) bright C-E stab — warm detuned saws, lowpassed, spread L/R
    [523.25, 659.25].forEach((freq, i) => {
      this.voice({
        type: 'sawtooth',
        freq,
        detune: AUDIO_SFX.leadDetune,
        cutoff: 3800,
        cutoffEnd: 1800,
        q: 0.7,
        attack: 0.02,
        decay: 0.33,
        peak: 0.16,
        pan: (i === 0 ? -1 : 1) * AUDIO_SFX.chordSpread * 0.8,
        at: t,
      });
    });
  }

  /** POWER-UP pickup — a bright ascending arpeggio (a clear "you got something good"). */
  powerup(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    // C-E-G-C arpeggio, quick staggered blips that sweep across the stereo field
    const arp = [523.25, 659.25, 783.99, 1046.5];
    arp.forEach((freq, i) => {
      this.voice({
        type: 'triangle',
        freq,
        attack: 0.012,
        decay: 0.2,
        peak: 0.2,
        pan: (i / (arp.length - 1)) * 1.4 - 0.7, // -0.7 → +0.7
        at: t + i * 0.05,
      });
    });
    // a soft shimmer tail
    const n = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 3000;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.12, t + 0.06);
    ng.gain.exponentialRampToValueAtTime(0.0006, t + 0.4);
    n.connect(f);
    f.connect(ng);
    ng.connect(this.sfxBus);
    n.start(t);
    n.stop(t + 0.42);
    n.onended = () => { n.disconnect(); f.disconnect(); ng.disconnect(); };
  }

  /** Bass "thunk" on a kill — pitched UP with the combo so a clean run plays an
   *  ascending scale. `pan` (-1..1) places it where the kill happened on screen;
   *  per-shot pitch/gain humanization keeps a long combo from machine-gunning the
   *  exact same click. */
  thunk(combo: number, pan = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (this.thunkCount > 8 && t - this.lastThunkT < 0.02) return;
    this.lastThunkT = t;
    this.thunkCount++;

    const p = Math.max(-1, Math.min(1, pan));
    this.sampleSfx?.play('lance_hit', { pan: p });
    const semis = Math.min(combo, 14);
    const jitter = Math.pow(2, this.humCents() / 1200); // cents → ratio
    const base = 90 * Math.pow(2, semis / 12) * jitter;
    const peak = 0.5 * this.humGain();

    // punchy pitched body (sine → no buzz), panned to the kill, click-free tail
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const g = ctx.createGain();
    const span = ctx.createStereoPanner();
    span.pan.value = p;
    osc.frequency.setValueAtTime(base * 1.6, t);
    osc.frequency.exponentialRampToValueAtTime(base * 0.55, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
    g.gain.linearRampToValueAtTime(0, t + 0.175);
    osc.connect(g);
    g.connect(span);
    span.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.18);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
      span.disconnect();
      this.thunkCount = Math.max(0, this.thunkCount - 1);
    };

    // transient click — same pan
    const click = this.noiseSource();
    const cg = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const cpan = ctx.createStereoPanner();
    cpan.pan.value = p;
    cg.gain.setValueAtTime(0.25 * this.humGain(), t);
    cg.gain.exponentialRampToValueAtTime(0.0008, t + 0.05);
    click.connect(lp);
    lp.connect(cg);
    cg.connect(cpan);
    cpan.connect(this.sfxBus);
    click.start(t);
    click.stop(t + 0.06);
    click.onended = () => {
      click.disconnect();
      lp.disconnect();
      cg.disconnect();
      cpan.disconnect();
    };
  }

  /** Dash whoosh — filtered noise sweep (+ optional sampled layer). */
  whoosh(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.sampleSfx?.play('dash_fire');
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

  /** PARRY — a short, sharp metallic *ting*: inharmonic partials + a high noise transient.
   *  Brighter/higher on-beat. `hero` adds a bright chord sting for the perfect+on-beat apex.
   *  Cosmetic only (Math.random for the noise tail, like every SFX — never world.rng). */
  parry(onBeat: boolean, hero = false): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const base = onBeat ? 3200 : 2400;
    const ratios = [1, 2.76, 5.4]; // inharmonic (bell/metal) partials
    for (let i = 0; i < ratios.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'triangle' : 'square';
      osc.frequency.value = base * ratios[i];
      const g = ctx.createGain();
      g.gain.setValueAtTime((i === 0 ? 0.16 : 0.05) * (onBeat ? 1.25 : 1), t);
      g.gain.exponentialRampToValueAtTime(0.0006, t + (i === 0 ? 0.09 : 0.05));
      osc.connect(g);
      g.connect(this.sfxBus);
      osc.start(t);
      osc.stop(t + 0.12);
      osc.onended = () => { osc.disconnect(); g.disconnect(); };
    }
    // metallic "click" transient
    const n = this.noiseSource();
    const nf = ctx.createBiquadFilter();
    nf.type = 'highpass';
    nf.frequency.value = 3000;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.12, t);
    ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.03);
    n.connect(nf);
    nf.connect(ng);
    ng.connect(this.sfxBus);
    n.start(t);
    n.stop(t + 0.05);
    n.onended = () => { n.disconnect(); nf.disconnect(); ng.disconnect(); };
    // hero chord sting — a bright triad swell for the perfect+on-beat hero moment
    if (hero) {
      for (const mul of [1, 1.26, 1.5, 2]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = 523.25 * mul; // C major-ish, voiced up
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
        o.connect(g);
        g.connect(this.sfxBus);
        o.start(t);
        o.stop(t + 0.55);
        o.onended = () => { o.disconnect(); g.disconnect(); };
      }
    }
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
    // a deflating downward sweep — warm detuned saw through a closing lowpass
    this.voice({
      type: 'sawtooth',
      freq: 520,
      freqEnd: 120,
      glide: 0.3,
      detune: 9,
      cutoff: 1400,
      cutoffEnd: 480,
      q: 1,
      attack: 0.02,
      decay: 0.32,
      peak: 0.22,
    });
  }

  explosion(size = 1, pan = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const p = Math.max(-1, Math.min(1, pan));
    // shared panner for the whole blast (noise body + low thud stay together in space)
    const span = ctx.createStereoPanner();
    span.pan.value = p;
    span.connect(this.sfxBus);

    const src = this.noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800 * size, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * size, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.25);
    g.gain.linearRampToValueAtTime(0, t + 0.27);
    src.connect(lp);
    lp.connect(g);
    g.connect(span);
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
    og.gain.linearRampToValueAtTime(0, t + 0.21);
    osc.connect(og);
    og.connect(span);
    osc.start(t);
    osc.stop(t + 0.22);
    osc.onended = () => {
      osc.disconnect();
      og.disconnect();
      span.disconnect();
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
    this.lastBossKind = null; // clear any pending warden_defeat (the run ended, not a boss kill)
    const t = ctx.currentTime;
    // a detuned cluster collapsing in pitch + tone — "the light dims". Each voice is
    // itself a warm detuned-twin saw, and the cluster is spread across the stereo field.
    [-7, 0, 7].forEach((det, i) => {
      this.voice({
        type: 'sawtooth',
        freq: 220 + det,
        freqEnd: 55 + det,
        glide: 0.7,
        detune: AUDIO_SFX.leadDetune,
        cutoff: 2600,
        cutoffEnd: 180,
        q: 0.7,
        attack: 0.03,
        decay: 0.77,
        peak: 0.2,
        pan: (i - 1) * 0.42,
        at: t,
      });
    });
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
    if (!this.ctx || this.droneOn) return;
    this.buildDroneNodes();
    this.startMusic();
  }

  /** Build the sustained drone + hook chain nodes (no scheduler). Shared by the live
   *  startDrone and the offline render harness (which schedules the music manually). */
  private buildDroneNodes(): void {
    const ctx = this.ctx;
    if (!ctx || this.droneOn) return;
    this.droneOn = true;
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 1;
    filter.connect(this.harmonyBus);
    this.droneFilter = filter;

    // THE LANCE THEME lead chain: hook voices → hookFilter (opens with coherence) →
    // hookGain (gated by coherence) → leadBus. Both controlled solely by setCoherence.
    const hookFilter = ctx.createBiquadFilter();
    hookFilter.type = 'lowpass';
    hookFilter.frequency.value = COHERENCE_AUDIO.leadFilterBase;
    hookFilter.Q.value = 0.8;
    const hookGain = ctx.createGain();
    hookGain.gain.value = 0.0001;
    hookFilter.connect(hookGain);
    hookGain.connect(this.leadBus);
    hookGain.connect(this.leadDelaySend); // ONLY the hook echoes (the melody, not the texture)
    this.hookFilter = hookFilter;
    this.hookGain = hookGain;

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

  /** Heat 0..1+: drives ONLY the arp density now. Coherence (setCoherence) is the
   *  sole owner of the drone gains + filter bloom — one controller per knob, so
   *  the two never fight over the same setTargetAtTime params. */
  setIntensity(n: number): void {
    this.musicHeat = n;
    this.hybrid?.setIntensity(n); // feed the authored vertical mix (loopCutoff opens with intensity)
  }

  /** Pick this run's arena track (from the run seed) so the authored music is one coherent vibe per
   *  run, not a constant rotation. Safe before the hybrid exists (no-op). */
  setMusicVariant(n: number): void {
    this.hybrid?.setMusicVariant(n);
  }

  /** Select the active soundtrack (Settings). Safe to call before the context
   *  exists — it just swaps the profile the scheduler reads each step. */
  setSoundtrack(id: SoundtrackId): void {
    this.track = getTrack(id);
  }
  get soundtrackId(): SoundtrackId {
    return this.track.id;
  }

  // ── DEV: per-layer solo / mute (the audio lab). Scheduler-level flags — muting a
  //    layer just skips scheduling it (takes effect within a beat); no bus re-routing. ──
  static readonly LAYER_NAMES = ['kick', 'perc', 'bass', 'pad', 'drone', 'choir', 'arp', 'riff', 'hook', 'delay', 'boss'] as const;
  private mutedLayers = new Set<string>();
  private soloedLayer: string | null = null;
  /** Whether a named layer should currently sound (authored-bed suppression, then solo, then mute). */
  private layerOn(name: string): boolean {
    if (this.authoredActive && AudioEngine.BED_LAYERS.has(name)) return false; // the authored bed has it
    return this.soloedLayer ? this.soloedLayer === name : !this.mutedLayers.has(name);
  }
  get layerNames(): readonly string[] {
    return AudioEngine.LAYER_NAMES;
  }
  layerState(name: string): { muted: boolean; soloed: boolean } {
    return { muted: this.mutedLayers.has(name), soloed: this.soloedLayer === name };
  }
  setLayerMute(name: string, muted: boolean): void {
    if (muted) this.mutedLayers.add(name);
    else this.mutedLayers.delete(name);
    this.refreshLayerSends();
  }
  setLayerSolo(name: string | null): void {
    this.soloedLayer = name;
    this.refreshLayerSends();
  }
  /** Send/sustained layers can't be gated per-note, so set their gain on toggle. */
  private refreshLayerSends(): void {
    if (this.leadDelaySend) this.leadDelaySend.gain.value = this.layerOn('delay') ? 1 : 0;
  }

  /** THE ONE BUS (audio half) — Coherence 0..1 + combo tier together bloom the
   *  lone drone into a 4-voice chord, open the filter, transpose the root, and
   *  crossfade a choir pad in past the onset. Cosmetic: never touches world.rng. */
  setCoherence(c: number, tier: number): void {
    this.hybrid?.setCoherence(c); // feed the authored vertical mix (loop cutoff + reactive level)
    const ctx = this.ctx;
    if (!ctx || !this.droneOn || !this.droneFilter) return; // no resurrection after teardown
    const t = ctx.currentTime;
    const k = Math.min(1, Math.max(0, c));
    const CA = COHERENCE_AUDIO;
    // (a) ROOT TRANSPOSE by combo tier (drone + melodic layer shift together)
    const semis = CA.tierSemis[Math.min(tier, CA.tierSemis.length - 1)] ?? 0;
    const mul = Math.pow(2, semis / 12);
    if (mul !== this.rootMul) {
      this.rootMul = mul;
      const base = [55, 82.5, 110, 165];
      this.drone.forEach((v, i) => v.osc.frequency.setTargetAtTime(base[i] * mul, t, CA.transposeGlide));
    }
    // (b) LONE-DRONE → 4-VOICE bloom (sole owner of these gains now). 'drone' layer muteable.
    const dOn = this.layerOn('drone');
    const g = [0.16, k > 0.3 ? 0.1 * k : 0.0001, k > 0.5 ? 0.09 * k : 0.0001, k > 0.72 ? 0.07 * k : 0.0001];
    this.drone.forEach((v, i) => v.gain.gain.setTargetAtTime(dOn ? g[i] : 0.0001, t, CA.droneGlide));
    this.droneFilter.frequency.setTargetAtTime(700 + k * CA.filterBloom, t, CA.filterGlide);
    // (c) CHOIR pad blooms past the onset ('choir' layer muteable)
    this.setChoir(this.layerOn('choir') ? Math.max(0, (k - CA.choirOnset) / (1 - CA.choirOnset)) : 0);
    // (d) THE LANCE THEME lead — gate its gain + open its filter past leadOnset, so
    //     the earworm hook is the audible REWARD of a clean (high-coherence) run.
    if (this.hookGain && this.hookFilter) {
      const leadLvl = k <= CA.leadOnset ? 0 : (k - CA.leadOnset) / (1 - CA.leadOnset);
      this.hookGain.gain.setTargetAtTime(Math.max(0.0001, leadLvl * CA.leadGain), t, CA.leadGlide);
      this.hookFilter.frequency.setTargetAtTime(CA.leadFilterBase + k * CA.leadFilterBloom, t, CA.filterGlide);
    }
    // (e) AIR — lift the music high-shelf with coherence so the spectrum physically
    //     brightens as you flow (the measurable fix for the "dark/bleak" spectrum).
    if (this.airShelf) this.airShelf.gain.setTargetAtTime(k * CA.airShelfDb, t, CA.airGlide);
    this.coherenceVal = k; // the scheduler gates whether to spawn hook voices at all
  }

  /** Lazily build + crossfade a 5-voice choir pad (add9 over the root), routed
   *  through droneFilter → musicBus (inherits ducking + the music slider). */
  private setChoir(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.droneFilter) return;
    const t = ctx.currentTime;
    const CA = COHERENCE_AUDIO;
    const lvl = Math.min(1, Math.max(0, level));
    if (!this.choirVoices.length) {
      if (lvl <= 0.001) return; // stay silent + uninstantiated until first needed
      for (const semi of AudioEngine.CHOIR_SEMIS) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 110 * this.rootMul * Math.pow(2, semi / 12);
        osc.detune.value = (Math.random() - 0.5) * 9; // cosmetic shimmer — never world.rng
        const gg = ctx.createGain();
        gg.gain.value = 0.0001;
        osc.connect(gg);
        gg.connect(this.droneFilter);
        osc.start(t);
        this.choirVoices.push({ osc, gain: gg });
      }
    }
    const per = (COHERENCE_AUDIO.choirGain / AudioEngine.CHOIR_SEMIS.length) * lvl;
    this.choirVoices.forEach((v, i) => {
      v.gain.gain.setTargetAtTime(lvl > 0.001 ? Math.max(0.0001, per) : 0.0001, t, CA.choirGlide);
      const semi = AudioEngine.CHOIR_SEMIS[i] ?? 0;
      v.osc.frequency.setTargetAtTime(110 * this.rootMul * Math.pow(2, semi / 12), t, CA.transposeGlide);
    });
  }

  /** Perfect on-beat dash — a tight on-grid snare tick ("remembers cleanly"),
   *  scheduled at the quantized next-grid time; routed to sfxBus. */
  perfectDashSnare(at: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = Math.max(at, ctx.currentTime);
    this.sampleSfx?.play('perfect_dash', { at: t });
    const n = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.12);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    n.start(t);
    n.stop(t + 0.14);
    n.onended = () => {
      n.disconnect();
      bp.disconnect();
      g.disconnect();
    };
    // a faint tonal click for sparkle
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(880, t);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.05, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0006, t + 0.08);
    o.connect(og);
    og.connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.1);
    o.onended = () => {
      o.disconnect();
      og.disconnect();
    };
  }

  // ── procedural music: a lookahead beat sequencer ──────────────────────

  private startMusic(): void {
    const ctx = this.ctx;
    if (!ctx || this.musicTimer) return;
    this.musicStep = 0;
    this.nextNoteT = ctx.currentTime + 0.1;
    this.musicEpoch = this.nextNoteT;
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
    // space notes at the ACTIVE bpm so the procedural reactive layer (hook fragments, snare) stays
    // in time with an authored bed at another tempo. Source switches land on bar downbeats, so the
    // spacing changes cleanly at a bar boundary (Deep Dive B). Procedural fallback = MUSIC_BPM.
    const sixteenth = 60 / this.activeBpm / 4;
    while (this.nextNoteT < ctx.currentTime + 0.1) {
      this.playStep(this.musicStep, this.nextNoteT); // ABSOLUTE step → transport derives bar/beat/section
      this.nextNoteT += sixteenth;
      this.musicStep++;
    }
  }

  private static ARP = [5, 7, 9, 7, 6, 9, 7, 5]; // indices into PENTA, per offbeat 8th

  /** Synthesize one 16th-note step, driven by the active TRACK PROFILE. The transport
   *  derives bar/beat/section; the profile says what plays. Vertical layers:
   *  L1 KICK+BASS (always) · L1.5 RIFF (always-on ostinato — keeps a zero-combo
   *  stretch grooving) · L2 ARP (heat) · L3 lead HOOK / boss MOTIF (coherence) ·
   *  L5 PERC/BREAK (heat). The pad pumps under the kick (sidechain). */
  private playStep(step: number, t: number): void {
    // HYBRID: on a bar downbeat, maybe switch to / vertically mix an authored bed (no-op until
    // assets decode; always null in the offline harness). Runs BEFORE the procedural layers so
    // `authoredActive` (hence layerOn bed-suppression) is current for this step.
    this.hybrid?.tick(step, t);
    const heat = this.musicHeat;
    const coh = this.coherenceVal;
    const pos = positionFromStep(step);
    // note DURATIONS track the same clock as note SPACING (scheduleMusic uses activeBpm); otherwise
    // surviving reactive voices (boss motif / chorus hook) get mis-scaled legato over a non-112 bed.
    const sixteenth = 60 / this.activeBpm / 4;
    const tr = this.track;

    // ── ARRANGEMENT: the SONG SPINE decides which layers are ALLOWED this section;
    //    coherence/heat then modulate intensity ON TOP. Layers ENTER + EXIT (sparse verse
    //    → building pre-chorus → full chorus → contrast bridge → drop) instead of all
    //    stacking at once — this is the "breathe, don't pile up / not busy" fix. ──
    const sec = sectionAt(pos.bar);
    const S = sec.section;
    const inBridge = S === 'bridge';
    const inChorus = S === 'chorus' || S === 'drop';
    const building = S === 'prechorus';

    // progression follows the section (bridge = contrast/half-cadence, chorus = brighter);
    // the leading-tone cadence lands ONLY on the chorus's last bar (earned + scarce).
    const prog = inBridge ? PROGRESSIONS.bridge : inChorus ? tr.chorusProg : tr.verseProg;
    const earned = inChorus && sec.barInSection >= sec.sectionBars - 1;
    const chord = chordAt(prog, sec.barInSection, earned);
    const bassF = 110 * this.rootMul * chordRootMul(chord);

    // L1 KICK — the entrainment anchor; the bridge runs half-time for contrast.
    const kickOn = inBridge ? pos.sixteenthInBar === 0 || pos.sixteenthInBar === 8 : tr.kickSteps.includes(pos.sixteenthInBar);
    if (kickOn && this.layerOn('kick')) {
      this.kick(t, 0.16 * this.humGain(0.06));
      this.pump(t);
    }

    // L1 BASS — always; the offbeat hot-push only in busy (non-bridge) sections.
    if (this.layerOn('bass')) {
      if (tr.bassSteps.includes(pos.sixteenthInBar)) this.bassNote(t, bassF, tr.bassGain);
      else if (!inBridge && heat > 0.6 && tr.bassHotSteps.includes(pos.sixteenthInBar))
        this.bassNote(t, bassF, tr.bassGain * 0.6);
    }

    // L1.6 MOVING CHORD PAD — the REAL chord (triad → maj7/9 → Picardy by coherence),
    // register-capped to the pad slot. The harmonic backbone; once per bar, always present.
    if (pos.sixteenthInBar === 0 && this.layerOn('pad')) this.padChord(t, 16 * sixteenth, chord);

    // ── BUILD → DROP (one clock, quantized to bars): a riser + accelerating fill in the last bar
    //    before a chorus, an IMPACT on the chorus/drop downbeat. PROCEDURAL-ONLY: an authored
    //    full-mix track carries its own builds/drops, so this drama (esp. the tom fill) would clash
    //    as a stray out-of-place drum over the bed. (Boss-spawn impact() still fires — it's separate.)
    const intoChorus = sec.next === 'chorus' && sec.barInSection === sec.sectionBars - 1;
    if (!this.authoredActive) {
      if (pos.sixteenthInBar === 0) {
        if (inChorus && sec.barInSection === 0) this.impactAt(t); // the drop into the payoff
        if (intoChorus) this.riserAt(t, 16 * sixteenth);
      }
      if (intoChorus && pos.sixteenthInBar >= 12) this.fillHit(t, pos.sixteenthInBar - 12);
    }

    // L1.5 RIFF — the always-on baseline groove (verse/pre), but it STEPS BACK in the
    //    chorus (where the hook sings) and DROPS in the bridge, so it never piles on the lead.
    if (tr.riff.length && !inBridge && !inChorus && this.layerOn('riff')) {
      for (const n of notesAt(tr.riff, pos.sixteenthInBar))
        this.riffNote(t, themeFreq(n, this.rootMul), n.dur * sixteenth, tr.riffGain * n.vel);
    }

    // L2 ARP — only in the pre-chorus + chorus (build + payoff), heat-gated. The VERSE
    //    stays sparse (no arp) and the bridge drops it — the core de-clutter.
    const onArp =
      (building || inChorus) && heat > tr.arpHeat && pos.sixteenthInBar % 2 === 1 && (heat > 0.6 || pos.sixteenthInBar % 4 === 1);
    if (onArp && this.layerOn('arp')) {
      const idx = Math.floor(step / 2) % AudioEngine.ARP.length;
      const base = PENTA[AudioEngine.ARP[idx] % PENTA.length];
      const freq = (this.bossArp ? base * this.bossArpMul : base) * this.rootMul;
      this.pluck(t, freq, 0.22, Math.min(0.06, 0.03 + heat * 0.04));
    }

    // L3 LEAD — boss MOTIF during a fight (any section); otherwise the HOOK, which now
    //    plays ONLY in the chorus (it IS the chorus) and is still gated by coherence on
    //    top (low flow = quiet/absent). The bridge drops the lead entirely (contrast).
    if (this.bossArp && this.bossMotif && this.layerOn('boss')) {
      if (pos.sixteenthInBar % 2 === 0) {
        const idx = this.bossMotif[pos.sixteenthInBar / 2] ?? -1;
        if (idx >= 0) this.bossMotifNote(t, PENTA[idx] * this.bossMotifOct * this.rootMul, sixteenth * 1.7, this.bossMotifGain);
      }
    } else if (inChorus && coh > COHERENCE_AUDIO.leadOnset * 0.8 && this.hookFilter && this.layerOn('hook')) {
      for (const n of notesAt(tr.theme, pos.phraseStep)) this.leadNote(t, themeFreq(n, this.rootMul), n.dur * sixteenth, n.vel);
    }

    // L5 PERC — hats build in the pre-chorus, full in the chorus; ghost snare from the
    //    pre-chorus up; the CLAP only thickens the chorus backbeat. The bridge stays sparse.
    if (this.layerOn('perc')) {
      if (!inBridge && (building || inChorus) && heat > tr.hatHeat * (building ? 1 : 0.7) && pos.sixteenthInBeat === 2)
        this.hat(t, 0.05 * this.humGain());
      if (!inBridge && (pos.sixteenthInBar === 4 || pos.sixteenthInBar === 12)) {
        if ((building || inChorus) && heat > tr.snareHeat) this.ghostSnare(t);
        if (inChorus && heat > tr.clapHeat) this.clap(t);
      }
    }
  }

  /** Sidechain "pump": duck the sustained pad on each kick, then ease back — the
   *  genre-defining synthwave breath. Depth is per-track (SURGE pumps harder). */
  private pump(t: number): void {
    const g = this.harmonyBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(this.track.pumpDepth, t);
    g.setTargetAtTime(1, t, AUDIO_PUMP.release);
  }

  /** One LANCE THEME note — a fat detuned twin-saw routed through the coherence-
   *  controlled hook filter+gain, so the earworm is the audible reward of a clean run. */
  private leadNote(t: number, freq: number, dur: number, vel: number): void {
    if (!this.hookFilter) return;
    const jitter = Math.pow(2, this.humCents(4) / 1200);
    const tr = this.track;
    // main SUPERSAW lead — N detuned voices spread wide (the "huge lead" lever), with a
    // per-note filter envelope (snaps open then settles) so each note has a living "finger"
    this.voice({
      type: tr.leadWave,
      freq: freq * jitter,
      detune: COHERENCE_AUDIO.leadDetune,
      unison: tr.unison,
      spread: tr.spread,
      cutoff: 1400,
      filterEnvPeak: 6800,
      cutoffEnd: 2600,
      q: 1.1,
      attack: 0.012,
      hold: Math.max(0, dur * 0.45),
      decay: Math.max(0.1, dur * 0.55),
      peak: 0.42 * vel,
      drive: tr.leadDrive,
      bus: this.hookFilter,
      at: t,
    });
    // OCTAVE-DOWN doubling layer — adds body/power so the hook reads as massive
    this.voice({
      type: tr.leadWave,
      freq: freq * 0.5 * jitter,
      detune: COHERENCE_AUDIO.leadDetune * 0.7,
      unison: Math.min(3, tr.unison),
      spread: tr.spread * 0.6,
      attack: 0.012,
      hold: Math.max(0, dur * 0.4),
      decay: Math.max(0.1, dur * 0.6),
      peak: 0.24 * vel,
      drive: tr.leadDrive,
      bus: this.hookFilter,
      at: t,
    });
    // SPARKLE — a high shimmer 2 octaves up, only at high coherence (a flow reward +
    // the spectral lift that brightens the "dark" mix). Routed dry to leadBus (delayed/echoed).
    if (this.coherenceVal > COHERENCE_AUDIO.sparkleOnset) {
      this.voice({
        type: 'triangle',
        freq: freq * 4 * jitter,
        attack: 0.008,
        hold: Math.max(0, dur * 0.3),
        decay: Math.max(0.08, dur * 0.5),
        peak: COHERENCE_AUDIO.sparkleGain * vel,
        pan: (this.hum() * 2 - 1) * 0.5,
        bus: this.leadBus,
        at: t,
      });
    }
  }

  /** One boss-MOTIF note — routes straight to leadBus (NOT the coherence-gated hook
   *  path) so the boss's musical identity is audible throughout its fight regardless
   *  of combo. Its own filter sweep gives it a voice distinct from the arena hook. */
  private bossMotifNote(t: number, freq: number, dur: number, gain: number): void {
    this.voice({
      type: 'sawtooth',
      freq,
      detune: 8,
      cutoff: 2400,
      cutoffEnd: 1300,
      q: 0.9,
      attack: 0.012,
      hold: Math.max(0, dur * 0.4),
      decay: Math.max(0.08, dur * 0.6),
      peak: gain,
      bus: this.leadBus,
      at: t,
    });
  }

  /** Closed hi-hat tick — short high-passed noise → drumsBus (PERC/BREAK stem). */
  private hat(t: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const n = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 0.04);
    g.gain.linearRampToValueAtTime(0, t + 0.05);
    n.connect(hp);
    hp.connect(g);
    g.connect(this.drumsBus);
    n.start(t);
    n.stop(t + 0.06);
    n.onended = () => {
      n.disconnect();
      hp.disconnect();
      g.disconnect();
    };
  }

  /** Backbeat ghost snare — band-passed noise burst → drumsBus. */
  private ghostSnare(t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const n = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09 * this.humGain(), t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.08);
    g.gain.linearRampToValueAtTime(0, t + 0.09);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.drumsBus);
    n.start(t);
    n.stop(t + 0.1);
    n.onended = () => {
      n.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  }

  /** Layered hand-CLAP — three quick band-passed noise transients (the classic clap
   *  stack) → drumsBus. Thickens the backbeat for bigger, more commercial drums. */
  private clap(t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const off of [0, 0.009, 0.018]) {
      const st = t + off;
      const n = this.noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.085 * this.humGain(), st);
      g.gain.exponentialRampToValueAtTime(0.0006, st + 0.05);
      g.gain.linearRampToValueAtTime(0, st + 0.06);
      n.connect(bp);
      bp.connect(g);
      g.connect(this.drumsBus);
      n.start(st);
      n.stop(st + 0.07);
      n.onended = () => {
        n.disconnect();
        bp.disconnect();
        g.disconnect();
      };
    }
  }

  /** MOVING CHORD PAD — a sustained power chord (root+5th+octave, NO 3rd → modally
   *  safe under the pentatonic top) of the CURRENT progression chord, transposed by
   *  the combo tier. Played each bar on harmonyBus (so it pumps), it makes the harmony
   *  audibly MOVE A→F→C→G instead of sitting on one drone — the complexity lever. */
  private padChord(t: number, dur: number, chord: Chord): void {
    const tr = this.track;
    if (tr.padGain <= 0 || !this.droneOn) return;
    // REAL chord voicing — triad at low coherence, maj7/9 colour as it brightens,
    // Picardy major lift at peak. Register-capped to the pad slot (165–1200 Hz) so the
    // 9ths/maj7s never smear into the lead's 1.2–4 kHz pocket. One controller: coherence.
    const freqs = chordVoicing(chord, this.rootMul, brightnessTier(this.coherenceVal));
    // keep total pad energy roughly constant across tiers (3-voice triad vs 5-voice 9th)
    const per = tr.padGain * Math.sqrt(3 / Math.max(3, freqs.length));
    for (const f of freqs) {
      this.voice({
        type: 'sawtooth',
        freq: f,
        detune: 8,
        unison: 3,
        spread: 0.4,
        cutoff: 600,
        filterEnvPeak: 2600, // soft filter swell each bar — the pad breathes in
        cutoffEnd: 1300,
        q: 0.5,
        attack: 0.12,
        hold: Math.max(0, dur * 0.5),
        decay: Math.max(0.2, dur * 0.5),
        peak: per,
        bus: this.harmonyBus,
        at: t,
      });
    }
  }

  /** IMPACT — a big transient (sub boom + bright reverbed crash) marking a transition:
   *  the "drop" into a macro-form section, or a boss spawn. The release of built tension. */
  private impactAt(t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // sub boom (kept clear of 0dBFS — it lands over a full chorus mix)
    this.voice({ type: 'sine', freq: 120, freqEnd: 40, glide: 0.5, attack: 0.004, decay: 0.55, peak: 0.38, bus: this.sfxBus, at: t });
    // bright crash — highpassed noise, sent wet (reverb) + dry
    const n = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1400, t);
    hp.frequency.exponentialRampToValueAtTime(6500, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.5);
    g.gain.linearRampToValueAtTime(0, t + 0.52);
    n.connect(hp);
    hp.connect(g);
    g.connect(this.sfxBus);
    g.connect(this.sfxReverbSend);
    n.start(t);
    n.stop(t + 0.53);
    n.onended = () => {
      n.disconnect();
      hp.disconnect();
      g.disconnect();
    };
  }

  /** Public IMPACT for game events (boss spawn). */
  impact(): void {
    if (this.ctx) this.impactAt(this.ctx.currentTime);
  }

  /** RISER — a rising band-passed-noise sweep + pitch climb over `dur` (a build-up):
   *  scheduled in the bar before a section drop to telegraph + mask the transition. */
  private riserAt(t: number, dur: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const end = t + dur;
    const n = this.noiseSource();
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(5000, end); // sweep up = rising energy
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, end - 0.02); // swell in
    g.gain.linearRampToValueAtTime(0, end); // cut at the drop
    n.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    n.start(t);
    n.stop(end + 0.02);
    n.onended = () => {
      n.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  }

  /** One drum-FILL hit — a pitched tom that rises across the fill (the last beat
   *  before a drop), building anticipation. */
  private fillHit(t: number, rise: number): void {
    this.voice({
      type: 'triangle',
      freq: 150 * Math.pow(2, rise / 12), // climbs as the fill progresses
      freqEnd: 90 * Math.pow(2, rise / 12),
      glide: 0.1,
      attack: 0.003,
      decay: 0.11,
      peak: 0.26,
      bus: this.drumsBus,
      at: t,
    });
  }

  private kick(t: number, gain: number): void {
    const ctx = this.ctx!;
    // CLICK transient — a snappy high-passed noise tick gives the kick a "beater" attack
    // (2-part kick: click + body) so it cuts through instead of being a soft thud.
    const click = this.noiseSource();
    const chp = ctx.createBiquadFilter();
    chp.type = 'highpass';
    chp.frequency.value = 1800;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(gain * 0.5, t);
    cg.gain.exponentialRampToValueAtTime(0.0004, t + 0.018);
    cg.gain.linearRampToValueAtTime(0, t + 0.025);
    click.connect(chp);
    chp.connect(cg);
    cg.connect(this.drumsBus);
    click.start(t);
    click.stop(t + 0.03);
    click.onended = () => {
      click.disconnect();
      chp.disconnect();
      cg.disconnect();
    };
    // BODY — pitched sine drop
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
    osc.connect(g);
    g.connect(this.drumsBus);
    osc.start(t);
    osc.stop(t + 0.18);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  private bassNote(t: number, freq: number, gain: number): void {
    const ctx = this.ctx!;
    const tr = this.track;
    const osc = ctx.createOscillator();
    osc.type = tr.bassWave;
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = tr.bassCutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
    g.gain.linearRampToValueAtTime(0, t + 0.235); // de-click
    // optional grit for aggressive tracks (SURGE) — tanh waveshaper post-osc
    let shaper: WaveShaperNode | null = null;
    if (tr.bassDrive > 1) {
      shaper = ctx.createWaveShaper();
      shaper.curve = softClip(tr.bassDrive);
      shaper.oversample = '2x';
      osc.connect(shaper);
      shaper.connect(lp);
    } else {
      osc.connect(lp);
    }
    lp.connect(g);
    g.connect(this.bassBus);
    osc.start(t);
    osc.stop(t + 0.24);
    osc.onended = () => {
      osc.disconnect();
      shaper?.disconnect();
      lp.disconnect();
      g.disconnect();
    };
    // SUB — a clean sine one octave below (LP@120) for low-end weight. A track with no
    // floor below ~600Hz reads as small/cold; this gives it warm body.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;
    const slp = ctx.createBiquadFilter();
    slp.type = 'lowpass';
    slp.frequency.value = 120;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(gain * 0.9, t + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.0008, t + 0.24);
    sg.gain.linearRampToValueAtTime(0, t + 0.255);
    sub.connect(slp);
    slp.connect(sg);
    sg.connect(this.bassBus);
    sub.start(t);
    sub.stop(t + 0.26);
    sub.onended = () => {
      sub.disconnect();
      slp.disconnect();
      sg.disconnect();
    };
  }

  private pluck(t: number, freq: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = this.track.arpWave;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.015); // de-click
    osc.connect(g);
    g.connect(this.leadBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  /** One always-on RIFF note → leadBus (ungated by coherence). The baseline groove
   *  that keeps a track great out of combo; aggressive tracks add grit via drive. */
  private riffNote(t: number, freq: number, dur: number, gain: number): void {
    const tr = this.track;
    this.voice({
      type: tr.riffWave,
      freq,
      detune: 10,
      unison: Math.max(2, tr.unison - 2), // a fatter ostinato, a touch less wide than the lead
      spread: tr.spread * 0.7,
      cutoff: 2600,
      cutoffEnd: 1500,
      q: 0.7,
      attack: 0.008,
      hold: Math.max(0, dur * 0.3),
      decay: Math.max(0.06, dur * 0.7),
      peak: gain,
      drive: tr.riffDrive,
      bus: this.leadBus,
      at: t,
    });
  }

  /** Layer in a per-boss tension chord while a boss is alive (and remove it).
   *  Each boss kind has its own drone chord + arp colour (see bossThemes.ts). */
  bossMusic(on: boolean, kind?: EnemyKind): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.bossArp = on; // the arp recolours during a boss fight
    if (on && kind) this.lastBossKind = kind; // remembered for the warden_defeat cue
    if (!on) this.bossMotif = null; // the LANCE THEME hook returns when the boss falls
    const t = ctx.currentTime;
    if (on) {
      if (this.bossVoices.length || !this.droneFilter) return;
      const theme = bossTheme(kind ?? 'warden');
      this.bossArpMul = theme.arpMul;
      this.bossMotif = theme.motif; // its lead motif replaces the arena hook
      this.bossMotifGain = theme.motifGain;
      this.bossMotifOct = theme.motifOct;
      this.impactAt(t); // a big hit marks the boss arrival (tension → release)
      const per = Math.min(0.06, 0.12 / theme.drone.length); // share headroom across voices
      for (const semi of theme.drone) {
        const osc = ctx.createOscillator();
        osc.type = theme.wave;
        osc.frequency.value = 55 * Math.pow(2, semi / 12);
        osc.detune.value = theme.detune;
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        osc.connect(g);
        g.connect(this.droneFilter);
        osc.start(t);
        g.gain.setTargetAtTime(per, t, 0.4);
        this.bossVoices.push({ osc, gain: g });
      }
    } else {
      if (!this.bossVoices.length) return;
      this.bossArpMul = 1;
      const voices = this.bossVoices;
      this.bossVoices = [];
      for (const v of voices) {
        v.gain.gain.setTargetAtTime(0.0001, t, 0.2);
        v.osc.stop(t + 0.6);
        v.osc.onended = () => {
          v.osc.disconnect();
          v.gain.disconnect();
        };
      }
    }
  }

  /** Triumphant rising chord when a boss is felled — staggered, spread L→R. A WARDEN shutdown
   *  also fires the sampled warden_defeat cue (once; the kind is then consumed). */
  bossStinger(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.lastBossKind === 'warden') this.sampleSfx?.play('warden_defeat');
    this.lastBossKind = null;
    const t = ctx.currentTime;
    const freqs = [440, 554, 659, 880];
    freqs.forEach((f, i) => {
      this.voice({
        type: 'triangle',
        freq: f,
        attack: 0.02,
        decay: 0.5,
        peak: 0.16,
        pan: (i / (freqs.length - 1)) * 1.2 - 0.6,
        at: t + i * 0.05,
      });
    });
  }

  stopDrone(): void {
    const ctx = this.ctx;
    if (!ctx || !this.droneOn) return;
    this.stopMusic();
    this.hybrid?.stop(); // stop authored beds + voices, restore the procedural clock @ MUSIC_BPM
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
    // teardown the coherence choir pad (mirrors the drone/bossVoices teardown)
    for (const v of this.choirVoices) {
      v.gain.gain.setTargetAtTime(0.0001, t, 0.1);
      v.osc.stop(t + 0.6);
      v.osc.onended = () => {
        v.osc.disconnect();
        v.gain.disconnect();
      };
    }
    this.choirVoices = [];
    this.rootMul = 1;
    this.coherenceVal = 0;
    this.droneFilter?.disconnect();
    this.drone = [];
    this.droneFilter = null;
    // teardown the LANCE THEME lead chain
    this.hookGain?.gain.setTargetAtTime(0.0001, t, 0.1);
    const hg = this.hookGain;
    const hf = this.hookFilter;
    this.hookGain = null;
    this.hookFilter = null;
    window.setTimeout(() => {
      hf?.disconnect();
      hg?.disconnect();
    }, 250);
    // reset the sidechain-pumped pad gain so a fresh run doesn't start mid-duck
    this.harmonyBus.gain.cancelScheduledValues(t);
    this.harmonyBus.gain.setValueAtTime(1, t);
    this.droneOn = false;
  }

  /** Coordinated music mix snapshot — sets the music level AND a master lowpass so a
   *  duck also MUFFLES (distant) instead of merely turning down. The single owner of
   *  the music-master mix; setVolumes composes the live slider onto mixMul. */
  setMixState(state: keyof typeof AUDIO_MIX): void {
    const m = AUDIO_MIX[state];
    if (state === 'overdrive') {
      // MOMENTARY swell: duck hard under the nova, then bloom back to combat — the
      // resting mix stays combat (no restore-hook needed). Pairs with the coherence
      // flood so the LANCE THEME slams back in as the music recovers.
      this.mixMul = 1;
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const g = this.musicBus.gain;
      const f = this.musicMasterFilter.frequency;
      g.cancelScheduledValues(t);
      g.setValueAtTime(this.musicVol * m.musicMul, t);
      g.setTargetAtTime(this.musicVol, t + 0.2, 0.3);
      f.cancelScheduledValues(t);
      f.setValueAtTime(m.cutoff, t);
      f.setTargetAtTime(AUDIO_MIX.combat.cutoff, t + 0.2, 0.3);
      return;
    }
    this.mixMul = m.musicMul;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.musicVol * m.musicMul, t, m.glide);
    this.musicMasterFilter.frequency.setTargetAtTime(m.cutoff, t, m.glide);
  }

  /** Back-compat: the old binary duck now maps to the menu/combat mix states. */
  duckMusic(on: boolean): void {
    this.setMixState(on ? 'menu' : 'combat');
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
