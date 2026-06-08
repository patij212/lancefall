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

export const BLOOMER = {
  ringCount: 12,
  ringCadence: 2.4,
  windup: 0.4,
  bulletSpeed: 180,
  driftSpeed: 30,
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

// Combo color ramp stops (by combo count)
export const COMBO_COLORS: { at: number; color: string }[] = [
  { at: 0, color: '#22d3ee' },
  { at: 8, color: '#34d399' },
  { at: 16, color: '#fbbf24' },
  { at: 28, color: '#ec4899' },
  { at: 44, color: '#ef4444' },
];
