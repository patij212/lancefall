// ─────────────────────────────────────────────────────────────────────────
// TUNE — the single source of truth for every gameplay number in LANCEFALL.
// All distances in CSS pixels, all times in seconds, all speeds in px/s.
// This is the file you edit when tuning feel. Nothing else hardcodes a number.
// ─────────────────────────────────────────────────────────────────────────

export const FIXED_DT = 1 / 60; // fixed simulation timestep (seconds)
export const MAX_SUBSTEPS = 5; // anti spiral-of-death clamp

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
    bossInterval: 45, // seconds between mini-boss crescendos
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
