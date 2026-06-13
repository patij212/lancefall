// ─────────────────────────────────────────────────────────────────────────
// TUNE — the single source of truth for every gameplay number in LANCEFALL.
// All distances in CSS pixels, all times in seconds, all speeds in px/s.
// This is the file you edit when tuning feel. Nothing else hardcodes a number.
// ─────────────────────────────────────────────────────────────────────────

export const FIXED_DT = 1 / 60; // fixed simulation timestep (seconds)
export const MAX_SUBSTEPS = 5; // anti spiral-of-death clamp
export const MUSIC_BPM = 112; // procedural soundtrack tempo — the beat grid + dash-grading derive from this

export const TUNE = {
  player: {
    radius: 9, // TRUE collision hitbox (smaller than the sprite — generous, bullet-hell style)
    spriteRadius: 16, // visual size
    maxSpeed: 340,
    accel: 2600,
    friction: 0.86, // velocity *= friction each 1/60s frame when settling
    turnLerp: 18, // rad/s the ship rotates toward aim
    chargeMoveMul: 0.55, // movement throttle while charging
  },

  dash: {
    chargeTimeMax: 0.45, // seconds to reach full charge
    minLen: 180,
    maxLen: 560,
    speed: 3000, // px/s travel — duration = len/speed (0.06s..0.19s)
    minDuration: 0.06,
    iframeGrace: 0.13, // extra invuln after travel ends — softens landing in a crowd, flows into dash-chaining
    hitboxRadius: 22, // swept-capsule radius (the spear)
    carrySpeed: 540, // post-dash momentum carried into drift
  },

  stamina: {
    segments: 3,
    perSegment: 100,
    dashCost: 100,
    regenPerSec: 75,
    regenDelay: 0.35, // lockout after dashing before regen resumes
    grazeRefund: 16,
    killRefund: 0, // base; BLOODRUSH perk adds
  },

  combo: {
    window: 1.5, // seconds before combo decays
    multPerCombo: 0.1, // score multiplier = 1 + combo*0.1
    multCap: 12, // cap on multiplier
  },

  graze: {
    radius: 30, // outer ring; inner = player.radius
    scorePerGraze: 5,
    cooldown: 0.25, // per-bullet cooldown to avoid spamming on slow bullets
  },

  juice: {
    hitstopBase: 0.045, // s, single kill
    hitstopPerExtra: 0.012,
    hitstopMax: 0.09,
    hitstopDeath: 0.14,
    slowmoChainThreshold: 3, // kills in one dash to trigger slow-mo
    slowmoScale: 0.3,
    slowmoHold: 0.12,
    slowmoEase: 0.09,
    traumaDecay: 1.5,
    maxShake: 22, // px at trauma=1
    maxShakeAngle: 0.035, // rad
    traumaKill: 0.12,
    traumaDash: 0.16,
    traumaChain3: 0.35,
    traumaChain6: 0.6,
    traumaGraze: 0.05,
    traumaBossSpawn: 0.5,
    traumaDeath: 1.0,
    camLean: 0.045,
    camLeanMax: 26,
    aberrationBase: 0.6,
    aberrationPerCombo: 0.06,
    aberrationMax: 3,
  },

  particles: {
    deathBurstMin: 20,
    deathBurstMax: 40,
    sparkSpeedMin: 120,
    sparkSpeedMax: 360,
    sparkDrag: 0.9,
    sparkLifeMin: 0.35,
    sparkLifeMax: 0.65,
    trailLife: 0.28,
    debrisGravity: 520,
  },

  gems: {
    magnetRadius: 110,
    magnetAccel: 1400,
    life: 12,
  },

  // ── Difficulty: a single intensity scalar I(t) drives everything ──
  director: {
    rampSeconds: 240, // I goes 0->1 over the first 4 minutes
    spawnIntervalStart: 2.6, // gentle opening so a new player learns the dash
    spawnIntervalEnd: 0.45,
    spawnIntervalFloor: 0.3,
    enemiesPerSpawnMax: 3,
    maxConcurrentStart: 4,
    maxConcurrentEnd: 26,
    maxConcurrentCap: 40,
    bossInterval: 45, // length of WAVE 1 — the non-boss play before the first boss (time-driven modes)
    waveExtend: 15, // each consecutive inter-boss wave is this many seconds longer than the last…
    waveLenMax: 120, // …capped here, so a marathon run keeps a steady boss drumbeat instead of 4-minute waves
    bossBreather: 7, // keep a mid-run EVENT off the very frame a boss dies (its timer is wall-clock)
    spawnTelegraph: 0.4, // seconds an incoming-arrow shows before a spawn
    enemySpeedRamp: 0.3, // effective = base*(0.85 + 0.30*clamp(I,0,1))... handled in code
    bulletSpeedRamp: 0.3,
    perkFirst: 20, // first perk draft at t=20s
    perkInterval: 30, // then every 30s
    eventFirst: 50, // first mid-run event at t=50s
    eventInterval: 75, // then roughly every 75s
    relicChance: 0.22, // chance a perk draft swaps a slot for a cursed relic
    shieldStartTime: 110, // shielded variants appear after this many seconds
    shieldMaxChance: 0.35,
  },
} as const;

// ── Enemy archetype data tables ──
export interface EnemyDef {
  kind: string;
  hp: number;
  radius: number;
  color: string;
  baseScore: number;
  speed: number;
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  darter: { kind: 'darter', hp: 1, radius: 13, color: '#ff3b6b', baseScore: 100, speed: 120 },
  orbiter: { kind: 'orbiter', hp: 2, radius: 12, color: '#22d3ee', baseScore: 150, speed: 170 },
  splitter: { kind: 'splitter', hp: 1, radius: 19, color: '#a855f7', baseScore: 120, speed: 70 },
  mini: { kind: 'mini', hp: 1, radius: 9, color: '#c9a6ff', baseScore: 60, speed: 150 },
  bloomer: { kind: 'bloomer', hp: 3, radius: 18, color: '#fbbf24', baseScore: 250, speed: 40 },
  lancer: { kind: 'lancer', hp: 2, radius: 14, color: '#ff8a3b', baseScore: 220, speed: 90 },
  bomber: { kind: 'bomber', hp: 2, radius: 16, color: '#fb7185', baseScore: 200, speed: 135 },
  wisp: { kind: 'wisp', hp: 1, radius: 8, color: '#67e8f9', baseScore: 45, speed: 210 },
  drifter: { kind: 'drifter', hp: 2, radius: 14, color: '#10b981', baseScore: 230, speed: 80 },
  shade: { kind: 'shade', hp: 2, radius: 14, color: '#f97316', baseScore: 240, speed: 150 },
  brooder: { kind: 'brooder', hp: 2, radius: 17, color: '#a78bfa', baseScore: 280, speed: 45 },
  herald: { kind: 'herald', hp: 2, radius: 16, color: '#a3e635', baseScore: 260, speed: 75 },
  seeker: { kind: 'seeker', hp: 2, radius: 14, color: '#e879f9', baseScore: 250, speed: 80 },
  hollow_echo: { kind: 'hollow_echo', hp: 6, radius: 22, color: '#a7f3d0', baseScore: 300, speed: 0 },
  sovereign_core: { kind: 'sovereign_core', hp: 1, radius: 15, color: '#fde047', baseScore: 150, speed: 0 },
};

export const DARTER = {
  windup: 0.5, // telegraph before a lunge
  cadence: 2.2, // seconds between lunges
  lungeSpeed: 460,
  lungeTime: 0.4,
};

export const ORBITER = {
  orbitRadius: 240,
  angularSpeed: 1.1,
  fireCadence: 1.6,
  bulletSpeed: 240,
};

export const SPLITTER = {
  childCount: 2,
  childSpeed: 150,
};

// Brooder — a slow "carrier" that periodically hatches a fast mini drone (up to a
// cap). The tactical hook: prioritise dashing it down before it floods the screen.
export const BROODER = {
  driftSpeed: 45,
  spawnEvery: 2.6, // s between hatches
  windup: 0.6, // telegraph (core pulse) before a hatch
  maxSpawns: 4, // total drones one brooder births, then it's just a slow target
  childSpeed: 140,
};

export const BLOOMER = {
  ringCount: 12,
  ringCadence: 2.4,
  windup: 0.4,
  bulletSpeed: 180,
  driftSpeed: 30,
};

export const LANCER = {
  range: 380, // preferred standoff distance
  repositionTime: 1.1,
  lockTime: 0.85, // telegraph; aim is frozen at lock start (the dodge window)
  bulletSpeed: 410,
};

export const BOMBER = {
  detonateCount: 14,
  bulletSpeed: 200,
  armRange: 150, // pulses faster when this close
};

export const WISP = {
  packSize: 5,
  wobble: 36, // crescent spread so a pack is dash-through-able
};

// Drifter — a mid-range zoner that fires a 3-bullet arc fan (outer bullets slower
// so the wavefront curves) at a locked aim. Fills the gap between orbiter + lancer.
export const DRIFTER_TUNE = {
  range: 300, // preferred standoff
  repositionTime: 0.9,
  lockTime: 0.7, // telegraph; aim frozen at lock start
  arcSpread: 0.22, // half-angle of the arc fan
  bulletSpeed: 320,
  outerSpeedMul: 0.78, // outer bullets slower → arced wavefront
  strafeSpeed: 80,
};

// Herald — a mid-range "wall" zoner. Locks its aim, then casts a perpendicular
// WALL of slow bullets with one clear safe lane (gap). The gap is PREVIEWED during
// the telegraph (a broken dashed line), so threading it is hard-but-fair: read the
// lane, then dash or walk through it. The only chaff that demands gap-finding.
export const HERALD = {
  range: 330, // preferred standoff distance
  repositionTime: 1.5, // strafe/reposition window between walls
  lockTime: 0.85, // telegraph; aim + gap are frozen at lock start (the read window)
  strafeSpeed: 75,
  wallHalf: 200, // half-width of the bullet wall (px)
  spacing: 24, // px between wall bullets
  gapHalf: 44, // half-width of the safe lane — dash/walk through it
  bulletSpeed: 150,
} as const;

// Seeker — the roster's first TRACKER. A mid-range zoner that fires a single SLOW
// homing bolt: it curves toward you at a gentle, bounded turn rate for `homeTime`
// then flies straight. The fair counter is the dash (i-frames phase through it) or
// a wide juke — the turn rate is deliberately too low to corner you, and the bolt
// is slow enough to read. A new dodge vocabulary alongside the HERALD's walls.
export const SEEKER_TUNE = {
  range: 300, // preferred standoff
  repositionTime: 1.0,
  fireCadence: 2.4, // s between bolts
  lockTime: 0.5, // brief telegraph (aim line) before firing
  strafeSpeed: 72,
  bulletSpeed: 150, // slow → dash-through-able / jukeable
  turnRate: 1.7, // rad/s — gentle curve; can't out-turn a committed dodge
  homeTime: 1.8, // s the bolt tracks, then it flies straight (escapable)
} as const;

// Shade — a teleporting ambusher. Chases, then blinks to a fresh edge angle.
// No bullets; contact kill. Fills the gap between wisp + bomber.
export const SHADE_TUNE = {
  chaseSpeed: 150,
  blinkCadence: 3.2, // s between blinks
  telegraphTime: 0.4, // s of pre-blink warning flash
};

// THE HOLLOW — 5th boss. An intangible phantom: NEVER contact-lethal. It seeds
// killable echo clones and rains concentric rings; the ONLY way to damage it is
// to dash through its body during a telegraphed "Clone Sync" window (white flash).
export const HOLLOW = {
  baseHp: 5,
  hpPerInterval: 1, // +per boss-appearance ordinal (5th boss → 10 hp)
  weakPointBonus: 2, // extra dash damage during the sync window (so base builds clear it)
  radius: 40,
  color: '#6ee7b7',
  echoColor: '#a7f3d0',
  moveSpeed: 50,
  ringSpin: 0.6, // rad/s ring rotation
  ringEvery: 2.2, // s between concentric rings
  ringCount: 22,
  ringGap: 4, // bullets omitted → a rotating safe lane
  ringSpeed: 150,
  maxEchoes: 3, // echo clones seeded over the opening
  echoFireEvery: 1.9,
  echoBulletSpeed: 200,
  syncEvery: 3.5, // s between Clone Sync cycles
  syncTelegraph: 0.9, // s of white-flash warning before the window
  syncWindow: 1.0, // s the boss is damageable (dash through it)
  fanBullets: 5,
  fanSpread: 0.3,
  fanBulletSpeed: 210,
};

// Elite "Champions" — rare buffed variants that read as a moment + a payoff.
export const ELITE = {
  startTime: 55, // no champions in the opening minute
  baseChance: 0.05, // chance per eligible spawn at start of elite window
  maxChance: 0.14,
  rampSeconds: 240, // chance ramps to max over this window after startTime
  maxConcurrent: 2, // never more than this on screen — keeps them special
  hpMul: 3, // tanky but not a dash-grind slog on a fresh build
  sizeMul: 1.45,
  speedMul: 0.92, // a touch heavier/slower than its base kind
  scoreMul: 5,
  shardDrops: 6, // bonus shard gems (value 5) on death
  detonateCount: 12, // volatile bullet ring on death — risk on the reward
  detonateSpeed: 185,
  aura: '#fde047', // gold champion aura
};

// OVERDRIVE — a combo-charged ultimate. Fill the meter (kills + grazes), then
// unleash a screen-clearing time-dilated nova. The power-fantasy release.
export const OVERDRIVE = {
  chargePerKill: 0.055,
  chargePerHighComboKill: 0.09,
  highComboThreshold: 20,
  chargePerGraze: 0.012,
  cooldown: 18, // seconds before it can charge/fire again after a burst
  lockDuration: 3.2, // seconds the combo is frozen (no decay) after the burst
  novaRadius: 360, // px — non-boss enemies inside are obliterated
  novaDmg: 99,
  scoreBonus: 5000, // flat bonus (× combo mult × scoreMul)
  slowmoHold: 1.8, // seconds of slow-mo on activation
};

// CLUTCH MOMENTS — two systems that turn a near-death and a hot streak into a
// thrill: LAST BREATH (an automatic bullet-time second wind — it doesn't save
// you, it gives you the time to save yourself) and COMBO ERUPTION (combo
// milestones detonate a bullet-clearing nova: your reward for living dangerously).
export const CLUTCH = {
  // LAST BREATH
  lastBreathCooldown: 38, // s before it can save you again
  lastBreathDuration: 1.7, // s of the bullet-time window (real-time hold)
  lastBreathSlowmo: 0.18, // sim time-scale during the window (deep slow)
  lastBreathIframe: 0.55, // s of grace so the killing shot can't immediately re-hit
  lastBreathPush: 240, // px/s outward shove on nearby bullets (opens an escape lane)
  lastBreathPushRadius: 250,
  // COMBO ERUPTION
  eruptEvery: 50, // erupt at ×50, ×100, ×150, …
  eruptClearRadius: 360, // px — enemy bullets shattered inside (breathing room)
  eruptDamage: 3, // damage dealt to non-boss enemies in radius
  eruptDamageRadius: 240,
  eruptScore: 2500, // flat bonus (× combo mult × scoreMul)
  eruptSlowmoHold: 0.5,
};

// ─────────────────────────────────────────────────────────────────────────
// THE LAST LANCE — the SOUL layer. COHERENCE is ONE eased 0..1 value (a Game
// field, updated in frame() on realDt) that drives the gray→neon render wash
// AND the lone-drone→choir audio bloom AND the narrator — one bus. It consumes
// NO rng (Daily-safe). BEAT grades a dash release as a reward-only coherence
// kick (off-beat loses nothing). Every magnitude lives here.
// ─────────────────────────────────────────────────────────────────────────

// COHERENCE — the soul dial. Cosmetic & personal: never touches world.rng.
export const COHERENCE = {
  // ── target shaping (pure read of combo/dash/clutch) ──
  floor: 0.06, // gray-static baseline when the chain is dead
  comboHalf: 14, // combo at which the soft-knee reaches ~63% (1 - e^-1)
  comboWeight: 0.7, // share of target from combo
  dashChainFull: 5, // killsThisDash that maxes the hot-dash contribution
  dashWeight: 0.3, // share of target from a hot dash-chain
  lastBreathDim: 0.35, // multiply target during LAST BREATH (THE HUSH; softened by a11y)
  // ── easing (blooms fast, collapses gently) ──
  riseRate: 4.5, // value→target lerp rate/s when rising
  fallRate: 1.1, // …when falling
  // ── beat focus-snap (the ONLY beat reward feeds these two) ──
  perfectKick: 0.18, // bus jump on a Perfect on-beat dash
  onbeatKick: 0.06, // smaller jump for a Good on-beat dash
  focusPulseDecay: 0.5, // seconds for focusPulse 1→0
  focusSnapLift: 0.35, // added to the wash strength at peak focusPulse
  // ── render wash ──
  satFloor: 0.12, // min saturation multiplier at coherence 0 (never fully gray — readability)
  washGain: 0.88, // saturation lift from full coherence (satFloor..satFloor+washGain)
  cityGlowBase: 0.1, // bottom neon city-glow band alpha at coherence 0
  cityGlowGain: 0.55, // …added at coherence 1
  windowThreshold: 0.55, // coherence above which skyline window-lights appear
  exposureBase: 0.7, // background exposure floor
  exposureGain: 0.3, // exposure added by full coherence
  vignetteDeepen: 0.4, // how much LOW coherence deepens the vignette (world closing in)
  trailDim: 0.4, // ink-trail ghost dimmer floor at coherence 0
  skylineFloor: 0.05, // skyline band alpha at coherence 0 (a ghost of the dead city)
  skylineGain: 0.7, // …added at coherence 1 (the City of Lancefall resolves)
  // ── accessibility caps ──
  flashCap: 0.85, // max coherence-driven brightness swing under reduceFlashing
  clarityFloor: 0.85, // min whole-frame saturation under Clarity (the world never grays out below this)
  // ── combo → audio tier (monotone; reuses COMBO_TIERS cut points) ──
  tierCombo: [10, 20, 35, 50, 75, 100], // combo thresholds → tier 1..6
} as const;

// COHERENCE_AUDIO — the audio half of the one bus (drone bloom + root transpose).
export const COHERENCE_AUDIO = {
  tierSemis: [0, 2, 3, 5, 7, 9, 12], // semitone transpose per tier 0..6 (A-minor-pentatonic-safe)
  transposeGlide: 0.25,
  droneGlide: 0.5,
  filterBloom: 3200, // Hz added to the 700 base lowpass at coherence 1
  filterGlide: 0.5,
  choirOnset: 0.6, // coherence below which the choir is silent
  choirGain: 0.1, // total choir bus gain at full bloom (under the limiter)
  choirGlide: 0.6,
  // ── THE LANCE THEME lead (the earworm) — gated by coherence so the hook is the
  //    REWARD of a clean run; transposes with rootMul so the melody IS the scoreboard.
  leadOnset: 0.34, // coherence below which the lead hook is silent
  leadGain: 0.13, // lead bus gain at full bloom
  leadGlide: 0.45,
  leadDetune: 12, // cents — twin-saw detune that fattens the neon lead
  leadFilterBase: 1100, // Hz — lead lowpass base
  leadFilterBloom: 4200, // Hz added to the lead lowpass at coherence 1 (opens BRIGHT as you climb)
  airShelfDb: 6, // max +dB high-shelf @ airShelfHz on the music bus, scaled by coherence (spectral lift)
  airShelfHz: 7500,
  airGlide: 0.5,
  sparkleOnset: 0.62, // coherence above which the high SPARKLE layer (hook top +2 oct) rings
  sparkleGain: 0.05,
} as const;

// MACRO_FORM — anti-fatigue song structure. A short 2-bar surface hook, but a long
// effective horizon: A (plain) → A' (octave-up / ornamented) → B (the FALL fragment,
// fifth-up) → A. ~28-bar / ~60s rotation so nothing exact-repeats for ~2 min.
export const MACRO_FORM = {
  aBars: 8,
  aPrimeBars: 8,
  bBars: 4,
  // the sequence is [A, A', B, A]; total = aBars + aPrimeBars + bBars + aBars
} as const;

// AUDIO_MASTER — the production bus chain that makes the synth sound "produced"
// instead of "browser oscillators": a glue compressor → makeup → tanh brickwall
// soft-clip → destination. All purely cosmetic (no sim/rng impact).
export const AUDIO_MASTER = {
  compThreshold: -18, // dB — where the glue compressor starts pulling peaks together
  compKnee: 24, // dB — soft knee for transparent glue
  compRatio: 3, // gentle bus ratio
  compAttack: 0.006, // s — let transients (kick/thunk click) through, then clamp
  compRelease: 0.18, // s — musical release that breathes with the beat
  makeup: 1.18, // post-compressor makeup gain (recovers the level the comp pulled down)
  limiterK: 1.4, // tanh drive for the brickwall safety clip (eased 1.7→1.4 = cleaner, more air)
} as const;

// AUDIO_DELAY — tempo-synced ping-pong delay on the lead. The #1 "sounds produced vs
// sounds like a sine demo" lever for synthwave/darksynth; it was entirely absent.
export const AUDIO_DELAY = {
  beatMul: 0.75, // delay time = beat * 0.75 = a dotted-8th (the classic synthwave echo)
  feedback: 0.26, // ping-pong feedback (kept modest so echoes don't pile into clutter)
  wet: 0.2, // hook delay-send level (only the HOOK echoes now, not the busy arp/riff)
} as const;

// AUDIO_MIX — coordinated music "mix states". Instead of a binary 15% duck, each
// state sets a music level + a master music lowpass so a duck also MUFFLES (distant)
// rather than just turning down — the pro touch on menus/overdrive/death.
export const AUDIO_MIX = {
  combat: { musicMul: 1.0, cutoff: 20000, glide: 0.14 }, // full, open — normal play
  menu: { musicMul: 0.34, cutoff: 1500, glide: 0.1 }, // draft/menu: quieter + muffled, still vibing
  overdrive: { musicMul: 0.18, cutoff: 900, glide: 0.05 }, // duck hard so the nova owns the moment
  death: { musicMul: 0.12, cutoff: 600, glide: 0.25 }, // the light dims — muffled + distant
} as const;

// AUDIO_PUMP — the synthwave sidechain "pump": the four-on-the-floor kick ducks the
// sustained pad (harmonyBus) and recovers, so the whole track breathes with the beat.
// Implemented as scheduled gain dips keyed off the kick (no extra compressor node).
export const AUDIO_PUMP = {
  depth: 0.5, // pad gain ducked to this on each kick (1 = no duck)
  release: 0.1, // s — ease back to full between kicks (the "pump" recovery)
  percHeat: 0.65, // music heat above which the PERC/BREAK stem (hats/ghost-snare) kicks in
  snareHeat: 0.5, // music heat above which the backbeat ghost-snare (beats 2 & 4) plays
} as const;

// AUDIO_SFX — sound-design polish: stereo placement, de-click, and per-shot
// humanization so repeated kills don't sound like a machine gun of identical clicks.
export const AUDIO_SFX = {
  panMax: 0.72, // max positional pan for on-field events (x → L/R)
  humCents: 7, // ± pitch jitter (cents) on repeated/combo sounds
  humGain: 0.1, // ± relative gain jitter on repeated sounds
  chordSpread: 0.55, // stereo spread applied across the notes of a chord/stab
  declick: 0.004, // s — linear ramp to TRUE zero before stop() (kills the cutoff click)
  leadDetune: 11, // cents — detune of the twin oscillators that fatten/warm a lead voice
  leadCutoff: 2600, // Hz — lowpass that tames the raw-sawtooth buzz on lead/stab voices
} as const;

// AUDIO_REVERB — a synthesized convolution reverb (impulse rendered ONCE via an
// OfflineAudioContext at boot → offline-first, no asset download). Gives the music
// real space (today it's bone dry) and a lusher SFX tail than the old feedback delay.
export const AUDIO_REVERB = {
  seconds: 2.4, // IR length — a medium hall/plate
  decay: 3.2, // exp-decay exponent of the noise tail (higher = tighter)
  predelayMs: 18, // pre-delay before the tail (depth without smearing the transient)
  toneHz: 3200, // lowpass on the IR so the tail is dark/lush, never fizzy
  musicSend: 0.16, // music reverb-send level (harmony/lead are the wettest)
  sfxSend: 0.12, // sfx reverb-send level (kept low so impacts stay punchy)
  wet: 0.9, // convolver wet trim into the master
} as const;

// BEAT — dash-release grading (reward-only). Windows in seconds @ the music BPM.
export const BEAT = {
  perfectWindow: 0.045, // ±45ms (after grace) → Perfect
  goodWindow: 0.11, // ±110ms (after grace) → Good
  graceOnLanding: 0.06, // pad ~1 display-frame of input-poll quantization (60–144Hz fairness)
  reseedSnapTolerance: 0.25, // pure-clock drift beyond this → hard snap to audio truth
  reseedEase: 6, // per-second ease rate toward audio truth below the snap tolerance
} as const;

// NG+ — a difficulty loop unlocked by felling the Sovereign. The effect is gated
// at start() to NON-seeded modes so a Daily/seeded run stays bit-identical for all.
export const NG_PLUS = {
  intensityPerLoop: 0.14, // intensityMul *= 1 + level*this (non-seeded runs only)
  maxLoop: 8,
} as const;

// SLINGSHOT TETHER — an OPTIONAL alternate dash style (title toggle). The default
// Lance dash is left byte-identical; the slingshot adds a backward "load" drift
// while charging (you're pulled against the tether, exposed) then SNAPS forward
// farther + faster on release. Same swept-spear / i-frame mechanism fires it.
export const SLINGSHOT = {
  loadDrift: 540, // px/s backward pull while loading (drift away from aim — the wind-up)
  lenMul: 1.5, // the snap flings ~50% farther than the Lance
  durMul: 0.8, // …and snaps faster (shorter travel time for the same length → higher speed)
} as const;

// POWER-UP DROPS — temporary power-fantasy buffs. Bosses always drop one; elite
// Champions drop one sometimes. One active at a time (a new pickup replaces it).
export const POWERUP_DROP = {
  eliteChance: 0.4, // chance an elite Champion drops a power-up on death
  pickupLife: 14, // s a floating pickup lingers before fading
  magnetRadius: 150, // px — vacuum range (matches gem magnet feel)
  magnetAccel: 900,
  pickupRadius: 26, // px — collect range
};

export const WARDEN = {
  baseHp: 12, // dash-hits
  hpPerInterval: 4, // +per boss appearance
  radius: 44,
  moveSpeed: 90,
  phaseDuration: 6, // seconds per phase before swap
  // Phase A: spiral
  spiralBulletEvery: 0.09,
  spiralSpin: 2.39996, // golden angle (radians)
  spiralBulletSpeed: 200,
  // Phase B: aimed fans
  fanShots: 3,
  fanGap: 0.4,
  fanBullets: 5,
  fanSpread: 0.26, // radians
  fanRest: 2.0,
  fanBulletSpeed: 230,
  rearArc: 2.094, // 120 deg: bonus damage zone
  rearMultiplier: 3,
} as const;

// Second boss: the WEAVER — a pinwheel/ring boss, distinct from the Warden.
export const WEAVER = {
  baseHp: 12,
  hpPerInterval: 4,
  radius: 42,
  moveSpeed: 70,
  phaseDuration: 6,
  color: '#a855f7',
  // Phase A: rotating 4-arm pinwheel
  armCount: 4,
  pinwheelEvery: 0.12,
  pinwheelSpin: 1.2, // rad/s the arms rotate
  pinwheelBulletSpeed: 190,
  // Phase B: pulse rings with a moving safe-gap
  ringEvery: 1.3,
  ringBullets: 26,
  ringGap: 3, // consecutive omitted bullets = the safe lane
  ringBulletSpeed: 165,
} as const;

// Fourth boss: the MIRRORBLADE — a dash-duelist that lunges like the player.
export const MIRRORBLADE = {
  baseHp: 14,
  hpPerInterval: 4,
  radius: 22,
  color: '#ef4444',
  driftSpeed: 70,
  windup: 0.7, // telegraph before a lunge (aim line shows)
  dashSpeed: 980, // < radius+playerR per frame so it can't tunnel at 60fps
  dashLen: 520,
  recover: 0.9, // vulnerable pause after a lunge
  fanBullets: 3,
  fanSpread: 0.3,
  fanBulletSpeed: 230,
  // enrage (HP < 50%)
  windupFast: 0.45,
  recoverFast: 0.6,
} as const;

// Third boss: the BEACON — a rotating laser-sweep boss. The beam is a diameter
// line through the boss that telegraphs, then fires; you dash through the safe
// arcs (i-frames phase you through it).
export const BEACON = {
  baseHp: 14,
  hpPerInterval: 4,
  radius: 38,
  moveSpeed: 50,
  phaseDuration: 6.5,
  color: '#38bdf8',
  sweepSpin: 0.55, // rad/s beam rotation
  telegraphDur: 0.7,
  activeDur: 1.7,
  offDur: 0.5,
  beamWidth: 30,
  // Phase B: aimed fan bursts (the damage window)
  fanShots: 4,
  fanGap: 0.45,
  fanBullets: 5,
  fanSpread: 0.28,
  fanRest: 1.7,
  fanBulletSpeed: 215,
} as const;

// SIXTH & FINAL boss: THE SOVEREIGN — a crowned monarch that warps space. Its
// body is ARMORED (dash deals nothing) while its three orbiting Cores live;
// shatter all three to crack the crown EXPOSED for a punish window, after which
// the cores reform. Every Sovereign bullet curves under a gravity well, bending
// volleys into sweeping galaxy arms. Two armored phases alternate: a rotating
// star of CROWN BEAMS, and a golden-angle NOVA SPIRAL.
export const SOVEREIGN = {
  baseHp: 16,
  hpPerInterval: 3, // 6th boss → ~31 effective (mostly chewed by core weak-point chunks)
  radius: 50,
  color: '#fde047',
  coreColor: '#fff3a8',
  moveSpeed: 55,
  // orbiting Cores — the weak points
  coreCount: 3,
  coreOrbitRadius: 132,
  coreOrbitSpin: 0.95, // rad/s
  coreWeakBonus: 4, // dash-damage chunk dealt to the crown when a core shatters
  exposeDuration: 4.0, // s the body is vulnerable after all cores fall
  // armored phase cadence
  phaseDuration: 7,
  // PHASE 0 — CROWN BEAMS: a rotating star of diameter beams (telegraph→fire→off)
  beamArms: 3, // 3 diameters = 6 spokes
  beamSpin: 0.5, // rad/s
  beamWidth: 30,
  beamTelegraph: 0.85,
  beamActive: 1.4,
  beamOff: 0.7,
  // PHASE 1 — NOVA SPIRAL: golden-angle arms, bent by the well
  spiralEvery: 0.05,
  spiralSpin: 2.39996, // golden angle (rad)
  spiralSpeed: 235,
  spiralArms: 2,
  // EXPOSED — light aimed fans (your damage window)
  fanShots: 3,
  fanGap: 0.5,
  fanBullets: 5,
  fanSpread: 0.3,
  fanBulletSpeed: 200,
  fanRest: 1.4,
  // gravity well — bends every Sovereign bullet toward the body
  gravity: 34000, // accel coefficient before softening
  gravitySoftening: 140, // px — prevents blow-up near the body
} as const;

// Combo color ramp stops (by combo count)
export const COMBO_COLORS: { at: number; color: string }[] = [
  { at: 0, color: '#22d3ee' },
  { at: 8, color: '#34d399' },
  { at: 16, color: '#fbbf24' },
  { at: 28, color: '#ec4899' },
  { at: 44, color: '#ef4444' },
];
