/* ============ Foundry — renderer: clean vector factory art ============ */
(function(root){
'use strict';
const F = root.F;
const { DX, DY, clamp, lerp } = F;

const TILE = 36;                 // world pixels per tile at zoom 1
const R = F.render = {
  canvas: null, ctx: null,
  W: 0, H: 0, dpr: 1,
  cam: { x: 0, y: 0, zoom: 1.15 },  // x,y = world-tile coords at screen centre
  groundCanvas: null, groundScale: 12,
  iconCache: {},
  particles: [],
  floats: [],
  shake: 0,
  cine: null,       // win cinematic state
  time: 0,
};

/* ---------------- setup ---------------- */
R.init = function(canvas){
  R.canvas = canvas;
  R.ctx = canvas.getContext('2d');
  R.resize();
};

R.resize = function(){
  const c = R.canvas;
  const w = root.innerWidth, h = root.innerHeight;
  R.dpr = Math.min(2, root.devicePixelRatio || 1);
  c.width = Math.round(w * R.dpr);
  c.height = Math.round(h * R.dpr);
  c.style.width = w + 'px';      // pin CSS size — avoids DPR off-centre drift
  c.style.height = h + 'px';
  R.W = w; R.H = h;
};

/* ---------------- coordinate transforms ---------------- */
R.tilePx = () => TILE * R.cam.zoom;
R.worldToScreen = function(tx, ty){
  const s = R.tilePx();
  return [ R.W / 2 + (tx - R.cam.x) * s, R.H / 2 + (ty - R.cam.y) * s ];
};
R.screenToWorld = function(px, py){
  const s = R.tilePx();
  return [ R.cam.x + (px - R.W / 2) / s, R.cam.y + (py - R.H / 2) / s ];
};

/* ==================================================================== */
/* GROUND pre-render                                                    */
/* ==================================================================== */
R.buildGround = function(S){
  const g = R.groundScale;
  const cv = document.createElement('canvas');
  cv.width = S.w * g; cv.height = S.h * g;
  const x = cv.getContext('2d');
  const rng = F.makeRng(S.seed ^ 0x9e3779b9);
  x.fillStyle = '#171c26';
  x.fillRect(0, 0, cv.width, cv.height);
  // soft large-scale mottling
  for (let i = 0; i < 900; i++){
    const rx = rng() * cv.width, ry = rng() * cv.height, rr = 20 + rng() * 70;
    const grad = x.createRadialGradient(rx, ry, 0, rx, ry, rr);
    const tint = rng() < .5 ? '21,27,38' : '19,23,32';
    grad.addColorStop(0, `rgba(${tint},${.25 + rng() * .3})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = grad;
    x.fillRect(rx - rr, ry - rr, rr * 2, rr * 2);
  }
  // per-tile grain
  for (let ty = 0; ty < S.h; ty++) for (let tx = 0; tx < S.w; tx++){
    const v = S.ground[ty * S.w + tx];
    if (v > 3) continue;
    x.fillStyle = `rgba(255,255,255,${.008 + v * .006})`;
    x.fillRect(tx * g, ty * g, g, g);
  }
  // scatter pebbles / cracks
  x.strokeStyle = 'rgba(0,0,0,.25)';
  x.lineWidth = 1;
  for (let i = 0; i < 500; i++){
    const rx = rng() * cv.width, ry = rng() * cv.height;
    if (rng() < .6){
      x.fillStyle = `rgba(${rng() < .5 ? '90,100,118' : '60,68,82'},${.12 + rng() * .12})`;
      x.beginPath(); x.arc(rx, ry, .6 + rng() * 1.6, 0, 7); x.fill();
    } else {
      x.beginPath(); x.moveTo(rx, ry);
      x.lineTo(rx + (rng() - .5) * 14, ry + (rng() - .5) * 14);
      x.stroke();
    }
  }
  /* ---- the world heals: life radiates from the Core as tiers complete ----
     radius grows with msIndex; won/freeplay = full bloom. Rebuilt on each
     milestone (drainEvents → R.buildGround). */
  /* heal radius per completed tier (tiles): barely creeps in for the first
     few tiers, then accelerates; full map on victory */
  const HEAL_R = [0, 2, 4, 6, 8, 11, 14, 17, 20, 24, 28, 33, 38, 45, 53, 63, 70, 78, 100, 120, 140, 158, 1e4];
  const msDone = S.won || S.freeplay ? HEAL_R.length - 1 : Math.min(S.msIndex || 0, HEAL_R.length - 1);
  R._heal = null;
  if (HEAL_R[msDone] > 0){
    const ccx = S.w / 2, ccy = S.h / 2;
    const maxD = Math.hypot(ccx, ccy) + 6;
    const healR = Math.min(HEAL_R[msDone], maxD);
    R._heal = { cx: ccx, cy: ccy, r: healR };
    const fade = Math.max(4, healR * .25);
    const hr = F.makeRng((S.seed ^ 0x51ed270b) >>> 0);
    for (let ty = 0; ty < S.h; ty++) for (let tx = 0; tx < S.w; tx++){
      const jitter = (hr() - .5) * 5;                 // ragged organic edge
      const gr1 = hr(), gr2 = hr();                   // fixed draws → stable pattern per tier
      const i = ty * S.w + tx;
      if (S.oreType[i]) continue;                     // never green over ore or oil
      if (S.water && S.water[i]) continue;            // …or across open water
      const d = Math.hypot(tx + .5 - ccx, ty + .5 - ccy) + jitter;
      let h = (healR - d) / fade;
      if (h <= 0) continue;
      h = Math.min(1, h);
      // mossy base wash
      const v = S.ground[i];
      x.fillStyle = `rgba(${34 + v * 3},${58 + v * 4},${34 + v * 2},${(.5 + v * .04) * h * .8})`;
      x.fillRect(tx * g, ty * g, g, g);
      // sparse low grass
      if (h > .4 && gr1 < .05){
        x.strokeStyle = `rgba(${95 + gr2 * 30},${138 + gr2 * 40},${72 + gr2 * 20},${.4 * h})`;
        x.lineWidth = 1;
        const bx = tx * g + 2 + gr2 * (g - 4), by = ty * g + g * .7;
        for (let b = 0; b < 2; b++){
          x.beginPath();
          x.moveTo(bx + b * 2, by);
          x.lineTo(bx + b * 2 + (gr1 * 20 % 1 - .5) * 2, by - 2 - gr2 * 2.5);
          x.stroke();
        }
      }
      // very rare small flowers deep in the healed zone
      if (h > .65 && gr1 >= .05 && gr1 < .056){
        x.fillStyle = gr2 < .5 ? `rgba(216,194,106,${.6 * h})` : `rgba(201,162,201,${.6 * h})`;
        x.beginPath();
        x.arc(tx * g + 2 + gr2 * (g - 4), ty * g + 2 + gr1 * 16 % (g - 4), .9 + gr2 * .5, 0, 7);
        x.fill();
      }
    }
  }
  /* ---- open water (v3 worlds): dark lakes with shore rims, then decks ---- */
  if (S.water){
    for (let ty = 0; ty < S.h; ty++) for (let tx = 0; tx < S.w; tx++){
      if (S.water[ty * S.w + tx]) paintWaterTile(x, S, tx, ty, g);
    }
    for (let ty = 0; ty < S.h; ty++) for (let tx = 0; tx < S.w; tx++){
      if (S.platform[ty * S.w + tx]) paintPlatformTile(x, tx, ty, g);
    }
  }
  // ore patch under-glow (so patches read from far zoom)
  for (let ty = 0; ty < S.h; ty++) for (let tx = 0; tx < S.w; tx++){
    const i = ty * S.w + tx;
    const t = S.oreType[i];
    if (!t) continue;
    const ore = F.ORES[t];
    x.fillStyle = hexA(ore.c2, .42);
    x.fillRect(tx * g, ty * g, g, g);
  }
  R.groundCanvas = cv;
};

/* one water tile: darker in the deeps, pale rim along every shore, the
   occasional static glint (deterministic per tile so rebuilds are stable) */
function paintWaterTile(x, S, tx, ty, g){
  const i = ty * S.w + tx;
  const N = ty > 0        && S.water[i - S.w];
  const So = ty < S.h - 1 && S.water[i + S.w];
  const W = tx > 0        && S.water[i - 1];
  const E = tx < S.w - 1  && S.water[i + 1];
  x.fillStyle = (N && So && W && E) ? '#0b1722' : '#0e1d2b';
  x.fillRect(tx * g, ty * g, g, g);
  x.fillStyle = 'rgba(140,200,220,.18)';
  if (!N)  x.fillRect(tx * g, ty * g, g, 1);
  if (!So) x.fillRect(tx * g, ty * g + g - 1, g, 1);
  if (!W)  x.fillRect(tx * g, ty * g, 1, g);
  if (!E)  x.fillRect(tx * g + g - 1, ty * g, 1, g);
  let h2 = (tx * 668265263 + ty * 374761393) >>> 0;
  h2 = (h2 ^ (h2 >> 13)) * 1274126177 >>> 0;
  if ((h2 & 15) === 3){
    x.fillStyle = 'rgba(150,210,230,.10)';
    x.fillRect(tx * g + ((h2 >> 4) % (g - 4)) + 1, ty * g + ((h2 >> 7) % (g - 3)) + 1, 3, 1);
  }
}

/* one platform deck tile painted onto the ground canvas */
function paintPlatformTile(x, tx, ty, g){
  const px = tx * g, py = ty * g;
  x.fillStyle = '#39404e';
  x.fillRect(px, py, g, g);
  x.fillStyle = 'rgba(0,0,0,.28)';                       // plank seams
  x.fillRect(px, py + Math.floor(g / 3), g, 1);
  x.fillRect(px, py + Math.floor(g * 2 / 3), g, 1);
  x.fillStyle = 'rgba(255,255,255,.07)';                 // top light
  x.fillRect(px, py, g, 1);
  x.strokeStyle = 'rgba(8,10,14,.55)';                   // edge frame
  x.lineWidth = 1;
  x.strokeRect(px + .5, py + .5, g - 1, g - 1);
  x.fillStyle = 'rgba(210,220,235,.25)';                 // corner rivets
  x.fillRect(px + 1, py + 1, 1, 1); x.fillRect(px + g - 2, py + 1, 1, 1);
  x.fillRect(px + 1, py + g - 2, 1, 1); x.fillRect(px + g - 2, py + g - 2, 1, 1);
}

/* patch one tile after a platform is laid or lifted (water map never changes,
   so the neighbours' shore rims stay valid) */
R.platTile = function(S, tx, ty){
  if (!R.groundCanvas) return;
  const g = R.groundScale;
  const x = R.groundCanvas.getContext('2d');
  if (S.platform[ty * S.w + tx]) paintPlatformTile(x, tx, ty, g);
  else paintWaterTile(x, S, tx, ty, g);
};

/* patch one tile of the ground canvas (deposit depleted → scar) */
R.scarTile = function(S, tx, ty){
  if (!R.groundCanvas) return;
  const g = R.groundScale;
  const x = R.groundCanvas.getContext('2d');
  x.fillStyle = '#141821';
  x.fillRect(tx * g, ty * g, g, g);
  x.fillStyle = 'rgba(0,0,0,.3)';
  x.fillRect(tx * g + 1, ty * g + 1, g - 2, g - 2);
};

/* ==================================================================== */
/* helpers                                                              */
/* ==================================================================== */
function hexA(hex, a){
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
R.hexA = hexA;

function rr(x, ctx, px, py, w, h, r){
  ctx.beginPath();
  ctx.moveTo(px + r, py);
  ctx.arcTo(px + w, py, px + w, py + h, r);
  ctx.arcTo(px + w, py + h, px, py + h, r);
  ctx.arcTo(px, py + h, px, py, r);
  ctx.arcTo(px, py, px + w, py, r);
  ctx.closePath();
}
const rrect = (ctx, px, py, w, h, r) => rr(null, ctx, px, py, w, h, r);

/* ==================================================================== */
/* ITEM ICONS (cached)                                                  */
/* ==================================================================== */
R.itemIcon = function(id, size){
  size = Math.round(size);
  const key = id + '_' + size;
  if (R.iconCache[key]) return R.iconCache[key];
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const x = cv.getContext('2d');
  drawItemIcon(x, id, size);
  R.iconCache[key] = cv;
  return cv;
};

function drawItemIcon(x, id, s){
  const it = F.ITEMS[id];
  if (!it) return;
  const { kind, c1, c2 } = it.icon;
  const u = s / 20; // unit
  x.save();
  x.translate(s / 2, s / 2);
  x.lineWidth = Math.max(1, u);
  x.lineJoin = 'round';
  const outline = 'rgba(8,10,14,.85)';
  switch (kind){
    case 'ore': {
      const lumps = [[-4, 2, 4.6], [3.4, 3, 3.8], [0, -3.2, 4.2]];
      for (const [lx, ly, lr] of lumps){
        const g = x.createRadialGradient(lx * u - lr * u * .3, ly * u - lr * u * .4, 0, lx * u, ly * u, lr * u);
        g.addColorStop(0, c1); g.addColorStop(1, c2);
        x.fillStyle = g; x.strokeStyle = outline;
        x.beginPath(); x.arc(lx * u, ly * u, lr * u, 0, 7); x.fill(); x.stroke();
      }
      break;
    }
    case 'shard': {
      x.fillStyle = c1; x.strokeStyle = outline;
      x.beginPath();
      x.moveTo(0, -8 * u); x.lineTo(5 * u, -1 * u); x.lineTo(3 * u, 8 * u);
      x.lineTo(-3 * u, 8 * u); x.lineTo(-5 * u, -1 * u);
      x.closePath(); x.fill(); x.stroke();
      x.fillStyle = hexA(c2, .7);
      x.beginPath(); x.moveTo(0, -8 * u); x.lineTo(5 * u, -1 * u); x.lineTo(1 * u, -1 * u); x.closePath(); x.fill();
      break;
    }
    case 'ingot': {
      x.fillStyle = c2; x.strokeStyle = outline;
      x.beginPath();
      x.moveTo(-8 * u, 5 * u); x.lineTo(-5.5 * u, -3 * u); x.lineTo(5.5 * u, -3 * u); x.lineTo(8 * u, 5 * u);
      x.closePath(); x.fill(); x.stroke();
      x.fillStyle = c1;
      x.beginPath();
      x.moveTo(-5.5 * u, -3 * u); x.lineTo(-3.6 * u, -5.6 * u); x.lineTo(3.6 * u, -5.6 * u); x.lineTo(5.5 * u, -3 * u);
      x.closePath(); x.fill(); x.stroke();
      x.fillStyle = 'rgba(255,255,255,.28)';
      x.fillRect(-4 * u, -2 * u, 6 * u, 1.6 * u);
      break;
    }
    case 'brick': {
      x.fillStyle = c1; x.strokeStyle = outline;
      rrect(x, -8 * u, -5.5 * u, 16 * u, 11 * u, 1.5 * u); x.fill(); x.stroke();
      x.strokeStyle = hexA(c2, .9);
      x.beginPath();
      x.moveTo(-8 * u, 0); x.lineTo(8 * u, 0);
      x.moveTo(0, -5.5 * u); x.lineTo(0, 0);
      x.moveTo(-4 * u, 0); x.lineTo(-4 * u, 5.5 * u);
      x.moveTo(4 * u, 0); x.lineTo(4 * u, 5.5 * u);
      x.stroke();
      break;
    }
    case 'glass': {
      x.fillStyle = hexA(c1, .55); x.strokeStyle = hexA(c2, .95);
      rrect(x, -6.5 * u, -6.5 * u, 13 * u, 13 * u, 2 * u); x.fill(); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.65)'; x.lineWidth = 1.4 * u;
      x.beginPath(); x.moveTo(-3 * u, 4 * u); x.lineTo(4 * u, -3 * u); x.stroke();
      x.beginPath(); x.moveTo(0 * u, 5 * u); x.lineTo(5 * u, 0 * u); x.stroke();
      break;
    }
    case 'gear': {
      x.fillStyle = c1; x.strokeStyle = outline;
      x.beginPath();
      for (let i = 0; i < 8; i++){
        const a = i / 8 * Math.PI * 2;
        x.save(); x.rotate(a);
        x.rect(-1.7 * u, -8.4 * u, 3.4 * u, 3.4 * u);
        x.restore();
      }
      x.arc(0, 0, 6 * u, 0, 7);
      x.fill(); x.stroke();
      x.fillStyle = c2;
      x.beginPath(); x.arc(0, 0, 2.6 * u, 0, 7); x.fill(); x.stroke();
      break;
    }
    case 'coil': {
      x.strokeStyle = c2; x.lineWidth = 4.4 * u; x.lineCap = 'round';
      x.beginPath(); x.arc(0, 0, 5.4 * u, .5, 5.9); x.stroke();
      x.strokeStyle = c1; x.lineWidth = 2.6 * u;
      x.beginPath(); x.arc(0, 0, 5.4 * u, .5, 5.9); x.stroke();
      x.strokeStyle = c1; x.lineWidth = 2 * u;
      x.beginPath(); x.moveTo(4.6 * u, 3.4 * u); x.lineTo(8 * u, 6.4 * u); x.stroke();
      break;
    }
    case 'plate': {
      x.fillStyle = c1; x.strokeStyle = outline;
      rrect(x, -7.5 * u, -6 * u, 15 * u, 12 * u, 2 * u); x.fill(); x.stroke();
      x.fillStyle = hexA(c2, .5);
      rrect(x, -7.5 * u, 0, 15 * u, 6 * u, 2 * u); x.fill();
      x.fillStyle = c2;
      for (const [bx, by] of [[-5, -3.4], [5, -3.4], [-5, 3.4], [5, 3.4]]){
        x.beginPath(); x.arc(bx * u, by * u, 1.1 * u, 0, 7); x.fill();
      }
      break;
    }
    case 'chip': case 'chip2': {
      x.fillStyle = kind === 'chip2' ? c1 : c2; x.strokeStyle = outline;
      rrect(x, -6 * u, -6 * u, 12 * u, 12 * u, 1.5 * u); x.fill(); x.stroke();
      // pins
      x.fillStyle = '#9aa4b2';
      for (let i = -1; i <= 1; i++){
        x.fillRect(i * 4 * u - u, -8 * u, 2 * u, 2 * u);
        x.fillRect(i * 4 * u - u, 6 * u, 2 * u, 2 * u);
        x.fillRect(-8 * u, i * 4 * u - u, 2 * u, 2 * u);
        x.fillRect(6 * u, i * 4 * u - u, 2 * u, 2 * u);
      }
      x.fillStyle = kind === 'chip2' ? c2 : c1;
      rrect(x, -3 * u, -3 * u, 6 * u, 6 * u, u); x.fill();
      if (kind === 'chip2'){
        x.strokeStyle = hexA(c2, .8); x.lineWidth = .8 * u;
        x.strokeRect(-4.5 * u, -4.5 * u, 9 * u, 9 * u);
      }
      break;
    }
    case 'chip0': { // silicon wafer
      x.fillStyle = c1; x.strokeStyle = outline;
      x.beginPath(); x.arc(0, 0, 7 * u, 0, 7); x.fill(); x.stroke();
      x.strokeStyle = hexA(c2, .75); x.lineWidth = .9 * u;
      for (let i = -2; i <= 2; i++){
        x.beginPath(); x.moveTo(i * 2.6 * u, -7 * u); x.lineTo(i * 2.6 * u, 7 * u); x.stroke();
        x.beginPath(); x.moveTo(-7 * u, i * 2.6 * u); x.lineTo(7 * u, i * 2.6 * u); x.stroke();
      }
      break;
    }
    case 'motor': {
      x.fillStyle = c2; x.strokeStyle = outline;
      rrect(x, -7 * u, -5 * u, 11 * u, 10 * u, 2 * u); x.fill(); x.stroke();
      x.fillStyle = c1;
      for (let i = 0; i < 3; i++) x.fillRect(-5.6 * u + i * 3.4 * u, -5 * u, 1.6 * u, 10 * u);
      x.fillStyle = '#d8dee8';
      x.fillRect(4 * u, -1.3 * u, 4.5 * u, 2.6 * u);
      x.strokeRect(4 * u, -1.3 * u, 4.5 * u, 2.6 * u);
      break;
    }
    case 'cell': {
      x.fillStyle = c2; x.strokeStyle = outline;
      rrect(x, -4.6 * u, -8 * u, 9.2 * u, 16 * u, 3 * u); x.fill(); x.stroke();
      x.fillStyle = c1;
      rrect(x, -3 * u, -6 * u, 6 * u, 8 * u, 2 * u); x.fill();
      x.fillStyle = 'rgba(255,255,255,.5)';
      x.beginPath();
      x.moveTo(.8 * u, -5 * u); x.lineTo(-1.6 * u, -.4 * u); x.lineTo(.2 * u, -.4 * u); x.lineTo(-.8 * u, 3 * u);
      x.lineTo(1.8 * u, -1.6 * u); x.lineTo(0, -1.6 * u);
      x.closePath(); x.fill();
      break;
    }
    case 'frame': {
      x.strokeStyle = c2; x.lineWidth = 2.6 * u;
      x.strokeRect(-7 * u, -7 * u, 14 * u, 14 * u);
      x.strokeStyle = c1; x.lineWidth = 1.6 * u;
      x.strokeRect(-7 * u, -7 * u, 14 * u, 14 * u);
      x.beginPath();
      x.moveTo(-7 * u, -7 * u); x.lineTo(7 * u, 7 * u);
      x.moveTo(7 * u, -7 * u); x.lineTo(-7 * u, 7 * u);
      x.stroke();
      break;
    }
    case 'matrix': {
      x.strokeStyle = hexA(c1, .9); x.lineWidth = u;
      for (let i = -1; i <= 1; i++){
        x.beginPath(); x.moveTo(i * 4.4 * u, -7 * u); x.lineTo(i * 4.4 * u, 7 * u); x.stroke();
        x.beginPath(); x.moveTo(-7 * u, i * 4.4 * u); x.lineTo(7 * u, i * 4.4 * u); x.stroke();
      }
      x.fillStyle = c1;
      x.shadowColor = c1; x.shadowBlur = 4 * u;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++){
        x.beginPath(); x.arc(i * 4.4 * u, j * 4.4 * u, 1.4 * u, 0, 7); x.fill();
      }
      x.shadowBlur = 0;
      break;
    }
    case 'corep': {
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 8 * u);
      g.addColorStop(0, '#fff6dd'); g.addColorStop(.45, c1); g.addColorStop(1, c2);
      x.fillStyle = g; x.strokeStyle = outline;
      x.beginPath(); x.arc(0, 0, 7 * u, 0, 7); x.fill(); x.stroke();
      x.strokeStyle = hexA('#ffe9b0', .8); x.lineWidth = 1.2 * u;
      x.beginPath(); x.arc(0, 0, 4.4 * u, 0, 7); x.stroke();
      for (let i = 0; i < 4; i++){
        const a = i * Math.PI / 2 + Math.PI / 4;
        x.beginPath();
        x.moveTo(Math.cos(a) * 7.4 * u, Math.sin(a) * 7.4 * u);
        x.lineTo(Math.cos(a) * 9.6 * u, Math.sin(a) * 9.6 * u);
        x.stroke();
      }
      break;
    }
    case 'module': { // slottable machine insert, glyph per flavour
      x.fillStyle = '#252b36'; x.strokeStyle = outline;
      rrect(x, -7 * u, -7 * u, 14 * u, 14 * u, 3 * u); x.fill(); x.stroke();
      x.strokeStyle = hexA(c1, .9); x.lineWidth = 1.1 * u;
      rrect(x, -5.2 * u, -5.2 * u, 10.4 * u, 10.4 * u, 2 * u); x.stroke();
      // contact pins
      x.fillStyle = '#9aa4b2';
      for (let i = -1; i <= 1; i++) x.fillRect(i * 4 * u - u, 7 * u, 2 * u, 2 * u);
      const g2 = it.icon.g;
      x.fillStyle = c1; x.strokeStyle = c1; x.lineWidth = 1.4 * u; x.lineCap = 'round';
      if (g2 === 'speed'){        // double chevron »
        for (const ox of [-2.6, 1.4]){
          x.beginPath();
          x.moveTo(ox * u, -3.4 * u); x.lineTo((ox + 3) * u, 0); x.lineTo(ox * u, 3.4 * u);
          x.stroke();
        }
      } else if (g2 === 'eff'){   // leaf / droplet
        x.beginPath();
        x.moveTo(0, -3.8 * u);
        x.quadraticCurveTo(4 * u, -1 * u, 0, 3.8 * u);
        x.quadraticCurveTo(-4 * u, -1 * u, 0, -3.8 * u);
        x.closePath(); x.fill();
      } else if (g2 === 'dur'){   // shield
        x.beginPath();
        x.moveTo(0, -3.8 * u);
        x.lineTo(3.2 * u, -2.2 * u);
        x.lineTo(3.2 * u, .6 * u);
        x.quadraticCurveTo(3.2 * u, 2.8 * u, 0, 4 * u);
        x.quadraticCurveTo(-3.2 * u, 2.8 * u, -3.2 * u, .6 * u);
        x.lineTo(-3.2 * u, -2.2 * u);
        x.closePath(); x.stroke();
      } else {                    // prod: plus
        x.beginPath();
        x.moveTo(-3.2 * u, 0); x.lineTo(3.2 * u, 0);
        x.moveTo(0, -3.2 * u); x.lineTo(0, 3.2 * u);
        x.stroke();
      }
      break;
    }
    case 'dust': { // pile of crushed grit
      x.fillStyle = c2; x.strokeStyle = outline;
      x.beginPath();
      x.moveTo(-8 * u, 6 * u);
      x.quadraticCurveTo(-3 * u, -4 * u, 0, -5 * u);
      x.quadraticCurveTo(3 * u, -4 * u, 8 * u, 6 * u);
      x.closePath(); x.fill(); x.stroke();
      x.fillStyle = c1;
      x.beginPath();
      x.moveTo(-5 * u, 6 * u);
      x.quadraticCurveTo(-1.5 * u, -2.5 * u, 0.5 * u, -3.5 * u);
      x.quadraticCurveTo(2 * u, -2 * u, 4.5 * u, 6 * u);
      x.closePath(); x.fill();
      // stray grains
      x.fillStyle = c1;
      for (const [gx, gy, gr] of [[-7.5, 3, 1.1], [7, 1.5, 1.2], [5.5, -3, .9], [-5, -2.5, .9]]){
        x.beginPath(); x.arc(gx * u, gy * u, gr * u, 0, 7); x.fill(); x.stroke();
      }
      break;
    }
    case 'flask': { // science pack — stoppered flask of glowing reagent
      // glass body
      x.fillStyle = 'rgba(215,235,245,.28)'; x.strokeStyle = outline;
      x.beginPath();
      x.moveTo(-2.2 * u, -8 * u); x.lineTo(-2.2 * u, -3 * u);
      x.lineTo(-6.5 * u, 5.5 * u);
      x.quadraticCurveTo(-7 * u, 8 * u, -4.5 * u, 8 * u);
      x.lineTo(4.5 * u, 8 * u);
      x.quadraticCurveTo(7 * u, 8 * u, 6.5 * u, 5.5 * u);
      x.lineTo(2.2 * u, -3 * u); x.lineTo(2.2 * u, -8 * u);
      x.closePath(); x.fill(); x.stroke();
      // liquid
      x.fillStyle = c1;
      x.beginPath();
      x.moveTo(-4.9 * u, 2.4 * u);
      x.lineTo(-6.5 * u, 5.5 * u);
      x.quadraticCurveTo(-7 * u, 8 * u, -4.5 * u, 8 * u);
      x.lineTo(4.5 * u, 8 * u);
      x.quadraticCurveTo(7 * u, 8 * u, 6.5 * u, 5.5 * u);
      x.lineTo(4.9 * u, 2.4 * u);
      x.closePath(); x.fill();
      // bubbles + glow
      x.fillStyle = hexA('#ffffff', .55);
      x.beginPath(); x.arc(-1.5 * u, 5.4 * u, .9 * u, 0, 7); x.fill();
      x.beginPath(); x.arc(1.8 * u, 4 * u, .6 * u, 0, 7); x.fill();
      // cork
      x.fillStyle = c2; x.strokeStyle = outline;
      rrect(x, -3 * u, -9.5 * u, 6 * u, 2.6 * u, u); x.fill(); x.stroke();
      // shine
      x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = .9 * u;
      x.beginPath(); x.moveTo(-3.4 * u, 1.5 * u); x.lineTo(-5.2 * u, 5.6 * u); x.stroke();
      break;
    }
    case 'hull': {
      x.fillStyle = c2; x.strokeStyle = outline;
      x.beginPath();
      x.moveTo(-8 * u, 6 * u); x.lineTo(-8 * u, -2 * u); x.lineTo(-2 * u, -7 * u);
      x.lineTo(8 * u, -7 * u); x.lineTo(8 * u, 1 * u); x.lineTo(2 * u, 6 * u);
      x.closePath(); x.fill(); x.stroke();
      x.fillStyle = hexA(c1, .8);
      x.beginPath();
      x.moveTo(-6 * u, 4 * u); x.lineTo(-6 * u, -1 * u); x.lineTo(-1 * u, -5 * u);
      x.lineTo(2 * u, -5 * u); x.lineTo(-3 * u, 4 * u);
      x.closePath(); x.fill();
      break;
    }
  }
  x.restore();
}
R.drawItemIcon = drawItemIcon;

/* small canvas icon factory for the DOM (build bar, panels) */
R.makeIconCanvas = function(id, size){
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  drawItemIcon(cv.getContext('2d'), id, size);
  return cv;
};
R.makeBuildingIcon = function(key, size){
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const x = cv.getContext('2d');
  const def = F.BUILDINGS[key];
  const fake = { key, kind: def.kind, x: 0, y: 0, w: def.w, h: def.h, dir: 1,
    item: null, t: 0, prog: .4, crafting: true, active: true, fuelT: 1, fuelBuf: 1,
    inBuf: {}, outBuf: {}, outTotal: 0, store: {}, total: 0, tank: 12, fluid: 22, load: .8,
    transit: [], linkId: 1, isExit: false, srcDir: 1, outIdx: 0, ema: 0, lastOut: -1 };
  const scale = size / (Math.max(def.w, def.h) * TILE);
  x.save();
  x.scale(scale, scale);
  if (def.w !== def.h){
    // centre non-square (none currently, but be safe)
    x.translate(((Math.max(def.w, def.h) - def.w) * TILE) / 2, ((Math.max(def.w, def.h) - def.h) * TILE) / 2);
  }
  drawEntBody(x, fake, TILE, 0.35, null);
  x.restore();
  return cv;
};

/* ==================================================================== */
/* ENTITY BODIES                                                        */
/* px context: translate so entity origin tile = (0,0), s = tile px    */
/* ==================================================================== */

const FAM_ACCENT = {
  smelter: '#ff9040', alloy: '#ff6a3a', asm: '#59d6ff', refinery: '#7de08a', crusher: '#e8c26a',
};

function drawEntBody(x, e, s, time, S){
  const def = F.BUILDINGS[e.key];
  if (e.broken){ drawCrumbled(x, e, s, time); return; }
  switch (e.kind){
    case 'belt': drawBelt(x, e, s, time, S); break;
    case 'ubelt': drawTunnel(x, e, s, time, S); break;
    case 'splitter': drawSplitter(x, e, s, time, S); break;
    case 'chest': drawChest(x, e, s); break;
    case 'pipe': drawPipe(x, e, s, S); break;
    case 'miner': drawMiner(x, e, s, time, def); break;
    case 'machine': drawMachine(x, e, s, time, def); break;
    case 'gen': drawGen(x, e, s, time, def); break;
    case 'turbine': drawTurbine(x, e, s, time, def); break;
    case 'solar': drawSolar(x, e, s, def); break;
    case 'acc': drawAcc(x, e, s, time); break;
    case 'lamp': drawLamp(x, e, s, time, S); break;
    case 'pole': drawPole(x, e, s, time, S); break;
    case 'pump': drawPump(x, e, s, time, def); break;
    case 'tank': drawTank(x, e, s, def); break;
    case 'port': drawPortPad(x, e, s, time, S); break;
    case 'lab': drawLab(x, e, s, time, def); break;
    case 'beacon': drawBeacon(x, e, s, time, S); break;
    case 'core': drawCore(x, e, s, time, S); break;
    case 'platform': {
      // ghost / build-bar art only — placed decks live on the ground canvas
      x.fillStyle = '#39404e';
      x.fillRect(0, 0, s, s);
      x.fillStyle = 'rgba(0,0,0,.28)';
      x.fillRect(0, s / 3, s, Math.max(1, s * .04));
      x.fillRect(0, s * 2 / 3, s, Math.max(1, s * .04));
      x.strokeStyle = 'rgba(8,10,14,.6)';
      x.lineWidth = Math.max(1, s * .05);
      x.strokeRect(s * .03, s * .03, s * .94, s * .94);
      break;
    }
  }
  // slotted-module pips along the top-right edge
  if (e.mods && e.mods.length){
    for (let i = 0; i < e.mods.length; i++){
      const it = F.ITEMS[e.mods[i]];
      if (!it) continue;
      x.fillStyle = it.icon.c1;
      x.strokeStyle = 'rgba(8,10,14,.8)';
      x.lineWidth = 1;
      rrect(x, e.w * s - s * .22 - i * s * .18, s * .1, s * .13, s * .13, s * .03);
      x.fill(); x.stroke();
    }
  }
  // disconnected from any pole network → blinking red bolt
  if (S && !e.netId &&
      (def && (def.power || e.kind === 'gen' || e.kind === 'turbine' || e.kind === 'solar' || e.kind === 'acc'))){
    drawBolt(x, s * .22, s * .24, s * .30, `rgba(255,110,110,${.55 + .35 * Math.sin(time * 5)})`);
  }
}
R.drawEntBody = drawEntBody;

/* ---- broken machines: crumbled in on themselves ----
   The wreck is built from a charred snapshot of the machine's OWN intact
   art, sliced into shards that slump toward the middle with holes torn
   out — so every machine crumbles as itself. Seeded by entity id, so each
   ruin collapses its own way and stays that way. Smoke curls off it. */
const _wreckSnaps = {};
function brokenSnap(e, s){
  const q = Math.max(8, Math.round(s / 8) * 8);   // quantize so zoom can't flood the cache
  const key = `${e.key}_${e.dir}_${e.recipe || ''}_${q}`;
  let cv = _wreckSnaps[key];
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = e.w * q; cv.height = e.h * q;
  const c = cv.getContext('2d');
  const fake = Object.assign({}, e, { broken: false, active: false, crafting: false, mods: [] });
  drawEntBody(c, fake, q, 0, null);
  // char the whole body
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = 'rgba(24,18,14,.55)';
  c.fillRect(0, 0, cv.width, cv.height);
  c.globalCompositeOperation = 'source-over';
  return _wreckSnaps[key] = cv;
}

function drawCrumbled(x, e, s, time){
  const W = e.w * s, H = e.h * s;
  const snap = brokenSnap(e, s);
  // deterministic per-entity rng — the ruin keeps its shape frame to frame
  let sd = ((e.id + 1) * 2654435761) >>> 0;
  const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
  // caved-in dark interior showing through the gaps
  x.fillStyle = 'rgba(12,10,9,.92)';
  x.fillRect(W * .07, H * .09, W * .86, H * .85);
  // shards of the old body, slumped toward the middle
  const N = 4, cw = W / N, ch = H / N;
  const sw = snap.width / N, sh = snap.height / N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){
    const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), r5 = rnd(), r6 = rnd();
    if (r1 < .16 && !(i === 1 && j === 1)) continue;          // torn-out hole
    const cx = (i + .5) / N - .5, cy = (j + .5) / N - .5;     // -.5...5 from center
    const d = Math.hypot(cx, cy);
    const pull = .08 + r2 * .12;                              // inward collapse
    const dx = -cx * pull * W + (r5 - .5) * W * .09;          // + sideways scatter
    const dy = -cy * pull * H + (1 - d) * H * .07 + (r6 - .5) * H * .09;  // middle sinks deepest
    const rot = (r4 - .5) * .55 * (d + .4);
    const sc = .82 + r3 * .2;
    x.save();
    x.translate(i * cw + cw / 2 + dx, j * ch + ch / 2 + dy);
    x.rotate(rot);
    x.scale(sc, sc);
    x.drawImage(snap, i * sw, j * sh, sw, sh, -cw / 2, -ch / 2, cw, ch);
    x.restore();
  }
  // rubble spilled along the base
  x.fillStyle = '#26211c';
  for (let k = 0; k < 3 + N; k++){
    const rx = (rnd() * .9 + .05) * W, rw = (.06 + rnd() * .09) * s;
    x.beginPath();
    x.arc(rx, H - rw * .4, rw, Math.PI, 0);
    x.fill();
  }
  // embers still breathing in the wreck
  for (let k = 0; k < 3; k++){
    const ex = (rnd() * .6 + .2) * W, ey = (rnd() * .5 + .3) * H;
    const a = .18 + .26 * (0.5 + 0.5 * Math.sin(time * (2 + k * .7) + e.id * 1.7 + k * 2.1));
    x.fillStyle = `rgba(255,130,60,${a.toFixed(3)})`;
    x.beginPath();
    x.arc(ex, ey, Math.max(1, s * .045), 0, Math.PI * 2);
    x.fill();
  }
  // smoke curling off (throttled per wreck; only while on screen)
  if (!e._smk || time > e._smk || time < e._smk - 2){
    e._smk = time + .35 + Math.random() * .55;
    R.spawnParticle({
      x: e.x + .25 + Math.random() * (e.w - .5),
      y: e.y + .15 + Math.random() * .4,
      vx: (Math.random() - .5) * .25, vy: -.35 - Math.random() * .35,
      life: 1.9, maxLife: 1.9, color: 'rgba(64,58,54,.4)',
      size: .1 + Math.random() * .08, drag: .5,
    });
  }
}

/* small lightning bolt marker */
function drawBolt(x, bx, by, sz, color){
  x.fillStyle = color;
  x.strokeStyle = 'rgba(0,0,0,.55)';
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(bx + sz * .14, by - sz * .5);
  x.lineTo(bx - sz * .26, by + sz * .12);
  x.lineTo(bx - sz * .02, by + sz * .12);
  x.lineTo(bx - sz * .14, by + sz * .5);
  x.lineTo(bx + sz * .26, by - sz * .12);
  x.lineTo(bx + sz * .02, by - sz * .12);
  x.closePath();
  x.fill(); x.stroke();
}

/* ---- belts ---- */
function beltLane(x, e, s){
  // draws the recessed track; handles curves via srcDir
  const cx = s / 2, cy = s / 2;
  const inD = e.srcDir != null ? e.srcDir : e.dir;
  x.strokeStyle = '#11151d';
  x.lineWidth = s * .62;
  x.lineCap = 'butt';
  trackPath(x, e, s, inD);
  x.stroke();
  x.strokeStyle = '#1c222e';
  x.lineWidth = s * .5;
  trackPath(x, e, s, inD);
  x.stroke();
  // side rails
  x.strokeStyle = 'rgba(255,255,255,.07)';
  x.lineWidth = 1;
  trackPathOffset(x, e, s, inD, s * .27);
  x.stroke();
  trackPathOffset(x, e, s, inD, -s * .27);
  x.stroke();
}

function trackPath(x, e, s, inD){
  const c = s / 2;
  x.beginPath();
  if (inD === e.dir || inD == null){
    x.moveTo(c - DX[e.dir] * c, c - DY[e.dir] * c);
    x.lineTo(c + DX[e.dir] * c, c + DY[e.dir] * c);
  } else {
    // curve: enter from OPP(inD) edge, exit dir edge
    const ex = c + DX[e.dir] * c, ey = c + DY[e.dir] * c;
    const sxx = c - DX[inD] * c, syy = c - DY[inD] * c;
    x.moveTo(sxx, syy);
    x.quadraticCurveTo(c, c, ex, ey);
  }
}
function trackPathOffset(x, e, s, inD, off){
  // cheap parallel: reuse the same path but thinner — visually adequate for rails
  const c = s / 2;
  x.beginPath();
  if (inD === e.dir || inD == null){
    const px = DY[e.dir] * off, py = DX[e.dir] * off; // perpendicular
    x.moveTo(c - DX[e.dir] * c + px, c - DY[e.dir] * c + py);
    x.lineTo(c + DX[e.dir] * c + px, c + DY[e.dir] * c + py);
  } else {
    const ex = c + DX[e.dir] * c, ey = c + DY[e.dir] * c;
    const sxx = c - DX[inD] * c, syy = c - DY[inD] * c;
    const mx = c + (DY[e.dir] + DY[F.OPP(inD)]) * off * .7;
    const my = c + (DX[e.dir] + DX[F.OPP(inD)]) * off * .7;
    x.moveTo(sxx + DY[inD] * off, syy + DX[inD] * off);
    x.quadraticCurveTo(mx, my, ex + DY[e.dir] * off, ey + DX[e.dir] * off);
  }
}

function drawBelt(x, e, s, time, S){
  beltLane(x, e, s);
  // animated chevrons
  const speed = F.BUILDINGS[e.key].speed * (S ? F.beltMul(S) : 1);
  const phase = (time * speed) % .5;
  const tier = e.key === 'belt4' ? 3 : e.key === 'belt3' ? 2 : e.key === 'belt2' ? 1 : 0;
  const chevCol = tier === 3 ? 'rgba(205,170,255,.5)' : tier === 2 ? 'rgba(150,210,255,.4)' : tier === 1 ? 'rgba(255,200,120,.34)' : 'rgba(255,255,255,.22)';
  x.strokeStyle = chevCol;
  x.lineWidth = Math.max(1, s * .06);
  x.lineCap = 'round';
  for (let i = 0; i < 2; i++){
    const t = phase + i * .5;
    const [px, py, ang] = beltPoint(e, s, t);
    x.save();
    x.translate(px, py);
    x.rotate(ang);
    const a = s * .1;
    x.beginPath();
    x.moveTo(-a, -a); x.lineTo(a * .4, 0); x.lineTo(-a, a);
    x.stroke();
    x.restore();
  }
}

/* position along a belt's lane at param t (0..1); returns [x,y,angle] */
function beltPoint(e, s, t){
  const c = s / 2;
  const inD = e.srcDir != null ? e.srcDir : e.dir;
  if (inD === e.dir){
    return [ c + DX[e.dir] * s * (t - .5), c + DY[e.dir] * s * (t - .5), angOf(e.dir) ];
  }
  // quadratic curve from entry edge to exit edge
  const sx = c - DX[inD] * c, sy = c - DY[inD] * c;
  const ex = c + DX[e.dir] * c, ey = c + DY[e.dir] * c;
  const mt = 1 - t;
  const px = mt * mt * sx + 2 * mt * t * c + t * t * ex;
  const py = mt * mt * sy + 2 * mt * t * c + t * t * ey;
  const dx = 2 * mt * (c - sx) + 2 * t * (ex - c);
  const dy = 2 * mt * (c - sy) + 2 * t * (ey - c);
  return [px, py, Math.atan2(dy, dx)];
}
R.beltPoint = beltPoint;
const angOf = d => d === 0 ? -Math.PI / 2 : d === 1 ? 0 : d === 2 ? Math.PI / 2 : Math.PI;

/* ---- tunnel ---- */
function drawTunnel(x, e, s, time, S){
  beltLane(x, e, s);
  const c = s / 2;
  // hood
  x.save();
  x.translate(c, c);
  x.rotate(angOf(e.dir));
  const deep = e.key === 'ubelt2';
  const bodyC = deep ? '#3a4763' : '#39404e';
  x.fillStyle = bodyC;
  x.strokeStyle = 'rgba(0,0,0,.55)';
  x.lineWidth = 1;
  if (!e.isExit){
    rrect(x, -s * .34, -s * .38, s * .58, s * .76, s * .1);
  } else {
    rrect(x, -s * .24, -s * .38, s * .58, s * .76, s * .1);
  }
  x.fill(); x.stroke();
  // mouth
  x.fillStyle = '#0c0f15';
  rrect(x, e.isExit ? -s * .24 : s * .12, -s * .26, s * .12, s * .52, s * .04);
  x.fill();
  // arrow marker
  x.fillStyle = deep ? 'rgba(150,190,255,.75)' : 'rgba(255,255,255,.4)';
  x.beginPath();
  const ax = e.isExit ? s * .14 : -s * .1;
  x.moveTo(ax, -s * .1); x.lineTo(ax + s * .14, 0); x.lineTo(ax, s * .1);
  x.closePath(); x.fill();
  x.restore();
  if (!e.linkId){
    // unlinked warning
    x.fillStyle = `rgba(255,180,84,${.4 + .3 * Math.sin(time * 6)})`;
    x.beginPath(); x.arc(s * .78, s * .2, s * .07, 0, 7); x.fill();
  }
}

/* ---- splitter ---- */
function drawSplitter(x, e, s, time, S){
  const c = s / 2;
  x.save();
  x.translate(c, c);
  x.rotate(angOf(e.dir));
  x.fillStyle = '#333b4a';
  x.strokeStyle = 'rgba(0,0,0,.55)';
  rrect(x, -s * .42, -s * .42, s * .84, s * .84, s * .12);
  x.fill(); x.stroke();
  x.fillStyle = '#242b37';
  rrect(x, -s * .3, -s * .3, s * .6, s * .6, s * .08);
  x.fill();
  // three-way fan arrows (0=front, -90°=left, +90°=right in local space):
  // blocked lanes dark red, filtered lanes cyan, ranked lanes brighter the higher their priority
  x.lineWidth = Math.max(1, s * .05);
  x.lineCap = 'round';
  const LANE_A = { front: 0, left: -Math.PI / 2, right: Math.PI / 2 };
  for (const n of ['front', 'left', 'right']){
    const blocked = e.exBlock && e.exBlock[n];
    const p = e.exPrio ? e.exPrio[n] : 0;
    if (blocked){
      x.strokeStyle = 'rgba(255,100,100,.6)';
    } else {
      x.strokeStyle = (e.exFilt && e.exFilt[n]) ? 'rgba(120,220,255,.9)'
        : p === 1 ? 'rgba(255,214,138,1)'
        : p === 2 ? 'rgba(255,214,138,.8)'
        : p === 3 ? 'rgba(255,214,138,.65)'
        : 'rgba(255,214,138,.5)';
    }
    x.save(); x.rotate(LANE_A[n]);
    x.beginPath();
    if (blocked){
      x.moveTo(-s * .08, -s * .08); x.lineTo(s * .08, s * .08);
      x.moveTo(s * .08, -s * .08); x.lineTo(-s * .08, s * .08);
    } else {
      x.moveTo(0, 0); x.lineTo(s * .22, 0);
      x.moveTo(s * .13, -s * .07); x.lineTo(s * .23, 0); x.lineTo(s * .13, s * .07);
    }
    x.stroke();
    x.restore();
  }
  x.restore();
  // filter badges, drawn upright over each reserved lane
  if (e.exFilt){
    const LANE_D = { front: e.dir, left: (e.dir + 3) & 3, right: (e.dir + 1) & 3 };
    for (const n in LANE_D){
      if (!e.exFilt[n]) continue;
      const d = LANE_D[n];
      const bx = c + DX[d] * s * .3, by = c + DY[d] * s * .3;
      const ic = R.itemIcon(e.exFilt[n], Math.max(8, Math.round(s * .4)));
      x.drawImage(ic, bx - ic.width / 2, by - ic.height / 2);
    }
  }
}

/* ---- chest ---- */
function drawChest(x, e, s){
  const pad = s * .1;
  const vault = e.key === 'chest2', tarp = !!F.BUILDINGS[e.key].tarOnly;
  x.fillStyle = tarp ? '#33302a' : vault ? '#3a4250' : '#4a4136';
  x.strokeStyle = 'rgba(0,0,0,.55)';
  rrect(x, pad, pad, s - pad * 2, s - pad * 2, s * .12);
  x.fill(); x.stroke();
  if (tarp){
    // an open brick-lined mouth, black and glossy
    x.fillStyle = '#12100c';
    x.beginPath(); x.ellipse(s / 2, s * .44, s * .3, s * .22, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(200,200,190,.14)';
    x.beginPath(); x.ellipse(s * .42, s * .38, s * .1, s * .05, -.5, 0, 7); x.fill();
  } else {
    x.fillStyle = vault ? '#4b5567' : '#5d5344';
    rrect(x, pad * 1.5, pad * 1.5, s - pad * 3, (s - pad * 3) * .45, s * .08);
    x.fill();
  }
  if (vault){
    // riveted band
    x.fillStyle = '#96a3b5';
    for (const rx of [.24, .5, .76]){
      x.beginPath(); x.arc(s * rx, s * .3, s * .035, 0, 7); x.fill();
    }
  }
  if (!tarp){
    x.fillStyle = vault ? '#9fc2e8' : '#c9a86a';
    x.fillRect(s / 2 - s * .06, s * .32, s * .12, s * .14);
  }
  // fill gauge
  const cap = F.BUILDINGS[e.key].cap || F.CHEST_CAP;
  const fr = clamp((e.total || 0) / cap, 0, 1);
  x.fillStyle = 'rgba(0,0,0,.4)';
  x.fillRect(pad * 1.6, s - pad * 2.2, s - pad * 3.2, s * .07);
  x.fillStyle = tarp ? '#8a8171' : '#ffd68a';
  x.fillRect(pad * 1.6, s - pad * 2.2, (s - pad * 3.2) * fr, s * .07);
  // out arrow
  drawPortArrow(x, e, s);
}

/* ---- pipe ---- */
function drawPipe(x, e, s, S){
  const c = s / 2;
  // connections
  const conn = [];
  if (S){
    for (let d = 0; d < 4; d++){
      const n = F.entAt(S, e.x + DX[d], e.y + DY[d]);
      if (n && (n.kind === 'pipe' || n.kind === 'pump' || n.kind === 'tank' ||
        (n.kind === 'machine' && F.BUILDINGS[n.key].fam === 'refinery'))) conn.push(d);
    }
  }
  if (!conn.length) conn.push(1, 3);
  x.strokeStyle = '#2b323f';
  x.lineWidth = s * .4;
  x.lineCap = 'round';
  for (const d of conn){
    x.beginPath(); x.moveTo(c, c); x.lineTo(c + DX[d] * c, c + DY[d] * c); x.stroke();
  }
  x.strokeStyle = '#485365';
  x.lineWidth = s * .3;
  for (const d of conn){
    x.beginPath(); x.moveTo(c, c); x.lineTo(c + DX[d] * c, c + DY[d] * c); x.stroke();
  }
  // window with fluid level
  x.fillStyle = '#171b23';
  x.beginPath(); x.arc(c, c, s * .19, 0, 7); x.fill();
  const fr = clamp(e.fluid / F.BUILDINGS[e.key].cap, 0, 1);
  if (fr > 0.02){
    x.fillStyle = '#171310';
    x.beginPath(); x.arc(c, c, s * .15, 0, 7); x.fill();
    x.fillStyle = '#3b3320';
    x.beginPath(); x.arc(c, c, s * .15 * Math.sqrt(fr), 0, 7); x.fill();
  }
  x.strokeStyle = 'rgba(255,255,255,.14)';
  x.lineWidth = 1;
  x.beginPath(); x.arc(c, c, s * .19, 0, 7); x.stroke();
}

/* ---- shared machine chrome ---- */
function chassis(x, e, s, accent, tier){
  const w = e.w * s, h = e.h * s;
  const pad = s * .07;
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3d4656');
  g.addColorStop(.55, '#333b49');
  g.addColorStop(1, '#272e3a');
  x.fillStyle = g;
  x.strokeStyle = 'rgba(0,0,0,.6)';
  x.lineWidth = 1.2;
  rrect(x, pad, pad, w - pad * 2, h - pad * 2, s * .16);
  x.fill(); x.stroke();
  // top highlight
  x.strokeStyle = 'rgba(255,255,255,.12)';
  x.lineWidth = 1;
  rrect(x, pad + 1, pad + 1, w - pad * 2 - 2, h - pad * 2 - 2, s * .14);
  x.stroke();
  // accent stripe along the output edge
  x.save();
  x.translate(w / 2, h / 2);
  x.rotate(angOf(e.dir));
  const L = (e.dir & 1 ? h : w) / 2;
  const Wd = (e.dir & 1 ? w : h);
  x.fillStyle = hexA(accent, .8);
  rrect(x, L - pad - s * .1, -Wd / 2 + pad * 2, s * .07, Wd - pad * 4, s * .03);
  x.fill();
  x.restore();
  // tier pips
  if (tier > 0){
    x.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i <= tier; i++){
      x.beginPath();
      x.arc(pad + s * .16 + i * s * .14, h - pad - s * .14, s * .04, 0, 7);
      x.fill();
    }
  }
}

function drawPortArrow(x, e, s){
  // chute marker on the output edge
  const w = e.w * s, h = e.h * s;
  x.save();
  x.translate(w / 2, h / 2);
  x.rotate(angOf(e.dir));
  const L = (e.dir & 1 ? h : w) / 2 * (e.dir & 1 ? (e.w / e.h) : 1);
  const halfLen = (e.dir & 1 ? e.w : e.w) ;
  // simpler: use bounding — port sits at mid of facing edge for 1x1/2x2/3x3 (square), fine:
  const R2 = (e.w * s) / 2;
  x.fillStyle = '#20262f';
  x.strokeStyle = 'rgba(0,0,0,.5)';
  rrect(x, R2 - s * .12, -s * .16, s * .2, s * .32, s * .05);
  x.fill(); x.stroke();
  x.fillStyle = 'rgba(255,214,138,.75)';
  x.beginPath();
  x.moveTo(R2 - s * .04, -s * .08);
  x.lineTo(R2 + s * .06, 0);
  x.lineTo(R2 - s * .04, s * .08);
  x.closePath(); x.fill();
  x.restore();
}

/* offset of the out-port centre tile relative to entity origin, for non-centred ports */
function portOffset(e){
  const [px, py] = F.outPort(e);
  return [px - e.x, py - e.y];
}

function drawPortArrowAt(x, e, s){
  // draw the chute on the actual port tile edge (matches sim's outPort)
  const [ox, oy] = portOffset(e);
  const d = e.dir;
  // the port tile is OUTSIDE the footprint; the chute sits on the edge tile inside
  const ix = ox - DX[d], iy = oy - DY[d];
  x.save();
  x.translate((ix + .5) * s, (iy + .5) * s);
  x.rotate(angOf(d));
  x.fillStyle = '#20262f';
  x.strokeStyle = 'rgba(0,0,0,.5)';
  rrect(x, s * .34, -s * .16, s * .22, s * .32, s * .05);
  x.fill(); x.stroke();
  x.fillStyle = 'rgba(255,214,138,.8)';
  x.beginPath();
  x.moveTo(s * .42, -s * .08);
  x.lineTo(s * .54, 0);
  x.lineTo(s * .42, s * .08);
  x.closePath(); x.fill();
  x.restore();
}

/* status dot: fuel-out (amber) or starved/jammed handled by caller */
function statusDot(x, e, s, color, time){
  x.fillStyle = hexA(color, .5 + .4 * Math.sin(time * 5.2));
  x.beginPath();
  x.arc(e.w * s - s * .2, s * .2, s * .08, 0, 7);
  x.fill();
}

/* ---- miner ---- */
function drawMiner(x, e, s, time, def){
  const tier = def.power ? (e.key === 'miner3' ? 2 : 1) : 0;
  chassis(x, e, s, '#ffb454', tier);
  const c = s / 2;
  // rotating auger
  x.save();
  x.translate(c, c);
  const spin = e.active ? time * (3 + tier * 2.4) : 0;
  x.rotate(spin);
  x.fillStyle = tier === 2 ? '#b9a7e8' : '#8b96a6';
  x.strokeStyle = 'rgba(0,0,0,.5)';
  for (let i = 0; i < 3; i++){
    x.save();
    x.rotate(i * Math.PI * 2 / 3);
    x.beginPath();
    x.moveTo(0, 0);
    x.quadraticCurveTo(s * .2, -s * .08, s * .26, 0);
    x.quadraticCurveTo(s * .18, s * .1, 0, 0);
    x.fill(); x.stroke();
    x.restore();
  }
  x.fillStyle = '#242a35';
  x.beginPath(); x.arc(0, 0, s * .08, 0, 7); x.fill(); x.stroke();
  x.restore();
  // progress ring
  if (e.prog > 0){
    x.strokeStyle = 'rgba(255,180,84,.85)';
    x.lineWidth = Math.max(1, s * .05);
    x.beginPath();
    x.arc(c, c, s * .34, -Math.PI / 2, -Math.PI / 2 + e.prog * Math.PI * 2);
    x.stroke();
  }
  if (!def.power && e.fuelT <= 0 && e.fuelBuf <= 0) statusDot(x, e, s, '#ffb454', time);
  drawPortArrowAt(x, e, s);
}

/* ---- generic machine (smelter/alloy/asm/refinery) ---- */
function drawMachine(x, e, s, time, def){
  const accent = FAM_ACCENT[def.fam] || '#59d6ff';
  const tier = def.speed >= 4 ? 2 : def.speed >= 2 ? 1 : 0;
  chassis(x, e, s, accent, tier);
  const w = e.w * s, h = e.h * s;
  const cx = w / 2, cy = h / 2;
  if (def.fam === 'smelter' || def.fam === 'alloy'){
    // glowing mouth
    const glow = e.crafting && e.active ? .75 + .25 * Math.sin(time * 7) : .12;
    const mg = x.createRadialGradient(cx, cy, 0, cx, cy, s * .62);
    mg.addColorStop(0, hexA('#ffdd99', glow));
    mg.addColorStop(.5, hexA(def.fam === 'alloy' ? '#ff6a3a' : '#ff9040', glow * .8));
    mg.addColorStop(1, 'rgba(30,20,15,0)');
    x.fillStyle = '#191412';
    x.beginPath(); x.arc(cx, cy, s * .46, 0, 7); x.fill();
    x.fillStyle = mg;
    x.beginPath(); x.arc(cx, cy, s * .62, 0, 7); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.6)';
    x.lineWidth = s * .06;
    x.beginPath(); x.arc(cx, cy, s * .46, 0, 7); x.stroke();
    // grate bars
    x.strokeStyle = 'rgba(0,0,0,.55)';
    x.lineWidth = s * .05;
    for (let i = -1; i <= 1; i++){
      x.beginPath();
      x.moveTo(cx + i * s * .18, cy - s * .4);
      x.lineTo(cx + i * s * .18, cy + s * .4);
      x.stroke();
    }
    if (def.fam === 'alloy'){
      // twin intake bowls
      x.fillStyle = 'rgba(255,110,60,.25)';
      x.beginPath(); x.arc(cx - s * .5, cy - s * .5, s * .16, 0, 7); x.fill();
      x.beginPath(); x.arc(cx + s * .5, cy - s * .5, s * .16, 0, 7); x.fill();
    }
  } else if (def.fam === 'asm'){
    // work bay + swinging arm
    x.fillStyle = '#1b212c';
    rrect(x, cx - s * .5, cy - s * .5, s, s, s * .1);
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,.5)';
    x.stroke();
    const sw = e.crafting && e.active ? Math.sin(time * 6) * .8 : .5;
    x.save();
    x.translate(cx - s * .42, cy - s * .42);
    x.rotate(sw * .5 + .4);
    x.strokeStyle = '#8b96a6';
    x.lineWidth = s * .09;
    x.lineCap = 'round';
    x.beginPath(); x.moveTo(0, 0); x.lineTo(s * .42, s * .1); x.stroke();
    x.strokeStyle = accent;
    x.lineWidth = s * .07;
    x.beginPath(); x.moveTo(s * .42, s * .1); x.lineTo(s * .6, s * .3); x.stroke();
    x.fillStyle = '#242a35';
    x.beginPath(); x.arc(0, 0, s * .1, 0, 7); x.fill();
    x.restore();
    // sparks handled by particles; recipe icon
    if (e.recipe){
      const ic = R.itemIcon(F.RECIPES[e.recipe].out, Math.round(s * .5));
      x.globalAlpha = .95;
      x.drawImage(ic, cx + s * .08, cy + s * .05);
      x.globalAlpha = 1;
    } else {
      x.fillStyle = `rgba(89,214,255,${.35 + .25 * Math.sin(time * 3)})`;
      x.font = `${s * .5}px sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('?', cx + s * .3, cy + s * .32);
    }
  } else if (def.fam === 'refinery'){
    // distillation columns
    for (let i = 0; i < 3; i++){
      const colX = s * .55 + i * s * .8;
      x.fillStyle = i === 1 ? '#3d4656' : '#333b49';
      x.strokeStyle = 'rgba(0,0,0,.5)';
      rrect(x, colX, s * .45, s * .5, h - s * 1.1, s * .2);
      x.fill(); x.stroke();
      x.fillStyle = hexA('#7de08a', e.active ? .5 + .3 * Math.sin(time * 4 + i * 2) : .1);
      x.beginPath(); x.arc(colX + s * .25, s * .7, s * .07, 0, 7); x.fill();
    }
    // tank window
    x.fillStyle = '#12100c';
    rrect(x, s * .5, h - s * .52, w - s, s * .26, s * .08);
    x.fill();
    const fr = clamp(e.tank / def.tank, 0, 1);
    x.fillStyle = '#3b3320';
    rrect(x, s * .53, h - s * .5, (w - s * 1.06) * fr, s * .22, s * .06);
    if (fr > .02) x.fill();
    if (e.recipe){
      const ic = R.itemIcon(F.RECIPES[e.recipe].out, Math.round(s * .55));
      x.drawImage(ic, cx - s * .27, s * .18);
    }
  } else if (def.fam === 'crusher'){
    // grinding drums under a hopper mouth
    const shake = e.crafting && e.active ? Math.sin(time * 31) * s * .02 : 0;
    x.fillStyle = '#1b1712';
    rrect(x, cx - s * .62, cy - s * .55, s * 1.24, s * 1.1, s * .1);
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,.5)'; x.stroke();
    // hopper lips
    x.fillStyle = '#4a4136';
    x.beginPath();
    x.moveTo(cx - s * .62, cy - s * .55); x.lineTo(cx - s * .18, cy - s * .1);
    x.lineTo(cx - s * .62, cy - s * .1); x.closePath(); x.fill();
    x.beginPath();
    x.moveTo(cx + s * .62, cy - s * .55); x.lineTo(cx + s * .18, cy - s * .1);
    x.lineTo(cx + s * .62, cy - s * .1); x.closePath(); x.fill();
    // two counter-rotating toothed drums
    for (const side of [-1, 1]){
      x.save();
      x.translate(cx + side * s * .26 + shake * side, cy + s * .18);
      x.rotate((e.crafting && e.active ? time * 5 : .6) * -side);
      x.fillStyle = side < 0 ? '#8b96a6' : '#7d8999';
      x.strokeStyle = 'rgba(0,0,0,.55)';
      x.beginPath();
      for (let i = 0; i < 7; i++){
        x.save(); x.rotate(i / 7 * Math.PI * 2);
        x.rect(-s * .045, -s * .34, s * .09, s * .09);
        x.restore();
      }
      x.arc(0, 0, s * .27, 0, 7);
      x.fill(); x.stroke();
      x.fillStyle = hexA(accent, .9);
      x.beginPath(); x.arc(0, 0, s * .08, 0, 7); x.fill();
      x.restore();
    }
  }
  // progress bar
  if (e.crafting){
    x.fillStyle = 'rgba(0,0,0,.45)';
    rrect(x, s * .2, e.h * s - s * .3, e.w * s - s * .4, s * .1, s * .04);
    x.fill();
    x.fillStyle = accent;
    rrect(x, s * .2, e.h * s - s * .3, (e.w * s - s * .4) * clamp(e.prog, 0, 1), s * .1, s * .04);
    x.fill();
  }
  if (def.fuel && e.fuelT <= 0 && e.fuelBuf <= 0) statusDot(x, e, s, '#ffb454', time);
  drawPortArrowAt(x, e, s);
}

/* ---- burner generator ---- */
function drawGen(x, e, s, time, def){
  chassis(x, e, s, '#ffd76e', 0);
  const w = e.w * s, h = e.h * s, cx = w / 2, cy = h / 2;
  // flywheel
  x.save();
  x.translate(cx - s * .3, cy);
  x.rotate(e.load > 0 ? time * (2 + e.load * 7) : 0);
  x.fillStyle = '#242a35';
  x.strokeStyle = 'rgba(0,0,0,.55)';
  x.beginPath(); x.arc(0, 0, s * .42, 0, 7); x.fill(); x.stroke();
  x.strokeStyle = '#8b96a6';
  x.lineWidth = s * .07;
  for (let i = 0; i < 3; i++){
    x.beginPath();
    x.moveTo(0, 0);
    const a = i * Math.PI * 2 / 3;
    x.lineTo(Math.cos(a) * s * .34, Math.sin(a) * s * .34);
    x.stroke();
  }
  x.strokeStyle = '#ffd76e';
  x.lineWidth = s * .05;
  x.beginPath(); x.arc(0, 0, s * .42, 0, 7); x.stroke();
  x.restore();
  // firebox
  const glow = e.load > 0 ? .5 + .3 * Math.sin(time * 9) : (e.fuelT > 0 || e.fuelBuf > 0 ? .18 : .04);
  x.fillStyle = '#191210';
  rrect(x, cx + s * .18, cy - s * .34, s * .5, s * .68, s * .08);
  x.fill();
  x.fillStyle = hexA('#ff9040', glow);
  rrect(x, cx + s * .24, cy - s * .26, s * .38, s * .52, s * .06);
  x.fill();
  // bolt emblem
  x.fillStyle = 'rgba(255,215,110,.85)';
  x.beginPath();
  const bx = cx + s * .43, by = cy;
  x.moveTo(bx + s * .04, by - s * .18);
  x.lineTo(bx - s * .08, by + s * .04); x.lineTo(bx - s * .0, by + s * .04);
  x.lineTo(bx - s * .04, by + s * .18); x.lineTo(bx + s * .08, by - s * .04);
  x.lineTo(bx + s * .0, by - s * .04);
  x.closePath(); x.fill();
  if (e.fuelT <= 0 && e.fuelBuf <= 0) statusDot(x, e, s, '#ffb454', time);
}

/* ---- turbine ---- */
function drawTurbine(x, e, s, time, def){
  const chrome = e.key === 'turbine2';
  chassis(x, e, s, chrome ? '#8fe0d4' : '#ffd76e', 2);
  const w = e.w * s, h = e.h * s, cx = w / 2, cy = h / 2;
  x.fillStyle = '#1b212c';
  x.beginPath(); x.arc(cx, cy, s * .58, 0, 7); x.fill();
  x.save();
  x.translate(cx, cy);
  x.rotate(e.load > 0 ? time * ((chrome ? 7 : 4) + e.load * 14) : 0);
  x.fillStyle = chrome ? '#a9ded7' : '#96a3b5';
  x.strokeStyle = 'rgba(0,0,0,.5)';
  for (let i = 0; i < 5; i++){
    x.save();
    x.rotate(i * Math.PI * 2 / 5);
    x.beginPath();
    x.moveTo(s * .1, 0);
    x.quadraticCurveTo(s * .34, -s * .16, s * .52, -s * .05);
    x.quadraticCurveTo(s * .32, s * .08, s * .1, 0);
    x.fill(); x.stroke();
    x.restore();
  }
  x.fillStyle = '#ffd76e';
  x.beginPath(); x.arc(0, 0, s * .1, 0, 7); x.fill();
  x.restore();
  if (e.fuelT <= 0 && e.fuelBuf <= 0) statusDot(x, e, s, '#ffd76e', time);
}

/* ---- solar ---- */
function drawSolar(x, e, s, def){
  const w = e.w * s, h = e.h * s;
  const pad = s * .09;
  // tower/helios variants get warmer, denser mirror fields
  const tower = e.key === 'solar2', helios = e.key === 'solar3';
  x.fillStyle = '#232a37';
  x.strokeStyle = 'rgba(0,0,0,.55)';
  rrect(x, pad, pad, w - pad * 2, h - pad * 2, s * .1);
  x.fill(); x.stroke();
  const cols = e.w * 2, rows = e.h * 2;
  const cw = (w - pad * 4) / cols, ch = (h - pad * 4) / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++){
    const g = x.createLinearGradient(0, pad * 2 + j * ch, 0, pad * 2 + (j + 1) * ch);
    if (tower || helios){ g.addColorStop(0, '#3b4f74'); g.addColorStop(1, '#243252'); }
    else { g.addColorStop(0, '#274067'); g.addColorStop(1, '#1c2c47'); }
    x.fillStyle = g;
    x.fillRect(pad * 2 + i * cw + 1, pad * 2 + j * ch + 1, cw - 2, ch - 2);
  }
  if (tower || helios){
    // central molten-salt collector
    const cx = w / 2, cy = h / 2;
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, s * (helios ? .5 : .34));
    rg.addColorStop(0, '#fff2c8'); rg.addColorStop(.5, '#ffd76e'); rg.addColorStop(1, 'rgba(255,160,60,0)');
    x.fillStyle = rg;
    x.beginPath(); x.arc(cx, cy, s * (helios ? .5 : .34), 0, 7); x.fill();
    x.fillStyle = '#3d4656'; x.strokeStyle = 'rgba(0,0,0,.55)';
    x.beginPath(); x.arc(cx, cy, s * .13, 0, 7); x.fill(); x.stroke();
  }
  x.fillStyle = 'rgba(160,210,255,.16)';
  x.beginPath();
  x.moveTo(pad * 2, h - pad * 2);
  x.lineTo(w * .45, pad * 2);
  x.lineTo(w * .6, pad * 2);
  x.lineTo(pad * 3.4, h - pad * 2);
  x.closePath(); x.fill();
}

/* ---- accumulator ---- */
function drawAcc(x, e, s, time){
  const pad = s * .12;
  x.fillStyle = '#2c333f';
  x.strokeStyle = 'rgba(0,0,0,.55)';
  rrect(x, pad, pad, s - pad * 2, s - pad * 2, s * .12);
  x.fill(); x.stroke();
  // charge cells
  const fr = clamp((e.charge || 0) / F.ACC_CAP, 0, 1);
  const cells = 4;
  for (let i = 0; i < cells; i++){
    const cf = clamp(fr * cells - i, 0, 1);
    const cy2 = s - pad * 1.6 - (i + 1) * s * .155;
    x.fillStyle = 'rgba(0,0,0,.4)';
    rrect(x, pad * 1.8, cy2, s - pad * 3.6, s * .12, s * .03);
    x.fill();
    if (cf > .05){
      x.fillStyle = e.flow < 0 ? '#ffd76e' : '#6ec6ff';
      rrect(x, pad * 1.8, cy2, (s - pad * 3.6) * cf, s * .12, s * .03);
      x.fill();
    }
  }
  // terminals + activity shimmer
  x.fillStyle = '#8b96a6';
  x.fillRect(s * .3, pad * .4, s * .1, pad);
  x.fillRect(s * .6, pad * .4, s * .1, pad);
  if (e.flow){
    const a = .35 + .25 * Math.sin(time * 8);
    x.fillStyle = e.flow > 0 ? `rgba(110,198,255,${a})` : `rgba(255,215,110,${a})`;
    x.beginPath(); x.arc(s / 2, pad * .9, s * .06, 0, 7); x.fill();
  }
}

/* ---- lamp ---- */
function drawLamp(x, e, s, time, S){
  const c = s / 2;
  const sun = S ? F.sunFactor(S) : 1;
  const lit = !!(S && e.netId && S._netRatio && (S._netRatio[e.netId] || 0) > 0 && sun < .85);
  // base + stem
  x.fillStyle = '#2c333f';
  x.strokeStyle = 'rgba(0,0,0,.55)';
  x.beginPath(); x.arc(c, c + s * .18, s * .17, 0, 7); x.fill(); x.stroke();
  x.strokeStyle = '#8b96a6';
  x.lineWidth = Math.max(1.4, s * .07);
  x.lineCap = 'round';
  x.beginPath(); x.moveTo(c, c + s * .18); x.lineTo(c, c - s * .18); x.stroke();
  // bulb
  const g = x.createRadialGradient(c, c - s * .26, 0, c, c - s * .26, s * .2);
  if (lit){
    g.addColorStop(0, '#fff4d8');
    g.addColorStop(.6, '#ffd68a');
    g.addColorStop(1, 'rgba(255,180,90,.25)');
  } else {
    g.addColorStop(0, '#39404e');
    g.addColorStop(1, '#242a35');
  }
  x.fillStyle = g;
  x.strokeStyle = 'rgba(0,0,0,.5)';
  x.beginPath(); x.arc(c, c - s * .26, s * .15, 0, 7); x.fill(); x.stroke();
}

/* ---- power pole / pylon ----
   Drawn in fake perspective: base on the tile, mast rising "north";
   wires attach at R.poleTop(). */
R.poleTop = function(e){
  const pylon = e.key === 'pole2';
  const sub = e.key === 'pole3';
  return [e.x + .5, e.y + .5 - (pylon ? 1.05 : sub ? .62 : .78)];
};
function drawPole(x, e, s, time, S){
  const c = s / 2;
  const pylon = e.key === 'pole2';
  const sub = e.key === 'pole3';
  const live = !!(S && S._netSupply && e.netId && S._netSupply[e.netId] > 0);
  const topY = c - (pylon ? 1.05 : sub ? .62 : .78) * s;
  if (sub){
    // substation: squat transformer cabinet with twin bushings
    x.fillStyle = 'rgba(0,0,0,.3)';
    x.beginPath(); x.ellipse(c + s * .06, c + s * .12, s * .3, s * .12, 0, 0, 7); x.fill();
    const g = x.createLinearGradient(0, topY, 0, c + s * .2);
    g.addColorStop(0, '#3d4656'); g.addColorStop(1, '#272e3a');
    x.fillStyle = g;
    x.strokeStyle = 'rgba(0,0,0,.55)';
    rrect(x, c - s * .3, topY + s * .16, s * .6, (c + s * .2) - (topY + s * .16), s * .07);
    x.fill(); x.stroke();
    // cooling fins
    x.strokeStyle = 'rgba(0,0,0,.4)';
    x.lineWidth = Math.max(.8, s * .03);
    for (let i = 1; i <= 3; i++){
      const fy = topY + s * .16 + i * s * .16;
      x.beginPath(); x.moveTo(c - s * .26, fy); x.lineTo(c + s * .26, fy); x.stroke();
    }
    // hazard chevron plate
    x.fillStyle = '#c9a84a';
    rrect(x, c - s * .1, c - s * .04, s * .2, s * .14, s * .03); x.fill();
    // twin bushings on top
    const insCol2 = live ? `rgba(120,220,255,${.7 + .25 * Math.sin(time * 3 + e.id)})` : 'rgba(140,150,165,.8)';
    x.strokeStyle = '#8b96a6';
    x.lineWidth = Math.max(1.2, s * .06);
    x.lineCap = 'round';
    for (const ix of [-s * .16, s * .16]){
      x.beginPath(); x.moveTo(c + ix, topY + s * .18); x.lineTo(c + ix, topY); x.stroke();
    }
    x.fillStyle = insCol2;
    for (const ix of [-s * .16, s * .16]){
      x.beginPath(); x.arc(c + ix, topY, Math.max(1.4, s * .055), 0, 7); x.fill();
    }
    // live hum glow
    if (live){
      x.fillStyle = `rgba(120,220,255,${.06 + .03 * Math.sin(time * 3)})`;
      x.beginPath(); x.arc(c, c - s * .1, s * .55, 0, 7); x.fill();
    }
    if (S && e.links && !e.links.length){
      x.fillStyle = `rgba(255,214,138,${.35 + .25 * Math.sin(time * 4)})`;
      x.beginPath(); x.arc(c, topY - s * .12, s * .05, 0, 7); x.fill();
    }
    return;
  }
  // ground shadow + base plate
  x.fillStyle = 'rgba(0,0,0,.3)';
  x.beginPath(); x.ellipse(c + s * .06, c + s * .1, s * .2, s * .1, 0, 0, 7); x.fill();
  x.fillStyle = '#2c333f';
  x.strokeStyle = 'rgba(0,0,0,.55)';
  x.beginPath(); x.arc(c, c, s * .16, 0, 7); x.fill(); x.stroke();
  if (pylon){
    // lattice tower
    x.strokeStyle = '#7d8999';
    x.lineWidth = Math.max(1, s * .05);
    x.beginPath();
    x.moveTo(c - s * .16, c); x.lineTo(c - s * .07, topY);
    x.moveTo(c + s * .16, c); x.lineTo(c + s * .07, topY);
    // cross-bracing
    for (let i = 0; i < 3; i++){
      const y0 = c + (topY - c) * (i / 3), y1 = c + (topY - c) * ((i + 1) / 3);
      const w0 = s * (.16 - .03 * i), w1 = s * (.16 - .03 * (i + 1));
      x.moveTo(c - w0, y0); x.lineTo(c + w1, y1);
      x.moveTo(c + w0, y0); x.lineTo(c - w1, y1);
    }
    x.stroke();
    // double crossarm
    x.strokeStyle = '#96a3b5';
    x.lineWidth = Math.max(1.4, s * .07);
    x.beginPath();
    x.moveTo(c - s * .34, topY + s * .1); x.lineTo(c + s * .34, topY + s * .1);
    x.moveTo(c - s * .24, topY - s * .04); x.lineTo(c + s * .24, topY - s * .04);
    x.stroke();
  } else {
    // simple steel pole
    x.strokeStyle = '#8b96a6';
    x.lineWidth = Math.max(1.6, s * .09);
    x.lineCap = 'round';
    x.beginPath(); x.moveTo(c, c); x.lineTo(c, topY); x.stroke();
    x.strokeStyle = 'rgba(0,0,0,.35)';
    x.lineWidth = Math.max(.8, s * .03);
    x.beginPath(); x.moveTo(c + s * .03, c); x.lineTo(c + s * .03, topY); x.stroke();
    // crossarm
    x.strokeStyle = '#96a3b5';
    x.lineWidth = Math.max(1.4, s * .07);
    x.lineCap = 'round';
    x.beginPath(); x.moveTo(c - s * .26, topY + s * .04); x.lineTo(c + s * .26, topY + s * .04); x.stroke();
  }
  // insulators glow when the network carries power
  const insCol = live ? `rgba(120,220,255,${.7 + .25 * Math.sin(time * 3 + e.id)})` : 'rgba(140,150,165,.8)';
  x.fillStyle = insCol;
  for (const ix of pylon ? [-s * .3, s * .3, -s * .2, s * .2] : [-s * .22, s * .22]){
    x.beginPath();
    x.arc(c + ix, topY + (pylon && Math.abs(ix) < s * .25 ? -s * .04 : s * .04) + (pylon ? 0 : 0), Math.max(1.2, s * .045), 0, 7);
    x.fill();
  }
  // unlinked, uncovered pole with no neighbours: subtle hint dot
  if (S && e.links && !e.links.length){
    x.fillStyle = `rgba(255,214,138,${.35 + .25 * Math.sin(time * 4)})`;
    x.beginPath(); x.arc(c, topY - s * .1, s * .05, 0, 7); x.fill();
  }
}

/* wires between linked poles — drawn as a world-space overlay pass */
R.drawWires = function(x, S, time){
  const poles = [];
  for (const e of S.ents) if (e.kind === 'pole') poles.push(e);
  if (!poles.length) return;
  const s = R.tilePx();
  const byId = new Map(poles.map(p => [p.id, p]));
  x.lineCap = 'round';
  for (const p of poles){
    for (const lid of p.links){
      if (lid <= p.id) continue;             // draw each pair once
      const o = byId.get(lid);
      if (!o) continue;
      const [ax, ay] = R.worldToScreen(...R.poleTop(p));
      const [bx, by] = R.worldToScreen(...R.poleTop(o));
      // cull if both ends far off-screen
      if ((ax < -60 && bx < -60) || (ay < -60 && by < -60) ||
          (ax > R.W + 60 && bx > R.W + 60) || (ay > R.H + 60 && by > R.H + 60)) continue;
      const dist = Math.hypot(bx - ax, by - ay);
      const midX = (ax + bx) / 2, midY = (ay + by) / 2 + dist * .07 + s * .1;
      const live = !!(S._netSupply && p.netId && S._netSupply[p.netId] > 0);
      x.strokeStyle = 'rgba(8,10,15,.85)';
      x.lineWidth = Math.max(1, s * .045);
      x.beginPath(); x.moveTo(ax, ay); x.quadraticCurveTo(midX, midY, bx, by); x.stroke();
      if (live){
        x.strokeStyle = `rgba(130,215,255,${.18 + .1 * Math.sin(time * 2.4 + p.id)})`;
        x.lineWidth = Math.max(.6, s * .02);
        x.beginPath(); x.moveTo(ax, ay); x.quadraticCurveTo(midX, midY, bx, by); x.stroke();
      }
    }
  }
};

/* coverage square for a pole (selection / ghost) */
R.drawPoleCoverage = function(x, S, px, py, key){
  const def = F.BUILDINGS[key];
  const c = def.cover;
  const s = R.tilePx();
  const [sx, sy] = R.worldToScreen(px - c, py - c);
  const size = (c * 2 + 1) * s;
  x.fillStyle = 'rgba(89,214,255,.07)';
  x.fillRect(sx, sy, size, size);
  x.strokeStyle = 'rgba(89,214,255,.45)';
  x.setLineDash([s * .18, s * .12]);
  x.lineWidth = 1.5;
  x.strokeRect(sx, sy, size, size);
  x.setLineDash([]);
};

/* ---- pumpjack ---- */
function drawPump(x, e, s, time, def){
  chassis(x, e, s, '#7de08a', 0);
  const w = e.w * s, h = e.h * s;
  // nodding head
  const nod = e.active ? Math.sin(time * 2.6) * .3 : .12;
  x.save();
  x.translate(w * .4, h * .58);
  // A-frame
  x.strokeStyle = '#8b96a6';
  x.lineWidth = s * .08;
  x.beginPath();
  x.moveTo(-s * .2, s * .3); x.lineTo(0, -s * .3);
  x.moveTo(s * .2, s * .3); x.lineTo(0, -s * .3);
  x.stroke();
  // beam
  x.save();
  x.translate(0, -s * .3);
  x.rotate(nod);
  x.strokeStyle = '#aab4c2';
  x.lineWidth = s * .1;
  x.lineCap = 'round';
  x.beginPath(); x.moveTo(-s * .5, 0); x.lineTo(s * .55, 0); x.stroke();
  // head
  x.fillStyle = '#7de08a';
  x.beginPath(); x.arc(s * .58, 0, s * .13, 0, 7); x.fill();
  x.restore();
  x.restore();
  // counterweight wheel
  x.save();
  x.translate(w * .72, h * .62);
  x.rotate(e.active ? time * 2.6 : 0);
  x.fillStyle = '#242a35';
  x.strokeStyle = 'rgba(0,0,0,.5)';
  x.beginPath(); x.arc(0, 0, s * .22, 0, 7); x.fill(); x.stroke();
  x.fillStyle = '#3d4656';
  x.beginPath(); x.arc(s * .09, 0, s * .07, 0, 7); x.fill();
  x.restore();
  // tank gauge
  x.fillStyle = 'rgba(0,0,0,.4)';
  rrect(x, s * .2, h - s * .3, w - s * .4, s * .1, s * .04);
  x.fill();
  x.fillStyle = '#7de08a';
  rrect(x, s * .2, h - s * .3, (w - s * .4) * clamp(e.tank / 30, 0, 1), s * .1, s * .04);
  x.fill();
}

/* ---- THE CORE ---- */
/* ---- drone depot ---- */
function drawPortPad(x, e, s, time, S){
  const w = e.w * s, h = e.h * s, cx = w / 2, cy = h / 2;
  const pad = s * .08;
  x.fillStyle = '#2b323d';
  x.strokeStyle = 'rgba(0,0,0,.55)';
  rrect(x, pad, pad, w - pad * 2, h - pad * 2, s * .12);
  x.fill(); x.stroke();
  // hazard corner chevrons
  x.fillStyle = 'rgba(255,214,138,.5)';
  for (const [qx, qy] of [[pad * 1.5, pad * 1.5], [w - pad * 1.5, pad * 1.5], [pad * 1.5, h - pad * 1.5], [w - pad * 1.5, h - pad * 1.5]]){
    x.beginPath(); x.arc(qx, qy, s * .05, 0, 7); x.fill();
  }
  // landing ring
  x.strokeStyle = e.mode ? 'rgba(110,198,255,.7)' : 'rgba(140,150,165,.4)';
  x.lineWidth = Math.max(1.4, s * .06);
  x.beginPath(); x.arc(cx, cy, s * .52, 0, 7); x.stroke();
  x.beginPath(); x.arc(cx, cy, s * .18, 0, 7); x.stroke();
  // mode glyph: ▲ export (provide) / ▼ import (request)
  if (e.mode){
    x.fillStyle = e.mode === 'provide' ? 'rgba(255,214,138,.95)' : 'rgba(110,198,255,.95)';
    x.beginPath();
    if (e.mode === 'provide'){
      x.moveTo(cx, cy - s * .38); x.lineTo(cx + s * .12, cy - s * .18); x.lineTo(cx - s * .12, cy - s * .18);
    } else {
      x.moveTo(cx, cy - s * .18); x.lineTo(cx + s * .12, cy - s * .38); x.lineTo(cx - s * .12, cy - s * .38);
    }
    x.closePath(); x.fill();
  } else {
    // unconfigured: blinking amber dot
    x.fillStyle = `rgba(255,180,84,${.4 + .3 * Math.sin(time * 5)})`;
    x.beginPath(); x.arc(cx, cy, s * .08, 0, 7); x.fill();
  }
  // configured-item badge
  if (e.portItem){
    const ic = R.itemIcon(e.portItem, Math.max(10, Math.round(s * .42)));
    x.fillStyle = 'rgba(10,13,18,.75)';
    x.beginPath(); x.arc(w - s * .3, h - s * .3, s * .26, 0, 7); x.fill();
    x.drawImage(ic, w - s * .3 - ic.width / 2, h - s * .3 - ic.height / 2);
  }
  // parked drones on the pad
  if (e.drones){
    let slot = 0;
    for (const d of e.drones){
      if (d.st !== 'idle') continue;
      drawDroneBody(x, cx - s * .28 + slot * s * .56, cy + s * .3, s * .8, time, false);
      slot++;
    }
  }
  // antenna
  x.strokeStyle = '#8b96a6';
  x.lineWidth = Math.max(1, s * .05);
  x.beginPath(); x.moveTo(s * .22, s * .3); x.lineTo(s * .22, s * .02); x.stroke();
  x.fillStyle = e.mode ? `rgba(110,198,255,${.5 + .4 * Math.sin(time * 3 + e.id)})` : '#5b6674';
  x.beginPath(); x.arc(s * .22, s * .02, s * .05, 0, 7); x.fill();
  // request depots split out every side with a conveyor leading out — mark them
  if (S && e.mode === 'request' && F.portOutTiles){
    x.fillStyle = 'rgba(110,198,255,.9)';
    for (const [px, py, od] of F.portOutTiles(S, e)){
      // centre of the footprint edge cell bordering this exit, nudged to the rim
      const lx = (px - e.x), ly = (py - e.y);
      let ax, ay;
      if (od === 0){ ax = (lx + .5) * s; ay = s * .12; }
      else if (od === 2){ ax = (lx + .5) * s; ay = h - s * .12; }
      else if (od === 1){ ax = w - s * .12; ay = (ly + .5) * s; }
      else { ax = s * .12; ay = (ly + .5) * s; }
      const r = s * .12, dx = [0, 1, 0, -1][od], dy = [-1, 0, 1, 0][od];
      // outward triangle
      x.beginPath();
      x.moveTo(ax + dx * r, ay + dy * r);
      x.lineTo(ax - dx * r * .6 + dy * r * .7, ay - dy * r * .6 + dx * r * .7);
      x.lineTo(ax - dx * r * .6 - dy * r * .7, ay - dy * r * .6 - dx * r * .7);
      x.closePath(); x.fill();
    }
  }
}

/* a drone chassis at screen-space center (bx,by); sc ≈ tile px */
function drawDroneBody(x, bx, by, sc, time, flying){
  // rotor blurs
  x.strokeStyle = flying ? 'rgba(200,220,240,.55)' : 'rgba(140,150,165,.5)';
  x.lineWidth = Math.max(1, sc * .035);
  for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]){
    const rx = bx + ox * sc * .16, ry = by + oy * sc * .13;
    x.beginPath();
    if (flying){
      const a = time * 26 + ox * 2 + oy;
      x.moveTo(rx - Math.cos(a) * sc * .1, ry - Math.sin(a) * sc * .05);
      x.lineTo(rx + Math.cos(a) * sc * .1, ry + Math.sin(a) * sc * .05);
    } else {
      x.moveTo(rx - sc * .08, ry); x.lineTo(rx + sc * .08, ry);
    }
    x.stroke();
  }
  // body
  x.fillStyle = '#96a3b5';
  x.strokeStyle = 'rgba(0,0,0,.55)';
  x.lineWidth = 1;
  rrect(x, bx - sc * .1, by - sc * .08, sc * .2, sc * .16, sc * .05);
  x.fill(); x.stroke();
  x.fillStyle = flying ? '#6ec6ff' : '#4a5261';
  x.beginPath(); x.arc(bx, by, sc * .04, 0, 7); x.fill();
}
R.drawDroneBody = drawDroneBody;

/* ---- reservoir tank ---- */
function drawTank(x, e, s, def){
  const w = e.w * s, h = e.h * s, cx = w / 2, cy = h / 2;
  const pad = s * .08;
  // footing
  x.fillStyle = '#272e3a';
  x.strokeStyle = 'rgba(0,0,0,.55)';
  rrect(x, pad, pad, w - pad * 2, h - pad * 2, s * .1);
  x.fill(); x.stroke();
  // big riveted drum
  const g = x.createRadialGradient(cx - s * .3, cy - s * .3, 0, cx, cy, s * .95);
  g.addColorStop(0, '#4b5567');
  g.addColorStop(.7, '#39414f');
  g.addColorStop(1, '#272e3a');
  x.fillStyle = g;
  x.beginPath(); x.arc(cx, cy, s * .82, 0, 7); x.fill();
  x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 1.4;
  x.beginPath(); x.arc(cx, cy, s * .82, 0, 7); x.stroke();
  // seam bands + rivets
  x.strokeStyle = 'rgba(0,0,0,.35)';
  x.lineWidth = Math.max(1, s * .04);
  x.beginPath(); x.arc(cx, cy, s * .58, 0, 7); x.stroke();
  x.fillStyle = '#8b96a6';
  for (let i = 0; i < 8; i++){
    const a = i / 8 * Math.PI * 2 + .4;
    x.beginPath(); x.arc(cx + Math.cos(a) * s * .7, cy + Math.sin(a) * s * .7, s * .04, 0, 7); x.fill();
  }
  // level window: dark slot with oil column
  x.fillStyle = '#12100c';
  rrect(x, cx - s * .12, cy - s * .44, s * .24, s * .88, s * .08);
  x.fill();
  const fr = clamp(e.fluid / def.cap, 0, 1);
  if (fr > .02){
    x.fillStyle = '#3b3320';
    const lh = s * .84 * fr;
    rrect(x, cx - s * .09, cy + s * .42 - lh, s * .18, lh, s * .05);
    x.fill();
  }
  // top hatch
  x.fillStyle = '#5b6674';
  x.strokeStyle = 'rgba(0,0,0,.5)';
  x.beginPath(); x.arc(cx, cy - s * .55, s * .11, 0, 7); x.fill(); x.stroke();
}

/* ---- laboratory ---- */
function drawLab(x, e, s, time, def){
  chassis(x, e, s, '#c07ae8', 0);
  const w = e.w * s, h = e.h * s, cx = w / 2, cy = h / 2;
  // pack liquid colour follows what's being read
  const packC = e.workItem && F.ITEMS[e.workItem] ? F.ITEMS[e.workItem].icon.c1 : '#8a7fb8';
  // glass dome on a plinth
  x.fillStyle = '#1b212c';
  x.beginPath(); x.arc(cx, cy, s * .56, 0, 7); x.fill();
  x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = s * .05;
  x.beginPath(); x.arc(cx, cy, s * .56, 0, 7); x.stroke();
  // swirling reagent
  const glow = e.active ? .55 + .25 * Math.sin(time * 4) : .18;
  const rg = x.createRadialGradient(cx, cy, 0, cx, cy, s * .48);
  rg.addColorStop(0, hexA('#ffffff', glow * .5));
  rg.addColorStop(.4, hexA(packC, glow));
  rg.addColorStop(1, hexA(packC, .06));
  x.fillStyle = rg;
  x.beginPath(); x.arc(cx, cy, s * .48, 0, 7); x.fill();
  // orbiting motes while researching
  if (e.active){
    x.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 3; i++){
      const a = time * (1.6 + i * .5) + i * 2.1;
      const rr2 = s * (.22 + .1 * i);
      x.beginPath(); x.arc(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2 * .8, s * .04, 0, 7); x.fill();
    }
  }
  // dome shine
  x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = Math.max(1, s * .04);
  x.beginPath(); x.arc(cx - s * .1, cy - s * .1, s * .4, -2.4, -1.2); x.stroke();
  // read-progress arc around the dome
  if (e.workItem){
    x.strokeStyle = hexA('#c07ae8', .95);
    x.lineWidth = Math.max(1.4, s * .06);
    x.beginPath(); x.arc(cx, cy, s * .56, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(e.prog, 0, 1));
    x.stroke();
  }
  // corner flask emblem
  const fk = R.itemIcon(e.workItem || 'pack1', Math.round(s * .42));
  x.globalAlpha = e.workItem ? .95 : .4;
  x.drawImage(fk, s * .12, h - s * .55);
  x.globalAlpha = 1;
}

/* ---- beacon ---- */
function drawBeacon(x, e, s, time, S){
  chassis(x, e, s, '#59d6ff', 0);
  const w = e.w * s, h = e.h * s, cx = w / 2, cy = h / 2;
  const on = !!(e.mods && e.mods.length && e.netId &&
    S && S._netRatio && (S._netRatio[e.netId] || 0) > 0);
  // antenna mast + emitter orb
  x.strokeStyle = '#8b96a6';
  x.lineWidth = s * .09;
  x.lineCap = 'round';
  x.beginPath(); x.moveTo(cx, cy + s * .3); x.lineTo(cx, cy - s * .34); x.stroke();
  // dish ribs
  x.strokeStyle = '#5b6674';
  x.lineWidth = s * .05;
  for (const a of [-.7, 0, .7]){
    x.beginPath();
    x.moveTo(cx, cy - s * .05);
    x.lineTo(cx + Math.sin(a) * s * .34, cy + s * .28);
    x.stroke();
  }
  const orbC = on ? '#6ec6ff' : '#4a5261';
  const g = x.createRadialGradient(cx, cy - s * .38, 0, cx, cy - s * .38, s * .18);
  g.addColorStop(0, on ? '#eaf7ff' : '#6b7686'); g.addColorStop(1, orbC);
  x.fillStyle = g;
  x.strokeStyle = 'rgba(0,0,0,.5)';
  x.beginPath(); x.arc(cx, cy - s * .38, s * .14, 0, 7); x.fill(); x.stroke();
  // broadcast ripples
  if (on){
    const t = (time * .7) % 1;
    for (const off of [0, .5]){
      const tt = (t + off) % 1;
      x.strokeStyle = `rgba(110,198,255,${(1 - tt) * .5})`;
      x.lineWidth = Math.max(1, s * .04);
      x.beginPath(); x.arc(cx, cy - s * .38, s * (.16 + tt * .5), 0, 7); x.stroke();
    }
  }
}

/* aura square for a beacon (selection / ghost) */
R.drawBeaconRange = function(x, S, e, key){
  const def = F.BUILDINGS[key];
  const r = def.range;
  const s = R.tilePx();
  const [sx, sy] = R.worldToScreen(e.x - r, e.y - r);
  const size = (def.w + r * 2) * s;
  x.fillStyle = 'rgba(110,198,255,.06)';
  x.fillRect(sx, sy, size, size);
  x.strokeStyle = 'rgba(110,198,255,.5)';
  x.setLineDash([s * .18, s * .12]);
  x.lineWidth = 1.5;
  x.strokeRect(sx, sy, size, size);
  x.setLineDash([]);
};

function drawCore(x, e, s, time, S){
  const w = e.w * s, h = e.h * s, cx = w / 2, cy = h / 2;
  const pulse = S ? S.core.pulse : 0;
  const msFrac = S ? clamp(S.msIndex / F.MILESTONES.length, 0, 1) : .4;
  // obsidian base
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#232733');
  g.addColorStop(1, '#14161f');
  x.fillStyle = g;
  x.strokeStyle = '#000';
  x.lineWidth = 2;
  rrect(x, s * .12, s * .12, w - s * .24, h - s * .24, s * .3);
  x.fill(); x.stroke();
  // gold trim
  x.strokeStyle = hexA('#c9a86a', .8);
  x.lineWidth = Math.max(1.4, s * .045);
  rrect(x, s * .22, s * .22, w - s * .44, h - s * .44, s * .24);
  x.stroke();
  // intake notches (all four sides)
  x.fillStyle = '#0d0f15';
  for (let i = 0; i < e.w; i++){
    rrect(x, (i + .3) * s, s * .04, s * .4, s * .14, s * .04); x.fill();
    rrect(x, (i + .3) * s, h - s * .18, s * .4, s * .14, s * .04); x.fill();
    rrect(x, s * .04, (i + .3) * s, s * .14, s * .4, s * .04); x.fill();
    rrect(x, w - s * .18, (i + .3) * s, s * .14, s * .4, s * .04); x.fill();
  }
  // inner sanctum
  x.fillStyle = '#0b0d13';
  x.beginPath(); x.arc(cx, cy, s * 1.18, 0, 7); x.fill();
  x.strokeStyle = hexA('#c9a86a', .5);
  x.lineWidth = 1.4;
  x.beginPath(); x.arc(cx, cy, s * 1.18, 0, 7); x.stroke();
  // rotating rune ring
  x.save();
  x.translate(cx, cy);
  x.rotate(time * .18);
  x.strokeStyle = hexA('#c9a86a', .4);
  x.lineWidth = Math.max(1, s * .04);
  for (let i = 0; i < 8; i++){
    const a = i * Math.PI / 4;
    x.beginPath();
    x.arc(0, 0, s * .95, a, a + .42);
    x.stroke();
  }
  x.restore();
  // the heart
  const breathe = .82 + .1 * Math.sin(time * 1.4) + pulse * .35;
  const heartCol = S && S.won ? '#fff2cf' : '#ffb454';
  const hg = x.createRadialGradient(cx, cy, 0, cx, cy, s * .85 * breathe);
  hg.addColorStop(0, hexA('#fff6dd', .95));
  hg.addColorStop(.35, hexA(heartCol, .8 * (0.35 + msFrac * .65) + pulse * .2));
  hg.addColorStop(1, 'rgba(255,150,60,0)');
  x.fillStyle = hg;
  x.beginPath(); x.arc(cx, cy, s * .85 * breathe, 0, 7); x.fill();
  x.fillStyle = hexA('#fff6dd', .75 + pulse * .25);
  x.beginPath(); x.arc(cx, cy, s * (.24 + msFrac * .1) * breathe, 0, 7); x.fill();
}

/* ==================================================================== */
/* THE ENGINE RING (drawn beneath entities, around the core)            */
/* ==================================================================== */
function drawEngineRing(x, S, time){
  const core = S.core;
  const [ccx, ccy] = R.worldToScreen(core.x + core.w / 2, core.y + core.h / 2);
  const s = R.tilePx();
  const rad = s * 3.4;
  if (ccx < -rad * 2 || ccy < -rad * 2 || ccx > R.W + rad * 2 || ccy > R.H + rad * 2) return;
  const segs = F.MILESTONES.length;
  const lit = S.msIndex;
  const cineBoost = R.cine ? clamp(R.cine.t / 3, 0, 1) : 0;
  x.save();
  x.translate(ccx, ccy);
  x.rotate(time * .04);
  for (let i = 0; i < segs; i++){
    const a0 = i / segs * Math.PI * 2 + .06;
    const a1 = (i + 1) / segs * Math.PI * 2 - .06;
    const isLit = i < lit || cineBoost > i / segs;
    x.strokeStyle = isLit
      ? hexA('#ffb454', .5 + .2 * Math.sin(time * 2 + i) + cineBoost * .3)
      : 'rgba(255,255,255,.06)';
    x.lineWidth = Math.max(2, s * .12) * (isLit ? 1 : .6);
    x.lineCap = 'round';
    x.beginPath();
    x.arc(0, 0, rad, a0, a1);
    x.stroke();
    if (isLit){
      x.strokeStyle = hexA('#fff2cf', .25 + cineBoost * .5);
      x.lineWidth = Math.max(1, s * .04);
      x.beginPath();
      x.arc(0, 0, rad, a0 + .04, a1 - .04);
      x.stroke();
    }
  }
  x.restore();
}

/* ==================================================================== */
/* PARTICLES + FLOATERS                                                 */
/* ==================================================================== */
R.spawnParticle = function(p){
  if (R.particles.length < 420) R.particles.push(p);
};

function updateParticles(dt){
  const P = R.particles;
  for (let i = P.length - 1; i >= 0; i--){
    const p = P[i];
    p.life -= dt;
    if (p.life <= 0){ P[i] = P[P.length - 1]; P.pop(); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.grav) p.vy += p.grav * dt;
    if (p.drag){ p.vx *= (1 - p.drag * dt); p.vy *= (1 - p.drag * dt); }
  }
  const FL = R.floats;
  for (let i = FL.length - 1; i >= 0; i--){
    const f = FL[i];
    f.life -= dt;
    f.y -= dt * .5;
    if (f.life <= 0){ FL[i] = FL[FL.length - 1]; FL.pop(); }
  }
}

function drawParticles(x){
  const s = R.tilePx();
  for (const p of R.particles){
    const [px, py] = R.worldToScreen(p.x, p.y);
    if (px < -20 || py < -20 || px > R.W + 20 || py > R.H + 20) continue;
    const a = clamp(p.life / p.maxLife, 0, 1);
    x.globalAlpha = a * (p.alpha || 1);
    x.fillStyle = p.color;
    const sz = (p.size || .08) * s * (p.shrink ? a : 1);
    x.beginPath();
    x.arc(px, py, Math.max(.5, sz), 0, 7);
    x.fill();
  }
  x.globalAlpha = 1;
  // floaters (item icons + text near the core)
  for (const f of R.floats){
    const [px, py] = R.worldToScreen(f.x, f.y);
    const a = clamp(f.life / f.maxLife, 0, 1);
    x.globalAlpha = a;
    if (f.item){
      const ic = R.itemIcon(f.item, 16);
      x.drawImage(ic, px - 8, py - 8);
    }
    if (f.text){
      x.font = `600 ${Math.max(10, R.tilePx() * .3)}px Rubik, sans-serif`;
      x.textAlign = 'left'; x.textBaseline = 'middle';
      x.fillStyle = f.color || '#ffd68a';
      x.fillText(f.text, px + 10, py);
    }
  }
  x.globalAlpha = 1;
}

/* ambient particle emission from visible active machines */
function emitAmbient(S, dt, vis){
  if (R.particles.length > 340) return;
  for (const e of vis){
    if (e.kind === 'gen' && e.load > .05 && Math.random() < dt * 3){
      R.spawnParticle({
        x: e.x + e.w * .75, y: e.y + .15,
        vx: (Math.random() - .5) * .18, vy: -.35 - Math.random() * .25,
        life: 1.6, maxLife: 1.6, color: 'rgba(120,124,134,.5)', size: .1 + Math.random() * .08, drag: .4,
      });
    } else if (e.kind === 'machine' && e.crafting && e.active){
      const def = F.BUILDINGS[e.key];
      if ((def.fam === 'smelter' || def.fam === 'alloy') && Math.random() < dt * 2.4){
        R.spawnParticle({
          x: e.x + e.w / 2 + (Math.random() - .5) * .5, y: e.y + e.h / 2,
          vx: (Math.random() - .5) * .1, vy: -.3 - Math.random() * .3,
          life: .9, maxLife: .9, color: 'rgba(255,170,80,.65)', size: .05 + Math.random() * .05, shrink: true,
        });
      } else if (def.fam === 'asm' && Math.random() < dt * 1.6){
        R.spawnParticle({
          x: e.x + e.w * .35, y: e.y + e.h * .4,
          vx: (Math.random() - .5) * .8, vy: -Math.random() * .6,
          life: .35, maxLife: .35, color: '#bfe8ff', size: .04, grav: 2.4, shrink: true,
        });
      }
    } else if (e.kind === 'miner' && e.active && Math.random() < dt * 2){
      R.spawnParticle({
        x: e.x + .5 + (Math.random() - .5) * .6, y: e.y + .7,
        vx: (Math.random() - .5) * .3, vy: -.1 - Math.random() * .15,
        life: .7, maxLife: .7, color: 'rgba(150,140,120,.4)', size: .07, shrink: true,
      });
    }
  }
  // green spores drift over the healed land
  if (R._heal && R._heal.r > 6 && Math.random() < dt * 5){
    const [wx0, wy0] = R.screenToWorld(0, 0);
    const [wx1, wy1] = R.screenToWorld(R.W, R.H);
    const sx2 = wx0 + Math.random() * (wx1 - wx0);
    const sy2 = wy0 + Math.random() * (wy1 - wy0);
    if (Math.hypot(sx2 - R._heal.cx, sy2 - R._heal.cy) < R._heal.r * .85){
      R.spawnParticle({
        x: sx2, y: sy2,
        vx: .04 + Math.random() * .08, vy: -.05 - Math.random() * .08,
        life: 3.5, maxLife: 3.5, color: 'rgba(150,220,140,.45)', size: .045 + Math.random() * .03, drag: .1,
      });
    }
  }
}

/* event hooks from UI: place puffs, mine sparks, core absorb */
R.onEvent = function(S, ev){
  switch (ev.type){
    case 'place': {
      const def = F.BUILDINGS[ev.key];
      for (let i = 0; i < 8; i++){
        R.spawnParticle({
          x: ev.x + (def ? def.w / 2 : .5) + (Math.random() - .5) * (def ? def.w : 1),
          y: ev.y + (def ? def.h / 2 : .5) + (Math.random() - .5) * (def ? def.h : 1),
          vx: (Math.random() - .5) * 1.4, vy: (Math.random() - .5) * 1.4,
          life: .4, maxLife: .4, color: 'rgba(200,210,225,.55)', size: .08, drag: 3, shrink: true,
        });
      }
      break;
    }
    case 'remove':
      for (let i = 0; i < 6; i++){
        R.spawnParticle({
          x: ev.x + .5, y: ev.y + .5,
          vx: (Math.random() - .5) * 2, vy: (Math.random() - .5) * 2,
          life: .35, maxLife: .35, color: 'rgba(255,150,130,.5)', size: .07, drag: 3, shrink: true,
        });
      }
      break;
    case 'broken': {
      // a machine dies: one dark cough of smoke and soot
      const bdef = F.BUILDINGS[ev.key];
      for (let i = 0; i < 14; i++){
        R.spawnParticle({
          x: ev.x + (bdef ? bdef.w / 2 : .5) + (Math.random() - .5) * (bdef ? bdef.w : 1),
          y: ev.y + (bdef ? bdef.h / 2 : .5) + (Math.random() - .5) * (bdef ? bdef.h : 1),
          vx: (Math.random() - .5) * .8, vy: -.4 - Math.random() * .9,
          life: 1.6, maxLife: 1.6, color: 'rgba(62,56,52,.6)', size: .12 + Math.random() * .08, drag: .6,
        });
      }
      break;
    }
    case 'handmine':
      for (let i = 0; i < 5; i++){
        R.spawnParticle({
          x: ev.x + .5, y: ev.y + .5,
          vx: (Math.random() - .5) * 1.8, vy: -Math.random() * 1.6,
          life: .5, maxLife: .5, color: '#d8c9a0', size: .06, grav: 4, shrink: true,
        });
      }
      break;
    case 'deliver': {
      if (R.floats.length < 20 && Math.random() < .5){
        const c = S.core;
        R.floats.push({
          x: c.x + c.w / 2 + (Math.random() - .5) * 2,
          y: c.y - .3,
          item: ev.item, text: '+1',
          life: 1, maxLife: 1,
        });
      }
      break;
    }
    case 'milestone':
      R.shake = Math.min(R.shake + 5, 8);
      for (let i = 0; i < 40; i++){
        const c = S.core;
        const a = Math.random() * Math.PI * 2;
        R.spawnParticle({
          x: c.x + c.w / 2, y: c.y + c.h / 2,
          vx: Math.cos(a) * (2 + Math.random() * 4), vy: Math.sin(a) * (2 + Math.random() * 4),
          life: 1.2, maxLife: 1.2, color: Math.random() < .5 ? '#ffd68a' : '#fff2cf',
          size: .1, drag: 1.6, shrink: true,
        });
      }
      break;
    case 'win':
      R.cine = { t: 0 };
      break;
  }
};

/* ==================================================================== */
/* GHOST + OVERLAYS                                                     */
/* ==================================================================== */
function drawGhost(x, S, ghost, time){
  const def = F.BUILDINGS[ghost.key];
  if (!def) return;
  const s = R.tilePx();
  const [px, py] = R.worldToScreen(ghost.x, ghost.y);
  // pole ghost: coverage square + dashed previews of the links it would form
  if (def.kind === 'beacon'){
    R.drawBeaconRange(x, S, { x: ghost.x, y: ghost.y }, ghost.key);
  }
  if (def.kind === 'pole'){
    R.drawPoleCoverage(x, S, ghost.x, ghost.y, ghost.key);
    const topA = [ghost.x + .5, ghost.y + .5 - (ghost.key === 'pole2' ? 1.05 : ghost.key === 'pole3' ? .62 : .78)];
    const [ax, ay] = R.worldToScreen(topA[0], topA[1]);
    x.setLineDash([s * .12, s * .1]);
    x.lineWidth = Math.max(1, s * .04);
    for (const p of S.ents){
      if (p.kind !== 'pole') continue;
      const d = Math.hypot(p.x - ghost.x, p.y - ghost.y);
      if (d > Math.max(def.reach, F.BUILDINGS[p.key].reach)) continue;
      const [bx, by] = R.worldToScreen(...R.poleTop(p));
      x.strokeStyle = `rgba(130,215,255,${.5 + .2 * Math.sin(time * 4)})`;
      x.beginPath(); x.moveTo(ax, ay);
      x.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + s * .3, bx, by);
      x.stroke();
    }
    x.setLineDash([]);
  }
  // electric building ghost: live "will it have power?" bolt
  if (def.power || def.kind === 'gen' || def.kind === 'turbine' || def.kind === 'solar'){
    let covered = false;
    const foot = { x: ghost.x, y: ghost.y, w: def.w, h: def.h };
    for (const p of S.ents){
      if (p.kind === 'pole' && F.poleCovers(p, foot)){ covered = true; break; }
    }
    drawBolt(x, px + def.w * s - s * .22, py + s * .26, s * .34,
      covered ? 'rgba(120,220,255,.95)' : `rgba(255,110,110,${.6 + .3 * Math.sin(time * 5)})`);
  }
  x.save();
  x.translate(px, py);
  x.globalAlpha = .55;
  const fake = Object.assign({
    item: null, t: 0, prog: 0, crafting: false, active: false, fuelT: 0, fuelBuf: 0,
    inBuf: {}, outBuf: {}, outTotal: 0, store: {}, total: 0, tank: 0, fluid: 0, load: 0,
    transit: [], linkId: 1, isExit: false, srcDir: ghost.dir, outIdx: 0,
  }, { key: ghost.key, kind: def.kind, x: ghost.x, y: ghost.y, w: def.w, h: def.h, dir: ghost.dir });
  drawEntBody(x, fake, s, time, null);
  x.globalAlpha = 1;
  // validity wash
  x.fillStyle = ghost.ok ? 'rgba(111,227,160,.16)' : 'rgba(255,118,118,.2)';
  rrect(x, 0, 0, def.w * s, def.h * s, s * .1);
  x.fill();
  x.strokeStyle = ghost.ok ? 'rgba(111,227,160,.7)' : 'rgba(255,118,118,.8)';
  x.lineWidth = 2;
  rrect(x, 0, 0, def.w * s, def.h * s, s * .1);
  x.stroke();
  // direction arrow
  if (def.kind !== 'chest' || true){
    x.save();
    x.translate(def.w * s / 2, def.h * s / 2);
    x.rotate(angOf(ghost.dir));
    x.strokeStyle = 'rgba(255,255,255,.85)';
    x.lineWidth = Math.max(2, s * .07);
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(-s * .16, 0); x.lineTo(s * .2, 0);
    x.moveTo(s * .06, -s * .12); x.lineTo(s * .2, 0); x.lineTo(s * .06, s * .12);
    x.stroke();
    x.restore();
  }
  x.restore();
  // tunnel span preview
  if (def.kind === 'ubelt'){
    x.strokeStyle = 'rgba(150,190,255,.5)';
    x.setLineDash([s * .14, s * .12]);
    x.lineWidth = 2;
    x.beginPath();
    const cx0 = px + s / 2, cy0 = py + s / 2;
    x.moveTo(cx0, cy0);
    x.lineTo(cx0 + DX[ghost.dir] * s * def.span, cy0 + DY[ghost.dir] * s * def.span);
    x.stroke();
    x.setLineDash([]);
  }
}

/* ==================================================================== */
/* MAIN DRAW                                                            */
/* ==================================================================== */
R.draw = function(S, dt, U){
  const x = R.ctx;
  R.time += dt;
  const time = R.time;

  x.save();
  x.scale(R.dpr, R.dpr);

  /* cinematic camera */
  if (R.cine){
    R.cine.t += dt;
    const c = S.core;
    const tx = c.x + c.w / 2, ty = c.y + c.h / 2;
    R.cam.x = lerp(R.cam.x, tx, Math.min(1, dt * 1.6));
    R.cam.y = lerp(R.cam.y, ty, Math.min(1, dt * 1.6));
    R.cam.zoom = lerp(R.cam.zoom, 1.35, Math.min(1, dt * .9));
    if (R.cine.t > 2 && R.cine.t < 5) R.shake = Math.min(R.shake + dt * 6, 7);
  }

  /* shake (budgeted: hard cap, fast decay) */
  R.shake = Math.max(0, R.shake - dt * 12);
  const shx = R.shake > .1 ? (Math.random() - .5) * R.shake : 0;
  const shy = R.shake > .1 ? (Math.random() - .5) * R.shake : 0;
  x.translate(shx, shy);

  /* --- ground --- */
  x.fillStyle = '#0b0e14';
  x.fillRect(-8, -8, R.W + 16, R.H + 16);
  const s = R.tilePx();
  if (R.groundCanvas){
    const g = R.groundScale;
    const [ox, oy] = R.worldToScreen(0, 0);
    x.imageSmoothingEnabled = true;
    x.drawImage(R.groundCanvas, ox, oy, S.w * s, S.h * s);
  }

  /* visible tile range */
  const [wx0, wy0] = R.screenToWorld(0, 0);
  const [wx1, wy1] = R.screenToWorld(R.W, R.H);
  const tx0 = clamp(Math.floor(wx0) - 1, 0, S.w - 1), ty0 = clamp(Math.floor(wy0) - 1, 0, S.h - 1);
  const tx1 = clamp(Math.ceil(wx1) + 1, 0, S.w - 1), ty1 = clamp(Math.ceil(wy1) + 1, 0, S.h - 1);

  /* grid lines when zoomed in */
  if (R.cam.zoom > .85){
    x.strokeStyle = `rgba(255,255,255,${Math.min(.05, (R.cam.zoom - .85) * .08)})`;
    x.lineWidth = 1;
    x.beginPath();
    for (let tx = tx0; tx <= tx1 + 1; tx++){
      const [px] = R.worldToScreen(tx, 0);
      x.moveTo(px, 0); x.lineTo(px, R.H);
    }
    for (let ty = ty0; ty <= ty1 + 1; ty++){
      const [, py] = R.worldToScreen(0, ty);
      x.moveTo(0, py); x.lineTo(R.W, py);
    }
    x.stroke();
  }

  /* ore lumps (detail pass when zoomed in) */
  if (R.cam.zoom >= .55){
    const lumpRng = { v: 0 };
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++){
      const i = ty * S.w + tx;
      const t = S.oreType[i];
      if (!t) continue;
      const amt = S.oreAmt[i];
      const [px, py] = R.worldToScreen(tx, ty);
      const ore = F.ORES[t];
      if (amt <= 0){
        // scar
        x.fillStyle = 'rgba(0,0,0,.32)';
        x.fillRect(px + 1, py + 1, s - 2, s - 2);
        continue;
      }
      // deterministic per-tile pseudo-random
      let h = (tx * 374761393 + ty * 668265263) >>> 0;
      h = (h ^ (h >> 13)) * 1274126177 >>> 0;
      const rnd = (n) => { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 16) / 65536 * n; };
      if (t === F.OIL_TYPE){
        // oil pool
        x.fillStyle = hexA('#10130f', .9);
        x.beginPath();
        x.ellipse(px + s / 2, py + s / 2, s * .42, s * .34, rnd(3), 0, 7);
        x.fill();
        x.fillStyle = 'rgba(130,150,120,.14)';
        x.beginPath();
        x.ellipse(px + s / 2 - s * .1, py + s / 2 - s * .08, s * .16, s * .08, .6, 0, 7);
        x.fill();
        continue;
      }
      const density = clamp(amt / 600, .25, 1);
      const n = 2 + Math.round(density * 2);
      for (let k = 0; k < n; k++){
        const lx = px + s * (.2 + rnd(.6));
        const ly = py + s * (.2 + rnd(.6));
        const lr = s * (.09 + rnd(.09)) * (.6 + density * .5);
        x.fillStyle = ore.c2;
        x.beginPath(); x.arc(lx + lr * .18, ly + lr * .22, lr, 0, 7); x.fill();
        x.fillStyle = ore.c1;
        x.beginPath(); x.arc(lx, ly, lr * .82, 0, 7); x.fill();
      }
    }
  }

  /* engine ring beneath buildings */
  drawEngineRing(x, S, time);

  /* --- entities (culled) --- */
  const vis = [];
  for (const e of S.ents){
    if (e.x + e.w < tx0 || e.y + e.h < ty0 || e.x > tx1 || e.y > ty1) continue;
    vis.push(e);
  }
  // belts first (under machines' shadows), then others, core last
  vis.sort((a, b) => zOf(a) - zOf(b));
  for (const e of vis){
    const [px, py] = R.worldToScreen(e.x, e.y);
    x.save();
    x.translate(px, py);
    if (R.cam.zoom < .42 && e.kind !== 'core'){
      // far LOD: simple slab
      x.fillStyle = lodColor(e);
      x.fillRect(1, 1, e.w * s - 2, e.h * s - 2);
    } else {
      drawEntBody(x, e, s, time, S);
    }
    x.restore();
  }

  /* items on belts */
  if (R.cam.zoom >= .5){
    const isz = Math.max(6, Math.round(s * .5));
    for (const e of vis){
      if ((e.kind === 'belt' || e.kind === 'splitter' || e.kind === 'ubelt') && e.item){
        const [px, py] = R.worldToScreen(e.x, e.y);
        let ix, iy;
        // any item at t < 0 is still crossing IN from the previous tile
        // (a splitter hand-off): glide it straight along its entry line
        // from that tile's center to this one's edge — no pops, ever
        const d0 = e.srcDir != null ? e.srcDir : e.dir;
        if (e.kind === 'splitter'){
          const t2 = clamp(e.t, -.5, .5);
          ix = s / 2 + DX[d0] * s * (t2 - .5);
          iy = s / 2 + DY[d0] * s * (t2 - .5);
        } else if (e.t < 0){
          const t2 = Math.max(e.t, -.5);
          ix = s / 2 + DX[d0] * s * (t2 - .5);
          iy = s / 2 + DY[d0] * s * (t2 - .5);
        } else {
          [ix, iy] = beltPoint(e, s, clamp(e.t, 0, 1));
        }
        const ic = R.itemIcon(e.item, isz);
        x.save();
        x.shadowColor = 'rgba(0,0,0,.5)';
        x.shadowBlur = 3;
        x.shadowOffsetY = 1.5;
        x.drawImage(ic, px + ix - isz / 2, py + iy - isz / 2);
        x.restore();
      }
    }
  }

  /* power wires (overhead, above machines and items) */
  R.drawWires(x, S, time);

  /* ambient effects */
  emitAmbient(S, dt, vis);
  updateParticles(dt);
  drawParticles(x);

  /* cargo drones in flight (above everything on the ground) */
  for (const e of S.ents){
    if (e.kind !== 'port' || !e.drones) continue;
    for (const d of e.drones){
      if (d.st === 'idle') continue;
      const [dx2, dy2] = R.worldToScreen(d.x, d.y);
      const s3 = R.tilePx();
      if (dx2 < -40 || dy2 < -40 || dx2 > R.W + 40 || dy2 > R.H + 40) continue;
      // ground shadow
      x.fillStyle = 'rgba(0,0,0,.25)';
      x.beginPath(); x.ellipse(dx2, dy2 + s3 * .55, s3 * .16, s3 * .07, 0, 0, 7); x.fill();
      const bob = Math.sin(time * 3 + d.x) * s3 * .04;
      R.drawDroneBody(x, dx2, dy2 + bob, s3, time, true);
      if (d.cargo > 0 && d.item){
        const ic = R.itemIcon(d.item, Math.max(8, Math.round(s3 * .34)));
        x.drawImage(ic, dx2 - ic.width / 2, dy2 + bob + s3 * .12);
      }
    }
  }

  /* night falls: HEAVY dark over the world, warm circles around lit lamps */
  const sun = F.sunFactor(S);
  const NIGHT_MAX = .84;
  const dark = (1 - sun) * NIGHT_MAX;
  if (dark > .01){
    const s2 = R.tilePx();
    /* The darkness lives on its own layer, and lamps punch holes in it —
       so lamplight REVEALS the ground as it looks by day instead of
       painting foggy amber over it. Overlapping holes just merge (erasing
       twice is still erased), so clumps of lamps can never blow out. */
    if (!R._nightCv) R._nightCv = document.createElement('canvas');
    const nc = R._nightCv;
    if (nc.width !== R.W || nc.height !== R.H){ nc.width = R.W; nc.height = R.H; }
    const nx = nc.getContext('2d');
    nx.globalCompositeOperation = 'source-over';
    nx.clearRect(0, 0, R.W, R.H);
    nx.fillStyle = `rgba(6,9,20,${dark})`;
    nx.fillRect(0, 0, R.W, R.H);
    nx.globalCompositeOperation = 'destination-out';
    const lamps = [];
    for (const e of S.ents){
      if (e.kind !== 'lamp') continue;
      if (!e.netId || !S._netRatio || (S._netRatio[e.netId] || 0) <= 0) continue;
      const glow = F.BUILDINGS[e.key].glow || 5;
      const [lx, ly] = R.worldToScreen(e.x + .5, e.y + .24);
      const rad = glow * s2;
      if (lx < -rad || ly < -rad || lx > R.W + rad || ly > R.H + rad) continue;
      lamps.push([lx, ly, rad, e.id]);
      const hole = nx.createRadialGradient(lx, ly, 0, lx, ly, rad);
      hole.addColorStop(0, 'rgba(0,0,0,.55)');    // half the dark lifted at the heart…
      hole.addColorStop(.45, 'rgba(0,0,0,.4)');
      hole.addColorStop(1, 'rgba(0,0,0,0)');
      nx.fillStyle = hole;
      nx.beginPath(); nx.arc(lx, ly, rad, 0, 7); nx.fill();
    }
    // the Core itself holds back the dark a little
    const [ccx2, ccy2] = R.worldToScreen(S.core.x + S.core.w / 2, S.core.y + S.core.h / 2);
    const crad = 7 * s2;
    if (ccx2 > -crad && ccy2 > -crad && ccx2 < R.W + crad && ccy2 < R.H + crad){
      const ch = nx.createRadialGradient(ccx2, ccy2, 0, ccx2, ccy2, crad);
      ch.addColorStop(0, 'rgba(0,0,0,.4)');
      ch.addColorStop(1, 'rgba(0,0,0,0)');
      nx.fillStyle = ch;
      nx.beginPath(); nx.arc(ccx2, ccy2, crad, 0, 7); nx.fill();
    }
    /* the wanderer's lantern: a small glow rides the cursor, fading in and
       out with the dark. 1/2.5 of a lamp's radius, and its light leans
       amber over reveal 80:20 (a lamp is 50:50) — company, not utility. */
    const CURSOR_R = (15 / 2.5) * s2;
    const mOn = R.mouse && R.mouse.x != null;
    if (mOn){
      const hole = nx.createRadialGradient(R.mouse.x, R.mouse.y, 0, R.mouse.x, R.mouse.y, CURSOR_R);
      hole.addColorStop(0, 'rgba(0,0,0,.22)');
      hole.addColorStop(.45, 'rgba(0,0,0,.16)');
      hole.addColorStop(1, 'rgba(0,0,0,0)');
      nx.fillStyle = hole;
      nx.beginPath(); nx.arc(R.mouse.x, R.mouse.y, CURSOR_R, 0, 7); nx.fill();
    }
    x.drawImage(nc, 0, 0);
    /* …and half the light given back as warm amber, pooled with
       per-channel MAX so it never stacks toward white */
    if (lamps.length || mOn){
      if (!R._lightCv) R._lightCv = document.createElement('canvas');
      const lc = R._lightCv;
      if (lc.width !== R.W || lc.height !== R.H){ lc.width = R.W; lc.height = R.H; }
      const lx2 = lc.getContext('2d');
      lx2.clearRect(0, 0, R.W, R.H);
      lx2.globalCompositeOperation = 'lighten';
      const k2 = dark / NIGHT_MAX;
      for (const [lx, ly, rad, id] of lamps){
        const flicker = .85 + .15 * Math.sin(time * 6 + id * 1.7);
        const lg = lx2.createRadialGradient(lx, ly, 0, lx, ly, rad);
        lg.addColorStop(0, `rgba(255,200,110,${.25 * k2 * flicker})`);
        lg.addColorStop(.5, `rgba(255,180,90,${.12 * k2})`);
        lg.addColorStop(1, 'rgba(255,160,60,0)');
        lx2.fillStyle = lg;
        lx2.beginPath(); lx2.arc(lx, ly, rad, 0, 7); lx2.fill();
      }
      if (mOn){
        const breathe = .9 + .1 * Math.sin(time * 2.2);
        const cg = lx2.createRadialGradient(R.mouse.x, R.mouse.y, 0, R.mouse.x, R.mouse.y, CURSOR_R);
        cg.addColorStop(0, `rgba(255,200,110,${.4 * k2 * breathe})`);
        cg.addColorStop(.5, `rgba(255,180,90,${.19 * k2})`);
        cg.addColorStop(1, 'rgba(255,160,60,0)');
        lx2.fillStyle = cg;
        lx2.beginPath(); lx2.arc(R.mouse.x, R.mouse.y, CURSOR_R, 0, 7); lx2.fill();
      }
      x.save();
      x.globalCompositeOperation = 'lighter';
      x.drawImage(lc, 0, 0);
      x.restore();
    }
  }

  /* weather — occasional rain showers (screen-space streaks + audio bed) */
  if (!R.weather){ R.weather = { state: 'clear', t: 16 }; R.wx = []; }
  R.weather.t -= dt;
  if (R.weather.t <= 0){
    R.weather.state = Math.random() < .35 ? 'rain' : 'clear';
    R.weather.t = 30 + Math.random() * 50;
    if (F.audio && F.audio.setWeather) F.audio.setWeather(R.weather.state);
  }
  if (R.weather.state === 'rain'){
    for (let i = 0; i < 4 && R.wx.length < 240; i++)
      R.wx.push({ x: Math.random() * (R.W + 160) - 80, y: -12, vx: 50 + Math.random() * 40, vy: 420 + Math.random() * 160, life: 4 });
  }
  if (R.wx && R.wx.length){
    for (let i = R.wx.length - 1; i >= 0; i--){
      const p = R.wx[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0 || p.y > R.H + 24 || p.x > R.W + 60){ R.wx.splice(i, 1); continue; }
      x.strokeStyle = 'rgba(150,200,235,.32)';
      x.lineWidth = 1;
      x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x - p.vx * .022, p.y - p.vy * .022); x.stroke();
    }
  }

  /* healing pulse — a wave of green rolls out from the Core on tier-up */
  if (R.healPulse){
    R.healPulse.t += dt;
    const dur = 3.2;
    if (R.healPulse.t >= dur) R.healPulse = null;
    else {
      const k = R.healPulse.t / dur;
      const [hx, hy] = R.worldToScreen(S.core.x + S.core.w / 2, S.core.y + S.core.h / 2);
      const rad = (k * k * .8 + k * .2) * Math.hypot(R.W, R.H) * .75;
      const col = R.healPulse.gold ? '255,214,110' : '140,220,150';
      for (const [off, wgt] of [[0, .55], [-.06, .25]]){
        const rr2 = Math.max(1, rad * (1 + off));
        x.strokeStyle = `rgba(${col},${(1 - k) * wgt})`;
        x.lineWidth = Math.max(2, R.tilePx() * .35 * (1 - k));
        x.beginPath(); x.arc(hx, hy, rr2, 0, 7); x.stroke();
      }
      x.fillStyle = `rgba(${col},${(1 - k) * .05})`;
      x.beginPath(); x.arc(hx, hy, rad, 0, 7); x.fill();
    }
  }

  /* hover + ghost + belt-drag preview */
  if (U){
    if (U.beltPath && U.beltPath.length){
      for (const seg of U.beltPath){
        const [px, py] = R.worldToScreen(seg.x, seg.y);
        x.fillStyle = 'rgba(111,227,160,.18)';
        x.fillRect(px + 1, py + 1, s - 2, s - 2);
        x.save();
        x.translate(px + s / 2, py + s / 2);
        x.rotate(angOf(seg.dir));
        x.strokeStyle = 'rgba(111,227,160,.8)';
        x.lineWidth = Math.max(1.5, s * .06);
        x.lineCap = 'round';
        x.beginPath();
        x.moveTo(-s * .14, 0); x.lineTo(s * .14, 0);
        x.moveTo(s * .04, -s * .1); x.lineTo(s * .16, 0); x.lineTo(s * .04, s * .1);
        x.stroke();
        x.restore();
      }
    }
    if (U.ghost) drawGhost(x, S, U.ghost, time);
    // blueprint stamp preview
    if (U.bpGhost){
      for (const g of U.bpGhost){
        const def = F.BUILDINGS[g.key];
        const [px, py] = R.worldToScreen(g.x, g.y);
        x.fillStyle = g.ok ? 'rgba(89,214,255,.14)' : 'rgba(255,118,118,.18)';
        rrect(x, px + 1, py + 1, def.w * s - 2, def.h * s - 2, s * .1);
        x.fill();
        x.strokeStyle = g.ok ? 'rgba(89,214,255,.6)' : 'rgba(255,118,118,.7)';
        x.lineWidth = 1.4;
        rrect(x, px + 1, py + 1, def.w * s - 2, def.h * s - 2, s * .1);
        x.stroke();
      }
    }
    // deconstruct / copy marquee
    if (U.marquee){
      const mq = U.marquee;
      const [px0, py0] = R.worldToScreen(mq.x0, mq.y0);
      const w = (mq.x1 - mq.x0 + 1) * s, h = (mq.y1 - mq.y0 + 1) * s;
      const red = mq.mode === 'decon';
      x.fillStyle = red ? 'rgba(255,118,118,.14)' : 'rgba(89,214,255,.12)';
      x.fillRect(px0, py0, w, h);
      x.strokeStyle = red ? 'rgba(255,118,118,.85)' : 'rgba(89,214,255,.8)';
      x.lineWidth = 2; x.setLineDash([s * .2, s * .14]);
      x.strokeRect(px0, py0, w, h);
      x.setLineDash([]);
    }
    if (U.hover && !U.ghost){
      const e = F.entAt(S, U.hover[0], U.hover[1]);
      if (e && e.kind !== 'core'){
        const [px, py] = R.worldToScreen(e.x, e.y);
        x.strokeStyle = 'rgba(255,255,255,.35)';
        x.lineWidth = 1.5;
        rrect(x, px + 1, py + 1, e.w * s - 2, e.h * s - 2, s * .12);
        x.stroke();
      }
    }
    /* selected belt line: every belt in the run glows cyan */
    if (U.lineSel && U.lineSel.length){
      x.fillStyle = 'rgba(89,214,255,.14)';
      x.strokeStyle = 'rgba(89,214,255,.8)';
      x.lineWidth = Math.max(1, s * .05);
      for (const b of U.lineSel){
        const [px, py] = R.worldToScreen(b.x, b.y);
        x.fillRect(px + 1, py + 1, s - 2, s - 2);
        x.strokeRect(px + 1.5, py + 1.5, s - 3, s - 3);
      }
    }
    if (U.selection){
      const e = U.selection;
      if (e.kind === 'pole') R.drawPoleCoverage(x, S, e.x, e.y, e.key);
      if (e.kind === 'beacon') R.drawBeaconRange(x, S, e, e.key);
      const [px, py] = R.worldToScreen(e.x, e.y);
      x.strokeStyle = 'rgba(255,180,84,.9)';
      x.lineWidth = 2;
      const m = 2 + Math.sin(time * 4) * 1.2;
      rrect(x, px - m, py - m, e.w * s + m * 2, e.h * s + m * 2, s * .14);
      x.stroke();
    }
    /* tutorial arrow → world target */
    if (U.arrow){
      const [px, py] = R.worldToScreen(U.arrow.x, U.arrow.y);
      const bob = Math.sin(time * 4) * s * .12;
      x.fillStyle = '#ffd68a';
      x.strokeStyle = 'rgba(0,0,0,.5)';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(px, py - s * .5 + bob);
      x.lineTo(px - s * .22, py - s * .92 + bob);
      x.lineTo(px + s * .22, py - s * .92 + bob);
      x.closePath();
      x.fill(); x.stroke();
    }
    /* first-problem callout: a labelled arrow pinned to the troubled machine */
    if (U.callout){
      const [px, py] = R.worldToScreen(U.callout.x, U.callout.y);
      const bob = Math.sin(time * 4.5) * s * .1;
      x.fillStyle = '#ff9a7a';
      x.strokeStyle = 'rgba(0,0,0,.55)';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(px, py - s * .28 + bob);
      x.lineTo(px - s * .2, py - s * .66 + bob);
      x.lineTo(px + s * .2, py - s * .66 + bob);
      x.closePath();
      x.fill(); x.stroke();
      x.font = `600 ${Math.max(11, s * .3)}px ${'Rubik, sans-serif'}`;
      const tw = x.measureText(U.callout.text).width;
      const bx = px - tw / 2 - 7, by = py - s * .66 + bob - Math.max(20, s * .5);
      x.fillStyle = 'rgba(14,18,26,.92)';
      x.strokeStyle = 'rgba(255,154,122,.6)';
      x.lineWidth = 1;
      rrect(x, bx, by, tw + 14, Math.max(17, s * .4), 5);
      x.fill(); x.stroke();
      x.fillStyle = '#ffc4b0';
      x.textAlign = 'left'; x.textBaseline = 'middle';
      x.fillText(U.callout.text, bx + 7, by + Math.max(17, s * .4) / 2 + 1);
    }
  }

  /* cinematic light flood */
  if (R.cine){
    const t = R.cine.t;
    const c = S.core;
    const [ccx, ccy] = R.worldToScreen(c.x + c.w / 2, c.y + c.h / 2);
    // rays
    if (t > 1){
      const rayA = clamp((t - 1) / 3, 0, 1);
      x.save();
      x.translate(ccx, ccy);
      x.rotate(time * .3);
      for (let i = 0; i < 14; i++){
        x.rotate(Math.PI * 2 / 14);
        const len = Math.max(R.W, R.H) * rayA;
        const gr = x.createLinearGradient(0, 0, len, 0);
        gr.addColorStop(0, `rgba(255,230,170,${.32 * rayA})`);
        gr.addColorStop(1, 'rgba(255,230,170,0)');
        x.fillStyle = gr;
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(len, -len * .05);
        x.lineTo(len, len * .05);
        x.closePath();
        x.fill();
      }
      x.restore();
    }
    // growing core glow → white flood
    const glowR = Math.max(R.W, R.H) * clamp((t - 1.5) / 5.5, 0, 1.2);
    if (glowR > 0){
      const gg = x.createRadialGradient(ccx, ccy, 0, ccx, ccy, Math.max(1, glowR));
      gg.addColorStop(0, 'rgba(255,246,221,.95)');
      gg.addColorStop(.6, 'rgba(255,220,150,.55)');
      gg.addColorStop(1, 'rgba(255,220,150,0)');
      x.fillStyle = gg;
      x.fillRect(0, 0, R.W, R.H);
    }
    if (t > 6){
      x.fillStyle = `rgba(255,250,240,${clamp((t - 6) / 1.6, 0, 1)})`;
      x.fillRect(0, 0, R.W, R.H);
    }
  }

  /* subtle vignette */
  const vg = x.createRadialGradient(R.W / 2, R.H / 2, Math.min(R.W, R.H) * .42, R.W / 2, R.H / 2, Math.max(R.W, R.H) * .75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(4,6,10,.42)');
  x.fillStyle = vg;
  x.fillRect(0, 0, R.W, R.H);

  x.restore();
};

function zOf(e){
  if (e.kind === 'belt' || e.kind === 'pipe') return 0;
  if (e.kind === 'ubelt' || e.kind === 'splitter') return 1;
  if (e.kind === 'pole') return 2.5;   // masts overlap neighbours gracefully
  if (e.kind === 'core') return 3;
  return 2;
}
function lodColor(e){
  switch (e.kind){
    case 'belt': case 'ubelt': case 'splitter': return '#2a3140';
    case 'pipe': return '#3a4250';
    case 'miner': return '#8a6a3a';
    case 'machine': return '#46536a';
    case 'gen': case 'turbine': case 'solar': return '#7a6c3a';
    case 'pole': return '#5a6472';
    case 'chest': return '#5d5344';
    case 'pump': return '#3a5a44';
    default: return '#444';
  }
}

/* ==================================================================== */
/* TITLE BACKGROUND FX                                                  */
/* ==================================================================== */
R.titleFx = function(canvas, dt, t){
  const x = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth || root.innerWidth;
  const h = canvas.height = canvas.clientHeight || root.innerHeight;
  x.fillStyle = '#0e1219';
  x.fillRect(0, 0, w, h);
  // ember field
  const N = 60;
  for (let i = 0; i < N; i++){
    const seed = i * 127.31;
    const px = ((seed * 7.13 + t * (6 + (i % 5) * 3)) % (w + 60)) - 30;
    const py = h - (((seed * 13.7 + t * (14 + (i % 7) * 5)) % (h + 80)) - 40);
    const a = .12 + .1 * Math.sin(t * 2 + i);
    x.fillStyle = i % 3 === 0 ? `rgba(255,180,84,${a})` : `rgba(255,214,138,${a * .7})`;
    x.beginPath();
    x.arc(px, py, 1 + (i % 3), 0, 7);
    x.fill();
  }
  // forge glow at the bottom
  const g = x.createRadialGradient(w / 2, h + 120, 0, w / 2, h + 120, h * .8);
  g.addColorStop(0, 'rgba(255,150,60,.25)');
  g.addColorStop(1, 'rgba(255,150,60,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
};

})(typeof window !== 'undefined' ? window : globalThis);
