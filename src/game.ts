// Top-level orchestrator: the fixed-timestep loop, the state machine, and the
// "feedback glue" that turns sim events into juice (audio + particles + shake +
// slow-mo). Owns the World, Renderer, UI, Input, Audio, Scheduler, and Director.

import { FIXED_DT, MAX_SUBSTEPS, MUSIC_BPM, NG_PLUS, TUNE, COHERENCE, WARDEN, BEACON, BOMBER, WISP, MIRRORBLADE, ELITE, HOLLOW, SOVEREIGN, ORB, CLUTCH, POWERUP_DROP, SURVIVAL } from './tune';
import { reflectVelocity, isReflectableOrb } from './reflect';
import { World } from './world';
import { Renderer, comboColor } from './render';
import type { Camera } from './render';
import { UI } from './ui';
import type { GameOverInfo } from './ui';
import { InputManager } from './input';
import { AudioEngine } from './audio';
import { Scheduler } from './scheduler';
import { Shake } from './shake';
import { JuiceBudget } from './juiceBudget';
import { Director } from './waves';
import { intensity, enemySpeedMul, bulletSpeedMul, maxConcurrent, eliteChance, shieldChance, ELITE_KINDS, suddenDeathInset } from './waves';
import { updatePlayer, resetEvents } from './player';
import type { PlayerEvents } from './player';
import { updateEnemy, splitInto, shadeLethal } from './enemies';
import { spawnBoss, updateBoss, bossName, isBossKind, beaconBeamActive, beaconEnraged, hollowSyncActive, isBossLethal, cleanupHollowEchoes, openHollowWindowWithBeat, cleanupSovereignCores, countSovereignCores, spawnCipherRing, bossUsesRingCipher, bossEnraged, bossEnrageFrac, getEnrageColor, mirrorbladeStaggerable, staggerMirrorblade } from './boss';
import { beamHitsPoint, sovereignBeamActive, sovereignBodyArmored, exposeSovereign, sovereignCoreBonusForBeat } from './sovereign';
import { dashCipherCore } from './cipher';
import { INTERCEPTS, nextWordInIntercept, decryptWord, syncInterceptLore, interceptProgress, transmissionsComplete, masterProgress } from './intercepts';
import { bombeCostMul, upgradeBombeBranch, solvePuzzleReward, runBombe, CRYPTANALYST_TRAIL, grantCryptanalystBonus, CONSOLE_PUZZLES, type BombeBranch } from './bombe';
import { segCircleHit, circleHit, shieldBlocks, withinArc } from './collision';
import { comboMultiplier, scoreForKill, grazeScore, registerKill, tickCombo, shouldSlowmo, hitstopFor, clearTimeBonus, longestDayBonus, perfectThreadReady, perfectThreadScore } from './combat';
import { crossedComboTier } from './comboTiers';
import { rollDraft, applyPerk, describeStacks } from './perks';
import { rollDraftCards, isEvolution, isRelic, availableEvolutions, describeEvolutions } from './evolutions';
import type { DraftCard, EvolutionId } from './evolutions';
import { RELICS, describeRelics } from './relics';
import { encodeBuildDna } from './buildDna';
import { submitScore, submitAchievements } from './api';
import { isMobile, applyMobileClass } from './mobile/detect';
import { mountMobileControls, type MobileControls } from './mobile/controls';
import { boardEligible } from './mobile/withhold';
import { haptics, setHapticsEnabled } from './mobile/haptics';
import { hintFor, ONBOARDING_STEPS, beatTeachState, BEAT_HINT_TEXT, FIRST_DASH_PROMPT, verbTeachFor, enemyReadFor, bossReadFor } from './onboarding';
import type { TeachHit } from './onboarding';
import { tickOverdrive, chargeFromKill, chargeFromGraze, canActivate, activateOverdrive } from './overdrive';
import { parrySweep, applyParryReward, parryEnemySweep, parryShove, parryCooldownAfter, boundedGuardShave, effectiveParryArc, parryStreakNext, parryGrade, parryArcContains } from './parry';
import { tickClutch, canLastBreath, triggerLastBreath, resetErupt, eruptMilestone } from './clutch';
import { consumeShield, regenShield, runShields } from './survival';
import { tickPowerup, activatePowerup, rollPowerup, POWERUPS } from './powerups';
import { OVERDRIVE, SEEKER_TUNE, AUDIO_SFX, CIPHER, SHIELD, RIPOSTE, SHARDCACHE, ONBOARD, PARRY } from './tune';
import { RUN_EVENTS, rollEventChoices, rollEventId, CURATED_IDS } from './events';
import type { RunEventId, EventChoice } from './events';
import { SHIPS, shipById } from './ships';
import { THEMES, themeById, canUnlockTheme } from './themes';
import { grantLongestDayRewards } from './longestDay';
import { bossIntel } from './intel';
import { TRAILS, trailById, trailParticleColor, canUnlockTrail } from './trails';
import type { TrailDef } from './trails';
import { shipSkinById, canUnlockShipSkin } from './shipSkins';
import { skinById, canUnlockSkin, skinLockToast } from './skins';
import { metaApplyFor, metaNode, nodeCost } from './meta';
import { maxStamina, effectiveDashCost, cappedRefund, tickInterruptGate, type InterruptGate } from './dash';
import { createRng, seedFromDate, dateString, seedFromWeek } from './rng';
import { evaluate as evalAchievements, metaAchContext } from './achievements';
import { MODES, modeById, modeRanked, modeSeeded, MAX_DAILY_ATTEMPTS, rollDailyAttempt, RAIL_CARD_IDS, modeUnlocked, bossRushCipherArmed } from './modes';
import type { RunConfig } from './modes';
import { milestoneAt, milestoneShardReward } from './milestones';
import { MUTATORS, pickDailyMutators, pickWeeklyMutators, buildMutatorApply, applyMutatorConfig, mutatorElite } from './mutators';
import type { MutatorId } from './mutators';
import { HEAT_LEVELS, MAX_HEAT, applyHeatStats, applyHeatConfig } from './heat';
import { archetypeById } from './archetypes';
import { BIOMES, biomeAt } from './biomes';
import {
  loadSave,
  saveSave,
  loadSettings,
  saveSettings,
  particleDensityValue,
  buildShareString,
  nextStreak,
  sanitizeHandle,
} from './save';
import type { SaveData, Settings } from './save';
import type { Enemy, EnemyKind, Bullet } from './types';
import { newCoherence, resetCoherence, coherenceTarget, tickCoherence, comboTier, coherenceBeatKick, coherenceBeatFlash, coherenceEdges } from './coherence';
import { BeatClock, makeGrid, gradeRelease } from './beat';
import { glyphArt } from './glyphArt';
import { newNarrator, pickLine, ambientReady, NARRATOR } from './narrator';
import { ReplayRecorder, type ShareMeta } from './replay';
import { choiceEnding, fragmentsForRun, ngPlusIntensityMul, nemesisOf } from './stillpoint';
import { canRelease } from './ending';
import { fragmentBalance, loreById } from './lore';
import { newGhost, recordGhost, ghostAt, serializeGhost, deserializeGhost, toChallengeCode, fromChallengeCode, buildDuelUrl, extractDuelCode, stripDuelQuery } from './ghost';
import type { Ghost } from './ghost';
import { solveDailyCipher, DAILY_CIPHER_REWARD } from './dailyCipher';
import { newSandbox, stepSandbox, sandboxComplete, sandboxText, shouldShowSandbox, currentStep, sandboxBeatTargets, sandboxProgress, overchargeCue } from './sandbox';
import type { SandboxState, SandboxStep } from './sandbox';
import { grantCipherMilestones } from './cipherMilestones';
import { wokenCitizens, CITIZENS } from './citizens';
import { deedsMet, wakeIsCeremony, vigilHeatFloor, agedEcho, comboTierCityLine } from './cityVoice';
import { figureDossier, DOSSIER_FIGURES } from './dossiers';

type State = 'title' | 'sandbox' | 'playing' | 'paused' | 'draft' | 'event' | 'victory' | 'gameover';

// the 6 boss EnemyKinds — keep in sync with the boss roster (bosses/ + bestiary 'boss' cat).
/** The 6 boss EnemyKinds — used to filter killsByKind for deed evaluation. */
const BOSS_KINDS = new Set<string>(['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign']);

/** Sandbox BOSS-PARRY beat — the dummy boss's GUARD bar size (parried boss shots to break it). */
const SANDBOX_GUARD = 5;

// ── 4.1 CHALLENGE THE DEV — a pinned fixed-seed run that races an author ghost. ──
// The seed is a constant so the dev's "official" challenge run is identical for everyone.
// Endless on this seed (off any date/week cadence), so it stays deterministic forever.
const DEV_CHALLENGE_SEED = 0x1ace_fa11; // "LACEFALL" — a fixed, memorable pinned seed
// The author's recorded run, as a duel/challenge code (the byte-identical string COPY-DUEL
// produces). Paste a real recorded run here later to race the dev's ghost; until then it's
// empty and the challenge launches the pinned seed with NO ghost (mechanism only — no fake).
// TODO(author-ghost): play DEV_CHALLENGE_SEED, hit ⚔ DUEL on the game-over screen, and paste
// the copied duel code (the part the URL wraps after `#duel=`) between these quotes.
const DEV_CHALLENGE_GHOST = '';

export class Game {
  private renderer: Renderer;
  private canvas: HTMLCanvasElement;
  private ui: UI;
  private input: InputManager;
  private audio = new AudioEngine();
  private scheduler = new Scheduler();
  private shake = new Shake();
  /** per-frame coordinator so a big chain's screen-wide effects read CLEAN not noisy */
  private juice = new JuiceBudget();
  private director = new Director();

  private save: SaveData;
  private settings: Settings;

  private world: World;
  private state: State = 'title';
  mobile: MobileControls | null = null;
  private runUsedStrongAssist = false;
  private mode: RunConfig = MODES[0];
  private trail: TrailDef = trailById('pulse');
  private seed = 1;
  private winning = false;
  private winTimer = 0;
  private victoryBanked = false; // THE LONGEST DAY — the Sovereign fell this run; the win is banked even if you then die ASCENDing
  private biomeIndex = -1;
  private biomeEntryTime = 0;   // THE CITY SPEAKS — world time when we entered this biome
  private biomeBeatFired = false; // mid-biome (~30s) teach beat fired this biome
  private biomeLateFired = false; // late-biome (~60s) boss-nears beat fired this biome
  private milestoneWave = 0; // last wave we fired an ENDLESS milestone callout for (edge guard)
  private biomeSpeedMul = 1;
  private biomeShield = 0;
  private biomeBulletAccel = 0; // RULE: px/s² added along each live bullet's heading (THE EMBERWALL)
  private biomeNoGraze = false; // RULE: graze dead-zone — no graze reward economy (THE NULL)
  private biomeGrazeMul = 1; // RULE: graze stamina-refund scale here (THE BLOOMGARDENS doubles it)
  private deathCause = 'a bullet';
  private deathKind = ''; // §v9 the killing blow's EnemyKind/boss-kind when known (LAST RUN "killed by")
  private nudgedHandle = false; // show the "set a handle" leaderboard nudge once per session
  private lastOvernightCrack: string[] = []; // THE BOMBE — words it cracked at the last run-end (the "it ran overnight" readout)

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
  private pendingSeed: number | null = null; // 4.1 — a pinned fixed seed (CHALLENGE THE DEV) with no ghost
  private inChallenge = false;
  private challengeTarget = 0;
  private challengeName = '';
  /** §v7 — posted the achievement set to the rarity aggregate at least once this session */
  private achReported = false;

  private ev: PlayerEvents = { beganCharge: false, dashFired: false, dashLen: 0, landed: false, denied: false, parryFired: false };
  private cam: Camera = { leanX: 0, leanY: 0, zoom: 1, shakeX: 0, shakeY: 0, shakeAngle: 0 };

  private accumulator = 0;
  private lastTime = 0;
  private candidates: Enemy[] = [];
  private chainBuf: Enemy[] = []; // separate buffer so chain explosions don't clobber the dash-hit loop
  private parryWasActive = false; // edge-detect the active-window close to fizzle a whiff
  private lastDashOnBeat = false; // the landing dash's beat grade — read at core-shatter / echo-kill for on-beat teeth
  private riposteBossBuf: Bullet[] = []; // boss bullets a Riposte dash intersects, sorted then spent against the budget
  private dashSlowmoTriggered = false;
  private dying = false;
  private dyingTimer = 0;
  private pendingDraft = false;
  private bossWarned = false; // edge-tracks the director's imminent-boss signal so the pre-warning cue fires once per window
  private draftCards: DraftCard[] = [];
  private pendingEvent: RunEventId | null = null;
  // Holds a queued perk-draft / run-event modal open while the player is mid-charge or
  // mid-dash (plus a short settle grace), so a committed dash is never interrupted.
  private interruptGate: InterruptGate = { busyTimer: 0, heldTime: 0 };
  private eventChoices: EventChoice[] = [];
  private announcedEvos = new Set<EvolutionId>(); // evolutions we've already flagged as ready
  private activeMutators: MutatorId[] = []; // run mutators in effect this run
  private eliteMods = { chanceMul: 1, maxAdd: 0 }; // champion-spawn mods from mutators
  private runHeat = 0; // heat level locked in for the active run
  // THE CITY SPEAKS — citizen ids deed-woken THIS run (for debrief); reset on run-init.
  private runWokenFaces: string[] = [];
  private deedCheckTimer = 0; // throttle for the per-second time/wave deed checks
  private onboarding = false; // first-run progressive tutorial active
  private onboardStep = 0;
  // ACT TWO — enemy KINDS already considered for a first-sighting read THIS SESSION, so the
  // per-frame enemy scan short-circuits after the first encounter (the once-ever persistence
  // lives in save.taught; this just bounds the per-frame work). Cosmetic; no rng.
  private actTwoSeenKinds = new Set<string>();
  // ACT TWO — a spaced queue so several first-sighting teaches in one wave surface one at a time
  // (not stacked). Marked taught only as each shows (pumpTeach). Cosmetic; no rng.
  private teachQueue: TeachHit[] = [];
  private teachCooldown = 0;
  // §1.2 DASH SANDBOX — the no-fail first-run teach. A DEDICATED throwaway World +
  // its own non-seeded rng, so the teach NEVER touches this.world or the seeded run
  // streams; the run begins only once the sandbox hands off to start(cfg), which
  // fully resets+re-seeds the real world. Held mode is the run to launch on completion.
  private sandbox: SandboxState | null = null;
  private sandboxWorld: World | null = null;
  private sandboxMode: RunConfig = MODES[0];
  private sandboxDashKills = 0; // dummies skewered by the CURRENT dash (reset each dash; drives the combo beat)
  private sandboxComboMissed = false;
  private sandboxSetupStep: SandboxStep | null = null; // the beat whose targets/bullets are currently staged
  private sandboxBeatEntryDashId = -1; // player.dashId when the active beat began — a dash counts only if NEWER
  //  (so one dash can't blow through several beats; each dash-success beat needs its OWN fresh dash)
  private sandboxCueTimer = 0; // throttles the cosmetic target-ring / overcharge pulse (a few Hz)
  // Grid B — no-fail opening grace, ONLY on a brand-new player's first run. A PURE
  // wall-clock gate that tops up i-frames so the dash can be learned before dying;
  // never touches world.rng / spawns, so the Daily stays deterministic.
  private firstRunGrace = 0;
  private showBeatRingThisRun = false; // C5 — auto-show the beat-ring for the first few runs
  private beatHintShownThisRun = false; // C5 — one-time dash-on-beat hint per run
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
      onStart: (cfg) => this.descend(cfg),
      onRestart: () => this.start(this.mode),
      onResume: () => this.resume(),
      onPause: () => { if (this.state === 'playing') this.pause(); }, // touch PAUSE button
      onQuit: () => this.toTitle(),
      onPick: (i) => this.pickPerk(i),
      onPickEvent: (i) => this.pickEvent(i),
      onCopyScore: () => this.copyScore(),
      onCopyBuildDna: () => this.copyBuildDna(),
      onChoice: (c) => this.makeChoice(c),
      onSaveReplay: () => this.shareReplay(),
      onDecryptWord: (interceptId) => this.decryptIntercept(interceptId),
      onUpgradeBombe: (branch) => this.upgradeBombe(branch as BombeBranch),
      onSolvePuzzle: (puzzleId, guess) => this.solveConsolePuzzle(puzzleId, guess),
      onSolveDailyCipher: (guess) => this.solveDailyCipherCallback(guess),
      onShareDailyCipher: () => this.shareDailyCipherCallback(),
      onToggleNgPlus: () => this.toggleNgPlus(),
      onCreateChallenge: () => this.createChallenge(),
      onAcceptChallenge: (code) => this.acceptChallenge(code),
      onChallengeDev: () => this.challengeTheDev(),
      onSettingsChange: (s) => this.applySettings(s),
      onSelectShip: (id) => this.selectShip(id),
      onUnlockShip: (id) => this.unlockShip(id),
      onSelectTheme: (id) => this.selectTheme(id),
      onUnlockTheme: (id) => this.unlockTheme(id),
      onSelectTrail: (id) => this.selectTrail(id),
      onUnlockTrail: (id) => this.unlockTrail(id),
      onSelectShipSkin: (shipId, setId) => this.selectShipSkin(shipId, setId),
      onUnlockShipSkin: (shipId, setId) => this.unlockShipSkin(shipId, setId),
      onSelectSkin: (kind, id) => this.selectSkin(kind, id),
      onUnlockSkin: (kind, id) => this.unlockSkin(kind, id),
      onBuyMeta: (id) => this.buyMeta(id),
      onHeatChange: (level) => this.setHeat(level),
      onArchetypeChange: (id) => this.setArchetype(id),
      onSelectMode: (id) => this.selectMode(id),
      onSelectAvatar: (id) => { this.save.selectedAvatar = id; saveSave(this.save); this.ui.refreshTitle(this.save); },
      onToggleCityMemory: (v) => { this.save.cityMemoryMeter = v; saveSave(this.save); },
      onReplayTutorial: () => this.replayTutorial(),
      onMarkGloss: (id) => { if (!this.save.glossSeen.includes(id)) { this.save.glossSeen.push(id); saveSave(this.save); } },
      onSetHandle: (name) => this.setHandle(name),
      onSkipSandbox: () => this.finishSandbox(),
      onReleaseTheDay: () => { this.requestReleaseTheDay(); },
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
    this.applySkins();
    this.applyShipSkin();
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

  /** Push the equipped enemy-skin selection to the renderer (cosmetic). Called on
   *  boot and after any equip; the renderer resolves + caches per kind. */
  private applySkins(): void {
    this.renderer.setSkins(this.save.selectedSkins);
  }

  /** Push the equipped ship-skin set to the renderer (cosmetic). Called on boot + equip. */
  private applyShipSkin(): void {
    // the flown ship wears its OWN equipped skin (per-ship); missing → the plain hull
    this.renderer.setShipSkin(this.save.selectedShipSkins[this.save.selectedShip] ?? 'none');
  }

  boot(): void {
    this.routeDuelLink(); // 4.4 — a friend opened a `#duel=<code>` link → route it in
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** 4.4 — On boot, detect a `#duel=<code>` (also `?duel=`) in the URL, strip it from the
   *  address bar (so a refresh can't re-trigger), and route the code into the EXISTING
   *  accept-challenge flow by pre-filling the DUEL panel. Determinism is preserved: the code
   *  is the byte-identical challenge string, fed to the same acceptChallenge() path on ACCEPT. */
  private routeDuelLink(): void {
    let code = '';
    try {
      code = extractDuelCode(location.hash) || extractDuelCode(location.search);
    } catch {
      return; // no usable location (e.g. a non-browser test env) → nothing to route
    }
    if (!code) return;
    // strip the duel payload from the address bar so a refresh can't re-trigger it.
    // Drop a `#duel=...` hash entirely; remove a `?duel=...` query param while keeping
    // any other params intact. Falls back gracefully if history/URL APIs are missing.
    try {
      const clean = location.pathname + stripDuelQuery(location.search);
      history.replaceState(null, '', clean);
    } catch {
      /* replaceState unavailable — harmless; we already have the code */
    }
    // validate before surfacing — a mangled link shouldn't pop an empty duel panel
    if (!fromChallengeCode(code)) {
      this.ui.toast('That duel link looks corrupted — ask your friend to resend it.');
      return;
    }
    this.ui.openDuelWithCode(code); // pre-filled; ACCEPT runs the same acceptChallenge() flow
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // cap the backing store (≤1.5, tighter than the ~2 ceiling) for fill-rate headroom on hi-DPI / mobile
    this.renderer.resize(w, h, dpr);
    this.world.width = w;
    this.world.height = h;
  }

  /** Mount the touch overlay. Called from main.ts ONLY when isMobile() — desktop never
   *  constructs it, so no mobile DOM/listener can exist there. `root` is the #ui-root. */
  mountMobile(root: HTMLElement): void {
    if (this.mobile) return;
    this.mobile = mountMobileControls(this.canvas, root, {
      mirror: this.settings.mirrorTouch,
      scale: this.settings.touchScale,
      assist: this.settings.assistMode,
    });
  }

  private applySettings(s: Settings): void {
    this.settings = s;
    saveSettings(s);
    this.audio.setVolumes(s.master, s.sfx, s.music);
    this.audio.setSoundtrack(s.soundtrack);
    // screen shake is pure camera MOTION → reduce-motion zeroes it (vestibular safety);
    // reduce-flashing only tames it. The strongest active reducer wins.
    this.shake.intensity = s.shake * (s.reduceMotion ? 0 : s.reduceFlashing ? 0.4 : 1);
    this.input.rumbleEnabled = s.rumble;
    setHapticsEnabled(s.haptics); // mobile vibrate feedback (no-op on desktop, like rumble without a pad)
    this.input.setKeymap(s.keymap); // apply rebindable core-action keys (dash / overdrive / pause)
    this.baseDensity = particleDensityValue(s.particleDensity) * (s.reduceFlashing ? 0.6 : 1);
    this.world.particles.density = this.baseDensity * this.perfScale;
    // reduce-motion disables decorative UI animations/transitions (CSS)
    document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
    // mobile: the single isolation switch + push live options to the overlay (no-op on desktop)
    applyMobileClass(isMobile(s.inputMode));
    this.mobile?.setOptions({ mirror: s.mirrorTouch, scale: s.touchScale, assist: s.assistMode });
    document.documentElement.classList.toggle('reduce-flashing', s.reduceFlashing); // a11y — soft cross-fades, no strobe (THE BOMBE decrypt flash etc.)
    document.documentElement.classList.toggle('clarity', s.clarity); // §5.4 a11y — high-contrast hook for the DOM UI (cockpit/sandbox/panels)
    document.documentElement.classList.toggle('colorblind', s.colorblind); // a11y — colorblind-safe accents for the DOM UI
    this.ui.setTutorialHints(s.tutorialHints); // ACT TWO — gate the first-appearance jargon glosses on the hints toggle
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

  // ── §1.2 DASH SANDBOX — the no-fail first-run teach ────────────────────────
  /** The DESCEND entry. A brand-new player (seenSandbox false, motion not reduced)
   *  is routed into the no-fail sandbox FIRST; everyone else starts the run directly.
   *  Determinism: the sandbox runs on a SEPARATE throwaway World and NEVER touches
   *  this.world or any seeded rng stream, so start(cfg) below seeds exactly as today. */
  private descend(cfg: RunConfig): void {
    // THE CITY SPEAKS — once-ever premise card for brand-new players (totalRuns === 0).
    // Shows before the sandbox/run; re-enters descend via the onDone callback when done.
    if (!this.save.seenPremiseCard && this.save.totalRuns === 0) {
      this.save.seenPremiseCard = true; saveSave(this.save);
      this.ui.showPremiseCard(() => this.descend(cfg));
      return;
    }
    // ACT TWO — the no-fail teach is gated by the Tutorial hints toggle too (a veteran who turned
    // hints off skips straight into the run, just like a returning player or reduce-motion).
    if (this.settings.tutorialHints && shouldShowSandbox(this.save.seenSandbox, this.settings.reduceMotion)) {
      this.startSandbox(cfg);
    } else {
      // even when we skip the teach (returning player or reduce-motion), record it as
      // seen so the flag converges and the gate is a true once-ever event.
      if (!this.save.seenSandbox) {
        this.save.seenSandbox = true;
        saveSave(this.save);
      }
      this.start(cfg);
    }
  }

  /** Enter the sandbox state: build a dedicated throwaway world, stage the FIRST beat,
   *  make the player unfailable, and surface the first teach step. Audio is unlocked so
   *  the dash/whoosh sells the verb (and the rhythm beat can sync the beat clock). No
   *  this.world / no seeded rng is touched — the real run is untouched until finishSandbox(). */
  private startSandbox(cfg: RunConfig): void {
    this.audio.ensure();
    this.ui.hideSoundHint();
    this.sandboxMode = cfg;
    this.sandbox = newSandbox();
    this.sandboxDashKills = 0;
    this.sandboxSetupStep = null;
    this.sandboxCueTimer = 0;
    // a SEPARATE world on a throwaway, NON-seeded rng — it can never perturb the run.
    const sw = new World(createRng(0x5A4D_B0C5)); // "SANDBOX" — a fixed throwaway seed
    sw.reset(window.innerWidth, window.innerHeight);
    sw.player.x = window.innerWidth * 0.28;
    sw.player.y = window.innerHeight * 0.5;
    sw.player.iframe = 1e9; // truly unfailable for the whole teach
    this.sandboxWorld = sw;
    this.setupSandboxBeat(sw, currentStep(this.sandbox).step); // stage the first beat's targets
    // a fresh beat-clock epoch so the rhythm beat grades against THIS sandbox's transport
    this.beat = new BeatClock(makeGrid(MUSIC_BPM));
    this.renderer.setGhost(null, 0);
    this.renderer.setBiomeTint(null);
    this.renderer.setCoherence(0.7, 0, 0, 0); // a calm, mostly-lit teach (no FALL wash)
    this.input.clearHeld(); // never auto-charge from a held key carried in from the menu
    this.audio.startDrone();
    this.audio.duckMusic(true); // music quiet until the rhythm beat lifts it
    this.state = 'sandbox';
    this.ui.showSandbox(sandboxText(this.sandbox));
    const p0 = sandboxProgress(this.sandbox);
    this.ui.setSandboxProgress(p0.index, p0.total);
  }

  /** Stage one beat on the throwaway world: clear the board, then spawn that beat's dummy
   *  targets (and mark a HEAVY blocker). Bullet-driven beats (graze/parry) and the rhythm
   *  beat are topped up per-frame in stepSandboxFrame. Pure layout + cosmetic spawns; no rng. */
  private setupSandboxBeat(sw: World, step: SandboxStep): void {
    sw.enemies.forEachActive((e) => sw.enemies.release(e));
    sw.bullets.forEachActive((b) => sw.bullets.release(b));
    // recentre the player to the start anchor each beat so every layout below has the same,
    // predictable runway — otherwise carry-momentum drift across beats strands the geometry
    // (e.g. the player pinned at the right wall can't line up the combo row). Cosmetic; no rng.
    sw.player.x = sw.width * 0.28;
    sw.player.y = sw.height * 0.5;
    sw.player.vx = 0; sw.player.vy = 0;
    sw.player.phase = 'idle'; sw.player.charge = 0; sw.player.overcharge = 0;
    this.sandboxComboMissed = false; // combo move-teach: fresh each (re)stage
    const px = sw.player.x, py = sw.player.y;
    // a recentre "blink-in" so the snap to the anchor reads as a deliberate reset, not a glitch
    sw.particles.ring(px, py, 28, '#5beaff', 0.4);
    sw.particles.dust(px, py, '#22d3ee');
    const targets = sandboxBeatTargets(step);
    for (const t of targets) {
      const e = sw.spawnEnemy('drifter', px + t.dx, py + t.dy, 1, 1, t.shielded ?? false, false, 0);
      if (!e) continue;
      e.scale = 1;
      e.shielded = t.shielded ?? false;
      if (t.boss) {
        // a big dummy boss whose hp bar IS the GUARD the player parries down (no AI tick → stationary)
        e.radius = 42; e.hp = SANDBOX_GUARD; e.maxHp = SANDBOX_GUARD; e.color = '#ff6b87';
      } else {
        e.hp = 1; e.maxHp = 1;
      }
    }
    // a one-shot directional cue toward the marks (bullet/rhythm beats are their own cue;
    // the combo move-teach uses its own pulsing MOVE cue + guide line instead)
    if (targets.length > 0 && step !== 'combo') {
      const t = targets[0];
      const ang = Math.atan2(t.dy, t.dx);
      sw.particles.floatText(px + Math.cos(ang) * 56, py + Math.sin(ang) * 56 - 22, 'AIM →', '#9fd8ff', 1.1);
    }
    this.sandboxSetupStep = step;
    // a dash counts for this beat only if it STARTS now or later — so an in-progress dash
    // from the previous beat can't auto-clear this beat's freshly-spawned target.
    this.sandboxBeatEntryDashId = sw.player.dashId;
  }

  /** One display-frame of the sandbox: stage the active beat, drive the dummy world's
   *  player, detect that beat's success, advance the pure step machine, then render the
   *  throwaway world through the EXISTING renderer with the DOM overlay on top. Hands off
   *  to the real start() the instant the lesson completes. Never touches the real run / rng. */
  private stepSandboxFrame(realDt: number): void {
    const sw = this.sandboxWorld;
    const sb = this.sandbox;
    if (!sw || !sb) {
      this.finishSandbox();
      return;
    }
    const step = currentStep(sb).step;
    if (this.sandboxSetupStep !== step) this.setupSandboxBeat(sw, step); // (re)stage on a beat change

    const dt = Math.min(realDt, 0.05);
    resetEvents(this.ev);
    const wasCharging = sw.player.phase === 'charging';
    updatePlayer(sw.player, this.input.state, dt, sw.stats, sw.width, sw.height, this.ev, this.settings.dashStyle === 'slingshot', 0);
    sw.player.iframe = 1e9; // keep it unfailable even as updatePlayer decrements i-frames

    // keep a pure beat clock running so the RHYTHM beat can grade an on-beat dash; the
    // music started in startSandbox lets it sync (gradeRelease is 'off' until synced).
    this.beat.advance(realDt);
    if (this.audio.activeBpm !== this.beat.grid.bpm) this.beat.retempo(this.audio.activeBpm);
    if (this.audio.musicRunning) this.beat.reconcile(this.audio.musicTime, realDt);

    // sell the verb with the existing audio cues (no sim coupling)
    if (this.ev.beganCharge) this.audio.startCharge();
    if (sw.player.phase === 'charging') this.audio.setCharge(sw.player.charge);
    if (wasCharging && sw.player.phase !== 'charging' && !this.ev.dashFired) this.audio.endCharge();
    if (this.ev.dashFired) {
      this.audio.endCharge();
      this.audio.whoosh();
      this.shake.add(TUNE.juice.traumaDash);
      sw.particles.streaks(sw.player.x, sw.player.y, sw.player.dashDirX, sw.player.dashDirY, '#5beaff');
      this.sandboxDashKills = 0; // a new dash — start a fresh kill tally for the combo beat
    }
    if (this.ev.landed) sw.particles.dust(sw.player.x, sw.player.y, '#22d3ee');

    // integrate the throwaway-world bullets ourselves — the sandbox doesn't run the real
    // updateBullets, so graze/parry shots would otherwise sit still. Pure motion + cull; no rng.
    sw.bullets.forEachActive((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -60 || b.x > sw.width + 60 || b.y < -60 || b.y > sw.height + 60) sw.bullets.release(b);
    });

    // AIM CUE — a few-Hz pulse so "act on THIS" is unmistakable: a ring on each active target
    // (cyan / gold far-mark / steel blocker), and on the HEAVY beat a charge-state pulse on the
    // player. Cosmetic; throttled by sandboxCueTimer so it pulses rather than spams.
    this.sandboxCueTimer -= dt;
    const cueTick = this.sandboxCueTimer <= 0;
    if (cueTick) this.sandboxCueTimer = 0.32;
    if (cueTick) {
      const cueColor = step === 'reach' ? '#ffd166' : step === 'heavy' ? '#9fb4d8' : step === 'bossparry' ? '#ff8da3' : '#5beaff';
      sw.enemies.forEachActive((e) => sw.particles.ring(e.x, e.y, e.radius + 14, cueColor, 0.34));
      // COMBO move-teach: a faint guide line through the row + a MOVE cue toward its nearest
      // point, so "drift onto this line" is unmistakable. Cosmetic particles only (no rng).
      if (step === 'combo') {
        const row: { x: number; y: number }[] = [];
        sw.enemies.forEachActive((e) => row.push({ x: e.x, y: e.y }));
        if (row.length >= 2) {
          const a = row[0], b = row[row.length - 1];
          for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            sw.particles.ring(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 3, '#5beaff', 0.3);
          }
          const px = sw.player.x, py = sw.player.y;
          const abx = b.x - a.x, aby = b.y - a.y;
          const len2 = abx * abx + aby * aby || 1;
          let tt = ((px - a.x) * abx + (py - a.y) * aby) / len2;
          tt = Math.max(0, Math.min(1, tt));
          const nx = a.x + abx * tt, ny = a.y + aby * tt;
          sw.particles.floatText(px + (nx - px) * 0.45, py + (ny - py) * 0.45 - 8, 'MOVE · W A S D', '#9fd8ff', 1.0);
        }
      }
    }

    // ── per-beat success detection (cosmetic; reads the throwaway world, no rng) ──
    const ev = { beganCharge: this.ev.beganCharge, dashed: this.ev.dashFired, skewer: false,
      reached: false, heavyDash: false, comboDash: false, grazed: false, parried: false, onBeatDash: false, bossBroke: false };

    // HEAVY beat — teach the OVERCHARGE: a sub-note + a gold player pulse once charge is full,
    // flipping to "release!" the instant the overcharge arms (overchargeCue reads the live player).
    if (step === 'heavy') {
      const cue = overchargeCue(sw.player.charge, sw.player.overcharge);
      // the gold overcharge cue overrides the static sub once the player is charging to full
      if (cue !== 'none') this.ui.setSandboxNote(cue === 'armed' ? 'HEAVY READY — release!' : 'KEEP HOLDING → HEAVY', true);
      else this.ui.setSandboxNote(currentStep(sb).sub ?? '');
      if (cueTick && cue !== 'none') sw.particles.ring(sw.player.x, sw.player.y, sw.player.radius + 18, cue === 'armed' ? '#ffe08a' : '#ffd166', 0.3);
    } else if (step === 'done') {
      this.ui.setSandboxNote('Replay anytime in Settings ▸ Replay tutorial');
    } else if (step === 'combo') {
      // after a miss, swap the sub for the exact fix; otherwise the normal sub
      this.ui.setSandboxNote(this.sandboxComboMissed
        ? 'Almost — drift onto the row line, then dash across all of them.'
        : (currentStep(sb).sub ?? ''));
    } else {
      // parry / rhythm carry a deeper sub-explanation; other beats have none → clears
      this.ui.setSandboxNote(currentStep(sb).sub ?? '');
    }

    // dash skewers: the dash segment crossing live dummies. A shielded blocker only breaks
    // to a HEAVY (overcharged) dash; a plain dash clangs and teaches the overcharge. Only a
    // dash STARTED during this beat counts (freshDash) — beats stay isolated, one dash each.
    const freshDash = sw.player.dashId > this.sandboxBeatEntryDashId;
    const dashing = (sw.player.phase === 'dashing' || this.ev.landed) && freshDash;
    if (dashing && step !== 'bossparry') { // bossparry is a parry beat — a dash mustn't skewer the boss
      const ax = sw.player.dashFromX, ay = sw.player.dashFromY, bx = sw.player.x, by = sw.player.y;
      const heavy = sw.player.dashHeavy;
      sw.enemies.forEachActive((e) => {
        if (!e.active || !segCircleHit(ax, ay, bx, by, e.x, e.y, e.radius, 16)) return;
        if (e.shielded && !heavy) {
          if (step === 'heavy') { sw.particles.ring(e.x, e.y, e.radius + 12, '#9fb4d8', 0.22); this.audio.thunk(2, this.panFor(e.x)); }
          return; // a plain dash can't crack armour
        }
        ev.skewer = true;
        this.sandboxDashKills += 1;
        if (e.shielded) ev.heavyDash = true;
        sw.particles.burst(e.x, e.y, 22, e.color);
        sw.particles.floatText(e.x, e.y - 16, e.shielded ? 'HEAVY!' : 'SKEWER', e.shielded ? '#ffd166' : '#5beaff', 0.95);
        this.shake.add(TUNE.juice.traumaKill);
        this.scheduler.requestHitstop(0.05);
        this.audio.thunk(12, this.panFor(e.x));
        sw.enemies.release(e);
      });
      if (step === 'reach' && ev.skewer) ev.reached = true; // the only mark on the reach beat is the far one
      if (this.sandboxDashKills >= 2) ev.comboDash = true; // a single dash skewered the line
    }
    if (ev.skewer) sw.player.killsThisDash = this.sandboxDashKills; // mirror for any read-back
    // COMBO move-teach: a dash that landed with <2 skewers means the player was not lined up —
    // latch a nudge to drift onto the row. ev.landed fires the frame the dash completes; the
    // kill tally still holds this dash's total (it resets only on the next dash fire).
    if (step === 'combo' && this.ev.landed && freshDash && this.sandboxDashKills < 2) {
      this.sandboxComboMissed = true;
    }

    // GRAZE beat — feed slow drifting shots and reward a near-miss (the player is unfailable)
    if (step === 'graze') {
      this.feedSandboxGrazeBullets(sw);
      const gr = sw.stats.grazeRadius;
      const px = sw.player.x, py = sw.player.y, hitR = sw.player.radius;
      sw.bullets.forEachActive((b) => {
        if (ev.grazed) return;
        const d2 = (px - b.x) * (px - b.x) + (py - b.y) * (py - b.y);
        const rr = gr + b.radius;
        if (d2 <= rr * rr && d2 > (hitR + b.radius) * (hitR + b.radius)) ev.grazed = true;
      });
      if (ev.grazed) { sw.particles.graze(px, py); this.audio.graze(); sw.particles.floatText(px, py - 30, 'GRAZE', '#3df0ff', 0.9); }
    }

    // RHYTHM beat — light music + the beat ring, grade the dash, bloom coherence on-beat
    let beatRing = false;
    if (step === 'rhythm') {
      this.audio.duckMusic(false); // lift the bed so the pulse is audible
      beatRing = !this.settings.reduceFlashing && !this.settings.reduceMotion;
      if (this.ev.dashFired && freshDash) {
        const grade = gradeRelease(this.beat.beatError(), this.beat.synced, 1);
        if (grade !== 'off') {
          ev.onBeatDash = true;
          const perfect = grade === 'perfect';
          this.renderer.setCoherence(1, 1, 1, 0); // the City wakes
          sw.particles.floatText(sw.player.x, sw.player.y - 34, perfect ? 'PERFECT' : 'ON BEAT', perfect ? '#fde047' : '#67e8f9', 0.95);
          if (beatRing) this.ui.flashBeatPip(perfect);
        }
      }
    }

    // PARRY beat — telegraphed shot; a deflect (parryFired) is the success (handled in resolveSandboxParry)
    let parried = false;
    if (step === 'parry') {
      this.feedSandboxParryBullet(sw);
      if (this.ev.parryFired) {
        parried = true;
        sw.bullets.forEachActive((b) => { sw.particles.burst(b.x, b.y, 16, '#ffd166'); sw.bullets.release(b); });
        this.audio.parry(true);
        this.shake.add(0.1);
      }
    }
    ev.parried = parried;

    // BOSS-PARRY beat — a stationary dummy boss fires a slow volley; PARRY it to chip its GUARD
    // (its hp bar) to zero, reflecting its big orb for a bigger crack. No-fail: the boss bullets
    // run no hit-check in the sandbox, so they pass harmlessly; only parrying matters.
    if (step === 'bossparry') {
      let boss: Enemy | null = null;
      sw.enemies.forEachActive((e) => { if (!boss) boss = e; });
      if (boss) {
        const bossE: Enemy = boss;
        this.feedSandboxBossVolley(sw, bossE);
        if (this.ev.parryFired) {
          const arc = effectiveParryArc(0.8, sw.stats.parryReach, sw.stats.parryHalfAngle);
          let chip = 0;
          sw.bullets.forEachActive((b) => {
            if (!parryArcContains(sw.player.x, sw.player.y, sw.player.angle, b.x, b.y, arc.reach, arc.halfAngle)) return;
            const orb = b.reflectable;
            sw.particles.burst(b.x, b.y, orb ? 22 : 14, orb ? '#ffd166' : '#ff8da3');
            if (orb) sw.particles.floatText(b.x, b.y - 14, 'REFLECTED', '#fbbf24', 1.0);
            sw.bullets.release(b);
            chip += orb ? 2 : 1;
          });
          if (chip > 0) {
            this.audio.parry(true);
            this.shake.add(0.12);
            bossE.hp -= chip;
            if (bossE.hp <= 0) {
              ev.bossBroke = true;
              sw.particles.burst(bossE.x, bossE.y, 42, bossE.color);
              sw.particles.floatText(bossE.x, bossE.y - 36, 'GUARD BROKEN — EXPOSED!', '#fde047', 1.3);
              this.shake.add(0.3);
              sw.enemies.release(bossE);
            }
          }
        }
      }
    }

    sw.particles.update(dt);

    // advance the pure step machine; relabel the overlay on a step change
    const next = stepSandbox(sb, dt, ev);
    this.sandbox = next;
    this.ui.setSandboxText(sandboxText(next));
    if (next.stepIndex > sb.stepIndex) {
      // a beat just cleared — a quick ✓ flourish + soft tick, and advance the pip row
      if (!next.done) {
        sw.particles.floatText(sw.player.x, sw.player.y - 42, '✓', '#7dffa8', 1.0);
        sw.particles.ring(sw.player.x, sw.player.y, 30, '#7dffa8', 0.4);
        this.audio.thunk(3, this.panFor(sw.player.x));
      }
      const prog = sandboxProgress(next);
      this.ui.setSandboxProgress(prog.index, prog.total);
    }
    // the sandbox parry teaches the verb for real — mark it so the contextual fallback (and a
    // later replay) never re-teach `verb:parry` redundantly. Cosmetic save write; no rng.
    if (parried && !this.save.taught.includes('verb:parry')) {
      this.save.taught.push('verb:parry');
      saveSave(this.save);
    }

    if (sandboxComplete(next)) {
      this.finishSandbox();
      return;
    }

    // render the throwaway world via the EXISTING renderer (no canvas text added)
    this.renderer.render(sw, this.cam, {
      reduceFlashing: this.settings.reduceFlashing,
      colorblind: this.settings.colorblind,
      combo: 0,
      caScale: this.settings.chromAberration,
      reduceMotion: this.settings.reduceMotion,
      clarity: this.settings.clarity,
      beatRing,
      beatPhase: this.beat.beatPhase(),
      slingshot: this.settings.dashStyle === 'slingshot',
      firstLight: 0,
      cipherAssist: false,
    });
  }

  /** GRAZE beat — keep two slow shots drifting past the player (inside the graze ring, outside
   *  the hitbox) so a near-miss reliably registers. The player is unfailable, so they can't be
   *  hurt skimming them. Fixed lanes (no rng); the throwaway world is GC'd at hand-off. */
  private feedSandboxGrazeBullets(sw: World): void {
    if (sw.bullets.activeCount > 0) return;
    const px = sw.player.x, py = sw.player.y;
    const off = Math.max(sw.player.radius + 14, sw.stats.grazeRadius * 0.6); // skim distance
    const sp = 120; // slow + readable
    for (const dy of [-off, off]) {
      const b = sw.spawnBullet(px + 460, py + dy, -sp, 0, 7, '#8bd0ff', false, 'orb');
      if (b) b.life = 12;
    }
  }

  /** BOSS-PARRY beat — the dummy boss lobs a slow telegraphed VOLLEY at the player (a small fan
   *  of boss bolts + one big reflectable orb) whenever the board clears, so there's always
   *  something to parry. fromBoss bullets run no hit-check in the sandbox → harmless. No rng. */
  private feedSandboxBossVolley(sw: World, boss: Enemy): void {
    if (sw.bullets.activeCount > 0) return;
    const baseA = Math.atan2(sw.player.y - boss.y, sw.player.x - boss.x);
    for (const off of [-0.18, 0, 0.18]) {
      const a = baseA + off, sp = 115;
      const b = sw.spawnBullet(boss.x, boss.y, Math.cos(a) * sp, Math.sin(a) * sp, 8, '#ff6b87', true, 'orb');
      if (b) b.life = 14;
    }
    const ob = sw.spawnBullet(boss.x, boss.y, Math.cos(baseA) * 80, Math.sin(baseA) * 80, 13, '#ffb061', true, 'orb');
    if (ob) { ob.reflectable = true; ob.life = 16; }
  }

  /** PARRY beat — keep ONE slow, telegraphed, reflectable shot heading into the aim arc so the
   *  player has something to deflect. Re-spawns once it leaves; player unfailable. No rng. */
  private feedSandboxParryBullet(sw: World): void {
    if (sw.bullets.activeCount > 0) return;
    const px = sw.player.x, py = sw.player.y;
    const sx = px + 300, sy = py - 44;
    const a = Math.atan2(py - sy, px - sx);
    const sp = 95;
    const b = sw.spawnBullet(sx, sy, Math.cos(a) * sp, Math.sin(a) * sp, 9, '#ff7b9c', false, 'orb');
    if (b) { b.reflectable = true; b.life = 12; }
  }

  /** Leave the sandbox (completed OR skipped): mark it seen so it never repeats, drop
   *  the throwaway world, hide the overlay, then begin the REAL run via the existing
   *  start() path — which fully resets+re-seeds this.world, guaranteeing zero residue. */
  private finishSandbox(): void {
    if (this.state !== 'sandbox') return;
    if (!this.save.seenSandbox) {
      this.save.seenSandbox = true;
      saveSave(this.save);
    }
    const cfg = this.sandboxMode;
    this.sandbox = null;
    this.sandboxWorld = null; // GC the throwaway world; this.world was never touched
    this.audio.endCharge();
    this.input.clearHeld(); // drop the held dash key so the real run never auto-charges
    this.ui.hideSandbox();
    this.start(cfg); // the unchanged seed/init path — the run is bit-identical to a normal DESCEND
  }

  // ── state transitions ──
  private start(cfg: RunConfig): void {
    this.audio.ensure();
    this.ui.hideSoundHint();
    this.mode = cfg;
    this.runUsedStrongAssist = false; // per-run; set true if strong aim-assist influences aim (→ off-board)
    const challenge = this.pendingChallenge;
    this.pendingChallenge = null;
    const pinnedSeed = this.pendingSeed; // 4.1 — CHALLENGE THE DEV: a fixed seed, no ghost
    this.pendingSeed = null;
    // §4 M4 — Daily best-of-3: once today's 3 attempts are used, lock the Daily and run
    // Endless instead (a duel is exempt; it never counts toward the attempt budget).
    if (cfg.id === 'daily' && !challenge) {
      const r = rollDailyAttempt(dateString(), this.save.dailyAttemptDate, this.save.dailyAttempts);
      if (r.locked) {
        cfg = modeById('endless');
        this.mode = cfg;
        this.ui.toast(`Daily ${MAX_DAILY_ATTEMPTS}/${MAX_DAILY_ATTEMPTS} today — Endless instead. Come back tomorrow.`);
      }
    }
    this.seed = challenge
      ? challenge.seed
      : pinnedSeed != null
        ? pinnedSeed // 4.1 — the pinned DEV_CHALLENGE_SEED (deterministic, no ghost yet)
        : cfg.seedKind === 'date'
          ? seedFromDate()
          : cfg.seedKind === 'week'
            ? seedFromWeek() // WEEKLY CHALLENGE — one week-stable seed for everyone, all week
            : (Date.now() & 0x7fffffff) || 1;
    this.audio.setMusicVariant(this.seed); // one coherent arena track per run (reads the seed, no rng draw)
    this.world.rng = createRng(this.seed);
    this.world.seed = this.seed; // read-only source for the cipher-lock (no rng draw)
    // power-up drops draw from a SEPARATE stream so death-timed draws never perturb
    // the seeded director/spawn stream (keeps the Daily's waves identical for all)
    this.world.dropRng = createRng((this.seed ^ 0x1f83d9ab) >>> 0);
    // mid-run EVENTS get their OWN stream too — their id roll + resolves fire at
    // player-driven timing/choice, so this keeps world.rng (the wave stream) identical
    this.world.eventRng = createRng((this.seed ^ 0x2545f491) >>> 0);
    this.world.metaApply = metaApplyFor(this.save.meta);
    this.world.shipApply = shipById(this.save.selectedShip).apply;
    this.world.shipId = this.save.selectedShip; // cosmetic — drives the hull silhouette + accent
    // run mutators — the Daily/Weekly pick a deterministic set from the seed (each its
    // OWN separate rng stream, so previewing/picking never perturbs the seeded wave stream)
    this.activeMutators =
      cfg.id === 'daily' ? pickDailyMutators(this.seed)
      : cfg.seedKind === 'week' ? pickWeeklyMutators(this.seed)
      : [];
    this.world.mutatorApply = buildMutatorApply(this.activeMutators);
    this.eliteMods = mutatorElite(this.activeMutators);
    // Heat ascension — stat effects via the postApply capstone, director effects via a cloned cfg
    // Heat ascension — a DUEL forces the CHALLENGER's heat (baked into the code) so
    // the "same seed" fight is genuinely the same; otherwise the player's selection.
    this.runHeat = challenge ? Math.max(0, Math.min(MAX_HEAT, Math.round(challenge.heat ?? 0))) : this.save.selectedHeat;
    // THE VIGIL'S WEIGHT — holding the light (Vigil 'catch') raises the Heat floor on non-seeded runs.
    // Seeded (Daily/Weekly) runs are never affected so the shared leaderboard stays bit-identical.
    if (!modeSeeded(cfg) && this.save.stillpointChoice === 'catch' && !this.save.released) {
      this.runHeat = Math.max(this.runHeat, vigilHeatFloor(this.save)); // clamp UP to the vigil floor
    }
    this.world.postApply = (s) => applyHeatStats(s, this.runHeat);
    const effCfg = applyHeatConfig(applyMutatorConfig(cfg, this.activeMutators), this.runHeat);
    // NG+ — deepen NON-seeded runs only; daily/seeded stays bit-identical for everyone.
    // A duel forces the challenger's NG+ too (still gated off date seeds) so it reproduces.
    // runNgPlus is now the single source of truth for both the intensity mul and the HUD.
    const ngLevel = challenge ? (challenge.ngPlus ?? 0) : this.save.ngPlusActive ? this.save.ngPlusLevel : 0;
    // NG+ is OFF for ANY seeded mode (Daily/Weekly) so the shared run stays bit-identical for all.
    this.runNgPlus = !modeSeeded(cfg) ? Math.max(0, Math.min(NG_PLUS.maxLoop, Math.round(ngLevel))) : 0;
    const runMul = ngPlusIntensityMul(effCfg.intensityMul, this.runNgPlus > 0, this.runNgPlus, cfg.seedKind, NG_PLUS.intensityPerLoop, NG_PLUS.maxLoop);
    const runCfg = runMul === effCfg.intensityMul ? effCfg : { ...effCfg, intensityMul: runMul };
    this.world.reset(window.innerWidth, window.innerHeight);
    // §casual-softening — push the mode's difficulty scalars onto the world (default 1 for
    // every other mode). bulletSpeedScale is read in spawnBullet; fireCadenceMul at enemy/
    // boss fire-cadence resets. enemySpeedScale is read at the chaff spawn site (spawnWave).
    this.world.bulletSpeedScale = cfg.bulletSpeedScale ?? 1;
    this.world.fireCadenceMul = cfg.fireCadenceMul ?? 1;
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
    // ARMOR shields for the run (v6 §7) — the derived stat (Heat strips it), then the selected
    // mode's rules: NIGHTMARE sudden death strips the cushion to 0, CASUAL grants its fat
    // accessibility cushion on top (rng-free, never touches the seeded stream — an off-board mode,
    // so the extra shields can't game the boards). runShields is the SAME helper the loadout
    // preview uses, so the ARMOR pips a player sees on the title can't drift from the run.
    const startShields = runShields(this.world.stats.baseShields, this.mode.rules);
    this.world.player.shields = startShields;
    this.world.player.maxShields = startShields;
    this.applySettings(this.settings);
    this.director.configure(runCfg);
    this.winning = false;
    this.victoryBanked = false;
    this.biomeIndex = -1;
    this.milestoneWave = 0; // re-arm the ENDLESS milestone callout edge for the new run
    this.setBiome(0, false); // first biome, no banner at run start
    // clear any lingering juice/input state so a run never starts frozen,
    // mid-slow-mo, mid-charge-tone, or auto-charging from a held key
    this.scheduler.reset();
    this.shake.reset();
    this.juice.beginFrame(); // clear any leftover per-frame juice claims at run start
    this.audio.endCharge();
    this.input.clearHeld();
    this.cam.leanX = this.cam.leanY = 0;
    this.cam.zoom = 1;
    this.accumulator = 0;
    this.dying = false;
    this.pendingDraft = false;
    this.interruptGate.busyTimer = 0;
    this.interruptGate.heldTime = 0;
    this.bossWarned = false;
    this.actTwoSeenKinds.clear(); // re-evaluate first-sighting reads each run (persisted gate still fires once ever)
    this.teachQueue.length = 0; this.teachCooldown = 0; // fresh teach queue per run
    this.runWokenFaces = []; this.deedCheckTimer = 0; // THE CITY SPEAKS — reset per-run deed state
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
    this.ghostRace = challenge ?? (modeSeeded(cfg) ? this.loadGhost(this.seededGhostKey(cfg, this.seed)) : null);
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
    if (cfg.seedKind === 'date') this.narrateOne('toast', agedEcho(this.seed, this.save.totalRuns)); // ECHO OF THE FALL (aged by run count)
    if (this.ghostRace) this.ui.toast(`◌ Racing ${this.ghostRace.name || 'your best'} · ${this.ghostRace.score.toLocaleString()}`);
    this.replay.start(this.canvas);

    // first-run progressive onboarding — hints surface as you perform each action.
    // Gated by the Tutorial hints toggle: a veteran who turned it off gets no first-run
    // sequence (and seenTutorial stays unset, so re-enabling hints later still teaches).
    this.firstRunGrace = 0;
    if (!this.save.seenTutorial && this.settings.tutorialHints) {
      this.save.seenTutorial = true;
      saveSave(this.save);
      this.onboarding = true;
      this.onboardStep = 0;
      // Grid B — the core verb, big and unmissable, on the very first run. A center
      // callout + a short no-fail grace (pure time gate) so they can practise the
      // dash without dying. The progressive 'start' toast still primes the sequence.
      this.ui.announce(FIRST_DASH_PROMPT, '#5beaff');
      this.firstRunGrace = ONBOARD.firstRunGrace;
      this.tryHint('start');
    } else {
      this.onboarding = false;
    }
    // C5 — teach dash-on-the-beat for the first few runs (a soft nudge, not a default flip).
    // The teaching beat-ring is part of the tutorial layer, so it honours the hints toggle too.
    const teach = beatTeachState(this.save.firstRunsBeatHint, COHERENCE.firstRunsBeatRing, COHERENCE.firstRunsBeatHintRuns);
    this.showBeatRingThisRun = teach.ring && this.settings.tutorialHints;
    this.beatHintShownThisRun = !teach.hint; // already-shown if no hint is due this run
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

  /** ACT TWO — ENQUEUE a just-in-time teach. A no-op when there's nothing to teach (already
   *  taught / queued / unknown kind) or hints are off. The teach is NOT marked taught here —
   *  only when it actually surfaces (pumpTeach), so several first-sightings in one wave don't
   *  stack: they show one at a time, spaced. Never touches world.rng. */
  private teach(hit: TeachHit | null): void {
    if (!hit || !this.settings.tutorialHints) return;
    if (this.save.taught.includes(hit.key)) return; // already shown in a prior session/run
    if (this.teachQueue.some((h) => h.key === hit.key)) return; // already waiting
    this.teachQueue.push(hit);
  }

  /** Drain the act-two teach queue ONE at a time with a gap so the toasts read as separate
   *  notes (mirrors the jargon-gloss queue). Each is marked taught + persisted only as it
   *  surfaces; an un-shown tail survives to teach next session. Called each playing frame. */
  private pumpTeach(realDt: number): void {
    if (this.teachCooldown > 0) { this.teachCooldown -= realDt; return; }
    let hit: TeachHit | undefined;
    while ((hit = this.teachQueue.shift())) { if (!this.save.taught.includes(hit.key)) break; hit = undefined; }
    if (!hit) return;
    this.save.taught.push(hit.key);
    saveSave(this.save);
    this.ui.toast(hit.text);
    this.teachCooldown = ONBOARD.teachGap;
  }

  /** ACT TWO — "Replay tutorial": clear every persisted teach flag so the whole first-run
   *  experience (sandbox + verb/enemy/boss reads + jargon glosses + dash-on-beat nudge) re-arms
   *  on the next descent. Touches only the save (never world.rng). */
  private replayTutorial(): void {
    this.save.taught = [];
    this.save.glossSeen = [];
    this.save.seenSandbox = false;
    this.save.seenTutorial = false;
    this.save.firstRunsBeatHint = 0;
    saveSave(this.save);
    this.actTwoSeenKinds.clear();
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
    this.ui.setPauseBuild(this.buildLine(), shipById(this.save.selectedShip).name, this.runHeat, {
      score: this.world.score,
      combo: this.world.combo,
      wave: this.director.wave,
      time: this.world.time,
    });
    this.ui.show('paused');
    this.audio.endCharge(); // don't let the charge tone drone through the menu
    this.audio.duckMusic(true);
  }

  private toTitle(): void {
    // §5 U2 fix — drop any latched input edges (e.g. an in-run arrow-key press) so they
    // can't fire a phantom mode-card nav on the first title frame (mirrors start()).
    this.input.clearHeld();
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
      // a genuine cash-out, not dead filler: a combo-scaled score windfall + a real
      // shard boon + a stamina top-up for breathing room. Honors scoreMul / shardMul
      // like every other economy source. Deterministic — no rng.
      w.score += Math.round(SHARDCACHE.score * comboMultiplier(w.combo) * w.stats.scoreMul);
      w.shards += Math.round(SHARDCACHE.shards * w.stats.shardMul);
      w.player.stamina = w.stats.staminaSegments * TUNE.stamina.perSegment;
      this.ui.toast(`SHARD CACHE BANKED`);
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
    this.checkCityDeeds(); // DAYBREAK fires stargazer deed
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
    // chunk a boss too (a fair reward, not a oneshot) — but route through the SAME
    // armor/intangibility gate the spear uses (spearBlocked), so the nova can never
    // drift from the dash: it respects the Sovereign's armor, a ring-cipher lock AND
    // THE HOLLOW's intangibility (it only bites during a Clone Sync window).
    if (w.bossAlive && w.boss && !this.spearBlocked(w.boss)) this.damageEnemy(w.boss, OVERDRIVE.novaDmg * 0.05 + 2, true);
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
    this.eventChoices = rollEventChoices(id, this.world.eventRng, this.world);
    this.state = 'event';
    this.ui.showEvent(def.name, def.flavor, def.accent, this.eventChoices, glyphArt(def.id));
    this.audio.duckMusic(true);
    this.renderer.flash(def.accent, 0.14);
  }

  private pickEvent(i: number): void {
    if (this.state === 'victory') { this.pickVictory(i); return; } // the victory choice reuses the event modal
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
    this.applyShipSkin(); // the newly-selected ship wears its own equipped skin
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
    if (!canUnlockTheme(theme, this.save.shards, this.save.achievements)) {
      this.ui.toast(theme.unlockAch ? 'Decrypt everything to unlock DECRYPTED' : `Need ${theme.unlockShards - this.save.shards} more shards`);
      return;
    }
    if (!theme.unlockAch) this.save.shards -= theme.unlockShards; // achievement themes are free
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

  /** Equip an owned ship-skin set ('none' = the plain hull). Re-validated so a stale click /
   *  hand-edit can never persist an unowned id. Cosmetic. */
  /** Equip a skin for ONE ship ('none' = the plain hull). Re-validated: the ship must be owned and
   *  the skin acquired (or 'none'); a stale click / hand-edit can never persist an unowned combo. */
  private selectShipSkin(shipId: string, setId: string): void {
    if (!this.save.unlockedShips.includes(shipId)) return;
    if (setId !== 'none' && !this.save.unlockedShipSkins.includes(`${shipId}:${setId}`)) return;
    if (setId === 'none') delete this.save.selectedShipSkins[shipId];
    else this.save.selectedShipSkins[shipId] = setId;
    saveSave(this.save);
    this.applyShipSkin();
    this.ui.refreshTitle(this.save);
  }

  /** Buy / unlock a skin for ONE specific ship — individual, never a bundle. The ship must be
   *  owned first; then shard sets spend shards at their threshold and achievement sets (FIRST
   *  LIGHT, the Sovereign kill) are free once earned. On success the skin is equipped on that ship. */
  private unlockShipSkin(shipId: string, setId: string): void {
    if (!this.save.unlockedShips.includes(shipId)) {
      this.ui.toast('Acquire the ship first');
      return;
    }
    const skin = shipSkinById(setId);
    const key = `${shipId}:${setId}`;
    if (!skin || this.save.unlockedShipSkins.includes(key)) return;
    if (!canUnlockShipSkin(skin, this.save.shards, this.save.achievements)) {
      this.ui.toast(skin.unlockAch ? 'Defeat the Sovereign to unlock FIRST LIGHT' : `Need ${skin.unlockShards - this.save.shards} more shards`);
      return;
    }
    if (!skin.unlockAch) this.save.shards -= skin.unlockShards; // achievement skins are free
    this.save.unlockedShipSkins.push(key);
    this.save.selectedShipSkins[shipId] = setId;
    saveSave(this.save);
    this.applyShipSkin();
    this.ui.toast(`${skin.name} skin unlocked!`);
    this.ui.refreshTitle(this.save);
  }

  /** Equip a ported enemy skin for a kind. Cosmetic; only equips an UNLOCKED skin
   *  of that kind (the picker already restricts to unlocked, but we re-validate so
   *  a stale click / hand-edit can never persist a locked id). */
  private selectSkin(kind: string, id: string): void {
    const def = skinById(id);
    if (!def || def.kind !== kind) return;
    if (!canUnlockSkin(def, this.save.achievements)) return;
    this.save.selectedSkins[kind] = id;
    saveSave(this.save);
    this.applySkins();
    this.ui.refreshTitle(this.save);
  }

  /** "Unlock" a skin from the picker. Skins are achievement-gated (earned in play),
   *  so this is really "equip if the achievement is held, else explain the gate." */
  private unlockSkin(kind: string, id: string): void {
    const def = skinById(id);
    if (!def || def.kind !== kind) return;
    if (!canUnlockSkin(def, this.save.achievements)) {
      this.ui.toast(skinLockToast(def));
      return;
    }
    this.selectSkin(kind, id);
    this.ui.toast(`${def.name} skin equipped!`);
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

  private selectMode(id: string): void {
    this.save.selectedMode = modeById(id).id; // normalize/reject junk ids
    saveSave(this.save);
    this.ui.refreshTitle(this.save);
  }

  private setHandle(name: string): void {
    this.save.handle = sanitizeHandle(name); // shared sanitizer: trims BEFORE the 16-cap (playtest fix)
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

  /** "THE HOLLOW ×4" — the boss you've fallen to most (debrief flavor). Needs ≥2
   *  losses (a nemesis is one you keep losing to); '' otherwise, or if the leader is
   *  a stale non-boss key from a pre-fix save. */
  private nemesisLine(): string {
    const nem = nemesisOf(this.save.nemesis);
    if (!nem || nem.count < 2 || !isBossKind(nem.kind)) return '';
    return `${bossName(nem.kind as EnemyKind)} ×${nem.count}`;
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

  /** The shareable run's metadata (score + seed + daily) — burned into the GIF watermark +
   *  used as the caption. Shared by the auto-preview encode and the SEND THE ECHO button so
   *  both hit the SAME deduped encode. Cosmetic/IO only — no world.rng. */
  private shareMeta(): ShareMeta {
    return {
      score: this.world.score,
      seed: this.seed,
      daily: this.mode.id === 'daily' || this.mode.seedKind === 'date',
    };
  }

  /** Encode the buffered replay into a BRANDED, watermarked GIF and open the
   *  in-page share/copy/download preview. Cosmetic/IO only — no world.rng. */
  private shareReplay(): void {
    const meta: ShareMeta = this.shareMeta();
    this.ui.beginShareReplay();
    void this.replay
      .encodeShare(meta)
      .then((gif) => {
        if (gif) this.ui.showSharePreview(gif);
        else this.ui.failShareReplay();
      })
      .catch(() => this.ui.failShareReplay());
  }

  // ── main loop ──
  private frame(now: number): void {
    let realDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    // Guard the clock: a NaN / backward / non-advancing timestamp (tab refocus,
    // a flaky performance.now(), or a synthetic-timestamp harness) must spend NO
    // time this frame — never NaN. An un-clamped NaN here poisons realDt → the
    // coherence dial (tickCoherence) → drawVignette's gradient stop, hard-crashing
    // the whole render. `!(realDt > 0)` catches NaN and ≤0 alike.
    if (!(realDt > 0)) realDt = 0;
    else if (realDt > 0.1) realDt = 0.1; // clamp huge gaps to one big step

    // §1.2 — the no-fail sandbox runs its own self-contained frame against a throwaway
    // world (input is polled against the SANDBOX player), then renders + returns early.
    // It never advances this.world / the seeded sim, so determinism is structurally safe.
    if (this.state === 'sandbox') {
      const sp = this.sandboxWorld?.player;
      this.input.poll(sp ? sp.x : 0, sp ? sp.y : 0);
      // SKIP on ESC / P (the pause keys — the universal "get me out") so the teach is
      // always escapable. The dash keys (Space/J/click) drive the LESSON, so they must
      // NOT skip — we deliberately do not treat the start edge as a skip here. The
      // explicit on-screen SKIP button (onSkipSandbox) covers pointer-only players.
      if (this.input.state.pausePressed) { this.finishSandbox(); requestAnimationFrame((t) => this.frame(t)); return; }
      this.input.consumeStart(); // clear the start edge so it can't leak into the real run
      this.input.consumeConfirm();
      this.shake.update(realDt);
      this.updateCamera(realDt);
      this.stepSandboxFrame(realDt);
      requestAnimationFrame((t) => this.frame(t));
      return;
    }

    if (this.state === 'playing') this.adaptPerf(realDt);

    this.input.poll(this.world.player.x, this.world.player.y);
    if (this.mobile) {
      // "controlling" = the player is actually flying the ship this frame: playing AND no modal
      // pending (perk draft / run event). Hidden otherwise so menu/modal DOM stays tappable.
      const controlling = this.state === 'playing' && !this.pendingDraft && this.pendingEvent === null;
      this.mobile.setActive(controlling);
      if (controlling) {
        const strong = this.mobile.applyTo(this.input.state, this.world.player.x, this.world.player.y, this.world.enemies);
        if (strong) this.runUsedStrongAssist = true;
      }
    }
    this.handleMeta();

    // re-arm the per-frame juice budget BEFORE the sim substeps emit their effects,
    // so overlapping big events this frame collapse into one CLEAN read (not noise).
    this.juice.beginFrame();
    this.shake.update(realDt);

    if (this.state === 'playing') {
      // Hold a queued perk-draft / run-event modal while the player is mid-charge or
      // mid-dash (plus a short settle grace) so a committed dash is never interrupted.
      // The director is frozen while a popup is pending (see step()), so this hold shifts
      // no seeded schedule — the Daily stays bit-identical. Ticked once per real frame.
      const dashBusy = this.world.player.phase !== 'idle';
      const popupPending = this.pendingDraft || this.pendingEvent !== null;
      const mayOpenPopup = tickInterruptGate(this.interruptGate, dashBusy, popupPending, realDt);
      const simDt = this.scheduler.update(realDt);
      this.accumulator += simDt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
        this.step(FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps++;
        // Stop substepping only once a queued popup will actually open THIS frame, so no
        // extra sim runs before the modal appears. While it's merely HELD (dash in flight)
        // keep substepping at full rate — the director is frozen, so nothing spawns anyway.
        if (mayOpenPopup && (this.pendingDraft || this.pendingEvent) && !this.dying && !this.winning) break;
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

      // THE CITY SPEAKS — per-second deed check for time/wave deeds (throttled, cosmetic)
      if (!this.dying && !this.winning) {
        this.deedCheckTimer -= realDt;
        if (this.deedCheckTimer <= 0) { this.deedCheckTimer = 1; this.checkCityDeeds(); }
      }

      // THE CITY SPEAKS — biome inhabit beats: mid-biome (~30s) teach + late-biome (~60s) nears
      if (!this.dying && !this.winning && this.biomeIndex >= 0) {
        const inBiome = this.world.time - this.biomeEntryTime;
        if (!this.biomeBeatFired && inBiome >= 30) {
          this.biomeBeatFired = true;
          this.narrate('biome_beat', 'toast', NARRATOR.biomeBeat[this.biomeIndex], true);
        }
        if (!this.biomeLateFired && inBiome >= 60) {
          this.biomeLateFired = true;
          this.narrate('biome_late', 'toast', NARRATOR.biomeLate[this.biomeIndex], true);
        }
      }

      if (this.dying) {
        this.dyingTimer -= realDt;
        // a death AFTER banking the Sovereign victory (dying while ASCENDing) still counts as a win
        if (this.dyingTimer <= 0) this.finishGameOver(this.victoryBanked);
      }
      if (this.winning) {
        this.winTimer -= realDt;
        if (this.winTimer <= 0) this.finishGameOver(true);
      }
      // Open a queued popup only once the dash has settled (mayOpenPopup) — never on top
      // of a committed charge/dash. The director is frozen while pending, so deferring it a
      // few frames spawns nothing in the gap (incl. the Boss Rush inter-boss boss).
      if (mayOpenPopup && this.pendingDraft && !this.dying && !this.winning) {
        this.pendingDraft = false;
        this.openDraft();
      } else if (mayOpenPopup && this.pendingEvent && !this.dying && !this.winning && this.state === 'playing') {
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
      // pass the current time scale so a dash that LOOKS on-beat during slow-mo grades on-beat
      // (playtest: slow-mo broke the rhythm) — the window widens by 1/timeScale while slowed
      const grade = gradeRelease(this.beat.beatError(), this.beat.synced, this.scheduler.timeScale);
      this.lastDashOnBeat = grade !== 'off'; // latch for on-beat boss teeth (core chunk / echo window)
      if (grade !== 'off') {
        const perfect = grade === 'perfect';
        coherenceBeatKick(this.coherence, perfect);
        coherenceBeatFlash(this.coherence, perfect); // C1 — localized beat ring (both grades)
        // C1 — legible LOCALIZED beat cue. floatText is determinism-safe (no rng); use
        // this.world directly (cw isn't assigned until below this block).
        this.world.particles.floatText(this.world.player.x, this.world.player.y - 34, perfect ? 'PERFECT' : 'ON BEAT', perfect ? '#fde047' : '#67e8f9', perfect ? 0.95 : 0.75);
        if (!this.settings.reduceFlashing) this.ui.flashBeatPip(perfect);
        // ACT TWO — the COHERENCE / on-beat teach fires ONCE EVER (persisted) the first time
        // an action lands on the beat; it takes precedence over the per-run BEAT_HINT_TEXT
        // nudge so the two never stack. Both are suppressed when tutorial hints are off.
        if (this.settings.tutorialHints) {
          const coh = verbTeachFor('onBeatAction', this.save.taught);
          if (coh) {
            this.teach(coh);
            this.beatHintShownThisRun = true; // the richer line stands in for this run's nudge
          } else if (!this.beatHintShownThisRun) {
            this.beatHintShownThisRun = true;
            this.ui.toast(BEAT_HINT_TEXT); // C5 — one-time nudge: you just hit the beat
          }
        }
      }
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
    const prevCoherence = this.coherence.value;
    tickCoherence(this.coherence, realDt);
    // C2/C3 — the dial's own-threshold transients: a dead chain FALLS (a wash lurch + the
    // city forgetting), a rebuild lights it back. Edge-triggered, cosmetic, own narrator
    // rng — never the seeded sim. The ambient cooldown gate keeps it restrained.
    if (this.state === 'playing') {
      const edges = coherenceEdges(prevCoherence, this.coherence.value);
      if (edges.collapsed) {
        this.coherence.collapseDip = 1;
        this.narrate('coherence_collapse', 'toast', NARRATOR.collapse, true);
      }
      if (edges.rose) this.narrate('coherence_rise', 'toast', NARRATOR.rise, true);
    }
    // THE ONE BUS — push the eased Coherence value to sight AND sound on the SAME
    // frame with the SAME value (the audio glides smooth the per-frame writes; the
    // call no-ops when music isn't running, so the title hub stays silent-safe).
    this.renderer.setCoherence(this.coherence.value, this.coherence.focusPulse, this.coherence.beatFlash, this.coherence.collapseDip);
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

    // FIRST LIGHT — the daybreak wash ramps up smoothly over ~0.8s once a run is WON, then
    // holds for the victory cinematic (a cross-fade, so it's reduce-motion/flashing-safe).
    // FIRST LIGHT day-wash: ramps over the Arena/Boss-Rush win cinematic, and holds FULL while the
    // survival victory choice (GREET THE DAWN / KEEP GOING) is up — the city stays bright behind it.
    const flT = this.winning ? Math.min(1, (2.4 - this.winTimer) / 0.8) : this.state === 'victory' ? 1 : 0;
    this.renderer.render(this.world, this.cam, {
      reduceFlashing: this.settings.reduceFlashing,
      colorblind: this.settings.colorblind,
      combo: this.world.combo,
      caScale: this.settings.chromAberration,
      reduceMotion: this.settings.reduceMotion,
      clarity: this.settings.clarity,
      beatRing: this.settings.rhythmAssist || this.showBeatRingThisRun,
      beatPhase: this.beat.beatPhase(),
      slingshot: this.settings.dashStyle === 'slingshot',
      firstLight: flT * flT * (3 - 2 * flT),
      cipherAssist: this.settings.rhythmAssist, // assist players (incl. Casual) get the next-core ring
    });
    if (this.state === 'playing') {
      this.ui.updateHud(this.world, this.world.particles.density, this.coherence.value);
      this.pumpTeach(realDt); // ACT TWO — drain the spaced contextual-teach queue
    }

    requestAnimationFrame((t) => this.frame(t));
  }

  private handleMeta(): void {
    const inp = this.input.state;
    if (this.state === 'title') {
      // §5 U2 — keyboard/gamepad mode-card nav: arrows/d-pad step, digits 1-6 jump, Start launches
      const dir = this.input.consumeMenu();
      if (dir !== 0) {
        this.ui.moveModeSelection(dir);
      } else {
        const idx = inp.selectIndex;
        // digits 1-N jump along the VISIBLE rail (not the full MODES data array), and only to
        // an UNLOCKED card — so a digit can't pick an off-rail/locked mode that would then
        // bounce to CASUAL via the title coercion, and the rail's later cards stay reachable.
        if (idx >= 0 && idx < RAIL_CARD_IDS.length) {
          const id = RAIL_CARD_IDS[idx];
          if (modeUnlocked(modeById(id), this.save.deepestWave)) this.selectMode(id);
        }
      }
      const vdir = this.input.consumeVariant();
      if (vdir !== 0) this.ui.flipVariant(vdir); // ↑/↓ flips the selected card's variant pill
      if (this.input.consumeStart()) this.descend(modeById(this.save.selectedMode)); // launch the persisted mode (parity with PLAY)
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
    } else if (this.state === 'victory') {
      // GREET THE DAWN (0) / KEEP GOING (1) — confirm defaults to GREET THE DAWN (never strand a won run)
      if (inp.selectIndex >= 0) this.pickVictory(inp.selectIndex);
      else if (this.input.consumeConfirm()) this.pickVictory(0);
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

    // Was a blocking popup ALREADY queued before this step? Captured at entry so the director
    // freeze below only applies to the HELD/defer frames — the step where a popup is first
    // queued (e.g. a dash-kill setting pendingDraft in resolveDashHits) still advances the
    // director once, exactly as before, so the Boss Rush inter-boss sequence is unchanged.
    const popupHeld = this.pendingDraft || this.pendingEvent !== null;

    // player
    resetEvents(this.ev);
    const wasCharging = w.player.phase === 'charging';
    // §4 M2 — NIGHTMARE sudden death: the safe zone shrinks per boss (pure fn of bossCount)
    w.sdInset = suddenDeathInset(this.director.bossCount, this.mode.rules);
    updatePlayer(w.player, this.input.state, dt, w.stats, w.width, w.height, this.ev, this.settings.dashStyle === 'slingshot', w.sdInset);
    this.handlePlayerEvents(wasCharging);
    // ACT TWO — HEAVY: the first time the player holds a charge all the way to full, teach
    // the overcharge thrust (hold PAST full). Reads only the player's charge state — no rng.
    if (w.player.phase === 'charging' && w.player.charge >= 1 - 1e-6) {
      this.teach(verbTeachFor('fullCharge', this.save.taught));
    }

    // Grid B — first-run no-fail grace (pure time gate). Tops up i-frames AFTER the
    // player update decrements them but BEFORE any collision check, so all existing
    // death paths (already gated on iframe<=0) stay covered without touching collision
    // code. Counts only sim time → never reads world.rng, so the Daily is untouched.
    if (this.firstRunGrace > 0) {
      this.firstRunGrace = Math.max(0, this.firstRunGrace - dt);
      w.player.iframe = Math.max(w.player.iframe, this.firstRunGrace);
    }

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
    this.resolveParry(); // PARRY second verb — deflect bullets in the aim arc (no-op unless active)

    // enemies + boss
    w.enemies.forEachActive((e) => {
      w.firingKind = e.kind; // attribute any bullets fired this update to this kind (LAST RUN dmg)
      if (e.isBoss) {
        updateBoss(e, w, dt);
        // INTEL render flag — marks this boss's tell for an early read-ring (render-only).
        // Gated !modeSeeded so Daily/Weekly stays bit-identical for everyone. Never sim.
        e.intelRead = !modeSeeded(this.mode) && bossIntel(this.save, e.kind).tellBonus > 0;
        // ENRAGE stinger: one-shot audio + a11y-gated flash the moment the boss first
        // crosses its escalation threshold — make the behavior shift FELT. Cosmetic; no rng.
        if (!e.enrageAnnounced && bossEnraged(e, bossEnrageFrac(e.kind))) {
          e.enrageAnnounced = true;
          this.audio.enrageStinger();
          this.renderer.flash(getEnrageColor(e.kind), 0.3);
        }
      } else {
        updateEnemy(e, w, dt);
        // ACT TWO — first-sighting read for a reworked/keeper enemy. The session set bounds
        // the scan to once per kind; the persisted save.taught makes the teach once-ever.
        // Cosmetic (a toast + a save write) — reads only e.kind, never touches world.rng.
        if (this.settings.tutorialHints && !this.actTwoSeenKinds.has(e.kind)) {
          this.actTwoSeenKinds.add(e.kind);
          this.teach(enemyReadFor(e.kind, this.save.taught));
        }
      }
      // soft-clamp so nobody flies off forever (24px: a hair of spawn overshoot, but inside the
      // on-screen player's reach so an enemy can never rest somewhere unhittable)
      const m = 24;
      e.x = Math.max(-m, Math.min(w.width + m, e.x));
      e.y = Math.max(-m, Math.min(w.height + m, e.y));
    });
    w.firingKind = ''; // clear the firing context so off-loop spawns aren't mis-attributed

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

    // director — FROZEN on the frames a queued popup is being HELD open (see popupHeld at step
    // entry). The popup is held until the player settles out of a dash (the interrupt gate);
    // freezing the schedule here means that hold advances NO seeded timer/draw and spawns nothing
    // in the gap — the Daily stays bit-identical and a Boss Rush boss can't appear before its
    // inter-boss draft. The step that first queues the popup is NOT frozen (popupHeld was false
    // at entry), so the director still advances once there, exactly as before.
    if (!this.dying && !this.winning && w.player.alive && !popupHeld) {
      const liveEnemies = w.enemies.activeCount - (w.bossAlive ? 1 : 0);
      // pass the live bullet count so the event calm-gate (playtest: no events during high-
      // intensity) can defer a popup when the screen is dense with fire, not just crowded.
      const dec = this.director.update(dt, liveEnemies, w.bossAlive, w.rng, w.bullets.activeCount);
      this.applyDirector(dec.spawn);
      if (dec.boss) this.spawnWarden(dec.bossKind);
      // Playtest (Nick): "boss pre-warning" — fire the anticipatory cue on the RISING edge of
      // the director's imminent-boss signal so a boss never ambushes the player. Cosmetic; the
      // signal is deterministic but the SFX draws no rng, so the Daily stays bit-identical.
      if (dec.bossWarn && !this.bossWarned) {
        this.audio.bossWarn();
        this.bossWarned = true;
      } else if (!dec.bossWarn) {
        this.bossWarned = false;
      }
      if (dec.perk) this.pendingDraft = true;
      if (dec.event && this.mode.rules?.events !== 'none') {
        // §4 M5 — curated modes (NIGHTMARE/Daily) draw from the high-risk pool; ANY pool
        // is exactly ONE eventRng draw, so the Daily wave stream stays bit-identical for all.
        this.pendingEvent = rollEventId(w.eventRng, this.mode.rules?.events === 'curated' ? CURATED_IDS : undefined);
      }
      if (dec.win) this.winRun();
      this.checkMilestone();
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
        w.comboGrazeCharge = 0; // a fresh chain starts the graze accumulator clean (no fractional leak across breaks)
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
      haptics.dash();
      this.dashSlowmoTriggered = false;
      w.particles.streaks(p.x, p.y, p.dashDirX, p.dashDirY, trailParticleColor(this.trail, comboColor(w.combo)));
      this.cam.zoom = Math.max(this.cam.zoom, 1.03);
      this.input.rumble(0.0, 0.3, 70);
      // Grid B — verb learned: once they actually dash, taper the no-fail grace to a
      // short tail (don't yank protection mid-air) and let real stakes resume.
      if (this.firstRunGrace > 0) this.firstRunGrace = Math.min(this.firstRunGrace, 0.6);
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
      // B3: a clean multi-kill dash buys grace — extend the combo window on landing.
      if (p.killsThisDash >= 2 && w.combo > 0) {
        w.comboTimer = Math.max(w.comboTimer, TUNE.combo.window + p.killsThisDash * TUNE.combo.chainWindowBonus);
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
        // shielded chaff (darter/orbiter) blocks a spear that enters its FRONTAL arc.
        // The shield tracks you, so a straight dash clangs — flank it (dash in from
        // the side/back, outside the cone) to land. lastDashId (set above) already
        // bounds this to one interaction per dash.
        if (e.shielded && shieldBlocks(e.shieldAngle, Math.atan2(ay - e.y, ax - e.x), SHIELD.arcHalf)) {
          e.hitFlash = 0.08;
          w.particles.burst(e.x, e.y, 6, '#9ff');
          w.particles.floatText(e.x, e.y - e.radius - 10, 'ARMORED', '#9ff', 0.6);
          this.audio.thunk(8, this.panFor(e.x));
          continue;
        }
        // HEAVY LANCE: a full 100% charge adds bonus damage, folded into the base before
        // the Hollow cap / Warden-rear crit (scales with a flank, but the Hollow's
        // >=2-window cap still holds — no one-shotting its intangibility).
        const base = w.stats.dashDamage + (p.dashHeavy ? TUNE.dash.heavyDamageBonus : 0);
        // sync-window dash-through is a weak-point hit (lands a satisfying chunk)
        let dmg = e.kind === 'hollow' ? base + HOLLOW.weakPointBonus : base;
        // cap per-window damage to the HOLLOW so even a max-damage stack needs ≥2 sync
        // windows — the mechanic — and can never one-shot through its intangibility.
        if (e.kind === 'hollow') dmg = Math.min(dmg, Math.max(2, Math.ceil(e.maxHp * 0.45)));
        // WARDEN rear weak-point: a dash whose APPROACH comes from its back arc crits ×3.
        // (e.facing turns toward you at a bounded rate — flank it faster than it can turn.)
        if (e.kind === 'warden' && e.facing !== undefined && withinArc(e.facing + Math.PI, Math.atan2(ay - e.y, ax - e.x), WARDEN.rearArc / 2)) {
          dmg *= WARDEN.rearMultiplier;
          w.particles.floatText(e.x, e.y - e.radius - 12, 'WEAK POINT', '#fde047', 0.95);
          w.particles.burst(e.x, e.y, 18, '#fde047');
          this.shake.add(0.25);
          this.audio.thunk(60, this.panFor(e.x));
        }
        this.damageEnemy(e, dmg, true);
      }
    }
    // CIPHER-LOCK: key ONE core per dash — the first the spear reaches (nearest the
    // dash origin), so a wide hitbox can't mis-key and unfairly re-lock the cipher.
    if (cipherBest && w.cipherKeyDashId !== p.dashId) {
      w.cipherKeyDashId = p.dashId;
      this.keyCipherCore(cipherBest);
    }
    // Riposte: shatter enemy bullets along the spear. CHAFF shots break for free;
    // BOSS shots — the actual threat — break too, but only up to a small per-dash
    // budget (it carves a lane through a boss pattern, it doesn't erase it). The
    // budget is spent nearest-first so the dash clears the shots most in your way.
    if (w.stats.dashShatterRadius > 0) {
      const br = r + w.stats.dashShatterRadius;
      let bossBudget = w.stats.dashShatterBossBudget;
      const bossHits: Bullet[] = this.riposteBossBuf;
      bossHits.length = 0;
      w.bullets.forEachActive((b) => {
        if (!segCircleHit(ax, ay, bx, by, b.x, b.y, b.radius, br)) return;
        if (b.fromBoss) {
          if (bossBudget > 0) bossHits.push(b); // defer: spend the budget nearest-first
          return;
        }
        this.breakBullet(b, 2, RIPOSTE.shatterScore);
      });
      if (bossBudget > 0 && bossHits.length > 0) {
        // nearest the dash origin first — clears the shots most in the player's path
        bossHits.sort(
          (p1, p2) =>
            (p1.x - ax) * (p1.x - ax) + (p1.y - ay) * (p1.y - ay) -
            ((p2.x - ax) * (p2.x - ax) + (p2.y - ay) * (p2.y - ay)),
        );
        for (const b of bossHits) {
          if (bossBudget <= 0) break;
          if (!b.active) continue;
          bossBudget--;
          this.breakBullet(b, 4, RIPOSTE.bossShatterScore);
        }
      }
    }
    // trigger slow-mo once per dash on big chains
    if (!this.dashSlowmoTriggered && shouldSlowmo(p.killsThisDash)) {
      this.dashSlowmoTriggered = true;
      this.scheduler.requestSlowmo(w.stats.timeThiefExtra); // scheduler debounces the window itself
      // budget the per-event STING + SHAKE SPIKE so a same-frame ERUPTION can't double them
      if (this.juice.claimSlowmoSnap()) this.audio.slowmoSnap();
      if (this.juice.claimShakeSpike())
        this.shake.add(p.killsThisDash >= 6 ? TUNE.juice.traumaChain6 : TUNE.juice.traumaChain3);
      this.cam.zoom = Math.max(this.cam.zoom, 1.05);
      if (w.stats.timeThiefStamina > 0) {
        // route Time Thief through the SAME per-dash refund budget as kill-refund so it
        // can't bypass the cap and re-open the perpetual loop (it used to add +40 flat)
        const dashCost = effectiveDashCost(w.stats.dashCostMul, w.stats.staminaSegments);
        const give = cappedRefund(w.stats.timeThiefStamina, p.refundThisDash, dashCost);
        if (give > 0) {
          const max = w.stats.staminaSegments * TUNE.stamina.perSegment;
          p.stamina = Math.min(max, p.stamina + give);
          p.refundThisDash += give;
        }
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
      // ghost obeys the same shield gate as the spear so the two can't disagree on a hit
      if (e.shielded && shieldBlocks(e.shieldAngle, Math.atan2(w.ghostY0 - e.y, w.ghostX0 - e.x), SHIELD.arcHalf)) continue;
      if (segCircleHit(w.ghostX0, w.ghostY0, w.ghostX1, w.ghostY1, e.x, e.y, e.radius, r)) {
        e.lastDashId = w.ghostDashId;
        this.damageEnemy(e, w.stats.dashDamage, true);
      }
    }
    // Afterimage also shreds CHAFF bullets crossing the lingering ghost — the
    // defensive half of the trap-perk fix. Boss bullets are immune (only Riposte
    // breaks those, on a budget), so the ghost can't trivialise a boss pattern.
    w.bullets.forEachActive((b) => {
      if (b.fromBoss) return;
      if (!segCircleHit(w.ghostX0, w.ghostY0, w.ghostX1, w.ghostY1, b.x, b.y, b.radius, r)) return;
      this.breakBullet(b, 2, 0);
    });
  }

  /** Destroy a hostile bullet — one shatter path shared by Riposte, the Afterimage ghost,
   *  and the PARRY arc (spark burst + optional score + release). */
  private breakBullet(b: Bullet, sparks: number, score: number): void {
    const w = this.world;
    w.particles.burst(b.x, b.y, sparks, b.color);
    if (score) w.score += score;
    w.bullets.release(b);
  }

  /** PARRY — deflect bullets in the aim arc, RIPOSTE enemies in it (a parry KILLS), pay the
   *  reward (DOUBLED on the beat), and break a boss's guard. A success FLOWS (short cooldown);
   *  an empty whiff fizzles + eats the long cooldown. Math lives in parry.ts; this orchestrates
   *  the side effects. All flash/freeze a11y-gated. */
  private resolveParry(): void {
    const w = this.world;
    const p = w.player;
    if (!p.parryActive) {
      // active window just closed with no catch → a whiff: a faint fizzle + broken streak (the
      // long cooldown was set at entry, so spamming is punished; a success shortens it).
      if (this.parryWasActive && !p.parryRewarded) { this.audio.parry(false); p.parryStreak = 0; }
      this.parryWasActive = false;
      return;
    }
    this.parryWasActive = true;
    // the EFFECTIVE arc: base + permanent meta + the TEMPORARY coherence widening (flow widens the guard)
    const arc = effectiveParryArc(this.coherence.value, w.stats.parryReach, w.stats.parryHalfAngle);
    const swept = parrySweep<Bullet>(p.x, p.y, p.angle, w.stats.dashShatterBossBudget || PARRY.bossBudget,
      (visit) => w.bullets.forEachActive(visit),
      (b) => this.breakBullet(b, b.fromBoss ? 5 : 3, RIPOSTE.shatterScore),
      arc.reach, arc.halfAngle);
    // MIRRORBLADE DUEL: a parry timed to its lunge STAGGERS it (cancel → extended RECOVER) —
    // counts as a catch even with no bullets in the arc (the lunge IS the threat parried).
    const boss = w.boss;
    const staggered =
      !!boss && boss.active && mirrorbladeStaggerable(boss)
      && parryArcContains(p.x, p.y, p.angle, boss.x, boss.y, PARRY.mirrorbladeReach, arc.halfAngle);
    if (staggered) staggerMirrorblade(boss!);
    // REFLECTABLE ORB: fling any big boss orb in the arc back at the boss (parry-as-offense)
    const reflected = this.reflectOrbsInArc(arc);
    if ((swept.total === 0 && !staggered && reflected === 0) || p.parryRewarded) return;
    p.parryRewarded = true;
    haptics.parry();
    const onBeat = gradeRelease(this.beat.beatError(), this.beat.synced, this.scheduler.timeScale) !== 'off';
    const perfect = parryGrade(p.parryElapsed, PARRY.perfectWindow + w.stats.parryPerfectWindow) === 'perfect';
    const hero = perfect && onBeat; // the apex: BOTH timing AND rhythm
    // ACT TWO — an on-beat parry also teaches the COHERENCE/on-beat loop (once ever, persisted).
    if (onBeat) this.teach(verbTeachFor('onBeatAction', this.save.taught));
    // streak: an on-beat parry builds it (capped) + feeds coherence; off-beat/whiff resets it
    p.parryStreak = parryStreakNext(p.parryStreak, onBeat, true);
    p.parryStreakTimer = PARRY.streakWindow + w.stats.parryStreakWindow;
    this.riposteArc(arc); // counter-burst enemies in the (widened) arc — chaff POP, elites chip
    applyParryReward(p, w, this.coherence, w.stats.staminaSegments, onBeat, p.parryStreak);
    p.parryCooldown = parryCooldownAfter(true); // success flows
    this.shoveBulletsNearby(); // defensive breathing-room push on the un-parried bullets
    if (swept.boss > 0 && w.boss && w.boss.active) {
      w.boss.timer = boundedGuardShave(w.boss.timer, swept.boss, PARRY.bossGuardShave, 0); // posture-break
    }
    if (staggered && boss) {
      // the duel payoff: chip the staggered duelist (DOUBLED on the beat) + a felt STAGGER pop
      this.damageEnemy(boss, MIRRORBLADE.staggerChipDamage * (onBeat ? 2 : 1), false);
      w.particles.ring(boss.x, boss.y, boss.radius + 28, '#ff8a8a', 0.4);
      w.particles.floatText(boss.x, boss.y - 44, 'STAGGER!', '#ff8a8a', 1.1);
      this.shake.add(TUNE.juice.traumaGraze * 4);
    }
    if (hero) this.heroParry(); // perfect+on-beat → mini radial chaff-clear + coherence surge + chord sting
    // JUICE — distinct metallic ting (hero chord), a flash, a freeze-frame (a11y-gated)
    this.audio.parry(onBeat, hero);
    if (!this.settings.reduceMotion) this.scheduler.requestHitstop(PARRY.freezeFrame);
    if (!this.settings.reduceFlashing) this.renderer.flash(hero ? '#ffffff' : onBeat ? '#fde047' : '#a5f3fc', hero ? 0.18 : 0.1);
    this.shake.add(TUNE.juice.traumaGraze * (hero ? 5 : 2));
    this.input.rumble(0.15, 0.3, 60);
    const label = hero ? 'PERFECT PARRY' : onBeat ? (p.parryStreak > 1 ? `PARRY ×${p.parryStreak}` : 'PARRY!') : 'parry';
    w.particles.floatText(p.x, p.y - 40, label, hero ? '#ffffff' : onBeat ? '#fde047' : '#67e8f9', hero ? 1.3 : onBeat ? 1 : 0.8);
  }

  /** RIPOSTE — counter-burst non-boss enemies inside the (effective) parry arc. Kills weak
   *  chaff (→ combo + particles) and chips elites. Bosses are handled by the guard-shave, not
   *  direct chip, so an ARMORED boss is never damaged through its guard. */
  private riposteArc(arc: { reach: number; halfAngle: number }): void {
    const w = this.world;
    const p = w.player;
    const r = arc.reach;
    w.hash.rebuild(w.enemies.items);
    w.hash.queryAABB(p.x - r, p.y - r, p.x + r, p.y + r, this.chainBuf);
    parryEnemySweep<Enemy>(
      p.x, p.y, p.angle,
      (visit) => { for (const e of this.chainBuf) if (e.active && !e.isBoss && e.kind !== 'sovereign_core') visit(e); },
      (e) => { w.particles.burst(e.x, e.y, PARRY.riposteSparks, e.color); this.damageEnemy(e, PARRY.riposteDamage, false); },
      arc.reach, arc.halfAngle,
    );
  }

  /** Fling every parryable boss ORB inside the (effective) parry arc back at the boss as a
   *  player-owned (friendly) bullet — parry-as-offense. Two passes (collect, then spawn) so we
   *  never mutate the bullet pool mid-iteration. Returns the reflect count (a parry catch). */
  private reflectOrbsInArc(arc: { reach: number; halfAngle: number }): number {
    const w = this.world;
    const p = w.player;
    const boss = w.boss;
    const orbs: Bullet[] = [];
    w.bullets.forEachActive((b) => {
      if (isReflectableOrb(b) && parryArcContains(p.x, p.y, p.angle, b.x, b.y, arc.reach, arc.halfAngle)) orbs.push(b);
    });
    for (const b of orbs) {
      const speed = Math.hypot(b.vx, b.vy) || ORB.sovereign.speed;
      const tx = boss ? boss.x : p.x + Math.cos(p.angle) * 200;
      const ty = boss ? boss.y : p.y + Math.sin(p.angle) * 200;
      const v = reflectVelocity(b.x, b.y, tx, ty, speed);
      const fb = w.spawnBullet(b.x, b.y, v.vx, v.vy, b.radius, b.color, false);
      if (fb) fb.friendly = true; // player-owned: damages the boss, never the player
      w.bullets.release(b);
      w.particles.burst(b.x, b.y, 8, b.color);
    }
    return orbs.length;
  }

  /** HERO moment — a perfect-frame AND on-beat parry: a mini radial CHAFF bullet-clear (boss
   *  patterns stay lethal), a coherence surge, and a slow-mo flourish. Rare + earned. a11y-gated. */
  private heroParry(): void {
    const w = this.world;
    const p = w.player;
    const r2 = PARRY.heroClearRadius * PARRY.heroClearRadius;
    w.bullets.forEachActive((b) => {
      if (b.fromBoss) return;
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      if (dx * dx + dy * dy < r2) this.breakBullet(b, 1, 0);
    });
    this.coherence.value = Math.min(1, this.coherence.value + PARRY.heroCohSurge);
    w.particles.ring(p.x, p.y, PARRY.heroClearRadius, '#ffffff', 0.5);
    if (!this.settings.reduceMotion) this.scheduler.requestSlowmo(0);
    this.ui.announce('PERFECT PARRY', '#fde047');
  }

  /** Defensive shove — nudge the remaining (un-parried) bullets near the player outward a
   *  little on a successful parry. Deterministic (pure player→bullet direction). */
  private shoveBulletsNearby(): void {
    const w = this.world;
    const p = w.player;
    w.bullets.forEachActive((b) => {
      const s = parryShove(p.x, p.y, b.x, b.y, PARRY.shovePush, PARRY.shoveRadius);
      b.vx += s.dvx;
      b.vy += s.dvy;
    });
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
    // DECRYPTION INTEL — +damage vs a boss whose transmission you've decrypted. Non-seeded only
    // (seeded Daily/Weekly untouched). No rng → determinism preserved.
    if (e.isBoss && !modeSeeded(this.mode)) {
      const intel = bossIntel(this.save, e.kind);
      if (intel.damageBonus) dmg *= 1 + intel.damageBonus;
    }
    e.hp -= dmg;
    e.hitFlash = 0.1;
    if (e.hp > 0) {
      if (fromDash) {
        this.shake.add(0.04);
        // impact spark — feedback that the spear bit a tanky/elite enemy
        this.world.particles.burst(e.x, e.y, e.elite ? 8 : 5, e.elite ? ELITE.aura : '#ffffff');
        // B4: chipping a boss/tanky enemy with the spear sustains the combo (refresh only, no increment).
        if (this.world.combo > 0)
          this.world.comboTimer = Math.max(this.world.comboTimer, TUNE.combo.bossSustainWindow);
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
    w.killsByKind[e.kind] = (w.killsByKind[e.kind] ?? 0) + 1; // CODEX per-kind tally (no rng)
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

    // Siphon: dash-kills refund stamina — but CAPPED to one dash's cost per dash, a
    // budget SHARED with Time Thief (above), so a chain/AoE spree + Time Thief can't
    // refund past a single dash and sustain the near-infinite-dash loop. A good chain
    // refills ONE dash; it can never bank surplus to dash across an empty arena.
    if (fromDash && w.stats.killStaminaRefund > 0) {
      const p = w.player;
      const dashCost = effectiveDashCost(w.stats.dashCostMul, w.stats.staminaSegments);
      const give = cappedRefund(w.stats.killStaminaRefund, p.refundThisDash, dashCost);
      if (give > 0) {
        const max = w.stats.staminaSegments * TUNE.stamina.perSegment;
        p.stamina = Math.min(max, p.stamina + give);
        p.refundThisDash += give;
      }
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
      w.firingKind = e.kind; // attribute the elite's death-burst (LAST RUN dmg)
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        w.spawnBullet(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 6, ELITE.aura, false);
      }
    }

    // death effects
    if (e.kind === 'splitter') {
      // fromDash = a SWEEP kill (dash/heavy) → CLEAN, no minis. A non-sweep kill
      // (parry-riposte / graze-burn / AoE all call damageEnemy(..., false)) SHATTERS
      // it into the combo-shower. The kill method is the whole mechanic (§SPLITTER).
      splitInto(e, w, fromDash);
    } else if (e.kind === 'bomber') {
      const n = BOMBER.detonateCount;
      const sp = BOMBER.bulletSpeed * e.bulletMul;
      const off = w.dropRng.range(0, Math.PI * 2); // death-timed: keep off the seeded director stream
      w.firingKind = e.kind; // attribute the bomber's detonation (LAST RUN dmg)
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        w.spawnBullet(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 6, '#fb7185', false);
      }
      this.audio.explosion(0.8, this.panFor(x));
      w.particles.ring(x, y, 90, '#fb7185', 0.35);
      this.shake.add(0.16);
    } else if (e.kind === 'hollow_echo') {
      // hunting an echo DESTABILISES the Hollow — EARN its vulnerability window now
      // (replaces the old passive "wait for white"). An ON-BEAT echo-kill earns a LONGER
      // window (the beat's teeth on the hunt). No new world.rng draw.
      if (w.boss && w.boss.kind === 'hollow') openHollowWindowWithBeat(w.boss, fromDash && this.lastDashOnBeat);
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
    w.killsByKind[e.kind] = (w.killsByKind[e.kind] ?? 0) + 1; // CODEX per-kind tally (no rng)
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
    // weak-point chunk to the crown (may kill it → bossDeath cleans up the rest).
    // ON-BEAT teeth: a core shattered on the beat deals DOUBLE the crown chunk.
    this.damageEnemy(boss, sovereignCoreBonusForBeat(fromDash && this.lastDashOnBeat), true);
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
   *  order. A correct key advances (rising pitch); a wrong key is a FORGIVING
   *  no-op — progress is KEPT (just a soft "not that one" tick, no reset/punish;
   *  it's a bullet-hell, one mis-dash mustn't undo the solve). Solving cracks
   *  the crown. (The cipher only RE-ARMS a fresh code when an expose window
   *  closes — see boss.ts — never on a wrong key.) */
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
    // a generic RING-cipher boss: cracking the code lands a real CHUNK (so it's a
    // few satisfying cracks, not many) and opens a longer window for bonus dashes.
    for (const core of cores) if (core.active) this.shatterCore(core, true); // ring reward (non-sovereign → early return)
    if (boss && boss.active) {
      w.particles.floatText(boss.x, boss.y - boss.radius - 16, 'CIPHER BROKEN', '#fde047', 1.4);
      boss.cipherExposed = CIPHER.exposeDuration;
      this.ui.announce('EXPOSED', '#fde047');
      this.audio.bossStinger();
      this.shake.add(0.5);
      // the crack itself bites — HP-proportional so it's ~2-3 cracks for any ring boss
      this.damageEnemy(boss, Math.max(1, Math.round(boss.maxHp * CIPHER.crackDamageFrac)), true);
    }
    w.cipher = null; // re-armed by updateBoss when the expose window closes
  }

  /** Fire an arcade announcement when the combo crosses a new milestone tier. */
  private checkComboTier(): void {
    const w = this.world;
    const t = crossedComboTier(w.combo, w.lastTierAnnounced);
    if (t) {
      w.lastTierAnnounced = t.at;
      this.ui.announce(`${t.name}  ×${w.combo}`, t.color);
      this.narrateOne('toast', comboTierCityLine(t.at, this.save) ?? NARRATOR.comboTier[t.at]);
      this.shake.add(0.18);
      this.renderer.flash(t.color, 0.12);
      this.audio.pickup(14);
      this.checkCityDeeds(); // combo milestone may wake lamplighter / candlemaker
    }
    // COMBO ERUPTION — a big-combo milestone detonates a bullet-clearing nova
    const m = eruptMilestone(w.combo, w.clutch.lastErupt);
    if (m > 0) {
      w.clutch.lastErupt = m;
      this.comboErupt(m);
    }
  }

  /** THE CITY SPEAKS — evaluate in-run deeds against current World state; wake any newly-met
   *  citizen (persist + surface the dosed beat). Pure-derived; no world.rng. Called at deed
   *  moments (boss kill, combo tier, overdrive, wave/time ticks). Idempotent via citizenDeeds. */
  private checkCityDeeds(): void {
    const w = this.world;
    const ctx = {
      bossKindsKilled: Object.keys(w.killsByKind).filter((k) => BOSS_KINDS.has(k)),
      sovereignDown: w.sovereignDown,
      bestCombo: w.bestComboRun,
      bossKills: w.bossKills,
      daybreaks: w.overdriveUses,
      maxDashChain: w.maxDashChain,
      timeSec: w.time,
      wave: this.director.wave,
    };
    let woke = false;
    for (const id of deedsMet(ctx)) {
      if (this.save.citizenDeeds.includes(id)) continue; // already woken
      this.save.citizenDeeds.push(id);
      this.runWokenFaces.push(id);
      woke = true;
      const c = CITIZENS.find((x) => x.id === id);
      if (!c) continue;
      if (wakeIsCeremony(id) && w.clutch.lastBreathActive <= 0) {
        this.audio.transmissionChord(); // soft choir chord — a signal restored moment
        this.ui.cityFaceBeat(c.name, c.confession); // ceremony for meaningful wakes; falls back to a toast if mid-clutch (not replayed)
      } else {
        this.narrate('city_wake', 'toast', [`A face remembered — ${c.name}.`], false);
      }
    }
    if (woke) saveSave(this.save);
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
    // juice — reuse the screen-space nova ring (cyan) + ring/burst + slow-mo blip.
    // The LOCALIZED feedback (ring/burst/float/announce/rumble) always fires; the
    // SCREEN-WIDE channels (flash+nova, shake spike, slow-mo snap) go through the
    // per-frame budget so a same-frame dash-chain slow-mo can't double them into
    // a washed-out, stuttering jolt — a big chain reads as ONE clean detonation.
    w.particles.ring(p.x, p.y, CLUTCH.eruptClearRadius, '#22d3ee', 0.55);
    w.particles.burst(p.x, p.y, 60, '#a5f3fc');
    w.particles.floatText(p.x, p.y - 40, `ERUPTION +${bonus}`, '#67e8f9', 1.2);
    if (this.juice.claimBigFlash()) {
      this.renderer.flash('#22d3ee', 0.22);
      this.renderer.startOverdriveNova('#22d3ee');
    }
    this.scheduler.requestSlowmo(CLUTCH.eruptSlowmoHold); // scheduler debounces the window itself
    if (this.juice.claimShakeSpike()) this.shake.add(0.5);
    if (this.juice.claimSlowmoSnap()) this.audio.comboErupt();
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
    const isSovereignKill = e.kind === 'sovereign';
    const bonus = 500 * Math.max(1, e.bossWave);
    // honor scoreMul like every other score source — boss kills are the dominant
    // score in Boss Rush, so omitting it silently neutered ZEALOT/HOARDER relics,
    // Heat, meta Scavenger and the OVERDRIVE powerup on the biggest payout.
    w.score += Math.round(bonus * comboMultiplier(w.combo) * w.stats.scoreMul);
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
    w.killsByKind[e.kind] = (w.killsByKind[e.kind] ?? 0) + 1; // CODEX per-boss "vanquished" tally (no rng)
    if (e.kind === 'hollow') cleanupHollowEchoes(w); // clear lingering echo clones
    if (e.kind === 'sovereign') {
      cleanupSovereignCores(w); // clear orbiting cores
      w.sovereignDown = true;
    }
    if (bossUsesRingCipher(e.kind)) cleanupSovereignCores(w); // clear any generic ring cores + the cipher
    w.enemies.release(e);
    w.bossAlive = false;
    w.boss = null;
    // THE CITY SPEAKS — boss kill wakes the figure-tied citizen + descent foreshadow
    this.checkCityDeeds();
    if (w.bossKills === 2 || w.bossKills === 3) this.narrate('descent', 'toast', NARRATOR.descent, false);
    // ARMOR regen (v6 §7) — clearing a boss restores one shield (capped at max)
    if (w.player.maxShields > 0 && w.player.shields < w.player.maxShields) {
      w.player.shields = regenShield(w.player.shields, w.player.maxShields);
      w.particles.floatText(w.player.x, w.player.y - 30, '+1 ARMOR', '#5beaff', 0.9);
    }
    this.pendingDraft = true; // guaranteed perk after a boss
    // THE LONGEST DAY — in a SURVIVAL mode, downing the Sovereign IS the victory (Arena/Boss
    // Rush win via their finite script on the next director tick, so they're excluded here).
    // Fired last, after the boss is released + the board settled. Banks the win, then offers
    // GREET THE DAWN (end) vs KEEP GOING (ASCEND). inChallenge runs get the beat but no progression.
    if (isSovereignKill && !this.mode.arena && !this.mode.bossrush) this.sovereignVictory();
  }

  /** THE LONGEST DAY (survival) — the Sovereign fell: bank the win, play the DAYBREAK beat +
   *  pay THE LONGEST DAY bonus, then PAUSE on the GREET THE DAWN / KEEP GOING choice. The win is
   *  banked up front, so it counts even if the player later dies ASCENDing. (Arena/Boss Rush keep
   *  their finite-script winRun path.) Cosmetic juice only — no world.rng touched. */
  private sovereignVictory(): void {
    if (this.winning || this.state === 'victory') return;
    const w = this.world;
    this.victoryBanked = true;
    // first kill of the run sets the clear time (used by the bonus + records)
    if (w.ascension === 0) w.clearTime = w.time;
    w.score += longestDayBonus(w.clearTime, w.hitsTaken, w.ascension, w.stats.scoreMul);
    // DAYBREAK beat — the city blooms fully alive (the FIRST LIGHT day-wash is driven separately
    // by the win cinematic; here we pop COHERENCE + the screen juice + the reverent callout).
    this.pendingDraft = false;
    this.pendingEvent = null;
    w.player.iframe = 999;
    w.bullets.clear();
    w.enemies.clear();
    coherenceBeatKick(this.coherence, true);
    this.scheduler.requestSlowmo(TUNE.victory.slowmo);
    this.renderer.flash('#fde047', TUNE.victory.flash);
    this.shake.add(0.7);
    this.cam.zoom = Math.max(this.cam.zoom, 1.12);
    this.audio.bossStinger();
    this.input.rumble(0.6, 0.8, 320);
    const cx = w.width / 2, cy = w.height / 2, big = Math.max(w.width, w.height);
    w.particles.ring(cx, cy, big * 0.6, '#fde047', 0.9);
    w.particles.ring(cx, cy, big * 0.4, '#ffffff', 0.6);
    this.ui.announce('THE LONGEST DAY IS WON', '#fde047');
    this.narrate('daybreak', 'toast', NARRATOR.daybreak);
    this.openVictoryChoice();
  }

  /** Pause on the post-victory choice. Reuses the EVENT modal (pickEvent routes here while the
   *  game state is 'victory'). GREET THE DAWN ends the run; KEEP GOING ascends. */
  private openVictoryChoice(): void {
    this.state = 'victory';
    const asc = this.world.ascension;
    const greet = { id: 'greet', name: 'GREET THE DAWN', desc: 'Rest in the light — end the run on this victory.', accent: '#fde047', risk: 'none' as const, resolve: () => {} };
    const keep = { id: 'keep', name: 'KEEP GOING', desc: `The day is won — but the night still comes. Ascend (×${(asc + 1)}) for the score.`, accent: '#a78bfa', risk: 'high' as const, resolve: () => {} };
    this.ui.showEvent('THE LONGEST DAY IS WON', 'The crown is bare and the city is bright. Stay in the dawn, or press on into the dark?', '#fde047', [greet, keep]);
    this.audio.duckMusic(true);
  }

  /** Resolve the GREET THE DAWN / KEEP GOING choice. i===1 (KEEP GOING) ascends; else ends. */
  private pickVictory(i: number): void {
    if (this.state !== 'victory') return;
    this.audio.duckMusic(false);
    if (i === 1) this.ascend();
    else this.finishGameOver(true); // GREET THE DAWN — bank the victory + debrief
  }

  /** KEEP GOING — continue the run into a harder loop. A fixed, deterministic difficulty ramp +
   *  escalating score multiplier; the boss cycle resumes (the Sovereign reforms harder). The
   *  banked win stands. No world.rng touched (the ramp is a pure multiplier on the spawn bound). */
  private ascend(): void {
    const w = this.world;
    const v = TUNE.victory;
    w.ascension = Math.min(v.ascendMaxLoop * 4, w.ascension + 1); // record loops (cap far above the intensity cap)
    this.director.ascensionMul = 1 + Math.min(w.ascension, v.ascendMaxLoop) * v.ascendIntensityPerLoop;
    w.stats.scoreMul *= 1 + v.ascendScorePerLoop; // risk pays — escalating score
    w.player.iframe = 1.2; // a breath of grace as play resumes (the victory pause set it to 999)
    this.state = 'playing';
    this.ui.show('playing');
    this.ui.announce(`ASCENSION ×${w.ascension}`, '#a78bfa');
  }

  private updateBullets(dt: number): void {
    const w = this.world;
    const p = w.player;
    const grazeR = w.stats.grazeRadius;
    const hitR = p.radius;
    // ACT TWO — PARRY (contextual fallback): the first incoming shot the player could deflect
    // teaches the parry, IF the sandbox didn't already (shared key `verb:parry`). The flag is
    // computed once and short-circuits the moment parry is taught, so the hot loop pays nothing
    // afterward. Cosmetic; reads positions only (no rng).
    const teachParry = this.settings.tutorialHints && p.alive && !this.save.taught.includes('verb:parry');
    const parryTeachR2 = teachParry ? (w.stats.parryReach + 40) * (w.stats.parryReach + 40) : 0;
    // BIOME RULE (THE EMBERWALL) — accelerate every live bullet along its heading.
    // Per-frame speed boost: scale the velocity so its magnitude grows by accel*dt
    // while the direction is preserved. Deterministic (no rng); affects sim + render
    // identically. ratio guards a near-zero (parked mine) bullet from a divide blowup.
    const accel = this.biomeBulletAccel;
    // THE SOVEREIGN warps space: its bullets curve toward the crown (galaxy arms).
    // Math inlined (kept identical to the pure gravityPull, which the tests cover)
    // so the hottest loop in the game stays allocation-free.
    const sov = w.boss && w.boss.kind === 'sovereign' ? w.boss : null;
    w.bullets.forEachActive((b) => {
      if (sov && (b.fromBoss || b.friendly)) { // friendly reflected orbs curve under the well too
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
      // THE EMBERWALL — bullets speed up along their heading (parked mines, sp≈0, stay put)
      if (accel > 0) {
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 1) {
          const ratio = (sp + accel * dt) / sp;
          b.vx *= ratio;
          b.vy *= ratio;
        }
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
      // FRIENDLY reflected orb: damages the BOSS (if not armored), never the player
      if (b.friendly) {
        const tb = w.boss;
        if (tb && tb.active && !this.spearBlocked(tb)) {
          const bdx = tb.x - b.x;
          const bdy = tb.y - b.y;
          const rr = tb.radius + b.radius;
          if (bdx * bdx + bdy * bdy <= rr * rr) {
            this.damageEnemy(tb, ORB.reflectDamage, false);
            w.particles.burst(b.x, b.y, 14, b.color);
            w.particles.floatText(tb.x, tb.y - 34, 'REFLECTED', '#fbbf24', 1.1);
            w.bullets.release(b);
          }
        }
        return; // a friendly orb never hits or grazes the player
      }
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const d2 = dx * dx + dy * dy;
      // ACT TWO — a parryable shot just came within reach: teach the parry once (no-op once taught)
      if (teachParry && d2 <= parryTeachR2) this.teach(verbTeachFor('parryable', this.save.taught));
      // hit
      if (p.iframe <= 0 && d2 <= (hitR + b.radius) * (hitR + b.radius)) {
        this.playerDie(b.fromBoss ? 'a boss bullet' : 'a bullet', b.fromKind ?? '');
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
    // BIOME RULE (THE NULL) — graze DEAD-ZONE: the skill-reward economy is stripped
    // here, so a graze grants nothing (no stamina/combo/score/overdrive). We still
    // set the cooldown above so a hugging bullet can't re-poll every frame, and emit
    // a faint LOCALIZED muted spark (no flash, no shake, no rumble) so the dead-zone
    // reads on contact. Deterministic — particle is the only side effect and it is
    // purely cosmetic. The grazeCount stat is intentionally NOT incremented (no graze
    // happened, economically).
    if (this.biomeNoGraze) {
      w.particles.graze(b.x, b.y);
      return;
    }
    w.grazeCount++;
    // PERFECT THREAD — count grazes within a SINGLE dash; reward once at threshold.
    if (p.phase === 'dashing') {
      p.grazesThisDash++;
      if (perfectThreadReady(p.grazesThisDash, p.perfectThreadFired)) {
        p.perfectThreadFired = true;
        this.firePerfectThread();
      }
    }
    chargeFromGraze(w.overdrive); // grazing trickles the OVERDRIVE meter
    const max = w.stats.staminaSegments * TUNE.stamina.perSegment;
    // BIOME RULE (THE BLOOMGARDENS) — graze refunds scaled stamina (generous flow biome)
    p.stamina = Math.min(max, p.stamina + w.stats.grazeStaminaRefund * this.biomeGrazeMul);
    w.score += Math.round(grazeScore(w.combo) * w.stats.scoreMul);
    // B1: grazing keeps the chain alive — floor the window + trickle a fractional
    // combo charge (skill expression feeds the combo, and thus the COHERENCE bloom).
    if (w.combo > 0) {
      w.comboTimer = Math.max(w.comboTimer, TUNE.combo.grazeRefreshWindow);
      w.comboGrazeCharge += TUNE.combo.grazePerGraze;
      if (w.comboGrazeCharge >= 1) {
        w.comboGrazeCharge -= 1;
        w.combo += 1;
        if (w.combo > w.bestComboRun) w.bestComboRun = w.combo;
      }
    }
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

  /** PERFECT THREAD — the once-per-dash reward for threading the graze threshold
   *  of bullets in a single dash. Combo-scaled score + a LOCALIZED chromatic/bloom
   *  pop (the coherence focusPulse) + a floatText. No world.rng — purely cosmetic
   *  feedback, and all flashing is a11y-gated at draw time. */
  private firePerfectThread(): void {
    const w = this.world;
    const p = w.player;
    const PT = TUNE.perfectThread;
    const bonus = perfectThreadScore(w.combo);
    w.score += Math.round(bonus * w.stats.scoreMul);
    // keep the chain breathing — floor the decay window like a graze does
    if (w.combo > 0) w.comboTimer = Math.max(w.comboTimer, PT.comboWindowFloor);
    // localized chromatic/bloom pop, anchored on the player (not a frame-wide strobe)
    this.coherence.focusPulse = 1; // drives the saturation/chroma bloom (a11y-gated by washSaturation)
    w.particles.ring(p.x, p.y, w.stats.grazeRadius + 22, '#a78bfa', 0.4);
    w.particles.burst(p.x, p.y, 18, '#c4b5fd');
    w.particles.floatText(p.x, p.y - 34, `PERFECT THREAD +${bonus}`, '#c4b5fd', 1.05);
    this.renderer.flash('#a78bfa', PT.flashAlpha); // gated by reduceFlashing at draw time
    this.shake.add(PT.trauma);
    this.input.rumble(0.2, 0.3, 90);
    this.audio.comboErupt();
    this.ui.announce('PERFECT THREAD', '#c4b5fd');
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
        w.shards += g.value * (w.powerup.active === 'greed' ? 2 : 1); // GREED doubles shards at PICKUP (shardMul banks at run-end, when it's expired)
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
      // SHADE is harmless while drifting — only its brief telegraphed STRIKE is lethal
      // (the timing-duel; enemy overhaul). A dormant shade can be stood on / dashed through.
      if (e.kind === 'shade' && !shadeLethal(e)) continue;
      if (circleHit(p.x, p.y, p.radius, e.x, e.y, e.radius * 0.72)) {
        this.playerDie('a collision', e.kind);
        return;
      }
    }
    // boss body — per-boss exceptions live in isBossLethal (Mirrorblade only
    // mid-lunge; the Hollow is an intangible phantom and never contact-lethal)
    const bossLethal = w.boss && isBossLethal(w.boss);
    if (w.bossAlive && w.boss && bossLethal && circleHit(p.x, p.y, p.radius, w.boss.x, w.boss.y, w.boss.radius * 0.85)) {
      this.playerDie('the boss', w.boss.kind);
      return;
    }
    // Beacon sweep beam: die if within the active beam (a diameter line through
    // the boss). Dash i-frames already exclude us from this check, so you can
    // dash THROUGH the beam.
    if (w.boss && beaconBeamActive(w.boss)) {
      // ENRAGED the sweep is a rotating CROSS — a 2nd perpendicular diameter (arms=2).
      const arms = beaconEnraged(w.boss) ? 2 : 1;
      if (beamHitsPoint(w.boss.x, w.boss.y, w.boss.angle, arms, BEACON.beamWidth / 2 + p.radius, p.x, p.y)) {
        this.playerDie('the beam', w.boss.kind);
      }
    }
    // Sovereign CROWN BEAMS: a rotating star of diameter beams. Dash i-frames
    // already exclude us, so you can dash through the safe wedges.
    if (w.boss && sovereignBeamActive(w.boss)) {
      if (beamHitsPoint(w.boss.x, w.boss.y, w.boss.angle, SOVEREIGN.beamArms, SOVEREIGN.beamWidth / 2 + p.radius, p.x, p.y)) {
        this.playerDie('the crown beam', w.boss.kind);
      }
    }
  }

  /** Shove nearby bullets radially outward to open an escape lane. Positions-only,
   *  NO rng — shared by LAST BREATH and the ARMOR absorb so both behave identically. */
  private shoveBullets(radius: number, push: number): void {
    const w = this.world;
    const p = w.player;
    const r2 = radius * radius;
    w.bullets.forEachActive((b) => {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2) {
        const d = Math.sqrt(d2) || 1;
        b.vx += (dx / d) * push;
        b.vy += (dy / d) * push;
      }
    });
  }

  private playerDie(cause = 'a bullet', srcKind = ''): void {
    const w = this.world;
    const p = w.player;
    if (!p.alive) return;
    w.hitsTaken++; // §4 M3 — one would-be-fatal hit, however it's absorbed (the single no-hit seam)
    // §v9 LAST RUN — attribute this would-be-fatal hit (armor/last-breath/death all funnel here) to
    // its source: a specific kind when known (bullet firer / collided enemy / boss / beam), else the
    // textual cause bucket. The last call to reach actual death leaves deathKind = the killing blow.
    const src = srcKind || cause;
    w.damageByKind[src] = (w.damageByKind[src] ?? 0) + 1;
    this.deathKind = srcKind;
    haptics.hit();
    // ARMOR (v6 §7) — a per-run shield absorbs a lethal hit BEFORE LAST BREATH. Each
    // absorb costs tempo + shoves nearby bullets aside (an escape lane, not a clear),
    // so the bullet-hell tension survives. Order: shields → LAST BREATH → revive → death.
    const arm = consumeShield(p.shields);
    if (arm.survived) {
      p.shields = arm.shields;
      p.iframe = SURVIVAL.postHitIframe;
      p.hitFlash = 0.3;
      this.shoveBullets(SURVIVAL.pushRadius, SURVIVAL.push);
      this.ui.announce('ARMOR', '#5beaff');
      w.particles.ring(p.x, p.y, SURVIVAL.pushRadius, '#5beaff', 0.5);
      this.shake.add(0.3);
      this.audio.bossStinger();
      this.deathCause = cause;
      return;
    }
    // LAST BREATH — an automatic bullet-time clutch save. It does NOT save you
    // outright: it opens a deep slow-mo window + brief grace and shoves nearby
    // bullets aside so you can dash to safety. Fail to escape and you still fall.
    if (canLastBreath(w.clutch)) {
      triggerLastBreath(w.clutch);
      p.iframe = CLUTCH.lastBreathIframe;
      p.hitFlash = 0.3;
      this.scheduler.requestDeepSlowmo(CLUTCH.lastBreathSlowmo, CLUTCH.lastBreathDuration);
      // shove nearby bullets outward to open an escape lane (shared with ARMOR)
      this.shoveBullets(CLUTCH.lastBreathPushRadius, CLUTCH.lastBreathPush);
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
      if (modeSeeded(this.mode) && !this.inChallenge) {
        const key = this.seededGhostKey(this.mode, this.seed);
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
      // §3.4 per-mode best SCORE — a personal record for the STATS "best by mode" chart
      this.save.bestByMode[this.mode.id] = Math.max(this.save.bestByMode[this.mode.id] ?? 0, w.score);
      // nemesis = the BOSS bearing down when you fell (one boss at a time), keyed by
      // EnemyKind so nemesisOf + bossName can name it. Falling to chaff doesn't count —
      // a nemesis is a boss you keep losing to. (Old prose-keyed entries are harmless.)
      if (!won && w.bossAlive && w.boss) {
        const nk = w.boss.kind;
        this.save.nemesis[nk] = (this.save.nemesis[nk] ?? 0) + 1;
      }
      this.save.maxHeat = Math.max(this.save.maxHeat, this.runHeat);
      // v7 RECORDS — peak single-run bests for the STATS dossier (cosmetic; max/min only,
      // never touches sim/seed/scoring). Fastest Arena counts only a WON arena clear.
      this.save.longestRunSec = Math.max(this.save.longestRunSec, Math.floor(w.time));
      this.save.mostBossesOneRun = Math.max(this.save.mostBossesOneRun, w.bossKills);
      if (won && this.mode.id === 'arena') {
        const clr = Math.floor(w.clearTime || w.time);
        this.save.fastestArenaSec = this.save.fastestArenaSec > 0 ? Math.min(this.save.fastestArenaSec, clr) : clr;
      }
      if (won && w.sovereignDown) {
        // NG+ — felling the Sovereign deepens the loop. Pure save state; the EFFECT
        // is gated to non-seeded runs at start(), so this never affects a Daily.
        this.save.ngPlusLevel = Math.min(NG_PLUS.maxLoop, this.save.ngPlusLevel + 1);
        this.save.ngPlusActive = true; // queued for the next run; toggle off on the title
      }
      this.save.totalRuns++;
      // 4.2 DAILY STREAK — pure calendar math (consecutive day → +1, same day →
      // unchanged, gap/first play → 1). Runs on every genuine finish, before the
      // single saveSave below; never touches the sim/seed/scoring.
      const playedDay = dateString();
      this.save.playStreak = nextStreak(playedDay, this.save.lastPlayedDate, this.save.playStreak);
      this.save.lastPlayedDate = playedDay;
      // C5 — count early runs so the beat-teaching retires after a few descents
      if (this.save.firstRunsBeatHint < COHERENCE.firstRunsBeatHintRuns) this.save.firstRunsBeatHint++;
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
      if (won) this.save.lifeWins++; // win rate = lifeWins / totalRuns (STATS hero stat)
      // v7 COMBAT lifetime counters (STATS dossier cells; mirror lifeKills accumulation)
      this.save.lifeGrazes += w.grazeCount;
      this.save.lifeDaybreaks += w.overdriveUses;
      this.save.lifeLastBreath += w.clutch.lastBreathUses;
      // v9 DOSSIER — bounded run history (last 50, newest last) + lifetime activity for the STATS
      // graphs. Plain push/assign only (determinism-safe); genuine runs only (this !inChallenge block).
      const runRec = {
        score: w.score, wave, mode: this.mode.id, won,
        sec: Math.floor(w.time), heat: this.runHeat, combo: w.bestComboRun, date: playedDay,
      };
      this.save.runHistory.push(runRec);
      if (this.save.runHistory.length > 50) this.save.runHistory = this.save.runHistory.slice(-50);
      // most-recent run PER MODE (one entry / mode) — the cockpit "LAST RUN" debrief. Rich detail
      // (kills/damage breakdowns + extras); copies of the live maps (which reset next run). Array
      // form so the migrate generic loop preserves it (an object-map would be wiped by coerceNumberRecord).
      const detail = {
        ...runRec,
        kills: { ...w.killsByKind },
        damage: { ...w.damageByKind },
        killedBy: won ? '' : (this.deathKind || this.deathCause),
        bosses: w.bossKills,
        grazes: w.grazeCount,
        daybreaks: w.overdriveUses,
        lastBreath: w.clutch.lastBreathUses,
        hitsTaken: w.hitsTaken,
        powerups: w.powerupsCollected,
      };
      this.save.lastRuns = [detail, ...this.save.lastRuns.filter((r) => r.mode !== this.mode.id)];
      this.save.playDays[playedDay] = (this.save.playDays[playedDay] ?? 0) + 1;
      this.save.lifeTimeSec += Math.floor(w.time);
      this.save.runsByMode[this.mode.id] = (this.save.runsByMode[this.mode.id] ?? 0) + 1;
      if (won) this.save.winsByMode[this.mode.id] = (this.save.winsByMode[this.mode.id] ?? 0) + 1;
      // CODEX — fold this run's per-kind kills into the lifetime map (mirrors lifeKills)
      for (const k in w.killsByKind) this.save.killsByKind[k] = (this.save.killsByKind[k] ?? 0) + w.killsByKind[k];
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
        hitsTaken: w.hitsTaken,
        lifeRuns: this.save.totalRuns,
        lifeKills: this.save.lifeKills,
        lifeBoss: this.save.lifeBoss,
        lifeShards: this.save.lifeShards,
        lifeKillsByKind: this.save.killsByKind, // folded above — gates the per-enemy SKIN achievements
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
        // §4 M4 — count this attempt (best-of-3); dailyBest above already keeps the best
        const today = dateString();
        const r = rollDailyAttempt(today, this.save.dailyAttemptDate, this.save.dailyAttempts);
        this.save.dailyAttemptDate = today;
        this.save.dailyAttempts = r.attempts + 1;
      }
      this.lastOvernightCrack = runBombe(this.save); // THE BOMBE cracks the cheapest words "overnight" (free; no-op until built)
      if (this.lastOvernightCrack.length) this.ui.noteBombeOvernight(this.lastOvernightCrack); // surfaced once on next console open
      this.evalMetaAchievements(); // a transmission may have completed overnight (re-check meta achievements)
      // DISCOVERABILITY — the first run-end carrying a Fragment, point the player at the console (once ever).
      if (!this.save.taught.includes('bombe:intro') && fragmentBalance(this.save) >= 1) {
        this.save.taught.push('bombe:intro');
        this.ui.toast('◆ TRANSMISSION RECEIVED — decrypt the fall in THE CODEBREAKER');
      }
      saveSave(this.save);
    }
    // fire-and-forget online leaderboard submission (no-op if not configured).
    // A duel is a private 1v1 on a fixed seed — never submit it to the public boards.
    // §7 — an UNRANKED mode (Casual/Story) is OFF the boards: it never submits, by design.
    // Boss Rush is ranked by cleartime; a cipher-OFF run is faster, so it stays OFF the board
    // (only the default cipher-armed experience is comparable). Pure read of mode + setting.
    const cipherOffBossRush = this.mode.bossrush && !this.settings.bossRushCiphers;
    if (boardEligible(modeRanked(this.mode), this.inChallenge, cipherOffBossRush, this.runUsedStrongAssist)) {
      void submitScore({
        mode: this.mode.id,
        name: this.save.handle,
        score: w.score,
        wave,
        combo: w.bestComboRun,
        heat: this.runHeat,
        daily: this.mode.id === 'daily' ? dateString() : undefined,
        clearTime: won && this.mode.rules?.scoreFrame === 'cleartime' ? w.clearTime : undefined,
        hitsTaken: won && this.mode.rules?.scoreFrame === 'cleartime' ? w.hitsTaken : undefined,
      });
    }
    // §v7 — contribute to the anonymous achievement-rarity aggregate. Post the full set on
    // the first finish of the session (seeds players who earned theirs before this shipped)
    // and whenever a new one unlocked this run. Fire-and-forget; no-op offline.
    if (this.save.achievements.length > 0 && (newAch.length > 0 || !this.achReported)) {
      this.achReported = true;
      void submitAchievements(this.save.achievements.slice());
    }
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
      nemesis: this.nemesisLine(),
      pbDelta: w.score - prevHigh,
      newAchievements: newAch.map((a) => a.name),
      mutators: this.activeMutators.map((id) => ({ name: MUTATORS[id].name, accent: MUTATORS[id].accent })),
      choicePending: !this.inChallenge && won && w.sovereignDown && this.save.stillpointChoice === 'none',
      canReplay: this.replay.hasClip(),
      previewFrame: this.replay.lastFrameImage() ?? undefined, // the run's final frame → preview card
      seed: this.seed,
      clearTime: won && this.mode.rules?.scoreFrame === 'cleartime' ? w.clearTime : undefined,
      hitsTaken: won && this.mode.rules?.scoreFrame === 'cleartime' ? w.hitsTaken : undefined,
      dailyAttempt: this.mode.id === 'daily' && !this.inChallenge ? this.save.dailyAttempts : undefined,
      dailyAttemptsMax: MAX_DAILY_ATTEMPTS,
      facesRemembered: this.runWokenFaces.map((id) => CITIZENS.find((c) => c.id === id)?.name).filter((n): n is string => !!n),
    };
    this.state = 'gameover';
    this.ui.showGameOver(info);
    // Auto-encode the shareable clip off-thread so the LAST TRANSMISSION frame ANIMATES (the
    // looping run), not a static still — the static frame shows instantly, the clip swaps in
    // when ready. Deduped, so the SEND THE ECHO button reuses it (instant, no re-encode).
    // reduce-motion players keep the still (GIFs ignore the OS pref, so we honor it here).
    if (info.canReplay && !this.settings.reduceMotion) {
      void this.replay.encodeShare(this.shareMeta()).then((gif) => {
        if (gif && this.state === 'gameover') this.ui.setGameOverClip(gif.blob);
      });
    }
    // playtest (Nick): "work on the anon player name" — surface name entry after a scoring run
    // with no handle (once per session). The handle also labels ghost replays, so prompt even
    // when online boards are off; skip while THE CHOICE is pending (that screen takes priority).
    // Fired AFTER showGameOver so the RANKS field overlays the gameover screen (no modal race).
    if (!this.save.handle && w.score > 0 && !this.nudgedHandle && !info.choicePending) {
      this.nudgedHandle = true;
      this.ui.openLeaderboard(true);
    }
  }

  /** THE CHOICE — the player decides the kingdom's fate after felling the Sovereign. On CATCH the
   *  Vigil begins (stamp the run ordinal + date so daysHeld can derive). Cosmetic/personal: saved
   *  to localStorage, never touches rng. */
  private makeChoice(c: 'catch' | 'fall'): void {
    this.save.stillpointChoice = c;
    if (this.save.choiceDate === '') this.save.choiceDate = dateString();
    if (c === 'catch' && this.save.vigilSince < 0) this.save.vigilSince = this.save.totalRuns;
    saveSave(this.save);
    const end = choiceEnding(c);
    this.ui.resolveChoice(end.head, end.line);
  }

  /** THE LIVING CHOICE — let the day turn after a long Vigil. Permitted only once daysHeld reaches
   *  the threshold (ending.canRelease). Flips catch -> fall (the completion), marks it final, and
   *  asks the UI to play the completion sequence. Returns whether it fired. Save-side; no rng. */
  public requestReleaseTheDay(): boolean {
    if (!canRelease(this.save)) return false;
    this.save.stillpointChoice = 'fall';
    this.save.released = true;
    saveSave(this.save);
    const end = choiceEnding('fall');
    this.ui.playCompletion('fall', this.save, end.head, end.line);
    return true;
  }

  /** Evaluate + award the decryption (meta) achievements from the current save state (the console
   *  has no run, so we synthesize a meta-only AchCtx). Toasts each newly-earned one + grants the
   *  cryptanalyst's CIPHER trail. Save-side; no rng. */
  private evalMetaAchievements(): void {
    const newAch = evalAchievements(
      this.save.achievements,
      metaAchContext({
        decryptedCount: masterProgress(this.save).done,
        transmissionsComplete: transmissionsComplete(this.save),
        bombeLevel: this.save.bombeLevel,
        puzzlesSolvedCount: CONSOLE_PUZZLES.filter((p) => this.save.solvedPuzzles.includes(p.id)).length,
        masterFrac: masterProgress(this.save).frac,
      }),
    );
    for (const a of newAch) {
      this.save.achievements.push(a.id);
      this.ui.toast(`ACHIEVEMENT — ${a.name}`);
      // THE LONGEST DAY (100% master cipher) — the marquee payoff, the meta twin of winning. Fires
      // once (gated by the achievement set). The cockpit backdrop already blooms grey→neon as the
      // master cipher fills; this is the moment it completes.
      if (a.id === 'mastercipher') this.ui.toast('THE LONGEST DAY — the city remembers everything');
      // the cryptanalyst (all puzzles solved) earns the CIPHER dash-trail — a real cosmetic
      if (a.id === 'cryptanalyst' && !this.save.unlockedTrails.includes(CRYPTANALYST_TRAIL)) {
        this.save.unlockedTrails.push(CRYPTANALYST_TRAIL);
        this.ui.toast('CIPHER trail unlocked!');
      }
    }
    // THE LONGEST DAY — grant the 100% reward stack the moment the master cipher completes.
    for (const g of grantLongestDayRewards(this.save)) {
      if (g === 'trail:dawn') this.ui.toast('DAWN trail unlocked!');
      if (g === 'theme:decrypted') this.ui.toast('DECRYPTED palette unlocked!');
      if (g.startsWith('skin:lance:')) this.ui.toast('THE LAST KEY skins unlocked!');
    }
  }

  /** THE BOMBE — decrypt the cheapest undecrypted word of an intercept (spends Fragments, with the
   *  Bombe's cost discount). Unlocks a linked memory when a transmission completes. Save-side; no rng. */
  private decryptIntercept(interceptId: string): void {
    const ic = INTERCEPTS.find((i) => i.id === interceptId);
    if (!ic) return;
    const word = nextWordInIntercept(this.save, ic);
    // snapshot dossier tiers before the decrypt mutates the save
    const dossierBefore = new Map(DOSSIER_FIGURES.map((k) => [k, figureDossier(this.save, k).lines.length]));
    if (!word || !decryptWord(this.save, word, bombeCostMul(this.save.bombeBranches?.thrift ?? 0))) return;
    // sound: a rising tick that climbs with this transmission's progress
    this.audio.decryptTick(interceptProgress(this.save, ic).done / Math.max(1, interceptProgress(this.save, ic).total));
    const completed = syncInterceptLore(this.save);
    // surface any dossier-tier advance: a new line unlocked for one of the Six
    for (const kind of DOSSIER_FIGURES) {
      const after = figureDossier(this.save, kind);
      if (after.lines.length > (dossierBefore.get(kind) ?? 0)) {
        this.ui.toast(`A FILE DEEPENS — ${bossName(kind)}`);
      }
    }
    for (const id of completed) this.ui.toast(`MEMORY DECRYPTED — ${loreById(id)?.title ?? ''}`);
    if (completed.length) this.audio.transmissionChord(); // a transmission fully resolved — the reward chord
    if (completed.length) {
      const ic = INTERCEPTS.find((i) => i.loreLink === completed[0]);
      const cz = wokenCitizens(this.save).find((c) => ic && c.wakeBy === ic.id);
      this.ui.signalRestored(ic?.title ?? 'TRANSMISSION RESTORED', ic ? ic.tokens.join(' ') : '', cz?.name);
    }
    this.evalMetaAchievements();
    // 25/50/75% milestone beats — narrator line + Fragments + (backdrop bloom reads the save).
    for (const m of grantCipherMilestones(this.save)) {
      this.ui.toast(`CIPHER MILESTONE — ${Math.round(m.tier * 100)}% · the city remembers more (+◆${m.fragments})`);
    }
    saveSave(this.save);
    this.ui.refreshMemories();
    this.ui.openBombe(word); // pass the just-cracked word so the panel can ripple the cross-reveal
  }

  /** THE BOMBE — upgrade one of the three Bombe branches (spends Fragments). */
  private upgradeBombe(branch: BombeBranch): void {
    if (!upgradeBombeBranch(this.save, branch)) return;
    this.audio.bombeClunk();
    this.evalMetaAchievements();
    saveSave(this.save);
    this.ui.openBombe();
  }

  /** THE BOMBE — submit a console cryptanalysis puzzle; a correct first solve grants a REAL reward
   *  (a free word + Fragments) + a sting. Save-side; no rng. */
  private solveConsolePuzzle(puzzleId: string, guess: string): void {
    const r = solvePuzzleReward(this.save, puzzleId, guess);
    if (!r.solved) return;
    this.audio.puzzleSting();
    this.ui.toast(`CIPHER SOLVED — ${r.crackedWord ? `revealed “${r.crackedWord}” · ` : ''}◆${r.fragments} Fragments`);
    if (grantCryptanalystBonus(this.save)) {
      this.ui.toast('CRYPTANALYST — THE BOMBE gains INSIGHT');
    }
    this.evalMetaAchievements();
    saveSave(this.save);
    this.ui.openBombe(r.crackedWord ?? undefined);
  }

  /** THE BOMBE — submit a daily-cipher guess; grants Fragments on first correct solve today. */
  private solveDailyCipherCallback(guess: string): void {
    const r = solveDailyCipher(this.save, seedFromDate(), guess);
    if (r.solved) {
      this.ui.toast(`DAILY CIPHER SOLVED — +◆${DAILY_CIPHER_REWARD} Fragments`);
      this.evalMetaAchievements();
      saveSave(this.save);
    } else {
      this.ui.toast('Not quite — try again');
    }
    this.ui.openBombe();
  }

  /** THE BOMBE — copy a daily-cipher share string to the clipboard (mirrors copyScore). */
  private shareDailyCipherCallback(): void {
    const str = `THE LAST KEY · daily cipher ${dateString()} — solved. lancefall.pages.dev`;
    try {
      void navigator.clipboard?.writeText(str);
      this.ui.toast('Cipher share copied to clipboard!');
    } catch {
      this.ui.toast(str);
    }
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
  /** PB-ghost localStorage key for a SEEDED run. Namespaced by seedKind so a Weekly's
   *  Monday-YYYYMMDD seed can never collide with a Daily's YYYYMMDD seed (both are ints). */
  private seededGhostKey(cfg: RunConfig, seed: number): string {
    return cfg.seedKind === 'week' ? `lancefall.ghost.weekly.${seed}` : this.dailyGhostKey(seed);
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

  /** 4.4 — Share a duel for the just-finished run as a shareable LINK (seed + score +
   *  ghost path, baked into the URL fragment). The acceptor opens the link and is routed
   *  straight into the SAME accept-challenge flow on boot. The raw code is still produced
   *  (it's the fragment payload) so the manual paste-a-code path keeps working. */
  private createChallenge(): void {
    if (!this.lastRunGhost) return;
    // bake the run-defining modifiers into the duel code so the acceptor reproduces
    // the CHALLENGER's fight (same seed AND same Heat/NG+), not their own settings.
    // NOTE: byte-identical to the old code path — we only WRAP it in a URL; the seed +
    // ghost are untouched, so the duel stays bit-reproducible for both players.
    this.lastRunGhost.heat = this.runHeat;
    this.lastRunGhost.ngPlus = this.runNgPlus;
    const code = toChallengeCode(this.lastRunGhost);
    const url = buildDuelUrl(code, `${location.origin}${location.pathname}`);
    // Prefer the native share sheet (mobile) → falls back to clipboard copy of the link.
    const nav = navigator as Navigator & { share?: (d: { url?: string; text?: string; title?: string }) => Promise<void> };
    if (typeof nav.share === 'function') {
      void nav
        .share({ title: 'THE LAST LANCE — duel', text: 'Race my run on the same seed:', url })
        .then(() => this.ui.toast('⚔ Duel link shared — they fall through your exact seed.'))
        .catch(() => this.copyDuelUrl(url)); // user dismissed the sheet → copy instead
    } else {
      this.copyDuelUrl(url);
    }
  }

  /** Copy the duel LINK to the clipboard with a friendly toast (falls back to showing the link). */
  private copyDuelUrl(url: string): void {
    try {
      void navigator.clipboard?.writeText(url);
      this.ui.toast('⚔ Duel link copied — send it to a friend.');
    } catch {
      this.ui.toast(url);
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

  /** 4.1 — CHALLENGE THE DEV: launch the pinned DEV_CHALLENGE_SEED. If an author ghost is
   *  bundled, race it via the EXISTING ghost-race/challenge path (acceptChallenge); otherwise
   *  launch the pinned seed in Endless with no ghost (mechanism only — never a fabricated ghost). */
  private challengeTheDev(): void {
    const author = DEV_CHALLENGE_GHOST ? fromChallengeCode(DEV_CHALLENGE_GHOST) : null;
    if (author) {
      // a real recorded run exists → reproduce the dev's fight (seed + ghost + modifiers)
      this.acceptChallenge(DEV_CHALLENGE_GHOST);
      return;
    }
    // no ghost yet → pinned seed, no ghost. A normal (non-challenge) endless run so it plays
    // like any other run; the fixed seed keeps the wave/perk sequence identical for everyone.
    this.pendingSeed = DEV_CHALLENGE_SEED;
    this.ui.toast('⚑ CHALLENGE THE DEV — the pinned seed. Beat it, then ⚔ DUEL the dev your run.');
    this.start(modeById('endless'));
  }

  private applyDirector(spawn: EnemyKind[]): void {
    const w = this.world;
    // Read the EFFECTIVE config the director was configured with (heat + mutators +
    // NG+ folded in), NOT the raw mode — otherwise Heat's enemySpeedAdd and NG+'s
    // intensity/speed/concurrency never reach the enemies (they spawn on the heated
    // cadence but at base speed). this.director.cfg == runCfg from start().
    const cfg = this.director.cfg;
    const I = intensity(w.time) * cfg.intensityMul;
    const sMul = (enemySpeedMul(I) + cfg.speedBonus) * this.biomeSpeedMul * (cfg.enemySpeedScale ?? 1); // §casual-softening
    const bMul = (bulletSpeedMul(I) + cfg.speedBonus) * this.biomeSpeedMul;
    const baseShield = shieldChance(w.time, this.mode.shieldStart, this.mode.shieldMax);
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
    // SOLSTICE PROTOCOL: wrap ring-cipher bosses in a code-lock (the Sovereign arms
    // its own in spawnBoss; the Hollow/Mirrorblade are already their own puzzles)
    if (boss && bossRushCipherArmed(this.mode, this.settings.bossRushCiphers) && bossUsesRingCipher(boss.kind)) {
      spawnCipherRing(w, boss, CIPHER.ringCount);
    }
    this.audio.bossWarn();
    this.audio.bossMusic(true, boss?.kind); // per-boss tension theme
    this.shake.add(TUNE.juice.traumaBossSpawn);
    const col = boss?.color ?? WARDEN.color; // reuse the boss's tune-set color (no duplicate table)
    this.renderer.flash(col, 0.3);
    // a proper arrival cinematic (replaces the old toast)
    this.renderer.startBossEntrance(bossName(boss?.kind ?? 'warden'), col);
    if (boss) {
      const located = NARRATOR.bossApproach[this.biomeIndex] ?? NARRATOR.bossApproach[0];
      this.narrateOne('toast', located[boss.kind] ?? NARRATOR.bossApproach[0][boss.kind]);
    }
    if (boss?.kind === 'sovereign') this.narrate('sovereignForeshadow', 'toast', NARRATOR.sovereignForeshadow);
    // INTEL card — when the player has decrypted this boss's transmission, surface a
    // pre-boss callout. Seeded modes get the card (pattern exists) but no bonus claim.
    if (boss && bossIntel(this.save, boss.kind).decrypted) {
      const adv = !modeSeeded(this.mode) ? ' — pattern read' : '';
      this.ui.announce(`INTEL · ${bossName(boss.kind)}${adv}`, '#67e8f9');
    }
    // ACT TWO — a one-line mechanic read on this boss's FIRST arrival ever (persisted; the
    // narrator flavour above is per-encounter, this teaches the fight). Cosmetic; no rng.
    if (boss) this.teach(bossReadFor(boss.kind, this.save.taught));
    // teach the Sovereign's core gimmick on arrival
    if (boss?.kind === 'sovereign') {
      w.particles.floatText(w.width / 2, w.height / 2 + 90, 'SHATTER THE CORES', '#fde047', 1.2);
    }
    // THE IMITATION GAME — the Mirrorblade wears your ship and asks the Turing question
    // out loud, ONCE on arrival (spawnWarden runs once per boss spawn). The violet echo
    // colour matches the silhouette it now wears (drawMirrorblade), so word and image agree.
    if (boss?.kind === 'mirrorblade') {
      this.ui.announce('TELL ME WHICH OF US IS REAL', '#a78bfa');
    }
  }

  // ENDLESS depth — a named milestone callout every Nth wave gives an open-ended run a
  // near horizon to chase. The milestone is a PURE FUNCTION of the wave count (milestoneAt),
  // drawing ZERO rng, so it never touches the seeded wave stream (Daily stays deterministic).
  // Time-driven modes only: the scripted Arena/Boss Rush already have their own wave structure
  // and a finite win state, so a milestone banner there would just be noise. The `milestoneWave`
  // guard fires the callout once per wave (the director re-evaluates wave every frame).
  private checkMilestone(): void {
    if (this.mode.arena || this.mode.bossrush) return;
    const wave = this.director.wave;
    if (wave <= this.milestoneWave) return; // not a new wave since the last callout
    const m = milestoneAt(wave);
    if (!m) return;
    this.milestoneWave = wave;
    this.ui.announce(`◆ ${m.title}`, m.accent);
    this.narrateOne('toast', `WAVE ${wave} — ${m.line}`);
    // a static color fade only when flashing is allowed (mirrors the biome banner)
    if (!this.settings.reduceFlashing) this.renderer.flash(m.accent, 0.1);
    // REWARD (§3.5) — a milestone is a felt CHECKPOINT, not just a callout: bank a depth-
    // scaling shard CACHE (the "one more run" pull) and top stamina back up — a breather beat
    // to reset before the next push. Pure fn of the ordinal → no rng; shards are META currency
    // (never the run score), so the seeded scoring/leaderboard stream is untouched.
    const w = this.world;
    const cache = milestoneShardReward(m.ordinal);
    w.shards += cache;
    w.player.stamina = w.stats.staminaSegments * TUNE.stamina.perSegment; // full refill — the breather
    w.particles.floatText(w.player.x, w.player.y - 40, `+${cache} ◆`, m.accent, 1.1);
  }

  private setBiome(index: number, announce: boolean): void {
    this.biomeIndex = index;
    const b = BIOMES[index];
    this.director.biomeBias = b.bias;
    this.renderer.setBiomeTint(b.nebula);
    this.biomeSpeedMul = b.speedMul;
    this.biomeShield = b.shieldBonus;
    this.biomeBulletAccel = b.bulletAccel ?? 0;
    this.biomeNoGraze = b.noGraze ?? false;
    this.biomeGrazeMul = b.grazeMul ?? 1;
    if (announce) {
      this.ui.announce(`⟐ ${b.name}`, b.accent);
      this.narrateOne('toast', NARRATOR.strata[index]);
      this.renderer.flash(b.accent, 0.12);
    }
    // THE CITY SPEAKS — reset biome-scoped beat flags for the 30s/60s inhabit beats
    this.biomeEntryTime = this.world.time;
    this.biomeBeatFired = false;
    this.biomeLateFired = false;
  }

  private winRun(): void {
    if (this.winning) return;
    this.winning = true;
    this.winTimer = 2.4; // a longer victory cinematic before the debrief
    // You don't draft (or roll an event) after you've won — the Sovereign's guaranteed
    // perk draft would otherwise pop AFTER the victory and clobber the gameover state.
    this.pendingDraft = false;
    this.pendingEvent = null;
    const w = this.world;
    w.clearTime = w.time;
    // Completion bonus. Scripted modes (Arena/Boss Rush) score by cleartime; a survival
    // Sovereign kill (THE LONGEST DAY) pays the longestDayBonus — a flat feat base + the same
    // speed/no-hit shape, lifted by the ASCEND multiplier. Both pure, no rng. (Every win in
    // LANCEFALL coincides with the Sovereign falling, so this is always the Sovereign payoff.)
    if (this.mode.rules?.scoreFrame === 'cleartime') {
      w.score += clearTimeBonus(w.time, w.hitsTaken, w.stats.scoreMul);
    } else if (w.sovereignDown) {
      w.score += longestDayBonus(w.time, w.hitsTaken, w.ascension, w.stats.scoreMul);
    }
    w.player.iframe = 999;
    w.bullets.clear();
    w.enemies.clear(); // clear the board for a clean victory tableau
    this.scheduler.requestSlowmo(0.45);
    this.renderer.flash('#fbbf24', 0.5);
    this.shake.add(0.6);
    this.cam.zoom = Math.max(this.cam.zoom, 1.12); // a punch that eases back out
    // DAYBREAK — kick COHERENCE to full so the gray city blooms fully alive (the payoff the
    // whole COHERENCE system builds toward). Cosmetic dial only — never touches world.rng.
    coherenceBeatKick(this.coherence, true);
    this.ui.announce('THE LONGEST DAY IS WON', '#fde047');
    this.narrate('daybreak', 'toast', NARRATOR.daybreak);
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
