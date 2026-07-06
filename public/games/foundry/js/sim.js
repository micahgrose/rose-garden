/* ============ Foundry — simulation: worldgen, placement, tick, save/load ============
   Entirely DOM-free: operates on the state object from F.newState().
   The renderer and UI observe state; the headless harness drives this directly. */
(function(root){
'use strict';
const F = root.F;
const { DX, DY, OPP, clamp } = F;

/* world-gen versions: v1 = original 128² (kept so old saves regenerate
   identically); v2 = bigger 160² world with wider ore rings */
const GEN = {
  1: { size: 128 },
  2: { size: 160 },
};
const GEN_CURRENT = 2;
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
      if (S.oreType[i] === 0 && !S.grid[i]){
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
    if (S.oreType[idx(S, cx, cy)] !== 0) continue;
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
    return;
  }

  /* v2 layout — 160² world, ore rings spread wider apart */

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
};

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

F.canPlace = function(S, key, x, y, dir){
  const def = F.BUILDINGS[key];
  if (!def || !S.unlocked[key]) return { ok:false, why:'locked' };
  if (!F.inMap(S, x, y) || !F.inMap(S, x + def.w - 1, y + def.h - 1)) return { ok:false, why:'out of bounds' };
  let ore = 0, oil = 0;
  for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++){
    const t = idx(S, x + i, y + j);
    if (S.grid[t]) return { ok:false, why:'occupied' };
    if (S.oreType[t] === F.OIL_TYPE && S.oreAmt[t] > 0) oil++;
    else if (S.oreType[t] !== 0 && S.oreAmt[t] > 0) ore++;
  }
  if (def.kind === 'miner' && ore < 1) return { ok:false, why:'needs an ore deposit' };
  if (def.kind === 'pump' && oil < 1) return { ok:false, why:'needs an oil seep' };
  if (def.kind !== 'pump' && oil > 0) return { ok:false, why:'blocked by oil seep' };
  if (!F.canAfford(S, def.cost)) return { ok:false, why:'cost' };
  return { ok:true };
};

F.place = function(S, key, x, y, dir, free){
  const chk = F.canPlace(S, key, x, y, dir);
  if (!chk.ok) return null;
  if (!free && !F.pay(S, F.BUILDINGS[key].cost)) return null;
  const def = F.BUILDINGS[key];
  const e = { id: S.nextId++, key, kind: def.kind, x, y, w: def.w, h: def.h, dir: dir & 3 };
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
    case 'splitter': e.item = null; e.t = 0; e.srcDir = e.dir; e.outIdx = 0; break;
    case 'chest':    e.store = {}; e.total = 0; break;
    case 'pipe':     e.fluid = 0; break;
    case 'miner':    e.prog = 0; e.outBuf = {}; e.outTotal = 0; e.fuelT = 0; e.fuelBuf = 0; e.ema = 0; e.lastOut = -1; break;
    case 'machine':  e.recipe = null; e.prog = 0; e.crafting = false; e.inBuf = {}; e.outBuf = {}; e.outTotal = 0;
                     e.fuelT = 0; e.fuelBuf = 0; e.tank = 0; e.ema = 0; e.lastOut = -1;
                     if (def.fam === 'refinery') e.recipe = null;
                     break;
    case 'gen':      e.fuelT = 0; e.fuelBuf = 0; e.load = 0; break;
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

F.remove = function(S, x, y){
  const e = F.entAt(S, x, y);
  if (!e || e.kind === 'core') return null;
  const def = F.BUILDINGS[e.key];
  F.refund(S, def.cost);
  // return contained items
  const give = (o) => { for (const k in o) if (o[k] > 0) F.invAdd(S, k, Math.floor(o[k])); };
  if (e.inBuf) give(e.inBuf);
  if (e.outBuf) give(e.outBuf);
  if (e.store) give(e.store);
  if (e.item) F.invAdd(S, e.item, 1);
  if (e.fuelBuf) F.invAdd(S, 'coal', e.fuelBuf);
  if (e.transit) for (const tr of e.transit) F.invAdd(S, tr.item, 1);
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
    if (e.kind === 'gen' || e.kind === 'turbine' || e.kind === 'solar' || def.power){
      e.netId = 0;
      for (const p of poles){
        if (p.netId && poleCovers(p, e)){ e.netId = p.netId; break; }
      }
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
      const cap = F.CHEST_CAP + F.upRank(S, 'capacitors') * 20;
      if (target.total >= cap) return false;
      target.store[item] = (target.store[item] || 0) + 1; target.total++;
      return true;
    }
    case 'core':
      deliverToCore(S, item);
      return true;
    case 'miner': case 'gen':
      if (item !== 'coal') return false;
      if (target.kind === 'miner' && !F.BUILDINGS[target.key].fuel) return false;
      if (target.fuelBuf >= F.FUEL_CAP) return false;
      target.fuelBuf++; return true;
    case 'turbine':
      if (item !== 'fuelCell' || target.fuelBuf >= F.FUEL_CAP) return false;
      target.fuelBuf++; return true;
    case 'machine':
      return machineAccept(S, target, item);
    default:
      return false;
  }
};

function machineAccept(S, m, item){
  const def = F.BUILDINGS[m.key];
  // burner fuel
  if (def.fuel && item === 'coal' && m.fuelBuf < F.FUEL_CAP && !recipeUses(S, m, 'coal')){
    m.fuelBuf++; return true;
  }
  const cap = 2; // buffer holds cap × recipe need (+capacitor bonus)
  if (def.fam === 'smelter' || def.fam === 'alloy'){
    // accept anything belonging to an unlocked auto recipe
    let need = 0;
    for (const rk of F.AUTO_RECIPES[def.fam]){
      if (!F.recipeUnlocked(S, rk)) continue;
      const r = F.RECIPES[rk];
      if (r.in[item]) need = Math.max(need, r.in[item]);
    }
    if (!need){
      if (def.fuel && item === 'coal' && m.fuelBuf < F.FUEL_CAP){ m.fuelBuf++; return true; }
      return false;
    }
    const lim = need * cap + F.bufBonus(S) + (def.fam === 'alloy' ? 2 : 0);
    if ((m.inBuf[item] || 0) >= lim) return false;
    m.inBuf[item] = (m.inBuf[item] || 0) + 1; return true;
  }
  // asm / refinery: only the chosen recipe's ingredients
  const r = m.recipe && F.RECIPES[m.recipe];
  if (!r || !r.in[item]) {
    if (def.fuel && item === 'coal' && m.fuelBuf < F.FUEL_CAP){ m.fuelBuf++; return true; }
    return false;
  }
  const lim = r.in[item] * cap + F.bufBonus(S);
  if ((m.inBuf[item] || 0) >= lim) return false;
  m.inBuf[item] = (m.inBuf[item] || 0) + 1; return true;
}

function recipeUses(S, m, item){
  const r = m.recipe && F.RECIPES[m.recipe];
  return !!(r && r.in[item]);
}

function deliverToCore(S, item){
  F.invAdd(S, item, 1);
  S.delivered[item] = (S.delivered[item] || 0) + 1;
  const ms = F.MILESTONES[S.msIndex];
  if (ms && ms.req && ms.req[item] && (S.msProg[item] || 0) < ms.req[item]){
    S.msProg[item] = (S.msProg[item] || 0) + 1;
    S.msDirty = true;
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
  if (def.fam === 'smelter' || def.fam === 'alloy'){
    for (const rk of F.AUTO_RECIPES[def.fam]){
      if (!F.recipeUnlocked(S, rk)) continue;
      const rc = F.RECIPES[rk];
      let ok = true;
      for (const k in rc.in) if ((m.inBuf[k] || 0) < rc.in[k]) { ok = false; break; }
      if (ok){ r = rk; break; }
    }
  } else {
    const rk = m.recipe;
    if (rk && F.recipeUnlocked(S, rk)){
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
  if (fam === 'smelter' || fam === 'alloy') return F.smeltMul(S);
  return F.asmMul(S);
}

F.tick = function(S, dt){
  S.tick++;
  S.time += dt;
  const ents = S.ents;

  /* ---- pass A: power book-keeping (per pole-network) ---- */
  if (S.powerDirty){ F.computePowerNetworks(S); S.powerDirty = false; }
  const sup = {}, dem = {};
  let unpowered = 0, unpoweredDem = 0;
  const useMul = F.powerUseMul(S), outMul = F.powerMul(S);
  for (let i = 0; i < ents.length; i++){
    const e = ents[i], def = F.BUILDINGS[e.key];
    if (!def) continue;
    if (e.kind === 'gen' || e.kind === 'turbine'){
      e._fueled = e.fuelT > 0 || e.fuelBuf > 0;
      if (e._fueled && e.netId) sup[e.netId] = (sup[e.netId] || 0) + def.out * outMul;
    } else if (e.kind === 'solar'){
      if (e.netId) sup[e.netId] = (sup[e.netId] || 0) + def.out * outMul;
    } else if (def.power){
      // does it want to work?
      let wants = false;
      if (e.kind === 'miner') wants = minerWants(S, e);
      else if (e.kind === 'pump') wants = e.tank < 30;
      else if (e.kind === 'machine') wants = e.crafting || !!machineCanStart(S, e, def);
      e._want = wants;
      if (wants){
        if (e.netId) dem[e.netId] = (dem[e.netId] || 0) + def.power * useMul;
        else { unpowered++; unpoweredDem += def.power * useMul; }
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
        if (e.fuelBuf > 0){ e.fuelBuf--; e.fuelT += def.burn; }
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
    if (st.buckets.length > 24) st.buckets.shift(); // 2-minute window
    st.bucketAcc = {};
  }

  /* ---- milestones ---- */
  if (S.msDirty){ S.msDirty = false; checkMilestone(S); }
};

function minerWants(S, e){
  if (e.outTotal >= 4 + F.bufBonus(S)) return false;
  const i = idx(S, e.x, e.y);
  return S.oreType[i] !== 0 && S.oreType[i] !== F.OIL_TYPE && S.oreAmt[i] > 0;
}

function tickMiner(S, e, def, dt, ratio){
  tryEject(S, e);
  if (!minerWants(S, e)){ e.active = false; return; }
  let mul = def.speed * F.mineMul(S);
  if (def.power){ mul *= ratio; }
  else {
    // burner
    if (e.fuelT <= 0){
      if (e.fuelBuf > 0){ e.fuelBuf--; e.fuelT += F.COAL_BURN; }
      else {
        e.active = false;
        if (!S.flags.fuelLow && S.time > 30){ S.flags.fuelLow = true; F.emit(S, { type:'tip', id:'firstFuelLow' }); }
        return;
      }
    }
    e.fuelT -= dt;
  }
  e.active = mul > 0;
  e.prog += dt * mul / def.mineTime;
  if (e.prog >= 1){
    e.prog -= 1;
    const i = idx(S, e.x, e.y);
    const item = F.ORES[S.oreType[i]].id;
    // deposits are endless — drills never exhaust them
    e.outBuf[item] = (e.outBuf[item] || 0) + 1; e.outTotal++;
    S.stats.made[item] = (S.stats.made[item] || 0) + 1;
    S.stats.bucketAcc[item] = (S.stats.bucketAcc[item] || 0) + 1;
  }
}

function tickMachine(S, e, def, dt, ratio){
  tryEject(S, e);
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
  let mul = def.speed * famMul(S, def.fam);
  if (def.power) mul *= ratio;
  else {
    if (e.fuelT <= 0){
      if (e.fuelBuf > 0){ e.fuelBuf--; e.fuelT += F.COAL_BURN; }
      else {
        e.active = false;
        if (!S.flags.fuelLow && S.time > 30){ S.flags.fuelLow = true; F.emit(S, { type:'tip', id:'firstFuelLow' }); }
        return;
      }
    }
    e.fuelT -= dt;
  }
  e.active = mul > 0;
  e.prog += dt * mul / rc.time;
  if (e.prog >= 1){
    e.crafting = false; e.prog = 0;
    e.outBuf[rc.out] = (e.outBuf[rc.out] || 0) + rc.outN; e.outTotal += rc.outN;
    S.stats.made[rc.out] = (S.stats.made[rc.out] || 0) + rc.outN;
    S.stats.bucketAcc[rc.out] = (S.stats.bucketAcc[rc.out] || 0) + rc.outN;
    F.emit(S, { type:'craft', x: e.x, y: e.y, item: rc.out });
  }
}

function tickPump(S, e, def, dt, ratio){
  // is there oil under the footprint?
  let oil = null;
  for (let j = 0; j < e.h && !oil; j++) for (let i = 0; i < e.w; i++){
    const t = idx(S, e.x + i, e.y + j);
    if (S.oreType[t] === F.OIL_TYPE && S.oreAmt[t] > 0){ oil = t; break; }
  }
  e.active = false;
  if (oil != null && e.tank < 30 && ratio > 0){
    const drawn = Math.min(def.rate * ratio * dt, 30 - e.tank);
    e.tank += drawn;   // seeps are endless
    e.active = drawn > 0;
  }
  // push into adjacent pipes
  if (e.tank > 0){
    forAdjacent(S, e, (n) => {
      if (n.kind === 'pipe'){
        const cap = F.BUILDINGS[n.key].cap;
        const amt = Math.min(e.tank, cap - n.fluid, 8 * dt);
        if (amt > 0){ n.fluid += amt; e.tank -= amt; }
      }
    });
  }
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

function tickSplitter(S, e, dt){
  if (!e.item) return;
  e.t += beltSpeed(S, e) * dt;
  if (e.t >= 1){
    // try up to 3 exits (front, left, right of dir) round-robin
    const dirs = [e.dir, (e.dir + 3) & 3, (e.dir + 1) & 3];
    for (let n = 0; n < 3; n++){
      const d = dirs[(e.outIdx + n) % 3];
      const tgt = F.entAt(S, e.x + DX[d], e.y + DY[d]);
      if (tgt && F.tryInsert(S, tgt, e.item, d, 0)){
        e.item = null; e.t = 0;
        e.outIdx = (e.outIdx + n + 1) % 3;
        return;
      }
    }
    e.t = 1;
  }
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
  // complete!
  for (const u of ms.unlocks) S.unlocked[u] = true;
  for (const k in ms.grant) F.invAdd(S, k, ms.grant[k]);
  F.emit(S, { type:'milestone', index: S.msIndex, name: ms.name });
  S.msIndex++;
  S.msProg = {};
  if (S.msIndex >= F.MILESTONES.length){
    S.won = true;
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
  while (moved < n && F.invCount(S, item) > 0 && e.fuelBuf < F.FUEL_CAP){
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
    ents.push(o);
  }
  // (ore amounts aren't saved — deposits are endless, worlds regenerate from seed)
  return {
    v: 2, genVer: S.genVer, seed: S.seed, time: +S.time.toFixed(2), tick: S.tick,
    inv: S.inv, delivered: S.delivered, handMined: S.handMined,
    msIndex: S.msIndex, msProg: S.msProg,
    upgrades: S.upgrades, unlocked: S.unlocked, flags: S.flags,
    won: S.won, freeplay: S.freeplay, made: S.stats.made,
    nextId: S.nextId, ents,
  };
};

F.deserialize = function(data){
  // v1 saves carry no genVer → regenerate with the original 128² layout
  const S = F.newGame(data.seed, data.genVer || 1);
  S.time = data.time; S.tick = data.tick;
  S.inv = data.inv || {};
  S.delivered = data.delivered || {};
  S.handMined = data.handMined || {};
  S.msIndex = data.msIndex || 0;
  S.msProg = data.msProg || {};
  S.upgrades = data.upgrades || {};
  S.unlocked = data.unlocked || {};
  S.flags = data.flags || {};
  S.won = !!data.won; S.freeplay = !!data.freeplay;
  S.stats.made = data.made || {};
  for (const o of data.ents){
    const def = F.BUILDINGS[o.k];
    if (!def) continue;
    const e = { id: o.id, key: o.k, kind: def.kind, x: o.x, y: o.y, w: def.w, h: def.h, dir: o.d };
    initEnt(S, e, def);
    if (o.rc) e.recipe = o.rc;
    if (o.ar){ e.activeRecipe = o.ar; e.crafting = true; e.prog = o.pg || 0; }
    if (o.it){ e.item = o.it; e.t = o.tt || 0; e.srcDir = o.sd != null ? o.sd : e.dir; }
    if (o.ft) e.fuelT = o.ft;
    if (o.fb) e.fuelBuf = o.fb;
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
    S.ents.push(e);
    stamp(S, e);
  }
  S.nextId = data.nextId || (Math.max(0, ...S.ents.map(e => e.id)) + 1);
  // migration: content added after this save was made (e.g. power poles)
  // must still unlock — re-apply every completed milestone's unlock list
  for (let i = 0; i < S.msIndex && i < F.MILESTONES.length; i++)
    for (const u of F.MILESTONES[i].unlocks) S.unlocked[u] = true;
  S.powerDirty = true;
  return S;
};

})(typeof window !== 'undefined' ? window : globalThis);
