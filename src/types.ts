// Shared types and enums for LANCEFALL. Zero logic — import-only by everyone.

export interface Vec2 {
  x: number;
  y: number;
}

export type EnemyKind =
  | 'darter'
  | 'orbiter'
  | 'splitter'
  | 'mini'
  | 'bloomer'
  | 'lancer'
  | 'bomber'
  | 'wisp'
  | 'warden'
  | 'weaver'
  | 'beacon'
  | 'mirrorblade';

/** Player charge/dash state machine. */
export type DashPhase = 'idle' | 'charging' | 'dashing';

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** facing/aim angle in radians */
  angle: number;
  radius: number; // true collision hitbox (small)

  phase: DashPhase;
  charge: number; // 0..1 charge progress while charging
  dashTime: number; // elapsed seconds within current dash
  dashDuration: number; // total seconds of current dash
  dashFromX: number;
  dashFromY: number;
  dashToX: number;
  dashToY: number;
  dashDirX: number;
  dashDirY: number;
  dashId: number; // increments each dash, tags enemies hit so one dash hits each once
  killsThisDash: number;
  iframe: number; // seconds of invulnerability remaining

  stamina: number; // 0..maxStamina
  regenDelay: number; // seconds until regen resumes after a dash

  alive: boolean;
  hitFlash: number;
}

export interface Enemy {
  active: boolean;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  radius: number;
  color: string;
  baseScore: number;
  /** generic behavior timer (telegraph / fire cadence) */
  timer: number;
  /** generic behavior phase counter */
  phase: number;
  /** wind-up / telegraph progress 0..1 (charger lunge, bloomer ring) */
  telegraph: number;
  angle: number; // orbit / facing angle
  spawnTime: number; // age for entrance interpolation
  hitFlash: number; // white flash on taking a hit
  lastDashId: number; // last dash that damaged this enemy (one-hit-per-dash)
  shielded: boolean;
  shieldAngle: number; // facing of the frontal shield arc
  elite: boolean; // a buffed "Champion" — more HP, bigger, bonus rewards, volatile death
  speedMul: number; // wave speed multiplier baked at spawn
  bulletMul: number; // wave bullet-speed multiplier baked at spawn
  isBoss: boolean;
  bossWave: number;
  scale: number; // render pop scale (juice tween target)
  fireTimer: number; // boss: time to next shot
  subPhase: number; // boss: fan counter within a phase
}

export interface Bullet {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  life: number;
  fromBoss: boolean;
  grazeCd: number; // per-bullet graze cooldown remaining
}

export type ParticleKind = 'spark' | 'trail' | 'debris' | 'ring' | 'streak';

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
  gravity: number;
  kind: ParticleKind;
  /** ring particles grow this radius over their life */
  ringR: number;
  ringMax: number;
}

export interface FloatingText {
  active: boolean;
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  scale: number;
  color: string;
}

export interface Gem {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  life: number;
}

export interface InputState {
  moveX: number; // -1..1
  moveY: number; // -1..1
  aimX: number; // world coords of aim point
  aimY: number;
  /** true while the player wants to be charging a dash */
  dashHeld: boolean;
  /** edge: released this frame */
  dashReleased: boolean;
  pausePressed: boolean;
  /** perk-draft selection edge: 0/1/2 or -1 */
  selectIndex: number;
  anyPressed: boolean; // any start input (to leave title)
}
