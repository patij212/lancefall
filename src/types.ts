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
  | 'drifter'
  | 'shade'
  | 'brooder'
  | 'herald'
  | 'seeker'
  | 'warden'
  | 'weaver'
  | 'beacon'
  | 'mirrorblade'
  | 'hollow'
  | 'hollow_echo'
  | 'sovereign'
  | 'sovereign_core';

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
  grazesThisDash: number; // bullets grazed in this SINGLE dash (PERFECT THREAD risk/reward verb)
  perfectThreadFired: boolean; // one-shot latch: PERFECT THREAD rewards at most once per dash
  refundThisDash: number; // stamina refunded so far this dash (Siphon), capped per dash
  dashHeavy: boolean; // HEAVY LANCE: this dash fired heavy (armed by a sustained overcharge) → +dmg, +i-frames
  overcharge: number; // seconds held PAST full charge this charge (arms the heavy at heavyOverchargeTime)
  // PARRY (second verb): a short aim-directed deflect arc with a whiff-recovery window.
  parryTime: number; // seconds left in the active+recovery lock (>0 = can't dash/parry)
  parryCooldown: number; // seconds from parry start before another parry may fire
  parryActive: boolean; // the deflect arc is live this step (game.ts runs the sweep)
  parryRewarded: boolean; // one-shot latch: a parry pays its reward at most once
  parryElapsed: number; // seconds since this parry opened (for perfect-frame grading)
  parryStreak: number; // consecutive on-beat parries (scales reward; feeds coherence)
  parryStreakTimer: number; // seconds the streak survives before it decays to 0
  iframe: number; // seconds of invulnerability remaining

  stamina: number; // 0..maxStamina
  regenDelay: number; // seconds until regen resumes after a dash

  alive: boolean;
  hitFlash: number;
  shields: number; // ARMOR hit-buffer remaining this run (>0 absorbs a lethal hit before LAST BREATH)
  maxShields: number; // run cap for the +1 boss-clear regen
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
  subPhase: number; // generic sub-state: boss fan-counter / brooder hatch-count / herald gap-offset px
  fireCount: number; // generic per-enemy fire/cycle counter for VERB cadence (HERALD wide-gate; subPhase is taken there)
  cipherExposed?: number; // generic ring-cipher boss: >0 = punish window open (THE LONGEST DAY)
  facing?: number; // WARDEN: bounded-turn heading toward the player; its REAR arc is the weak-point
  ringTimer?: number; // SOVEREIGN: countdown to the next EXPOSED desperation ring (dodge-while-you-punish)
}

/** Per-shot visual tag (playtest: bullets need identity per enemy + shot type, not colour
 *  alone). Optional + defaults to 'orb' at spawn so every existing call is unchanged. Homing
 *  (SEEKER) and boss fire derive their look from existing fields, so they need no tag. */
export type BulletStyle = 'orb' | 'dart' | 'mine';

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
  /** seconds of homing budget left: while >0 the bullet curves toward the player
   *  at a bounded turn rate (the SEEKER's bolt), then flies straight. 0 = ballistic. */
  homing: number;
  /** visual archetype the renderer draws (orb/dart/mine); set at spawn, defaults to 'orb'. */
  shot?: BulletStyle;
  /** EnemyKind / boss-kind that fired this bullet (stamped at spawn from World.firingKind) for
   *  per-kind damage attribution in the LAST RUN debrief. '' = unattributed (e.g. elite aura). */
  fromKind?: string;
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
  y0: number; // spawn Y — rendered in place (no drift) under reduce-motion
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

/** Temporary power-up kinds dropped by bosses + elite Champions. */
export type PowerupKind = 'overreach' | 'haste' | 'frenzy' | 'greed' | 'aegis';

/** A floating power-up pickup (collected like a gem; grants a timed buff). */
export interface PowerupPickup {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: PowerupKind;
  life: number;
  spin: number;
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
  /** edge: a dash press was seen since the last poll but is NOT still held — a quick
   *  TAP. Fires an instant minimum dash so a sub-frame tap is never dropped and never
   *  has to wait out a charge frame. One-shot; cleared every poll. */
  dashTapped: boolean;
  pausePressed: boolean;
  /** edge: OVERDRIVE ultimate activation pressed this frame */
  overdrivePressed: boolean;
  /** edge: PARRY (second verb) pressed this frame — RMB / k / gamepad-B */
  parryPressed: boolean;
  /** perk-draft selection edge: 0/1/2 or -1 */
  selectIndex: number;
  anyPressed: boolean; // any start input (to leave title)
}
