// Top-level orchestrator: the fixed-timestep loop, the state machine, and the
// "feedback glue" that turns sim events into juice (audio + particles + shake +
// slow-mo). Owns the World, Renderer, UI, Input, Audio, Scheduler, and Director.

import { FIXED_DT, MAX_SUBSTEPS, TUNE } from './tune';
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
import { intensity, enemySpeedMul, bulletSpeedMul, shieldChance } from './waves';
import { updatePlayer, resetEvents } from './player';
import type { PlayerEvents } from './player';
import { updateEnemy, splitInto } from './enemies';
import { spawnBoss, updateBoss, bossName } from './boss';
import { segCircleHit, circleHit } from './collision';
import { comboMultiplier, scoreForKill, grazeScore, registerKill, tickCombo, shouldSlowmo, hitstopFor } from './combat';
import { rollDraft, applyPerk } from './perks';
import type { PerkDef } from './perks';
import { SHIPS, shipById } from './ships';
import { maxStamina } from './dash';
import { createRng, seedFromDate } from './rng';
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

type State = 'title' | 'playing' | 'paused' | 'draft' | 'gameover';

export class Game {
  private renderer: Renderer;
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
  private daily = false;
  private seed = 1;

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
  private draftCards: PerkDef[] = [];
  private intensityTimer = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(canvas);
    this.save = loadSave();
    this.settings = loadSettings();
    this.seed = seedFromDate();
    this.world = new World(createRng(this.seed));

    this.ui = new UI(uiRoot, this.settings, {
      onStart: (d) => this.start(d),
      onRestart: () => this.start(this.daily),
      onResume: () => this.resume(),
      onQuit: () => this.toTitle(),
      onPick: (i) => this.pickPerk(i),
      onCopyScore: () => this.copyScore(),
      onSettingsChange: (s) => this.applySettings(s),
      onSelectShip: (id) => this.selectShip(id),
      onUnlockShip: (id) => this.unlockShip(id),
    });

    this.resize();
    window.addEventListener('resize', () => this.resize());
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
    this.ui.refreshTitle(this.save);
  }

  boot(): void {
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(w, h, dpr);
    this.world.width = w;
    this.world.height = h;
  }

  private applySettings(s: Settings): void {
    this.settings = s;
    saveSettings(s);
    this.audio.setVolumes(s.master, s.sfx, s.music);
    this.shake.intensity = s.shake * (s.reduceFlashing ? 0.4 : 1);
    this.world.particles.density = particleDensityValue(s.particleDensity) * (s.reduceFlashing ? 0.6 : 1);
    // reduce-motion disables decorative UI animations/transitions (CSS)
    document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
  }

  // ── state transitions ──
  private start(daily: boolean): void {
    this.audio.ensure();
    this.ui.hideSoundHint();
    this.daily = daily;
    this.seed = daily ? seedFromDate() : (Date.now() & 0x7fffffff) || 1;
    this.world.rng = createRng(this.seed);
    this.world.shipApply = shipById(this.save.selectedShip).apply;
    this.world.reset(window.innerWidth, window.innerHeight);
    // start each run with a full stamina bar sized to the chosen ship
    this.world.player.stamina = maxStamina(this.world.stats.staminaSegments);
    this.applySettings(this.settings);
    this.director.reset();
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
    this.dashSlowmoTriggered = false;
    this.intensityTimer = 0;
    this.state = 'playing';
    this.ui.show('playing');
    this.audio.startDrone();
    this.audio.duckMusic(false);

    // first-run stealth onboarding via toasts
    if (!this.save.seenTutorial) {
      this.save.seenTutorial = true;
      saveSave(this.save);
      this.ui.toast('Hold to charge — release to DASH through enemies');
      setTimeout(() => {
        if (this.state === 'playing') this.ui.toast('Graze bullets (skim them) to refill stamina');
      }, 4200);
    }
  }

  private resume(): void {
    this.state = 'playing';
    this.ui.show('playing');
    this.audio.duckMusic(false);
  }

  private pause(): void {
    this.state = 'paused';
    this.ui.show('paused');
    this.audio.endCharge(); // don't let the charge tone drone through the menu
    this.audio.duckMusic(true);
  }

  private toTitle(): void {
    this.state = 'title';
    this.ui.show('title');
    this.ui.refreshTitle(this.save);
    this.audio.endCharge();
    this.audio.stopDrone();
  }

  private openDraft(): void {
    this.draftCards = rollDraft(this.world.rng, this.world.stacks);
    this.state = 'draft';
    this.ui.showDraft(this.draftCards);
    this.audio.duckMusic(true);
  }

  private pickPerk(i: number): void {
    if (this.state !== 'draft') return;
    const card = this.draftCards[i];
    if (!card) return;
    if (card.id === 'shardcache') {
      this.world.score += 200;
      this.world.shards += 50;
    } else {
      applyPerk(this.world.stacks, card.id);
      this.world.recomputeStats();
      this.ui.toast(`PERK: ${card.name}`);
    }
    this.state = 'playing';
    this.ui.show('playing');
    this.audio.duckMusic(false);
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

  private copyScore(): void {
    const str = buildShareString(this.world.score, this.world.bestComboRun, Math.floor(this.world.time / 30) + 1, this.daily);
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
      }
      if (steps >= MAX_SUBSTEPS) this.accumulator = 0;

      // throttled drone intensity
      this.intensityTimer -= realDt;
      if (this.intensityTimer <= 0) {
        this.intensityTimer = 0.4;
        this.audio.setIntensity(intensity(this.world.time));
      }

      if (this.dying) {
        this.dyingTimer -= realDt;
        if (this.dyingTimer <= 0) this.finishGameOver();
      }
      if (this.pendingDraft && !this.dying) {
        this.pendingDraft = false;
        this.openDraft();
      }
    }

    this.updateCamera(realDt);
    this.renderer.render(this.world, this.cam, {
      reduceFlashing: this.settings.reduceFlashing,
      colorblind: this.settings.colorblind,
      combo: this.world.combo,
    });
    if (this.state === 'playing') this.ui.updateHud(this.world, this.world.particles.density);

    requestAnimationFrame((t) => this.frame(t));
  }

  private handleMeta(): void {
    const inp = this.input.state;
    if (this.state === 'title') {
      if (this.input.consumeStart()) this.start(false);
    } else if (this.state === 'playing') {
      if (inp.pausePressed) this.pause();
    } else if (this.state === 'paused') {
      if (inp.pausePressed) this.resume();
    } else if (this.state === 'draft') {
      if (inp.selectIndex >= 0) this.pickPerk(inp.selectIndex);
      else if (this.input.consumeConfirm()) this.pickPerk(1);
    } else if (this.state === 'gameover') {
      if (this.input.consumeRestart() || this.input.consumeConfirm()) this.start(this.daily);
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
    updatePlayer(w.player, this.input.state, dt, w.stats, w.width, w.height, this.ev);
    this.handlePlayerEvents(wasCharging);

    // dash + afterimage hits (share one hash rebuild).
    // Resolve on the landing step too (ev.landed) so the final segment to the
    // dash endpoint is never skipped.
    const dashing = w.player.phase === 'dashing' || this.ev.landed;
    if (dashing || w.ghostTimer > 0) w.hash.rebuild(w.enemies.items);
    if (dashing) {
      w.particles.trail(w.player.x, w.player.y, 5, comboColor(w.combo));
      // Nova Dash: detonate a shockwave at the launch point
      if (this.ev.dashFired && w.stats.dashNovaRadius > 0) {
        this.chainExplode(w.player.dashFromX, w.player.dashFromY, w.stats.dashNovaRadius, 1);
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

    // player death by contact
    if (w.player.alive && !this.dying && w.player.iframe <= 0) {
      this.checkBodyCollisions();
    }

    // director
    if (!this.dying && w.player.alive) {
      const liveEnemies = w.enemies.activeCount - (w.bossAlive ? 1 : 0);
      const dec = this.director.update(dt, liveEnemies, w.bossAlive, w.rng);
      this.applyDirector(dec.spawn);
      if (dec.boss) this.spawnWarden();
      if (dec.perk) this.pendingDraft = true;
    }

    // combo decay
    const c = tickCombo(w.combo, w.comboTimer, dt);
    if (c.broke) {
      this.audio.comboBreak();
      this.ui.comboBreakFlash();
      w.particles.floatText(w.player.x, w.player.y - 30, 'COMBO BREAK', '#ef4444', 0.9);
    }
    w.combo = c.combo;
    w.comboTimer = c.timer;

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
      this.audio.endCharge();
      this.audio.whoosh();
      this.shake.add(TUNE.juice.traumaDash);
      this.dashSlowmoTriggered = false;
      w.particles.streaks(p.x, p.y, p.dashDirX, p.dashDirY, comboColor(w.combo));
      this.cam.zoom = Math.max(this.cam.zoom, 1.03);
      this.input.rumble(0.0, 0.3, 70);
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
    for (const e of this.candidates) {
      if (!e.active || e.lastDashId === p.dashId) continue;
      if (segCircleHit(ax, ay, bx, by, e.x, e.y, e.radius, r)) {
        e.lastDashId = p.dashId;
        this.damageEnemy(e, w.stats.dashDamage, true);
      }
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
      if (segCircleHit(w.ghostX0, w.ghostY0, w.ghostX1, w.ghostY1, e.x, e.y, e.radius, r)) {
        e.lastDashId = w.ghostDashId;
        this.damageEnemy(e, w.stats.dashDamage, true);
      }
    }
  }

  /** Apply damage; on death run the kill cascade (combo, score, particles, chain). */
  private damageEnemy(e: Enemy, dmg: number, fromDash: boolean): void {
    e.hp -= dmg;
    e.hitFlash = 0.1;
    if (e.hp > 0) {
      if (fromDash) this.shake.add(0.04);
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
    const x = e.x;
    const y = e.y;
    const color = e.color;
    w.killCount++;
    if (fromDash) w.player.killsThisDash++;

    const rk = registerKill(w.combo);
    w.combo = rk.combo;
    w.comboTimer = rk.timer + w.stats.comboWindowBonus; // Slipstream extends the window
    if (w.combo > w.bestComboRun) w.bestComboRun = w.combo;

    // Siphon: dash-kills refund stamina
    if (fromDash && w.stats.killStaminaRefund > 0) {
      const max = w.stats.staminaSegments * TUNE.stamina.perSegment;
      w.player.stamina = Math.min(max, w.player.stamina + w.stats.killStaminaRefund);
    }

    const gained = scoreForKill(e.baseScore, w.combo, Math.max(0, w.player.killsThisDash - 1));
    w.score += gained;

    w.particles.burst(x, y, TUNE.particles.deathBurstMin + w.player.killsThisDash * 3, color);
    if (w.player.killsThisDash >= 2) {
      w.particles.floatText(x, y - 18, `x${w.combo}`, comboColor(w.combo), 0.8 + Math.min(w.player.killsThisDash, 8) * 0.06);
    }
    this.audio.thunk(w.combo);
    this.shake.add(TUNE.juice.traumaKill);
    this.scheduler.requestHitstop(hitstopFor(w.player.killsThisDash));
    this.input.rumble(0.0, 0.35, 50);

    // shard gem for the vacuum/meta juice
    w.spawnGem(x, y, 1);

    // splitter spawns minis
    if (e.kind === 'splitter') splitInto(e, w);

    w.enemies.release(e);

    // chain reaction
    if (w.stats.chainRadius > 0) {
      this.chainExplode(x, y, w.stats.chainRadius, w.stats.chainDmg);
    }
  }

  private chainExplode(x: number, y: number, radius: number, dmg: number): void {
    const w = this.world;
    w.particles.ring(x, y, radius, '#ec4899', 0.35);
    this.audio.explosion(0.7);
    w.hash.queryAABB(x - radius, y - radius, x + radius, y + radius, this.chainBuf);
    // snapshot to avoid mutating while iterating (the dash-hit loop owns `candidates`)
    const hits = this.chainBuf.filter((e) => e.active && !e.isBoss && circleHit(x, y, radius, e.x, e.y, e.radius));
    for (const e of hits) {
      if (e.active) this.damageEnemy(e, dmg, true);
    }
  }

  private bossDeath(e: Enemy): void {
    const w = this.world;
    const bonus = 500 * Math.max(1, e.bossWave);
    w.score += Math.round(bonus * comboMultiplier(w.combo));
    w.particles.burst(e.x, e.y, 90, '#ffffff');
    w.particles.ring(e.x, e.y, 220, '#ff3b6b', 0.5);
    w.particles.floatText(e.x, e.y - 40, 'WARDEN DOWN', '#fbbf24', 1.4);
    this.audio.explosion(1.4);
    this.audio.bossWarn();
    this.shake.add(0.9);
    this.scheduler.requestHitstop(0.18);
    for (let i = 0; i < 8; i++) w.spawnGem(e.x, e.y, 5);
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
    w.bullets.forEachActive((b) => {
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
        this.playerDie();
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
    const max = w.stats.staminaSegments * TUNE.stamina.perSegment;
    p.stamina = Math.min(max, p.stamina + w.stats.grazeStaminaRefund);
    w.score += grazeScore(w.combo);
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
      if (!e.active) continue;
      if (circleHit(p.x, p.y, p.radius, e.x, e.y, e.radius * 0.72)) {
        this.playerDie();
        return;
      }
    }
    if (w.bossAlive && w.boss && circleHit(p.x, p.y, p.radius, w.boss.x, w.boss.y, w.boss.radius * 0.85)) {
      this.playerDie();
    }
  }

  private playerDie(): void {
    const w = this.world;
    const p = w.player;
    if (!p.alive) return;
    p.alive = false;
    p.hitFlash = 0.3;
    this.dying = true;
    this.dyingTimer = 0.85;
    this.audio.endCharge(); // kill the charge tone if we died mid-charge
    this.audio.death();
    this.audio.duckMusic(true);
    this.shake.add(TUNE.juice.traumaDeath);
    this.scheduler.requestHitstop(TUNE.juice.hitstopDeath);
    this.scheduler.requestSlowmo(0.25);
    w.particles.burst(p.x, p.y, 60, '#22d3ee');
    w.particles.burst(p.x, p.y, 40, '#ffffff');
    w.particles.ring(p.x, p.y, 160, '#5beaff', 0.6);
    this.input.rumble(1, 1, 220);
  }

  private finishGameOver(): void {
    const w = this.world;
    this.dying = false;
    this.audio.stopDrone();
    const wave = Math.floor(w.time / 30) + 1;
    const newBest = w.score > this.save.highScore;
    this.save.highScore = Math.max(this.save.highScore, w.score);
    this.save.bestCombo = Math.max(this.save.bestCombo, w.bestComboRun);
    this.save.bestWave = Math.max(this.save.bestWave, wave);
    this.save.totalRuns++;
    this.save.shards += w.shards; // bank shards earned this run toward ship unlocks
    if (this.daily) {
      const seed = seedFromDate();
      if (this.save.dailySeed !== seed) {
        this.save.dailySeed = seed;
        this.save.dailyBest = 0;
      }
      this.save.dailyBest = Math.max(this.save.dailyBest, w.score);
    }
    saveSave(this.save);
    const info: GameOverInfo = {
      score: w.score,
      combo: w.bestComboRun,
      wave,
      time: w.time,
      newBest,
      daily: this.daily,
      highScore: this.save.highScore,
      shardsEarned: w.shards,
    };
    this.state = 'gameover';
    this.ui.showGameOver(info);
  }

  private applyDirector(spawn: EnemyKind[]): void {
    const w = this.world;
    const I = intensity(w.time);
    const sMul = enemySpeedMul(I);
    const bMul = bulletSpeedMul(I);
    const shield = shieldChance(w.time);
    for (const kind of spawn) {
      const pt = w.edgeSpawn();
      const isShield = w.rng.next() < shield;
      w.spawnEnemy(kind, pt.x, pt.y, sMul, bMul, isShield);
    }
  }

  private spawnWarden(): void {
    const w = this.world;
    const boss = spawnBoss(w, this.director.bossCount);
    this.audio.bossWarn();
    this.shake.add(TUNE.juice.traumaBossSpawn);
    this.ui.toast(`⚠ ${bossName(boss?.kind ?? 'warden')} APPROACHES`);
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
