// Canvas2D renderer. Draws the world to an offscreen buffer with additive bloom,
// then composites to screen with optional chromatic aberration (channel-split)
// and a vignette. Shape-coded enemies (colorblind-friendly) + glowing neon.

import { TUNE, COMBO_COLORS, BEACON, MIRRORBLADE, ELITE, HOLLOW, SOVEREIGN, HERALD } from './tune';
import type { CipherState } from './cipher';
import { POWERUPS } from './powerups';
import { clamp } from './vec';
import type { World } from './world';
import type { Enemy, Bullet } from './types';
import type { ThemeDef } from './themes';
import { trailById, trailGhostColor } from './trails';
import type { TrailDef } from './trails';
import { themeById } from './themes';
import {
  washSaturation,
  cityGlowAlpha,
  skylineAlpha,
  showWindows,
  bgExposure,
  vignetteDeepenFactor,
  trailBrightness,
} from './renderMath';

export interface Camera {
  leanX: number;
  leanY: number;
  zoom: number;
  shakeX: number;
  shakeY: number;
  shakeAngle: number;
}

export interface RenderOpts {
  reduceFlashing: boolean;
  colorblind: boolean;
  combo: number;
  caScale: number; // 0..1 chromatic-aberration intensity (accessibility setting)
  reduceMotion: boolean;
  clarity: boolean; // high-contrast Clarity mode (tames the coherence visuals)
  beatRing: boolean; // draw the opt-in beat-ring (rhythm assist)
  beatPhase: number; // 0..1 within the current beat (drives the ring radius)
  slingshot: boolean; // slingshot dash style → draw the load tether while charging
}

export class Renderer {
  private screen: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private buf: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private tint: HTMLCanvasElement;
  private tctx: CanvasRenderingContext2D;
  private glowCache = new Map<string, HTMLCanvasElement>();
  dpr = 1;
  w = 1280;
  h = 720;
  private flashColor = '#ffffff';
  private flashAlpha = 0;
  private stars: { x: number; y: number; z: number; phase: number; tw: number }[] = [];
  private bgT = 0;
  private theme: ThemeDef = themeById('neon');
  private trail: TrailDef = trailById('pulse');
  private biomeTint: [string, string, string] | null = null;
  // ── THE LAST LANCE one-bus (render half) — pushed each frame by setCoherence ──
  private coherence = 0;
  private focusPulse = 0;
  private quality = 1; // perf-adaptive (1 = full; lower under load)
  private reduceMotionR = false;
  private clarityR = false;
  private colorblindR = false;
  private reduceFlashingR = false;
  private slingshotR = false;
  private ghostX: number | null = null;
  private ghostY = 0;
  private towers: { x: number; w: number; h: number; band: number }[] = [];

  setTheme(t: ThemeDef): void {
    this.theme = t;
  }

  setTrail(t: TrailDef): void {
    this.trail = t;
  }

  /** Override the nebula tint during a run (biome stage); null = use theme. */
  setBiomeTint(c: [string, string, string] | null): void {
    this.biomeTint = c;
  }

  /** THE ONE BUS (render half) — pushed each frame: the eased Coherence value +
   *  the Perfect-dash focus-snap envelope. Read by the wash, skyline, and glow. */
  setCoherence(c: number, focus: number): void {
    this.coherence = c;
    this.focusPulse = focus;
  }
  /** Perf-adaptive quality 0.4..1 (mirrors the director's perfScale). */
  setQuality(q: number): void {
    this.quality = q;
  }
  /** Position of the racing ghost in world coords (null = no ghost this frame). */
  setGhost(x: number | null, y: number): void {
    this.ghostX = x;
    this.ghostY = y;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.screen = canvas;
    this.sctx = canvas.getContext('2d')!;
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d')!;
    this.tint = document.createElement('canvas');
    this.tctx = this.tint.getContext('2d')!;
  }

  /** Trigger a brief full-screen flash (respects reduce-flashing at draw time). */
  flash(color: string, strength = 0.4): void {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, strength);
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    for (const c of [this.screen, this.buf, this.tint]) {
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
    }
    this.screen.style.width = w + 'px';
    this.screen.style.height = h + 'px';
    this.initStars();
    this.initTowers();
  }

  private initStars(): void {
    const count = Math.min(190, Math.round((this.w * this.h) / 11000));
    this.stars = [];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        z: 0.3 + Math.random() * 0.7, // depth: near stars are brighter/bigger/faster
        phase: Math.random() * Math.PI * 2,
        tw: 0.6 + Math.random() * 1.8, // twinkle speed
      });
    }
  }

  private getGlow(color: string): HTMLCanvasElement {
    let g = this.glowCache.get(color);
    if (g) return g;
    g = document.createElement('canvas');
    g.width = g.height = 64;
    const c = g.getContext('2d')!;
    const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, color);
    grad.addColorStop(0.4, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 1;
    c.fillStyle = grad;
    c.fillRect(0, 0, 64, 64);
    this.glowCache.set(color, g);
    return g;
  }

  /** Full frame: world buffer → composite → vignette. */
  /** the active boss cipher (for drawing core glyphs); refreshed each frame */
  private cipher: CipherState | null = null;

  render(world: World, cam: Camera, opts: RenderOpts): void {
    this.cipher = world.cipher;
    const { bctx, dpr } = this;
    this.reduceFlashingR = opts.reduceFlashing;
    this.reduceMotionR = opts.reduceMotion;
    this.clarityR = opts.clarity;
    this.colorblindR = opts.colorblind;
    this.slingshotR = opts.slingshot;
    // ── draw the world to the buffer ──
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = 'source-over';
    bctx.fillStyle = '#0a0b0f';
    bctx.fillRect(0, 0, this.buf.width, this.buf.height);

    // deep-space background (screen-space, behind the camera so it stays calm)
    this.bgT += 1 / 60;
    this.drawBackground(opts.combo);
    this.drawSkyline(this.coherence);

    bctx.save();
    bctx.scale(dpr, dpr);
    // camera (zoom about center + velocity lean)
    const cx = this.w / 2;
    const cy = this.h / 2;
    bctx.translate(cx, cy);
    bctx.scale(cam.zoom, cam.zoom);
    bctx.translate(-cx, -cy);
    bctx.translate(-cam.leanX, -cam.leanY);

    this.drawGrid(bctx);
    this.drawGems(world);
    this.drawPowerups(world);
    this.drawParticlesBelow(world);
    this.drawBullets(world);
    this.drawEnemies(world, opts);
    this.drawGhost();
    if (world.player.alive || world.player.hitFlash > 0) this.drawPlayer(world);
    this.drawBeatRing(world, opts);
    this.drawParticlesAbove(world);
    this.drawFloatingText(world);
    bctx.restore();

    // ── composite buffer → screen ──
    this.present(opts, cam);
    this.drawVignette(opts, world);
    this.drawLastBreath();
    this.drawOverdriveNova(world, cam);
    this.drawBossEntrance();
  }

  private bossEntranceT = 0;
  private bossEntranceName = '';
  private bossEntranceColor = '#ffffff';
  private overdriveNovaT = 0;
  private overdriveNovaColor = '#5beaff';
  private lastBreathT = 0;

  /** Trigger the LAST BREATH bullet-time overlay (a violet vignette that pulses
   *  while the clutch window is open, then fades). Self-timed on real frames. */
  startLastBreath(): void {
    this.lastBreathT = 1;
  }

  private drawLastBreath(): void {
    if (this.lastBreathT <= 0) return;
    this.lastBreathT = Math.max(0, this.lastBreathT - 1 / 102); // ~1.7s
    const sctx = this.sctx;
    const W = this.screen.width;
    const H = this.screen.height;
    const fade = this.lastBreathT; // 1 → 0
    const pulse = 0.55 + 0.45 * Math.sin(this.bgT * 7);
    sctx.save();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    // violet edge vignette that breathes
    const g = sctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(167,139,250,0)');
    g.addColorStop(1, `rgba(124,58,237,${0.5 * fade * pulse})`);
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, W, H);
    sctx.restore();
  }

  /** Trigger the OVERDRIVE nova shockwave (a ~0.6s expanding screen ring). */
  startOverdriveNova(color: string): void {
    this.overdriveNovaT = 1;
    this.overdriveNovaColor = color;
  }

  private drawOverdriveNova(world: World, cam: Camera): void {
    if (this.overdriveNovaT <= 0) return;
    this.overdriveNovaT = Math.max(0, this.overdriveNovaT - 1 / 36); // ~0.6s
    const sctx = this.sctx;
    const W = this.screen.width;
    const H = this.screen.height;
    const k = 1 - this.overdriveNovaT; // 0 → 1
    // project the player through the same camera (zoom about centre + lean) the
    // world buffer used, so the ring stays centred on the player under zoom/lean
    const cx = this.w / 2;
    const cy = this.h / 2;
    const px = (cx + cam.zoom * (world.player.x - cam.leanX - cx)) * this.dpr;
    const py = (cy + cam.zoom * (world.player.y - cam.leanY - cy)) * this.dpr;
    const r = k * Math.max(W, H) * 0.9;
    sctx.save();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = 'lighter';
    sctx.globalAlpha = (1 - k) * 0.9;
    sctx.strokeStyle = this.overdriveNovaColor;
    sctx.lineWidth = (10 + 40 * (1 - k)) * this.dpr;
    sctx.beginPath();
    sctx.arc(px, py, r, 0, Math.PI * 2);
    sctx.stroke();
    // a brighter leading edge
    sctx.globalAlpha = (1 - k) * 0.5;
    sctx.strokeStyle = '#ffffff';
    sctx.lineWidth = 3 * this.dpr;
    sctx.beginPath();
    sctx.arc(px, py, r, 0, Math.PI * 2);
    sctx.stroke();
    sctx.restore();
  }

  /** Trigger the ~1s boss-arrival cinematic (cinematic bands + name slam). */
  startBossEntrance(name: string, color: string): void {
    this.bossEntranceT = 1.0;
    this.bossEntranceName = name;
    this.bossEntranceColor = color;
  }

  private drawBossEntrance(): void {
    if (this.bossEntranceT <= 0) return;
    this.bossEntranceT = Math.max(0, this.bossEntranceT - 1 / 60);
    const sctx = this.sctx;
    const W = this.screen.width;
    const H = this.screen.height;
    const t = 1 - this.bossEntranceT; // 0 → 1 over the second
    const a = Math.sin(Math.min(1, t) * Math.PI); // ease in/out 0→1→0
    sctx.save();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    // letterbox bands sweeping in behind the name
    sctx.globalAlpha = a * 0.55;
    sctx.fillStyle = '#05060c';
    const bandH = H * 0.16;
    sctx.fillRect(0, H * 0.5 - bandH, W, bandH * 2);
    // the boss name — large, glowing, sliding to centre
    sctx.globalAlpha = a;
    sctx.fillStyle = this.bossEntranceColor;
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.font = `700 ${Math.round(H * 0.085)}px 'Space Grotesk', system-ui, sans-serif`;
    sctx.shadowColor = this.bossEntranceColor;
    sctx.shadowBlur = 28 * this.dpr;
    const slide = (1 - a) * 50 * this.dpr;
    sctx.fillText(this.bossEntranceName, W / 2 + slide, H * 0.5);
    sctx.restore();
  }

  private initTowers(): void {
    // Static city geometry — uses Math.random (cosmetic, never world.rng), so a
    // session's skyline shape is personal and CANNOT affect a seeded run.
    this.towers = [];
    const bands = [
      { minH: 0.1, maxH: 0.2, minW: 28, maxW: 64, gap: 26 }, // far
      { minH: 0.16, maxH: 0.34, minW: 40, maxW: 92, gap: 14 }, // near
    ];
    bands.forEach((b, band) => {
      let x = -80;
      while (x < this.w + 80) {
        const w = b.minW + Math.random() * (b.maxW - b.minW);
        const h = (b.minH + Math.random() * (b.maxH - b.minH)) * this.h;
        this.towers.push({ x, w, h, band });
        x += w + b.gap * (0.5 + Math.random());
      }
    });
  }

  /** The City of Lancefall skyline — neon tower silhouettes behind the bullet-hell.
   *  Drawn in COLOUR to the buffer so the global wash (present) desaturates it to
   *  gray static at low coherence and blooms it to neon as the city is remembered.
   *  A11y: reduceMotion freezes the parallax drift; colorblind uses a luminance
   *  tone; quality gates the window-lights; the wash itself is luminance-safe. */
  private drawSkyline(c: number): void {
    if (this.towers.length === 0) return;
    const alpha = skylineAlpha(c);
    if (alpha <= 0.003) return;
    const ctx = this.bctx;
    const expo = bgExposure(c, this.reduceFlashingR);
    const city = this.colorblindR ? '#aebfe0' : this.biomeTint ? this.biomeTint[1] : this.theme.accent;
    const win = this.colorblindR ? '#ffffff' : this.theme.accent2;
    const baseY = this.h;
    const drift = this.reduceMotionR ? 0 : this.bgT * 6;
    const span = this.w + 160;
    const lights = showWindows(c) && this.quality >= 0.8; // keep the city alive through a mild perf step-down
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.globalCompositeOperation = 'source-over';
    for (const t of this.towers) {
      const far = t.band === 0;
      const par = far ? 0.4 : 0.9; // near towers drift more (parallax)
      const x = ((((t.x + drift * par) % span) + span) % span) - 80;
      ctx.fillStyle = city;
      ctx.globalAlpha = alpha * (far ? 0.55 : 1) * expo;
      ctx.fillRect(x, baseY - t.h, t.w, t.h);
      if (lights && !far) {
        ctx.fillStyle = win;
        ctx.globalAlpha = Math.min(1, alpha * 1.5) * expo;
        for (let wy = baseY - t.h + 8; wy < baseY - 6; wy += 16) {
          for (let wx = x + 5; wx < x + t.w - 4; wx += 12) {
            if (((wx + wy) & 3) === 0) ctx.fillRect(wx, wy, 4, 6); // sparse, deterministic
          }
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** A faint translucent ghost ship at the raced run's recorded position. */
  private drawGhost(): void {
    if (this.ghostX === null) return;
    const ctx = this.bctx;
    const r = TUNE.player.spriteRadius;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(this.ghostX, this.ghostY);
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = this.colorblindR ? '#cbd5e1' : '#a78bfa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = '#a78bfa';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Opt-in beat-ring (rhythm assist) — a ring that contracts to the player on
   *  each beat; commit a dash when it's tight to land on-beat. Drawn in world
   *  space (follows the player); render-only, never touches the sim. a11y: static
   *  under reduceMotion, no on-beat flash under reduceFlashing, luminance tone
   *  under colorblind. */
  private drawBeatRing(world: World, opts: RenderOpts): void {
    if (!opts.beatRing || !world.player.alive) return;
    const ctx = this.bctx;
    const p = world.player;
    const phase = opts.beatPhase;
    const onBeat = phase < 0.12 || phase > 0.88;
    const minR = TUNE.player.spriteRadius + 9;
    const maxR = 70;
    const r = this.reduceMotionR ? (minR + maxR) / 2 : minR + (maxR - minR) * (1 - phase);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = this.colorblindR ? '#cfe2ff' : this.theme.accent2;
    ctx.globalAlpha = onBeat && !this.reduceFlashingR ? 0.5 : 0.2;
    ctx.lineWidth = onBeat ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawBackground(combo: number): void {
    const ctx = this.bctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.globalCompositeOperation = 'lighter';
    const heat = 1 + Math.min(combo, 40) * 0.012;
    const expo = bgExposure(this.coherence, this.reduceFlashingR); // dims as the world loses coherence

    // drifting nebula clouds (biome tint during a run, else the cosmetic theme)
    const nb = this.biomeTint ?? this.theme.nebula;
    const blobs: [number, number, string, number][] = [
      [0.26, 0.32, nb[0], 0.9],
      [0.72, 0.34, nb[1], 1.3],
      [0.5, 0.74, nb[2], 1.1],
    ];
    const R = Math.max(this.w, this.h) * 0.42;
    for (const [fx, fy, col, sp] of blobs) {
      const cx = this.w * fx + Math.sin(this.bgT * 0.07 * sp) * 40;
      const cy = this.h * fy + Math.cos(this.bgT * 0.06 * sp) * 30;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.1 * heat * expo;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // parallax starfield — near stars drift faster, all twinkle
    ctx.globalAlpha = 1;
    for (const s of this.stars) {
      const dy = (this.bgT * 7 * s.z) % this.h;
      const y = (s.y + dy) % this.h;
      const tw = 0.45 + 0.55 * Math.sin(this.bgT * s.tw + s.phase);
      const a = s.z * tw * 0.5 * heat * expo;
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = s.z > 0.75 ? '#bfe9ff' : '#8aa0c8';
      const sz = s.z * 1.7;
      ctx.fillRect(s.x, y, sz, sz);
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(60,70,110,0.10)';
    ctx.lineWidth = 1;
    const step = 64;
    ctx.beginPath();
    for (let x = 0; x <= this.w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.h);
    }
    for (let y = 0; y <= this.h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.w, y);
    }
    ctx.stroke();
    // border frame
    ctx.strokeStyle = 'rgba(120,140,200,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, this.w - 2, this.h - 2);
    ctx.restore();
  }

  private drawGems(world: World): void {
    const ctx = this.bctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    world.gems.forEachActive((g) => {
      const glow = this.getGlow('#34d399');
      ctx.globalAlpha = 0.8;
      ctx.drawImage(glow, g.x - 9, g.y - 9, 18, 18);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#9ff5cf';
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - 4);
      ctx.lineTo(g.x + 4, g.y);
      ctx.lineTo(g.x, g.y + 4);
      ctx.lineTo(g.x - 4, g.y);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }

  private drawPowerups(world: World): void {
    const ctx = this.bctx;
    world.pickups.forEachActive((u) => {
      const def = POWERUPS[u.kind];
      const fade = u.life < 2 ? Math.max(0.2, u.life / 2) : 1; // blink-out near the end
      const pulse = 0.6 + 0.4 * Math.sin(u.spin * 2.5);
      ctx.save();
      ctx.translate(u.x, u.y);
      // glow halo
      ctx.globalCompositeOperation = 'lighter';
      const glow = this.getGlow(def.color);
      ctx.globalAlpha = 0.7 * fade * pulse;
      ctx.drawImage(glow, -28, -28, 56, 56);
      // spinning hexagon shell
      ctx.globalAlpha = fade;
      ctx.rotate(u.spin);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ngon(ctx, 6, 13);
      ctx.rotate(-u.spin * 2);
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2.5;
      ngon(ctx, 6, 9);
      // bright core
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  private drawParticlesBelow(world: World): void {
    // trails + sparks (additive)
    const ctx = this.bctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    world.particles.pool.forEachActive((p) => {
      if (p.kind === 'ring') return; // rings drawn above
      const a = clamp(p.life / p.maxLife, 0, 1);
      const glow = this.getGlow(p.color);
      const s = p.size * (p.kind === 'trail' ? 3 : 2.6);
      ctx.globalAlpha = a * (p.kind === 'trail' ? 0.6 : 0.9);
      ctx.drawImage(glow, p.x - s, p.y - s, s * 2, s * 2);
    });
    ctx.restore();
  }

  private drawParticlesAbove(world: World): void {
    const ctx = this.bctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    world.particles.pool.forEachActive((p) => {
      if (p.kind !== 'ring') return;
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3 * a + 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.ringR, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  private drawBullets(world: World): void {
    const ctx = this.bctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    world.bullets.forEachActive((b: Bullet) => {
      const glow = this.getGlow(b.color);
      const r = b.radius;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(glow, b.x - r * 2.4, b.y - r * 2.4, r * 4.8, r * 4.8);
      // bright high-contrast core so bullets stay readable through bloom
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  private drawEnemies(world: World, opts: RenderOpts): void {
    const ctx = this.bctx;
    world.enemies.forEachActive((e) => this.drawEnemy(ctx, e, opts));
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, opts: RenderOpts): void {
    const flash = e.hitFlash > 0;
    const baseColor = flash ? '#ffffff' : e.color;
    const r = e.radius * (0.4 + 0.6 * e.scale);

    // glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = this.getGlow(e.color);
    const gscale = e.isBoss ? 4 : 2.4;
    ctx.globalAlpha = e.isBoss ? 0.7 : 0.5 + 0.4 * (e.telegraph || 0);
    ctx.drawImage(glow, e.x - r * gscale, e.y - r * gscale, r * gscale * 2, r * gscale * 2);
    ctx.restore();

    // champion aura — a pulsing gold ring + orbiting crown ticks
    if (e.elite) {
      const pulse = 0.5 + 0.5 * Math.sin(this.bgT * 4);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = ELITE.aura;
      ctx.fillStyle = ELITE.aura;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.45 + 0.4 * pulse;
      ctx.beginPath();
      ctx.arc(0, 0, r + 9 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 6; i++) {
        const a = this.bgT * 1.2 + (i / 6) * Math.PI * 2;
        const rr = r + 15;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.lineWidth = opts.colorblind ? 3 : 2;
    ctx.strokeStyle = baseColor;
    ctx.fillStyle = flash ? '#ffffff' : shade(e.color, 0.18);

    switch (e.kind) {
      case 'darter': {
        const tele = 1 + (e.telegraph || 0) * 0.5;
        ctx.rotate(Math.atan2(e.vy, e.vx) || 0);
        ctx.scale(tele, tele);
        poly(ctx, [
          [r, 0],
          [-r * 0.8, r * 0.7],
          [-r * 0.4, 0],
          [-r * 0.8, -r * 0.7],
        ]);
        break;
      }
      case 'orbiter':
        ngon(ctx, 6, r);
        break;
      case 'splitter':
      case 'mini':
        ctx.rotate(Math.PI / 4);
        rect(ctx, r * 1.3);
        break;
      case 'bloomer': {
        rect(ctx, r * 1.25);
        ctx.strokeStyle = baseColor;
        ctx.globalAlpha = 0.5 + 0.5 * (e.telegraph || 0);
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.6 + (e.telegraph || 0) * 0.6), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'lancer': {
        // the LOCK aim line — the dodge tell (only during telegraph)
        if (e.telegraph > 0) {
          ctx.save();
          ctx.rotate(e.angle);
          ctx.strokeStyle = `rgba(255,160,80,${0.18 + 0.55 * e.telegraph})`;
          ctx.lineWidth = 1.5 + 2.5 * e.telegraph;
          ctx.setLineDash([10, 8]);
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(1600, 0);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
        ctx.rotate(e.telegraph > 0 ? e.angle : Math.atan2(e.vy, e.vx) || 0);
        poly(ctx, [
          [r * 1.6, 0],
          [-r * 0.5, r * 0.5],
          [-r * 0.5, -r * 0.5],
        ]);
        break;
      }
      case 'bomber': {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const pulse = e.telegraph > 0 ? 0.5 + 0.5 * Math.sin(e.spawnTime * 18) : 0.35;
        ctx.fillStyle = `rgba(255,255,255,${pulse})`;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'wisp':
        ctx.rotate(Math.atan2(e.vy, e.vx) || 0);
        poly(ctx, [
          [r, 0],
          [-r * 0.7, r * 0.7],
          [-r * 0.7, -r * 0.7],
        ]);
        break;
      case 'drifter': {
        // lock aim line — the dodge tell (during telegraph)
        if (e.telegraph > 0) {
          ctx.save();
          ctx.rotate(e.angle);
          ctx.strokeStyle = `rgba(52,211,153,${0.18 + 0.5 * e.telegraph})`;
          ctx.lineWidth = 1.5 + 2 * e.telegraph;
          ctx.setLineDash([10, 8]);
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(1400, 0);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
        // crescent (concave arc) — shape-coded, colorblind-safe
        ctx.rotate((Math.atan2(e.vy, e.vx) || 0) + Math.PI);
        ctx.beginPath();
        ctx.arc(0, 0, r, -1.1, 1.1);
        ctx.arc(r * 0.7, 0, r * 0.9, 0.95, -0.95, true);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'shade': {
        // pre-blink warning flash
        const warn = e.telegraph || 0;
        if (warn > 0) {
          ctx.globalAlpha = 0.3 + 0.5 * warn;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, r * (1.4 + warn * 0.8), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.rotate(Math.PI / 4 + e.spawnTime * 1.5);
        rect(ctx, r * 1.2);
        ctx.fillStyle = flash ? '#ffffff' : baseColor;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'brooder': {
        const tele = e.telegraph || 0;
        // hexagonal carrier pod
        ctx.save();
        ctx.rotate(e.spawnTime * 0.3);
        ngon(ctx, 6, r);
        ctx.restore();
        // pulsing hatch core — brightens + flickers in the windup before a hatch
        const pulse = tele > 0 ? 0.4 + 0.6 * Math.abs(Math.sin(e.spawnTime * 22)) : 0.3;
        ctx.fillStyle = flash ? '#ffffff' : `rgba(216,180,254,${pulse})`;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.38 + 0.18 * tele), 0, Math.PI * 2);
        ctx.fill();
        // egg dots orbiting the pod (drones waiting to hatch)
        ctx.fillStyle = '#ddd6fe';
        for (let i = 0; i < 3; i++) {
          const a = e.spawnTime * 1.6 + (i / 3) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, 2.1, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'herald': {
        // wall-preview: a broken dashed line across the firing direction, with the
        // safe lane (gap) shown — the read window. e.subPhase holds the gap offset.
        if (e.telegraph > 0) {
          ctx.save();
          ctx.rotate(e.angle);
          const a = 0.16 + 0.5 * e.telegraph;
          ctx.strokeStyle = `rgba(163,230,53,${a})`;
          ctx.lineWidth = 1.5 + 2.5 * e.telegraph;
          ctx.setLineDash([8, 7]);
          const wh = HERALD.wallHalf;
          const gh = HERALD.gapHalf;
          const g = e.subPhase;
          ctx.beginPath();
          ctx.moveTo(0, -wh);
          ctx.lineTo(0, g - gh);
          ctx.moveTo(0, g + gh);
          ctx.lineTo(0, wh);
          ctx.stroke();
          ctx.setLineDash([]);
          // a short stem through the gap centre showing which way the wall sweeps
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.moveTo(0, g);
          ctx.lineTo(26, g);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.restore();
        }
        // body: a tall bar perpendicular to aim — reads as a wall segment
        ctx.rotate(e.angle);
        ctx.beginPath();
        ctx.rect(-r * 0.42, -r * 1.15, r * 0.84, r * 2.3);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'seeker': {
        // lock-on aim line — the bolt's initial heading (it homes from here)
        if (e.telegraph > 0) {
          ctx.save();
          ctx.rotate(e.angle);
          ctx.strokeStyle = `rgba(232,121,249,${0.18 + 0.5 * e.telegraph})`;
          ctx.lineWidth = 1.5 + 2 * e.telegraph;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(900, 0);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
        // body: a ringed "eye" — reads as a tracker
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = baseColor;
        ctx.globalAlpha = 0.6 + 0.4 * (e.telegraph || 0);
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2); // reticle ring
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2); // pupil
        ctx.fill();
        break;
      }
      case 'hollow':
        this.drawHollow(ctx, e, r);
        break;
      case 'hollow_echo':
        this.drawHollowEcho(ctx, e, r);
        break;
      case 'warden':
        this.drawWarden(ctx, e, r);
        break;
      case 'weaver':
        this.drawWeaver(ctx, e, r);
        break;
      case 'beacon':
        this.drawBeacon(ctx, e, r);
        break;
      case 'mirrorblade':
        this.drawMirrorblade(ctx, e, r);
        break;
      case 'sovereign':
        this.drawSovereign(ctx, e, r);
        break;
      case 'sovereign_core':
        this.drawSovereignCore(ctx, e, r);
        break;
    }

    // shield arc
    if (e.shielded) {
      ctx.rotate(-(Math.atan2(e.vy, e.vx) || 0)); // undo darter rotation if any
      ctx.strokeStyle = '#9ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, e.shieldAngle - 1.05, e.shieldAngle + 1.05);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHollow(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    const sync = e.telegraph || 0; // 0..1 charge, 1 during the damage window
    const open = e.phase === 2; // the passable/damageable window
    // concentric pentagon shells — hollow rings, brightening toward white on sync
    ctx.strokeStyle = mix(HOLLOW.color, '#ffffff', sync * 0.85);
    ctx.fillStyle = open ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0)';
    ctx.lineWidth = 2.5;
    ctx.save();
    ctx.rotate(e.angle);
    for (let k = 3; k >= 1; k--) {
      ctx.globalAlpha = 0.35 + 0.25 * k;
      ngon(ctx, 5, r * (k / 3));
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // sync telegraph: a closing dashed ring that says "dash through me NOW"
    if (sync > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = open ? '#ffffff' : `rgba(167,243,208,${0.3 + 0.6 * sync})`;
      ctx.lineWidth = open ? 4 : 2 + 2 * sync;
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.arc(0, 0, r * (open ? 1.15 : 1.1 + (1 - sync) * 1.2), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // hp ring
    const frac = e.hp / e.maxHp;
    ctx.strokeStyle = HOLLOW.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
  }

  private drawHollowEcho(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    ctx.strokeStyle = e.hitFlash > 0 ? '#ffffff' : HOLLOW.echoColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    ctx.save();
    ctx.rotate(e.spawnTime * 0.8);
    ngon(ctx, 5, r);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.fillStyle = HOLLOW.echoColor;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawWarden(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    const white = e.telegraph || 0;
    ctx.fillStyle = mix('#ff3b6b', '#ffffff', white * 0.7);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.save();
    ctx.rotate(e.spawnTime * 0.4);
    ngon(ctx, 6, r);
    ctx.restore();
    // rotating accents
    ctx.save();
    ctx.rotate(-e.angle);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // hp ring
    const frac = e.hp / e.maxHp;
    ctx.strokeStyle = '#ff3b6b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
  }

  private drawWeaver(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    const white = e.telegraph || 0;
    ctx.fillStyle = mix('#a855f7', '#ffffff', white * 0.6);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    // rotating 4-arm star core
    ctx.save();
    ctx.rotate(e.angle);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // counter-rotating ring
    ctx.save();
    ctx.rotate(-e.angle * 0.6);
    ctx.strokeStyle = 'rgba(216,180,254,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // hp ring
    const frac = e.hp / e.maxHp;
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
  }

  private drawBeacon(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    // rotating sweep beam (phase 0): thin warning during telegraph, hot beam when active
    if (e.phase === 0 && e.subPhase !== 2) {
      const active = e.subPhase === 1;
      ctx.save();
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      const w = active ? BEACON.beamWidth : 5;
      ctx.globalAlpha = active ? 0.85 : 0.25 + 0.45 * (e.telegraph || 0);
      ctx.fillStyle = active ? '#bfefff' : '#38bdf8';
      ctx.fillRect(-3000, -w / 2, 6000, w);
      if (active) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-3000, -w / 6, 6000, w / 3); // bright core
      }
      ctx.restore();
    }
    // lighthouse core
    const white = e.telegraph || 0;
    ctx.fillStyle = mix('#38bdf8', '#ffffff', white * 0.5);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.save();
    ctx.rotate(e.angle);
    ngon(ctx, 3, r); // triangular emitter
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#eaffff';
    ctx.fill();
    // hp ring
    const frac = e.hp / e.maxHp;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
  }

  private drawMirrorblade(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    // wind-up aim line — the lunge tell
    if (e.phase === 0 && e.telegraph > 0) {
      ctx.save();
      ctx.rotate(e.angle);
      ctx.strokeStyle = `rgba(255,80,80,${0.2 + 0.5 * e.telegraph})`;
      ctx.lineWidth = 2 + 3 * e.telegraph;
      ctx.setLineDash([12, 9]);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(MIRRORBLADE.dashLen, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // dash trail
    if (e.phase === 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#ff5b5b';
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = r * 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-Math.cos(e.angle) * 70, -Math.sin(e.angle) * 70);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.restore();
    }
    // hostile mirror-ship body (red echo of the player), pointing along its lunge
    ctx.save();
    ctx.rotate(e.angle);
    ctx.fillStyle = e.phase === 2 ? '#ffd0d0' : '#2a0a0a'; // brightens when vulnerable
    ctx.strokeStyle = '#ff5b5b';
    ctx.lineWidth = 3;
    poly(ctx, [
      [r * 1.4, 0],
      [-r * 0.8, r * 0.8],
      [-r * 0.4, 0],
      [-r * 0.8, -r * 0.8],
    ]);
    ctx.restore();
    // hp ring
    const frac = e.hp / e.maxHp;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
  }

  private drawSovereign(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    const exposed = e.phase === 2;
    const tele = e.telegraph || 0;
    // CROWN BEAMS (phase 0): a rotating star of diameter beams — thin warning
    // during telegraph, hot beams when active.
    if (e.phase === 0 && e.subPhase !== 2) {
      const active = e.subPhase === 1;
      const w = active ? SOVEREIGN.beamWidth : 5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < SOVEREIGN.beamArms; k++) {
        ctx.save();
        ctx.rotate(e.angle + (k * Math.PI) / SOVEREIGN.beamArms);
        ctx.globalAlpha = active ? 0.8 : 0.2 + 0.45 * tele;
        ctx.fillStyle = active ? '#fff7c2' : '#fde047';
        ctx.fillRect(-3000, -w / 2, 6000, w);
        if (active) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-3000, -w / 6, 6000, w / 3); // bright core
        }
        ctx.restore();
      }
      ctx.restore();
    }
    // EXPOSED aura — the crown cracks open (vulnerable punish window)
    if (exposed) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(e.spawnTime * 12);
      ctx.fillStyle = '#fff3a8';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // faint gravity-well rings (signals the bend on its bullets)
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1.5;
    for (let g = 1; g <= 3; g++) {
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.35 + g * 0.55), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // outer crown ring (8-point) — brightens toward white on telegraph/expose
    ctx.save();
    ctx.rotate(e.spawnTime * 0.5);
    ctx.strokeStyle = exposed ? '#ffffff' : mix(SOVEREIGN.color, '#ffffff', tele * 0.6);
    ctx.lineWidth = 3;
    ngon(ctx, 8, r * 1.05);
    ctx.restore();
    // inner counter-rotating diamond
    ctx.save();
    ctx.rotate(-e.spawnTime * 0.8);
    ctx.strokeStyle = 'rgba(255,243,168,0.7)';
    ctx.lineWidth = 2;
    ngon(ctx, 4, r * 0.6);
    ctx.restore();
    // molten core
    ctx.fillStyle = exposed || e.hitFlash > 0 ? '#ffffff' : '#fff3a8';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    // hp ring
    const frac = e.hp / e.maxHp;
    ctx.strokeStyle = SOVEREIGN.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.75, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
  }

  private drawSovereignCore(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    const flash = e.hitFlash > 0;
    // glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 + 0.3 * Math.sin(e.spawnTime * 6 + e.phase);
    ctx.fillStyle = SOVEREIGN.coreColor;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // spinning diamond shell
    ctx.save();
    ctx.rotate(Math.PI / 4 + e.spawnTime * 2);
    ctx.strokeStyle = flash ? '#ffffff' : '#fde047';
    ctx.lineWidth = 2.5;
    rect(ctx, r * 1.1);
    ctx.restore();
    // bright pip
    ctx.fillStyle = flash ? '#ffffff' : '#fff7c2';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // CIPHER glyph — the symbol the player reads off the HUD and dashes in order
    const cipher = this.cipher;
    if (cipher && !cipher.solved) {
      const slot = e.phase;
      const glyph = cipher.glyphs[slot] ?? slot;
      const keyed = cipher.order.indexOf(slot) < cipher.progress; // already keyed
      const isNext = cipher.order[cipher.progress] === slot; // the core to dash now
      // The NEXT core gets a bright, thick, STATIC white ring (no motion → a11y-safe)
      // so the target is obvious under fire; keyed cores go green, the rest amber.
      ctx.save();
      ctx.lineWidth = isNext ? 3.5 : 2;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = keyed ? '#34d399' : isNext ? '#ffffff' : 'rgba(253,224,71,0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, r * (isNext ? 1.7 : 1.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = keyed ? '#34d399' : '#0b0e17';
      ctx.font = `bold ${Math.round(r * 0.85)}px 'Space Grotesk', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(glyph + 1), 0, 0);
      ctx.restore();
    }
  }

  private drawPlayer(world: World): void {
    const ctx = this.bctx;
    const p = world.player;

    // active POWER-UP aura — a coloured pulsing ring around the ship
    if (world.powerup.active) {
      const def = POWERUPS[world.powerup.active];
      const pulse = 0.5 + 0.5 * Math.sin(this.bgT * 6);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = def.color;
      ctx.globalAlpha = 0.3 + 0.35 * pulse;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, TUNE.player.spriteRadius * (2.1 + 0.2 * pulse), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // OVERDRIVE charge aura — a ring that fills + pulses brighter as the meter climbs,
    // and pulses urgently when READY to fire.
    const od = world.overdrive;
    if (od.meter > 0.01) {
      const ready = od.meter >= 1 && od.cooldown <= 0;
      const pulse = 0.5 + 0.5 * Math.sin(this.bgT * (ready ? 9 : 4));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = ready ? '#ffffff' : this.theme.accent;
      ctx.globalAlpha = (ready ? 0.5 + 0.5 * pulse : 0.25 + 0.45 * od.meter);
      ctx.lineWidth = ready ? 3 : 2;
      const rr = TUNE.player.spriteRadius * (1.8 + (ready ? pulse * 0.5 : 0.3));
      // arc that fills clockwise with the meter
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, od.meter));
      ctx.stroke();
      ctx.restore();
    }

    // dash spear line + streaking ship afterimages (the "snap" of the dash)
    if (p.phase === 'dashing') {
      const col = comboColor(world.combo);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = col;
      ctx.lineWidth = TUNE.dash.hitboxRadius * 0.8;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(p.dashFromX, p.dashFromY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();

      // ghost silhouettes along the travelled segment — crisp outlines that
      // read as a streak of ships, fading toward the tail
      const gsr = TUNE.player.spriteRadius;
      const blaze = Math.min(1, world.combo / 50); // the trail intensifies as the chain climbs
      const ghosts = 4 + Math.round(2 * blaze); // 4 → 6 at high combo
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const ghostBase = trailGhostColor(this.trail, this.theme.accent2);
      ctx.strokeStyle = blaze > 0.5 ? mix(ghostBase, '#ffffff', (blaze - 0.5) * 2) : ghostBase;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      // the ink-ribbon trail dims as coherence drops (fixed high under Clarity)
      const tb = trailBrightness(this.coherence, this.reduceFlashingR, this.clarityR);
      for (let i = 1; i <= ghosts; i++) {
        const t = i / (ghosts + 1);
        const gx = p.dashFromX + (p.x - p.dashFromX) * t;
        const gy = p.dashFromY + (p.y - p.dashFromY) * t;
        const s = 0.7 + 0.3 * t; // ghosts grow toward the ship
        ctx.globalAlpha = Math.min(1, (0.22 + 0.4 * t) * (1 + 0.5 * blaze) * tb);
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(p.angle);
        ctx.scale(s, s);
        ctx.beginPath();
        ctx.moveTo(gsr, 0);
        ctx.lineTo(-gsr * 0.7, gsr * 0.7);
        ctx.lineTo(-gsr * 0.35, 0);
        ctx.lineTo(-gsr * 0.7, -gsr * 0.7);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // afterimage ghost
    if (world.ghostTimer > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#a855f7';
      // fade across the ghost's actual lifetime (WRAITH stretches afterimageSec well past 0.5)
      ctx.globalAlpha = Math.min(1, 0.45 * (world.ghostTimer / Math.max(0.01, world.stats.afterimageSec)));
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(world.ghostX0, world.ghostY0);
      ctx.lineTo(world.ghostX1, world.ghostY1);
      ctx.stroke();
      ctx.restore();
    }

    // charge aim guide
    if (p.phase === 'charging') {
      const len = TUNE.dash.minLen + (TUNE.dash.maxLen - TUNE.dash.minLen) * p.charge * world.stats.dashLenMul;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.strokeStyle = `rgba(120,220,255,${0.25 + 0.4 * p.charge})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      // arrowhead
      ctx.fillStyle = `rgba(150,230,255,${0.4 + 0.5 * p.charge})`;
      ctx.beginPath();
      ctx.moveTo(len + 10, 0);
      ctx.lineTo(len - 4, 7);
      ctx.lineTo(len - 4, -7);
      ctx.closePath();
      ctx.fill();
      // SLINGSHOT — the load tether stretched BACKWARD (the tension you're building)
      if (this.slingshotR) {
        const loadLen = 14 + 56 * p.charge; // the band stretches as you load
        ctx.strokeStyle = `rgba(255,180,90,${0.35 + 0.5 * p.charge})`;
        ctx.lineWidth = 1.5 + 2 * p.charge;
        ctx.beginPath();
        ctx.moveTo(-6, -6);
        ctx.lineTo(-loadLen, 0);
        ctx.lineTo(-6, 6);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,210,140,${0.5 + 0.4 * p.charge})`;
        ctx.beginPath();
        ctx.arc(-loadLen, 0, 2.5 + 1.5 * p.charge, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ship glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = this.getGlow(p.hitFlash > 0 ? '#ffffff' : this.theme.accent);
    const gs = TUNE.player.spriteRadius * 2.6;
    ctx.globalAlpha = p.phase === 'charging' ? 0.5 + p.charge * 0.4 : 0.55;
    ctx.drawImage(glow, p.x - gs, p.y - gs, gs * 2, gs * 2);
    ctx.restore();

    // ship body
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    const sr = TUNE.player.spriteRadius * (p.phase === 'charging' ? 1 + 0.06 * Math.sin(p.charge * 30) : 1);
    const invuln = p.iframe > 0 && Math.floor(p.iframe * 40) % 2 === 0;
    ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : '#0a0b0f';
    ctx.strokeStyle = invuln ? '#ffffff' : this.theme.accent2;
    ctx.lineWidth = 2.5;
    poly(ctx, [
      [sr, 0],
      [-sr * 0.7, sr * 0.7],
      [-sr * 0.35, 0],
      [-sr * 0.7, -sr * 0.7],
    ]);
    ctx.restore();
  }

  private drawFloatingText(world: World): void {
    const ctx = this.bctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of world.particles.texts) {
      if (!t.active) continue;
      const a = clamp(t.life / t.maxLife, 0, 1);
      const grow = 1 + (1 - a) * 0.4;
      ctx.globalAlpha = a;
      ctx.font = `700 ${Math.round(20 * t.scale * grow)}px "Space Grotesk", system-ui, sans-serif`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  private present(opts: RenderOpts, cam: Camera): void {
    const sctx = this.sctx;
    const W = this.screen.width;
    const H = this.screen.height;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = 'source-over';
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, W, H);

    // shake transform (in device px)
    sctx.save();
    const shx = cam.shakeX * this.dpr;
    const shy = cam.shakeY * this.dpr;
    sctx.translate(W / 2 + shx, H / 2 + shy);
    sctx.rotate(cam.shakeAngle);
    sctx.translate(-W / 2, -H / 2);

    const shift = opts.reduceFlashing
      ? 0
      : clamp(TUNE.juice.aberrationBase + opts.combo * TUNE.juice.aberrationPerCombo, 0, TUNE.juice.aberrationMax) * opts.caScale;

    if (shift < 1.8) {
      sctx.globalCompositeOperation = 'source-over';
      sctx.globalAlpha = 1;
      sctx.drawImage(this.buf, 0, 0);
    } else {
      const off = shift * this.dpr;
      const channels: [string, number][] = [
        ['#ff0000', -off],
        ['#00ff00', 0],
        ['#0000ff', off],
      ];
      sctx.globalCompositeOperation = 'lighter';
      for (const [col, dx] of channels) {
        this.tctx.setTransform(1, 0, 0, 1, 0, 0);
        this.tctx.globalCompositeOperation = 'source-over';
        this.tctx.globalAlpha = 1;
        this.tctx.clearRect(0, 0, W, H);
        this.tctx.drawImage(this.buf, 0, 0);
        this.tctx.globalCompositeOperation = 'multiply';
        this.tctx.fillStyle = col;
        this.tctx.fillRect(0, 0, W, H);
        sctx.drawImage(this.tint, dx, 0);
      }
    }
    sctx.restore();

    // ── THE ONE BUS (render half): a global gray→neon saturation wash over the
    // whole composited frame — the unmistakable "dead world coming alive" read.
    // 'saturation' blend with a gray top layer at alpha (1-sat) linearly desaturates
    // toward grayscale; one full-screen GPU-backed draw, no per-pixel JS. ──
    const sat = washSaturation(
      this.coherence,
      this.focusPulse,
      this.reduceFlashingR,
      this.reduceMotionR,
      this.clarityR,
    );
    // gate the wash off under DEEP perf load (quality ≤ 0.6) — it is the single
    // biggest new per-frame op on CPU-compositing hardware, and this is the only
    // lever adaptPerf has on it. The world stays full-colour (readable) when shed.
    if (sat < 0.999 && this.quality > 0.6) {
      sctx.globalCompositeOperation = 'saturation';
      sctx.globalAlpha = 1 - sat;
      sctx.fillStyle = '#808080';
      sctx.fillRect(0, 0, W, H);
      sctx.globalCompositeOperation = 'source-over';
      sctx.globalAlpha = 1;
    }
    // foreground neon city-glow band rising from the bottom edge (the anchor the
    // eye lands on in a compressed GIF — the City of Lancefall's edge resolving)
    const glow = cityGlowAlpha(this.coherence, this.reduceFlashingR, this.clarityR);
    if (glow > 0.003) {
      const bandH = H * 0.16;
      const grad = sctx.createLinearGradient(0, H - bandH, 0, H);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, this.colorblindR ? '#cfe2ff' : this.biomeTint ? this.biomeTint[1] : this.theme.accent);
      sctx.globalCompositeOperation = 'lighter';
      sctx.globalAlpha = glow;
      sctx.fillStyle = grad;
      sctx.fillRect(0, H - bandH, W, bandH);
      sctx.globalCompositeOperation = 'source-over';
      sctx.globalAlpha = 1;
    }
  }

  private drawVignette(opts: RenderOpts, world: World): void {
    const sctx = this.sctx;
    const W = this.screen.width;
    const H = this.screen.height;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = 'source-over';
    const lowHp = world.player.alive && world.player.iframe <= 0 && world.player.stamina < 100;
    // low coherence deepens the vignette (the dead world closing in); capped so it
    // never fully blacks out, and gated off under reduceFlashing/reduceMotion/clarity.
    const edge = Math.min(
      0.92,
      (0.5 + (lowHp ? 0.12 : 0)) *
        vignetteDeepenFactor(this.coherence, this.reduceFlashingR, this.reduceMotionR, this.clarityR),
    );
    const grad = sctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.62);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${edge})`);
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, W, H);

    // fog of war (mutator): darken everything beyond a radius around the player
    if (world.stats.fogRadius > 0 && world.player.alive) {
      const fr = world.stats.fogRadius * this.dpr;
      const px = world.player.x * this.dpr;
      const py = world.player.y * this.dpr;
      const fg = sctx.createRadialGradient(px, py, fr * 0.45, px, py, fr);
      fg.addColorStop(0, 'rgba(5,6,12,0)');
      fg.addColorStop(1, 'rgba(5,6,12,0.94)');
      sctx.fillStyle = fg;
      sctx.fillRect(0, 0, W, H);
    }

    // combo "heat" — a colored edge glow that swells as the chain climbs. Edges
    // only (inner 0.5 radius is clear) so bullet readability is never touched.
    if (!opts.reduceFlashing && world.combo >= 10) {
      const heat = Math.min(1, (world.combo - 10) / 60); // x10 → x70 ramps 0→1
      const hg = sctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.5, W / 2, H / 2, Math.max(W, H) * 0.66);
      hg.addColorStop(0, 'rgba(0,0,0,0)');
      hg.addColorStop(1, comboColor(world.combo));
      sctx.globalCompositeOperation = 'lighter';
      sctx.globalAlpha = 0.05 + 0.2 * heat;
      sctx.fillStyle = hg;
      sctx.fillRect(0, 0, W, H);
      sctx.globalAlpha = 1;
      sctx.globalCompositeOperation = 'source-over';
    }

    // full-screen flash (skipped entirely under reduce-flashing)
    if (this.flashAlpha > 0.01) {
      if (!opts.reduceFlashing) {
        sctx.globalAlpha = this.flashAlpha;
        sctx.fillStyle = this.flashColor;
        sctx.fillRect(0, 0, W, H);
        sctx.globalAlpha = 1;
      }
      this.flashAlpha *= 0.86;
    }
  }
}

// ── drawing helpers ──
function poly(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function ngon(ctx: CanvasRenderingContext2D, n: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function rect(ctx: CanvasRenderingContext2D, half: number): void {
  ctx.beginPath();
  ctx.rect(-half, -half, half * 2, half * 2);
  ctx.fill();
  ctx.stroke();
}

export function comboColor(combo: number): string {
  let col = COMBO_COLORS[0].color;
  for (const stop of COMBO_COLORS) if (combo >= stop.at) col = stop.color;
  return col;
}

const shadeCache = new Map<string, string>();
function shade(hex: string, amt: number): string {
  const key = hex + '|' + amt;
  let v = shadeCache.get(key);
  if (v) return v;
  const { r, g, b } = hexRgb(hex);
  v = `rgb(${Math.round(r * amt)},${Math.round(g * amt)},${Math.round(b * amt)})`;
  shadeCache.set(key, v);
  return v;
}

function mix(a: string, b: string, t: number): string {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  return `rgb(${Math.round(ca.r + (cb.r - ca.r) * t)},${Math.round(ca.g + (cb.g - ca.g) * t)},${Math.round(
    ca.b + (cb.b - ca.b) * t,
  )})`;
}

function hexRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
