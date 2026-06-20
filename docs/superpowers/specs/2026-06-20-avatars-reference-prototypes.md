# Avatars — Reference Prototypes (the fidelity gold standard)

These are the **locked, approved** prototypes. The avatar agent must MATCH this fidelity and REUSE
these exact primitives. Everything is in a **medallion-local coordinate system centred at (0,0)**;
`renderAvatar()` wraps each medallion in `transform="translate(cx,cy) scale(s)"` and emits the root
`<svg role="img"><title>…</title><desc>…</desc>`. Builders return inner markup only.

## Coordinate system
- Hex window: pointy-top hexagon, radius **R=72**, points
  `0,-72 62.4,-36 62.4,36 0,72 -62.4,36 -62.4,-36`.
- Bezel radius: **Tier I → r≈90, sw 5**; **Tier II/III → r≈98, sw 7.5–8** (more ornament rings outside).
- Scene content is drawn inside `<g clip-path="url(#hx-UID)">` so glow stays in the window.

## ‼ uid namespacing (mandatory)
Every `id="x"` in `<defs>` and every `url(#x)` reference MUST be suffixed with the instance uid:
`id="bzC"` → `id="bzC-${uid}"`, `fill="url(#bzC)"` → `fill="url(#bzC-${uid})"`. Otherwise 24 medallions
on the picker grid collide and corrupt each other's fills. `primitives.ts` should build ids via a
helper like `const ref = (n: string) => \`${n}-${uid}\``.

## `defsFor(accent, uid)` — the shared defs (cyan template; parameterise by accent)
The boss/cipher/pilot accents swap the hexes; structure is identical. Core gradient is built from the
accent (light→accent→dark→transparent). Bezel is a brushed light-sweep. Filters are shared.

```svg
<radialGradient id="core-UID" cx="50%" cy="45%" r="55%">
  <stop offset="0%" stop-color="#ffffff"/><stop offset="35%" stop-color="ACCENT_LIGHT"/>
  <stop offset="70%" stop-color="ACCENT_DEEP"/><stop offset="100%" stop-color="ACCENT_DARK" stop-opacity="0"/>
</radialGradient>
<linearGradient id="bz-UID" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="ACCENT_DARK"/><stop offset="35%" stop-color="ACCENT_MID"/>
  <stop offset="50%" stop-color="ACCENT_HILITE"/><stop offset="66%" stop-color="ACCENT_DEEP"/>
  <stop offset="100%" stop-color="ACCENT_DARK2"/>
</linearGradient>
<linearGradient id="glass-UID" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="40%" stop-color="#ffffff" stop-opacity="0.06"/>
  <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<filter id="bl-UID" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.2"/>
  <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="blS-UID" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="1.1"/>
  <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="big-UID" x="-130%" y="-130%" width="360%" height="360%"><feGaussianBlur stdDeviation="10"/></filter>
<clipPath id="hx-UID"><polygon points="0,-72 62.4,-36 62.4,36 0,72 -62.4,36 -62.4,-36"/></clipPath>
```
Shared symbol-like helpers (emit inline, uid-suffixed): `rays` (12 radial lines r42→92), `r6`/`r12`
(stud rings at the hex vertices / + edge-midpoints), `guil` (9 overlapping ellipses rx96 ry80 rotated
0..160 → engine-turned guilloché). See the frame blocks for exact coordinates.

## `frame(tier, accent, uid)` — TIER I (clean; e.g. THE LANCE / COHERENCE)
No ray-burst, no guilloché. Slim single bezel, one rune ring, ONE glint, 6 small studs.
```svg
<circle r="84" fill="ACCENT" opacity="0.10" filter="url(#big-UID)"><animate attributeName="opacity" values="0.06;0.16;0.06" dur="2.8s" repeatCount="indefinite"/></circle>
<circle r="90" fill="none" stroke="url(#bz-UID)" stroke-width="5"/>
<circle r="86" fill="none" stroke="#06121c" stroke-width="1.6"/>
<circle r="82" fill="none" stroke="ACCENT" stroke-width="0.6" stroke-dasharray="6 6" opacity="0.4"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="50s" repeatCount="indefinite"/></circle>
<circle r="90" fill="none" stroke="ACCENT_HILITE" stroke-width="5" stroke-linecap="round" stroke-dasharray="14 9999" opacity="0.8"><animate attributeName="stroke-dashoffset" values="0;-565" dur="6s" repeatCount="indefinite"/></circle>
<!-- … scene goes here (clipped) … -->
<polygon points="0,-72 62.4,-36 62.4,36 0,72 -62.4,36 -62.4,-36" fill="none" stroke="url(#bz-UID)" stroke-width="2.2"/>
<polygon points="0,-63 54.6,-31.5 54.6,31.5 0,63 -54.6,31.5 -54.6,-31.5" fill="none" stroke="ACCENT" stroke-width="0.5" opacity="0.35"/>
<g fill="ACCENT_HILITE"><circle cx="0" cy="-72" r="1.9"/><circle cx="62.4" cy="-36" r="1.9"/><circle cx="62.4" cy="36" r="1.9"/><circle cx="0" cy="72" r="1.9"/><circle cx="-62.4" cy="36" r="1.9"/><circle cx="-62.4" cy="-36" r="1.9"/></g>
```

## `frame(tier, accent, uid)` — TIER III (apex; e.g. THE FALLEN CROWN / ETERNAL)
Adds: doubled ray-burst, guilloché, crenellation + reeded rings, sunburst crown ticks, 3 glints,
12 studs, glowing star-point regalia on the upper vertices, laurel flourishes. (Tier II = this minus
the sunburst ticks / crenellation / laurels / regalia + 2 glints.)
```svg
<circle r="106" fill="ACCENT" opacity="0.16" filter="url(#big-UID)"><animate attributeName="opacity" values="0.1;0.24;0.1" dur="4.4s" repeatCount="indefinite"/></circle>
<use href="#rays-UID" style="color:ACCENT" opacity="0.22"/>
<use href="#rays-UID" style="color:ACCENT_HILITE" opacity="0.14" transform="rotate(15)"/>
<g clip-path="url(#hx-UID)"><use href="#guil-UID" style="color:ACCENT" opacity="0.16"/></g>
<use href="#guil-UID" style="color:ACCENT_DARK" opacity="0.5"/>
<circle r="111" fill="none" stroke="ACCENT" stroke-width="0.6" stroke-dasharray="1 6" opacity="0.5"/>
<circle r="107" fill="none" stroke="ACCENT_DEEP" stroke-width="4" stroke-dasharray="3 4" opacity="0.6"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="80s" repeatCount="indefinite"/></circle>
<circle r="103" fill="none" stroke="ACCENT" stroke-width="3" stroke-dasharray="1.2 2.6" opacity="0.6"/>
<circle r="98" fill="none" stroke="url(#bz-UID)" stroke-width="8"/>
<circle r="92" fill="none" stroke="#140e02" stroke-width="2.4"/>
<circle r="86" fill="none" stroke="ACCENT_LIGHT" stroke-width="0.8" stroke-dasharray="11 6" opacity="0.5"><animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="50s" repeatCount="indefinite"/></circle>
<!-- 3 glints: stroke-dashoffset phased 0 / -205 / -410 over -616, dur 4.5s, opacity 0.9/0.7/0.5 -->
<!-- sunburst crown ticks at r99→110 (top 5 dirs); laurel flourish paths bottom-left/right -->
<!-- … scene … then the two hex strokes + #r12 studs + glowing star-point regalia on top vertices -->
```

## MOTION recipes (`motion.ts`) — copy-shared snippets
**Glint** (rim sweep): a bright short dash on the bezel circle travelling round.
`stroke-dasharray="16 9999"` + `<animate attributeName="stroke-dashoffset" values="0;-CIRC" dur="…">`
where CIRC≈2πr. Phase multiple glints with offset start values.

**Breathe** (core glow): `<animate attributeName="opacity" values="0.12;0.28;0.12" dur="4s" …/>`
and/or wrap a gem group in `<animateTransform type="scale" values="0.9;1.08;0.9" dur="3.4s" …/>`.

**Twinkle** (stars/jewels): per element `<animate attributeName="opacity" values="0.3;1;0.3" dur="2–3.6s" …/>` with staggered durations.

**Flowing filament**: `stroke-dasharray="5 11"` + `<animate attributeName="stroke-dashoffset" from="0" to="-160" …/>`; pair two rings with opposite directions.

**Strike + impact** (directional, e.g. THE LANCE): wrap the object in `rotate(θ)`, animate its inner
group `type="translate" values="0 0;32 0;0 0" keyTimes="0;0.12;0.52" dur="2.8s"`; at the tip emit an
expanding ring (`r 2→26`, opacity `0→0.95→0` over keyTimes ~0.12–0.34) + a spark fan + a `url(#flash)`
full-field radial flash, all keyed to the 0.12 lunge. Trailing combo chevrons appear during the lunge.

**Shatter** (e.g. THE FALLEN CROWN): a chunk is replaced by a dark stump; ~11 small accent polygons +
dust circles each `opacity="0"` driven by `values="0;1;0.9;0" keyTimes="0;0.12;0.6;1"` +
`<animateTransform type="translate" values="0 0;DX DY">`, dur ~3.4s, staggered `begin` 0…2; plus a
crack-web path revealed via `stroke-dasharray`/`stroke-dashoffset`. Loops seamlessly.

**Implode** (e.g. THE HOLLOW): concentric rings `r 58→2` + opacity `0→0.7→0` staggered = collapse;
particles drawn at (0,0) with `type="translate" values="OUTER;0 0"` inward, the whole particle group
slowly rotating = spiral arms; a dark void core; a glyph that flickers in for one instant per cycle
(`opacity values="0;0;0.85;0.85;0" keyTimes="0;0.42;0.47;0.55;0.62"`).

## FULL WORKED SCENE — THE LANCE (the hex-window content; sits between the frame's open/close)
This is the approved, field-filled, lance-not-sword version (lance group scaled `0.9` to fit). Reuse
`#core-UID`, `#bl-UID`, `#blS-UID`, `#glass-UID`; add a `#flash-UID` radial + `#shaft-UID`/`#head-UID`
linear gradients to defs. Drawn inside `<g clip-path="url(#hx-UID)">`.
```svg
<polygon points="0,-72 62.4,-36 62.4,36 0,72 -62.4,36 -62.4,-36" fill="#06101e"/>
<circle r="62" fill="url(#core-UID)" opacity="0.14"/>
<!-- starfield: ~6 twinkling dots (cx,cy scattered), opacity animated, staggered durs -->
<g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="60s" repeatCount="indefinite"/>
  <circle r="58" fill="none" stroke="#2f6f88" stroke-width="0.7" stroke-dasharray="2 8" opacity="0.5"/>
  <!-- 6 tick marks at the rune-ring r=58 (one per hex dir) -->
</g>
<circle r="40" fill="none" stroke="#22a6c4" stroke-width="0.6" stroke-dasharray="1 7" opacity="0.4"><animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="34s" repeatCount="indefinite"/></circle>
<!-- momentum streaks: <g transform="rotate(-48)"> faint dash-flow lines across the field, + a bright set that flares (opacity keyTimes 0;0.13;0.45) with the strike -->
<!-- fall motes: 3 dots drifting cy -62→64 over 7–9s, opacity in/out -->
<!-- TARGET RETICLE at (43,-48): rotating ring r15 dashed + corner brackets, inner r9 + crosshair, an impact-pulse ring r6→22 keyed to the strike -->
<circle cx="43" cy="-48" r="40" fill="url(#flash-UID)" opacity="0"><animate attributeName="opacity" values="0;0.7;0" keyTimes="0.12;0.16;0.36" dur="2.8s" repeatCount="indefinite"/></circle>
<g transform="rotate(-48)">
  <!-- strike streak (opacity flare) -->
  <g><animateTransform attributeName="transform" type="translate" values="0 0;32 0;0 0" keyTimes="0;0.12;0.52" dur="2.8s" repeatCount="indefinite"/>
    <!-- combo chevrons trailing the butt (3, fading) -->
    <polygon points="-60,0 -53,-4.5 -49,0 -53,4.5" fill="#bff8ff" filter="url(#blS-UID)"/>   <!-- butt counterweight -->
    <circle cx="-54" cy="0" r="1.6" fill="#eafdff"/>
    <rect x="-50" y="-2" width="80" height="4" rx="1.8" fill="url(#shaft-UID)"/>               <!-- slender shaft -->
    <!-- 3 binding wraps (dark perpendicular ticks + accent rivets) at x -30,-8,14 -->
    <rect x="28" y="-3" width="6" height="6" rx="1" fill="ACCENT_DEEP" stroke="#bff8ff" stroke-width="0.5"/> <!-- ferrule -->
    <path d="M 34 0 Q 46 -7 58 -4 L 76 0 L 58 4 Q 46 7 34 0 Z" fill="url(#head-UID)" filter="url(#blS-UID)"/> <!-- leaf spearhead -->
    <!-- midrib line + white edge highlight + tip glint polygon -->
    <!-- fluttering pennon: accent path with <animate attributeName="d"> 3-key flutter, dur 1.6s -->
  </g>
</g>
<path d="M -62 -36 L 0 -72 L 62.4 -36 L 40 -20 Q 0 -44 -40 -20 Z" fill="url(#glass-UID)"/>   <!-- glass highlight -->
```
> The complete literal source for all five locked prototypes (LANCE full-scene, COHERENCE, FALLEN
> CROWN shatter, HOLLOW implode, WARDEN gate) was produced in the brainstorming session's visualize
> widgets. Recreate from the recipes above + the §4 briefs; match this density and motion quality.
