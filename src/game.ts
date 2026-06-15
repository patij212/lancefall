// Top-level orchestrator: the fixed-timestep loop, the state machine, and the
// "feedback glue" that turns sim events into juice (audio + particles + shake +
// slow-mo). Owns the World, Renderer, UI, Input, Audio, Scheduler, and Director.

import { FIXED_DT, MAX_SUBSTEPS, MUSIC_BPM, NG_PLUS, TUNE, COHERENCE, BEACON, BOMBER, WISP, ELITE, HOLLOW, SOVEREIGN, CLUTCH, POWERUP_DROP } from './tune';
import { World } from './world';
import { Renderer, comboColor } from './render';
import type { Camera } from './render';
import { UI } from './ui';
import type { GameOverInfo } from './ui';
import { InputManager } from './input';
import { AudioEngine } from './audio';
import { Scheduler } from './scheduler';
import { Shake } from './shake';
import { Director } from './waves';
import { intensity, enemySpeedMul, bulletSpeedMul, maxConcurrent, eliteChance, ELITE_KINDS } from './waves';
import { updatePlayer, resetEvents } from './player';
import type { PlayerEvents } from './player';
import { updateEnemy, splitInto } from './enemies';
import { spawnBoss, updateBoss, bossName, beaconBeamActive, hollowSyncActive, isBossLethal, cleanupHollowEchoes, cleanupSovereignCores, countSovereignCores, spawnCipherRing, bossUsesRingCipher } from './boss';
import { beamHitsPoint, sovereignBeamActive, sovereignBodyArmored, exposeSovereign } from './sovereign';
import { dashCipherCore } from './cipher';
import { segCircleHit, circleHit } from './collision';
import { comboMultiplier, scoreForKill, grazeScore, registerKill, tickCombo, shouldSlowmo, hitstopFor } from './combat';
import { rollDraft, applyPerk, describeStacks } from './perks';
import { rollDraftCards, isEvolution, isRelic, availableEvolutions, describeEvolutions } from './evolutions';
import type { DraftCard, EvolutionId } from './evolutions';
import { RELICS, describeRelics } from './relics';
import { encodeBuildDna } from './buildDna';
import { submitScore } from './api';
import { hintFor, ONBOARDING_STEPS } from './onboarding';
import { tickOverdrive, chargeFromKill, chargeFromGraze, canActivate, activateOverdrive } from './overdrive';
import { tickClutch, canLastBreath, triggerLastBreath, resetErupt, eruptMilestone } from './clutch';
import { tickPowerup, activatePowerup, rollPowerup, POWERUPS } from './powerups';
import { OVERDRIVE, SEEKER_TUNE, AUDIO_SFX, CIPHER } from './tune';
import { RUN_EVENTS, rollEventChoices } from './events';
import type { RunEventId, EventChoice } from './events';
import { SHIPS, shipById } from './ships';
import { THEMES, themeById } from './themes';
import { TRAILS, trailById, trailParticleColor, canUnlockTrail } from './trails';
import type { TrailDef } from './trails';
import { metaApplyFor, metaNode, nodeCost } from './meta';
import { maxStamina } from './dash';
import { createRng, seedFromDate, dateString } from './rng';
import { evaluate as evalAchievements } from './achievements';
import { MODES } from './modes';
import type { RunConfig } from './modes';
import { MUTATORS, pickDailyMutators, buildMutatorApply, applyMutatorConfig, mutatorElite } from './mutators';
import type { MutatorId } from './mutators';
import { HEAT_LEVELS, applyHeatStats, applyHeatConfig } from './heat';
import { archetypeById } from './archetypes';
import { BIOMES, biomeAt } from './biomes';
import {
  loadSave,
  saveSave,
  loadSettings,
  saveSettings,
  particleDensityValue,
  buildShareString,
} from './save';
import type { SaveData, Settings } from './save';
import type { Enemy, EnemyKind } from './types';
import { newCoherence, resetCoherence, coherenceTarget, tickCoherence, comboTier, coherenceBeatKick } from './coherence';
import { BeatClock, makeGrid, gradeRelease } from './beat';
import { newNarrator, pickLine, ambientReady, NARRATOR } from './narrator';
import { ReplayRecorder } from './replay';
import { choiceEnding, echoLine, fragmentsForRun, ngPlusIntensityMul } from './stillpoint';
import { fragmentBalance, loreById } from './lore';
import { newGhost, recordGhost, ghostAt, serializeGhost, deserializeGhost, toChallengeCode, fromChallengeCode } from './ghost';
import type { Ghost } from './ghost';

type State = 'title' | 'playing' | 'paused' | 'draft' | 'event' | 'gameover';

/** Combo milestones → arcade announcements. */
// Cut points single-sourced from COHERENCE.tierCombo (tune.ts) so the on-screen
// milestones and the audio root-transpose tiers can never drift apart.
const COMBO_TIERS: { at: number; name: string; color: string }[] = [
  { at: COHERENCE.tierCombo[0], name: 'RAMPAGE', color: '#34d399' },
  { at: COHERENCE.tierCombo[1], name: 'FRENZY', color: '#fbbf24' },
  { at: COHERENCE.tierCombo[2], name: 'CARNAGE', color: '#fb923c' },
  { at: COHERENCE.tierCombo[3], name: 'UNSTOPPABLE', color: '#ec4899' },
  { at: COHERENCE.tierCombo[4], name: 'GODLIKE', color: '#a855f7' },
  { at: COHERENCE.tierCombo[5], name: 'LEGENDARY', color: '#ef4444' },
];

export class Game {
  private renderer: Renderer;
  private canvas: HTMLCanvasElement;
  private ui: UI;
  private input: InputManager;
  private audio = new AudioEngine();
  private scheduler = new Scheduler();
  private shake = new Shake();
  private director = new Director();

  private save: SaveData;
  private settings: Settings;

  private world: World;
  private state: State = 'title';
  private mode: RunConfig = MODES[0];
  private trail: TrailDef = trailById('pulse');
  private seed = 1;
  private winning = false;
  private winTimer = 0;
  private biomeIndex = -1;
  private biomeSpeedMul = 1;
  private biomeShield = 0;
  private deathCause = 'a bullet';

  /** COHERENCE — the soul dial (cosmetic; computed in frame() on realDt, rng-free) */
  private coherence = newCoherence();
  /** pure beat clock — advanced on realDt, reconciled toward the audio clock */
  private beat = new BeatClock(makeGrid(MUSIC_BPM));
  /** latched when a dash commits in step(); graded in frame() (out of the substep loop) */
  private dashFiredThisStep = false;
  /** the dead-world narrator — own rng (cosmetic), surfaces on toast/announce */
  private narrator = newNarrator();
  private narratedFirstKill = false;
  private replay = new ReplayRecorder();
  private runNgPlus = 0; // active NG+ level this run (0 = off / seeded run)
  private ghostRec: Ghost | null = null; // recording the current run's path
  private ghostRace: Ghost | null = null; // the ghost being raced (daily PB / a challenge)
  private lastRunGhost: Ghost | null = null; // the finished run's ghost (for "challenge a friend")
  private pendingChallenge: Ghost | null = null; // a decoded challenge to start on the next run
  private inChallenge = false;
  private challengeTarget = 0;
  private challengeName = '';

  private ev: PlayerEvents = { beganCharge: false, dashFired: false, dashLen: 0, landed: false, denied: false };
  private cam: Camera = { leanX: 0, leanY: 0, zoom: 1, shakeX: 0, shakeY: 0, shakeAngle: 0 };

  private accumulator = 0;
  private lastTime = 0;
  private candidates: Enemy[] = [];
  private chainBuf: Enemy[] = []; // separate buffer so chain explosions don't clobber the dash-hit loop
  private dashSlowmoTriggered = false;
  private dying = false;
  private dyingTimer = 0;
  private pendingDraft = false;
  private draftCards: DraftCard[] = [];
  private pendingEvent: RunEventId | null = null;
  private eventChoices: EventChoice[] = [];
  private announcedEvos = new Set<EvolutionId>(); // evolutions we've already flagged as ready
  private activeMutators: MutatorId[] = []; // run mutators in effect this run
  private eliteMods = { chanceMul: 1, maxAdd: 0 }; // champion-spawn mods from mutators
  private runHeat = 0; // heat level locked in for the active run
  private onboarding = false; // first-run progressive tutorial active
  private onboardStep = 0;
  private intensityTimer = 0;
  // adaptive perf: scale particle density down when frames run slow, restore when fast
  private baseDensity = 1;
  private perfScale = 1;
  private frameAccum = 0;
  private frameCount = 0;
  private perfCooldown = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(canvas);
    this.save = loadSave();
    this.settings = loadSettings();
    this.seed = seedFromDate();
    this.world = new World(createRng(this.seed));

    this.ui = new UI(uiRoot, this.settings, {
      onStart: (cfg) => this.start(cfg),
      onRestart: () => this.start(this.mode),
      onResume: () => this.resume(),
      onQuit: () => this.toTitle(),
      onPick: (i) => this.pickPerk(i),
      onPickEvent: (i) => this.pickEvent(i),
      onCopyScore: () => this.copyScore(),
      onCopyBuildDna: () => this.copyBuildDna(),
      onChoice: (c) => this.makeChoice(c),
      onSaveReplay: () => this.replay.saveGif(),
      onUnlockLore: (id) => this.unlockLore(id),
      onToggleNgPlus: () => this.toggleNgPlus(),
      onCreateChallenge: () => this.createChallenge(),
      onAcceptChallenge: (code) => this.acceptChallenge(code),
      onSettingsChange: (s) => this.applySettings(s),
      onSelectShip: (id) => this.selectShip(id),
      onUnlockShip: (id) => this.unlockShip(id),
      onSelectTheme: (id) => this.selectTheme(id),
      onUnlockTheme: (id) => this.unlockTheme(id),
      onSelectTrail: (id) => this.selectTrail(id),
      onUnlockTrail: (id) => this.unlockTrail(id),
      onBuyMeta: (id) => this.buyMeta(id),
      onHeatChange: (level) => this.setHeat(level),
      onArchetypeChange: (id) => this.setArchetype(id),
      onSetHandle: (name) => this.setHandle(name),
    });

    this.resize();
    window.addEventListener('resize', () => this.resize());
    // Unlock audio on the FIRST user gesture (browsers suspend audio until then) and bring the menu
    // to life — so the title isn't silent once the player has interacted. One-shot; removes itself.
    const unlockAudio = () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      this.audio.ensure();
      this.ui.hideSoundHint();
      if (this.state === 'title') this.startMenuMusic();
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    // auto-pause + suspend audio when the tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'playing') this.pause();
        this.audio.suspend();
      } else {
        this.audio.resume();
      }
    });
    this.applySettings(this.settings);
    this.applyTheme();
    this.ui.refreshTitle(this.save);
  }

  private applyTheme(): void {
    const t = themeById(this.save.selectedTheme);
    this.renderer.setTheme(t);
    document.documentElement.style.setProperty('--cyan', t.accent);
    this.applyTrail();
  }

  private applyTrail(): void {
    this.trail = trailById(this.save.selectedTrail);
    this.renderer.setTrail(this.trail);
  }

  boot(): void {
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // cap backing store for fill-rate headroom on hi-DPI
    this.renderer.resize(w, h, dpr);
    this.world.width = w;
    this.world.height = h;
  }

  private applySettings(s: Settings): void {
    this.settings = s;
    saveSettings(s);
    this.audio.setVolumes(s.master, s.sfx, s.music);
    this.audio.setSoundtrack(s.soundtrack);
    this.shake.intensity = s.shake * (s.reduceFlashing ? 0.4 : 1);
    this.input.rumbleEnabled = s.rumble;
    this.baseDensity = particleDensityValue(s.particleDensity) * (s.reduceFlashing ? 0.6 : 1);
    this.world.particles.density = this.baseDensity * this.perfScale;
    // reduce-motion disables decorative UI animations/transitions (CSS)
    document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
  }

  /** Adaptive perf: average frame time over ~0.5s windows and scale particle
   *  density down if we're dropping frames, back up when there's headroom. Keeps
   *  the game smooth on weaker machines under extreme load without a config toggle. */
  private adaptPerf(realDt: number): void {
    this.frameAccum += realDt;
    this.frameCount++;
    if (this.perfCooldown > 0) this.perfCooldown -= realDt;
    if (this.frameCount < 30) return;
    const avg = this.frameAccum / this.frameCount;
    this.frameAccum = 0;
    this.frameCount = 0;
    if (this.perfCooldown > 0) return;
    let next = this.perfScale;
    if (avg > 0.022 && this.perfScale > 0.4) next = Math.max(0.4, this.perfScale - 0.2); // <~45fps → ease off
    else if (avg < 0.015 && this.perfScale < 1) next = Math.min(1, this.perfScale + 0.2); // >~66fps → restore
    if (next !== this.perfScale) {
      this.perfScale = next;
      this.world.particles.density = this.baseDensity * this.perfScale;
      this.renderer.setQuality(this.perfScale); // gate the skyline window-lights under load
      this.perfCooldown = 3; // avoid thrash
    }
  }

  // ── state transitions ──
  private start(cfg: RunConfig): void {
    this.audio.ensure();
    this.ui.hideSoundHint();
    this.mode = cfg;
    const challenge = this.pendingChallenge;
    this.pendingChallenge = null;
    this.seed = challenge ? challenge.seed : cfg.seedKind === 'date' ? seedFromDate() : (Date.now() & 0x7fffffff) || 1;
    this.audio.setMusicVariant(this.seed); // one coherent arena track per run (reads the seed, no rng draw)
    this.world.rng = createRng(this.seed);
    this.world.seed = this.seed; // read-only source for the cipher-lock (no rng draw)
    // power-up drops draw from a SEPARATE stream so death-timed draws never perturb
    // the seeded director/spawn stream (keeps the Daily's waves identical for all)
    this.world.dropRng = createRng((this.seed ^ 0x1f83d9ab) >>> 0);
    this.world.metaApply = metaApplyFor(this.save.meta);
    this.world.shipApply = shipById(this.save.selectedShip).apply;
    // run mutators — the Daily picks a deterministic set from the date seed
    this.activeMutators = cfg.id === 'daily' ? pickDailyMutators(this.seed) : [];
    this.world.mutatorApply = buildMutatorApply(this.activeMutators);
    this.eliteMods = mutatorElite(this.activeMutators);
    // Heat ascension — stat effects via the postApply capstone, director effects via a cloned cfg
    this.runHeat = this.save.selectedHeat;
    this.world.postApply = (s) => applyHeatStats(s, this.runHeat);
    const effCfg = applyHeatConfig(applyMutatorConfig(cfg, this.activeMutators), this.runHeat);
    // NG+ — deepen NON-seeded runs only; daily/seeded stays bit-identical for everyone
    this.runNgPlus = this.save.ngPlusActive && cfg.seedKind !== 'date' ? Math.min(NG_PLUS.maxLoop, this.save.ngPlusLevel) : 0;
    const runMul = ngPlusIntensityMul(effCfg.intensityMul, this.save.ngPlusActive, this.save.ngPlusLevel, cfg.seedKind, NG_PLUS.intensityPerLoop, NG_PLUS.maxLoop);
    const runCfg = runMul === effCfg.intensityMul ? effCfg : { ...effCfg, intensityMul: runMul };
    this.world.reset(window.innerWidth, window.innerHeight);
    // head-start perks (Head Start meta node) — use a SEPARATE rng so they don't
    // consume the seeded world.rng (keeps Daily runs identical regardless of meta)
    const startPerks = this.world.stats.startPerks;
    if (startPerks > 0) {
      const hsRng = createRng((this.seed ^ 0x5bd1e995) >>> 0);
      for (let i = 0; i < startPerks; i++) {
        const pick = rollDraft(hsRng, this.world.stacks, 1)[0];
        if (pick && pick.id !== 'shardcache') applyPerk(this.world.stacks, pick.id);
      }
    }
    this.world.recomputeStats();
    // start each run with a full stamina bar sized to the chosen ship
    this.world.player.stamina = maxStamina(this.world.stats.staminaSegments);
    this.world.reviveLeft = this.world.stats.reviveTokens;
    this.applySettings(this.settings);
    this.director.configure(runCfg);
    this.winning = false;
    this.biomeIndex = -1;
    this.setBiome(0, false); // first biome, no banner at run start
    // clear any lingering juice/input state so a run never starts frozen,
    // mid-slow-mo, mid-charge-tone, or auto-charging from a held key
    this.scheduler.reset();
    this.shake.reset();
    this.audio.endCharge();
    this.input.clearHeld();
    this.cam.leanX = this.cam.leanY = 0;
    this.cam.zoom = 1;
    this.accumulator = 0;
    this.dying = false;
    this.pendingDraft = false;
    this.pendingEvent = null;
    this.dashSlowmoTriggered = false;
    this.announcedEvos.clear();
    this.intensityTimer = 0;
    resetCoherence(this.coherence);
    this.beat = new BeatClock(makeGrid(MUSIC_BPM)); // fresh epoch — never grade against a stale one
    this.dashFiredThisStep = false;
    // re-seed the narrator per run (cosmetic variety; totalRuns is save state, never world.rng)
    this.narrator = newNarrator((0x9e3779b1 ^ Math.imul(this.save.totalRuns + 1, 2654435761)) >>> 0);
    this.narratedFirstKill = false;
    // GHOST — record this run; race the stored ghost on seeded (daily) runs.
    // Render-only overlay; reads positions, never the sim → Daily stays deterministic.
    // GHOST — record EVERY run (for "challenge a friend" + the daily PB); race the
    // stored ghost: a challenge's challenger, or your daily PB.
    this.ghostRec = newGhost(this.seed, challenge ? 'challenge' : cfg.id);
    this.inChallenge = !!challenge;
    this.challengeTarget = challenge?.score ?? 0;
    this.challengeName = challenge?.name ?? '';
    this.ghostRace = challenge ?? (cfg.seedKind === 'date' ? this.loadGhost(this.dailyGhostKey(this.seed)) : null);
    this.state = 'playing';
    this.ui.show('playing');
    this.ui.setMode(cfg);
    const hudBadges = this.activeMutators.map((id) => ({ name: MUTATORS[id].name, accent: MUTATORS[id].accent }));
    if (this.runHeat > 0) hudBadges.unshift({ name: `HEAT ${this.runHeat}`, accent: HEAT_LEVELS[this.runHeat].accent });
    if (this.inChallenge) hudBadges.unshift({ name: `⚔ BEAT ${this.challengeTarget.toLocaleString()}`, accent: '#f472b6' });
    this.ui.setMutators(hudBadges);
    this.audio.startDrone();
    this.audio.duckMusic(false);
    this.narrate('run_start', 'announce', this.runNgPlus > 0 ? NARRATOR.loop : NARRATOR.runStart);
    if (cfg.seedKind === 'date') this.narrateOne('toast', echoLine(this.seed)); // ECHO OF THE FALL
    if (this.ghostRace) this.ui.toast(`◌ Racing ${this.ghostRace.name || 'your best'} · ${this.ghostRace.score.toLocaleString()}`);
    this.replay.start(this.canvas);

    // first-run progressive onboarding — hints surface as you perform each action
    if (!this.save.seenTutorial) {
      this.save.seenTutorial = true;
      saveSave(this.save);
      this.onboarding = true;
      this.onboardStep = 0;
      this.tryHint('start');
    } else {
      this.onboarding = false;
    }
  }

  /** Advance the first-run onboarding when the current step's trigger fires. */
  private tryHint(trigger: import('./onboarding').OnboardTrigger): void {
    if (!this.onboarding) return;
    const h = hintFor(this.onboardStep, trigger);
    if (!h) return;
    this.ui.toast(h.text);
    this.onboardStep++;
    if (this.onboardStep >= ONBOARDING_STEPS) this.onboarding = false;
  }

  /** The narrator surfaces a terse second-person line on the existing
   *  non-blocking toast/announce. Uses its OWN rng (cosmetic) — never world.rng —
   *  so it can never perturb a seeded run. */
  private narrate(bucket: string, surface: 'toast' | 'announce', pool: readonly string[], ambient = false): void {
    if (!pool.length) return;
    if (ambient && !ambientReady(this.narrator, bucket, this.world.time, 7)) return;
    const line = pool[pickLine(this.narrator, bucket, pool.length)];
    if (!line) return;
    if (surface === 'announce') this.ui.announce(line, '#cbd5e1');
    else this.ui.toast(line);
  }

  /** Surface a single keyed narrator line (boss/strata/combo-tier), if present. */
  private narrateOne(surface: 'toast' | 'announce', line: string | undefined): void {
    if (!line) return;
    if (surface === 'announce') this.ui.announce(line, '#cbd5e1');
    else this.ui.toast(line);
  }

  private resume(): void {
    this.state = 'playing';
    this.ui.show('playing');
    this.audio.duckMusic(false);
    // brief protection so you're not killed the instant you unpause
    this.world.player.iframe = Math.max(this.world.player.iframe, 1);
  }

  private pause(): void {
    this.state = 'paused';
    this.ui.setPauseBuild(this.buildLine(), shipById(this.save.selectedShip).name, this.runHeat);
    this.ui.show('paused');
    this.audio.endCharge(); // don't let the charge tone drone through the menu
    this.audio.duckMusic(true);
  }

  private toTitle(): void {
    this.state = 'title';
    this.ui.show('title');
    this.ui.refreshTitle(this.save);
    this.renderer.setBiomeTint(null); // restore the cosmetic theme nebula on menus
    this.audio.endCharge();
    this.startMenuMusic(); // the menu vibes too — not silent (no-op until audio is unlocked by a gesture)
  }

  /** Calm, muffled menu music on the title (the menu mix: 34% vol + 1500 Hz lowpass). startDrone is a
   *  no-op if the music is already running or the context isn't unlocked yet. */
  private startMenuMusic(): void {
    this.audio.startDrone();
    this.audio.duckMusic(true);
  }

  private openDraft(): void {
    const w = this.world;
    this.draftCards = rollDraftCards(w.rng, w.stacks, w.evolutions, w.stats.draftSize, {
      weightMap: archetypeById(this.save.selectedArchetype).weights,
      takenRelics: w.relics,
      relicChance: TUNE.director.relicChance,
    });
    this.state = 'draft';
    this.ui.showDraft(this.draftCards);
    this.audio.duckMusic(true);
  }

  private pickPerk(i: number): void {
    if (this.state !== 'draft') return;
    const card = this.draftCards[i];
    if (!card) return;
    const w = this.world;
    if (isEvolution(card)) {
      w.evolutions.push(card.id);
      w.recomputeStats();
      this.ui.announce(`EVOLVED · ${card.name}`, card.accent);
      this.renderer.flash(card.accent, 0.3);
      this.shake.add(0.4);
      this.audio.bossStinger();
    } else if (isRelic(card)) {
      w.relics.push(card.id);
      w.boons.push(RELICS[card.id].apply);
      w.recomputeStats();
      this.ui.announce(`CURSED · ${card.name}`, card.accent);
      this.renderer.flash(card.accent, 0.26);
      this.shake.add(0.35);
      this.audio.bossStinger();
    } else if (card.id === 'shardcache') {
      w.score += 200;
      w.shards += 50;
    } else {
      applyPerk(w.stacks, card.id);
      w.recomputeStats();
      this.ui.toast(`PERK: ${card.name}`);
      this.checkEvoReady();
    }
    this.state = 'playing';
    this.ui.show('playing');
    this.audio.duckMusic(false);
  }

  /** OVERDRIVE burst — clear bullets, obliterate nearby chaff, dilate time, big score. */
  private activateBurst(): void {
    const w = this.world;
    if (!activateOverdrive(w.overdrive)) return;
    w.overdriveUses++;
    const p = w.player;
    // clear every non-boss bullet on screen
    w.bullets.forEachActive((b) => { if (!b.fromBoss) w.bullets.release(b); });
    // obliterate non-boss enemies within the nova radius (snapshot first — killEnemy mutates the pool)
    const r2 = OVERDRIVE.novaRadius * OVERDRIVE.novaRadius;
    const victims: import('./types').Enemy[] = [];
    w.enemies.forEachActive((e) => {
      if (e.isBoss || e.kind === 'sovereign_core') return; // Cores are a dash-only target
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy <= r2) victims.push(e);
    });
    for (const e of victims) if (e.active) this.killEnemy(e, false);
    // chunk a boss too (a fair reward, not a oneshot) — but respect the Sovereign's
    // armor: the nova only bites the crown once it's EXPOSED, like the dash.
    if (w.bossAlive && w.boss && !sovereignBodyArmored(w.boss) && !this.bossCipherArmored(w.boss)) this.damageEnemy(w.boss, OVERDRIVE.novaDmg * 0.05 + 2, true);
    // score + spectacle
    const bonus = Math.round(OVERDRIVE.scoreBonus * comboMultiplier(w.combo) * w.stats.scoreMul);
    w.score += bonus;
    w.particles.floatText(p.x, p.y - 44, `DAYBREAK +${bonus.toLocaleString()}`, '#ffffff', 1.7);
    w.particles.ring(p.x, p.y, OVERDRIVE.novaRadius, '#ffffff', 0.5);
    w.particles.ring(p.x, p.y, OVERDRIVE.novaRadius * 0.6, '#5beaff', 0.4);
    w.particles.burst(p.x, p.y, 70, '#ffffff');
    this.scheduler.requestSlowmo(OVERDRIVE.slowmoHold);
    this.shake.add(1.0);
    this.renderer.flash('#ffffff', 0.7);
    this.renderer.startOverdriveNova('#5beaff');
    this.audio.overdriveBurst();
    this.audio.setMixState('overdrive'); // momentary duck under the nova, then bloom back
    this.cam.zoom = Math.max(this.cam.zoom, 1.18);
    this.input.rumble(0.8, 1, 280);
    this.ui.announce('DAYBREAK', '#ffffff');
    coherenceBeatKick(this.coherence, true); // THE DROP — DAYBREAK decrypts the world back to full neon light
  }

  private openEvent(id: RunEventId): void {
    const def = RUN_EVENTS[id];
    this.eventChoices = rollEventChoices(id, this.world.rng, this.world);
    this.state = 'event';
    this.ui.showEvent(def.name, def.flavor, def.accent, this.eventChoices);
    this.audio.duckMusic(true);
    this.renderer.flash(def.accent, 0.14);
  }

  private pickEvent(i: number): void {
    if (this.state !== 'event') return;
    const choice = this.eventChoices[i];
    if (!choice) return;
    choice.resolve(this.world);
    this.ui.toast(`${choice.name}`);
    this.state = 'playing';
    this.ui.show('playing');
    this.audio.duckMusic(false);
  }

  /** Announce once when a new evolution becomes craftable, so the build goal is felt. */
  private checkEvoReady(): void {
    const w = this.world;
    for (const evo of availableEvolutions(w.stacks, w.evolutions)) {
      if (this.announcedEvos.has(evo.id)) continue;
      this.announcedEvos.add(evo.id);
      this.ui.announce(`EVOLUTION READY · ${evo.name}`, evo.accent);
      this.renderer.flash(evo.accent, 0.16);
      this.audio.pickup(16);
    }
  }

  private selectShip(id: string): void {
    if (!this.save.unlockedShips.includes(id)) return;
    this.save.selectedShip = id;
    saveSave(this.save);
    this.ui.refreshTitle(this.save);
  }

  private unlockShip(id: string): void {
    const ship = SHIPS.find((s) => s.id === id);
    if (!ship || this.save.unlockedShips.includes(id)) return;
    if (this.save.shards < ship.unlockShards) {
      this.ui.toast(`Need ${ship.unlockShards - this.save.shards} more shards`);
      return;
    }
    this.save.shards -= ship.unlockShards;
    this.save.unlockedShips.push(id);
    this.save.selectedShip = id;
    saveSave(this.save);
    this.ui.toast(`${ship.name} unlocked!`);
    this.ui.refreshTitle(this.save);
  }

  private selectTheme(id: string): void {
    if (!this.save.unlockedThemes.includes(id)) return;
    this.save.selectedTheme = id;
    saveSave(this.save);
    this.applyTheme();
    this.ui.refreshTitle(this.save);
  }

  private unlockTheme(id: string): void {
    const theme = THEMES.find((t) => t.id === id);
    if (!theme || this.save.unlockedThemes.includes(id)) return;
    if (this.save.shards < theme.unlockShards) {
      this.ui.toast(`Need ${theme.unlockShards - this.save.shards} more shards`);
      return;
    }
    this.save.shards -= theme.unlockShards;
    this.save.unlockedThemes.push(id);
    this.save.selectedTheme = id;
    saveSave(this.save);
    this.applyTheme();
    this.ui.toast(`${theme.name} theme unlocked!`);
    this.ui.refreshTitle(this.save);
  }

  private selectTrail(id: string): void {
    if (!this.save.unlockedTrails.includes(id)) return;
    this.save.selectedTrail = id;
    saveSave(this.save);
    this.applyTrail();
    this.ui.refreshTitle(this.save);
  }

  private unlockTrail(id: string): void {
    const trail = TRAILS.find((t) => t.id === id);
    if (!trail || this.save.unlockedTrails.includes(id)) return;
    if (!canUnlockTrail(trail, this.save.shards, this.save.achievements)) {
      this.ui.toast(trail.unlockAch ? 'Defeat the Sovereign to unlock CROWN' : `Need ${trail.unlockShards - this.save.shards} more shards`);
      return;
    }
    if (!trail.unlockAch) this.save.shards -= trail.unlockShards; // achievement trails are free
    this.save.unlockedTrails.push(id);
    this.save.selectedTrail = id;
    saveSave(this.save);
    this.applyTrail();
    this.ui.toast(`${trail.name} trail unlocked!`);
    this.ui.refreshTitle(this.save);
  }

  private buyMeta(id: string): void {
    const node = metaNode(id);
    if (!node) return;
    const lvl = this.save.meta[id] ?? 0;
    if (lvl >= node.maxLevel) return;
    const cost = nodeCost(node, lvl);
    if (this.save.shards < cost) {
      this.ui.toast(`Need ${cost - this.save.shards} more shards`);
      return;
    }
    this.save.shards -= cost;
    this.save.meta[id] = lvl + 1;
    saveSave(this.save);
    this.ui.toast(`${node.name} → Lv ${lvl + 1}`);
    this.ui.refreshTitle(this.save);
    this.ui.openUpgrades();
  }

  /** The full run build summary: evolutions (caps) lead, then relics, then perks. */
  private buildLine(): string {
    const evo = describeEvolutions(this.world.evolutions);
    const relics = describeRelics(this.world.relics);
    const perks = describeStacks(this.world.stacks);
    return [evo, relics, perks].filter(Boolean).join(' · ');
  }

  private setHeat(level: number): void {
    this.save.selectedHeat = Math.max(0, Math.min(HEAT_LEVELS.length - 1, Math.floor(level)));
    this.save.maxHeat = Math.max(this.save.maxHeat, this.save.selectedHeat);
    saveSave(this.save);
    this.ui.refreshTitle(this.save);
  }

  private setArchetype(id: string): void {
    this.save.selectedArchetype = archetypeById(id).id;
    saveSave(this.save);
    this.ui.refreshTitle(this.save);
  }

  private setHandle(name: string): void {
    this.save.handle = name.replace(/[^\w \-]/g, '').slice(0, 16).trim();
    saveSave(this.save);
  }

  private copyBuildDna(): void {
    const w = this.world;
    const dna = encodeBuildDna({
      v: 1,
      ship: this.save.selectedShip,
      heat: this.runHeat,
      arch: this.save.selectedArchetype,
      stacks: { ...w.stacks },
      evos: w.evolutions.slice(),
      relics: w.relics.slice(),
    });
    try {
      void navigator.clipboard?.writeText(dna);
      this.ui.toast('Build DNA copied — share your build!');
    } catch {
      this.ui.toast(dna);
    }
  }

  private copyScore(): void {
    const shipName = shipById(this.save.selectedShip).name;
    const perks = this.buildLine();
    const build = perks ? `${shipName} [${perks}]` : shipName;
    const str = buildShareString(this.world.score, this.world.bestComboRun, this.director.wave, this.mode.id === 'daily', `${this.mode.name} · ${build}`);
    try {
      void navigator.clipboard?.writeText(str);
      this.ui.toast('Score copied to clipboard!');
    } catch {
      this.ui.toast(str);
    }
  }

  // ── main loop ──
  private frame(now: number): void {
    let realDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (realDt > 0.1) realDt = 0.1;

    if (this.state === 'playing') this.adaptPerf(realDt);

    this.input.poll(this.world.player.x, this.world.player.y);
    this.handleMeta();

    this.shake.update(realDt);

    if (this.state === 'playing') {
      const simDt = this.scheduler.update(realDt);
      this.accumulator += simDt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
        this.step(FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps++;
        // open a pending draft/event immediately so a scripted boss can't spawn
        // in the same frame before the modal appears (Boss Rush inter-boss draft)
        if ((this.pendingDraft || this.pendingEvent) && !this.dying && !this.winning) break;
      }
      if (steps >= MAX_SUBSTEPS) this.accumulator = 0;

      // arp DENSITY (heat) stays on the cheap 0.4s throttle; the COHERENCE bloom
      // (drone/lead/choir/filter) is pushed every frame below, next to the render
      // half, so sight + sound lock to the SAME value at the SAME instant.
      this.intensityTimer -= realDt;
      if (this.intensityTimer <= 0) {
        this.intensityTimer = 0.4;
        this.audio.setIntensity(intensity(this.world.time));
      }

      // lock the cosmetic beat grid to the ACTIVE source's tempo (authored bed or procedural).
      // Source switches land on bar downbeats, so the re-seed is bar-aligned (Deep Dive A) — the
      // next reconcile re-seeds t to the new source's musicTime. Read-only: no sim, no rng.
      if (this.audio.activeBpm !== this.beat.grid.bpm) this.beat.retempo(this.audio.activeBpm);
      // advance the pure beat clock every frame, reconciled toward the audio truth
      // (only while music is actually running — never seed the epoch to a sentinel 0)
      this.beat.advance(realDt);
      if (this.audio.musicRunning) this.beat.reconcile(this.audio.musicTime, realDt);

      // read-only boss state → authored boss-source selection + edge SFX (warden arrival/phase/fan).
      // Reads world/music state only; never mutates the sim or draws rng.
      const wb = this.world.boss;
      this.audio.setBossState(
        wb && this.world.bossAlive ? wb.kind : null,
        wb?.phase ?? 0, wb?.subPhase ?? 0, wb ? wb.hp / Math.max(1, wb.maxHp) : 1,
      );

      // biome cycling
      if (!this.dying && !this.winning) {
        const bi = biomeAt(this.world.time).index;
        if (bi !== this.biomeIndex) this.setBiome(bi, true);
      }

      if (this.dying) {
        this.dyingTimer -= realDt;
        if (this.dyingTimer <= 0) this.finishGameOver(false);
      }
      if (this.winning) {
        this.winTimer -= realDt;
        if (this.winTimer <= 0) this.finishGameOver(true);
      }
      if (this.pendingDraft && !this.dying && !this.winning) {
        this.pendingDraft = false;
        this.openDraft();
      } else if (this.pendingEvent && !this.dying && !this.winning && this.state === 'playing') {
        const id = this.pendingEvent;
        this.pendingEvent = null;
        this.openEvent(id);
      }
    }

    this.updateCamera(realDt);

    // DASH ON THE BEAT — grade the committed dash release (latched in step())
    // against the pure beat clock. A graded on-beat dash kicks Coherence (the
    // ONLY beat reward) and, on Perfect, schedules an on-grid snare. Off-beat
    // loses nothing; this path reads/writes NO rng stream.
    if (this.dashFiredThisStep) {
      this.dashFiredThisStep = false;
      const grade = gradeRelease(this.beat.beatError(), this.beat.synced);
      if (grade !== 'off') coherenceBeatKick(this.coherence, grade === 'perfect');
      if (grade === 'perfect' && !this.settings.reduceFlashing)
        this.audio.perfectDashSnare(this.audio.clock + (this.beat.nextGridTime() - this.beat.t));
    }

    // COHERENCE — the soul dial, computed each display frame on realDt. A Game
    // field (never on world / never in step()) → structurally rng-free. The
    // render half reads it in Phase 3; the audio half rides the 0.4s throttle.
    const cw = this.world;
    if (this.state === 'title') {
      // THE STILLPOINT hub — the title skyline reflects THE CHOICE made on the
      // Sovereign kill: held the light → the neon City; let it go → dark ruin.
      this.coherence.tier = 0;
      this.coherence.target =
        this.save.stillpointChoice === 'catch' ? 0.92 : this.save.stillpointChoice === 'fall' ? 0.12 : 0.42;
    } else {
      this.coherence.tier = comboTier(cw.combo);
      this.coherence.target = coherenceTarget(cw.combo, cw.comboTimer, cw.player.killsThisDash, cw.clutch.lastBreathActive);
    }
    tickCoherence(this.coherence, realDt);
    // THE ONE BUS — push the eased Coherence value to sight AND sound on the SAME
    // frame with the SAME value (the audio glides smooth the per-frame writes; the
    // call no-ops when music isn't running, so the title hub stays silent-safe).
    this.renderer.setCoherence(this.coherence.value, this.coherence.focusPulse);
    this.audio.setCoherence(this.coherence.value, this.coherence.tier);

    // narrator (cosmetic; own rng; frame-context, never the seeded sim)
    if (this.state === 'playing') {
      if (!this.narratedFirstKill && cw.killCount >= 1) {
        this.narratedFirstKill = true;
        this.narrate('first_kill', 'toast', NARRATOR.firstKill);
      }
      if (this.coherence.value >= 0.85) this.narrate('high_coherence', 'toast', NARRATOR.highCoherence, true);
    }

    // GHOST — record this run's path + replay the raced ghost (render-only; no sim)
    if (this.state === 'playing' && this.ghostRec) recordGhost(this.ghostRec, cw.time, cw.player.x, cw.player.y);
    if (this.ghostRace && this.state === 'playing') {
      const gp = ghostAt(this.ghostRace, cw.time);
      this.renderer.setGhost(gp && !gp.done ? gp.x : null, gp ? gp.y : 0);
    } else {
      this.renderer.setGhost(null, 0);
    }

    this.renderer.render(this.world, this.cam, {
      reduceFlashing: this.settings.reduceFlashing,
      colorblind: this.settings.colorblind,
      combo: this.world.combo,
      caScale: this.settings.chromAberration,
      reduceMotion: this.settings.reduceMotion,
      clarity: this.settings.clarity,
      beatRing: this.settings.rhythmAssist,
      beatPhase: this.beat.beatPhase(),
      slingshot: this.settings.dashStyle === 'slingshot',
    });
    if (this.state === 'playing') this.ui.updateHud(this.world, this.world.particles.density);

    requestAnimationFrame((t) => this.frame(t));
  }

  private handleMeta(): void {
    const inp = this.input.state;
    if (this.state === 'title') {
      if (this.input.consumeStart()) this.start(MODES[0]);
    } else if (this.state === 'playing') {
      if (inp.pausePressed) this.pause();
      if (inp.overdrivePressed && canActivate(this.world.overdrive)) this.activateBurst();
    } else if (this.state === 'paused') {
      if (inp.pausePressed) this.resume();
    } else if (this.state === 'draft') {
      if (inp.selectIndex >= 0) this.pickPerk(inp.selectIndex);
      else if (this.input.consumeConfirm()) this.pickPerk(1);
    } else if (this.state === 'event') {
      if (inp.selectIndex >= 0) this.pickEvent(inp.selectIndex);
      else if (this.input.consumeConfirm()) this.pickEvent(0);
    } else if (this.state === 'gameover') {
      if (this.input.consumeRestart() || this.input.consumeConfirm()) this.start(this.mode);
    }
    // clear one-shot edges every frame so the dash key can't leak a restart/start
    this.input.consumeStart();
    this.input.consumeConfirm();
  }

  // ── one fixed simulation step ──
  private step(dt: number): void {
    const w = this.world;
    w.time += dt;

    // player
    resetEvents(this.ev);
    const wasCharging = w.player.phase === 'charging';
    updatePlayer(w.player, this.input.state, dt, w.stats, w.width, w.height, this.ev, this.settings.dashStyle === 'slingshot');
    this.handlePlayerEvents(wasCharging);

    // dash + afterimage hits (share one hash rebuild).
    // Resolve on the landing step too (ev.landed) so the final segment to the
    // dash endpoint is never skipped.
    const dashing = w.player.phase === 'dashing' || this.ev.landed;
    if (dashing || w.ghostTimer > 0) w.hash.rebuild(w.enemies.items);
    if (dashing) {
      w.particles.trail(w.player.x, w.player.y, 5, trailParticleColor(this.trail, comboColor(w.combo)));
      // Nova Dash: detonate a shockwave at the launch point
      if (this.ev.dashFired && w.stats.dashNovaRadius > 0) {
        this.chainExplode(w.player.dashFromX, w.player.dashFromY, w.stats.dashNovaRadius, 1, true);
      }
      this.resolveDashHits();
    }
    if (w.ghostTimer > 0) {
      w.ghostTimer -= dt;
      this.resolveGhostHits();
    }

    // enemies + boss
    w.enemies.forEachActive((e) => {
      if (e.isBoss) updateBoss(e, w, dt);
      else updateEnemy(e, w, dt);
      // soft-clamp so nobody flies off forever
      const m = 60;
      e.x = Math.max(-m, Math.min(w.width + m, e.x));
      e.y = Math.max(-m, Math.min(w.height + m, e.y));
    });

    // bullets
    this.updateBullets(dt);

    // gems
    this.updateGems(dt);

    // power-up pickups
    this.updatePowerups(dt);

    // player death by contact
    if (w.player.alive && !this.dying && w.player.iframe <= 0) {
      this.checkBodyCollisions();
    }

    // director
    if (!this.dying && !this.winning && w.player.alive) {
      const liveEnemies = w.enemies.activeCount - (w.bossAlive ? 1 : 0);
      const dec = this.director.update(dt, liveEnemies, w.bossAlive, w.rng);
      this.applyDirector(dec.spawn);
      if (dec.boss) this.spawnWarden(dec.bossKind);
      if (dec.perk) this.pendingDraft = true;
      if (dec.event) this.pendingEvent = dec.event;
      if (dec.win) this.winRun();
    }

    // OVERDRIVE meter/cooldown ticks
    tickOverdrive(w.overdrive, dt);
    // CLUTCH timers (LAST BREATH cooldown/window)
    tickClutch(w.clutch, dt);
    // POWER-UP buff timer — recompute stats the instant it expires
    if (tickPowerup(w.powerup, dt)) {
      w.recomputeStats();
      this.audio.comboBreak();
      w.particles.floatText(w.player.x, w.player.y - 34, 'POWER-UP FADED', '#94a3b8', 0.8);
    }

    // combo decay — frozen during the OVERDRIVE lock window (keep the combo alive)
    if (w.overdrive.lockTimer > 0) {
      w.comboTimer = Math.max(w.comboTimer, 1); // hold the window open
    } else {
      const c = tickCombo(w.combo, w.comboTimer, dt);
      if (c.broke) {
        this.audio.comboBreak();
        this.ui.comboBreakFlash();
        w.particles.floatText(w.player.x, w.player.y - 30, 'COMBO BREAK', '#ef4444', 0.9);
        this.narrate('combo_break', 'toast', NARRATOR.comboBreak, true);
        w.lastTierAnnounced = 0;
        resetErupt(w.clutch); // re-arm COMBO ERUPTION for the next climb
        this.tryHint('comboBreak');
      }
      w.combo = c.combo;
      w.comboTimer = c.timer;
    }

    // collect streak decay
    if (w.collectStreakTimer > 0) {
      w.collectStreakTimer -= dt;
      if (w.collectStreakTimer <= 0) w.collectStreak = 0;
    }

    w.particles.update(dt);
  }

  private handlePlayerEvents(wasCharging: boolean): void {
    const w = this.world;
    const p = w.player;
    if (this.ev.beganCharge) this.audio.startCharge();
    if (p.phase === 'charging') this.audio.setCharge(p.charge);
    if (wasCharging && p.phase !== 'charging' && !this.ev.dashFired) this.audio.endCharge();
    if (this.ev.dashFired) {
      this.dashFiredThisStep = true; // latch the committed release; graded in frame() (out of step)
      this.audio.endCharge();
      this.audio.whoosh();
      this.shake.add(TUNE.juice.traumaDash);
      this.dashSlowmoTriggered = false;
      w.particles.streaks(p.x, p.y, p.dashDirX, p.dashDirY, trailParticleColor(this.trail, comboColor(w.combo)));
      this.cam.zoom = Math.max(this.cam.zoom, 1.03);
      this.input.rumble(0.0, 0.3, 70);
      this.tryHint('dash');
    }
    if (this.ev.landed) {
      w.particles.dust(p.x, p.y, '#22d3ee');
      if (w.stats.afterimageSec > 0) {
        w.ghostX0 = p.dashFromX;
        w.ghostY0 = p.dashFromY;
        w.ghostX1 = p.x;
        w.ghostY1 = p.y;
        w.ghostTimer = w.stats.afterimageSec;
        w.ghostDashId = p.dashId;
      }
    }
  }

  private resolveDashHits(): void {
    const w = this.world;
    const p = w.player;
    const ax = p.dashFromX;
    const ay = p.dashFromY;
    const bx = p.x;
    const by = p.y;
    const r = w.stats.dashHitboxRadius;
    const minX = Math.min(ax, bx) - r - 30;
    const minY = Math.min(ay, by) - r - 30;
    const maxX = Math.max(ax, bx) + r + 30;
    const maxY = Math.max(ay, by) + r + 30;
    w.hash.queryAABB(minX, minY, maxX, maxY, this.candidates);
    let cipherBest: Enemy | null = null; // the cipher core the spear reaches first
    let cipherBestD = Infinity;
    for (const e of this.candidates) {
      if (!e.active || e.lastDashId === p.dashId) continue;
      if (this.spearBlocked(e)) {
        // Sovereign body armored → an "ARMORED" clang (the Hollow is silent)
        if (e.kind === 'sovereign' && segCircleHit(ax, ay, bx, by, e.x, e.y, e.radius, r)) {
          e.lastDashId = p.dashId;
          e.hitFlash = 0.08;
          w.particles.burst(e.x, e.y, 8, '#fff3a8');
          w.particles.floatText(e.x, e.y - e.radius - 10, 'ARMORED', '#fde047', 0.7);
        }
        continue;
      }
      if (segCircleHit(ax, ay, bx, by, e.x, e.y, e.radius, r)) {
        e.lastDashId = p.dashId;
        // CIPHER-LOCK: while a boss cipher is unsolved, a dashed core is a KEY
        // PRESS (read the code, dash in order) — not a kill. One key per dash so
        // you can't sweep the ring; this forces deliberate per-core routing.
        if (e.kind === 'sovereign_core' && w.cipher && !w.cipher.solved) {
          // record the nearest-to-origin core; key exactly one after the sweep so a
          // wide hitbox (OVERREACH) keys the core you aimed at, not a hash-order one
          const d = (e.x - ax) * (e.x - ax) + (e.y - ay) * (e.y - ay);
          if (d < cipherBestD) {
            cipherBestD = d;
            cipherBest = e;
          }
          continue;
        }
        // sync-window dash-through is a weak-point hit (lands a satisfying chunk)
        const dmg = e.kind === 'hollow' ? w.stats.dashDamage + HOLLOW.weakPointBonus : w.stats.dashDamage;
        this.damageEnemy(e, dmg, true);
      }
    }
    // CIPHER-LOCK: key ONE core per dash — the first the spear reaches (nearest the
    // dash origin), so a wide hitbox can't mis-key and unfairly re-lock the cipher.
    if (cipherBest && w.cipherKeyDashId !== p.dashId) {
      w.cipherKeyDashId = p.dashId;
      this.keyCipherCore(cipherBest);
    }
    // Riposte: shatter enemy bullets along the spear (boss shots stay lethal)
    if (w.stats.dashShatterRadius > 0) {
      const br = r + w.stats.dashShatterRadius;
      w.bullets.forEachActive((b) => {
        if (b.fromBoss) return;
        if (segCircleHit(ax, ay, bx, by, b.x, b.y, b.radius, br)) {
          w.particles.burst(b.x, b.y, 2, b.color);
          w.score += 2;
          w.bullets.release(b);
        }
      });
    }
    // trigger slow-mo once per dash on big chains
    if (!this.dashSlowmoTriggered && shouldSlowmo(p.killsThisDash)) {
      this.dashSlowmoTriggered = true;
      this.scheduler.requestSlowmo(w.stats.timeThiefExtra);
      this.audio.slowmoSnap();
      this.shake.add(p.killsThisDash >= 6 ? TUNE.juice.traumaChain6 : TUNE.juice.traumaChain3);
      this.cam.zoom = Math.max(this.cam.zoom, 1.05);
      if (w.stats.timeThiefStamina > 0) {
        const max = w.stats.staminaSegments * TUNE.stamina.perSegment;
        w.player.stamina = Math.min(max, w.player.stamina + w.stats.timeThiefStamina);
      }
    }
  }

  private resolveGhostHits(): void {
    const w = this.world;
    const r = 14;
    const minX = Math.min(w.ghostX0, w.ghostX1) - r - 20;
    const minY = Math.min(w.ghostY0, w.ghostY1) - r - 20;
    const maxX = Math.max(w.ghostX0, w.ghostX1) + r + 20;
    const maxY = Math.max(w.ghostY0, w.ghostY1) + r + 20;
    w.hash.queryAABB(minX, minY, maxX, maxY, this.candidates);
    for (const e of this.candidates) {
      if (!e.active || e.lastDashId === w.ghostDashId) continue;
      if (this.spearBlocked(e)) continue; // the ghost obeys the same armor/intangibility rules
      if (e.kind === 'sovereign_core' && w.cipher && !w.cipher.solved) continue; // only a real dash keys the cipher
      if (segCircleHit(w.ghostX0, w.ghostY0, w.ghostX1, w.ghostY1, e.x, e.y, e.radius, r)) {
        e.lastDashId = w.ghostDashId;
        this.damageEnemy(e, w.stats.dashDamage, true);
      }
    }
  }

  /** Can the spear (a dash OR its afterimage ghost) damage this enemy right now?
   *  The Sovereign body is armored until EXPOSED; the Hollow is intangible outside
   *  its sync window. Enforced on EVERY spear path here so the two can never drift. */
  /** A generic RING-cipher boss is armored until its cipher is broken (and re-armed
   *  between expose windows). Shared by the spear paths AND the DAYBREAK nova. */
  private bossCipherArmored(e: Enemy): boolean {
    return bossUsesRingCipher(e.kind) && this.world.cipher != null && !this.world.cipher.solved && (e.cipherExposed ?? 0) <= 0;
  }

  private spearBlocked(e: Enemy): boolean {
    if (e.kind === 'hollow' && !hollowSyncActive(e)) return true;
    if (sovereignBodyArmored(e)) return true;
    if (this.bossCipherArmored(e)) return true;
    return false;
  }

  /** Apply damage; on death run the kill cascade (combo, score, particles, chain). */
  private damageEnemy(e: Enemy, dmg: number, fromDash: boolean): void {
    // Cipher cores are a dash-SKILL target: killable ONLY through the keypad
    // (resolveDashHits → keyCipherCore → solveCipher → shatterCore). Block ALL
    // direct damage while a cipher is unsolved — this closes the fromDash AoE hole
    // (Nova Dash / Chain Reaction / FRENZY) that would otherwise shatter cores out
    // of order and soft-lock a ring boss. Non-dash AoE is blocked always.
    if (e.kind === 'sovereign_core' && (!fromDash || (this.world.cipher != null && !this.world.cipher.solved))) return;
    e.hp -= dmg;
    e.hitFlash = 0.1;
    if (e.hp > 0) {
      if (fromDash) {
        this.shake.add(0.04);
        // impact spark — feedback that the spear bit a tanky/elite enemy
        this.world.particles.burst(e.x, e.y, e.elite ? 8 : 5, e.elite ? ELITE.aura : '#ffffff');
      }
      return;
    }
    this.killEnemy(e, fromDash);
  }

  private killEnemy(e: Enemy, fromDash: boolean): void {
    const w = this.world;
    if (e.isBoss) {
      this.bossDeath(e);
      return;
    }
    if (e.kind === 'sovereign_core') {
      this.shatterCore(e, fromDash);
      return;
    }
    const x = e.x;
    const y = e.y;
    const color = e.color;
    w.killCount++;
    this.tryHint('kill');
    if (fromDash) {
      w.player.killsThisDash++;
      if (w.player.killsThisDash > w.maxDashChain) w.maxDashChain = w.player.killsThisDash;
    }

    const rk = registerKill(w.combo);
    w.combo = rk.combo;
    w.comboTimer = rk.timer + w.stats.comboWindowBonus; // Slipstream extends the window
    if (w.combo > w.bestComboRun) w.bestComboRun = w.combo;
    chargeFromKill(w.overdrive, w.combo); // build the OVERDRIVE meter

    // Siphon: dash-kills refund stamina
    if (fromDash && w.stats.killStaminaRefund > 0) {
      const max = w.stats.staminaSegments * TUNE.stamina.perSegment;
      w.player.stamina = Math.min(max, w.player.stamina + w.stats.killStaminaRefund);
    }

    const gained = Math.round(scoreForKill(e.baseScore, w.combo, Math.max(0, w.player.killsThisDash - 1)) * w.stats.scoreMul);
    w.score += gained;

    w.particles.burst(x, y, TUNE.particles.deathBurstMin + w.player.killsThisDash * 3, color);
    w.particles.floatText(x, y - 16, `+${gained}`, comboColor(w.combo), 0.55 + Math.min(w.player.killsThisDash, 8) * 0.06);
    this.checkComboTier();
    this.audio.thunk(w.combo, this.panFor(x));
    this.shake.add(TUNE.juice.traumaKill);
    this.scheduler.requestHitstop(hitstopFor(w.player.killsThisDash));
    this.input.rumble(0.0, 0.35, 50);

    // shard gem for the vacuum/meta juice
    w.spawnGem(x, y, 1);

    // champion payoff — a fountain of shards, a score pop, and a volatile burst
    if (e.elite) {
      for (let i = 0; i < ELITE.shardDrops; i++) w.spawnGem(x, y, 5);
      if (w.dropRng.next() < POWERUP_DROP.eliteChance) w.spawnPowerup(x, y, rollPowerup(w.dropRng));
      const bonus = Math.round(800 * comboMultiplier(w.combo) * w.stats.scoreMul);
      w.score += bonus;
      w.particles.floatText(x, y - 30, `CHAMPION +${bonus}`, ELITE.aura, 1.3);
      w.particles.burst(x, y, 50, ELITE.aura);
      w.particles.ring(x, y, e.radius + 50, ELITE.aura, 0.45);
      this.renderer.flash(ELITE.aura, 0.18);
      this.shake.add(0.4);
      this.audio.explosion(1.0, this.panFor(x));
      const n = ELITE.detonateCount;
      const sp = ELITE.detonateSpeed * e.bulletMul;
      const off = w.dropRng.range(0, Math.PI * 2); // death-timed: keep off the seeded director stream
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        w.spawnBullet(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 6, ELITE.aura, false);
      }
    }

    // death effects
    if (e.kind === 'splitter') {
      splitInto(e, w);
    } else if (e.kind === 'bomber') {
      const n = BOMBER.detonateCount;
      const sp = BOMBER.bulletSpeed * e.bulletMul;
      const off = w.dropRng.range(0, Math.PI * 2); // death-timed: keep off the seeded director stream
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        w.spawnBullet(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 6, '#fb7185', false);
      }
      this.audio.explosion(0.8, this.panFor(x));
      w.particles.ring(x, y, 90, '#fb7185', 0.35);
      this.shake.add(0.16);
    }

    w.enemies.release(e);

    // chain reaction (preserve the originating context so graze-triggered
    // chains don't count as dash-kills)
    if (w.stats.chainRadius > 0) {
      this.chainExplode(x, y, w.stats.chainRadius, w.stats.chainDmg, fromDash);
    }
  }

  /** Map a world x-coordinate to a stereo pan (-1..1) — positional audio so a kill
   *  on the right side of the field is heard on the right. Cosmetic; reads world
   *  geometry only (never rng). */
  private panFor(x: number): number {
    const half = this.world.width / 2;
    return Math.max(-1, Math.min(1, (x - half) / half)) * AUDIO_SFX.panMax;
  }

  /** Shatter a Sovereign Core: combo + score reward, a weak-point chunk to the
   *  crown, and — if it was the last core — crack the body EXPOSED. */
  private shatterCore(e: Enemy, fromDash: boolean): void {
    const w = this.world;
    const x = e.x;
    const y = e.y;
    w.killCount++;
    if (fromDash) {
      w.player.killsThisDash++;
      if (w.player.killsThisDash > w.maxDashChain) w.maxDashChain = w.player.killsThisDash;
    }
    const rk = registerKill(w.combo);
    w.combo = rk.combo;
    w.comboTimer = rk.timer + w.stats.comboWindowBonus;
    if (w.combo > w.bestComboRun) w.bestComboRun = w.combo;
    chargeFromKill(w.overdrive, w.combo);
    const gained = Math.round(180 * comboMultiplier(w.combo) * w.stats.scoreMul);
    w.score += gained;
    w.particles.burst(x, y, 26, SOVEREIGN.coreColor);
    w.particles.ring(x, y, 70, '#ffffff', 0.4);
    w.particles.floatText(x, y - 16, `CORE +${gained}`, '#fde047', 0.95);
    this.audio.thunk(w.combo, this.panFor(x));
    this.shake.add(0.3);
    this.scheduler.requestHitstop(0.07);
    this.input.rumble(0.1, 0.3, 50);
    for (let i = 0; i < 3; i++) w.spawnGem(x, y, 1);
    w.enemies.release(e);
    this.checkComboTier();
    const boss = w.boss;
    if (!boss || boss.kind !== 'sovereign') return;
    // weak-point chunk to the crown (may kill it → bossDeath cleans up the rest)
    this.damageEnemy(boss, SOVEREIGN.coreWeakBonus, true);
    // last core down? crack the crown open. (Intentional: if the SAME dash that
    // shattered the final core also clips the now-unarmored body later in the hit
    // pass, that one bonus hit lands — a satisfying, hard-to-pull-off flourish,
    // bounded to a single hit by lastDashId.)
    if (w.bossAlive && w.boss && countSovereignCores(w) === 0) {
      exposeSovereign(w.boss);
      this.ui.announce('CROWN EXPOSED', '#fde047');
      this.renderer.flash('#fde047', 0.22);
      this.audio.bossStinger();
      w.particles.ring(w.boss.x, w.boss.y, w.boss.radius + 30, '#fde047', 0.5);
      this.shake.add(0.5);
    }
  }

  /** A dash registered on a cipher core: read it as a key press in the decoded
   *  order. A correct key advances (rising pitch); a wrong key re-locks the
   *  cipher (the cipher reducer resets progress). Solving cracks the crown. */
  private keyCipherCore(core: Enemy): void {
    const w = this.world;
    const c = w.cipher;
    if (!c) return;
    const res = dashCipherCore(c, core.phase);
    if (res === 'wrong') {
      // forgiving: progress is kept — just a soft "not that one" tick, no punish
      w.particles.burst(core.x, core.y, 4, '#9fb0c8');
      this.audio.thunk(6, this.panFor(core.x));
      return;
    }
    // a correct key — the feedback BUILDS as the cipher resolves (rising pitch + pop)
    w.particles.burst(core.x, core.y, 14, SOVEREIGN.coreColor);
    w.particles.ring(core.x, core.y, core.radius + 16, '#fde047', 0.4);
    this.audio.thunk(Math.min(46 + c.progress * 10, 96), this.panFor(core.x));
    this.shake.add(CIPHER.keyShake);
    this.input.rumble(0.12, 0.3, 45);
    if (res === 'solved') {
      this.solveCipher();
    } else {
      w.particles.floatText(core.x, core.y - core.radius - 12, `KEY ${c.progress}/${c.order.length}`, '#fde047', 0.85);
    }
  }

  /** The cipher is broken: shatter every core (each its own reward) — the final
   *  shatter trips the existing CROWN EXPOSED crack via countSovereignCores===0. */
  private solveCipher(): void {
    const w = this.world;
    const boss = w.boss;
    this.scheduler.requestHitstop(0.1); // a satisfying freeze on the crack
    this.renderer.flash('#fde047', 0.24);
    const cores: Enemy[] = [];
    w.enemies.forEachActive((e) => {
      if (e.kind === 'sovereign_core') cores.push(e);
    });
    if (boss && boss.kind === 'sovereign') {
      // the master cipher: shatter cores → the final one trips CROWN EXPOSED (existing path)
      w.particles.floatText(boss.x, boss.y - 60, 'CIPHER BROKEN', '#fde047', 1.4);
      for (const core of cores) if (core.active) this.shatterCore(core, true);
      return;
    }
    // a generic RING-cipher boss: open a punish window, then updateBoss re-locks it
    if (boss) {
      w.particles.floatText(boss.x, boss.y - boss.radius - 16, 'CIPHER BROKEN', '#fde047', 1.4);
      boss.cipherExposed = CIPHER.exposeDuration;
      this.ui.announce('EXPOSED', '#fde047');
      this.audio.bossStinger();
      this.shake.add(0.5);
    }
    for (const core of cores) if (core.active) this.shatterCore(core, true); // generic reward (non-sovereign → early return)
    w.cipher = null; // re-armed when the expose window closes
  }

  /** Fire an arcade announcement when the combo crosses a new milestone tier. */
  private checkComboTier(): void {
    const w = this.world;
    for (let i = COMBO_TIERS.length - 1; i >= 0; i--) {
      const t = COMBO_TIERS[i];
      if (w.combo >= t.at && t.at > w.lastTierAnnounced) {
        w.lastTierAnnounced = t.at;
        this.ui.announce(`${t.name}  ×${w.combo}`, t.color);
        this.narrateOne('toast', NARRATOR.comboTier[t.at]);
        this.shake.add(0.18);
        this.renderer.flash(t.color, 0.12);
        this.audio.pickup(14);
        break;
      }
    }
    // COMBO ERUPTION — a big-combo milestone detonates a bullet-clearing nova
    const m = eruptMilestone(w.combo, w.clutch.lastErupt);
    if (m > 0) {
      w.clutch.lastErupt = m;
      this.comboErupt(m);
    }
  }

  /** COMBO ERUPTION: shatter enemy bullets in a big radius (breathing room),
   *  scorch nearby chaff, drop a score bonus, and sell it with juice. */
  private comboErupt(milestone: number): void {
    const w = this.world;
    const p = w.player;
    // shatter NON-boss bullets in the clear radius (boss patterns stay lethal, like
    // Riposte + the OVERDRIVE nova — high combo earns breathing room from chaff, not
    // a boss-pattern eraser)
    const cr2 = CLUTCH.eruptClearRadius * CLUTCH.eruptClearRadius;
    w.bullets.forEachActive((b) => {
      if (b.fromBoss) return;
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      if (dx * dx + dy * dy < cr2) {
        w.particles.burst(b.x, b.y, 1, b.color);
        w.bullets.release(b);
      }
    });
    // scorch nearby non-boss enemies (Cores excluded — they're a dash-only target)
    const dr = CLUTCH.eruptDamageRadius;
    w.hash.rebuild(w.enemies.items);
    w.hash.queryAABB(p.x - dr, p.y - dr, p.x + dr, p.y + dr, this.chainBuf);
    const hits = this.chainBuf.filter((e) => e.active && !e.isBoss && e.kind !== 'sovereign_core' && circleHit(p.x, p.y, dr, e.x, e.y, e.radius));
    for (const e of hits) {
      if (e.active) this.damageEnemy(e, CLUTCH.eruptDamage, false);
    }
    // score bonus
    const bonus = Math.round(CLUTCH.eruptScore * comboMultiplier(w.combo) * w.stats.scoreMul);
    w.score += bonus;
    // juice — reuse the screen-space nova ring (cyan) + ring/burst + slow-mo blip
    w.particles.ring(p.x, p.y, CLUTCH.eruptClearRadius, '#22d3ee', 0.55);
    w.particles.burst(p.x, p.y, 60, '#a5f3fc');
    w.particles.floatText(p.x, p.y - 40, `ERUPTION +${bonus}`, '#67e8f9', 1.2);
    this.renderer.flash('#22d3ee', 0.22);
    this.renderer.startOverdriveNova('#22d3ee');
    this.scheduler.requestSlowmo(CLUTCH.eruptSlowmoHold);
    this.shake.add(0.5);
    this.audio.comboErupt();
    this.ui.announce(`ERUPTION ×${milestone}`, '#22d3ee');
    this.input.rumble(0.3, 0.4, 120);
  }

  private updatePowerups(dt: number): void {
    const w = this.world;
    const p = w.player;
    w.pickups.forEachActive((u) => {
      u.life -= dt;
      u.spin += dt * 2.2;
      const dx = p.x - u.x;
      const dy = p.y - u.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < POWERUP_DROP.magnetRadius) {
        u.vx += (dx / d) * POWERUP_DROP.magnetAccel * dt;
        u.vy += (dy / d) * POWERUP_DROP.magnetAccel * dt;
      }
      u.x += u.vx * dt;
      u.y += u.vy * dt;
      u.vx *= 0.9;
      u.vy *= 0.9;
      if (d < p.radius + POWERUP_DROP.pickupRadius) {
        this.collectPowerup(u.kind);
        w.pickups.release(u);
        return;
      }
      if (u.life <= 0) w.pickups.release(u);
    });
  }

  /** Grant a power-up: activate the timed buff, recompute stats, and sell it. */
  private collectPowerup(kind: import('./types').PowerupKind): void {
    const w = this.world;
    const p = w.player;
    const def = POWERUPS[kind];
    activatePowerup(w.powerup, kind);
    w.powerupsCollected++;
    w.recomputeStats();
    this.ui.announce(`${def.name} — ${def.blurb}`, def.color);
    w.particles.ring(p.x, p.y, 120, def.color, 0.5);
    w.particles.burst(p.x, p.y, 40, def.color);
    this.renderer.flash(def.color, 0.2);
    this.scheduler.requestHitstop(0.06);
    this.shake.add(0.35);
    this.audio.powerup();
    this.input.rumble(0.3, 0.5, 120);
  }

  private chainExplode(x: number, y: number, radius: number, dmg: number, fromDash: boolean): void {
    const w = this.world;
    w.particles.ring(x, y, radius, '#ec4899', 0.35);
    this.audio.explosion(0.7, this.panFor(x));
    w.hash.queryAABB(x - radius, y - radius, x + radius, y + radius, this.chainBuf);
    // snapshot to avoid mutating while iterating (the dash-hit loop owns `candidates`)
    const hits = this.chainBuf.filter((e) => e.active && !e.isBoss && circleHit(x, y, radius, e.x, e.y, e.radius));
    for (const e of hits) {
      if (e.active) this.damageEnemy(e, dmg, fromDash);
    }
  }

  private bossDeath(e: Enemy): void {
    const w = this.world;
    const bonus = 500 * Math.max(1, e.bossWave);
    w.score += Math.round(bonus * comboMultiplier(w.combo));
    w.particles.burst(e.x, e.y, 90, '#ffffff');
    w.particles.ring(e.x, e.y, 220, e.color, 0.5);
    w.particles.floatText(e.x, e.y - 40, `${bossName(e.kind).replace('THE ', '')} DOWN`, '#fbbf24', 1.4);
    this.narrateOne('announce', NARRATOR.bossKill[e.kind]);
    this.renderer.flash('#ffffff', 0.45);
    this.audio.bossMusic(false);
    this.audio.bossStinger();
    this.audio.explosion(1.4, this.panFor(e.x));
    this.shake.add(0.9);
    this.scheduler.requestHitstop(0.18);
    for (let i = 0; i < 8; i++) w.spawnGem(e.x, e.y, 5);
    w.spawnPowerup(e.x, e.y, rollPowerup(w.dropRng)); // bosses always drop a power-up (separate rng)
    w.bossKills++;
    if (e.kind === 'hollow') cleanupHollowEchoes(w); // clear lingering echo clones
    if (e.kind === 'sovereign') {
      cleanupSovereignCores(w); // clear orbiting cores
      w.sovereignDown = true;
    }
    if (bossUsesRingCipher(e.kind)) cleanupSovereignCores(w); // clear any generic ring cores + the cipher
    w.enemies.release(e);
    w.bossAlive = false;
    w.boss = null;
    this.pendingDraft = true; // guaranteed perk after a boss
  }

  private updateBullets(dt: number): void {
    const w = this.world;
    const p = w.player;
    const grazeR = w.stats.grazeRadius;
    const hitR = p.radius;
    // THE SOVEREIGN warps space: its bullets curve toward the crown (galaxy arms).
    // Math inlined (kept identical to the pure gravityPull, which the tests cover)
    // so the hottest loop in the game stays allocation-free.
    const sov = w.boss && w.boss.kind === 'sovereign' ? w.boss : null;
    w.bullets.forEachActive((b) => {
      if (sov && b.fromBoss) {
        const gx = sov.x - b.x;
        const gy = sov.y - b.y;
        const gd = Math.hypot(gx, gy) || 1;
        const ga = (SOVEREIGN.gravity * dt) / (gd + SOVEREIGN.gravitySoftening);
        b.vx += (gx / gd) * ga;
        b.vy += (gy / gd) * ga;
      }
      // SEEKER homing: while its budget lasts, curve the bolt toward the player at a
      // bounded turn rate (math inlined from the pure homingSteer the tests cover, so
      // the hottest loop stays allocation-free). Reads positions only → determinism-safe.
      if (b.homing > 0 && p.alive) {
        b.homing -= dt;
        const speed = Math.hypot(b.vx, b.vy) || 1;
        const cur = Math.atan2(b.vy, b.vx);
        const des = Math.atan2(p.y - b.y, p.x - b.x);
        const dA = Math.atan2(Math.sin(des - cur), Math.cos(des - cur));
        const maxTurn = SEEKER_TUNE.turnRate * dt;
        const turn = dA < -maxTurn ? -maxTurn : dA > maxTurn ? maxTurn : dA;
        const a = cur + turn;
        b.vx = Math.cos(a) * speed;
        b.vy = Math.sin(a) * speed;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.grazeCd > 0) b.grazeCd -= dt;
      const off = b.x < -30 || b.x > w.width + 30 || b.y < -30 || b.y > w.height + 30;
      if (b.life <= 0 || off) {
        w.bullets.release(b);
        return;
      }
      if (!p.alive || this.dying) return;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const d2 = dx * dx + dy * dy;
      // hit
      if (p.iframe <= 0 && d2 <= (hitR + b.radius) * (hitR + b.radius)) {
        this.playerDie(b.fromBoss ? 'a boss bullet' : 'a bullet');
        return;
      }
      // graze (approaching only)
      if (b.grazeCd <= 0) {
        const rr = grazeR + b.radius;
        if (d2 <= rr * rr && d2 > (hitR + b.radius) * (hitR + b.radius)) {
          if (dx * b.vx + dy * b.vy > 0) this.graze(b);
        }
      }
    });
  }

  private graze(b: { x: number; y: number; grazeCd: number }): void {
    const w = this.world;
    const p = w.player;
    b.grazeCd = TUNE.graze.cooldown;
    w.grazeCount++;
    chargeFromGraze(w.overdrive); // grazing trickles the OVERDRIVE meter
    const max = w.stats.staminaSegments * TUNE.stamina.perSegment;
    p.stamina = Math.min(max, p.stamina + w.stats.grazeStaminaRefund);
    w.score += Math.round(grazeScore(w.combo) * w.stats.scoreMul);
    if (w.stats.grazeComboBonus > 0 && w.combo > 0) w.comboTimer += w.stats.grazeComboBonus;
    w.particles.graze(b.x, b.y);
    this.audio.graze();
    this.shake.add(TUNE.juice.traumaGraze);
    this.input.rumble(0, 0.12, 35);
    // graze burn
    if (w.stats.grazeBurnDmg > 0) {
      const rad = w.stats.grazeBurnRadius;
      let best: Enemy | null = null;
      let bestD = rad * rad;
      w.enemies.forEachActive((e) => {
        if (e.isBoss) return;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) {
          bestD = d2;
          best = e;
        }
      });
      if (best) this.damageEnemy(best, w.stats.grazeBurnDmg, false);
    }
  }

  private updateGems(dt: number): void {
    const w = this.world;
    const p = w.player;
    w.gems.forEachActive((g) => {
      g.life -= dt;
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < TUNE.gems.magnetRadius) {
        g.vx += (dx / d) * TUNE.gems.magnetAccel * dt;
        g.vy += (dy / d) * TUNE.gems.magnetAccel * dt;
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.vx *= 0.92;
      g.vy *= 0.92;
      if (d < p.radius + 14) {
        w.shards += g.value;
        w.collectStreak++;
        w.collectStreakTimer = 1.2;
        this.audio.pickup(w.collectStreak);
        w.gems.release(g);
        return;
      }
      if (g.life <= 0) w.gems.release(g);
    });
  }

  private checkBodyCollisions(): void {
    const w = this.world;
    const p = w.player;
    w.hash.rebuild(w.enemies.items);
    w.hash.queryAABB(p.x - 60, p.y - 60, p.x + 60, p.y + 60, this.candidates);
    for (const e of this.candidates) {
      if (!e.active || e.isBoss) continue; // boss body handled by the phase-aware check below
      if (circleHit(p.x, p.y, p.radius, e.x, e.y, e.radius * 0.72)) {
        this.playerDie('a collision');
        return;
      }
    }
    // boss body — per-boss exceptions live in isBossLethal (Mirrorblade only
    // mid-lunge; the Hollow is an intangible phantom and never contact-lethal)
    const bossLethal = w.boss && isBossLethal(w.boss);
    if (w.bossAlive && w.boss && bossLethal && circleHit(p.x, p.y, p.radius, w.boss.x, w.boss.y, w.boss.radius * 0.85)) {
      this.playerDie('the boss');
      return;
    }
    // Beacon sweep beam: die if within the active beam (a diameter line through
    // the boss). Dash i-frames already exclude us from this check, so you can
    // dash THROUGH the beam.
    if (w.boss && beaconBeamActive(w.boss)) {
      const dx = p.x - w.boss.x;
      const dy = p.y - w.boss.y;
      const perp = Math.abs(dx * -Math.sin(w.boss.angle) + dy * Math.cos(w.boss.angle));
      if (perp < BEACON.beamWidth / 2 + p.radius) this.playerDie('the beam');
    }
    // Sovereign CROWN BEAMS: a rotating star of diameter beams. Dash i-frames
    // already exclude us, so you can dash through the safe wedges.
    if (w.boss && sovereignBeamActive(w.boss)) {
      if (beamHitsPoint(w.boss.x, w.boss.y, w.boss.angle, SOVEREIGN.beamArms, SOVEREIGN.beamWidth / 2 + p.radius, p.x, p.y)) {
        this.playerDie('the crown beam');
      }
    }
  }

  private playerDie(cause = 'a bullet'): void {
    const w = this.world;
    const p = w.player;
    if (!p.alive) return;
    // LAST BREATH — an automatic bullet-time clutch save. It does NOT save you
    // outright: it opens a deep slow-mo window + brief grace and shoves nearby
    // bullets aside so you can dash to safety. Fail to escape and you still fall.
    if (canLastBreath(w.clutch)) {
      triggerLastBreath(w.clutch);
      p.iframe = CLUTCH.lastBreathIframe;
      p.hitFlash = 0.3;
      this.scheduler.requestDeepSlowmo(CLUTCH.lastBreathSlowmo, CLUTCH.lastBreathDuration);
      // shove nearby bullets outward to open an escape lane
      const r2 = CLUTCH.lastBreathPushRadius * CLUTCH.lastBreathPushRadius;
      w.bullets.forEachActive((b) => {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < r2) {
          const d = Math.sqrt(d2) || 1;
          b.vx += (dx / d) * CLUTCH.lastBreathPush;
          b.vy += (dy / d) * CLUTCH.lastBreathPush;
        }
      });
      this.renderer.flash('#a78bfa', 0.5);
      this.renderer.startLastBreath();
      this.shake.add(0.5);
      this.audio.lastBreath();
      this.ui.announce('LAST BREATH', '#c4b5fd');
      this.narrate('last_breath', 'toast', NARRATOR.lastBreath);
      w.particles.ring(p.x, p.y, CLUTCH.lastBreathPushRadius, '#a78bfa', 0.6);
      w.particles.burst(p.x, p.y, 30, '#c4b5fd');
      this.input.rumble(0.4, 0.4, 200);
      this.deathCause = cause; // remembered in case the escape fails
      return;
    }
    this.deathCause = cause;
    // Second Chance meta: revive once, clear the screen, brief invuln
    if (w.reviveLeft > 0) {
      w.reviveLeft--;
      p.iframe = 2.2;
      p.hitFlash = 0.3;
      w.bullets.clear();
      this.scheduler.requestHitstop(0.12);
      this.shake.add(0.6);
      this.renderer.flash('#34d399', 0.5);
      w.particles.ring(p.x, p.y, 220, '#34d399', 0.6);
      w.particles.burst(p.x, p.y, 50, '#34d399');
      this.ui.announce('REVIVED', '#34d399');
      this.audio.bossStinger();
      return;
    }
    p.alive = false;
    p.hitFlash = 0.3;
    this.dying = true;
    this.dyingTimer = 0.85;
    this.audio.endCharge(); // kill the charge tone if we died mid-charge
    this.audio.bossMusic(false);
    this.audio.death();
    this.renderer.flash('#ef4444', 0.5);
    this.audio.setMixState('death'); // the light dims — music goes muffled + distant
    this.shake.add(TUNE.juice.traumaDeath);
    this.scheduler.requestHitstop(TUNE.juice.hitstopDeath);
    this.scheduler.requestSlowmo(0.25);
    w.particles.burst(p.x, p.y, 60, '#22d3ee');
    w.particles.burst(p.x, p.y, 40, '#ffffff');
    w.particles.ring(p.x, p.y, 160, '#5beaff', 0.6);
    this.input.rumble(1, 1, 220);
  }

  private finishGameOver(won: boolean): void {
    const w = this.world;
    this.dying = false;
    this.winning = false;
    this.audio.stopDrone();
    this.replay.stop();
    const wave = this.director.wave;
    const prevHigh = this.save.highScore;
    // shards this run (shown in the debrief; only BANKED to save on a real run below)
    const banked = Math.round(w.shards * w.stats.shardMul * this.mode.shardMul);
    // A DUEL is a private 1v1 on a fixed seed — bragging rights only. It must NOT
    // touch ANY persistent progression (high score, bests, shards, NG+, fragments,
    // achievements, daily best, the online board) or a known-good seed could be
    // farmed for records/currency. Only the duel toast + this run's ghost (so you
    // can re-challenge) survive a challenge run.
    const newBest = !this.inChallenge && w.score > this.save.highScore;

    // GHOST — finalize the run's ghost (ALWAYS, for "challenge a friend"); persist
    // it as the daily PB only on a genuine (non-duel) daily run.
    if (this.ghostRec) {
      this.ghostRec.score = w.score;
      this.ghostRec.wave = wave;
      this.ghostRec.name = this.save.handle || 'YOU';
      this.lastRunGhost = this.ghostRec; // for "challenge a friend"
      if (this.mode.seedKind === 'date' && !this.inChallenge) {
        const key = this.dailyGhostKey(this.seed);
        const pb = this.loadGhost(key);
        if (!pb || w.score > pb.score) this.saveGhost(key, this.ghostRec);
      }
    }
    if (this.inChallenge) {
      this.ui.toast(
        w.score > this.challengeTarget
          ? `⚔ DUEL WON — you beat ${this.challengeName || 'them'} (${this.challengeTarget.toLocaleString()})!`
          : `⚔ Fell short of ${this.challengeName || 'them'} · ${this.challengeTarget.toLocaleString()}`,
      );
    }

    let newAch: ReturnType<typeof evalAchievements> = [];
    if (!this.inChallenge) {
      this.save.highScore = Math.max(this.save.highScore, w.score);
      this.save.bestCombo = Math.max(this.save.bestCombo, w.bestComboRun);
      this.save.bestWave = Math.max(this.save.bestWave, wave);
      this.save.deepestWave = Math.max(this.save.deepestWave, wave);
      if (!won && this.deathCause) this.save.nemesis[this.deathCause] = (this.save.nemesis[this.deathCause] ?? 0) + 1;
      this.save.maxHeat = Math.max(this.save.maxHeat, this.runHeat);
      if (won && w.sovereignDown) {
        // NG+ — felling the Sovereign deepens the loop. Pure save state; the EFFECT
        // is gated to non-seeded runs at start(), so this never affects a Daily.
        this.save.ngPlusLevel = Math.min(NG_PLUS.maxLoop, this.save.ngPlusLevel + 1);
        this.save.ngPlusActive = true; // queued for the next run; toggle off on the title
      }
      this.save.totalRuns++;
      // MEMORY FRAGMENTS — carry one out of every descent + earn milestone fragments
      for (const f of fragmentsForRun({
        runOrdinal: this.save.totalRuns,
        bossKills: w.bossKills,
        deepestWave: this.save.deepestWave,
        bestComboRun: w.bestComboRun,
        sovereignDown: w.sovereignDown,
      })) {
        if (!this.save.stillpointFragments.includes(f)) this.save.stillpointFragments.push(f);
      }
      // bank shards: in-run gems × meta Treasure Hunter × mode bonus
      this.save.shards += banked; // bank shards toward unlocks + meta upgrades
      this.save.lifeKills += w.killCount;
      this.save.lifeBoss += w.bossKills;
      this.save.lifeShards += banked;
      // achievements (evaluate against updated lifetime totals)
      newAch = evalAchievements(this.save.achievements, {
        score: w.score,
        combo: w.bestComboRun,
        wave,
        kills: w.killCount,
        grazes: w.grazeCount,
        maxDashChain: w.maxDashChain,
        bossKills: w.bossKills,
        daily: this.mode.id === 'daily',
        won,
        modeId: this.mode.id,
        heat: this.runHeat,
        sovereignDown: w.sovereignDown,
        overdriveUses: w.overdriveUses,
        lastBreathUses: w.clutch.lastBreathUses,
        powerupsCollected: w.powerupsCollected,
        lifeRuns: this.save.totalRuns,
        lifeKills: this.save.lifeKills,
        lifeBoss: this.save.lifeBoss,
        lifeShards: this.save.lifeShards,
      });
      for (const a of newAch) this.save.achievements.push(a.id);
      if (this.mode.id === 'daily') {
        const seed = seedFromDate();
        if (this.save.dailySeed !== seed) {
          this.save.dailySeed = seed;
          this.save.dailyBest = 0;
        }
        this.save.dailyBest = Math.max(this.save.dailyBest, w.score);
        this.save.dailyMutators = this.activeMutators.slice();
      }
      saveSave(this.save);
    }
    // fire-and-forget online leaderboard submission (no-op if not configured).
    // A duel is a private 1v1 on a fixed seed — never submit it to the public boards.
    if (!this.inChallenge)
      void submitScore({
        mode: this.mode.id,
        name: this.save.handle,
        score: w.score,
        wave,
        combo: w.bestComboRun,
        heat: this.runHeat,
        daily: this.mode.id === 'daily' ? dateString() : undefined,
      });
    const info: GameOverInfo = {
      score: w.score,
      combo: w.bestComboRun,
      wave,
      time: w.time,
      newBest,
      daily: this.mode.id === 'daily',
      won,
      mode: this.mode.name,
      highScore: this.save.highScore,
      shardsEarned: banked,
      dailyBest: this.save.dailyBest,
      ship: shipById(this.save.selectedShip).name,
      perks: this.buildLine(),
      deathCause: won ? '' : this.deathCause,
      pbDelta: w.score - prevHigh,
      newAchievements: newAch.map((a) => a.name),
      mutators: this.activeMutators.map((id) => ({ name: MUTATORS[id].name, accent: MUTATORS[id].accent })),
      choicePending: !this.inChallenge && won && w.sovereignDown && this.save.stillpointChoice === 'none',
      canReplay: this.replay.hasClip(),
    };
    this.state = 'gameover';
    this.ui.showGameOver(info);
  }

  /** THE CHOICE — the player decides the kingdom's fate after felling the
   *  Sovereign. Cosmetic/personal: saved to localStorage, never touches rng. */
  private makeChoice(c: 'catch' | 'fall'): void {
    this.save.stillpointChoice = c;
    saveSave(this.save);
    const end = choiceEnding(c);
    this.ui.resolveChoice(end.head, end.line);
  }

  /** Remember a lore entry — spend Memory Fragments. Cosmetic/personal: a plain
   *  save mutation, never touches rng. */
  private unlockLore(id: string): void {
    const e = loreById(id);
    if (!e || this.save.stillpointLore.includes(id)) return;
    if (fragmentBalance(this.save) < e.cost) return;
    this.save.fragmentsSpent += e.cost;
    this.save.stillpointLore.push(id);
    saveSave(this.save);
    this.ui.refreshMemories();
  }

  /** Toggle NG+ for the next run (only once unlocked by a Sovereign kill). */
  private toggleNgPlus(): void {
    if (this.save.ngPlusLevel < 1) return;
    this.save.ngPlusActive = !this.save.ngPlusActive;
    saveSave(this.save);
    this.ui.refreshTitle(this.save);
  }

  private dailyGhostKey(seed: number): string {
    return `lancefall.ghost.daily.${seed}`;
  }
  private loadGhost(key: string): Ghost | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? deserializeGhost(raw) : null;
    } catch {
      return null;
    }
  }
  private saveGhost(key: string, g: Ghost): void {
    try {
      localStorage.setItem(key, serializeGhost(g));
    } catch {
      /* storage disabled — ignore */
    }
  }

  /** Copy a shareable duel code for the just-finished run (seed + score + ghost path). */
  private createChallenge(): void {
    if (!this.lastRunGhost) return;
    const code = toChallengeCode(this.lastRunGhost);
    try {
      void navigator.clipboard?.writeText(code);
      this.ui.toast('⚔ Duel code copied — send it to a friend to race your run!');
    } catch {
      this.ui.toast(code);
    }
  }

  /** Accept a pasted duel code → start that exact seed, racing the challenger's ghost. */
  private acceptChallenge(code: string): void {
    const g = fromChallengeCode(code);
    if (!g) {
      this.ui.toast('That duel code is not valid.');
      return;
    }
    this.pendingChallenge = g;
    this.start(MODES.find((m) => m.id === g.mode) ?? MODES[0]);
  }

  private applyDirector(spawn: EnemyKind[]): void {
    const w = this.world;
    const I = intensity(w.time) * this.mode.intensityMul;
    const sMul = (enemySpeedMul(I) + this.mode.speedBonus) * this.biomeSpeedMul;
    const bMul = (bulletSpeedMul(I) + this.mode.speedBonus) * this.biomeSpeedMul;
    const baseShield = w.time < this.mode.shieldStart ? 0 : Math.min(this.mode.shieldMax, ((w.time - this.mode.shieldStart) / 90) * this.mode.shieldMax);
    const shield = Math.min(0.7, baseShield + this.biomeShield);
    const cap = maxConcurrent(I);
    // count current champions once so we never exceed the concurrency cap
    let eliteCount = 0;
    w.enemies.forEachActive((e) => { if (e.elite) eliteCount++; });
    const eChance = eliteChance(w.time) * this.eliteMods.chanceMul;
    const eliteMax = ELITE.maxConcurrent + this.eliteMods.maxAdd;
    for (const kind of spawn) {
      const pt = w.edgeSpawn();
      if (kind === 'wisp') {
        // wisps arrive as a scattered pack, clamped to remaining concurrency budget
        const free = Math.max(1, cap - w.enemies.activeCount);
        const n = Math.min(WISP.packSize, free);
        for (let i = 0; i < n; i++) {
          w.spawnEnemy('wisp', pt.x + w.rng.range(-40, 40), pt.y + w.rng.range(-40, 40), sMul, bMul, false);
        }
      } else {
        const isShield = w.rng.next() < shield;
        const makeElite = eliteCount < eliteMax && ELITE_KINDS.has(kind) && w.rng.next() < eChance;
        const e = w.spawnEnemy(kind, pt.x, pt.y, sMul, bMul, isShield, makeElite);
        if (makeElite && e) {
          eliteCount++;
          this.onEliteSpawn(e);
        }
      }
    }
  }

  /** A champion arrives — make it a moment. */
  private onEliteSpawn(e: Enemy): void {
    this.audio.bossWarn();
    this.renderer.flash(ELITE.aura, 0.12);
    this.shake.add(0.18);
    this.world.particles.ring(e.x, e.y, e.radius + 24, ELITE.aura, 0.4);
    this.ui.toast('⚜ CHAMPION inbound — big bounty');
  }

  private spawnWarden(force?: import('./types').EnemyKind): void {
    const w = this.world;
    // bossCount is the true boss-appearance ordinal in every mode (drives HP scaling)
    const boss = spawnBoss(w, this.director.bossCount, force);
    // THE LONGEST DAY: wrap ring-cipher bosses in a code-lock (the Sovereign arms
    // its own in spawnBoss; the Hollow/Mirrorblade are already their own puzzles)
    if (boss && this.mode.cipherLock && bossUsesRingCipher(boss.kind)) spawnCipherRing(w, boss, CIPHER.ringCount);
    this.audio.bossWarn();
    this.audio.bossMusic(true, boss?.kind); // per-boss tension theme
    this.shake.add(TUNE.juice.traumaBossSpawn);
    const col = boss?.kind === 'weaver' ? '#a855f7' : boss?.kind === 'beacon' ? '#38bdf8' : boss?.kind === 'mirrorblade' ? '#ef4444' : boss?.kind === 'hollow' ? '#6ee7b7' : boss?.kind === 'sovereign' ? '#fde047' : '#ff3b6b';
    this.renderer.flash(col, 0.3);
    // a proper arrival cinematic (replaces the old toast)
    this.renderer.startBossEntrance(bossName(boss?.kind ?? 'warden'), col);
    if (boss) this.narrateOne('toast', NARRATOR.bossApproach[boss.kind]);
    // teach the Sovereign's core gimmick on arrival
    if (boss?.kind === 'sovereign') {
      w.particles.floatText(w.width / 2, w.height / 2 + 90, 'SHATTER THE CORES', '#fde047', 1.2);
    }
  }

  private setBiome(index: number, announce: boolean): void {
    this.biomeIndex = index;
    const b = BIOMES[index];
    this.director.biomeBias = b.bias;
    this.renderer.setBiomeTint(b.nebula);
    this.biomeSpeedMul = b.speedMul;
    this.biomeShield = b.shieldBonus;
    if (announce) {
      this.ui.announce(`⟐ ${b.name}`, b.accent);
      this.narrateOne('toast', NARRATOR.strata[index]);
      this.renderer.flash(b.accent, 0.12);
    }
  }

  private winRun(): void {
    if (this.winning) return;
    this.winning = true;
    this.winTimer = 2.4; // a longer victory cinematic before the debrief
    const w = this.world;
    w.player.iframe = 999;
    w.bullets.clear();
    w.enemies.clear(); // clear the board for a clean victory tableau
    this.scheduler.requestSlowmo(0.45);
    this.renderer.flash('#fbbf24', 0.5);
    this.shake.add(0.6);
    this.cam.zoom = Math.max(this.cam.zoom, 1.12); // a punch that eases back out
    this.ui.announce('REMEMBERED', '#fbbf24');
    this.narrate('victory', 'toast', NARRATOR.victory);
    this.audio.bossStinger();
    this.input.rumble(0.6, 0.8, 320);
    // concentric shockwaves from the arena centre
    const cx = w.width / 2;
    const cy = w.height / 2;
    const big = Math.max(w.width, w.height);
    w.particles.ring(cx, cy, big * 0.72, '#fbbf24', 0.95);
    w.particles.ring(cx, cy, big * 0.5, '#ffffff', 0.7);
    w.particles.ring(cx, cy, big * 0.3, '#fde047', 0.55);
    // a fountain of gold + white from the centre
    for (let i = 0; i < 90; i++) {
      w.particles.burst(cx + (Math.random() - 0.5) * 240, cy + (Math.random() - 0.5) * 200, 22, i % 3 === 0 ? '#ffffff' : '#fbbf24');
    }
  }

  private updateCamera(realDt: number): void {
    const w = this.world;
    const p = w.player;
    const targetX = (p.vx || 0) * TUNE.juice.camLean;
    const targetY = (p.vy || 0) * TUNE.juice.camLean;
    const cl = (v: number) => Math.max(-TUNE.juice.camLeanMax, Math.min(TUNE.juice.camLeanMax, v));
    const k = 1 - Math.pow(1 - 0.12, realDt * 60);
    this.cam.leanX += (cl(targetX) - this.cam.leanX) * k;
    this.cam.leanY += (cl(targetY) - this.cam.leanY) * k;
    this.cam.zoom += (1 - this.cam.zoom) * (1 - Math.pow(1 - 0.08, realDt * 60));
    this.cam.shakeX = this.shake.ox;
    this.cam.shakeY = this.shake.oy;
    this.cam.shakeAngle = this.shake.angle;
  }
}
