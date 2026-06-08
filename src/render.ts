// Canvas2D renderer. Draws the world to an offscreen buffer with additive bloom,
// then composites to screen with optional chromatic aberration (channel-split)
// and a vignette. Shape-coded enemies (colorblind-friendly) + glowing neon.

import { TUNE, COMBO_COLORS, BEACON, MIRRORBLADE, ELITE } from './tune';
import { clamp } from './vec';
import type { World } from './world';
import type { Enemy, Bullet } from './types';
import type { ThemeDef } from './themes';
import { themeById } from './themes';

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
  private biomeTint: [string, string, string] | null = null;

  setTheme(t: ThemeDef): void {
    this.theme = t;
  }

  /** Override the nebula tint during a run (biome stage); null = use theme. */
  setBiomeTint(c: [string, string, string] | null): void {
    this.biomeTint = c;
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
  render(world: World, cam: Camera, opts: RenderOpts): void {
    const { bctx, dpr } = this;
    // ── draw the world to the buffer ──
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = 'source-over';
    bctx.fillStyle = '#0a0b0f';
    bctx.fillRect(0, 0, this.buf.width, this.buf.height);

    // deep-space background (screen-space, behind the camera so it stays calm)
    this.bgT += 1 / 60;
    this.drawBackground(opts.combo);

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
    this.drawParticlesBelow(world);
    this.drawBullets(world);
    this.drawEnemies(world, opts);
    if (world.player.alive || world.player.hitFlash > 0) this.drawPlayer(world);
    this.drawParticlesAbove(world);
    this.drawFloatingText(world);
    bctx.restore();

    // ── composite buffer → screen ──
    this.present(opts, cam);
    this.drawVignette(opts, world);
  }

  private drawBackground(combo: number): void {
    const ctx = this.bctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.globalCompositeOperation = 'lighter';
    const heat = 1 + Math.min(combo, 40) * 0.012;

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
      ctx.globalAlpha = 0.10 * heat;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // parallax starfield — near stars drift faster, all twinkle
    ctx.globalAlpha = 1;
    for (const s of this.stars) {
      const dy = (this.bgT * 7 * s.z) % this.h;
      const y = (s.y + dy) % this.h;
      const tw = 0.45 + 0.55 * Math.sin(this.bgT * s.tw + s.phase);
      const a = s.z * tw * 0.5 * heat;
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

  private drawPlayer(world: World): void {
    const ctx = this.bctx;
    const p = world.player;

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
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = this.theme.accent2;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      for (let i = 1; i <= 4; i++) {
        const t = i / 5;
        const gx = p.dashFromX + (p.x - p.dashFromX) * t;
        const gy = p.dashFromY + (p.y - p.dashFromY) * t;
        const s = 0.7 + 0.3 * t; // ghosts grow toward the ship
        ctx.globalAlpha = 0.22 + 0.4 * t;
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
      : clamp(TUNE.juice.aberrationBase + opts.combo * TUNE.juice.aberrationPerCombo, 0, TUNE.juice.aberrationMax);

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
  }

  private drawVignette(opts: RenderOpts, world: World): void {
    const sctx = this.sctx;
    const W = this.screen.width;
    const H = this.screen.height;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = 'source-over';
    const lowHp = world.player.alive && world.player.iframe <= 0 && world.player.stamina < 100;
    const edge = 0.5 + (lowHp ? 0.12 : 0);
    const grad = sctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.62);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${edge})`);
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, W, H);

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
