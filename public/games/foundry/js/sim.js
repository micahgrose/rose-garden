/* ============ Foundry — simulation: worldgen, placement, tick, save/load ============
   Entirely DOM-free: operates on the state object from F.newState().
   The renderer and UI observe state; the headless harness drives this directly. */
(function(root){
'use strict';
const F = root.F;
const { DX, DY, OPP, clamp } = F;

/* world-gen versions: v1 = original 128² (kept so old saves regenerate
   identically); v2 = 160² with wider ore rings; v3 = 224² with the rings
   pushed far apart and LAKES — open water only platforms can bridge */
const GEN = {
  1: { size: 128 },
  2: { size: 160 },
  3: { size: 224 },
};
const GEN_CURRENT = 3;
const CORE_SIZE = 4;
F.CORE_SIZE = CORE_SIZE;

const idx = (S, x, y) => y * S.w + x;
F.tileIdx = idx;
F.inMap = (S, x, y) => x >= 0 && y >= 0 && x < S.w && y < S.h;
F.entAt = (S, x, y) => F.inMap(S, x, y) ? S.grid[idx(S, x, y)] : null;

/* ==================================================================== */
/* WORLD GENERATION                                                     */
/* ==================================================================== */

function paintBlob(S, rng, cx, cy, type, count, richLo, richHi){
  let painted = 0, guard = count * 30;
  let x = cx, y = cy;
  const stack = [[cx, cy]];
  while (painted < count && guard-- > 0){
    if (F.inMap(S, x, y)){
      const i = idx(S, x, y);
      if (S.oreType[i] === 0 && !S.grid[i] && !S.water[i]){
        S.oreType[i] = type;
        S.oreAmt[i] = rng.int(richLo, richHi);
        painted++;
        stack.push([x, y]);
      }
    }
    // random-walk from a random painted cell → organic clumps
    const b = stack[Math.floor(rng() * stack.length)];
    const d = Math.floor(rng() * 4);
    x = b[0] + DX[d]; y = b[1] + DY[d];
  }
  return painted;
}

function placePatch(S, rng, distLo, distHi, type, count, richLo, richHi){
  const ccx = S.w / 2, ccy = S.h / 2;
  for (let tries = 0; tries < 40; tries++){
    const a = rng() * Math.PI * 2;
    const d = distLo + rng() * (distHi - distLo);
    const cx = Math.round(ccx + Math.cos(a) * d);
    const cy = Math.round(ccy + Math.sin(a) * d);
    if (!F.inMap(S, cx, cy) || cx < 3 || cy < 3 || cx > S.w-4 || cy > S.h-4) continue;
    if (S.oreType[idx(S, cx, cy)] !== 0 || S.water[idx(S, cx, cy)]) continue;
    if (paintBlob(S, rng, cx, cy, type, count, richLo, richHi) > count * .5) return true;
  }
  return false;
}

F.genWorld = function(S){
  const rng = F.makeRng(S.seed);
  const size = (GEN[S.genVer] || GEN[GEN_CURRENT]).size;
  S.w = size; S.h = size;
  S.ground = new Uint8Array(S.w * S.h);
  S.oreType = new Uint8Array(S.w * S.h);
  S.oreAmt = new Float64Array(S.w * S.h);
  S.water = new Uint8Array(S.w * S.h);      // 1 = open water (v3+ worlds)
  S.platform = new Uint8Array(S.w * S.h);   // 1 = decked over, buildable
  S.grid = new Array(S.w * S.h).fill(null);

  for (let i = 0; i < S.ground.length; i++) S.ground[i] = Math.floor(rng() * 6);

  // the Core first, so no ore spawns beneath it
  const cx = (S.w - CORE_SIZE) >> 1, cy = (S.h - CORE_SIZE) >> 1;
  const core = { id: S.nextId++, key:'core', kind:'core', x:cx, y:cy, w:CORE_SIZE, h:CORE_SIZE, dir:0, pulse:0 };
  S.ents.push(core); S.core = core;
  stamp(S, core);

  if (S.genVer === 1){
    /* v1 layout — MUST stay byte-identical so old saves line up */
    placePatch(S, rng, 9, 15, 1, rng.int(30, 40), 350, 700);
    placePatch(S, rng, 9, 16, 1, rng.int(24, 32), 300, 600);
    placePatch(S, rng, 9, 16, 2, rng.int(26, 34), 350, 700);
    placePatch(S, rng, 8, 15, 3, rng.int(24, 32), 350, 700);
    placePatch(S, rng, 8, 15, 4, rng.int(22, 30), 350, 700);
    placePatch(S, rng, 12, 19, 2, rng.int(18, 26), 300, 600);
    placePatch(S, rng, 25, 36, 5, rng.int(26, 36), 1200, 2400);
    placePatch(S, rng, 25, 38, 5, rng.int(20, 30), 1200, 2400);
    placePatch(S, rng, 24, 38, 1, rng.int(34, 48), 1400, 2800);
    placePatch(S, rng, 24, 38, 2, rng.int(30, 42), 1400, 2800);
    placePatch(S, rng, 24, 38, 3, rng.int(30, 44), 1400, 2800);
    placePatch(S, rng, 26, 40, 4, rng.int(24, 34), 1200, 2400);
    placePatch(S, rng, 46, 58, 6, rng.int(28, 40), 3000, 6000);
    placePatch(S, rng, 46, 58, 6, rng.int(22, 32), 3000, 6000);
    placePatch(S, rng, 44, 58, 7, rng.int(10, 16), 20000, 30000);
    placePatch(S, rng, 44, 58, 7, rng.int(8, 14), 20000, 30000);
    placePatch(S, rng, 44, 60, 1, rng.int(50, 70), 4000, 8000);
    placePatch(S, rng, 44, 60, 2, rng.int(40, 60), 4000, 8000);
    placePatch(S, rng, 44, 60, 3, rng.int(40, 60), 4000, 8000);
    placePatch(S, rng, 46, 60, 5, rng.int(30, 44), 3000, 6000);
    /* chromite — APPENDED after every original call so the RNG stream (and
       therefore the original patch layout) stays byte-identical; existing
       saves simply grow new deposits on empty ground */
    placePatch(S, rng, 30, 44, 8, rng.int(16, 24), 1500, 3000);
    placePatch(S, rng, 46, 60, 8, rng.int(22, 32), 4000, 8000);
    return;
  }

  if (S.genVer === 2){
  /* v2 layout — 160² world, ore rings spread wider apart.
     MUST stay byte-identical so v2 saves regenerate correctly. */

  /* near field — the starter kit (10..22 tiles out) */
  placePatch(S, rng, 11, 18, 1, rng.int(34, 46), 350, 700);   // iron
  placePatch(S, rng, 11, 19, 1, rng.int(26, 36), 300, 600);   // iron 2
  placePatch(S, rng, 11, 19, 2, rng.int(28, 38), 350, 700);   // copper
  placePatch(S, rng, 10, 18, 3, rng.int(26, 36), 350, 700);   // coal
  placePatch(S, rng, 10, 18, 4, rng.int(24, 34), 350, 700);   // stone
  placePatch(S, rng, 14, 22, 2, rng.int(20, 28), 300, 600);   // copper 2

  /* mid ring — expansion (32..52) */
  placePatch(S, rng, 33, 46, 5, rng.int(28, 40), 1200, 2400); // quartz
  placePatch(S, rng, 33, 50, 5, rng.int(22, 32), 1200, 2400); // quartz 2
  placePatch(S, rng, 32, 50, 1, rng.int(38, 54), 1400, 2800); // iron
  placePatch(S, rng, 32, 50, 2, rng.int(34, 46), 1400, 2800); // copper
  placePatch(S, rng, 32, 50, 3, rng.int(34, 48), 1400, 2800); // coal
  placePatch(S, rng, 34, 52, 4, rng.int(26, 38), 1200, 2400); // stone
  placePatch(S, rng, 36, 52, 1, rng.int(30, 42), 1400, 2800); // iron 2

  /* far ring — the last age (56..76) */
  placePatch(S, rng, 58, 72, 6, rng.int(30, 44), 3000, 6000); // titanium
  placePatch(S, rng, 58, 72, 6, rng.int(24, 36), 3000, 6000); // titanium 2
  placePatch(S, rng, 56, 72, 7, rng.int(10, 16), 20000, 30000); // oil
  placePatch(S, rng, 56, 72, 7, rng.int(8, 14), 20000, 30000);  // oil 2
  placePatch(S, rng, 58, 74, 7, rng.int(8, 14), 20000, 30000);  // oil 3
  placePatch(S, rng, 58, 74, 1, rng.int(54, 76), 4000, 8000);  // rich iron
  placePatch(S, rng, 58, 74, 2, rng.int(44, 64), 4000, 8000);  // rich copper
  placePatch(S, rng, 58, 74, 3, rng.int(44, 64), 4000, 8000);  // rich coal
  placePatch(S, rng, 60, 76, 5, rng.int(32, 46), 3000, 6000);  // rich quartz
  placePatch(S, rng, 60, 76, 4, rng.int(26, 38), 3000, 6000);  // rich stone

  /* chromite — APPENDED after every original call so the RNG stream (and
     therefore the original patch layout) stays byte-identical; existing
     saves simply grow new deposits on empty ground */
  placePatch(S, rng, 36, 52, 8, rng.int(18, 26), 1500, 3000);  // chromite (mid)
  placePatch(S, rng, 58, 76, 8, rng.int(24, 36), 4000, 8000);  // chromite (far)
  return;
  }

  /* v3 layout — 224² world: lakes first (ore avoids water), then the ore
     rings pushed far apart so every age is a real expedition */

  /* lakes — amoeba blobs of open water; only platforms make them buildable */
  const nLakes = rng.int(8, 12);
  for (let l = 0; l < nLakes; l++){
    const a = rng() * Math.PI * 2;
    const d = 22 + rng() * 76;
    paintLake(S, rng,
      Math.round(S.w / 2 + Math.cos(a) * d),
      Math.round(S.h / 2 + Math.sin(a) * d),
      rng.int(50, 160));
  }
  fillWaterIslands(S);   // drunk-walk blobs (and near-touching lakes) can leave dry pockets — drown them

  /* near field — the starter kit (12..24 tiles out) */
  placePatch(S, rng, 13, 21, 1, rng.int(34, 46), 350, 700);   // iron
  placePatch(S, rng, 13, 22, 1, rng.int(26, 36), 300, 600);   // iron 2
  placePatch(S, rng, 13, 22, 2, rng.int(28, 38), 350, 700);   // copper
  placePatch(S, rng, 12, 21, 3, rng.int(26, 36), 350, 700);   // coal
  placePatch(S, rng, 12, 21, 4, rng.int(24, 34), 350, 700);   // stone
  placePatch(S, rng, 16, 24, 2, rng.int(20, 28), 300, 600);   // copper 2

  /* mid ring — expansion (46..68) */
  placePatch(S, rng, 47, 62, 5, rng.int(28, 40), 1200, 2400); // quartz
  placePatch(S, rng, 47, 66, 5, rng.int(22, 32), 1200, 2400); // quartz 2
  placePatch(S, rng, 46, 66, 1, rng.int(40, 56), 1400, 2800); // iron
  placePatch(S, rng, 46, 66, 2, rng.int(36, 48), 1400, 2800); // copper
  placePatch(S, rng, 46, 66, 3, rng.int(36, 50), 1400, 2800); // coal
  placePatch(S, rng, 48, 68, 4, rng.int(26, 38), 1200, 2400); // stone
  placePatch(S, rng, 50, 68, 1, rng.int(30, 44), 1400, 2800); // iron 2
  placePatch(S, rng, 50, 68, 3, rng.int(26, 38), 1400, 2800); // coal 2
  placePatch(S, rng, 50, 68, 8, rng.int(18, 26), 1500, 3000); // chromite

  /* far ring — the last age (82..104) */
  placePatch(S, rng, 84, 100, 6, rng.int(32, 46), 3000, 6000); // titanium
  placePatch(S, rng, 84, 100, 6, rng.int(26, 38), 3000, 6000); // titanium 2
  placePatch(S, rng, 82, 100, 7, rng.int(10, 16), 20000, 30000); // oil
  placePatch(S, rng, 82, 100, 7, rng.int(8, 14), 20000, 30000);  // oil 2
  placePatch(S, rng, 84, 102, 7, rng.int(8, 14), 20000, 30000);  // oil 3
  placePatch(S, rng, 84, 102, 1, rng.int(56, 80), 4000, 8000);  // rich iron
  placePatch(S, rng, 84, 102, 2, rng.int(46, 66), 4000, 8000);  // rich copper
  placePatch(S, rng, 84, 102, 3, rng.int(46, 66), 4000, 8000);  // rich coal
  placePatch(S, rng, 86, 104, 5, rng.int(32, 46), 3000, 6000);  // rich quartz
  placePatch(S, rng, 86, 104, 4, rng.int(26, 38), 3000, 6000);  // rich stone
  placePatch(S, rng, 84, 104, 8, rng.int(26, 38), 4000, 8000);  // chromite (far)
};

/* random-walk water blob; keeps a dry ring around the Core and off map edges */
function paintLake(S, rng, cx, cy, count){
  const ccx = S.w / 2, ccy = S.h / 2;
  let painted = 0, guard = count * 30;
  let x = cx, y = cy;
  const stack = [[cx, cy]];
  while (painted < count && guard-- > 0){
    if (x > 2 && y > 2 && x < S.w - 3 && y < S.h - 3 &&
        Math.hypot(x + .5 - ccx, y + .5 - ccy) > 14){
      const i = idx(S, x, y);
      if (!S.water[i] && !S.grid[i]){ S.water[i] = 1; painted++; stack.push([x, y]); }
    }
    const b = stack[Math.floor(rng() * stack.length)];
    const d = Math.floor(rng() * 4);
    x = b[0] + DX[d]; y = b[1] + DY[d];
  }
}

/* the drunk-walk blob (and near-touching lakes) can leave dry pockets wholly
   ringed by water — flood land connectivity in from the map border (always
   dry — lakes stay 3+ tiles off every edge) and drown anything that never
   reaches out, i.e. every landlocked "island" */
function fillWaterIslands(S){
  const seen = new Uint8Array(S.w * S.h);
  const stack = [];
  const push = (x, y) => {
    const i = idx(S, x, y);
    if (seen[i] || S.water[i]) return;
    seen[i] = 1; stack.push([x, y]);
  };
  for (let x = 0; x < S.w; x++){ push(x, 0); push(x, S.h - 1); }
  for (let y = 0; y < S.h; y++){ push(0, y); push(S.w - 1, y); }
  while (stack.length){
    const [x, y] = stack.pop();
    if (x > 0) push(x - 1, y);
    if (x < S.w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < S.h - 1) push(x, y + 1);
  }
  for (let i = 0; i < S.water.length; i++) if (!S.water[i] && !seen[i]) S.water[i] = 1;
}

function stamp(S, e){
  for (let j = 0; j < e.h; j++) for (let i = 0; i < e.w; i++)
    S.grid[idx(S, e.x + i, e.y + j)] = e;
}
function unstamp(S, e){
  for (let j = 0; j < e.h; j++) for (let i = 0; i < e.w; i++)
    S.grid[idx(S, e.x + i, e.y + j)] = null;
}

F.newGame = function(seed, genVer){
  const S = F.newState(seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed);
  S.genVer = genVer || GEN_CURRENT;
  F.genWorld(S);
  S.msProg = {};
  S.powerDirty = true;
  return S;
};

/* ==================================================================== */
/* PLACEMENT                                                            */
/* ==================================================================== */

F.buildingUnlocked = (S, key) => !!S.unlocked[key];
F.recipeUnlocked = (S, key) => !!S.unlocked['r:' + key];
// hard materials need hard machines: a recipe's minTier must not exceed the
// machine's tier (titanium → plasma forge+, chrome → chrome furnace, …)
F.recipeFits = (def, rk) => ((F.RECIPES[rk].minTier || 1) <= (def.tier || 1));

F.canPlace = function(S, key, x, y, dir){
  const def = F.BUILDINGS[key];
  if (!def || !S.unlocked[key]) return { ok:false, why:'locked' };
  if (!F.inMap(S, x, y) || !F.inMap(S, x + def.w - 1, y + def.h - 1)) return { ok:false, why:'out of bounds' };
  if (def.kind === 'platform'){
    const t = idx(S, x, y);
    if (!S.water[t]) return { ok:false, why:'platforms go on open water' };
    if (S.platform[t]) return { ok:false, why:'occupied' };
    if (!F.canAfford(S, def.cost)) return { ok:false, why:'cost' };
    return { ok:true };
  }
  let ore = 0, oil = 0;
  for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++){
    const t = idx(S, x + i, y + j);
    if (S.grid[t]) return { ok:false, why:'occupied' };
    if (S.water[t] && !S.platform[t]) return { ok:false, why:'open water — needs a platform' };
    if (S.oreType[t] === F.OIL_TYPE && S.oreAmt[t] > 0) oil++;
    else if (S.oreType[t] !== 0 && S.oreAmt[t] > 0) ore++;
  }
  if (def.kind === 'miner' && ore < 1) return { ok:false, why:'needs an ore deposit' };
  if (def.kind === 'pump' && oil < 1) return { ok:false, why:'needs an oil seep' };
  if (def.kind !== 'pump' && oil > 0) return { ok:false, why:'blocked by oil seep' };
  if (!F.canAfford(S, F.buildCost(S, key))) return { ok:false, why:'cost' };
  return { ok:true };
};

F.place = function(S, key, x, y, dir, free){
  const chk = F.canPlace(S, key, x, y, dir);
  if (!chk.ok) return null;
  const price = F.buildCost(S, key);
  if (!free && !F.pay(S, price)) return null;
  const def = F.BUILDINGS[key];
  if (def.kind === 'platform'){
    // platforms are tile FLAGS, not entities: the deck becomes the ground,
    // and whatever is built on it owns the grid cell
    S.platform[idx(S, x, y)] = 1;
    F.emit(S, { type:'place', key, x, y });
    return { key, kind:'platform', x, y, w:1, h:1, dir:0, platform:true };
  }
  const e = { id: S.nextId++, key, kind: def.kind, x, y, w: def.w, h: def.h, dir: dir & 3 };
  if (!free) e.paid = price;   // refund exactly what was paid, prices drift
  initEnt(S, e, def);
  S.ents.push(e);
  stamp(S, e);
  if (def.kind === 'ubelt') linkTunnel(S, e, def);
  S.powerDirty = true;
  F.emit(S, { type:'place', key, x, y });
  return e;
};

function initEnt(S, e, def){
  switch (def.kind){
    case 'belt':     e.item = null; e.t = 0; e.srcDir = e.dir; break;
    case 'ubelt':    e.item = null; e.t = 0; e.srcDir = e.dir; e.linkId = 0; e.isExit = false; e.transit = []; break;
    case 'splitter': e.item = null; e.t = 0; e.srcDir = e.dir; e.outIdx = 0;
                     e.exPrio = { left:0, front:0, right:0 };          // 1 = first pick … 3 = last; 0 = round-robin
                     e.exFilt = { left:null, front:null, right:null };
                     e.exBlock = { left:false, front:false, right:false }; // blocked exits skip distribution
                     e.exRatio = { left:1, front:1, right:1 };         // weight-based split
                     break;
    case 'chest':    e.store = {}; e.total = 0; break;
    case 'port':     e.store = {}; e.total = 0; e.mode = null; e.portItem = null; e.drones = []; break;
    case 'pipe':     e.fluid = 0; break;
    case 'tank':     e.fluid = 0; break;
    case 'miner':    e.prog = 0; e.outBuf = {}; e.outTotal = 0; e.fuelT = 0; e.fuelBuf = 0; e.ema = 0; e.lastOut = -1;
                     e.mods = []; e.prodAcc = 0; break;
    case 'machine':  e.recipe = null; e.prog = 0; e.crafting = false; e.inBuf = {}; e.outBuf = {}; e.outTotal = 0;
                     e.fuelT = 0; e.fuelBuf = 0; e.tank = 0; e.ema = 0; e.lastOut = -1;
                     e.mods = []; e.prodAcc = 0;
                     if (def.fam === 'refinery') e.recipe = null;
                     break;
    case 'beacon':   e.mods = []; break;
    case 'lab':      e.inBuf = {}; e.outBuf = {}; e.outTotal = 0; e.prog = 0; e.workItem = null; break;
    case 'gen':      e.fuelT = 0; e.fuelBuf = 0; e.load = 0; break;
    case 'acc':      e.charge = 0; e.flow = 0; break;
    case 'turbine':  e.fuelT = 0; e.fuelBuf = 0; e.load = 0; break;
    case 'solar':    break;
    case 'pole':     e.links = []; e.netId = 0; break;
    case 'pump':     e.tank = 0; e.prog = 0; break;
  }
}

function linkTunnel(S, e, def){
  // look BEHIND for an unlinked entrance facing us → we are its exit;
  // else look AHEAD for an unlinked ubelt facing same dir → we are the entrance.
  for (let d = 1; d <= def.span; d++){
    const b = F.entAt(S, e.x - DX[e.dir] * d, e.y - DY[e.dir] * d);
    if (b && b.kind === 'ubelt' && b.dir === e.dir && !b.linkId && !b.isExit && F.BUILDINGS[b.key].span >= d){
      b.linkId = e.id; e.isExit = true; e.linkId = b.id; return;
    }
  }
  for (let d = 1; d <= def.span; d++){
    const b = F.entAt(S, e.x + DX[e.dir] * d, e.y + DY[e.dir] * d);
    if (b && b.kind === 'ubelt' && b.dir === e.dir && !b.linkId && !b.isExit && F.BUILDINGS[e.key].span >= d){
      e.linkId = b.id; b.isExit = true; b.linkId = e.id; return;
    }
  }
}

F.entById = (S, id) => S.ents.find(e => e.id === id) || null;

/* lift a platform deck back out of the water — only once the tile is clear */
F.removePlatform = function(S, x, y){
  if (!F.inMap(S, x, y)) return false;
  const t = idx(S, x, y);
  if (!S.platform[t] || S.grid[t]) return false;
  S.platform[t] = 0;
  F.refund(S, F.BUILDINGS.platform.cost);
  F.emit(S, { type:'remove', key:'platform', x, y });
  return true;
};

F.remove = function(S, x, y){
  const e = F.entAt(S, x, y);
  if (!e || e.kind === 'core') return null;
  const def = F.BUILDINGS[e.key];
  if (e.broken){
    // scrapping a wreck returns NOTHING — no refund, contents lost with it.
    // Each slotted module gets a coin-flip chance to be pried out intact.
    e._salvaged = 0;
    if (e.mods) for (const m of e.mods)
      if (Math.random() < .5){ F.invAdd(S, m, 1); e._salvaged++; }
  } else {
    F.refund(S, e.paid || def.cost);
    // return contained items
    const give = (o) => { for (const k in o) if (o[k] > 0) F.invAdd(S, k, Math.floor(o[k])); };
    if (e.inBuf) give(e.inBuf);
    if (e.outBuf) give(e.outBuf);
    if (e.store) give(e.store);
    if (e.item) F.invAdd(S, e.item, 1);
    if (e.mods) for (const m of e.mods) F.invAdd(S, m, 1);
    if (e.drones) for (const d of e.drones) if (d.cargo > 0 && d.item) F.invAdd(S, d.item, d.cargo);
    if (e.workItem){
      // a lab mid-consume: hand the pack back and release its reservation
      F.invAdd(S, e.workItem, 1);
      if (S.research.resv[e.workItem]) S.research.resv[e.workItem]--;
    }
    if (e.fuelBuf) F.invAdd(S, e.kind === 'turbine' ? 'fuelCell' : 'coal', e.fuelBuf);
    if (e.transit) for (const tr of e.transit) F.invAdd(S, tr.item, 1);
  }
  if (e.kind === 'ubelt' && e.linkId){
    const other = F.entById(S, e.linkId);
    if (other){ other.linkId = 0; other.isExit = false; }
  }
  unstamp(S, e);
  S.ents.splice(S.ents.indexOf(e), 1);
  S.powerDirty = true;
  F.emit(S, { type:'remove', key: e.key, x, y });
  return e;
};

/* ==================================================================== */
/* POWER NETWORKS (poles carry power from generators to machines)      */
/* ==================================================================== */

function poleCovers(p, e){
  const c = F.BUILDINGS[p.key].cover;
  return !(e.x > p.x + c || e.x + e.w - 1 < p.x - c ||
           e.y > p.y + c || e.y + e.h - 1 < p.y - c);
}
F.poleCovers = poleCovers;

F.computePowerNetworks = function(S){
  const poles = [];
  for (const e of S.ents){
    if (e.kind === 'pole'){ e.links = []; e.netId = 0; poles.push(e); }
  }
  // wire poles together: within the larger of the two reaches
  for (let i = 0; i < poles.length; i++){
    const a = poles[i], ra = F.BUILDINGS[a.key].reach;
    for (let j = i + 1; j < poles.length; j++){
      const b = poles[j], rb = F.BUILDINGS[b.key].reach;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d <= Math.max(ra, rb)){
        a.links.push(b.id);
        b.links.push(a.id);
      }
    }
  }
  // flood networks
  let nid = 0;
  const byId = new Map(poles.map(p => [p.id, p]));
  for (const p of poles){
    if (p.netId) continue;
    nid++;
    const stack = [p];
    p.netId = nid;
    while (stack.length){
      const cur = stack.pop();
      for (const lid of cur.links){
        const o = byId.get(lid);
        if (o && !o.netId){ o.netId = nid; stack.push(o); }
      }
    }
  }
  S.netCount = nid;
  // attach every producer/consumer to the first covering pole's network
  for (const e of S.ents){
    if (e.kind === 'pole') continue;
    const def = F.BUILDINGS[e.key];
    if (!def) continue;
    if (e.kind === 'gen' || e.kind === 'turbine' || e.kind === 'solar' || e.kind === 'acc' || def.power){
      e.netId = 0;
      for (const p of poles){
        if (p.netId && poleCovers(p, e)){ e.netId = p.netId; break; }
      }
    }
  }
  // beacon auras: cache which beacons bathe which machines (geometry only —
  // strength is read live so slotting modules needs no rebuild)
  for (const e of S.ents) if (F.MODDABLE(e)) e._bcn = null;
  for (const b of S.ents){
    if (b.kind !== 'beacon') continue;
    const r = F.BUILDINGS[b.key].range;
    for (const e of S.ents){
      if (!F.MODDABLE(e)) continue;
      if (e.x > b.x + b.w - 1 + r || e.x + e.w - 1 < b.x - r ||
          e.y > b.y + b.h - 1 + r || e.y + e.h - 1 < b.y - r) continue;
      (e._bcn || (e._bcn = [])).push(b);
    }
  }
};

/* ==================================================================== */
/* ITEM INSERTION (belt → target)                                       */
/* ==================================================================== */

/* Can `target` accept `item` pushed from world-direction `fromDir`
   (the direction of travel)? If yes, consume it. */
F.tryInsert = function(S, target, item, fromDir, t0){
  if (!target) return false;
  if (target.broken) return false;   // dead machines eat nothing
  switch (target.kind){
    case 'belt':
      if (target.item) return false;
      if (fromDir === OPP(target.dir)) return false;          // no head-on pushes
      target.item = item; target.t = t0 || 0; target.srcDir = fromDir;
      return true;
    case 'splitter':
      if (target.item) return false;
      if (fromDir === OPP(target.dir)) return false;          // not through the face
      target.item = item; target.t = t0 || 0; target.srcDir = fromDir;
      return true;
    case 'ubelt':
      if (target.isExit || target.item) return false;
      if (fromDir !== target.dir) return false;               // enter straight only
      target.item = item; target.t = t0 || 0; target.srcDir = fromDir;
      return true;
    case 'chest': {
      const cdef = F.BUILDINGS[target.key];
      // tar goes ONLY into the tar pit — and the pit takes nothing else
      if ((item === 'tar') !== !!cdef.tarOnly) return false;
      const cap = (cdef.cap || F.CHEST_CAP) + (cdef.tarOnly ? 0 : F.upRank(S, 'capacitors') * 20);
      if (target.total >= cap) return false;
      target.store[item] = (target.store[item] || 0) + 1; target.total++;
      return true;
    }
    case 'core':
      if (item === 'tar') return false;   // the Core will not drink tar — process it
      deliverToCore(S, item);
      return true;
    case 'miner': case 'gen':
      // only burners take coal — electric machines run on the grid, full stop
      if (item !== 'coal') return false;
      if (target.kind === 'miner' && !F.BUILDINGS[target.key].fuel) return false;
      if (target.fuelBuf >= F.fuelCap(S)) return false;
      target.fuelBuf++; return true;
    case 'turbine':
      if (item !== 'fuelCell' || target.fuelBuf >= F.fuelCap(S)) return false;
      target.fuelBuf++; return true;
    case 'lab':
      if (!F.PACKS.includes(item)) return false;
      if ((target.inBuf[item] || 0) >= F.LAB_BUF) return false;
      target.inBuf[item] = (target.inBuf[item] || 0) + 1; return true;
    case 'port':
      // only providers take belt input, and only their configured item
      if (item === 'tar') return false;   // drones won't touch the stuff
      if (target.mode !== 'provide' || item !== target.portItem) return false;
      if (target.total >= F.BUILDINGS[target.key].cap) return false;
      target.store[item] = (target.store[item] || 0) + 1; target.total++;
      return true;
    case 'machine':
      return machineAccept(S, target, item);
    default:
      return false;
  }
};

function machineAccept(S, m, item){
  const def = F.BUILDINGS[m.key];
  const cap = 2; // buffer holds cap × recipe need (+capacitor bonus)
  // ingredients first — coal that a recipe needs must never be eaten as fuel
  if (F.AUTO_RECIPES[def.fam]){
    // accept anything belonging to an unlocked auto recipe
    let need = 0;
    for (const rk of F.AUTO_RECIPES[def.fam]){
      if (!F.recipeUnlocked(S, rk)) continue;
      if (!F.recipeFits(def, rk)) continue;   // too weak a machine for this material
      const r = F.RECIPES[rk];
      if (r.in[item]) need = Math.max(need, r.in[item]);
    }
    if (need){
      const lim = need * cap + F.bufBonus(S) + (def.fam === 'alloy' ? 2 : 0);
      if ((m.inBuf[item] || 0) < lim){ m.inBuf[item] = (m.inBuf[item] || 0) + 1; return true; }
    }
  } else {
    // asm / refinery: only the chosen recipe's ingredients — and only if this
    // machine is strong enough to actually run it
    const r = m.recipe && F.RECIPES[m.recipe];
    if (r && F.recipeFits(def, m.recipe) && r.in[item]){
      const lim = r.in[item] * cap + F.bufBonus(S);
      if ((m.inBuf[item] || 0) < lim){ m.inBuf[item] = (m.inBuf[item] || 0) + 1; return true; }
    }
  }
  // overflow / non-ingredient coal → the firebox (burner machines only)
  if (item === 'coal' && def.fuel && m.fuelBuf < F.fuelCap(S)){
    m.fuelBuf++; return true;
  }
  return false;
}

function deliverToCore(S, item){
  F.invAdd(S, item, 1);
  S.delivered[item] = (S.delivered[item] || 0) + 1;
  const sd = S.stats;
  if (!sd.dAcc) sd.dAcc = {};
  sd.dAcc[item] = (sd.dAcc[item] || 0) + 1;   // feeds the objective's per-minute rate
  const ms = F.MILESTONES[S.msIndex];
  if (ms && ms.req && ms.req[item] && (S.msProg[item] || 0) < ms.req[item]){
    S.msProg[item] = (S.msProg[item] || 0) + 1;
    S.msDirty = true;
  }
  // post-win: deliveries feed the Engine's tribute
  if (S.won && S.tribute && S.tribute.req[item] && (S.tribute.prog[item] || 0) < S.tribute.req[item]){
    S.tribute.prog[item] = (S.tribute.prog[item] || 0) + 1;
    S.tribDirty = true;
  }
  S.core.pulse = 1;
  F.emit(S, { type:'deliver', item });
}

/* ==================================================================== */
/* HAND MINING                                                          */
/* ==================================================================== */

F.handMine = function(S, x, y, dt){
  if (!F.inMap(S, x, y)) return 0;
  const i = idx(S, x, y);
  if (S.grid[i]) return 0;   // a building covers this tile — click selects it instead
  const t = S.oreType[i];
  if (!t || t === F.OIL_TYPE || S.oreAmt[i] <= 0) return 0;
  const key = i;
  if (S.handTile !== key){ S.handTile = key; S.handProg = 0; }
  S.handProg += dt * F.handMul(S) / F.HAND_MINE_TIME;
  if (S.handProg >= 1){
    S.handProg = 0;
    const item = F.ORES[t].id;
    // deposits are endless — mining never drains them
    F.invAdd(S, item, 1);
    S.handMined[item] = (S.handMined[item] || 0) + 1;
    const ms = F.MILESTONES[S.msIndex];
    if (ms && ms.handMine && ms.handMine[item] && (S.msProg[item] || 0) < ms.handMine[item]){
      S.msProg[item] = (S.msProg[item] || 0) + 1;
      S.msDirty = true;
    }
    F.emit(S, { type:'handmine', item, x, y });
    return 2; // completed one
  }
  return 1; // in progress
};

/* ==================================================================== */
/* THE TICK                                                             */
/* ==================================================================== */

function outPort(e){
  // tile just outside the middle of the facing edge
  const d = e.dir;
  let px, py;
  if (d === 0){ px = e.x + ((e.w - 1) >> 1); py = e.y - 1; }
  else if (d === 1){ px = e.x + e.w; py = e.y + ((e.h - 1) >> 1); }
  else if (d === 2){ px = e.x + ((e.w - 1) >> 1); py = e.y + e.h; }
  else { px = e.x - 1; py = e.y + ((e.h - 1) >> 1); }
  return [px, py];
}
F.outPort = outPort;

/* Every perimeter tile of a depot that has a conveyor leading DIRECTLY out of
   it (a belt/tunnel oriented away, or any other acceptor). Returns
   [px, py, outDir] per tile; request-mode depots split their goods evenly
   across all of these. A belt pointing back into the depot is fed-in, not
   led-out, so it's excluded (head-on) — as is a tunnel whose mouth doesn't
   align with the outward push. */
function portOutTiles(S, e){
  const out = [];
  const add = (px, py, od) => {
    const t = F.entAt(S, px, py);
    if (!t || t.broken) return;
    if ((t.kind === 'belt' || t.kind === 'splitter') && od === OPP(t.dir)) return; // pointing in
    if (t.kind === 'ubelt' && (t.isExit || od !== t.dir)) return;                   // misaligned mouth
    out.push([px, py, od]);
  };
  for (let i = 0; i < e.w; i++){ add(e.x + i, e.y - 1, 0); add(e.x + i, e.y + e.h, 2); }
  for (let j = 0; j < e.h; j++){ add(e.x + e.w, e.y + j, 1); add(e.x - 1, e.y + j, 3); }
  return out;
}
F.portOutTiles = portOutTiles;

function tryEject(S, e){
  let any = false;
  for (const k in e.outBuf){
    if (e.outBuf[k] <= 0) continue;
    const [px, py] = outPort(e);
    const tgt = F.entAt(S, px, py);
    if (tgt && F.tryInsert(S, tgt, k, e.dir, 0)){
      e.outBuf[k]--; e.outTotal--;
      if (e.outBuf[k] <= 0) delete e.outBuf[k];
      // output-rate EMA for the info panel
      if (e.lastOut >= 0){
        const gap = Math.max(.05, S.time - e.lastOut);
        e.ema = e.ema ? e.ema * .85 + (1 / gap) * .15 : 1 / gap;
      }
      e.lastOut = S.time;
      any = true;
    }
    break; // one per tick
  }
  return any;
}

function machineCanStart(S, m, def){
  if (m.outTotal >= 6 + F.bufBonus(S)) return false;
  let r = null;
  if (F.AUTO_RECIPES[def.fam]){
    for (const rk of F.AUTO_RECIPES[def.fam]){
      if (!F.recipeUnlocked(S, rk)) continue;
      if (!F.recipeFits(def, rk)) continue;   // too weak a machine for this material
      const rc = F.RECIPES[rk];
      let ok = true;
      for (const k in rc.in) if ((m.inBuf[k] || 0) < rc.in[k]) { ok = false; break; }
      if (ok){ r = rk; break; }
    }
  } else {
    const rk = m.recipe;
    if (rk && F.recipeUnlocked(S, rk) && F.recipeFits(def, rk)){
      const rc = F.RECIPES[rk];
      let ok = true;
      for (const k in rc.in) if ((m.inBuf[k] || 0) < rc.in[k]) { ok = false; break; }
      if (ok && rc.fluid) ok = m.tank >= rc.fluid;
      if (ok) r = rk;
    }
  }
  return r;
}

function famMul(S, fam){
  if (fam === 'smelter' || fam === 'alloy' || fam === 'crusher') return F.smeltMul(S);
  return F.asmMul(S);
}

F.tick = function(S, dt){
  S.tick++;
  S.time += dt;
  // the Sun Anchor (researched toggle) can hold the sky still
  if (!S.sunFrozen) S.dayT = ((S.dayT || 0) + dt) % F.DAY_LEN;
  const ents = S.ents;

  /* ---- pass A: power book-keeping (per pole-network) ---- */
  if (S.powerDirty){ F.computePowerNetworks(S); S.powerDirty = false; }
  const sup = {}, dem = {};
  let unpowered = 0, unpoweredDem = 0;
  const useMul = F.powerUseMul(S), outMul = F.powerMul(S);
  const sun = F.sunFactor(S);
  for (let i = 0; i < ents.length; i++){
    const e = ents[i], def = F.BUILDINGS[e.key];
    if (!def) continue;
    if (e.kind === 'gen' || e.kind === 'turbine'){
      e._fueled = e.fuelT > 0 || e.fuelBuf > 0;
      if (e._fueled && e.netId) sup[e.netId] = (sup[e.netId] || 0) + def.out * outMul;
    } else if (e.kind === 'solar'){
      if (e.netId && sun > 0) sup[e.netId] = (sup[e.netId] || 0) + def.out * outMul * sun;
    } else if (def.power){
      // does it want to work?
      let wants = false;
      if (e.kind === 'miner') wants = minerWants(S, e);
      else if (e.kind === 'pump') wants = e.tank < 30;
      else if (e.kind === 'machine') wants = e.crafting || !!machineCanStart(S, e, def);
      else if (e.kind === 'beacon') wants = !!(e.mods && e.mods.length);
      else if (e.kind === 'lamp') wants = sun < .85;
      else if (e.kind === 'port') wants = !!e.mode;
      if (e.broken) wants = false;   // worn out — draws nothing, does nothing
      e._want = wants;
      if (wants){
        // module power multiplier (beacon field uses last tick's ratio — converges)
        const pm = (e.mods || e._bcn) ? F.modEffects(S, e).pow : 1;
        const draw = def.power * useMul * pm;
        if (e.netId) dem[e.netId] = (dem[e.netId] || 0) + draw;
        else { unpowered++; unpoweredDem += draw; }
      }
    }
  }
  /* accumulators: charge on surplus (raising generator load), discharge to
     cover deficits (raising supply) — evaluated per network */
  const accsByNet = {};
  for (let i = 0; i < ents.length; i++){
    const e = ents[i];
    if (e.kind === 'acc'){
      e.flow = 0;
      if (e.netId) (accsByNet[e.netId] || (accsByNet[e.netId] = [])).push(e);
    }
  }
  for (const nid in accsByNet){
    const s0 = sup[nid] || 0, d0 = dem[nid] || 0;
    if (s0 > d0){
      let surplus = s0 - d0;
      for (const a of accsByNet[nid]){
        if (surplus <= 0) break;
        const take = Math.min(F.ACC_CHARGE, (F.ACC_CAP - a.charge) / dt, surplus);
        if (take > 0){
          a.charge += take * dt;
          a.flow = take;
          dem[nid] = (dem[nid] || 0) + take;
          surplus -= take;
        }
      }
    } else if (d0 > s0){
      let need = d0 - s0;
      for (const a of accsByNet[nid]){
        if (need <= 0) break;
        const give = Math.min(F.ACC_DISCHARGE, a.charge / dt, need);
        if (give > 0){
          a.charge -= give * dt;
          a.flow = -give;
          sup[nid] = (sup[nid] || 0) + give;
          need -= give;
        }
      }
    }
  }

  const ratioByNet = {};
  let totSup = 0, totDem = unpoweredDem, served = 0;
  for (const nid of new Set([...Object.keys(sup), ...Object.keys(dem)])){
    const s0 = sup[nid] || 0, d0 = dem[nid] || 0;
    totSup += s0; totDem += d0; served += Math.min(s0, d0);
    ratioByNet[nid] = d0 > s0 ? (s0 > 0 ? s0 / d0 : 0) : 1;
  }
  S._netRatio = ratioByNet; S._netSupply = sup; S._netDemand = dem;
  S.stats.powerSupply = totSup;
  S.stats.powerDemand = totDem;
  S.stats.powerRatio = totDem > 0 ? served / totDem : 1;
  S.stats.unpowered = unpowered;
  if (S.stats.powerRatio < 0.98 && totDem > 0 && !S.flags.brownout){ S.flags.brownout = true; F.emit(S, { type:'tip', id:'firstBrownout' }); }
  if (unpowered > 0 && !S.flags.unpowered){ S.flags.unpowered = true; F.emit(S, { type:'tip', id:'firstUnpowered' }); }

  /* generators burn according to their own network's load */
  for (let i = 0; i < ents.length; i++){
    const e = ents[i];
    if (e.kind !== 'gen' && e.kind !== 'turbine') continue;
    const def = F.BUILDINGS[e.key];
    if (!e._fueled || !e.netId){ e.load = 0; continue; }
    const s0 = sup[e.netId] || 0, d0 = dem[e.netId] || 0;
    e.load = s0 > 0 ? clamp(d0 / s0, 0, 1) : 0;
    if (e.load > 0){
      e.fuelT -= dt * e.load;
      if (e.fuelT <= 0){
        if (e.fuelBuf > 0){ e.fuelBuf--; e.fuelT += def.burn * F.burnMul(S); }
        else e.fuelT = 0;
      }
    }
  }

  /* ---- pass B: machines ---- */
  const pr = (e, def) => def.power ? (e.netId ? (ratioByNet[e.netId] || 0) : 0) : 1;
  for (let i = 0; i < ents.length; i++){
    const e = ents[i], def = F.BUILDINGS[e.key];
    if (!def) continue;
    switch (e.kind){
      case 'miner': tickMiner(S, e, def, dt, pr(e, def)); break;
      case 'machine': tickMachine(S, e, def, dt, pr(e, def)); break;
      case 'pump': tickPump(S, e, def, dt, pr(e, def)); break;
      case 'chest': tickChest(S, e, dt); break;
      case 'lab': tickLab(S, e, def, dt); break;
      case 'port': tickPort(S, e, def, dt, pr(e, def)); break;
    }
  }

  /* ---- belts / splitters / tunnels ---- */
  for (let i = 0; i < ents.length; i++){
    const e = ents[i];
    if (e.kind === 'belt') tickBelt(S, e, dt);
    else if (e.kind === 'splitter') tickSplitter(S, e, dt);
    else if (e.kind === 'ubelt') tickTunnel(S, e, dt);
  }

  /* ---- pipes ---- */
  tickPipes(S, dt);

  /* ---- core pulse decay + stats buckets ---- */
  if (S.core.pulse > 0) S.core.pulse = Math.max(0, S.core.pulse - dt * 2.4);
  const st = S.stats;
  st.bucketT += dt;
  if (st.bucketT >= 5){
    st.bucketT -= 5;
    st.buckets.push(st.bucketAcc);
    if (st.buckets.length > 60) st.buckets.shift(); // 5-minute window (feeds the stats graphs)
    st.bucketAcc = {};
    if (!st.dbuckets) st.dbuckets = [];
    st.dbuckets.push(st.dAcc || {});                // Core deliveries, same cadence
    if (st.dbuckets.length > 12) st.dbuckets.shift(); // only the last minute matters
    st.dAcc = {};
  }

  /* ---- milestones ---- */
  if (S.msDirty){ S.msDirty = false; checkMilestone(S); }

  /* ---- tribute ---- */
  if (S.tribDirty){
    S.tribDirty = false;
    const tr = S.tribute;
    if (tr){
      let done = true;
      for (const k in tr.req) if ((tr.prog[k] || 0) < tr.req[k]){ done = false; break; }
      if (done){
        tr.lvl++;
        tr.prog = {};
        tr.req = F.makeTribute(tr.lvl);
        F.emit(S, { type:'tribute', lvl: tr.lvl });
      }
    }
  }
};

function minerWants(S, e){
  if (e.outTotal >= 4 + F.bufBonus(S)) return false;
  const i = idx(S, e.x, e.y);
  const t = S.oreType[i];
  if (t === 0 || t === F.OIL_TYPE || S.oreAmt[i] <= 0) return false;
  // hard ores (titanium) need a hard drill — a weaker one sits idle on the seam
  const ore = F.ORES[t], def = F.BUILDINGS[e.key];
  if (ore && (ore.minTier || 1) > (def.tier || 1)) return false;
  return true;
}

/* every finished operation grinds the machine down a little. At the end of
   each (hidden) service stretch — F.lifeOf ops — the machine rolls the dice:
   F.breakChance(e) that it breaks for good (1 in 4, widened by hardened
   modules), otherwise the wear counter resets and it soldiers on. */
function wearDown(S, e, n){
  if (e.broken) return;
  e.ops = (e.ops || 0) + (n || 1);
  const life = F.lifeOf(S, e);
  if (life === Infinity || e.ops < life) return;
  e.ops = 0;   // checkpoint passed either way
  if (Math.random() < F.breakChance(S, e)){
    e.broken = true;
    e.active = false;
    e.crafting = false;
    F.emit(S, { type:'broken', x: e.x, y: e.y, key: e.key });
  }
}

function tickMiner(S, e, def, dt, ratio){
  tryEject(S, e);
  if (e.broken){ e.active = false; return; }
  if (!minerWants(S, e)){ e.active = false; return; }
  const fx = F.modEffects(S, e);
  let mul = def.speed * F.mineMul(S) * fx.spd * F.tributeMul(S);
  if (def.power) mul *= ratio;
  else {
    // burner
    if (e.fuelT <= 0){
      if (e.fuelBuf > 0){ e.fuelBuf--; e.fuelT += F.COAL_BURN * F.burnMul(S); }
      else {
        e.active = false;
        if (!S.flags.fuelLow && S.time > 30){ S.flags.fuelLow = true; F.emit(S, { type:'tip', id:'firstFuelLow' }); }
        return;
      }
    }
    e.fuelT -= dt * F.draftBurn(S);
    mul *= F.draftSpd(S);
  }
  e.active = mul > 0;
  e.prog += dt * mul / def.mineTime;
  if (e.prog >= 1){
    e.prog -= 1;
    const i = idx(S, e.x, e.y);
    const item = F.ORES[S.oreType[i]].id;
    // deposits are endless — drills never exhaust them
    let n = 1;
    if (fx.prod > 0){
      e.prodAcc = (e.prodAcc || 0) + fx.prod;
      if (e.prodAcc >= 1){ e.prodAcc -= 1; n++; }
    }
    e.outBuf[item] = (e.outBuf[item] || 0) + n; e.outTotal += n;
    S.stats.made[item] = (S.stats.made[item] || 0) + n;
    S.stats.bucketAcc[item] = (S.stats.bucketAcc[item] || 0) + n;
    wearDown(S, e, 1);
  }
}

function tickMachine(S, e, def, dt, ratio){
  tryEject(S, e);
  if (e.broken){ e.active = false; return; }
  if (!e.crafting){
    const rk = machineCanStart(S, e, def);
    if (rk){
      const rc = F.RECIPES[rk];
      for (const k in rc.in){ e.inBuf[k] -= rc.in[k]; if (e.inBuf[k] <= 0) delete e.inBuf[k]; }
      if (rc.fluid) e.tank -= rc.fluid;
      e.activeRecipe = rk;
      e.crafting = true; e.prog = 0;
    } else {
      e.active = false;
      if (e.outTotal >= 6 + F.bufBonus(S) && !S.flags.blocked && S.time > 60){
        S.flags.blocked = true; F.emit(S, { type:'tip', id:'firstBlocked' });
      }
      return;
    }
  }
  const rc = F.RECIPES[e.activeRecipe];
  if (!rc){ e.crafting = false; return; }
  const fx = F.modEffects(S, e);
  let mul = def.speed * famMul(S, def.fam) * fx.spd * F.tributeMul(S);
  if (def.power) mul *= ratio;
  else {
    if (e.fuelT <= 0){
      if (e.fuelBuf > 0){ e.fuelBuf--; e.fuelT += F.COAL_BURN * F.burnMul(S); }
      else {
        e.active = false;
        if (!S.flags.fuelLow && S.time > 30){ S.flags.fuelLow = true; F.emit(S, { type:'tip', id:'firstFuelLow' }); }
        return;
      }
    }
    e.fuelT -= dt * F.draftBurn(S);
    mul *= F.draftSpd(S);
  }
  e.active = mul > 0;
  e.prog += dt * mul / rc.time;
  if (e.prog >= 1){
    e.crafting = false; e.prog = 0;
    let outN = rc.outN;
    if (fx.prod > 0){
      // productivity: bank a fraction of every craft, cash in a free one at 100%
      e.prodAcc = (e.prodAcc || 0) + fx.prod;
      if (e.prodAcc >= 1){ e.prodAcc -= 1; outN += rc.outN; }
    }
    e.outBuf[rc.out] = (e.outBuf[rc.out] || 0) + outN; e.outTotal += outN;
    S.stats.made[rc.out] = (S.stats.made[rc.out] || 0) + outN;
    S.stats.bucketAcc[rc.out] = (S.stats.bucketAcc[rc.out] || 0) + outN;
    if (rc.by) for (const bk in rc.by){
      const bn = rc.by[bk];
      e.outBuf[bk] = (e.outBuf[bk] || 0) + bn; e.outTotal += bn;
      S.stats.made[bk] = (S.stats.made[bk] || 0) + bn;
      S.stats.bucketAcc[bk] = (S.stats.bucketAcc[bk] || 0) + bn;
      if (bk === 'tar' && !S.flags.tarSeen){ S.flags.tarSeen = true; F.emit(S, { type:'tip', id:'firstTar' }); }
    }
    F.emit(S, { type:'craft', x: e.x, y: e.y, item: rc.out });
    wearDown(S, e, 1);
  }
}

function tickPump(S, e, def, dt, ratio){
  if (e.broken){ e.active = false; return; }
  // is there oil under the footprint?
  let oil = null;
  for (let j = 0; j < e.h && !oil; j++) for (let i = 0; i < e.w; i++){
    const t = idx(S, e.x + i, e.y + j);
    if (S.oreType[t] === F.OIL_TYPE && S.oreAmt[t] > 0){ oil = t; break; }
  }
  e.active = false;
  if (oil != null && e.tank < 30 && ratio > 0){
    const drawn = Math.min(def.rate * F.pumpMul(S) * ratio * dt, 30 - e.tank);
    e.tank += drawn;   // seeps are endless
    e.active = drawn > 0;
    // wear accrues per whole unit of crude drawn
    e.opAcc = (e.opAcc || 0) + drawn;
    if (e.opAcc >= 1){
      const n = Math.floor(e.opAcc);
      e.opAcc -= n;
      wearDown(S, e, n);
    }
  }
  // push into adjacent pipes and reservoirs
  if (e.tank > 0){
    forAdjacent(S, e, (n) => {
      if (n.kind === 'pipe' || n.kind === 'tank'){
        const cap = F.BUILDINGS[n.key].cap;
        const amt = Math.min(e.tank, cap - n.fluid, 8 * dt);
        if (amt > 0){ n.fluid += amt; e.tank -= amt; }
      }
    });
  }
}

/* ---- laboratories & research ----
   One global research project (S.research.cur). Each lab pulls a still-needed
   pack from its buffer, "reads" it for def.packTime seconds, then books it as
   spent. resv[] counts packs inside working labs so parallel labs never
   over-consume; prog[] keeps per-tech progress so switching projects is free. */
function tickLab(S, e, def, dt){
  const RS = S.research;
  const tk = RS.cur && F.TECHS[RS.cur];
  e.active = false;
  if (!tk){
    // no project: put any half-read pack back in the buffer
    if (e.workItem){
      e.inBuf[e.workItem] = (e.inBuf[e.workItem] || 0) + 1;
      if (RS.resv[e.workItem]) RS.resv[e.workItem]--;
      e.workItem = null; e.prog = 0;
    }
    return;
  }
  if (!e.workItem){
    const sp = RS.prog[RS.cur] || {};
    for (const pk in tk.cost){
      const need = tk.cost[pk] - (sp[pk] || 0) - (RS.resv[pk] || 0);
      if (need > 0 && (e.inBuf[pk] || 0) > 0){
        e.inBuf[pk]--;
        if (e.inBuf[pk] <= 0) delete e.inBuf[pk];
        e.workItem = pk; e.prog = 0;
        RS.resv[pk] = (RS.resv[pk] || 0) + 1;
        break;
      }
    }
    if (!e.workItem) return;
  }
  e.active = true;
  e.prog += dt / def.packTime;
  if (e.prog >= 1){
    const pk = e.workItem;
    e.workItem = null; e.prog = 0;
    if (RS.resv[pk]) RS.resv[pk]--;
    const sp = RS.prog[RS.cur] || (RS.prog[RS.cur] = {});
    sp[pk] = (sp[pk] || 0) + 1;
    let doneAll = true;
    for (const k in tk.cost) if ((sp[k] || 0) < tk.cost[k]){ doneAll = false; break; }
    if (doneAll) completeResearch(S);
  }
}

function completeResearch(S){
  const RS = S.research;
  const id = RS.cur, tk = F.TECHS[id];
  RS.done[id] = true;
  RS.cur = null;
  delete RS.prog[id];
  RS.resv = {};
  if (tk.unlocks) for (const u of tk.unlocks) S.unlocked[u] = true;
  S.msDirty = true;   // a tier may be waiting on completed research
  F.emit(S, { type:'research', id, name: tk.name });
}

/* start / switch the global research project. Progress on the old project
   is kept; labs drop their half-read pack back into their buffers. */
F.setResearch = function(S, id){
  const RS = S.research;
  if (id === null){ dropLabWork(S); RS.cur = null; return true; }
  const tk = F.TECHS[id];
  if (!tk || RS.done[id]) return false;
  for (const rq of (tk.req || [])) if (!RS.done[rq]) return false;
  if (!F.rankMet(S, tk)) return false;   // e.g. Invincibility needs Durability V
  if (RS.cur === id) return true;
  dropLabWork(S);
  RS.cur = id;
  return true;
};
function dropLabWork(S){
  for (const e of S.ents){
    if (e.kind === 'lab' && e.workItem){
      e.inBuf[e.workItem] = (e.inBuf[e.workItem] || 0) + 1;
      e.workItem = null; e.prog = 0;
    }
  }
  S.research.resv = {};
}
F.techAvailable = function(S, id){
  const tk = F.TECHS[id];
  if (!tk || S.research.done[id]) return false;
  for (const rq of (tk.req || [])) if (!S.research.done[rq]) return false;
  return F.rankMet(S, tk);
};

/* ---- drone depots ----
   provider: a belt-fed larder, emptied only by visiting drones.
   requester: owns two drones; each flies to the nearest stocked provider of
   the configured item, loads up to DRONE_CAP, flies home, unloads; the depot
   then dispenses its store, split evenly across every side that has a conveyor
   leading directly out (see portOutTiles). Depots need grid power to dispatch
   (airborne drones always finish their run). */
function portCenter(e){ return [e.x + e.w / 2, e.y + e.h / 2]; }

function tickPort(S, e, def, dt, ratio){
  if (e.mode === 'request'){
    // dispense evenly across every side that has a conveyor leading out
    if (e.total > 0){
      const outs = portOutTiles(S, e);
      if (outs.length){
        const n = outs.length;
        const start = (e.outRot || 0) % n;
        // one item to each available exit per tick; rotate the starting exit so
        // that when goods are scarce the split still comes out even
        for (let i = 0; i < n; i++){
          const [px, py, od] = outs[(start + i) % n];
          let item = null;
          for (const k in e.store){ if (e.store[k] > 0){ item = k; break; } }
          if (!item) break;
          const tgt = F.entAt(S, px, py);
          if (tgt && F.tryInsert(S, tgt, item, od, 0)){
            e.store[item]--; e.total--;
            if (e.store[item] <= 0) delete e.store[item];
          }
        }
        e.outRot = (start + 1) % n;
      }
    }
    if (!e.portItem) return;
    while (e.drones.length < F.DRONES_PER_PORT){
      const [hx, hy] = portCenter(e);
      e.drones.push({ x: hx, y: hy, st: 'idle', cargo: 0, item: null, tid: 0 });
    }
    const cap = def.cap;
    for (const d of e.drones){
      if (d.st === 'idle'){
        if (ratio <= 0) continue;                      // no power → grounded
        if (e.total + d.cargo >= cap - F.DRONE_CAP) continue;   // nearly full
        // nearest powered-enough provider holding our item
        let best = null, bd = 1e9;
        for (const o of S.ents){
          if (o.kind !== 'port' || o.mode !== 'provide' || o.portItem !== e.portItem) continue;
          if ((o.store[e.portItem] || 0) <= 0) continue;
          const dx = o.x - e.x, dy = o.y - e.y;
          const dist = dx * dx + dy * dy;
          if (dist < bd){ bd = dist; best = o; }
        }
        if (best){ d.st = 'out'; d.tid = best.id; }
      } else if (d.st === 'out'){
        const prov = F.entById(S, d.tid);
        if (!prov || prov.kind !== 'port' || prov.mode !== 'provide'){ d.st = 'home'; continue; }
        const [tx, ty] = portCenter(prov);
        if (moveDrone(d, tx, ty, dt)){
          const take = Math.min(F.DRONE_CAP, prov.store[e.portItem] || 0);
          if (take > 0){
            prov.store[e.portItem] -= take;
            prov.total -= take;
            if (prov.store[e.portItem] <= 0) delete prov.store[e.portItem];
            d.cargo = take; d.item = e.portItem;
          }
          d.st = 'home';
        }
      } else if (d.st === 'home'){
        const [hx, hy] = portCenter(e);
        if (moveDrone(d, hx, hy, dt)){
          if (d.cargo > 0 && d.item){
            e.store[d.item] = (e.store[d.item] || 0) + d.cargo;
            e.total += d.cargo;
          }
          d.cargo = 0; d.item = null; d.st = 'idle'; d.tid = 0;
        }
      }
    }
  }
}

function moveDrone(d, tx, ty, dt){
  const dx = tx - d.x, dy = ty - d.y;
  const dist = Math.hypot(dx, dy);
  const step = F.DRONE_SPEED * dt;
  if (dist <= step){ d.x = tx; d.y = ty; return true; }
  d.x += dx / dist * step;
  d.y += dy / dist * step;
  return false;
}

function tickChest(S, e, dt){
  // release out the front, one at a time
  if (e.total <= 0) return;
  for (const k in e.store){
    if (e.store[k] <= 0) continue;
    const [px, py] = outPort(e);
    const tgt = F.entAt(S, px, py);
    if (tgt && F.tryInsert(S, tgt, k, e.dir, 0)){
      e.store[k]--; e.total--;
      if (e.store[k] <= 0) delete e.store[k];
    }
    break;
  }
}

function beltSpeed(S, e){
  return F.BUILDINGS[e.key].speed * F.beltMul(S);
}

/* a splitter glides its item at the pace of the SLOWEST conveyor leading
   out of it — so it never zips faster than the belts it feeds. Falls back
   to its own base speed when no belt currently exits it. */
function splitterSpeed(S, e){
  let slow = Infinity;
  for (const d of [e.dir, (e.dir + 3) & 3, (e.dir + 1) & 3]){   // front, left, right
    const n = F.entAt(S, e.x + DX[d], e.y + DY[d]);
    if (n && n.kind === 'belt' && n.dir !== OPP(d))             // a belt it can push into
      slow = Math.min(slow, F.BUILDINGS[n.key].speed);
  }
  const base = slow === Infinity ? F.BUILDINGS[e.key].speed : slow;
  return base * F.beltMul(S);
}

function tickBelt(S, e, dt){
  if (!e.item) return;
  e.t += beltSpeed(S, e) * dt;
  if (e.t >= 1){
    const tgt = F.entAt(S, e.x + DX[e.dir], e.y + DY[e.dir]);
    const carry = Math.min(e.t - 1, .5);
    if (tgt && F.tryInsert(S, tgt, e.item, e.dir, carry)){
      e.item = null; e.t = 0;
    } else {
      e.t = 1;
    }
  }
}

/* Items ride to the CENTER of the splitter (t 0→.5), route there, then are
   handed to the chosen exit with t0 = −.5 so they visibly travel the second
   half of the tile out the proper side — no more teleporting.
   Per-exit config: exFilt[name] reserves that lane for one item (matching
   items may ONLY use matching lanes); exPrio[name] 1..3 ranks the open
   lanes; unranked open lanes share round-robin. */
function tickSplitter(S, e, dt){
  if (!e.item) return;
  if (e.t < .5){
    e.t = Math.min(.5, e.t + splitterSpeed(S, e) * dt);
    if (e.t < .5) return;
  }
  const FRONT = e.dir, LEFT = (e.dir + 3) & 3, RIGHT = (e.dir + 1) & 3;
  const DIRS = { left: LEFT, front: FRONT, right: RIGHT };
  const tryOut = (n) => {
    const d = DIRS[n];
    const tgt = F.entAt(S, e.x + DX[d], e.y + DY[d]);
    if (tgt && F.tryInsert(S, tgt, e.item, d, -0.5)){ e.item = null; e.t = 0; return true; }
    return false;
  };
  const names = ['left', 'front', 'right'];
  // filtered lanes: a matching item must use one of its lanes (best rank first)
  const matches = names.filter(n => e.exFilt[n] === e.item && !(e.exBlock && e.exBlock[n]));
  if (matches.length){
    matches.sort((a, b) => (e.exPrio[a] || 9) - (e.exPrio[b] || 9));
    for (const n of matches) if (tryOut(n)) return;
    e.t = .5;   // wait at the center for the lane to clear
    return;
  }
  // open lanes: ranked ones first (1 → 3), then unranked by ratio weight
  const open = names.filter(n => !e.exFilt[n] && !(e.exBlock && e.exBlock[n]));
  const ranked = open.filter(n => e.exPrio[n]).sort((a, b) => e.exPrio[a] - e.exPrio[b]);
  for (const n of ranked) if (tryOut(n)) return;
  const unranked = open.filter(n => !e.exPrio[n]);
  if (unranked.length){
    // deterministic ratio cycling: build a cycle array and step through it
    const cycle = [];
    for (const n of unranked){
      const w = (e.exRatio && e.exRatio[n]) || 1;
      for (let i = 0; i < w; i++) cycle.push(n);
    }
    if (!e.ratioIdx) e.ratioIdx = 0;
    const n = cycle[e.ratioIdx % cycle.length];
    e.ratioIdx++;
    if (tryOut(n)) return;
  }
  e.t = .5;
}

function tickTunnel(S, e, dt){
  if (e.isExit){
    // pop arrivals waiting in my queue
    if (!e.item && e.transit.length && e.transit[0].at <= S.time){
      e.item = e.transit.shift().item; e.t = 0; e.srcDir = e.dir;
    }
    if (e.item){
      e.t += beltSpeed(S, e) * dt;
      if (e.t >= 1){
        const tgt = F.entAt(S, e.x + DX[e.dir], e.y + DY[e.dir]);
        if (tgt && F.tryInsert(S, tgt, e.item, e.dir, 0)){ e.item = null; e.t = 0; }
        else e.t = 1;
      }
    }
    return;
  }
  // entrance
  if (!e.item) return;
  e.t += beltSpeed(S, e) * dt;
  if (e.t >= 1){
    const exit = e.linkId && F.entById(S, e.linkId);
    if (exit && exit.transit.length < 8){
      const dist = Math.abs(exit.x - e.x) + Math.abs(exit.y - e.y);
      exit.transit.push({ item: e.item, at: S.time + dist / beltSpeed(S, e) });
      e.item = null; e.t = 0;
    } else e.t = 1;
  }
}

function forAdjacent(S, e, fn){
  const seen = new Set();
  for (let i = 0; i < e.w; i++){
    check(e.x + i, e.y - 1); check(e.x + i, e.y + e.h);
  }
  for (let j = 0; j < e.h; j++){
    check(e.x - 1, e.y + j); check(e.x + e.w, e.y + j);
  }
  function check(x, y){
    const n = F.entAt(S, x, y);
    if (n && !seen.has(n.id)){ seen.add(n.id); fn(n); }
  }
}

function tickPipes(S, dt){
  // diffusion between pipes; refineries pull from adjacent pipes
  const flow = 20 * dt;
  for (let i = 0; i < S.ents.length; i++){
    const p = S.ents[i];
    if (p.kind === 'pipe'){
      const cap = F.BUILDINGS[p.key].cap;
      for (let d = 0; d < 4; d++){
        const n = F.entAt(S, p.x + DX[d], p.y + DY[d]);
        if (!n) continue;
        if (n.kind === 'pipe' && n.fluid < p.fluid){
          const amt = Math.min((p.fluid - n.fluid) / 2, flow, cap - n.fluid);
          if (amt > 0){ n.fluid += amt; p.fluid -= amt; }
        } else if (n.kind === 'tank'){
          // equalise FILL FRACTIONS so the reservoir banks surplus and
          // releases it when the pipe runs low
          const tcap = F.BUILDINGS[n.key].cap;
          const diff = p.fluid / cap - n.fluid / tcap;
          if (Math.abs(diff) > 1e-4){
            let amt = diff / (1 / cap + 1 / tcap);           // exact equalising volume
            amt = Math.max(-flow, Math.min(flow, amt));      // rate-limited
            if (amt > 0) amt = Math.min(amt, tcap - n.fluid, p.fluid);
            else amt = -Math.min(-amt, cap - p.fluid, n.fluid);
            n.fluid += amt; p.fluid -= amt;
          }
        } else if (n.kind === 'machine' && F.BUILDINGS[n.key].fam === 'refinery'){
          const tcap = F.BUILDINGS[n.key].tank;
          const amt = Math.min(p.fluid, flow, tcap - n.tank);
          if (amt > 0){ n.tank += amt; p.fluid -= amt; }
        }
      }
    }
  }
}

/* ==================================================================== */
/* MILESTONES / UPGRADES                                                */
/* ==================================================================== */

function checkMilestone(S){
  const ms = F.MILESTONES[S.msIndex];
  if (!ms) return;
  const req = ms.req || ms.handMine;
  for (const k in req) if ((S.msProg[k] || 0) < req[k]) return;
  // some tiers also demand completed research (The Laboratory)
  if (ms.reqResearch && Object.keys(S.research.done).length < ms.reqResearch) return;
  // complete!
  for (const u of ms.unlocks) S.unlocked[u] = true;
  for (const k in ms.grant) F.invAdd(S, k, ms.grant[k]);
  F.emit(S, { type:'milestone', index: S.msIndex, name: ms.name });
  S.msIndex++;
  S.msProg = {};
  if (S.msIndex >= F.MILESTONES.length){
    S.won = true;
    // the Engine wakes — and starts asking for tribute
    if (!S.tribute) S.tribute = { lvl: 0, prog: {}, req: F.makeTribute(0) };
    F.emit(S, { type:'win' });
  }
};
F.checkMilestone = checkMilestone;

F.milestoneReq = function(S){
  const ms = F.MILESTONES[S.msIndex];
  return ms ? (ms.req || ms.handMine) : null;
};

F.buyUpgrade = function(S, id){
  const up = F.UPGRADES[id];
  const rank = S.upgrades[id] || 0;
  if (!up || rank >= up.max) return false;
  const cost = up.costs[rank];
  if (!F.pay(S, cost)) return false;
  S.upgrades[id] = rank + 1;
  F.emit(S, { type:'upgrade', id, rank: rank + 1 });
  return true;
};

F.addFuel = function(S, e, n){
  const def = F.BUILDINGS[e.key];
  const isTurbine = e.kind === 'turbine';
  const item = isTurbine ? 'fuelCell' : 'coal';
  if (!(def.fuel || e.kind === 'gen' || isTurbine)) return 0;
  let moved = 0;
  while (moved < n && F.invCount(S, item) > 0 && e.fuelBuf < F.fuelCap(S)){
    F.invAdd(S, item, -1); e.fuelBuf++; moved++;
  }
  return moved;
};

/* ==================================================================== */
/* SAVE / LOAD                                                          */
/* ==================================================================== */

F.serialize = function(S){
  const ents = [];
  for (const e of S.ents){
    if (e.kind === 'core') continue;
    const o = { id: e.id, k: e.key, x: e.x, y: e.y, d: e.dir };
    if (e.recipe) o.rc = e.recipe;
    if (e.activeRecipe && e.crafting) { o.ar = e.activeRecipe; o.pg = e.prog; }
    if (e.item) { o.it = e.item; o.tt = e.t; o.sd = e.srcDir; }
    if (e.fuelT) o.ft = e.fuelT;
    if (e.fuelBuf) o.fb = e.fuelBuf;
    if (e.inBuf && Object.keys(e.inBuf).length) o.ib = e.inBuf;
    if (e.outBuf && Object.keys(e.outBuf).length) { o.ob = e.outBuf; o.ot = e.outTotal; }
    if (e.store && e.total) { o.st = e.store; o.tl = e.total; }
    if (e.tank) o.tk = e.tank;
    if (e.fluid) o.fl = e.fluid;
    if (e.transit && e.transit.length) o.tr = e.transit.map(t => ({ item: t.item, at: +(t.at - S.time).toFixed(3) }));
    if (e.linkId) o.ln = e.linkId;
    if (e.isExit) o.ex = 1;
    if (e.prog && !o.pg) o.p2 = e.prog;
    if (e.outIdx) o.oi = e.outIdx;
    if (e.exPrio && (e.exPrio.left || e.exPrio.front || e.exPrio.right))
      o.xp = [e.exPrio.left, e.exPrio.front, e.exPrio.right];
    if (e.exFilt && (e.exFilt.left || e.exFilt.front || e.exFilt.right))
      o.xf = [e.exFilt.left, e.exFilt.front, e.exFilt.right];
    if (e.exBlock && (e.exBlock.left || e.exBlock.front || e.exBlock.right))
      o.xb = [e.exBlock.left ? 1 : 0, e.exBlock.front ? 1 : 0, e.exBlock.right ? 1 : 0];
    if (e.exRatio && (e.exRatio.left !== 1 || e.exRatio.front !== 1 || e.exRatio.right !== 1))
      o.xr = [e.exRatio.left, e.exRatio.front, e.exRatio.right];
    if (e.workItem) o.wk = e.workItem;
    if (e.mods && e.mods.length) o.md = e.mods.slice();
    if (e.prodAcc) o.pa = +e.prodAcc.toFixed(3);
    if (e.ops) o.op = e.ops;
    if (e.opAcc) o.oa = +e.opAcc.toFixed(3);
    if (e.broken) o.bk = 1;
    if (e.paid) o.pd = e.paid;
    if (e.charge) o.ch = +e.charge.toFixed(2);
    if (e.mode) o.pm = e.mode;
    if (e.portItem) o.pi = e.portItem;
    if (e.drones && e.drones.length) o.dr = e.drones.map(d => ({
      x: +d.x.toFixed(2), y: +d.y.toFixed(2), st: d.st, cargo: d.cargo, item: d.item, tid: d.tid }));
    ents.push(o);
  }
  // platform decks (tile indices) — water itself regenerates from the seed
  const plat = [];
  if (S.platform) for (let i = 0; i < S.platform.length; i++) if (S.platform[i]) plat.push(i);
  // (ore amounts aren't saved — deposits are endless, worlds regenerate from seed)
  return {
    v: 4, genVer: S.genVer, seed: S.seed, time: +S.time.toFixed(2), tick: S.tick,
    plat,
    dayT: +(S.dayT || 0).toFixed(2),
    sunF: S.sunFrozen ? 1 : 0,
    inv: S.inv, delivered: S.delivered, handMined: S.handMined,
    // milestones are saved BY ID so tiers can be inserted without breaking saves
    msId: S.msIndex < F.MILESTONES.length ? F.MILESTONES[S.msIndex].id : 'won',
    msIndex: S.msIndex, msProg: S.msProg,
    research: { cur: S.research.cur, done: S.research.done, prog: S.research.prog },
    tribute: S.tribute || null,
    upgrades: S.upgrades, unlocked: S.unlocked, flags: S.flags,
    won: S.won, freeplay: S.freeplay, made: S.stats.made,
    nextId: S.nextId, ents,
  };
};

F.deserialize = function(data){
  // v1 saves carry no genVer → regenerate with the original 128² layout
  const S = F.newGame(data.seed, data.genVer || 1);
  S.time = data.time; S.tick = data.tick;
  S.dayT = data.dayT != null ? data.dayT : 20;
  S.sunFrozen = !!data.sunF;
  S.inv = data.inv || {};
  S.delivered = data.delivered || {};
  S.handMined = data.handMined || {};
  // milestone position: prefer the saved id; legacy saves carry only a
  // numeric index into the ORIGINAL 10-tier list (ids m0…m9)
  if (data.msId != null){
    if (data.msId === 'won') S.msIndex = F.MILESTONES.length;
    else {
      const mi = F.MILESTONES.findIndex(m => m.id === data.msId);
      S.msIndex = mi >= 0 ? mi : Math.min(data.msIndex || 0, F.MILESTONES.length);
    }
  } else {
    const li = data.msIndex || 0;
    if (li >= 10) S.msIndex = F.MILESTONES.length;
    else {
      const mi = F.MILESTONES.findIndex(m => m.id === 'm' + li);
      S.msIndex = mi >= 0 ? mi : li;
    }
  }
  S.msProg = data.msProg || {};
  S.upgrades = data.upgrades || {};
  S.unlocked = data.unlocked || {};
  S.flags = data.flags || {};
  S.won = !!data.won; S.freeplay = !!data.freeplay;
  if (data.tribute) S.tribute = { lvl: data.tribute.lvl || 0, prog: data.tribute.prog || {}, req: data.tribute.req || F.makeTribute(data.tribute.lvl || 0) };
  else if (S.won) S.tribute = { lvl: 0, prog: {}, req: F.makeTribute(0) };  // migration: already-won saves
  S.stats.made = data.made || {};
  const rs = data.research || {};
  S.research = { cur: rs.cur || null, done: rs.done || {}, prog: rs.prog || {}, resv: {} };
  if (S.research.cur && !F.TECHS[S.research.cur]) S.research.cur = null;
  // platform decks back onto the water before buildings land on them
  if (data.plat) for (const i of data.plat)
    if (i >= 0 && i < S.platform.length) S.platform[i] = 1;
  for (const o of data.ents){
    const def = F.BUILDINGS[o.k];
    if (!def) continue;
    const e = { id: o.id, key: o.k, kind: def.kind, x: o.x, y: o.y, w: def.w, h: def.h, dir: o.d };
    initEnt(S, e, def);
    if (o.rc) e.recipe = o.rc;
    if (o.ar){ e.activeRecipe = o.ar; e.crafting = true; e.prog = o.pg || 0; }
    if (o.it){ e.item = o.it; e.t = o.tt || 0; e.srcDir = o.sd != null ? o.sd : e.dir; }
    if (o.ft) e.fuelT = o.ft;
    if (o.fb){
      // electric machines no longer take coal — hand any stranded fuel back
      if (def.fuel || def.kind === 'gen' || def.kind === 'turbine') e.fuelBuf = o.fb;
      else F.invAdd(S, 'coal', o.fb);
    }
    if (o.ib) e.inBuf = o.ib;
    if (o.ob){ e.outBuf = o.ob; e.outTotal = o.ot || 0; }
    if (o.st){ e.store = o.st; e.total = o.tl || 0; }
    if (o.tk) e.tank = o.tk;
    if (o.fl) e.fluid = o.fl;
    if (o.tr) e.transit = o.tr.map(t => ({ item: t.item, at: S.time + t.at }));
    if (o.ln) e.linkId = o.ln;
    if (o.ex) e.isExit = true;
    if (o.p2) e.prog = o.p2;
    if (o.oi) e.outIdx = o.oi;
    if (o.xp && e.exPrio){ e.exPrio.left = o.xp[0] || 0; e.exPrio.front = o.xp[1] || 0; e.exPrio.right = o.xp[2] || 0; }
    if (o.xf && e.exFilt){ e.exFilt.left = o.xf[0] || null; e.exFilt.front = o.xf[1] || null; e.exFilt.right = o.xf[2] || null; }
    if (o.xb && e.exBlock){ e.exBlock.left = !!o.xb[0]; e.exBlock.front = !!o.xb[1]; e.exBlock.right = !!o.xb[2]; }
    if (o.xr && e.exRatio){ e.exRatio.left = o.xr[0] || 1; e.exRatio.front = o.xr[1] || 1; e.exRatio.right = o.xr[2] || 1; }
    // legacy splitter config: one filter (always left) + one priority exit
    if (o.fi && e.exFilt) e.exFilt.left = o.fi;
    if (o.po && e.exPrio && e.exPrio[o.po] != null) e.exPrio[o.po] = 1;
    if (o.wk) e.workItem = o.wk;
    if (o.md) e.mods = o.md.filter(m => F.MODULES[m]);
    if (o.pa) e.prodAcc = o.pa;
    if (o.op) e.ops = o.op;
    if (o.oa) e.opAcc = o.oa;
    if (o.bk) e.broken = true;
    if (o.pd) e.paid = o.pd;
    if (o.ch) e.charge = o.ch;
    if (o.pm) e.mode = o.pm;
    if (o.pi) e.portItem = o.pi;
    if (o.dr) e.drones = o.dr.map(d => ({ x: d.x, y: d.y, st: d.st || 'idle', cargo: d.cargo || 0, item: d.item || null, tid: d.tid || 0 }));
    S.ents.push(e);
    stamp(S, e);
  }
  S.nextId = data.nextId || (Math.max(0, ...S.ents.map(e => e.id)) + 1);
  // rebuild pack reservations from labs that were saved mid-read
  for (const e of S.ents){
    if (e.kind !== 'lab') continue;
    // migration: labs briefly read raw materials too — hand any back
    if (e.workItem && !F.PACKS.includes(e.workItem)){
      F.invAdd(S, e.workItem, 1);
      e.workItem = null; e.prog = 0;
    }
    for (const k in e.inBuf){
      if (!F.PACKS.includes(k)){ F.invAdd(S, k, e.inBuf[k]); delete e.inBuf[k]; }
    }
    if (e.workItem){
      if (S.research.cur) S.research.resv[e.workItem] = (S.research.resv[e.workItem] || 0) + 1;
      else { e.inBuf[e.workItem] = (e.inBuf[e.workItem] || 0) + 1; e.workItem = null; e.prog = 0; }
    }
  }
  // migration: the old single "Machine modules" tech granted two slots and all
  // three module recipes at once. It now only opens the sub-techs, so preserve
  // old saves by granting them the equivalents (two slots + the three types).
  if (S.research.done.modules)
    for (const t of ['speedModuleTech', 'effModuleTech', 'durModuleTech', 'moduleSlot1', 'moduleSlot2'])
      if (F.TECHS[t]) S.research.done[t] = true;
  // migration: content added after this save was made (e.g. power poles)
  // must still unlock — re-apply every completed milestone's unlock list
  for (let i = 0; i < S.msIndex && i < F.MILESTONES.length; i++)
    for (const u of F.MILESTONES[i].unlocks) S.unlocked[u] = true;
  // …and every finished tech's unlock list
  for (const id in S.research.done){
    const tk = F.TECHS[id];
    if (tk && tk.unlocks) for (const u of tk.unlocks) S.unlocked[u] = true;
  }
  // legacy saves: buildings that used to be milestone rewards now live in the
  // tech tree — if a save already owns everything a tech grants, count the
  // tech as researched so the tree stays coherent
  for (const id of F.TECH_ORDER){
    const tk = F.TECHS[id];
    if (S.research.done[id] || tk.effect || !tk.unlocks || !tk.unlocks.length) continue;
    if (tk.unlocks.every(u => S.unlocked[u])) S.research.done[id] = true;
  }
  S.powerDirty = true;
  return S;
};

})(typeof window !== 'undefined' ? window : globalThis);
