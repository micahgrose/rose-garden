/* ============ Foundry — core: namespace, helpers, RNG, state ============ */
(function(root){
'use strict';

const F = root.F = root.F || {};

/* ---------- math helpers ---------- */
F.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
F.lerp  = (a, b, t) => a + (b - a) * t;
F.ease  = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2;

/* Directions: 0=N 1=E 2=S 3=W */
F.DX = [0, 1, 0, -1];
F.DY = [-1, 0, 1, 0];
F.OPP = d => (d + 2) & 3;

/* ---------- seeded RNG (mulberry32) ---------- */
F.makeRng = function(seed){
  let s = seed >>> 0;
  const r = function(){
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  return r;
};

/* ---------- number formatting ---------- */
F.fmt = function(n){
  if (!isFinite(n)) return '∞';
  if (n >= 1e6) return (n/1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e4) return (n/1e3).toFixed(0) + 'k';
  if (n >= 1000) return (n/1000).toFixed(1) + 'k';
  return '' + Math.floor(n);
};
F.fmtTime = function(s){
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s/60), h = Math.floor(m/60);
  if (h > 0) return h + 'h ' + (m%60) + 'm';
  return m + ':' + String(s%60).padStart(2,'0');
};

/* ---------- game state container ----------
   Everything the sim touches lives here so the headless harness
   can snapshot / restore / inspect it. No DOM references. */
F.newState = function(seed){
  return {
    seed: seed >>> 0,
    time: 0,               // sim seconds
    tick: 0,
    w: 0, h: 0,            // map size (set by worldgen)
    ground: null,          // Uint8Array terrain variant (visual)
    oreType: null,         // Uint8Array 0=none, else ORE id
    oreAmt: null,          // Float64Array remaining richness
    grid: null,            // entity ref per tile (or null)
    ents: [],              // all entities
    nextId: 1,
    inv: {},               // global inventory {itemId: count}
    delivered: {},         // lifetime belt-delivered to Core {itemId: count}
    handMined: {},         // lifetime hand-mined {itemId: count}
    msIndex: 0,            // current milestone index
    msDone: false,         // all milestones complete (won)
    won: false,
    freeplay: false,
    upgrades: {},          // {upgradeId: rank}
    unlocked: {},          // {buildingKey|recipeKey: true}
    stats: {               // rolling production, window buckets
      made: {},            // lifetime crafted {itemId: n}
      buckets: [],         // per-5s production snapshots
      bucketAcc: {},
      bucketT: 0,
      powerSupply: 0, powerDemand: 0, powerRatio: 1,
    },
    core: null,            // ref to core entity
    flags: {},             // one-shot tutorial/tip flags
    events: [],            // sim → UI event queue [{type,...}]
  };
};

/* Push a sim event for the UI/audio layer (drained each frame). */
F.emit = function(S, ev){
  if (S.events.length < 200) S.events.push(ev);
};

/* ---------- inventory ---------- */
F.invCount = (S, id) => S.inv[id] || 0;
F.invAdd = function(S, id, n){
  S.inv[id] = (S.inv[id] || 0) + n;
  if (S.inv[id] <= 0) delete S.inv[id];
};
F.canAfford = function(S, cost){
  for (const k in cost) if ((S.inv[k]||0) < cost[k]) return false;
  return true;
};
F.pay = function(S, cost){
  if (!F.canAfford(S, cost)) return false;
  for (const k in cost) F.invAdd(S, k, -cost[k]);
  return true;
};
F.refund = function(S, cost){
  for (const k in cost) F.invAdd(S, k, cost[k]);
};

})(typeof window !== 'undefined' ? window : globalThis);
