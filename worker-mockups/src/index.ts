// LANCEFALL — enemy/boss design mockups worker
// Serves biomechanical (Option B) design proposals for all game entities.
// Routes: / (index), /enemies, /bosses, /b, /a, /c

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07071a;--panel:#0d0d2b;--border:#1a1a4a;
  --text:#e2e8f0;--muted:#64748b;--accent:#38bdf8;
  --gold:#fde047;--vein:#4ade80;
}
body{background:var(--bg);color:var(--text);font-family:'Courier New',monospace;min-height:100vh}
header{padding:24px 32px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:24px;flex-wrap:wrap}
header h1{font-size:1.1rem;letter-spacing:.15em;color:var(--accent);text-transform:uppercase}
nav a{color:var(--muted);text-decoration:none;font-size:.85rem;letter-spacing:.1em;padding:4px 10px;border:1px solid transparent;border-radius:4px;transition:all .2s}
nav a:hover,nav a.active{color:var(--text);border-color:var(--border);background:var(--panel)}
.page{max-width:1400px;margin:0 auto;padding:32px}
h2{font-size:.75rem;letter-spacing:.2em;color:var(--muted);text-transform:uppercase;margin-bottom:24px;border-bottom:1px solid var(--border);padding-bottom:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;margin-bottom:48px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:8px;overflow:hidden}
.card-header{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:baseline;gap:8px}
.card-header .name{font-size:.9rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text)}
.card-header .role{font-size:.7rem;color:var(--muted)}
.canvases{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border)}
.canvas-wrap{background:var(--panel);padding:4px 0 0;text-align:center}
.canvas-wrap label{display:block;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
canvas{display:block;margin:0 auto}
.card-body{padding:10px 16px 12px}
.desc{font-size:.72rem;color:var(--muted);line-height:1.5}
.bio-tag{display:inline-block;margin-top:6px;font-size:.62rem;letter-spacing:.08em;color:var(--vein);border:1px solid currentColor;border-radius:3px;padding:1px 5px}
.legend{display:flex;gap:20px;margin-bottom:28px;font-size:.72rem;color:var(--muted)}
.legend span{display:flex;align-items:center;gap:6px}
.dot{width:8px;height:8px;border-radius:50%}
.hero{padding:40px 32px;border-bottom:1px solid var(--border);background:linear-gradient(180deg,#0d0d2b 0%,var(--bg) 100%)}
.hero h1{font-size:1.6rem;letter-spacing:.2em;text-transform:uppercase;margin-bottom:8px}
.hero p{color:var(--muted);font-size:.8rem;line-height:1.6;max-width:640px}
.proposal-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}
.prop-card{border:1px solid var(--border);border-radius:8px;padding:16px;text-decoration:none;color:inherit;transition:all .2s}
.prop-card:hover,.prop-card.active{border-color:var(--accent);background:rgba(56,189,248,.06)}
.prop-card h3{font-size:.8rem;letter-spacing:.15em;text-transform:uppercase;color:var(--accent);margin-bottom:6px}
.prop-card p{font-size:.72rem;color:var(--muted);line-height:1.5}
.prop-card .tags{margin-top:8px;display:flex;flex-wrap:wrap;gap:4px}
.prop-card .tag{font-size:.6rem;letter-spacing:.05em;border:1px solid var(--border);border-radius:3px;padding:1px 5px;color:var(--muted)}
.prop-card.active .tag{border-color:rgba(56,189,248,.4);color:var(--accent)}
@media(max-width:600px){.grid{grid-template-columns:1fr}.proposal-grid{grid-template-columns:1fr}}
`;

function html(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Lancefall Mockups</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

function nav(active: string): string {
  const links = [
    ['/', 'Overview'],
    ['/enemies', 'Enemies'],
    ['/bosses', 'Bosses'],
  ];
  return `<header><h1>Lancefall Mockups</h1><nav>${links.map(([href, label]) => `<a href="${href}"${href === active ? ' class="active"' : ''}>${label}</a>`).join(' ')}</nav></header>`;
}

// ─── drawing helpers (injected into every page as inline JS) ──────────────
const DRAW_UTILS = `
const BG='#07071a';
function clr(ctx,w,h){ctx.fillStyle=BG;ctx.fillRect(0,0,w,h);}
function glow(ctx,color,blur){ctx.shadowColor=color;ctx.shadowBlur=blur;}
function clearGlow(ctx){ctx.shadowBlur=0;}
function circle(ctx,x,y,r,fill,stroke,lw){
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||1.5;ctx.stroke();}
}
function poly(ctx,pts,fill,stroke,lw){
  ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);
  ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||1.5;ctx.stroke();}
}
function ngon(ctx,n,cx,cy,r,rot,fill,stroke,lw){
  const pts=[];for(let i=0;i<n;i++){const a=rot+(i/n)*Math.PI*2;pts.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);}
  poly(ctx,pts,fill,stroke,lw);
}
function eye(ctx,x,y,r,color){
  glow(ctx,'#ffffff',8);
  circle(ctx,x,y,r,color,null);
  glow(ctx,color,12);
  circle(ctx,x,y,r*0.5,'#ffffff',null);
  clearGlow(ctx);
}
function vein(ctx,x1,y1,x2,y2,cx,cy,color,lw){
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.quadraticCurveTo(cx,cy,x2,y2);
  glow(ctx,color,6);ctx.strokeStyle=color;ctx.lineWidth=lw||1;ctx.stroke();clearGlow(ctx);
}
function armorPlate(ctx,pts,baseColor){
  const dark=shadeHex(baseColor,0.3);
  poly(ctx,pts,dark,'rgba(0,0,0,0.6)',0.5);
}
function shadeHex(hex,f){
  const c=parseInt(hex.slice(1),16);
  const r=Math.min(255,Math.round(((c>>16)&0xff)*f));
  const g=Math.min(255,Math.round(((c>>8)&0xff)*f));
  const b=Math.min(255,Math.round((c&0xff)*f));
  return \`rgb(\${r},\${g},\${b})\`;
}
function lightenHex(hex,f){
  const c=parseInt(hex.slice(1),16);
  const r=Math.min(255,Math.round(((c>>16)&0xff)*f));
  const g=Math.min(255,Math.round(((c>>8)&0xff)*f));
  const b=Math.min(255,Math.round((c&0xff)*f));
  return \`rgb(\${r},\${g},\${b})\`;
}
`;

// ─── BEFORE drawings (current geometric style) ────────────────────────────
const BEFORE_DRAWS = `
function before_darter(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const c='#ff3b6b';
  const pts=[[cx+r,cy],[cx-r*.8,cy+r*.7],[cx-r*.4,cy],[cx-r*.8,cy-r*.7]];
  poly(ctx,pts,shadeHex(c,0.18),lightenHex(c,1.4),1.5);
}
function before_orbiter(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  ngon(ctx,6,cx,cy,r,0,shadeHex('#22d3ee',0.18),lightenHex('#22d3ee',1.4),1.5);
}
function before_splitter(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  ctx.save();ctx.translate(cx,cy);ctx.rotate(Math.PI/4);
  const s=r*1.3;
  ctx.beginPath();ctx.rect(-s,-s,s*2,s*2);
  ctx.fillStyle=shadeHex('#a855f7',0.18);ctx.fill();
  ctx.strokeStyle=lightenHex('#a855f7',1.4);ctx.lineWidth=1.5;ctx.stroke();
  ctx.restore();
}
function before_bloomer(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const s=r*1.25;
  ctx.beginPath();ctx.rect(cx-s,cy-s,s*2,s*2);
  ctx.fillStyle=shadeHex('#fbbf24',0.18);ctx.fill();
  ctx.strokeStyle=lightenHex('#fbbf24',1.4);ctx.lineWidth=1.5;ctx.stroke();
  ctx.globalAlpha=0.5;ctx.beginPath();ctx.arc(cx,cy,r*1.6,0,Math.PI*2);
  ctx.strokeStyle='#fbbf24';ctx.lineWidth=1;ctx.stroke();ctx.globalAlpha=1;
}
function before_lancer(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const c='#ff8a3b';
  const pts=[[cx+r*1.6,cy],[cx-r*.5,cy+r*.5],[cx-r*.5,cy-r*.5]];
  poly(ctx,pts,shadeHex(c,0.18),lightenHex(c,1.4),1.5);
}
function before_bomber(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  circle(ctx,cx,cy,r,shadeHex('#fb7185',0.18),lightenHex('#fb7185',1.4),1.5);
  circle(ctx,cx,cy,r*0.42,'rgba(255,255,255,0.5)',null);
}
function before_wisp(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const c='#67e8f9';
  const pts=[[cx+r,cy],[cx-r*.7,cy+r*.7],[cx-r*.7,cy-r*.7]];
  poly(ctx,pts,shadeHex(c,0.18),lightenHex(c,1.4),1.2);
}
function before_drifter(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const c='#10b981';
  ctx.beginPath();ctx.arc(cx,cy,r,-1.1,1.1);ctx.arc(cx+r*.7,cy,r*.9,.95,-.95,true);
  ctx.closePath();ctx.fillStyle=shadeHex(c,0.18);ctx.fill();
  ctx.strokeStyle=lightenHex(c,1.4);ctx.lineWidth=1.5;ctx.stroke();
}
function before_shade(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  ctx.save();ctx.translate(cx,cy);ctx.rotate(Math.PI/4);
  const s=r*1.2;ctx.beginPath();ctx.rect(-s,-s,s*2,s*2);
  ctx.fillStyle=shadeHex('#f97316',0.18);ctx.fill();
  ctx.strokeStyle=lightenHex('#f97316',1.4);ctx.lineWidth=1.5;ctx.stroke();
  circle(ctx,0,0,r*0.38,'#f97316',null);
  ctx.restore();
}
function before_brooder(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  ngon(ctx,6,cx,cy,r,0,shadeHex('#a78bfa',0.18),lightenHex('#a78bfa',1.4),1.5);
  circle(ctx,cx,cy,r*0.38,'rgba(216,180,254,0.3)',null);
  for(let i=0;i<3;i++){const a=(i/3)*Math.PI*2;ctx.beginPath();ctx.arc(cx+Math.cos(a)*r*.62,cy+Math.sin(a)*r*.62,2.1,0,Math.PI*2);ctx.fillStyle='#ddd6fe';ctx.fill();}
}
function before_herald(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  ctx.beginPath();ctx.rect(cx-r*.42,cy-r*1.15,r*.84,r*2.3);
  ctx.fillStyle=shadeHex('#a3e635',0.18);ctx.fill();
  ctx.strokeStyle=lightenHex('#a3e635',1.4);ctx.lineWidth=1.5;ctx.stroke();
}
function before_seeker(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const c='#e879f9';
  ngon(ctx,4,cx,cy,r,Math.PI/4,shadeHex(c,0.18),lightenHex(c,1.4),1.5);
  ctx.globalAlpha=0.7;ctx.beginPath();ctx.arc(cx,cy,r*1.55,0,Math.PI*2);
  ctx.strokeStyle=c;ctx.lineWidth=1;ctx.stroke();ctx.globalAlpha=1;
  circle(ctx,cx,cy,r*0.38,'#ffffff',null);
}
function before_warden(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  ngon(ctx,6,cx,cy,r,0,shadeHex('#ff3b6b',0.18),'#ffffff',2);
  ctx.beginPath();ctx.arc(cx,cy,r*1.35,0,Math.PI*2);
  ctx.strokeStyle='rgba(255,255,255,0.6)';ctx.lineWidth=1.5;ctx.stroke();
  const frac=0.6;ctx.beginPath();ctx.arc(cx,cy,r*1.6,-Math.PI/2,-Math.PI/2+Math.PI*2*frac);
  ctx.strokeStyle='#ff3b6b';ctx.lineWidth=3;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,r*1.18,Math.PI*.6,Math.PI*1.4);
  ctx.strokeStyle='rgba(253,224,71,0.8)';ctx.lineWidth=4;ctx.lineCap='round';ctx.stroke();ctx.lineCap='butt';
}
function before_weaver(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  ctx.beginPath();
  for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2;const rd=i%2===0?r:r*.45;if(i===0)ctx.moveTo(cx+Math.cos(a)*rd,cy+Math.sin(a)*rd);else ctx.lineTo(cx+Math.cos(a)*rd,cy+Math.sin(a)*rd);}
  ctx.closePath();ctx.fillStyle=shadeHex('#a855f7',0.18);ctx.fill();ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,r*1.35,0,Math.PI*2);ctx.strokeStyle='rgba(216,180,254,0.5)';ctx.lineWidth=1.5;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,r*1.6,-Math.PI/2,-Math.PI/2+Math.PI*2*0.7);ctx.strokeStyle='#a855f7';ctx.lineWidth=3;ctx.stroke();
}
function before_beacon(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  circle(ctx,cx,cy,r,shadeHex('#38bdf8',0.2),'#38bdf8',2);
  // beam
  ctx.save();ctx.translate(cx,cy);ctx.rotate(-0.6);
  ctx.globalAlpha=0.3;ctx.fillStyle='#bfefff';
  const bw=10;ctx.fillRect(-r-20,-bw/2,cy*2,bw);ctx.globalAlpha=1;ctx.restore();
  for(let k=2;k>=1;k--){ctx.beginPath();ctx.arc(cx,cy,r*(k*.55+.05),0,Math.PI*2);ctx.strokeStyle=\`rgba(56,189,248,\${0.2+0.15*k})\`;ctx.lineWidth=2;ctx.stroke();}
  ctx.beginPath();ctx.arc(cx,cy,r*1.6,-Math.PI/2,-Math.PI/2+Math.PI*2*0.8);ctx.strokeStyle='#38bdf8';ctx.lineWidth=3;ctx.stroke();
}
function before_mirrorblade(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  circle(ctx,cx,cy,r,shadeHex('#ef4444',0.2),'#ef4444',2);
  ctx.beginPath();ctx.moveTo(cx-r*.7,cy-r*.7);ctx.lineTo(cx+r*.7,cy+r*.7);
  ctx.strokeStyle='rgba(255,200,200,0.7)';ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx+r*.7,cy-r*.7);ctx.lineTo(cx-r*.7,cy+r*.7);
  ctx.strokeStyle='rgba(255,200,200,0.3)';ctx.lineWidth=1.5;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,r*1.6,-Math.PI/2,-Math.PI/2+Math.PI*2*0.5);ctx.strokeStyle='#ef4444';ctx.lineWidth=3;ctx.stroke();
}
function before_hollow(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  for(let k=3;k>=1;k--){ctx.globalAlpha=0.25+0.2*k;ngon(ctx,5,cx,cy,r*(k/3),(k*0.4),null,'#6ee7b7',1.5);}ctx.globalAlpha=1;
  ctx.beginPath();ctx.arc(cx,cy,r*1.6,-Math.PI/2,-Math.PI/2+Math.PI*2*0.45);ctx.strokeStyle='#6ee7b7';ctx.lineWidth=3;ctx.stroke();
}
function before_sovereign(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  circle(ctx,cx,cy,r,shadeHex('#fde047',0.16),'#fde047',2);
  // galaxy arms
  for(let a=0;a<3;a++){const ang=a*(Math.PI*2/3);ctx.save();ctx.translate(cx,cy);ctx.rotate(ang);
    ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(r*.8,-r*.4,r*1.1,r*.3);
    ctx.strokeStyle='rgba(253,224,71,0.5)';ctx.lineWidth=3;ctx.stroke();ctx.restore();}
  for(let i=0;i<4;i++){const a=(i/4)*Math.PI*2;circle(ctx,cx+Math.cos(a)*r*.55,cy+Math.sin(a)*r*.55,5,'#fff3a8',null);}
  ctx.beginPath();ctx.arc(cx,cy,r*1.6,-Math.PI/2,-Math.PI/2+Math.PI*2*0.85);ctx.strokeStyle='#fde047';ctx.lineWidth=3;ctx.stroke();
}
`;

// ─── AFTER drawings (biomechanical — Option B) ────────────────────────────
const AFTER_DRAWS = `
function after_darter(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#ff3b6b',VN='#ff9eb5';
  // organic body - teardrop carapace
  ctx.save();ctx.translate(cx,cy);
  glow(ctx,C,12);
  ctx.beginPath();ctx.moveTo(r,0);ctx.bezierCurveTo(r*.3,r*.5,-r*.6,r*.8,-r*.9,0);ctx.bezierCurveTo(-r*.6,-r*.8,r*.3,-r*.5,r,0);
  ctx.fillStyle=shadeHex(C,0.25);ctx.fill();
  ctx.strokeStyle=C;ctx.lineWidth=1.5;ctx.stroke();clearGlow(ctx);
  // spine segments (vertebrae)
  for(let i=0;i<4;i++){const x=-r*.5+i*(r*.35);ctx.beginPath();ctx.arc(x,0,r*.08,0,Math.PI*2);glow(ctx,VN,6);ctx.fillStyle=VN;ctx.fill();clearGlow(ctx);}
  // bio-vein running along spine
  vein(ctx,-r*.8,0,r*.8,0,0,-r*.1,VN,0.8);
  // dorsal fin spines
  armorPlate(ctx,[[r*.2,-r*.15],[r*.1,-r*.6],[0,-r*.2]],C);
  armorPlate(ctx,[[-r*.1,-r*.1],[-r*.2,-r*.55],[-r*.35,-r*.15]],C);
  // single glowing eye
  eye(ctx,r*.25,0,r*.1,'#fde047');
  ctx.restore();
}
function after_orbiter(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#22d3ee',VN='#a5f3fc';
  ctx.save();ctx.translate(cx,cy);
  // hexagonal exo-shell with organic texture
  glow(ctx,C,14);
  ngon(ctx,6,0,0,r,0,shadeHex(C,0.2),C,1.8);clearGlow(ctx);
  // bio-vein lattice inside
  for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;vein(ctx,0,0,Math.cos(a)*r*.75,Math.sin(a)*r*.75,Math.cos(a+.5)*r*.4,Math.sin(a+.5)*r*.4,VN,0.7);}
  // 3-cluster eyes on alternate vertices
  for(let i=0;i<3;i++){const a=(i*2/6)*Math.PI*2;eye(ctx,Math.cos(a)*r*.55,Math.sin(a)*r*.55,r*.08,'#fde047');}
  // organic pulsing core
  glow(ctx,C,10);circle(ctx,0,0,r*.22,VN,null);clearGlow(ctx);
  ctx.restore();
}
function after_splitter(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#a855f7',VN='#d8b4fe';
  ctx.save();ctx.translate(cx,cy);
  // bulbous cyst body
  glow(ctx,C,12);
  ctx.beginPath();
  ctx.bezierCurveTo(-r*1.1,-r*.6,-r*1.1,r*.6,-r*.2,r*.9);
  ctx.bezierCurveTo(r*.5,r*.9,r*1.05,r*.5,r*.9,0);
  ctx.bezierCurveTo(r*1.05,-r*.5,r*.5,-r*.9,-r*.2,-r*.9);
  ctx.closePath();
  ctx.moveTo(-r*1.1,0);
  ctx.bezierCurveTo(-r*1.1,-r*.6,-r*1.1,r*.6,-r*.2,r*.9);
  ctx.fillStyle=shadeHex(C,0.22);ctx.fill();
  ctx.strokeStyle=C;ctx.lineWidth=1.8;ctx.stroke();clearGlow(ctx);
  // division seam — glowing bio-split line
  glow(ctx,VN,10);ctx.beginPath();ctx.moveTo(-r*.9,-r*.05);ctx.lineTo(r*.9,-r*.05);
  ctx.strokeStyle=VN;ctx.lineWidth=2;ctx.stroke();clearGlow(ctx);
  // chitinous armor patches
  armorPlate(ctx,[[-r*.5,-r*.7],[-r*.1,-r*.9],[r*.2,-r*.7],[-r*.1,-r*.5]],C);
  armorPlate(ctx,[[-r*.5,r*.7],[-r*.1,r*.9],[r*.2,r*.7],[-r*.1,r*.5]],C);
  // eye cluster
  eye(ctx,r*.1,-r*.25,r*.1,'#fde047');eye(ctx,r*.35,-r*.15,r*.07,'#fde047');
  eye(ctx,r*.1,r*.2,r*.09,'#fde047');
  ctx.restore();
}
function after_bloomer(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#fbbf24',VN='#fde68a';
  ctx.save();ctx.translate(cx,cy);
  // coral-form base
  glow(ctx,C,14);
  for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(Math.cos(a-0.3)*r*.5,Math.sin(a-0.3)*r*.5,Math.cos(a+0.3)*r*.8,Math.sin(a+0.3)*r*.8,Math.cos(a)*r,Math.sin(a)*r);ctx.strokeStyle=shadeHex(C,0.5);ctx.lineWidth=5;ctx.stroke();}clearGlow(ctx);
  // pulsing bio-maw center
  glow(ctx,C,18);circle(ctx,0,0,r*.35,C,null);clearGlow(ctx);
  circle(ctx,0,0,r*.22,'#fff9c4',null);
  // barbs / armor spines
  for(let i=0;i<6;i++){const a=((i+.5)/6)*Math.PI*2;armorPlate(ctx,[[Math.cos(a)*r*.65,Math.sin(a)*r*.65],[Math.cos(a-.12)*r*.85,Math.sin(a-.12)*r*.85],[Math.cos(a+.12)*r*.85,Math.sin(a+.12)*r*.85]],C);}
  // vein ring
  for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;vein(ctx,Math.cos(a)*r*.3,Math.sin(a)*r*.3,Math.cos(a)*r*.7,Math.sin(a)*r*.7,Math.cos(a-.2)*r*.5,Math.sin(a-.2)*r*.5,VN,0.7);}
  ctx.restore();
}
function after_lancer(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#ff8a3b',VN='#fdba74';
  ctx.save();ctx.translate(cx,cy);
  // elongated bio-rifle body
  glow(ctx,C,10);
  ctx.beginPath();ctx.moveTo(r*1.5,0);ctx.bezierCurveTo(r*.8,r*.18,-r*.3,r*.22,-r*.6,r*.1);ctx.bezierCurveTo(-r*.3,r*.22,-r*.3,-r*.22,-r*.6,-r*.1);ctx.bezierCurveTo(-r*.3,-r*.22,r*.8,-r*.18,r*1.5,0);ctx.closePath();
  ctx.fillStyle=shadeHex(C,0.2);ctx.fill();ctx.strokeStyle=C;ctx.lineWidth=1.5;ctx.stroke();clearGlow(ctx);
  // nerve-cord tendons
  vein(ctx,-r*.4,0,r*1.1,0,-r*.1,-r*.05,VN,0.8);
  vein(ctx,-r*.4,r*.06,r*.6,r*.04,0,r*.1,VN,0.5);
  // chitin armor plates on body
  armorPlate(ctx,[[r*.1,r*.18],[r*.5,r*.18],[r*.5,-r*.18],[r*.1,-r*.18]],C);
  armorPlate(ctx,[[-r*.55,r*.09],[-r*.2,r*.09],[-r*.2,-r*.09],[-r*.55,-r*.09]],C);
  // crystalline targeting eye at tip
  eye(ctx,r*1.25,0,r*.1,'#fde047');
  // targeting membrane
  glow(ctx,VN,6);ctx.beginPath();ctx.arc(r*1.25,0,r*.22,0,Math.PI*2);ctx.strokeStyle=\`rgba(253,224,71,0.4)\`;ctx.lineWidth=1;ctx.stroke();clearGlow(ctx);
  ctx.restore();
}
function after_bomber(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#fb7185',VN='#fda4af';
  ctx.save();ctx.translate(cx,cy);
  // pressure sac body - slightly irregular
  glow(ctx,C,14);
  ctx.beginPath();ctx.ellipse(0,0,r*1.05,r*.92,0.15,0,Math.PI*2);
  ctx.fillStyle=shadeHex(C,0.2);ctx.fill();ctx.strokeStyle=C;ctx.lineWidth=1.8;ctx.stroke();clearGlow(ctx);
  // distended veins on surface (bio-stress)
  for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2;const ox=Math.cos(a)*r*.3,oy=Math.sin(a)*r*.3;vein(ctx,ox,oy,Math.cos(a)*r*.85,Math.sin(a)*r*.85,Math.cos(a+.4)*r*.6,Math.sin(a+.4)*r*.6,VN,0.7);}
  // pulsing core visible through membrane
  glow(ctx,'#ffffff',12);circle(ctx,0,0,r*.3,'rgba(255,255,220,0.8)',null);clearGlow(ctx);
  glow(ctx,C,18);circle(ctx,0,0,r*.18,C,null);clearGlow(ctx);
  // stressed bio-seams (pre-rupture lines)
  ctx.setLineDash([2,3]);ctx.beginPath();ctx.arc(0,0,r*.55,Math.PI*.1,Math.PI*.9);ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1;ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,r*.55,Math.PI*1.1,Math.PI*1.9);ctx.stroke();ctx.setLineDash([]);
  ctx.restore();
}
function after_wisp(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#67e8f9',VN='#cffafe';
  ctx.save();ctx.translate(cx,cy);
  // neuron-like micro-organism
  glow(ctx,C,10);circle(ctx,0,0,r*.45,shadeHex(C,0.25),C,1.2);clearGlow(ctx);
  // synapse dendrites
  for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2;const ex=Math.cos(a)*r*.9,ey=Math.sin(a)*r*.9;vein(ctx,0,0,ex,ey,Math.cos(a+.5)*r*.5,Math.sin(a+.5)*r*.5,VN,0.6);ctx.beginPath();ctx.arc(ex,ey,1.5,0,Math.PI*2);ctx.fillStyle=VN;ctx.fill();}
  // single glowing synapse core
  glow(ctx,'#ffffff',8);circle(ctx,0,0,r*.2,'#cffafe',null);clearGlow(ctx);
  ctx.restore();
}
function after_drifter(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#10b981',VN='#6ee7b7';
  ctx.save();ctx.translate(cx,cy);
  // arthropod crescent body
  glow(ctx,C,10);
  ctx.beginPath();ctx.arc(0,0,r,-1.1,1.1);ctx.arc(r*.7,0,r*.9,.95,-.95,true);ctx.closePath();
  ctx.fillStyle=shadeHex(C,0.2);ctx.fill();ctx.strokeStyle=C;ctx.lineWidth=1.5;ctx.stroke();clearGlow(ctx);
  // compound eye cluster on leading edge
  for(let i=0;i<3;i++){const a=(i-1)*.3;eye(ctx,r*.75+Math.cos(a)*r*.15,Math.sin(a)*r*.2,r*.07,'#fde047');}
  // articulated feeder limbs
  const limbPts=[[r*.2,r*.5],[r*.4,r*.85],[r*.55,r*.8]];
  vein(ctx,...limbPts[0],...limbPts[2],r*.4,r*.65,VN,0.7);
  vein(ctx,r*.2,-r*.5,r*.55,-r*.8,r*.4,-r*.65,VN,0.7);
  // bio-vein across body
  vein(ctx,-r*.3,0,r*.6,0,r*.1,-r*.15,VN,0.8);
  // armor dorsal plate
  armorPlate(ctx,[[-r*.2,-r*.25],[-r*.5,0],[-r*.2,r*.25],[r*.3,r*.2],[r*.3,-r*.2]],C);
  ctx.restore();
}
function after_shade(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#f97316',VN='#fdba74';
  ctx.save();ctx.translate(cx,cy);
  // stealth predator — translucent membrane body
  ctx.globalAlpha=0.7;
  ctx.beginPath();ctx.ellipse(0,0,r,r,.2,0,Math.PI*2);
  ctx.fillStyle='rgba(249,115,22,0.15)';ctx.fill();
  ctx.strokeStyle=C;ctx.lineWidth=1.2;ctx.stroke();
  ctx.globalAlpha=1;
  // photoreceptor-dimming organs (dark spots)
  for(let i=0;i<3;i++){const a=(i/3)*Math.PI*2+.5;const x=Math.cos(a)*r*.45,y=Math.sin(a)*r*.45;ctx.beginPath();ctx.arc(x,y,r*.15,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fill();ctx.strokeStyle='rgba(249,115,22,0.4)';ctx.lineWidth=0.8;ctx.stroke();}
  // compressed bio-spine cluster
  glow(ctx,C,8);for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*r*.38,Math.sin(a)*r*.38);ctx.strokeStyle=VN;ctx.lineWidth=0.7;ctx.stroke();}clearGlow(ctx);
  // lurking eye
  eye(ctx,0,0,r*.12,'#fde047');
  ctx.restore();
}
function after_brooder(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#a78bfa',VN='#ddd6fe';
  ctx.save();ctx.translate(cx,cy);
  // bio-mechanical carrier pod — hex shell
  glow(ctx,C,12);ngon(ctx,6,0,0,r,0,shadeHex(C,0.18),C,1.8);clearGlow(ctx);
  // interior gestation glow
  glow(ctx,C,8);circle(ctx,0,0,r*.38,'rgba(167,139,250,0.25)',null);clearGlow(ctx);
  // 3 gestation sacs attached via umbilical veins
  for(let i=0;i<3;i++){
    const a=(i/3)*Math.PI*2+Math.PI/6;const ex=Math.cos(a)*r*.85,ey=Math.sin(a)*r*.85;
    vein(ctx,Math.cos(a)*r*.42,Math.sin(a)*r*.42,ex,ey,Math.cos(a+.3)*r*.6,Math.sin(a+.3)*r*.6,VN,1);
    glow(ctx,C,8);ctx.beginPath();ctx.ellipse(ex,ey,r*.14,r*.12,(a+.3),0,Math.PI*2);ctx.fillStyle='rgba(167,139,250,0.6)';ctx.fill();ctx.strokeStyle=VN;ctx.lineWidth=1;ctx.stroke();clearGlow(ctx);
  }
  // mother eye cluster at center
  eye(ctx,0,-r*.05,r*.1,'#fde047');eye(ctx,r*.12,r*.08,r*.07,'#fde047');eye(ctx,-r*.12,r*.08,r*.07,'#fde047');
  ctx.restore();
}
function after_herald(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#a3e635',VN='#d9f99d';
  ctx.save();ctx.translate(cx,cy);
  // living wall-segment organism
  glow(ctx,C,10);
  ctx.beginPath();ctx.rect(-r*.42,-r*1.15,r*.84,r*2.3);ctx.fillStyle=shadeHex(C,0.18);ctx.fill();ctx.strokeStyle=C;ctx.lineWidth=1.5;ctx.stroke();clearGlow(ctx);
  // bio-joint gaps (organic panels)
  for(let i=-1;i<=1;i+=2){const y=i*r*.4;armorPlate(ctx,[[-r*.38,y-r*.25],[-r*.38,y+r*.25],[r*.38,y+r*.25],[r*.38,y-r*.25]],C);}
  armorPlate(ctx,[[-r*.38,r*.8],[r*.38,r*.8],[r*.38,r*1.1],[-r*.38,r*1.1]],C);
  armorPlate(ctx,[[-r*.38,-r*.8],[r*.38,-r*.8],[r*.38,-r*1.1],[-r*.38,-r*1.1]],C);
  // central bio-duct (nutrient vein)
  vein(ctx,0,-r*1.0,0,r*1.0,r*.1,0,VN,1.2);
  // eye on the wall's "face"
  eye(ctx,0,0,r*.12,'#fde047');
  ctx.restore();
}
function after_seeker(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#e879f9',VN='#f0abfc';
  ctx.save();ctx.translate(cx,cy);
  // lock-on predator diamond body
  glow(ctx,C,12);
  ngon(ctx,4,0,0,r,Math.PI/4,shadeHex(C,0.2),C,1.8);clearGlow(ctx);
  // targeting cluster eye array (center + 4 quadrant eyes)
  eye(ctx,0,0,r*.18,'#fde047');
  for(let i=0;i<4;i++){const a=(i/4)*Math.PI*2+Math.PI/4;eye(ctx,Math.cos(a)*r*.45,Math.sin(a)*r*.45,r*.07,'#fde047');}
  // magnetoreceptive spine organs
  for(let i=0;i<4;i++){const a=(i/4)*Math.PI*2+Math.PI/8;vein(ctx,Math.cos(a)*r*.3,Math.sin(a)*r*.3,Math.cos(a)*r*.7,Math.sin(a)*r*.7,Math.cos(a-.2)*r*.5,Math.sin(a-.2)*r*.5,VN,0.6);}
  // reticle (organic targeting ring)
  glow(ctx,VN,6);ctx.setLineDash([4,4]);ctx.beginPath();ctx.arc(0,0,r*1.45,0,Math.PI*2);ctx.strokeStyle='rgba(240,171,252,0.5)';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);clearGlow(ctx);
  ctx.restore();
}
function after_warden(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#ff3b6b',VN='#ffa3bb';
  ctx.save();ctx.translate(cx,cy);
  // chitinous hex carapace
  glow(ctx,C,18);ngon(ctx,6,0,0,r,0,shadeHex(C,0.18),C,2);clearGlow(ctx);
  // armor plate segments over hex
  for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;const nx=Math.cos(a),ny=Math.sin(a);armorPlate(ctx,[[nx*r*.35,ny*r*.35],[nx*r*.35+Math.cos(a+Math.PI/2)*r*.25,ny*r*.35+Math.sin(a+Math.PI/2)*r*.25],[nx*r*.8+Math.cos(a+Math.PI/2)*r*.28,ny*r*.8+Math.sin(a+Math.PI/2)*r*.28],[nx*r*.8,ny*r*.8]],C);}
  // rotating organic spine rings
  glow(ctx,C,6);ctx.beginPath();ctx.arc(0,0,r*1.2,0,Math.PI*2);ctx.strokeStyle='rgba(255,59,107,0.5)';ctx.lineWidth=3;ctx.stroke();clearGlow(ctx);
  // bio-veins radiating outward
  for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;vein(ctx,0,0,Math.cos(a)*r*.8,Math.sin(a)*r*.8,Math.cos(a+.3)*r*.4,Math.sin(a+.3)*r*.4,VN,0.6);}
  // eye cluster - multi-ocular (boss scale)
  eye(ctx,0,0,r*.2,'#fde047');
  for(let i=0;i<4;i++){const a=(i/4)*Math.PI*2;eye(ctx,Math.cos(a)*r*.42,Math.sin(a)*r*.42,r*.1,'#fde047');}
  // exposed visceral core
  glow(ctx,'#fff',6);circle(ctx,0,0,r*.1,'#fff3a8',null);clearGlow(ctx);
  // gold rear weak-point — pulsing organ cluster
  ctx.beginPath();ctx.arc(0,0,r*1.35,Math.PI*.6,Math.PI*1.4);
  glow(ctx,'#fde047',12);ctx.strokeStyle='#fde047';ctx.lineWidth=5;ctx.lineCap='round';ctx.stroke();
  clearGlow(ctx);ctx.lineCap='butt';
  // hp ring
  ctx.beginPath();ctx.arc(0,0,r*1.6,-Math.PI/2,-Math.PI/2+Math.PI*2*.6);ctx.strokeStyle=C;ctx.lineWidth=3;ctx.stroke();
  ctx.restore();
}
function after_weaver(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#a855f7',VN='#d8b4fe';
  ctx.save();ctx.translate(cx,cy);
  // arachnid thorax core
  glow(ctx,C,14);circle(ctx,0,0,r*.38,shadeHex(C,0.25),C,2);clearGlow(ctx);
  // 8 spindly bio-mechanical appendages
  for(let i=0;i<8;i++){
    const a=(i/8)*Math.PI*2;const ex=Math.cos(a)*r*.95,ey=Math.sin(a)*r*.95;
    const mx=Math.cos(a+.35)*r*.55,my=Math.sin(a+.35)*r*.55;
    vein(ctx,Math.cos(a)*r*.35,Math.sin(a)*r*.35,ex,ey,mx,my,VN,1.2);
    // eye at each appendage tip
    eye(ctx,ex,ey,r*.06,'#fde047');
  }
  // bio-silk gland (center)
  glow(ctx,VN,10);circle(ctx,0,0,r*.15,'#f0e8ff',null);clearGlow(ctx);
  // chitin thorax plates
  armorPlate(ctx,[[0,-r*.35],[r*.2,-r*.15],[r*.2,r*.15],[0,r*.35],[-r*.2,r*.15],[-r*.2,-r*.15]],C);
  // counter-rotating vein ring
  glow(ctx,C,6);ctx.beginPath();ctx.arc(0,0,r*1.25,0,Math.PI*2);ctx.strokeStyle='rgba(168,85,247,0.45)';ctx.lineWidth=2;ctx.stroke();clearGlow(ctx);
  // hp ring
  ctx.beginPath();ctx.arc(0,0,r*1.6,-Math.PI/2,-Math.PI/2+Math.PI*2*.7);ctx.strokeStyle=C;ctx.lineWidth=3;ctx.stroke();
  ctx.restore();
}
function after_beacon(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#38bdf8',VN='#7dd3fc';
  ctx.save();ctx.translate(cx,cy);
  // bio-lighthouse nested rib-cage structure
  for(let k=3;k>=1;k--){glow(ctx,C,5*k);ctx.beginPath();ctx.ellipse(0,0,r*(k/3+.05),r*(k/3),0,0,Math.PI*2);ctx.strokeStyle=\`rgba(56,189,248,\${.15+.1*k})\`;ctx.lineWidth=1.5+k*.3;ctx.stroke();clearGlow(ctx);}
  // bioluminescent lens organ
  glow(ctx,C,18);circle(ctx,0,0,r*.28,'#bfefff',null);clearGlow(ctx);
  // rib-cage structure
  for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;vein(ctx,0,0,Math.cos(a)*r*.85,Math.sin(a)*r*.85,Math.cos(a+.4)*r*.5,Math.sin(a+.4)*r*.5,VN,0.8);}
  // sweep beam (living bioluminescent organ extending out)
  ctx.save();ctx.rotate(-0.6);
  ctx.globalAlpha=0.35;
  const bw=14;
  ctx.fillStyle='rgba(125,211,252,0.6)';
  const blen=cx*2;
  ctx.beginPath();ctx.moveTo(r*.3,-bw/2);ctx.lineTo(blen,-bw*1.2);ctx.lineTo(blen,bw*1.2);ctx.lineTo(r*.3,bw/2);ctx.closePath();ctx.fill();
  ctx.globalAlpha=0.7;ctx.fillStyle='#e0f2fe';
  ctx.beginPath();ctx.moveTo(r*.3,-bw/6);ctx.lineTo(blen,-bw*.4);ctx.lineTo(blen,bw*.4);ctx.lineTo(r*.3,bw/6);ctx.closePath();ctx.fill();
  ctx.globalAlpha=1;ctx.restore();
  // eye cluster on lens
  eye(ctx,0,0,r*.12,'#fde047');for(let i=0;i<3;i++){const a=(i/3)*Math.PI*2;eye(ctx,Math.cos(a)*r*.18,Math.sin(a)*r*.18,r*.05,'#fde047');}
  // hp ring
  ctx.beginPath();ctx.arc(0,0,r*1.6,-Math.PI/2,-Math.PI/2+Math.PI*2*.8);ctx.strokeStyle=C;ctx.lineWidth=3;ctx.stroke();
  ctx.restore();
}
function after_mirrorblade(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#ef4444',VN='#fca5a5';
  ctx.save();ctx.translate(cx,cy);
  // reflective bio-plates as "skin" — asymmetric duelist form
  glow(ctx,C,12);
  ctx.beginPath();ctx.moveTo(-r*.8,0);ctx.bezierCurveTo(-r*.4,-r*.9,r*.6,-r*.9,r*.9,-r*.2);ctx.bezierCurveTo(r*1.1,r*.3,r*.5,r*.9,-r*.3,r*.8);ctx.bezierCurveTo(-r*.7,r*.6,-r*1.0,r*.3,-r*.8,0);
  ctx.fillStyle=shadeHex(C,0.18);ctx.fill();ctx.strokeStyle=C;ctx.lineWidth=1.8;ctx.stroke();clearGlow(ctx);
  // reflective bio-mirror plates
  armorPlate(ctx,[[-r*.5,-r*.55],[-r*.05,-r*.85],[r*.35,-r*.75],[r*.5,-r*.3],[-r*.1,-r*.2]],C);
  armorPlate(ctx,[[-r*.5,r*.4],[-r*.1,r*.2],[r*.4,r*.5],[r*.3,r*.78],[-r*.3,r*.75]],C);
  // mirror-sheen on plates
  glow(ctx,'#ffffff',4);ctx.beginPath();ctx.moveTo(-r*.3,-r*.65);ctx.lineTo(r*.1,-r*.55);ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=1;ctx.stroke();clearGlow(ctx);
  // muscular dash limbs
  vein(ctx,r*.1,-r*.5,r*.9,-r*.1,r*.7,-r*.4,VN,1.5);
  vein(ctx,r*.1,r*.4,r*.85,r*.1,r*.65,r*.35,VN,1.2);
  // eye — single predatory
  eye(ctx,r*.0,-r*.1,r*.16,'#fde047');
  // duplication glands (twin secondary eyes)
  eye(ctx,-r*.4,-r*.2,r*.07,'rgba(239,68,68,0.8)');
  eye(ctx,-r*.35,r*.25,r*.07,'rgba(239,68,68,0.8)');
  // hp ring
  ctx.beginPath();ctx.arc(0,0,r*1.6,-Math.PI/2,-Math.PI/2+Math.PI*2*.5);ctx.strokeStyle=C;ctx.lineWidth=3;ctx.stroke();
  ctx.restore();
}
function after_hollow(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#6ee7b7',VN='#a7f3d0';
  ctx.save();ctx.translate(cx,cy);
  // necrotic husk form — hollow nested organics
  for(let k=3;k>=1;k--){ctx.globalAlpha=0.2+0.12*k;glow(ctx,C,4*k);ctx.save();ctx.rotate(k*.3);ngon(ctx,5,0,0,r*(k/3),0,null,C,1.5);ctx.restore();clearGlow(ctx);}
  ctx.globalAlpha=1;
  // void at center (the hollow)
  circle(ctx,0,0,r*.25,'rgba(0,0,0,0.8)',C,1.5);
  // echo-shadow appendages drifting outward
  for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2;const ex=Math.cos(a)*r*.8,ey=Math.sin(a)*r*.8;ctx.globalAlpha=0.3;ctx.beginPath();ctx.arc(ex,ey,r*.12,0,Math.PI*2);ctx.fillStyle=C;ctx.fill();ctx.globalAlpha=1;}
  // bio-decay veins
  for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2;vein(ctx,Math.cos(a)*r*.28,Math.sin(a)*r*.28,Math.cos(a)*r*.6,Math.sin(a)*r*.6,Math.cos(a+.5)*r*.45,Math.sin(a+.5)*r*.45,VN,0.5);}
  // hollow eyes (empty sockets)
  for(let i=0;i<3;i++){const a=((i+.5)/5)*Math.PI*2;ctx.beginPath();ctx.arc(Math.cos(a)*r*.42,Math.sin(a)*r*.42,r*.07,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fill();glow(ctx,VN,4);ctx.strokeStyle=VN;ctx.lineWidth=0.8;ctx.stroke();clearGlow(ctx);}
  // hp ring
  ctx.beginPath();ctx.arc(0,0,r*1.6,-Math.PI/2,-Math.PI/2+Math.PI*2*.45);ctx.strokeStyle=C;ctx.lineWidth=3;ctx.stroke();
  ctx.restore();
}
function after_sovereign(ctx,cx,cy,r){
  clr(ctx,cx*2,cy*2);
  const C='#fde047',VN='#fef08a';
  ctx.save();ctx.translate(cx,cy);
  // apex entity — massive armored carapace
  glow(ctx,C,22);circle(ctx,0,0,r,shadeHex(C,0.14),C,2);clearGlow(ctx);
  // interlocking carapace plates (organic crown)
  for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;armorPlate(ctx,[[Math.cos(a)*r*.38,Math.sin(a)*r*.38],[Math.cos(a+.45)*r*.85,Math.sin(a+.45)*r*.85],[Math.cos(a+.5)*r*.92,Math.sin(a+.5)*r*.92],[Math.cos(a+.55)*r*.85,Math.sin(a+.55)*r*.85],[Math.cos(a+1.0)*r*.38,Math.sin(a+1.0)*r*.38]],C);}
  // orbital bio-cores (4 golden organs)
  for(let i=0;i<4;i++){const a=(i/4)*Math.PI*2;glow(ctx,C,16);circle(ctx,Math.cos(a)*r*.52,Math.sin(a)*r*.52,r*.1,C,null);clearGlow(ctx);glow(ctx,'#fff',6);circle(ctx,Math.cos(a)*r*.52,Math.sin(a)*r*.52,r*.05,'#fff9c4',null);clearGlow(ctx);}
  // gravity-bending membrane appendages (galaxy arms)
  for(let i=0;i<3;i++){const a=i*(Math.PI*2/3);ctx.save();ctx.rotate(a);glow(ctx,'rgba(253,224,71,0.5)',8);ctx.beginPath();ctx.moveTo(r*.2,0);ctx.bezierCurveTo(r*.8,-r*.4,r*1.0,-r*.8,r*.7,-r*1.2);ctx.strokeStyle='rgba(253,224,71,0.6)';ctx.lineWidth=4;ctx.stroke();clearGlow(ctx);ctx.restore();}
  // crown structure (8-point)
  for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2;const cx2=Math.cos(a)*r*.95,cy2=Math.sin(a)*r*.95;glow(ctx,C,8);ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.72,Math.sin(a)*r*.72);ctx.lineTo(cx2+Math.cos(a)*(r*.08),cy2+Math.sin(a)*(r*.08));ctx.strokeStyle=C;ctx.lineWidth=3;ctx.stroke();clearGlow(ctx);}
  // bio-veins across body
  for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;vein(ctx,0,0,Math.cos(a)*r*.5,Math.sin(a)*r*.5,Math.cos(a+.3)*r*.25,Math.sin(a+.3)*r*.25,VN,0.8);}
  // mega eye cluster at crown center
  eye(ctx,0,0,r*.18,'#ffffff');
  for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2;eye(ctx,Math.cos(a)*r*.32,Math.sin(a)*r*.32,r*.07,'#fde047');}
  // hp ring
  glow(ctx,C,8);ctx.beginPath();ctx.arc(0,0,r*1.6,-Math.PI/2,-Math.PI/2+Math.PI*2*.85);ctx.strokeStyle=C;ctx.lineWidth=4;ctx.stroke();clearGlow(ctx);
  ctx.restore();
}
`;

// ─── entity page generator ────────────────────────────────────────────────
interface Entity {
  id: string;
  name: string;
  role: string;
  color: string;
  r: number;
  desc: string;
  bioTags: string[];
}

const ENEMIES: Entity[] = [
  { id: 'darter',    name: 'Darter',    role: 'Charger',          color: '#ff3b6b', r: 13, desc: 'A low-mass velocity predator that rushes the lance in a straight line. Priority target — its speed is its lethality.', bioTags: ['vertebral spine', 'membranous wings', 'mono-eye'] },
  { id: 'orbiter',   name: 'Orbiter',   role: 'Ranged Harasser',  color: '#22d3ee', r: 12, desc: 'Maintains distance and peppers the arena with aimed shots. Hexagonal exo-shell rotates independently of the projectile organs.', bioTags: ['bio-vein lattice', 'triple photoreceptor', 'pulsing core'] },
  { id: 'splitter',  name: 'Splitter',  role: 'Divider',          color: '#a855f7', r: 19, desc: 'A pressurized organic cyst. On lethally struck, the division membrane ruptures into two independent organisms.', bioTags: ['division seam', 'chitinous plates', 'stress-glow suture'] },
  { id: 'bloomer',   name: 'Bloomer',   role: 'Stationary Turret',color: '#fbbf24', r: 18, desc: 'Rooted to its position, this coral-form creature periodically blooms radial patterns of bioluminescent ordnance.', bioTags: ['coral fronds', 'central bio-maw', 'barbed spines'] },
  { id: 'lancer',    name: 'Lancer',    role: 'Sniper',           color: '#ff8a3b', r: 14, desc: 'Locks onto the player with a crystalline targeting membrane before firing a high-velocity bio-projectile.', bioTags: ['nerve-cord tendons', 'chitin barrel', 'crystalline eye'] },
  { id: 'bomber',    name: 'Bomber',    role: 'AoE Detonator',    color: '#fb7185', r: 16, desc: 'A swollen pressure sac. As it approaches, distended bio-veins signal its detonation countdown.', bioTags: ['pressure membrane', 'ruptured vein detail', 'luminous core'] },
  { id: 'wisp',      name: 'Wisp',      role: 'Swarm Node',       color: '#67e8f9', r: 8,  desc: 'A neural microbe that travels in coordinated packs. Individually frail; collectively dangerous.', bioTags: ['dendritic tendrils', 'synapse core', 'pack-mind organ'] },
  { id: 'drifter',   name: 'Drifter',   role: 'Crescent Stalker', color: '#10b981', r: 14, desc: 'An arthropod apex-form that curves around the arena edge, deploying feeder limbs before striking.', bioTags: ['compound eye cluster', 'articulated limbs', 'dorsal carapace'] },
  { id: 'shade',     name: 'Shade',     role: 'Stealth Predator', color: '#f97316', r: 14, desc: 'A near-transparent membrane predator with photoreceptor-dimming organs that suppress its own bioluminescence.', bioTags: ['dimmer organs', 'compressed spine', 'lurking eye'] },
  { id: 'brooder',   name: 'Brooder',   role: 'Carrier / Spawner',color: '#a78bfa', r: 17, desc: 'A hexagonal carrier pod that gestates minis in external sacs fed by umbilical bio-veins, releasing them when struck.', bioTags: ['gestation sacs', 'umbilical veins', 'mother-eye cluster'] },
  { id: 'herald',    name: 'Herald',    role: 'Wall Caster',      color: '#a3e635', r: 16, desc: 'A tall living wall-segment that erects bio-barriers across the arena, leaving a passable bio-gap joint.', bioTags: ['exoskeleton panels', 'nutrient duct', 'singular eye'] },
  { id: 'seeker',    name: 'Seeker',    role: 'Homing Striker',   color: '#e879f9', r: 14, desc: 'A diamond-form predator with a full array of targeting eyes and magnetoreceptive spines that home its projectiles.', bioTags: ['5-eye array', 'magnetoreceptive spines', 'organic reticle'] },
];

const BOSSES: Entity[] = [
  { id: 'warden',      name: 'THE WARDEN',      role: 'Boss I — Spiral Keeper',      color: '#ff3b6b', r: 44, desc: 'A bio-fortress. The chitinous hex carapace counter-rotates independently of the organic spine rings while the visceral core charges spiral patterns. Strike the gold rear organ for ×3 damage.', bioTags: ['chitinous carapace', 'rotating spine rings', 'visceral core', 'rear organ'] },
  { id: 'weaver',      name: 'THE WEAVER',      role: 'Boss II — Pinwheel Spinner',  color: '#a855f7', r: 42, desc: 'An apex arachnid with eight bio-mechanical appendages radiating from the silk-gland thorax. Each limb tip bears a photoreceptive eye that tracks the player for pulse rings.', bioTags: ['8 appendages', 'bio-silk gland', 'tip-eyes', 'chitin thorax'] },
  { id: 'beacon',      name: 'THE BEACON',      role: 'Boss III — Sweep Emitter',    color: '#38bdf8', r: 38, desc: 'A bio-lighthouse with a nested rib-cage structure housing a bioluminescent lens organ that sweeps a lethal beam across the arena. Passable only in the dark phase.', bioTags: ['rib-cage nesting', 'bioluminescent lens', 'eye cluster array', 'living beam'] },
  { id: 'mirrorblade', name: 'THE MIRRORBLADE', role: 'Boss IV — Dash Duelist',      color: '#ef4444', r: 22, desc: 'Wears reflective bio-plate armor and mirrors your movement. Duplication glands produce a shadow-self that mimics your dash. The only boss you must outthink, not outfight.', bioTags: ['bio-mirror plates', 'muscular dash limbs', 'predatory eye', 'duplication glands'] },
  { id: 'hollow',      name: 'THE HOLLOW',      role: 'Boss V — Necrotic Echo',      color: '#6ee7b7', r: 40, desc: 'A necrotic husk-form that leaves echo-shadow appendages drifting outward as it syncs. The void at center must be dashed through during the brief open window.', bioTags: ['hollow nested organics', 'echo appendages', 'void center', 'decay veins'] },
  { id: 'sovereign',   name: 'THE SOVEREIGN',   role: 'Boss VI — Apex Entity',       color: '#fde047', r: 50, desc: 'The apex bio-mechanical entity. Interlocking carapace plates form its crown; orbital bio-cores must be destroyed before the crown is exposed. Gravity-bending membrane appendages curve bullets toward the core.', bioTags: ['carapace crown', 'orbital bio-cores', 'gravity membranes', 'mega-eye cluster'] },
];

function entityCard(e: Entity, size: number): string {
  const cw = size;
  const ch = size;
  return `
<div class="card">
  <div class="card-header">
    <span class="name" style="color:${e.color}">${e.name}</span>
    <span class="role">${e.role}</span>
  </div>
  <div class="canvases">
    <div class="canvas-wrap">
      <label>Before</label>
      <canvas id="b_${e.id}" width="${cw}" height="${ch}"></canvas>
    </div>
    <div class="canvas-wrap">
      <label>After — Biomechanical</label>
      <canvas id="a_${e.id}" width="${cw}" height="${ch}"></canvas>
    </div>
  </div>
  <div class="card-body">
    <div class="desc">${e.desc}</div>
    <div>${e.bioTags.map(t => `<span class="bio-tag">${t}</span>`).join(' ')}</div>
  </div>
</div>`;
}

function entityScript(entities: Entity[], size: number): string {
  const cx = size / 2;
  const cy = size / 2;
  const calls = entities.map(e => {
    const r = (size / 2) * 0.62;
    return `
(function(){
  var b=document.getElementById('b_${e.id}');
  var a=document.getElementById('a_${e.id}');
  if(!b||!a)return;
  before_${e.id}(b.getContext('2d'),${cx},${cy},${r.toFixed(1)});
  after_${e.id}(a.getContext('2d'),${cx},${cy},${r.toFixed(1)});
})();`;
  }).join('\n');
  return `<script>${DRAW_UTILS}\n${BEFORE_DRAWS}\n${AFTER_DRAWS}\n${calls}</script>`;
}

// ─── page builders ────────────────────────────────────────────────────────
function enemiesPage(): string {
  const SZ = 160;
  const cards = ENEMIES.map(e => entityCard(e, SZ)).join('\n');
  const body = `
${nav('/enemies')}
<div class="page">
  <h2>Chaff Enemies — Option B: Biomechanical</h2>
  <div class="legend">
    <span><span class="dot" style="background:#334155"></span>Before — current geometric style</span>
    <span><span class="dot" style="background:#4ade80"></span>After — biomechanical redesign</span>
  </div>
  <div class="grid">${cards}</div>
</div>
${entityScript(ENEMIES, SZ)}`;
  return html('Enemies', body);
}

function bossesPage(): string {
  const SZ = 200;
  const cards = BOSSES.map(e => entityCard(e, SZ)).join('\n');
  const body = `
${nav('/bosses')}
<div class="page">
  <h2>Bosses — Option B: Biomechanical</h2>
  <div class="legend">
    <span><span class="dot" style="background:#334155"></span>Before — current geometric style</span>
    <span><span class="dot" style="background:#4ade80"></span>After — biomechanical redesign</span>
  </div>
  <div class="grid">${cards}</div>
</div>
${entityScript(BOSSES, SZ)}`;
  return html('Bosses', body);
}

function indexPage(): string {
  const body = `
${nav('/')}
<div class="hero">
  <h1>Enemy Design Proposals</h1>
  <p>Three visual directions for the enemy redesign. Option B (Biomechanical) has been selected for development. Browse the enemies and bosses pages to see before/after comparisons for all 12 chaff enemy types and 6 boss encounters.</p>
  <div class="proposal-grid">
    <a href="/b" class="prop-card">
      <h3>A — Crystalline</h3>
      <p>Crystal shard accents, internal facet geometry, prismatic highlights, orbiting fragments.</p>
      <div class="tags"><span class="tag">geometric</span><span class="tag">reflective</span><span class="tag">prismatic</span></div>
    </a>
    <a href="/b" class="prop-card active">
      <h3>B — Biomechanical ✓</h3>
      <p>Organic cores in armor shells, glowing bio-veins, eye clusters, living machines. Selected direction.</p>
      <div class="tags"><span class="tag">organic</span><span class="tag">armored</span><span class="tag">bio-vein</span><span class="tag">multi-eye</span></div>
    </a>
    <a href="/c" class="prop-card">
      <h3>C — Spectral</h3>
      <p>Ghost echo trails, particle dissolution, neon energy wisps, phase shimmer.</p>
      <div class="tags"><span class="tag">ethereal</span><span class="tag">particle</span><span class="tag">neon</span></div>
    </a>
  </div>
</div>
<div class="page">
  <h2>Browse</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:640px">
    <a href="/enemies" style="display:block;padding:20px;background:var(--panel);border:1px solid var(--border);border-radius:8px;text-decoration:none;color:inherit">
      <div style="font-size:.85rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text);margin-bottom:6px">Enemies →</div>
      <div style="font-size:.72rem;color:var(--muted)">12 chaff enemy types — Darter, Orbiter, Splitter, Bloomer, Lancer, Bomber, Wisp, Drifter, Shade, Brooder, Herald, Seeker</div>
    </a>
    <a href="/bosses" style="display:block;padding:20px;background:var(--panel);border:1px solid var(--border);border-radius:8px;text-decoration:none;color:inherit">
      <div style="font-size:.85rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text);margin-bottom:6px">Bosses →</div>
      <div style="font-size:.72rem;color:var(--muted)">6 boss encounters — Warden, Weaver, Beacon, Mirrorblade, Hollow, Sovereign</div>
    </a>
  </div>
</div>`;
  return html('Overview', body);
}

// ─── worker ───────────────────────────────────────────────────────────────
export default {
  fetch(req: Request): Response {
    const path = new URL(req.url).pathname.replace(/\/$/, '') || '/';
    const h = { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' };
    if (path === '/enemies') return new Response(enemiesPage(), { headers: h });
    if (path === '/bosses') return new Response(bossesPage(), { headers: h });
    if (path === '/b') return new Response(indexPage(), { headers: h });
    if (path === '/a' || path === '/c') return new Response(indexPage(), { headers: h });
    return new Response(indexPage(), { headers: h });
  },
};
