// Canvas2D renderer. Draws the world to an offscreen buffer with additive bloom,
// then composites to screen with optional chromatic aberration (channel-split)
// and a vignette. Shape-coded enemies (colorblind-friendly) + glowing neon.

import { TUNE, COMBO_COLORS, WARDEN, BEACON, MIRRORBLADE, ELITE, HOLLOW, SOVEREIGN, HERALD, SHIELD, THREAT_RIM, BIOMECH } from './tune';
import type { CipherState } from './cipher';
import { POWERUPS } from './powerups';
import { powerupGlyphColored } from './glyphArt';
import { clamp } from './vec';
import type { World } from './world';
import { bulletVisual } from './bulletStyle';
import type { Enemy, Bullet, EnemyKind } from './types';
import type { ThemeDef } from './themes';
import { trailById } from './trails';
import type { TrailDef } from './trails';
import { drawShipSkin } from './shipSkins';
import { skinById, defaultSkinId } from './skins';
import type { Lod, SkinDef } from './skins';
import { themeById } from './themes';
import { shipById } from './ships';
import { drawShipSilhouette } from './shipModels';
import { markFor, type Mark } from './cipherDecode';
import { sigilFor } from './cipherSigils';
import {
  washSaturation,
  cityGlowAlpha,
  skylineAlpha,
  showWindows,
  bgExposure,
  vignetteDeepenFactor,
  beatFlashRing,
  threatRim,
  nebulaBlobCount,
  bossEntranceBlur,
  allowChromaticAberration,
} from './renderMath';
// NEW boss-rework telegraph/finale overlays (kept OUT of this file — drawn in the
// boss-centre frame). render.ts only delegates; no inline drawing was added.
import { drawNovaSpiralTelegraph, drawSovereignFinaleTint, drawBeaconCounterBeam, drawBossFinaleTint, drawBossIntelRead } from './render/boss';
import { drawEnemyTells } from './render/enemyTells';
import { drawSpear } from './render/spear';
import { mix, mixHex, hexRgb } from './render/colorMix';
import { beaconEnraged } from './bosses/beacon';

// CIPHER core decoded-state colours (the universal "recovered" green; recedes vs the
// per-boss to-key tint). State always reads via brightness + the mark + a HUD ✓, never hue.
const CIPHER_DECODED = '#5ce0b0';
const CIPHER_DECODED_RING = '#34d399';
// Lazily-built Path2D per designed sigil — Path2D is browser-only, so it's NEVER touched at
// module load (keeps render.ts importable in a non-DOM test env). Keyed by glyph index 0..9.
const SIGIL_PATH_CACHE: (Path2D | undefined)[] = [];
function sigilPath2D(index: number): Path2D {
  let p = SIGIL_PATH_CACHE[index];
  if (!p) {
    p = new Path2D(sigilFor(index).d);
    SIGIL_PATH_CACHE[index] = p;
  }
  return p;
}

// ── BIOMECHANICAL enemy art direction (Proposal B) ──────────────────────────
// Enemies/bosses render as "living machines": their shape-coded silhouette
// (unchanged, colorblind-safe) gains a dark carapace, a constant neon threat-rim,
// glowing bio-veins, sensor-cluster "eyes", and a pulsing organic core. Purely
// cosmetic — no sim/determinism impact. (This was once gated behind a BIOMECH_ENEMIES
// flag with a flat-neon A/B fallback; the flag had been hard-on since launch so the
// fallback was unreachable dead code, and it was removed for bundle size.)

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
  firstLight: number; // 0..1 — FIRST LIGHT victory day-wash (the sun returns on a win)
  cipherAssist: boolean; // re-light the next cipher core (Casual / opt-in decode assist)
}

// How far the in-run background tint leans toward the BIOME vs the cosmetic PALETTE.
// 0 = pure palette (biome ignored), 1 = pure biome (old behaviour, palette hidden).
// 0.5 keeps both legible: the palette is always felt, biomes still shift the mood.
const BIOME_TINT_LEAN = 0.5;
// How far the player ship's signature accent leans toward the PALETTE accent. Kept low so
// each ship's identity colour (roster read) survives while the palette is still felt on the hull.
const SHIP_PALETTE_LEAN = 0.4;

export class Renderer {
  private screen: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private buf: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private tint: HTMLCanvasElement;
  private tctx: CanvasRenderingContext2D;
  private glowCache = new Map<string, HTMLCanvasElement>();
  private puGlyphImg = new Map<string, HTMLImageElement>();
  dpr = 1;
  w = 1280;
  h = 720;
  private flashColor = '#ffffff';
  private flashAlpha = 0;
  private stars: { x: number; y: number; z: number; phase: number; tw: number }[] = [];
  private bgT = 0;
  private theme: ThemeDef = themeById('neon');
  private trail: TrailDef = trailById('pulse');
  // Equipped cosmetic ship-skin SET id ('none' = the plain hull). Drawn over the player body
  // ONLY in the calm state (no hit-flash / i-frame), so gameplay reads are never masked.
  private shipSkin = 'none';
  // Equipped enemy SKINS, pre-resolved per kind to a SkinDef (cosmetic). null =
  // use the committed biomech fallback for that kind. Set once per run/equip via
  // setSkins() — the per-enemy draw path does a cheap map lookup, no string work.
  private skins = new Map<string, SkinDef | null>();
  private biomeTint: [string, string, string] | null = null;
  // Effective in-run background tint = the cosmetic PALETTE blended with the active biome's
  // tint (so the chosen palette is always visible in-game, while biomes still shift the mood).
  // Recomputed only on setTheme/setBiomeTint, not per frame. effCity tints the skyline accent.
  private effNebula: [string, string, string] = themeById('neon').nebula;
  private effCity: string = themeById('neon').accent;
  // ── THE LAST LANCE one-bus (render half) — pushed each frame by setCoherence ──
  private coherence = 0;
  private focusPulse = 0;
  private beatFlash = 0; // C1 — localized beat-grade ring envelope (pushed by setCoherence)
  private collapseDip = 0; // C3 — the felt-FALL wash dip (pushed by setCoherence)
  private quality = 1; // perf-adaptive (1 = full; lower under load)
  private reduceMotionR = false;
  private clarityR = false;
  private colorblindR = false;
  private reduceFlashingR = false;
  private slingshotR = false;
  private firstLightR = 0; // FIRST LIGHT victory day-wash (0..1), set per frame from the win cinematic
  private cipherAssistR = false; // re-light the next cipher core (Casual / opt-in decode assist)
  private ghostX: number | null = null;
  private ghostY = 0;
  private towers: { x: number; w: number; h: number; band: number }[] = [];

  setTheme(t: ThemeDef): void {
    this.theme = t;
    this.recomputeTint();
  }

  setTrail(t: TrailDef): void {
    this.trail = t;
  }

  /** Equip the cosmetic ship-skin set ('none' = the plain hull). Pure cosmetic. */
  setShipSkin(id: string): void {
    this.shipSkin = id;
  }

  /** Equip the player's enemy-skin selection (EnemyKind → skinId). Resolves each
   *  to a SkinDef once; an unknown / un-ported / default id resolves to null so
   *  drawEnemy falls back to the committed biomech draw. Cosmetic only. */
  setSkins(selected: Record<string, string>): void {
    this.skins.clear();
    for (const kind of Object.keys(selected) as EnemyKind[]) {
      const id = selected[kind];
      // the kind's '<kind>-default' baseline IS the biomech fallback — store null
      // so the hot path skips the skin draw entirely for an unmodified kind.
      this.skins.set(kind, id === defaultSkinId(kind) ? null : skinById(id));
    }
  }

  /** Override the nebula tint during a run (biome stage); null = use the pure theme palette. */
  setBiomeTint(c: [string, string, string] | null): void {
    this.biomeTint = c;
    this.recomputeTint();
  }

  /** Recompute the cached in-run background tint: the cosmetic PALETTE (theme) blended with
   *  the active biome tint so the player's chosen palette stays visible during a run. Called
   *  only on a theme/biome change (never per frame). On menus (biomeTint null) the pure
   *  palette shows; in a run the two are mixed by BIOME_TINT_LEAN. */
  private recomputeTint(): void {
    const t = this.theme.nebula;
    const b = this.biomeTint;
    this.effNebula = b
      ? [mixHex(t[0], b[0], BIOME_TINT_LEAN), mixHex(t[1], b[1], BIOME_TINT_LEAN), mixHex(t[2], b[2], BIOME_TINT_LEAN)]
      : [t[0], t[1], t[2]];
    this.effCity = b ? mixHex(this.theme.accent, b[1], BIOME_TINT_LEAN) : this.theme.accent;
  }

  /** THE ONE BUS (render half) — pushed each frame: the eased Coherence value +
   *  the Perfect-dash focus-snap envelope. Read by the wash, skyline, and glow. */
  setCoherence(c: number, focus: number, beatFlash = 0, collapseDip = 0): void {
    this.coherence = c;
    this.focusPulse = focus;
    this.beatFlash = beatFlash;
    this.collapseDip = collapseDip;
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

  /** Rasterize a power-up's maximalist glyph (its buff colour baked in, since currentColor
   *  can't resolve inside an <img>) to a cached Image, for drawing on the field pickup. */
  private getPowerupGlyph(kind: keyof typeof POWERUPS): HTMLImageElement {
    let img = this.puGlyphImg.get(kind);
    if (img) return img;
    img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(powerupGlyphColored(kind, POWERUPS[kind].color));
    this.puGlyphImg.set(kind, img);
    return img;
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
    this.firstLightR = opts.firstLight;
    this.cipherAssistR = opts.cipherAssist;
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
    this.drawSuddenDeath(world);
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
    sctx.shadowBlur = bossEntranceBlur(this.quality, this.dpr); // 28×dpr at full quality; 0 under load
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
    const city = this.colorblindR ? '#aebfe0' : this.effCity;
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

    // drifting nebula clouds (biome tint during a run, else the cosmetic theme).
    // perf: each blob is a full-screen radial-gradient fill (the heaviest per-frame GPU
    // op) — at quality 1 ALL blobs draw (look unchanged); under load the count thins.
    const nb = this.effNebula;
    const blobs: [number, number, string, number][] = [
      [0.26, 0.32, nb[0], 0.9],
      [0.72, 0.34, nb[1], 1.3],
      [0.5, 0.74, nb[2], 1.1],
    ];
    const blobN = nebulaBlobCount(this.quality);
    const R = Math.max(this.w, this.h) * 0.42;
    for (const [fx, fy, col, sp] of blobs.slice(0, blobN)) {
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

  /** §4 M2 — the NIGHTMARE sudden-death walls: a red danger band + border at the
   *  shrinking safe zone (world-space, exactly matching the player clamp). Static, no
   *  flash/animation, so it is reduce-motion/reduce-flashing safe by construction. */
  private drawSuddenDeath(world: World): void {
    if (world.sdInset <= 0) return;
    const ctx = this.bctx;
    const w = world.width;
    const h = world.height;
    const ix = w * world.sdInset;
    const iy = h * world.sdInset;
    ctx.save();
    ctx.fillStyle = 'rgba(239,68,68,0.10)';
    ctx.fillRect(0, 0, w, iy); // top band
    ctx.fillRect(0, h - iy, w, iy); // bottom band
    ctx.fillRect(0, iy, ix, h - 2 * iy); // left band
    ctx.fillRect(w - ix, iy, ix, h - 2 * iy); // right band
    ctx.strokeStyle = 'rgba(239,68,68,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ix, iy, w - 2 * ix, h - 2 * iy);
    ctx.restore();
  }

  private drawGems(world: World): void {
    // Playtest (Nick): "XP looks like bullets." The old gem was a soft additive glow in
    // #34d399 — the EXACT hue the Weaver fires — i.e. the same idiom AND colour as enemy
    // fire. So XP is now the opposite of a bullet on every axis: a crisp SOURCE-OVER gold
    // diamond with a hard white outline (legible through bloom), faceted, gently tumbling.
    // Shape + render-mode + reserved loot-hue all read "collect me", not "dodge me". The
    // halo is kept small + dim so it never reads as a round threat blob. Render-only,
    // deterministic phase (no new gem state); motion is dropped under reduceMotion.
    const ctx = this.bctx;
    ctx.save();
    world.gems.forEachActive((g) => {
      const big = g.value >= 5; // elite/boss shards are chunkier + brighter
      const r = big ? 7.5 : 5.5;
      const fade = g.life < 1.5 ? Math.max(0.25, g.life / 1.5) : 1; // blink-out near despawn
      const spin = this.reduceMotionR ? 0 : g.life * 1.6 + (g.x + g.y) * 0.05; // per-gem phase
      ctx.save();
      ctx.translate(g.x, g.y);
      // small dim halo — shine, not a bullet-sized bloom
      ctx.globalCompositeOperation = 'lighter';
      const glow = this.getGlow('#ffd24a');
      ctx.globalAlpha = 0.45 * fade;
      ctx.drawImage(glow, -r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
      // crisp faceted body — SOURCE-OVER hard edge, opaque, unmistakably not a glow dot
      ctx.globalCompositeOperation = 'source-over';
      ctx.rotate(spin);
      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.72, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.72, 0);
      ctx.closePath();
      ctx.fillStyle = big ? '#ffe07a' : '#ffd24a';
      ctx.fill();
      ctx.strokeStyle = '#fffbe6'; // hard white-gold rim → silhouette survives bloom
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // vertical facet seam — sells "gem", further separates it from a round bullet
      ctx.globalAlpha = fade * 0.8;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(0, r);
      ctx.stroke();
      ctx.restore();
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
      ctx.drawImage(glow, -30, -30, 60, 60);
      // slow-rotating hex ring frame — keeps the "pickup spins" energy without spinning the art
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fade * 0.8;
      ctx.save();
      ctx.rotate(u.spin * 0.5);
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 1.6;
      ngonStroke(ctx, 6, 16);
      ctx.restore();
      // the buff's maximalist glyph (upright, rasterized SVG, buff-coloured) — telegraphs WHAT is dropping
      const img = this.getPowerupGlyph(u.kind);
      ctx.globalAlpha = fade;
      if (img.complete && img.naturalWidth) {
        ctx.drawImage(img, -14, -14, 28, 28);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      }
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
    // Playtest (Nick): bullets need identity per enemy + shot type, not colour alone. The
    // additive glow + THREAT RIM (§7b, a11y-legible through bloom) + bright core stay the base
    // for EVERY style; on top, the SILHOUETTE varies — velocity-aligned darts (fast aimed
    // bolts), a tailed comet (the homing SEEKER bolt, which must never read as ballistic), a
    // parked diamond + warning ring (orbiter mine), and a heavier double-ring for boss fire.
    const ctx = this.bctx;
    ctx.save();
    world.bullets.forEachActive((b: Bullet) => {
      const glow = this.getGlow(b.color);
      const r = b.radius;
      const vis = bulletVisual(b);
      const aligned = vis === 'dart' || vis === 'comet';
      const ang = aligned ? Math.atan2(b.vy, b.vx) : 0;
      // ── additive bloom (its shape depends on the style) ──
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      if (aligned) {
        const lead = vis === 'comet' ? 3.6 : 2.6; // the comet's bloom trails further back
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        ctx.drawImage(glow, -r * lead, -r * 2.2, r * (lead + 2.2), r * 4.4);
        ctx.restore();
      } else {
        const s = vis === 'bossHeavy' ? 3.0 : 2.4; // boss fire blooms bigger/heavier than chaff
        ctx.drawImage(glow, b.x - r * s, b.y - r * s, r * 2 * s, r * 2 * s);
      }
      // ── threat-rim silhouette (source-over → a legible outline through the bloom) ──
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = THREAT_RIM.bulletAlpha;
      ctx.strokeStyle = threatRim(b.color, THREAT_RIM.bulletLift);
      ctx.lineWidth = THREAT_RIM.bulletWidth;
      if (aligned) {
        // a forward-pointing kite/teardrop along the heading (comet has a longer tail)
        const nose = vis === 'comet' ? r * 2.2 : r * 1.9;
        const tail = vis === 'comet' ? r * 1.7 : r * 0.9;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(nose, 0);
        ctx.lineTo(0, -r * 0.85);
        ctx.lineTo(-tail, 0);
        ctx.lineTo(0, r * 0.85);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      } else if (vis === 'mine') {
        // a parked diamond + a wider warning ring → "area-denial, give it space"
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r, 0);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = THREAT_RIM.bulletAlpha * 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.stroke();
        if (vis === 'bossHeavy') {
          ctx.globalAlpha = THREAT_RIM.bulletAlpha * 0.55; // a second outer ring → reads heavier than chaff
          ctx.beginPath();
          ctx.arc(b.x, b.y, r * 1.7, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // ── bright high-contrast core (every style) so bullets stay readable through bloom ──
      ctx.globalCompositeOperation = 'lighter';
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
    // shipId is threaded down so the Mirrorblade can wear the player's silhouette
    // (the imitation game, SHOWN) — see drawMirrorblade.
    world.enemies.forEachActive((e) => this.drawEnemy(ctx, e, opts, world.shipId));
    // NEW enemy-overhaul role tells — a separate pass so they layer ON TOP of the bodies.
    // All drawing lives in render/enemyTells.ts; this is a one-line delegation (no inline
    // tell drawing was added to render.ts / skins.ts).
    drawEnemyTells(ctx, world, this.bgT, this.reduceMotionR, this.reduceFlashingR);
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, opts: RenderOpts, shipId: string): void {
    const flash = e.hitFlash > 0;
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
    // THREAT RIM (§7b) — the body OUTLINE is the threat's neon colour lifted toward
    // white. The COHERENCE wash blends with 'saturation' (luminance-preserving), so
    // this bright outline stays a legible neon edge even when the frame desaturates
    // at low combo, while the dark fill rides the wash. A flashing enemy keeps its
    // white outline (already max-luminance). Steady, no envelope → reduceFlashing /
    // clarity safe, never strobes. (colorblind already widens lineWidth above.)
    const rimColor = flash ? '#ffffff' : threatRim(e.color, THREAT_RIM.lift);
    ctx.strokeStyle = rimColor;
    ctx.fillStyle = flash ? '#ffffff' : shade(e.color, 0.18);

    // COSMETIC SKIN dispatch — if the player has equipped a ported skin for this
    // kind, draw it instead of the biomech detailing pass. The skin gets the same
    // pre-state (translated, rimColor stroke, dark fill) PLUS an LOD tier + a time.
    // It's wrapped in its own save/restore so its scale/rotate never leaks into the
    // shield-arc pass below. Cosmetic only — silhouette + threat-rim preserved.
    const skin = this.skins.get(e.kind);
    if (skin) {
      const lod = this.enemyLod(e, r);
      ctx.save();
      skin.draw(ctx, e, r, { rimColor, flash, opts, lod, t: this.bgT });
      ctx.restore();
    } else {
      // BIOMECH (Proposal B) — the living-machine detailing pass: the shape-coded
      // silhouette (preserved per-case) with an enriched living-machine interior.
      // (The old flat-neon switch was dead code — BIOMECH was hard-on since launch,
      // so the else-if always won — and was deleted for bundle size.)
      this.drawEnemyBiomech(ctx, e, r, opts, shipId, flash, rimColor);
    }

    // shield arc
    if (e.shielded) {
      // The legacy/biomech darter leaves its heading rotation on the ctx (its case has no
      // own save/restore), so undo it here for the world-space arc. A SKIN draw is wrapped
      // in its own save/restore by the dispatch above, so its rotation is already gone —
      // only undo when no skin drew, or we'd over-rotate the block cone by -heading.
      if (!skin) ctx.rotate(-(Math.atan2(e.vy, e.vx) || 0)); // undo darter rotation if any
      ctx.strokeStyle = '#9ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, e.shieldAngle - SHIELD.arcHalf, e.shieldAngle + SHIELD.arcHalf);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** LOD tier for a cosmetic enemy skin, from the on-screen radius + perf tier.
   *  This is the headline perf lever: bloom-heavy skin draws × many enemies × 60fps.
   *    'full' — bosses/elites, or a large body when perf is healthy: every flourish.
   *    'mid'  — the common case (~24px among many): shadowBlur capped, motes dropped.
   *    'far'  — tiny bodies, OR any body once the adaptive director steps quality
   *             down under load: glyph only (silhouette + core, no glow/blur).
   *  `r` is the post-scale render radius (already includes the pop tween). Thresholds
   *  (px): ≥34 → full, ≥16 → mid, else far; bosses/elites always full; quality<0.7
   *  demotes one tier (full→mid, mid→far) so the skin layer sheds with the renderer. */
  private enemyLod(e: Enemy, r: number): Lod {
    if (e.isBoss || e.elite) return 'full';
    let lod: Lod = r >= 34 ? 'full' : r >= 16 ? 'mid' : 'far';
    if (this.quality < 0.7) lod = lod === 'full' ? 'mid' : 'far';
    return lod;
  }

  /** Resting bio-vein breath: a slow sin pulse around the vein alpha. Frozen at its
   *  mid value under reduceMotion (a11y) and clamped to [0,1]. `aggro` 0..1 (telegraph)
   *  lifts the veins brighter when a creature is about to act — that's gameplay state,
   *  not decoration, so it is honoured even under reduceMotion. */
  private bioPulse(aggro = 0): number {
    const breath = this.reduceMotionR ? 0 : Math.sin(this.bgT * BIOMECH.pulseSpeed) * BIOMECH.pulseDepth;
    return clamp(BIOMECH.veinAlpha + breath + aggro * 0.22, 0, 1);
  }

  /** BIOMECH dispatcher — draws the living-machine version of every small enemy and
   *  routes bosses/elites to their *Biomech methods. The caller has already: drawn the
   *  glow + (elite) aura, translated to the enemy, and set strokeStyle=rimColor (the
   *  constant neon threat-rim) + fillStyle=dark carapace. Each case re-uses the EXACT
   *  legacy silhouette so colourblind shape-coding is preserved; the biomech layer is
   *  additive (veins + plates + sensor cores). */
  private drawEnemyBiomech(
    ctx: CanvasRenderingContext2D,
    e: Enemy,
    r: number,
    opts: RenderOpts,
    shipId: string,
    flash: boolean,
    rimColor: string,
  ): void {
    const col = e.color;
    const tele = e.telegraph || 0;
    switch (e.kind) {
      case 'darter': {
        // manta carapace — the arrowhead silhouette (concave back), unchanged. Add a
        // spine bio-vein, swept-back tendrils, a core behind the snout + a nose sensor.
        const t = 1 + tele * 0.5;
        ctx.rotate(Math.atan2(e.vy, e.vx) || 0);
        ctx.scale(t, t);
        // trailing bio-vein tendrils (swept back along -x)
        ctx.save();
        beginVeins(ctx, col, this.bioPulse(tele) * 0.55, flash);
        ctx.beginPath();
        ctx.moveTo(-r * 0.4, r * 0.25);
        ctx.bezierCurveTo(-r * 0.7, r * 0.35, -r * 0.95, r * 0.55, -r * 1.05, r * 0.7);
        ctx.moveTo(-r * 0.4, -r * 0.25);
        ctx.bezierCurveTo(-r * 0.7, -r * 0.35, -r * 0.95, -r * 0.55, -r * 1.05, -r * 0.7);
        ctx.stroke();
        ctx.restore();
        // carapace silhouette (legacy arrowhead points)
        poly(ctx, [
          [r, 0],
          [-r * 0.8, r * 0.7],
          [-r * 0.4, 0],
          [-r * 0.8, -r * 0.7],
        ]);
        // spine vein down the body
        ctx.save();
        beginVeins(ctx, col, this.bioPulse(tele), flash);
        ctx.beginPath();
        ctx.moveTo(-r * 0.3, 0);
        ctx.lineTo(r * 0.7, 0);
        ctx.stroke();
        ctx.restore();
        // core just behind the snout + a forward nose sensor
        ctx.save();
        ctx.translate(r * 0.18, 0);
        bioCore(ctx, col, r, flash);
        ctx.restore();
        bioNode(ctx, col, r * 0.92, 0, r * 0.16, flash);
        break;
      }
      case 'orbiter': {
        // hex carapace ring (unchanged), with radial armour spokes, an eye-core inside
        // a lit plate, and three orbiting sensor dots.
        ngon(ctx, 6, r);
        // radial spokes from the core toward each hex vertex
        ctx.save();
        beginVeins(ctx, col, this.bioPulse(tele), flash);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          ctx.moveTo(Math.cos(a) * r * 0.46, Math.sin(a) * r * 0.46);
          ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
        }
        ctx.stroke();
        ctx.restore();
        // eye plate + core
        ctx.fillStyle = flash ? '#ffffff' : shade(col, BIOMECH.plateFill);
        ctx.strokeStyle = rimColor;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.46, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        bioCore(ctx, col, r, flash);
        // orbiting sensor dots (static positions — no per-frame motion needed)
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
          ctx.save();
          ctx.globalAlpha = 0.5;
          bioNode(ctx, col, Math.cos(a) * r * 1.18, Math.sin(a) * r * 1.18, r * 0.13, flash);
          ctx.restore();
        }
        break;
      }
      case 'splitter': {
        // diamond carapace (unchanged), with a fracture-seam vein (the split tell) and
        // two embryo cores either side of the seam.
        ctx.rotate(Math.PI / 4);
        rect(ctx, r * 1.3);
        // fracture seam — a jagged vein down the diamond's vertical axis (pre-rotation
        // it's a diagonal; that's the split line). Drawn in local rect space.
        ctx.save();
        beginVeins(ctx, col, this.bioPulse(tele), flash);
        const h = r * 1.3;
        ctx.beginPath();
        ctx.moveTo(0, -h);
        ctx.lineTo(-h * 0.18, -h * 0.3);
        ctx.lineTo(h * 0.2, h * 0.1);
        ctx.lineTo(-h * 0.15, h * 0.45);
        ctx.lineTo(0, h);
        ctx.stroke();
        ctx.restore();
        // twin embryo cores
        bioNode(ctx, col, -h * 0.34, 0, r * 0.22, flash);
        bioNode(ctx, col, h * 0.34, 0, r * 0.22, flash);
        break;
      }
      case 'mini': {
        // mini diamond (unchanged) with a single hatch core + a faint ghost-sibling
        // diamond trailing it (it's a brood/splitter spawn).
        ctx.rotate(Math.PI / 4);
        // ghost sibling, offset back-left (in rotated space)
        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.translate(-r * 1.1, -r * 1.1);
        rect(ctx, r * 0.85);
        ctx.restore();
        rect(ctx, r * 1.3);
        bioCore(ctx, col, r, flash);
        break;
      }
      case 'bloomer': {
        // square pod (unchanged) with four petal plates on the faces, a pistil core +
        // four stamen pips, and the legacy telegraph bloom ring.
        rect(ctx, r * 1.25);
        // petal plates on each face (triangles pointing out)
        ctx.fillStyle = flash ? '#ffffff' : shade(col, BIOMECH.plateFill);
        ctx.strokeStyle = rimColor;
        const pr = r * 1.25;
        const petal = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void => {
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.lineTo(cx, cy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        };
        petal(-pr * 0.3, -pr, pr * 0.3, -pr, 0, -pr * 1.5); // top
        petal(-pr * 0.3, pr, pr * 0.3, pr, 0, pr * 1.5); // bottom
        petal(-pr, -pr * 0.3, -pr, pr * 0.3, -pr * 1.5, 0); // left
        petal(pr, -pr * 0.3, pr, pr * 0.3, pr * 1.5, 0); // right
        bioCore(ctx, col, r, flash);
        // stamen pips around the pistil
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          ctx.save();
          ctx.globalAlpha = 0.6;
          bioNode(ctx, col, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.1, flash);
          ctx.restore();
        }
        // legacy telegraph bloom ring (gameplay tell — kept, rim-coloured)
        ctx.strokeStyle = rimColor;
        ctx.globalAlpha = 0.5 + 0.5 * tele;
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.6 + tele * 0.6), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'lancer': {
        this.drawLancerBiomech(ctx, e, r, flash, rimColor);
        break;
      }
      case 'bomber': {
        // armoured circular shell (unchanged) with radial mine-prongs, an inner hex
        // plate, and a hazard core that pulses faster on the detonation wind-up.
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // mine prongs radiating out (8 spokes)
        ctx.save();
        beginVeins(ctx, col, this.bioPulse(tele), flash);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          ctx.lineTo(Math.cos(a) * r * 1.28, Math.sin(a) * r * 1.28);
        }
        ctx.stroke();
        ctx.restore();
        // inner hex armour plate
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = rimColor;
        ctx.lineWidth = 1.2;
        ngonStroke(ctx, 6, r * 0.62);
        ctx.restore();
        // hazard core — brighter/larger during the death-arming pulse
        const armed = tele > 0 ? 0.5 + 0.5 * (this.reduceMotionR ? 0.5 : Math.abs(Math.sin(e.spawnTime * 18))) : 0.4;
        ctx.fillStyle = flash ? '#ffffff' : threatRim(col, BIOMECH.coreLift);
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.3 + 0.12 * tele), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${armed})`;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'wisp': {
        // a single arrowhead (the pack member) — legacy silhouette unchanged — with a
        // spine vein and a forward sensor pip. (Each pack member is one entity.)
        ctx.rotate(Math.atan2(e.vy, e.vx) || 0);
        poly(ctx, [
          [r, 0],
          [-r * 0.7, r * 0.7],
          [-r * 0.7, -r * 0.7],
        ]);
        ctx.save();
        beginVeins(ctx, col, this.bioPulse(tele), flash);
        ctx.beginPath();
        ctx.moveTo(-r * 0.4, 0);
        ctx.lineTo(r * 0.6, 0);
        ctx.stroke();
        ctx.restore();
        bioNode(ctx, col, r * 0.55, 0, r * 0.18, flash);
        break;
      }
      case 'drifter': {
        this.drawDrifterBiomech(ctx, e, r, flash, rimColor);
        break;
      }
      case 'shade': {
        // blinking square (unchanged: rotated rect) with a void core (hollow ring, no
        // fill — contact-lethal, fires no bullets), a phase-echo ghost, and the legacy
        // pre-blink warning ring.
        const warn = tele;
        if (warn > 0) {
          ctx.globalAlpha = 0.3 + 0.5 * warn;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, r * (1.4 + warn * 0.8), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = rimColor;
          ctx.lineWidth = opts.colorblind ? 3 : 2;
        }
        const spin = this.reduceMotionR ? 0 : e.spawnTime * 1.5;
        // phase-echo ghost (mid-teleport), offset-rotated and dim
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.rotate(Math.PI / 4 + spin + 0.5);
        rect(ctx, r * 1.2);
        ctx.restore();
        // solid body
        ctx.save();
        ctx.rotate(Math.PI / 4 + spin);
        rect(ctx, r * 1.2);
        ctx.restore();
        // void core — a hollow ring (no nucleus fill) with a hot pip: it consumes, not emits
        ctx.strokeStyle = flash ? '#ffffff' : threatRim(col, BIOMECH.veinLift);
        ctx.lineWidth = BIOMECH.veinWidth + 0.4;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'brooder': {
        // hex carrier pod (unchanged) with a translucent brood belly (inner hex plate),
        // egg dots, a pulsing hatch core, and orbiting drone(s).
        const spin = this.reduceMotionR ? 0 : e.spawnTime * 0.3;
        ctx.save();
        ctx.rotate(spin);
        ngon(ctx, 6, r);
        ctx.restore();
        // brood belly plate
        ctx.fillStyle = flash ? '#ffffff' : shade(col, BIOMECH.plateFill);
        ctx.strokeStyle = rimColor;
        ctx.save();
        ctx.rotate(spin);
        ngon(ctx, 6, r * 0.62);
        ctx.restore();
        // egg dots (minis waiting to hatch) — static cluster
        ctx.fillStyle = flash ? '#ffffff' : threatRim(col, BIOMECH.veinLift);
        ctx.globalAlpha = 0.55;
        for (const [ex, ey] of [
          [-r * 0.28, -r * 0.1],
          [r * 0.26, -r * 0.18],
          [-r * 0.08, r * 0.28],
        ]) {
          ctx.beginPath();
          ctx.arc(ex, ey, r * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // pulsing hatch core — flickers brighter in the hatch wind-up
        const pulse = tele > 0 ? 0.4 + 0.6 * (this.reduceMotionR ? 0.5 : Math.abs(Math.sin(e.spawnTime * 22))) : 0.4;
        ctx.fillStyle = flash ? '#ffffff' : threatRim(col, BIOMECH.coreLift);
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.3 + 0.12 * tele), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${pulse})`;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
        // orbiting drone above the pod
        ctx.globalAlpha = 0.5;
        bioNode(ctx, col, 0, -r * 1.2, r * 0.13, flash);
        ctx.globalAlpha = 1;
        break;
      }
      case 'herald': {
        this.drawHeraldBiomech(ctx, e, r, flash, rimColor);
        break;
      }
      case 'seeker': {
        this.drawSeekerBiomech(ctx, e, r, flash, rimColor);
        break;
      }
      // bosses + sub-entities — dedicated biomech methods
      case 'hollow':
        this.drawHollowBiomech(ctx, e, r);
        break;
      case 'hollow_echo':
        this.drawHollowEchoBiomech(ctx, e, r);
        break;
      case 'warden':
        this.drawWardenBiomech(ctx, e, r);
        break;
      case 'weaver':
        this.drawWeaverBiomech(ctx, e, r);
        break;
      case 'beacon':
        this.drawBeaconBiomech(ctx, e, r);
        break;
      case 'mirrorblade':
        this.drawMirrorblade(ctx, e, r, shipId); // already a bespoke silhouette echo — biomech-neutral
        break;
      case 'sovereign':
        this.drawSovereignBiomech(ctx, e, r);
        break;
      case 'sovereign_core':
        this.drawSovereignCore(ctx, e, r); // small cipher pip; legacy read is already ideal
        break;
    }
    // NEW: generic last-stand FINALE tint (no-op unless e.finaleTrig — the 5 non-Sovereign
    // bosses; the Sovereign uses its own crescendo tint). Drawn in render/boss.ts.
    drawBossFinaleTint(ctx, e, this.reduceMotionR);
    // INTEL READ RING — early tell halo for intel-flagged bosses (render-only). Drawn in render/boss.ts.
    drawBossIntelRead(ctx, e, this.reduceMotionR);
  }

  /** LANCER (biomech) — railgun barrel silhouette (elongated triangle, unchanged) with
   *  segmentation veins, a breech core, and a muzzle charge node. Keeps the legacy LOCK
   *  aim-line telegraph (the dodge tell). */
  private drawLancerBiomech(
    ctx: CanvasRenderingContext2D,
    e: Enemy,
    r: number,
    flash: boolean,
    rimColor: string,
  ): void {
    const col = e.color;
    const tele = e.telegraph || 0;
    // the LOCK aim line (legacy gameplay tell)
    if (tele > 0) {
      ctx.save();
      ctx.rotate(e.angle);
      ctx.strokeStyle = `rgba(255,160,80,${0.18 + 0.55 * tele})`;
      ctx.lineWidth = 1.5 + 2.5 * tele;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(1600, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    ctx.rotate(tele > 0 ? e.angle : Math.atan2(e.vy, e.vx) || 0);
    // barrel silhouette (legacy triangle)
    ctx.strokeStyle = rimColor;
    poly(ctx, [
      [r * 1.6, 0],
      [-r * 0.5, r * 0.5],
      [-r * 0.5, -r * 0.5],
    ]);
    // segmentation veins across the barrel
    ctx.save();
    beginVeins(ctx, col, this.bioPulse(tele), flash);
    ctx.beginPath();
    for (const sx of [0, r * 0.55]) {
      ctx.moveTo(sx, -r * 0.34);
      ctx.lineTo(sx, r * 0.34);
    }
    ctx.stroke();
    ctx.restore();
    // breech core (at the wide back end)
    ctx.save();
    ctx.translate(-r * 0.22, 0);
    bioCore(ctx, col, r, flash);
    ctx.restore();
    // muzzle charge node — brightens with the lock
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.4 * tele;
    bioNode(ctx, col, r * 1.3, 0, r * 0.16 + r * 0.08 * tele, flash);
    ctx.restore();
  }

  /** DRIFTER (biomech) — crescent-blade body (concave arc, unchanged) with inner arc
   *  bio-veins and emitter nodes on the convex edge. Keeps the legacy arc-fan tell. */
  private drawDrifterBiomech(
    ctx: CanvasRenderingContext2D,
    e: Enemy,
    r: number,
    flash: boolean,
    rimColor: string,
  ): void {
    const col = e.color;
    const tele = e.telegraph || 0;
    // lock aim line (legacy tell) — drawn in world-facing direction
    if (tele > 0) {
      ctx.save();
      ctx.rotate(e.angle);
      ctx.strokeStyle = `rgba(52,211,153,${0.18 + 0.5 * tele})`;
      ctx.lineWidth = 1.5 + 2 * tele;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(1400, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // crescent body (legacy silhouette: concave arc opening toward travel)
    ctx.rotate((Math.atan2(e.vy, e.vx) || 0) + Math.PI);
    ctx.strokeStyle = rimColor;
    ctx.beginPath();
    ctx.arc(0, 0, r, -1.1, 1.1);
    ctx.arc(r * 0.7, 0, r * 0.9, 0.95, -0.95, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // inner bio-vein following the concave edge
    ctx.save();
    beginVeins(ctx, col, this.bioPulse(tele) * 0.8, flash);
    ctx.beginPath();
    ctx.arc(r * 0.1, 0, r * 0.55, -0.9, 0.9);
    ctx.stroke();
    ctx.restore();
    // emitter nodes on the convex (outer) edge
    bioNode(ctx, col, -r * 0.78, 0, r * 0.18, flash);
    ctx.save();
    ctx.globalAlpha = 0.5;
    bioNode(ctx, col, -r * 0.5, -r * 0.62, r * 0.12, flash);
    bioNode(ctx, col, -r * 0.5, r * 0.62, r * 0.12, flash);
    ctx.restore();
  }

  /** HERALD (biomech) — monolith wall-bar (unchanged tall bar) with a brighter gap-lane
   *  band, segment veins, and an emitter core at the top. Keeps the legacy wall-preview
   *  telegraph with the safe lane shown. */
  private drawHeraldBiomech(
    ctx: CanvasRenderingContext2D,
    e: Enemy,
    r: number,
    flash: boolean,
    rimColor: string,
  ): void {
    const col = e.color;
    const tele = e.telegraph || 0;
    // wall-preview telegraph (legacy: broken dashed wall with the safe lane gap)
    if (tele > 0) {
      ctx.save();
      ctx.rotate(e.angle);
      const a = 0.16 + 0.5 * tele;
      ctx.strokeStyle = `rgba(163,230,53,${a})`;
      ctx.lineWidth = 1.5 + 2.5 * tele;
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
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(0, g);
      ctx.lineTo(26, g);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    // monolith body (legacy: tall bar perpendicular to aim)
    ctx.rotate(e.angle);
    ctx.strokeStyle = rimColor;
    ctx.beginPath();
    ctx.rect(-r * 0.42, -r * 1.15, r * 0.84, r * 2.3);
    ctx.fill();
    ctx.stroke();
    // wall-segment veins across the bar
    ctx.save();
    beginVeins(ctx, col, this.bioPulse(tele), flash);
    ctx.beginPath();
    for (const sy of [-r * 0.55, r * 0.55]) {
      ctx.moveTo(-r * 0.42, sy);
      ctx.lineTo(r * 0.42, sy);
    }
    ctx.stroke();
    ctx.restore();
    // the gap-lane band — a brighter lit panel across the bar's middle (the safe lane)
    ctx.fillStyle = flash ? '#ffffff' : threatRim(col, BIOMECH.coreLift);
    ctx.globalAlpha = 0.28;
    ctx.fillRect(-r * 0.42, -r * 0.22, r * 0.84, r * 0.44);
    ctx.globalAlpha = 1;
    // emitter core at the top of the monolith
    ctx.save();
    ctx.translate(0, -r * 0.78);
    bioCore(ctx, col, r * 0.8, flash);
    ctx.restore();
  }

  /** SEEKER (biomech) — faceted sensor head (pentagon) with a tracking eye, antennae,
   *  and a reticle ring. Keeps the legacy ringed-eye read + lock-on aim line. The pupil
   *  offsets toward the bolt heading (e.angle), reinforcing "it's looking at you." */
  private drawSeekerBiomech(
    ctx: CanvasRenderingContext2D,
    e: Enemy,
    r: number,
    flash: boolean,
    rimColor: string,
  ): void {
    const col = e.color;
    const tele = e.telegraph || 0;
    // lock-on aim line (legacy tell)
    if (tele > 0) {
      ctx.save();
      ctx.rotate(e.angle);
      ctx.strokeStyle = `rgba(232,121,249,${0.18 + 0.5 * tele})`;
      ctx.lineWidth = 1.5 + 2 * tele;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(900, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // eye body — legacy read is a filled ringed circle; keep the circular silhouette so
    // colourblind shape-coding (Seeker = eye) is unchanged.
    ctx.strokeStyle = rimColor;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // antennae (two short bristles up-forward)
    ctx.save();
    beginVeins(ctx, col, this.bioPulse(tele), flash);
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.6);
    ctx.lineTo(-r * 0.7, -r * 1.05);
    ctx.moveTo(r * 0.45, -r * 0.6);
    ctx.lineTo(r * 0.7, -r * 1.05);
    ctx.stroke();
    ctx.restore();
    bioNode(ctx, col, -r * 0.7, -r * 1.05, r * 0.1, flash);
    bioNode(ctx, col, r * 0.7, -r * 1.05, r * 0.1, flash);
    // reticle ring (legacy tracker tell — rim-coloured, brightens with the lock)
    ctx.strokeStyle = rimColor;
    ctx.globalAlpha = 0.6 + 0.4 * tele;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // tracking eye: iris core + a pupil offset toward the bolt heading
    ctx.fillStyle = flash ? '#ffffff' : shade(col, BIOMECH.plateFill);
    ctx.strokeStyle = rimColor;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = flash ? '#ffffff' : threatRim(col, BIOMECH.coreLift);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    const pa = tele > 0 ? e.angle : 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(Math.cos(pa) * r * 0.16, Math.sin(pa) * r * 0.16, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawMirrorblade(ctx: CanvasRenderingContext2D, e: Enemy, r: number, shipId: string): void {
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
    // THE IMITATION GAME, SHOWN — the Mirrorblade wears the PLAYER's own ship
    // silhouette (the same shared hull drawPlayer uses), so a viewer reads "that's me."
    // It's tinted toward a doubt/mirror violet — a desaturated, off-key echo of you —
    // and points along its lunge. Steady fill/stroke (brightens only when vulnerable),
    // no envelope/strobe → reduceFlashing / reduceMotion / clarity safe. The boss
    // health-read (the hp ring below) and the lunge tells are untouched.
    const exposed = e.phase === 2; // vulnerable pause after a lunge
    ctx.save();
    ctx.rotate(e.angle);
    drawShipSilhouette(ctx, shipId, r * MIRRORBLADE.silhouetteScale, {
      fill: exposed ? '#e9d5ff' : '#1a0f24', // brightens when you can punish it
      stroke: '#a78bfa', // the violet echo — your colour, doubted
      lineWidth: 3,
      detail: exposed ? '#c4b5fd' : '#7c5cc4',
      core: exposed ? '#f5f3ff' : '#8b5cf6',
    });
    ctx.restore();
    // hp ring
    const frac = e.hp / e.maxHp;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
  }

  // A CIPHER core, redrawn as "a lock to crack": a dark inner disc (so the mark reads through
  // the bloom + COHERENCE wash), a slowly-rotating notched key-ring, and the designed sigil —
  // or a Caesar LETTER — as the hero, upright. The to-key state takes the per-boss accent; a
  // decoded core recedes (cool green); the NEXT core lights white ONLY under cipherAssist (no
  // give-away — decoding IS the act). A11y: rotation/breathing gate off reduceMotion, glow
  // pulse off reduceFlashing, and state reads via brightness + the mark, never hue alone.
  private drawSovereignCore(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    const cipher = this.cipher;
    if (!cipher || cipher.solved) {
      // no live cipher (cores linger a beat before they shatter) → a calm spent pip
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : '#fff7c2';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const slot = e.phase;
    const keyed = cipher.order.indexOf(slot) < cipher.progress; // already decoded
    const isNext = this.cipherAssistR && cipher.order[cipher.progress] === slot; // assist highlight
    const accent = cipher.accent || '#fde047';
    const color = isNext ? '#ffffff' : keyed ? CIPHER_DECODED : accent;
    const ringCol = isNext ? '#ffffff' : keyed ? CIPHER_DECODED_RING : accent;
    const breathe = keyed || this.reduceMotionR ? 0 : 0.5 + 0.5 * Math.sin(e.spawnTime * 2.4 + slot);
    const spin = this.reduceMotionR ? 0 : e.spawnTime * 0.7;
    const flick = this.reduceFlashingR ? 0 : breathe;

    ctx.save();
    ctx.globalAlpha = keyed && !isNext ? 0.62 : 1; // decoded cores recede → eye goes to what's left

    // soft outer glow — live (to-key/next) targets only; reduceFlashing holds it steady
    if (!keyed || isNext) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (isNext ? 0.42 : 0.18) + flick * 0.12;
      ctx.fillStyle = isNext ? '#fff7cf' : accent;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // slowly-rotating notched key-ring (the only moving part; the mark stays upright)
    ctx.save();
    ctx.rotate(spin);
    ctx.globalAlpha = keyed && !isNext ? 0.55 : 0.9;
    ctx.strokeStyle = ringCol;
    ctx.lineWidth = isNext ? 2.6 : 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.42, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
      ctx.lineTo(Math.cos(a) * r * 1.52, Math.sin(a) * r * 1.52);
      ctx.stroke();
    }
    ctx.restore();

    // dark inner disc — guarantees the mark reads through bloom + the COHERENCE wash
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.12, 0, Math.PI * 2);
    ctx.fillStyle = keyed ? 'rgba(8,24,19,0.92)' : 'rgba(7,10,20,0.93)';
    ctx.fill();
    ctx.save();
    ctx.globalAlpha *= 0.55;
    ctx.strokeStyle = ringCol;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    // a faint accent hearth behind a live mark (warms it apart from the cool decoded green)
    if (!keyed) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.12 + flick * 0.06;
      ctx.fillStyle = isNext ? '#ffffff' : accent;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // the mark — the hero, upright. A hit flash whites it; decoding it IS the act.
    this.drawCipherMark(ctx, markFor(cipher, slot), r, e.hitFlash > 0 ? '#ffffff' : color);
    ctx.restore();
  }

  /** Draw a cipher Mark centred at the origin: a Caesar LETTER (Orbitron, dark-haloed) or a
   *  designed SIGIL (the unit 0..100 path scaled to a ~r*0.92 footprint, neon stroke). */
  private drawCipherMark(ctx: CanvasRenderingContext2D, mark: Mark, r: number, color: string): void {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (mark.kind === 'letter') {
      ctx.font = `700 ${Math.round(r * 1.1)}px 'Orbitron', 'Space Grotesk', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, r * 0.12);
      ctx.strokeStyle = 'rgba(4,6,12,0.7)'; // thin dark halo keeps the letter legible on any disc
      ctx.strokeText(mark.char, 0, 1);
      ctx.fillStyle = color;
      ctx.fillText(mark.char, 0, 1);
      ctx.restore();
      return;
    }
    const R = r * 0.92;
    const def = sigilFor(mark.index);
    ctx.translate(-R, -R);
    ctx.scale(R / 50, R / 50); // unit box centre (50,50) → origin; footprint radius R
    ctx.strokeStyle = color;
    ctx.lineWidth = 9;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.stroke(sigilPath2D(mark.index));
    if (def.dot) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(def.dot[0], def.dot[1], def.dot[2], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── BIOMECH boss draws ───────────────────────────────────────────────────────
  // Each preserves the legacy boss silhouette + HP ring + gameplay telegraphs and
  // layers carapace plating, bio-veins, and sensor clusters over it. Rotational
  // animation gated by reduceMotion; no new shadowBlur; no per-frame allocation.

  /** WARDEN (biomech) — the First Gate keeper: a hex turbine hub with carapace blades,
   *  a barred gate arc, an armoured plate hub + red core, and a sensor pod on a stalk.
   *  Keeps the legacy HP ring + the REAR weak-point gold arc. */
  private drawWardenBiomech(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    const white = e.telegraph || 0;
    const col = WARDEN.color;
    const flash = e.hitFlash > 0;
    const fill = flash ? '#ffffff' : shade(col, 0.18);
    const rim = flash ? '#ffffff' : threatRim(col, THREAT_RIM.lift);
    const spin = this.reduceMotionR ? 0 : e.spawnTime * 0.4;
    // the barred outer gate arc (front-facing) — thick veins reading as bars
    ctx.save();
    beginVeins(ctx, col, 0.7, flash);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.5, -0.5, 0.5);
    ctx.stroke();
    ctx.restore();
    // turbine carapace blades — six swept plate fins around the hub
    ctx.save();
    ctx.rotate(spin);
    ctx.fillStyle = fill;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2.5;
    for (let k = 0; k < 6; k++) {
      ctx.save();
      ctx.rotate((k / 6) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(r * 0.95, -r * 0.22);
      ctx.quadraticCurveTo(r * 1.15, r * 0.05, r * 0.7, r * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    // hex hub body brightening toward white on telegraph
    ctx.save();
    ctx.rotate(spin);
    ctx.fillStyle = flash ? '#ffffff' : mix(col, '#ffffff', white * 0.7);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 3;
    ngon(ctx, 6, r * 0.5);
    ctx.restore();
    // armoured plate hub + bio-vein spokes + red core
    ctx.fillStyle = flash ? '#ffffff' : shade(col, BIOMECH.plateFill);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    bioCore(ctx, col, r * 0.7, flash);
    // sensor pod on a stalk (up)
    ctx.save();
    beginVeins(ctx, col, 0.7, flash);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.34);
    ctx.lineTo(0, -r * 0.62);
    ctx.stroke();
    ctx.restore();
    bioNode(ctx, col, 0, -r * 0.66, r * 0.12, flash);
    // legacy HP ring
    const frac = e.hp / e.maxHp;
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    // REAR weak-point telegraph (legacy) — gold back arc; ×3 dash from behind
    if (e.facing !== undefined) {
      const rear = e.facing + Math.PI;
      const pulse = this.reduceMotionR ? 0.85 : 0.7 + 0.3 * Math.sin(this.bgT * 5);
      ctx.strokeStyle = `rgba(253, 224, 71, ${pulse})`;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.18, rear - WARDEN.rearArc / 2, rear + WARDEN.rearArc / 2);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }

  /** WEAVER (biomech) — the Spinner of the Lie: a spinner abdomen (4-point diamond) at
   *  the centre of a woven cipher web, with glyph nodes at the web intersections. Keeps
   *  the legacy 8-point star core read + HP ring. */
  private drawWeaverBiomech(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    const col = '#a855f7';
    const white = e.telegraph || 0;
    const flash = e.hitFlash > 0;
    const rim = flash ? '#ffffff' : threatRim(col, THREAT_RIM.lift);
    // woven web: radial threads + two concentric hex rings (the cipher lattice)
    ctx.save();
    beginVeins(ctx, col, this.bioPulse(white) * 0.7, flash);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 1.55, Math.sin(a) * r * 1.55);
    }
    ctx.stroke();
    ctx.globalAlpha *= 0.6;
    ngonStroke(ctx, 6, r * 0.95);
    ngonStroke(ctx, 6, r * 1.45);
    ctx.restore();
    // glyph nodes at the inner hex vertices
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = flash ? '#ffffff' : threatRim(col, BIOMECH.veinLift);
      ctx.fillRect(Math.cos(a) * r * 0.95 - 2.5, Math.sin(a) * r * 0.95 - 2.5, 5, 5);
      ctx.restore();
    }
    // spinner abdomen — the legacy 8-point star, brightening on telegraph
    ctx.save();
    ctx.rotate(this.reduceMotionR ? 0 : e.angle);
    ctx.fillStyle = flash ? '#ffffff' : mix(col, '#ffffff', white * 0.6);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 3;
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
    bioCore(ctx, col, r * 0.9, flash);
    // legacy HP ring
    const frac = e.hp / e.maxHp;
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
  }

  /** BEACON (biomech) — the Light That Lied: a lamp-tower body (tapered trapezoid) with
   *  a lamp housing + flickering core, structural rib veins, and broken signal-ring
   *  veins. Keeps the legacy rotating sweep beam + HP ring. */
  private drawBeaconBiomech(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    const col = '#38bdf8';
    const white = e.telegraph || 0;
    const flash = e.hitFlash > 0;
    const fill = flash ? '#ffffff' : shade(col, 0.18);
    const rim = flash ? '#ffffff' : threatRim(col, THREAT_RIM.lift);
    // legacy rotating sweep beam (the lighthouse tell)
    if (e.phase === 0 && e.subPhase !== 2) {
      const active = e.subPhase === 1;
      ctx.save();
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      const w = active ? BEACON.beamWidth : 5;
      ctx.globalAlpha = active ? 0.85 : 0.25 + 0.45 * white;
      ctx.fillStyle = active ? '#bfefff' : '#38bdf8';
      ctx.fillRect(-3000, -w / 2, 6000, w);
      if (active) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-3000, -w / 6, 6000, w / 3);
      }
      ctx.restore();
    }
    // NEW: enraged perpendicular counter-beam (the rotating cross — drawn in render/boss.ts)
    drawBeaconCounterBeam(ctx, e, beaconEnraged(e));
    // broken signal-ring veins (front arc, the lie's dead signal)
    ctx.save();
    beginVeins(ctx, col, this.bioPulse(white) * 0.6, flash);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.35, -0.55, 0.55);
    ctx.stroke();
    ctx.globalAlpha *= 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.7, -0.45, 0.45);
    ctx.stroke();
    ctx.restore();
    // lamp-tower body — a tapered trapezoid (broad base, narrow top): legacy read kept
    // as the bright triangular emitter at the top; the tower below reads as the tower.
    ctx.fillStyle = fill;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r * 0.75, r);
    ctx.lineTo(-r * 0.32, -r * 0.4);
    ctx.lineTo(r * 0.32, -r * 0.4);
    ctx.lineTo(r * 0.75, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // structural rib veins across the tower
    ctx.save();
    beginVeins(ctx, col, this.bioPulse(white), flash);
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, r * 0.35);
    ctx.lineTo(r * 0.5, r * 0.35);
    ctx.moveTo(-r * 0.62, r * 0.78);
    ctx.lineTo(r * 0.62, r * 0.78);
    ctx.stroke();
    ctx.restore();
    // lamp housing (triangular emitter, legacy) + flickering core
    ctx.save();
    ctx.translate(0, -r * 0.62);
    ctx.rotate(this.reduceMotionR ? 0 : e.angle);
    ctx.fillStyle = flash ? '#ffffff' : mix(col, '#ffffff', white * 0.5);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2.5;
    ngon(ctx, 3, r * 0.5);
    ctx.restore();
    ctx.save();
    ctx.translate(0, -r * 0.62);
    bioCore(ctx, col, r * 0.7, flash);
    ctx.restore();
    // legacy HP ring
    const frac = e.hp / e.maxHp;
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
  }

  /** HOLLOW (biomech) — What Grief Left: a broken/incomplete carapace shell (open arc),
   *  an empty ribcage of dim arcs, and a faint fugitive key-glyph heart that shows in the
   *  sync window. Keeps the legacy pentagon-shell read, the sync dash tell + HP ring. */
  private drawHollowBiomech(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    const sync = e.telegraph || 0;
    const open = e.phase === 2;
    const col = HOLLOW.color;
    const flash = e.hitFlash > 0;
    const lit = flash ? '#ffffff' : mix(col, '#ffffff', sync * 0.85);
    // concentric pentagon shells (legacy shape-coding — hollow, brightening on sync)
    ctx.save();
    ctx.rotate(e.angle);
    ctx.strokeStyle = lit;
    ctx.fillStyle = open ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0)';
    ctx.lineWidth = 2.5;
    for (let k = 3; k >= 1; k--) {
      ctx.globalAlpha = 0.35 + 0.25 * k;
      ngon(ctx, 5, r * (k / 3));
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // empty ribcage — three dim concentric arcs on the open (right) side
    ctx.save();
    beginVeins(ctx, col, 0.4, flash);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(-r * 0.1, 0, r * (0.5 + i * 0.28), -0.85, 0.85);
      ctx.stroke();
    }
    ctx.restore();
    // fugitive key-glyph heart — faint, brightens only in the sync window (it forgets itself)
    ctx.save();
    ctx.globalAlpha = open ? 0.95 : 0.32 + 0.4 * sync;
    ctx.strokeStyle = open ? '#ffffff' : threatRim(col, BIOMECH.veinLift);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
    ctx.moveTo(r * 0.2, 0);
    ctx.lineTo(r * 0.5, 0);
    ctx.moveTo(r * 0.38, 0);
    ctx.lineTo(r * 0.38, r * 0.18);
    ctx.stroke();
    ctx.fillStyle = open ? '#ffffff' : threatRim(col, BIOMECH.coreLift);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // legacy sync telegraph (closing dashed ring) + HP ring
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
    const frac = e.hp / e.maxHp;
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
  }

  /** HOLLOW ECHO (biomech) — a killable phantom clone: the legacy spinning pentagon,
   *  hollow with a faint heart pip + a single rib vein. */
  private drawHollowEchoBiomech(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    const flash = e.hitFlash > 0;
    const col = HOLLOW.echoColor;
    ctx.save();
    ctx.rotate(this.reduceMotionR ? 0 : e.spawnTime * 0.8);
    ctx.strokeStyle = flash ? '#ffffff' : col;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    ngonStroke(ctx, 5, r);
    ctx.globalAlpha = 0.5;
    ngonStroke(ctx, 5, r * 0.55);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.fillStyle = flash ? '#ffffff' : col;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  /** SOVEREIGN (biomech) — the Crown That Fell First: gravity-warped accretion rings,
   *  an event-horizon disc plate, a fallen-crown carapace, debris caught in the well,
   *  and a molten core. Keeps the legacy crown beams, expose aura + HP ring. */
  private drawSovereignBiomech(ctx: CanvasRenderingContext2D, e: Enemy, r: number): void {
    const exposed = e.phase === 2;
    const tele = e.telegraph || 0;
    const col = SOVEREIGN.color;
    const flash = e.hitFlash > 0;
    const rim = flash ? '#ffffff' : threatRim(col, THREAT_RIM.lift);
    // NEW: NOVA SPIRAL wind-up tracers + sub-25% finale aura (drawn in render/boss.ts)
    drawNovaSpiralTelegraph(ctx, e, this.reduceMotionR);
    drawSovereignFinaleTint(ctx, e, this.reduceMotionR);
    // legacy CROWN BEAMS (phase 0)
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
          ctx.fillRect(-3000, -w / 6, 6000, w / 3);
        }
        ctx.restore();
      }
      ctx.restore();
    }
    // legacy EXPOSED aura (vulnerable punish window)
    if (exposed) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.reduceMotionR ? 0.45 : 0.35 + 0.3 * Math.sin(e.spawnTime * 12);
      ctx.fillStyle = '#fff3a8';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // gravity-warped accretion rings (tilted ellipses — the well bends space)
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.5;
    for (const [rx, ry, rot] of [
      [r * 1.85, r * 0.75, -0.35],
      [r * 1.65, r * 0.5, 0.5],
    ] as const) {
      ctx.save();
      ctx.rotate(rot);
      ctx.scale(1, ry / rx);
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    // debris dragged into the well (static node positions)
    for (const [dx, dy] of [
      [-r * 1.7, -r * 0.3],
      [r * 1.9, r * 0.35],
      [r * 0.7, -r * 1.6],
      [-r * 1.1, r * 1.5],
    ]) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      bioNode(ctx, col, dx, dy, r * 0.06, flash);
      ctx.restore();
    }
    // event-horizon disc plate
    ctx.fillStyle = flash ? '#ffffff' : shade(col, BIOMECH.plateFill);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // outer crown ring (8-point, legacy) brightening toward white on telegraph/expose
    ctx.save();
    ctx.rotate(this.reduceMotionR ? 0 : e.spawnTime * 0.5);
    ctx.strokeStyle = exposed ? '#ffffff' : flash ? '#ffffff' : mix(col, '#ffffff', tele * 0.6);
    ctx.lineWidth = 3;
    ngonStroke(ctx, 8, r * 1.05);
    ctx.restore();
    // the fallen-crown carapace — a crown-shape plate over the disc
    ctx.save();
    ctx.rotate(0.2);
    ctx.fillStyle = flash ? '#ffffff' : shade(col, 0.22);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, r * 0.18);
    ctx.lineTo(-r * 0.5, -r * 0.18);
    ctx.lineTo(-r * 0.2, r * 0.05);
    ctx.lineTo(0, -r * 0.32);
    ctx.lineTo(r * 0.2, r * 0.05);
    ctx.lineTo(r * 0.5, -r * 0.18);
    ctx.lineTo(r * 0.5, r * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // molten core
    ctx.fillStyle = exposed || flash ? '#ffffff' : threatRim(col, BIOMECH.coreLift);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    // legacy HP ring
    const frac = e.hp / e.maxHp;
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.75, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
  }

  private drawPlayer(world: World): void {
    const ctx = this.bctx;
    const p = world.player;
    // the active ship's signature accent (cosmetic; shape-coded for colorblind), leaned toward
    // the equipped PALETTE so the chosen palette tints the hull/glow too. Kept a partial blend
    // (SHIP_PALETTE_LEAN) so each ship's identity colour still reads. mixHex keeps it a hex so
    // the downstream hit-flash mix(shipAccent, '#fff') still parses. colorblind keeps the raw
    // signature accent (palette tinting would muddy the shape-independent colour read).
    const shipAccent = this.colorblindR
      ? shipById(world.shipId).accent
      : mixHex(shipById(world.shipId).accent, this.theme.accent, SHIP_PALETTE_LEAN);

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

    // C1 (v6 §1) — the LOCALIZED on-beat ring: a brief cyan/gold halo on a graded dash.
    // a11y-gated via beatFlashRing (alpha capped under reduceFlashing, radius frozen under
    // reduceMotion); player-anchored so it survives the frame-wide present() wash gates.
    if (this.beatFlash > 0) {
      const { alpha, radiusLift } = beatFlashRing(this.beatFlash, this.reduceFlashingR, this.reduceMotionR);
      if (alpha > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = this.colorblindR ? '#cfe2ff' : '#67e8f9';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, TUNE.player.spriteRadius + 8 + radiusLift, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Spear-state visuals (dash spear + ghost trail, afterimage, charge guide + HEAVY
    // overcharge / SLINGSHOT, PARRY arc) live in render/spear.ts — render.ts only delegates.
    drawSpear(ctx, world, {
      coherence: this.coherence,
      reduceFlashing: this.reduceFlashingR,
      clarity: this.clarityR,
      slingshot: this.slingshotR,
      trail: this.trail,
      themeAccent2: this.theme.accent2,
      comboCol: comboColor(world.combo),
    });

    // ship glow — tinted by the ship's own signature accent (its identity colour)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = this.getGlow(p.hitFlash > 0 ? '#ffffff' : shipAccent);
    const gs = TUNE.player.spriteRadius * 2.6;
    ctx.globalAlpha = p.phase === 'charging' ? 0.5 + p.charge * 0.4 : 0.55;
    ctx.drawImage(glow, p.x - gs, p.y - gs, gs * 2, gs * 2);
    ctx.restore();

    // ship body — the active ship's silhouette, outlined in its signature accent. The
    // distinct hull per ship is shape-coded so the roster reads without relying on colour.
    ctx.save();
    ctx.translate(p.x, p.y);
    const sr = TUNE.player.spriteRadius * (p.phase === 'charging' ? 1 + 0.06 * Math.sin(p.charge * 30) : 1);
    // i-frame tell: a fast white blink normally, but under reduceFlashing a STEADY white
    // outline (no 40Hz toggle) so longer protection windows — e.g. the Grid-B first-run
    // grace — never strobe. Either way the white outline reads as "protected".
    const invuln = p.iframe > 0 && (this.reduceFlashingR || Math.floor(p.iframe * 40) % 2 === 0);
    // hit-flash whites out the whole ship; the i-frame blink overrides the outline white.
    // Otherwise the hull + spine/bulkhead detail + cockpit glint all ride the ship accent.
    const plain = p.hitFlash <= 0 && !invuln;
    if (plain && this.shipSkin !== 'none') {
      // equipped cosmetic skin — authored NOSE-UP, so rotate by (angle + π/2) to face the aim.
      // Drawn ONLY in the calm state; the flash / i-frame whites (below) are never masked.
      ctx.rotate(p.angle + Math.PI / 2);
      drawShipSkin(this.shipSkin, world.shipId, ctx, sr, this.bgT, { reduceMotion: this.reduceMotionR });
    } else {
      ctx.rotate(p.angle);
      drawShipSilhouette(ctx, world.shipId, sr, {
        fill: p.hitFlash > 0 ? '#ffffff' : '#0a0b0f',
        stroke: invuln || p.hitFlash > 0 ? '#ffffff' : shipAccent,
        lineWidth: 2.5,
        detail: plain ? mix(shipAccent, '#ffffff', 0.45) : null,
        core: plain ? mix(shipAccent, '#ffffff', 0.6) : null,
      });
    }
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
      // reduce-motion: kill the upward drift (render at the spawn Y) and the grow-scale ramp,
      // so beat-grade / +ARMOR / DAYBREAK pops fade in place instead of arcing.
      const grow = this.reduceMotionR ? 1 : 1 + (1 - a) * 0.4;
      const y = this.reduceMotionR ? t.y0 : t.y;
      ctx.globalAlpha = a;
      ctx.font = `700 ${Math.round(20 * t.scale * grow)}px "Space Grotesk", system-ui, sans-serif`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, y);
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

    // the channel-split is a 3× full-screen redraw — at quality 1 it runs as authored;
    // under load it is suppressed (the buffer is drawn straight) to reclaim fill-rate.
    if (shift < 1.8 || !allowChromaticAberration(this.quality)) {
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
      this.collapseDip,
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
      grad.addColorStop(1, this.colorblindR ? '#cfe2ff' : this.effCity);
      sctx.globalCompositeOperation = 'lighter';
      sctx.globalAlpha = glow;
      sctx.fillStyle = grad;
      sctx.fillRect(0, H - bandH, W, bandH);
      sctx.globalCompositeOperation = 'source-over';
      sctx.globalAlpha = 1;
    }

    // ── FIRST LIGHT — the authored daybreak on a cipher-cracked WIN. A warm white→gold sky
    // floods the frame to DAY, ABOVE the neon wash (distinct from the OVERDRIVE neon flood).
    // A sustained cross-fade: no strobe (reduceFlashing-safe) and no motion (reduceMotion-
    // safe) — just the sun returning. Driven by firstLightR (ramped by the win cinematic). ──
    if (this.firstLightR > 0.001) {
      // softened under reduce-flashing (a gentler sunrise), kept legible so the tableau
      // (and the cracked plaintext) reads through the wash.
      const fl = Math.min(1, this.firstLightR) * (this.reduceFlashingR ? 0.6 : 1);
      const sky = sctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, `rgba(255,250,236,${(0.4 * fl).toFixed(3)})`);
      sky.addColorStop(0.55, `rgba(255,226,150,${(0.3 * fl).toFixed(3)})`);
      sky.addColorStop(1, `rgba(255,198,98,${(0.17 * fl).toFixed(3)})`);
      sctx.globalCompositeOperation = 'lighter';
      sctx.globalAlpha = 1;
      sctx.fillStyle = sky;
      sctx.fillRect(0, 0, W, H);
      // a gentle warm tint to pull the whole palette toward day
      sctx.globalCompositeOperation = 'source-over';
      sctx.globalAlpha = 0.09 * fl;
      sctx.fillStyle = '#ffdca8';
      sctx.fillRect(0, 0, W, H);
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
    const rawEdge =
      Math.min(
        0.92,
        (0.5 + (lowHp ? 0.12 : 0)) *
          vignetteDeepenFactor(this.coherence, this.reduceFlashingR, this.reduceMotionR, this.clarityR),
      ) * (1 - this.firstLightR); // FIRST LIGHT lifts the dark edge — the world opens up to day
    // Defense-in-depth: a NaN edge (a poisoned coherence/firstLight from anywhere) would make
    // addColorStop throw 'rgba(0,0,0,NaN)' and hard-crash the whole frame. Never let it reach canvas.
    const edge = Number.isFinite(rawEdge) ? clamp(rawEdge, 0, 0.92) : 0.5;
    const grad = sctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.62);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${edge})`);
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, W, H);

    // FIRST LIGHT — invert the vignette into a soft golden bloom halo (the dark gives way)
    if (this.firstLightR > 0.001) {
      const halo = sctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.62);
      halo.addColorStop(0, `rgba(255,240,205,${(0.3 * this.firstLightR).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(255,240,205,0)');
      sctx.globalCompositeOperation = 'lighter';
      sctx.fillStyle = halo;
      sctx.fillRect(0, 0, W, H);
      sctx.globalCompositeOperation = 'source-over';
    }

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

// ── BIOMECH drawing helpers ──────────────────────────────────────────────────
// All cosmetic, allocation-free (numbers only), and shape-additive. They draw the
// "living machine" detailing ON TOP of a silhouette the caller has already stroked.

/** A glowing organic core: a lit neon nucleus + a hot white centre pip. Drawn at
 *  the current origin (caller has translated). `col` is the creature's accent. */
function bioCore(ctx: CanvasRenderingContext2D, col: string, r: number, flash: boolean): void {
  ctx.fillStyle = flash ? '#ffffff' : threatRim(col, BIOMECH.coreLift);
  ctx.beginPath();
  ctx.arc(0, 0, r * BIOMECH.coreRadiusFrac, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, r * BIOMECH.hotRadiusFrac, 0, Math.PI * 2);
  ctx.fill();
}

/** A small sensor "eye"/node at (x,y): a lit ring of accent with a white pip. */
function bioNode(ctx: CanvasRenderingContext2D, col: string, x: number, y: number, rad: number, flash: boolean): void {
  ctx.fillStyle = flash ? '#ffffff' : threatRim(col, BIOMECH.coreLift);
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, rad * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

/** Begin a bio-vein stroke pass: thin bright neon strands. `alpha` is the (already
 *  pulse-resolved) opacity. Caller draws paths then resets alpha via ctx.restore. */
function beginVeins(ctx: CanvasRenderingContext2D, col: string, alpha: number, flash: boolean): void {
  ctx.strokeStyle = flash ? '#ffffff' : threatRim(col, BIOMECH.veinLift);
  ctx.lineWidth = BIOMECH.veinWidth;
  ctx.lineCap = 'round';
  ctx.globalAlpha = alpha;
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

/** Stroke-only regular n-gon (no fill) — used for biomech inner armour plates. */
function ngonStroke(ctx: CanvasRenderingContext2D, n: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
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

