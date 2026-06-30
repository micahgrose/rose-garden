'use strict';
/* ============================================================
   wick — main game
   a fixed-step sim (60hz) under a rAF render loop.
   the world is dark; your light radius follows your health.
   ============================================================ */

(function () {

  /* ---------------- helpers ---------------- */

  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const pickFrom = arr => arr[(Math.random() * arr.length) | 0];
  const $ = id => document.getElementById(id);

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---------------- save data ---------------- */

  let SAVE = { best: 0, wins: 0, runs: 0, mute: false };
  try {
    const raw = localStorage.getItem('wick_save_v1');
    if (raw) SAVE = Object.assign(SAVE, JSON.parse(raw));
  } catch (e) { /* private mode, file://, whatever — play without saving */ }

  // RoseGarden account: if logged in, progress is tied to the user and
  // syncs across devices. localStorage stays as an offline cache + mute store.
  let RG_TOKEN = null;
  try { RG_TOKEN = localStorage.getItem('rg_token'); } catch (e) {}

  function persist() {
    try { localStorage.setItem('wick_save_v1', JSON.stringify(SAVE)); } catch (e) {}
    if (RG_TOKEN) {
      try {
        fetch('/api/wick/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + RG_TOKEN },
          body: JSON.stringify({ best: SAVE.best, wins: SAVE.wins, runs: SAVE.runs })
        }).catch(() => {});
      } catch (e) {}
    }
  }

  async function loadServerSave() {
    if (!RG_TOKEN) return;
    try {
      const r = await fetch('/api/wick/save', { headers: { 'Authorization': 'Bearer ' + RG_TOKEN } });
      if (!r.ok) return;
      const d = await r.json();
      // server holds the authoritative monotonic stats; keep the higher of the two
      SAVE.best = Math.max(SAVE.best || 0, d.best || 0);
      SAVE.wins = Math.max(SAVE.wins || 0, d.wins || 0);
      SAVE.runs = Math.max(SAVE.runs || 0, d.runs || 0);
      try { localStorage.setItem('wick_save_v1', JSON.stringify(SAVE)); } catch (e) {}
      if (state === 'title') renderBest();
    } catch (e) {}
  }

  /* ---------------- canvas ---------------- */

  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const darkCv = document.createElement('canvas');
  const darkCtx = darkCv.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    darkCv.width = canvas.width;
    darkCv.height = canvas.height;
  }
  window.addEventListener('resize', resize);
  resize();

  /* glow sprites — pre-rendered radial gradients, drawn with 'lighter'.
     much cheaper than shadowBlur per entity. */
  const glowCache = {};
  function glowSprite(color) {
    if (glowCache[color]) return glowCache[color];
    const s = 64, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    glowCache[color] = cv;
    return cv;
  }
  const punchSprite = glowSprite('rgba(255,255,255,1)');

  /* a sharper mask for the player's own light — stays bright, then drops off fast at the
     edge so lit ground and the unseen dark feel like two different places */
  const lightMask = (function () {
    const s = 128, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.98)');
    g.addColorStop(0.82, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    return cv;
  })();

  function drawGlow(c, x, y, r, color, alpha) {
    c.globalAlpha = alpha;
    c.globalCompositeOperation = 'lighter';
    c.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  /* ground texture: one tile, repeated */
  const groundPattern = (function () {
    const s = 256, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const c = cv.getContext('2d');
    c.fillStyle = '#0d0c1b'; // original darkened by the same step I'd brightened it
    c.fillRect(0, 0, s, s);
    const rng = mulberry32(7);
    for (let i = 0; i < 90; i++) {
      c.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.022)' : 'rgba(110,130,200,0.03)';
      const r = 0.6 + rng() * 1.6;
      c.beginPath();
      c.arc(rng() * s, rng() * s, r, 0, TAU);
      c.fill();
    }
    for (let i = 0; i < 5; i++) {
      c.fillStyle = 'rgba(0,0,0,0.16)';
      c.beginPath();
      c.ellipse(rng() * s, rng() * s, 22 + rng() * 30, 14 + rng() * 20, rng() * TAU, 0, TAU);
      c.fill();
    }
    return ctx.createPattern(cv, 'repeat');
  })();

  /* deterministic scatter props per 512px chunk */
  const CHUNK = 512;
  const propCache = new Map();
  function chunkProps(cx, cy) {
    const key = cx + ',' + cy;
    let p = propCache.get(key);
    if (p) return p;
    if (propCache.size > 500) propCache.clear();
    const rng = mulberry32(((cx * 73856093) ^ (cy * 19349663)) >>> 0);
    p = [];
    const n = 2 + ((rng() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const roll = rng();
      p.push({
        t: roll < 0.45 ? 'pebble' : roll < 0.72 ? 'shroom' : 'wax',
        x: cx * CHUNK + rng() * CHUNK,
        y: cy * CHUNK + rng() * CHUNK,
        s: 0.6 + rng() * 0.9,
        a: rng() * TAU
      });
    }
    propCache.set(key, p);
    return p;
  }

  /* ---------------- input ---------------- */

  const keys = new Set();
  // no right-click menu — it only ever interrupts the night
  window.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    keys.add(k);

    if (k === 'm') {
      SAVE.mute = !SAVE.mute;
      Sound.setMute(SAVE.mute);
      persist();
      return;
    }
    if (state === 'title' && (k === 'enter' || k === ' ')) { startRun(); return; }
    if (state === 'gameover' && k === 'enter') { startRun(); return; }
    if (state === 'levelup' && ['1', '2', '3'].includes(k)) {
      const cards = $('cards').children;
      const i = +k - 1;
      const btn = cards[i] && cards[i].querySelector('button');
      if (btn) btn.click();
      return;
    }
    if ((k === 'escape' || k === 'p')) {
      if (state === 'playing') pauseGame();
      else if (state === 'paused') resumeGame();
    }
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') pauseGame();
  });

  function inputDir() {
    let dx = 0, dy = 0;
    if (keys.has('w') || keys.has('z') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (keys.has('a') || keys.has('q') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
    return [dx, dy];
  }

  /* ---------------- icons (inline svg) ---------------- */

  const IC = {
    bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="currentColor"/></svg>',
    orbit: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="20.5" cy="12" r="2.4" fill="currentColor"/></svg>',
    burst: '<svg viewBox="0 0 24 24"><path d="M12 1v6M12 17v6M1 12h6M17 12h6M4.5 4.5l4 4M15.5 15.5l4 4M19.5 4.5l-4 4M8.5 15.5l-4 4" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="M3 12 19 5l-5 7 5 7z" fill="currentColor"/></svg>',
    fox: '<svg viewBox="0 0 24 24"><path d="M12 2c2 4 7 5 7 11a7 7 0 1 1-14 0c0-3.5 2.5-5 4-8 .8 1.8 3 3 3 3s-1.2-3.5 0-6z" fill="currentColor"/></svg>',
    candle: '<svg viewBox="0 0 24 24"><rect x="9" y="11" width="6" height="11" rx="1.6" fill="currentColor"/><ellipse cx="12" cy="6.5" rx="2.6" ry="4" fill="currentColor" opacity="0.65"/></svg>',
    sword: '<svg viewBox="0 0 24 24"><path d="M4 20l3-1 12-12-2-2L5 17z" fill="currentColor"/><path d="M3 21l2-2" stroke="currentColor" stroke-width="2"/></svg>',
    boot: '<svg viewBox="0 0 24 24"><path d="M5 4l7 8-7 8M13 4l7 8-7 8" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    hour: '<svg viewBox="0 0 24 24"><path d="M6 2h12M6 22h12M7 2c0 6 5 7 5 10s-5 4-5 10M17 2c0 6-5 7-5 10s5 4 5 10" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
    magnet: '<svg viewBox="0 0 24 24"><path d="M5 3v9a7 7 0 0 0 14 0V3h-5v9a2 2 0 0 1-4 0V3z" fill="currentColor"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" fill="currentColor"/></svg>',
    drop: '<svg viewBox="0 0 24 24"><path d="M12 2C8 9 5 11 5 15.5a7 7 0 0 0 14 0C19 11 16 9 12 2z" fill="currentColor"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 21S4 14.5 4 8.8C4 5.6 6.5 4 8.7 4c1.4 0 2.6.7 3.3 1.8C12.7 4.7 13.9 4 15.3 4 17.5 4 20 5.6 20 8.8 20 14.5 12 21 12 21z" fill="currentColor"/></svg>',
    flare: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  /* ---------------- definitions ---------------- */

  const WEAPONS = {
    flicker: {
      name: 'Flickerbolt', icon: IC.bolt,
      flavor: 'A dart of borrowed light.',
      blurb: 'throws darts at the nearest shadow',
      stats: {
        dmg: [10, 13, 16, 21, 28],
        cd: [0.85, 0.78, 0.72, 0.64, 0.5],
        count: [1, 2, 2, 3, 4],
        pierce: [0, 0, 1, 1, 2],
        spd: 470
      }
    },
    cinder: {
      name: 'Cinderlings', icon: IC.orbit,
      flavor: 'They only want to help.',
      blurb: 'small embers circle you and bite',
      stats: {
        dmg: [11, 14, 17, 21, 27],
        count: [1, 2, 3, 3, 4],
        rad: [64, 68, 74, 82, 90],
        spin: 2.7
      }
    },
    tallow: {
      name: 'Tallow Burst', icon: IC.burst,
      flavor: 'Molten wax forgives nothing.',
      blurb: 'scalds everything near you, sometimes',
      stats: {
        dmg: [16, 22, 28, 36, 48],
        cd: [4.0, 3.6, 3.2, 2.9, 2.3],
        rad: [110, 122, 138, 152, 178]
      }
    },
    scatter: {
      name: 'Scattersparks', icon: IC.spark,
      flavor: 'Strike twice. Then keep striking.',
      blurb: 'a short, mean spray where you walk',
      stats: {
        dmg: [5, 6, 7, 9, 11],
        cd: [1.4, 1.3, 1.2, 1.05, 0.85],
        count: [5, 6, 8, 10, 13],
        spd: 540,
        life: 0.38
      }
    },
    foxfire: {
      name: 'Foxfire', icon: IC.fox,
      flavor: 'It remembers the way to warm things.',
      blurb: 'seeking flames that burst on arrival',
      stats: {
        dmg: [18, 24, 31, 40, 52],
        cd: [2.4, 2.2, 2.0, 1.75, 1.45],
        count: [1, 1, 2, 2, 3],
        blast: 52
      }
    }
  };

  const STAT_LABEL = { dmg: 'damage', cd: 'cooldown', count: 'projectiles', pierce: 'pierce', rad: 'reach', life: 'range' };
  // what each weapon calls the things its "count" stat adds
  const COUNT_UNIT = { flicker: 'bolt', cinder: 'cinderling', scatter: 'spark', foxfire: 'projectile' };

  const PASSIVES = {
    wick:   { name: 'Long Wick',     icon: IC.candle, flavor: 'More candle to burn.',            per: '+25 max flame, and a little back now' },
    bright: { name: 'Bright Burn',   icon: IC.sword,  flavor: 'The moths will regret noticing.', per: '+12% damage' },
    brisk:  { name: 'Brisk Step',    icon: IC.boot,   flavor: 'Wax can hurry, if it must.',      per: '+10% move speed' },
    hands:  { name: 'Warm Hands',    icon: IC.hour,   flavor: 'Time melts a touch faster.',      per: '-8% cooldowns' },
    draft:  { name: 'Drawing Draft', icon: IC.magnet, flavor: 'Sparks drift toward home.',       per: '+30% pickup range' },
    wax:    { name: 'Hardened Wax',  icon: IC.shield, flavor: 'Let them chew. See what it gets them.', per: '+1 armor' },
    melt:   { name: 'Slow Melt',     icon: IC.drop,   flavor: 'Patience, shaped like a candle.', per: '+0.6 flame regained each second' }
  };

  /* evolutions — a weapon at level 5 + its paired passive becomes something else entirely.
     offered as a golden card once you qualify (and always at a snuffer's chest). */
  const EVOS = {
    flicker: { evo: 'sunpiercer', req: 'bright', name: 'Sunpiercer',  icon: IC.flare,
               flavor: 'A line drawn clean through the dark.',
               blurb: 'lances pierce everything and scorch a burning trail' },
    cinder:  { evo: 'halo',       req: 'draft',  name: 'Halo of Ash',  icon: IC.orbit,
               flavor: 'A wheel of fire that never tires.',
               blurb: 'a solid ring of flame that also draws in sparks' },
    tallow:  { evo: 'pyre',       req: 'wax',    name: 'Pyre',         icon: IC.burst,
               flavor: 'Leave the fire where it falls.',
               blurb: 'each burst leaves a lingering pool of flame' },
    scatter: { evo: 'wildfire',   req: 'brisk',  name: 'Wildfire',     icon: IC.spark,
               flavor: 'Run, and let it spread.',
               blurb: 'a roaring cone of fire that pours where you face' },
    foxfire: { evo: 'wisppack',   req: 'hands',  name: 'Wisp Pack',    icon: IC.fox,
               flavor: 'They hunt for you now, and never tire.',
               blurb: 'undying wisps that hunt, chain, and leave embers' }
  };

  const ETYPES = {
    moth:    { hp: 14,  spd: 56,  dmg: 8,  r: 11, xp: 1, eye: '#ffab4a', eyeS: 2.2 },
    skitter: { hp: 10,  spd: 124, dmg: 6,  r: 8,  xp: 1, eye: '#7be8ff', eyeS: 1.8 },
    blob:    { hp: 42,  spd: 40,  dmg: 10, r: 16, xp: 3, eye: '#c98aff', eyeS: 2.4, split: true },
    blobette:{ hp: 12,  spd: 78,  dmg: 6,  r: 9,  xp: 1, eye: '#c98aff', eyeS: 1.8 },
    spitter: { hp: 30,  spd: 48,  dmg: 10, r: 12, xp: 3, eye: '#8aff9e', eyeS: 2.2, ranged: true },
    brute:   { hp: 135, spd: 33,  dmg: 22, r: 22, xp: 8, eye: '#ff5d5d', eyeS: 3 },
    // gloom — armored tank: flat damage soak punishes single-target, rewards AoE
    gloom:   { hp: 240, spd: 30,  dmg: 26, r: 24, xp: 12, eye: '#9fb4ff', eyeS: 3, arm: 7 },
    // wisp — light-eater: drifts close and drinks your flame's reach (attacks the core mechanic)
    wisp:    { hp: 26,  spd: 74,  dmg: 5,  r: 12, xp: 2, eye: '#dfe9ff', eyeS: 2.4, drains: true },
    // thief — a big, rare scavenger that roams hoovering up your fallen sparks; kill it to get them back, or let your hoard run off into the dark
    thief:   { hp: 150, spd: 138, dmg: 5,  r: 19, xp: 5, eye: '#ffe066', eyeS: 3.4, steals: true },
    snuffer: { hp: 380, spd: 62,  dmg: 16, r: 17, xp: 0, eye: '#cfe2ff', eyeS: 3.2, elite: true },
    // mourn — the unlit: a multi-phase melee charger; the FIRST boss wall
    mourn:   { hp: 7500, spd: 48, dmg: 32, r: 46, xp: 0, eye: '#f4f0ff', eyeS: 6, boss: true },
    // hush — the gaunt lantern: a ranged spiral-caster that summons wisps to drink your light; the SECOND wall
    hush:    { hp: 11000, spd: 40, dmg: 24, r: 38, xp: 0, eye: '#bfe0ff', eyeS: 5, boss: true, gaunt: true },
    // gutter — the leaping dark: blinks, scatters bullets, then leaps and slams concentric waves; the DAWN finale
    gutter:  { hp: 16000, spd: 70, dmg: 30, r: 30, xp: 0, eye: '#d6a8ff', eyeS: 5, boss: true, leaper: true }
  };

  const DEATH_LINES = [
    'the dark keeps what it catches.',
    'a thin ribbon of smoke, rising.',
    'somewhere, a window goes cold.',
    'the moths will tell stories of this.',
    'even long candles end.'
  ];

  /* ---------------- state ---------------- */

  const STEP = 1 / 60;
  let state = 'title'; // title | playing | levelup | paused | dying | gameover | victory
  let acc = 0;

  let enemies = [], bullets = [], ebullets = [], gems = [], pickups = [];
  let particles = [], floaters = [], rings = [];
  let eyesList = [], lights = [];
  let motes = []; // title screen only
  let eid = 1;

  const P = {};
  const G = {};
  let camX = 0, camY = 0;
  let flames = [];        // lingering ground-fire (pyre / wildfire / evolved bursts)
  let waves = [];         // expanding damaging shockwaves (the gutterer's slam)
  let chosenStart = 'flicker'; // starting flame picked on the title screen

  const DAWN = 900;       // first light at 15:00 — a long night

  function resetWorld() {
    enemies = []; bullets = []; ebullets = []; gems = []; pickups = [];
    particles = []; floaters = []; rings = []; flames = []; waves = [];
    Object.assign(P, {
      x: 0, y: 0, hp: 100, maxHp: 100, speed: 175,
      dmgMul: 1, cdMul: 1, pickupR: 60, armor: 0, regen: 0, crit: 0.08,
      iframes: 0, faceX: 1, faceY: 0, moving: false, moveT: 0,
      weapons: [], passives: {}
    });
    P.weapons.push({ id: chosenStart, lvl: 1, t: 0.4, ang: Math.random() * TAU, wisps: [] });
    Object.assign(G, {
      time: 0, kills: 0, xp: 0, lvl: 1, xpNext: xpNeed(1),
      spawnT: 1.2, boss: null, won: false, winT: 0, endless: false,
      surgeT: 55, eBossT: 175, eBossPow: 1, bossIdx: 0,
      choiceQueue: [], pulse: 0, flashV: 0, deathT: 0, shake: 0,
      movedT: 0, noSpawn: false, thiefT: 150,
      lightDrain: 0, taughtHurt: false, taughtEvo: false, taughtWisp: false
    });
    // a long, escalating night — three boss walls before the dawn at 15:00
    // (the clock freezes during each boss, so the real night runs longer still)
    G.events = [
      { t: 38,  f: () => announce('something stirs out there') },
      { t: 76,  f: () => announce('they can see your light') },
      { t: 132, f: () => { announce('the dark presses in'); spawnRing('moth', 22); } },
      { t: 172, f: () => spawnElite() },
      { t: 210, f: () => { announce('cold things, that drink the light'); spawnRing('wisp', 7); } },
      { t: 258, f: () => { announce('something heavy wakes'); spawnRing('gloom', 3); spawnRing('skitter', 12); } },
      { t: 300, f: () => spawnBoss('mourn') },
      { t: 360, f: () => { announce('do not stop moving'); spawnRing('skitter', 18); spawnRing('blob', 9); } },
      { t: 402, f: () => spawnElite() },
      { t: 450, f: () => { announce('they hunger now'); spawnRing('brute', 8); spawnRing('gloom', 4); } },
      { t: 510, f: () => { announce('the swarm thickens'); spawnRing('wisp', 8); spawnRing('skitter', 16); } },
      { t: 552, f: () => spawnElite() },
      { t: 600, f: () => spawnBoss('hush') },
      { t: 660, f: () => { announce('no quarter now'); spawnRing('brute', 9); spawnRing('gloom', 5); } },
      { t: 712, f: () => { announce('blind and beset'); spawnRing('wisp', 10); spawnRing('moth', 16); } },
      { t: 754, f: () => spawnElite() },
      { t: 800, f: () => { announce('the night throws everything it has'); spawnRing('brute', 7); spawnRing('skitter', 18); spawnRing('gloom', 5); } },
      { t: 844, f: () => spawnElite() },
      { t: 872, f: () => { announce('first light is close — hold'); spawnRing('wisp', 9); spawnRing('blob', 10); } },
      { t: DAWN, f: () => spawnBoss('gutter') }
    ];
  }

  function xpNeed(lvl) {
    return 6 + lvl * 4 + Math.floor(Math.pow(lvl, 1.65));
  }

  function lvOf(id) { return P.passives[id] || 0; }

  function recalcStats() {
    P.maxHp = 100 + 25 * lvOf('wick');
    P.speed = 175 * (1 + 0.10 * lvOf('brisk'));
    P.dmgMul = 1 + 0.12 * lvOf('bright');
    P.cdMul = Math.pow(0.92, lvOf('hands'));
    P.pickupR = 60 * (1 + 0.3 * lvOf('draft'));
    P.armor = lvOf('wax');
    P.regen = 0.6 * lvOf('melt');
    P.hp = Math.min(P.hp, P.maxHp);
  }

  function wstat(w, key) {
    const v = WEAPONS[w.id].stats[key];
    return Array.isArray(v) ? v[w.lvl - 1] : v;
  }

  /* ---------------- difficulty ---------------- */

  function hpMul() {
    const m = G.time / 60;
    let v = 1 + 0.18 * m + 0.016 * m * m;
    if (G.endless) v *= 1 + 0.28 * (G.eBossPow - 1);
    return v;
  }
  function dmgScale() {
    return Math.min(2.6, 1 + 0.07 * (G.time / 60));
  }

  /* ---------------- spawning ---------------- */

  function offR() { return Math.hypot(W, H) / 2 + 70; }

  function spawnEnemy(type, ang, distMul) {
    const def = ETYPES[type];
    if (ang === undefined) ang = Math.random() * TAU;
    const d = offR() * (distMul || 1) + rand(0, 60);
    const e = {
      id: eid++, type, def,
      x: P.x + Math.cos(ang) * d,
      y: P.y + Math.sin(ang) * d,
      hp: def.hp * hpMul(), maxHp: def.hp * hpMul(),
      spd: def.spd * rand(0.9, 1.1),
      r: def.r, dmg: def.dmg * dmgScale(), xpv: def.xp,
      arm: def.arm || 0, carry: 0,
      phase: Math.random() * TAU,
      hitT: 0, orbitT: 0, fireT: rand(1, 3), flash: 0,
      kbx: 0, kby: 0, dead: false
    };
    if (def.boss) {
      // shared boss fields; each boss reads what it needs
      e.bState = 'chase'; e.bT = 2.2; e.cdx = 1; e.cdy = 0;
      e.spinA = 0; e.phaseN = 1; e.summonT = 4; e.castT = 3.2;
      e.blinks = 0; e.lx = e.x; e.ly = e.y; // leaper (gutter) blink/leap bookkeeping
    }
    enemies.push(e);
    return e;
  }

  function spawnRing(type, count) {
    for (let i = 0; i < count; i++) {
      spawnEnemy(type, (i / count) * TAU + rand(-0.1, 0.1));
    }
  }

  function spawnElite() {
    announce('a snuffer comes');
    spawnEnemy('snuffer');
  }

  const BOSS_INFO = {
    hush:   { name: 'hush, the gaunt lantern', shout: 'HUSH, THE GAUNT LANTERN' },
    gutter: { name: 'gutter, the leaping dark', shout: 'GUTTER, THE LEAPING DARK' },
    mourn:  { name: 'mourn, the unlit',        shout: 'MOURN, THE UNLIT' }
  };

  function spawnBoss(kind) {
    if (kind === 1 || kind === undefined) kind = 'mourn'; // legacy safety
    const info = BOSS_INFO[kind];
    announce(info.shout, true);
    Sound.play('boss');
    const e = spawnEnemy(kind, undefined, 0.9);
    const epow = G.endless ? (1 + 0.42 * (G.eBossPow - 1)) : 1;
    e.hp = e.maxHp = ETYPES[kind].hp * epow;
    G.boss = e;
    $('bossname').textContent = info.name;
    $('bosswrap').classList.remove('hidden');
    addShake(10);
  }

  function pickType() {
    const m = G.time / 60;
    const w = [['moth', 5]];
    if (m > 0.8) w.push(['skitter', 3]);
    if (m > 1.8) w.push(['blob', 2.5]);
    if (m > 3.2) w.push(['spitter', 2]);
    if (m > 3.6) w.push(['wisp', 1.4]);
    if (m > 4.6) w.push(['brute', 1.6]);
    if (m > 5.2) w.push(['gloom', 1.2]);
    let total = 0;
    for (const [, wt] of w) total += wt;
    let roll = Math.random() * total;
    for (const [t, wt] of w) { roll -= wt; if (roll <= 0) return t; }
    return 'moth';
  }

  function spawnTick(dt) {
    if (G.noSpawn) return;
    G.spawnT -= dt;
    if (G.spawnT > 0) return;
    const m = G.time / 60;
    // while a boss holds the floor, the swarm thins to a light trickle so the fight reads
    const bossThin = G.bossUp ? 2 : 1;
    G.spawnT = clamp(1.3 - 0.1 * m, 0.3, 2) * (G.endless ? 0.5 : 1) * bossThin;
    let n = Math.round((1 + Math.floor(m / 2.0) + (G.endless ? 2 : 0)) * 1.25);
    if (G.bossUp) n = Math.max(1, Math.round(n * 0.5));
    for (let i = 0; i < n; i++) spawnEnemy(pickType());
  }

  /* ---------------- spatial grid ---------------- */

  const CELL = 64;
  const grid = new Map();
  const qarr = [];
  function gkey(x, y) {
    return (Math.floor(x / CELL) + 32768) * 65536 + (Math.floor(y / CELL) + 32768);
  }
  function gridBuild() {
    grid.clear();
    for (const e of enemies) {
      const k = gkey(e.x, e.y);
      let a = grid.get(k);
      if (!a) { a = []; grid.set(k, a); }
      a.push(e);
    }
  }
  function gridQuery(x, y, r) {
    qarr.length = 0;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const a = grid.get((cx + 32768) * 65536 + (cy + 32768));
        if (a) for (const e of a) qarr.push(e);
      }
    }
    return qarr;
  }

  function nearestEnemy(x, y, maxd) {
    let best = null, bd = maxd * maxd;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* ---------------- combat ---------------- */

  function damageEnemy(e, dmg, kdx, kdy, kb) {
    if (e.dead) return;
    let crit = Math.random() < P.crit;
    let d = dmg * (crit ? 1.6 : 1);
    if (e.arm) d = Math.max(1, d - e.arm); // gloom soaks a flat bite off every hit
    e.hp -= d;
    e.flash = 0.12;
    if (kb && !e.def.boss) {
      e.kbx += kdx * kb;
      e.kby += kdy * kb;
    }
    addFloater(e.x + rand(-6, 6), e.y - e.r - 4, Math.round(d), crit ? '#ffd34d' : '#f0ecdf', crit ? 16 : 12, crit);
    Sound.play('hit');
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    G.kills++;
    Sound.play('kill');
    puff(e.x, e.y, '#3a3450', 6, 70, 0.5, 3);
    puff(e.x, e.y, e.def.eye, 3, 50, 0.4, 2);

    if (e.def.boss) { bossDown(e); return; }

    if (e.def.split) {
      for (let i = 0; i < 2; i++) {
        const s = spawnEnemy('blobette', 0, 0);
        s.x = e.x + rand(-12, 12);
        s.y = e.y + rand(-12, 12);
      }
    }
    if (e.def.elite) {
      pickups.push({ type: 'chest', x: e.x, y: e.y });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        dropGem(e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, 3);
      }
      announce('it dropped something');
      return;
    }
    if (e.def.steals && e.carry > 0) {
      // a thief gives back everything it stole, plus a little for the trouble
      announce('your sparks, returned');
      let left = e.carry + Math.round(e.carry * 0.4);
      const lumps = Math.min(8, 2 + (left / 6 | 0));
      for (let i = 0; i < lumps; i++) {
        const a = (i / lumps) * TAU;
        dropGem(e.x + Math.cos(a) * 22, e.y + Math.sin(a) * 22, Math.ceil(left / (lumps - i)));
        left -= Math.ceil(left / (lumps - i));
      }
    }
    if (e.type === 'skitter') {
      // skitters leave a moth's spark, and half the time a second one
      const v = ETYPES.moth.xp * (G.endless ? 2 : 1);
      dropGem(e.x - 6, e.y, v);
      if (Math.random() < 0.5) dropGem(e.x + 6, e.y, v);
    } else if (e.xpv > 0) dropGem(e.x, e.y, e.xpv * (G.endless ? 2 : 1));
    if (Math.random() < 0.012) pickups.push({ type: 'heart', x: e.x, y: e.y });
    else if (G.time > 60 && Math.random() < 0.004) pickups.push({ type: 'magnet', x: e.x, y: e.y });
  }

  function dropGem(x, y, v) {
    if (gems.length > 260) {
      gems[(Math.random() * gems.length) | 0].v += v;
      return;
    }
    gems.push({ x, y, v, magnet: false, vx: rand(-30, 30), vy: rand(-30, 30) });
  }

  function bossDown(e) {
    G.boss = null;
    $('bosswrap').classList.add('hidden');
    Sound.play('bossdie');
    addShake(22);
    puff(e.x, e.y, '#c9b5ff', 40, 220, 1.2, 5);
    puff(e.x, e.y, '#ffd23f', 30, 160, 1, 4);

    const isFinal = e.type === 'gutter' && !G.endless;
    if (isFinal) {
      // the dawn boss — clear the field and break for first light
      for (const o of enemies) {
        if (!o.dead && !o.def.boss) {
          o.dead = true;
          puff(o.x, o.y, '#3a3450', 4, 60, 0.5, 3);
        }
      }
      G.winT = 1.5;
      G.noSpawn = true;
      return;
    }

    // a midboss (or any endless boss): big payout, a breath of relief, then the night goes on
    pickups.push({ type: 'chest', x: e.x, y: e.y });
    const lumps = G.endless ? 10 : 6, lv = G.endless ? 20 : 9;
    for (let i = 0; i < lumps; i++) {
      const a = (i / lumps) * TAU;
      dropGem(e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40, lv);
    }
    P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.22);
    pickups.push({ type: 'heart', x: e.x + 26, y: e.y });
    announce((BOSS_INFO[e.type] ? BOSS_INFO[e.type].name.split(',')[0] : 'the boss') + ' falls — but the night goes on');
  }

  function damagePlayer(dmg) {
    if (state !== 'playing' || P.iframes > 0) return;
    const d = Math.max(1, Math.round(dmg - P.armor));
    P.hp -= d;
    P.iframes = 0.55;
    G.flashV = 0.6;
    addShake(7);
    Sound.play('hurt');
    addFloater(P.x, P.y - 24, d, '#ff6b5d', 14, true);
    // teach the core conceit the first time it bites: light is life
    if (!G.taughtHurt && P.hp > 0) {
      G.taughtHurt = true;
      announce('the dark leans closer as your flame dims — stay bright');
    }
    if (P.hp <= 0) {
      P.hp = 0;
      startDeath();
    }
  }

  function startDeath() {
    state = 'dying';
    G.deathT = 1.8;
    Sound.stopMusic();
    Sound.play('death');
    addShake(12);
  }

  /* ---------------- lingering fire (evolutions) ---------------- */

  function addFlame(x, y, r, dmg, life) {
    if (flames.length > 70) flames.shift();
    flames.push({ x, y, r, dmg, life, maxlife: life, tickT: 0 });
  }

  function updateFlames(dt) {
    for (const f of flames) {
      f.life -= dt;
      f.tickT -= dt;
      if (f.tickT <= 0) {
        f.tickT = 0.22;
        const near = gridQuery(f.x, f.y, f.r + 50);
        for (const e of near) {
          if (e.dead) continue;
          if (dist2(f.x, f.y, e.x, e.y) < (f.r + e.r) * (f.r + e.r)) {
            damageEnemy(e, f.dmg, 0, 0, 0);
          }
        }
        if (Math.random() < 0.5) puff(f.x + rand(-f.r, f.r) * 0.6, f.y, '#ff9a3d', 1, 26, 0.5, 2);
      }
    }
    flames = flames.filter(f => f.life > 0);
  }

  /* ---------------- weapons ---------------- */

  function updateWeapons(dt) {
    G.haloR = 0; // halo of ash sets this to widen spark-gathering each frame
    for (const w of P.weapons) {
      if (w.evo) { updateEvolved(w, dt); continue; }
      if (w.id === 'flicker') {
        w.t -= dt;
        if (w.t <= 0) {
          const tgt = nearestEnemy(P.x, P.y, 560);
          if (!tgt) { w.t = 0.15; continue; }
          w.t = wstat(w, 'cd') * P.cdMul;
          const base = Math.atan2(tgt.y - P.y, tgt.x - P.x);
          const n = wstat(w, 'count'), spd = wstat(w, 'spd');
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.13;
            bullets.push({
              kind: 'bolt', x: P.x, y: P.y - 8,
              vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
              dmg: wstat(w, 'dmg') * P.dmgMul,
              pierce: wstat(w, 'pierce'), r: 5, life: 1.4, hit: new Set()
            });
          }
          Sound.play('shoot');
        }
      }
      else if (w.id === 'cinder') {
        w.ang += dt * WEAPONS.cinder.stats.spin;
        const n = wstat(w, 'count'), rad = wstat(w, 'rad');
        w.wisps.length = 0;
        for (let i = 0; i < n; i++) {
          const a = w.ang + (i / n) * TAU;
          const wx = P.x + Math.cos(a) * rad, wy = P.y + Math.sin(a) * rad;
          w.wisps.push({ x: wx, y: wy });
          const near = gridQuery(wx, wy, 42);
          for (const e of near) {
            if (e.dead || e.orbitT > 0) continue;
            if (dist2(wx, wy, e.x, e.y) < (12 + e.r) * (12 + e.r)) {
              e.orbitT = 0.45;
              const dd = Math.hypot(e.x - wx, e.y - wy) || 1;
              damageEnemy(e, wstat(w, 'dmg') * P.dmgMul, (e.x - wx) / dd, (e.y - wy) / dd, 70);
            }
          }
        }
      }
      else if (w.id === 'tallow') {
        w.t -= dt;
        if (w.t <= 0) {
          const rad = wstat(w, 'rad');
          const tgt = nearestEnemy(P.x, P.y, rad);
          if (!tgt) { w.t = 0.3; continue; }
          w.t = wstat(w, 'cd') * P.cdMul;
          Sound.play('nova');
          rings.push({ x: P.x, y: P.y, r: 20, maxr: rad, life: 0.38, maxlife: 0.38 });
          puff(P.x, P.y, '#ffcf6b', 14, 180, 0.5, 3);
          addShake(3);
          const near = gridQuery(P.x, P.y, rad + 50);
          for (const e of near) {
            if (e.dead) continue;
            if (dist2(P.x, P.y, e.x, e.y) < (rad + e.r) * (rad + e.r)) {
              const dd = Math.hypot(e.x - P.x, e.y - P.y) || 1;
              damageEnemy(e, wstat(w, 'dmg') * P.dmgMul, (e.x - P.x) / dd, (e.y - P.y) / dd, 160);
            }
          }
        }
      }
      else if (w.id === 'scatter') {
        w.t -= dt;
        if (w.t <= 0) {
          let ax = P.faceX, ay = P.faceY;
          if (!P.moving) {
            const tgt = nearestEnemy(P.x, P.y, 400);
            if (tgt) {
              const dd = Math.hypot(tgt.x - P.x, tgt.y - P.y) || 1;
              ax = (tgt.x - P.x) / dd; ay = (tgt.y - P.y) / dd;
            }
          }
          w.t = wstat(w, 'cd') * P.cdMul;
          const base = Math.atan2(ay, ax);
          const n = wstat(w, 'count'), spd = wstat(w, 'spd');
          for (let i = 0; i < n; i++) {
            const a = base + rand(-0.3, 0.3);
            const s = spd * rand(0.8, 1.15);
            bullets.push({
              kind: 'pellet', x: P.x, y: P.y,
              vx: Math.cos(a) * s, vy: Math.sin(a) * s,
              dmg: wstat(w, 'dmg') * P.dmgMul,
              pierce: 0, r: 3, life: wstat(w, 'life') * rand(0.85, 1.15), hit: new Set()
            });
          }
          Sound.play('spark');
        }
      }
      else if (w.id === 'foxfire') {
        w.t -= dt;
        if (w.t <= 0) {
          if (!enemies.length) { w.t = 0.25; continue; }
          w.t = wstat(w, 'cd') * P.cdMul;
          const n = wstat(w, 'count');
          for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU;
            bullets.push({
              kind: 'fox', x: P.x, y: P.y,
              vx: Math.cos(a) * 320, vy: Math.sin(a) * 320,
              dmg: wstat(w, 'dmg') * P.dmgMul,
              blast: wstat(w, 'blast'),
              target: null, r: 7, life: 3, pierce: 0, hit: new Set()
            });
          }
          Sound.play('foxfire');
        }
      }
    }
  }

  /* evolved weapons — earned, build-defining versions of the five flames */
  function updateEvolved(w, dt) {
    const m = P.dmgMul;
    if (w.evo === 'sunpiercer') {
      w.t -= dt;
      if (w.t <= 0) {
        const tgt = nearestEnemy(P.x, P.y, 720);
        if (!tgt) { w.t = 0.12; return; }
        w.t = 0.42 * P.cdMul;
        const base = Math.atan2(tgt.y - P.y, tgt.x - P.x);
        for (let i = 0; i < 4; i++) {
          const a = base + (i - 1.5) * 0.1;
          bullets.push({
            kind: 'bolt', lance: true, x: P.x, y: P.y - 8,
            vx: Math.cos(a) * 700, vy: Math.sin(a) * 700,
            dmg: 34 * m, pierce: 999, r: 8, life: 1.2, hit: new Set()
          });
        }
        Sound.play('shoot');
      }
    }
    else if (w.evo === 'halo') {
      w.ang += dt * 3.1;
      const n = 6, rad = 112;
      G.haloR = Math.max(G.haloR, rad + 16); // reel in sparks across the whole ring
      w.wisps.length = 0;
      for (let i = 0; i < n; i++) {
        const a = w.ang + (i / n) * TAU;
        const wx = P.x + Math.cos(a) * rad, wy = P.y + Math.sin(a) * rad;
        w.wisps.push({ x: wx, y: wy });
        const near = gridQuery(wx, wy, 46);
        for (const e of near) {
          if (e.dead || e.orbitT > 0) continue;
          if (dist2(wx, wy, e.x, e.y) < (18 + e.r) * (18 + e.r)) {
            e.orbitT = 0.16; // near-continuous burn — it's a solid wheel of fire now
            const dd = Math.hypot(e.x - wx, e.y - wy) || 1;
            damageEnemy(e, 16 * m, (e.x - wx) / dd, (e.y - wy) / dd, 50);
          }
        }
      }
      // the wheel of fire incinerates enemy shots that cross it
      for (const b of ebullets) {
        if (b.dead) continue;
        const pd2 = dist2(b.x, b.y, P.x, P.y);
        if (pd2 < (rad + 22) * (rad + 22) && pd2 > (rad - 26) * (rad - 26)) {
          b.dead = true;
          puff(b.x, b.y, '#ffcf6b', 5, 90, 0.3, 3);
        }
      }
    }
    else if (w.evo === 'pyre') {
      w.t -= dt;
      if (w.t <= 0) {
        const rad = 188;
        const tgt = nearestEnemy(P.x, P.y, rad + 40);
        if (!tgt) { w.t = 0.3; return; }
        w.t = 2.1 * P.cdMul;
        Sound.play('nova');
        rings.push({ x: P.x, y: P.y, r: 22, maxr: rad, life: 0.4, maxlife: 0.4 });
        puff(P.x, P.y, '#ffcf6b', 18, 200, 0.5, 3);
        addShake(4);
        const near = gridQuery(P.x, P.y, rad + 50);
        for (const e of near) {
          if (e.dead) continue;
          if (dist2(P.x, P.y, e.x, e.y) < (rad + e.r) * (rad + e.r)) {
            const dd = Math.hypot(e.x - P.x, e.y - P.y) || 1;
            damageEnemy(e, 40 * m, (e.x - P.x) / dd, (e.y - P.y) / dd, 170);
          }
        }
        // the burst leaves a pool of fire where you stand
        addFlame(P.x, P.y, rad * 0.62, 16 * m, 3.2);
      }
    }
    else if (w.evo === 'wildfire') {
      w.t -= dt;
      if (w.t <= 0) {
        w.t = 0.085;
        let ax = P.faceX, ay = P.faceY;
        if (!P.moving) {
          const tgt = nearestEnemy(P.x, P.y, 360);
          if (tgt) { const dd = Math.hypot(tgt.x - P.x, tgt.y - P.y) || 1; ax = (tgt.x - P.x) / dd; ay = (tgt.y - P.y) / dd; }
        }
        const base = Math.atan2(ay, ax);
        for (let i = 0; i < 4; i++) {
          const a = base + rand(-0.42, 0.42);
          const s = 430 * rand(0.8, 1.15);
          bullets.push({
            kind: 'pellet', ignite: true, x: P.x, y: P.y,
            vx: Math.cos(a) * s, vy: Math.sin(a) * s,
            dmg: 11 * m, pierce: 0, r: 4, life: 0.5 * rand(0.85, 1.15), hit: new Set()
          });
        }
        if (Math.random() < 0.5) Sound.play('spark');
      }
    }
    else if (w.evo === 'wisppack') {
      // maintain a pack of undying hunting wisps that orbit, chain, and leave embers
      const want = 4;
      let alive = 0;
      for (const b of bullets) if (b.kind === 'fox' && b.persist) alive++;
      w.t -= dt;
      if (alive < want && w.t <= 0) {
        w.t = 0.5;
        const a = Math.random() * TAU;
        bullets.push({
          kind: 'fox', persist: true, x: P.x, y: P.y,
          vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
          dmg: 30 * m, blast: 70, target: null,
          r: 8, life: 999, pierce: 0, hit: new Set(), rehit: 0
        });
        Sound.play('foxfire');
      }
    }
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      if (b.kind === 'fox') {
        const seekSpd = b.persist ? 360 : 320;
        if (!b.target || b.target.dead) b.target = nearestEnemy(b.x, b.y, 800);
        if (b.target) {
          const want = Math.atan2(b.target.y - b.y, b.target.x - b.x);
          const cur = Math.atan2(b.vy, b.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          const turn = clamp(diff, -6 * dt, 6 * dt);
          const a = cur + turn;
          b.vx = Math.cos(a) * seekSpd;
          b.vy = Math.sin(a) * seekSpd;
        }
        if (b.persist) {
          b.rehit -= dt;
          if (b.rehit <= 0) { b.hit.clear(); b.rehit = 0.4; } // undying wisp may bite again
        }
        if (Math.random() < 0.5) puff(b.x, b.y, b.persist ? '#ffb86b' : '#7be8ff', 1, 20, 0.3, 2);
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }

      const near = gridQuery(b.x, b.y, b.r + 50); // 50 covers the largest enemy radius
      for (const e of near) {
        if (e.dead || b.hit.has(e.id)) continue;
        const rr = e.r + b.r;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          b.hit.add(e.id);
          const sp = Math.hypot(b.vx, b.vy) || 1;
          if (b.kind === 'fox') {
            // burst
            puff(b.x, b.y, '#9fe8ff', 10, 140, 0.4, 3);
            rings.push({ x: b.x, y: b.y, r: 8, maxr: b.blast, life: 0.22, maxlife: 0.22 });
            damageEnemy(e, b.dmg, b.vx / sp, b.vy / sp, 120);
            const others = gridQuery(b.x, b.y, b.blast + 24);
            for (const o of others) {
              if (o.dead || o === e) continue;
              if (dist2(b.x, b.y, o.x, o.y) < (b.blast + o.r) * (b.blast + o.r)) {
                damageEnemy(o, b.dmg * 0.6, 0, 0, 0);
              }
            }
            if (b.persist) { addFlame(b.x, b.y, 26, b.dmg * 0.25, 1.4); break; } // wisp pack leaves embers, never dies
            b.dead = true;
            break;
          }
          damageEnemy(e, b.dmg, b.vx / sp, b.vy / sp, 90);
          if (b.lance) addFlame(e.x, e.y, 22, b.dmg * 0.18, 1.6); // sunpiercer scorches what it passes
          if (b.ignite && Math.random() < 0.4) addFlame(b.x, b.y, 20, b.dmg * 0.3, 1.1);
          if (b.pierce > 0) b.pierce--;
          else { b.dead = true; break; }
        }
      }
    }
    bullets = bullets.filter(b => !b.dead);
  }

  function updateEbullets(dt) {
    for (const b of ebullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }
      const rr = b.r + 11;
      if (dist2(b.x, b.y, P.x, P.y) < rr * rr) {
        damagePlayer(b.dmg);
        b.dead = true;
      }
    }
    ebullets = ebullets.filter(b => !b.dead);
  }

  /* ---------------- enemies ---------------- */

  function fireBossRing(e, spd, dmg) {
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + e.phase;
      ebullets.push({
        x: e.x, y: e.y,
        vx: Math.cos(a) * (spd || 150), vy: Math.sin(a) * (spd || 150),
        r: 6, dmg: (dmg || 18) * dmgScale(), life: 6
      });
    }
    Sound.play('nova');
  }

  /* mourn, the unlit — a melee charger with three phases */
  function updateMourn(e, dt, nx, ny) {
    e.bT -= dt;
    if (e.phaseN === 1 && e.hp < e.maxHp * 0.55) { e.phaseN = 2; announce('mourn comes apart at the seams'); addShake(8); }
    if (e.phaseN === 2 && e.hp < e.maxHp * 0.25) { e.phaseN = 3; announce('it will not be put out quietly', true); addShake(12); }
    const enraged = e.phaseN === 3;
    // from phase 2 on it slams the ground between charges — outrun the ring
    if (e.phaseN >= 2) {
      e.castT -= dt;
      if (e.castT <= 0) {
        e.castT = enraged ? 3.4 : 5.2;
        addWave(e.x, e.y, 0, enraged);
        if (enraged) addWave(e.x, e.y, 0.28, true);
        addShake(7); Sound.play('nova');
      }
    }
    if (e.bState === 'chase') {
      e.x += nx * e.spd * dt; e.y += ny * e.spd * dt;
      if (e.bT <= 0) { e.bState = 'tell'; e.bT = enraged ? 0.6 : 0.85; e.cdx = nx; e.cdy = ny; }
    } else if (e.bState === 'tell') {
      e.x -= e.cdx * 24 * dt;
      if (e.bT <= 0) { e.bState = 'charge'; e.bT = 0.6; addShake(4); }
    } else if (e.bState === 'charge') {
      e.x += e.cdx * 660 * dt; e.y += e.cdy * 660 * dt;
      if (Math.random() < 0.6) puff(e.x, e.y, '#5d5080', 1, 40, 0.4, 4);
      if (e.bT <= 0) {
        e.bState = 'post'; e.bT = 0.55;
        fireBossRing(e, enraged ? 175 : 150, enraged ? 22 : 18);
        if (enraged) { e.phase += 0.12; fireBossRing(e, 110, 16); } // a second, offset ring in the throes
        if (e.phaseN >= 2) for (let i = 0; i < 5; i++) spawnEnemy('moth', Math.random() * TAU, 0.6);
      }
    } else { // post
      e.x += nx * 20 * dt; e.y += ny * 20 * dt;
      if (e.bT <= 0) { e.bState = 'chase'; e.bT = enraged ? 1.2 : e.phaseN === 2 ? 1.8 : 2.3; }
    }
    if (Math.random() < 0.3) puff(e.x + rand(-30, 30), e.y - e.r + rand(-10, 10), '#241f38', 1, 16, 0.9, 5);
  }

  /* hush, the gaunt lantern — a floating spiral-caster that summons light-eaters */
  function updateHush(e, dt, nx, ny, d) {
    if (e.phaseN === 1 && e.hp < e.maxHp * 0.5) { e.phaseN = 2; announce('the lantern flares cold', true); addShake(8); }
    const p2 = e.phaseN >= 2;
    e.spinA += dt * (p2 ? 2.3 : 1.6);
    e.bT -= dt;
    if (p2 && e.bState === 'chase' && e.bT <= 0) { e.bState = 'dash'; e.bT = 0.5; e.cdx = nx; e.cdy = ny; addShake(3); }
    if (e.bState === 'dash') {
      e.x += e.cdx * 540 * dt; e.y += e.cdy * 540 * dt;
      if (Math.random() < 0.6) puff(e.x, e.y, '#3a5575', 1, 40, 0.4, 4);
      if (e.bT <= 0) { e.bState = 'chase'; e.bT = 3.2; }
    } else {
      // hover at mid-range and strafe
      const ideal = 250;
      let vx, vy;
      if (d > ideal + 45) { vx = nx * e.spd; vy = ny * e.spd; }
      else if (d < ideal - 45) { vx = -nx * e.spd; vy = -ny * e.spd; }
      else { vx = -ny * e.spd * 0.7; vy = nx * e.spd * 0.7; }
      e.x += vx * dt; e.y += vy * dt;
    }
    // a slow rotating spiral of cold bullets — readable, dodgeable
    e.fireT -= dt;
    if (e.fireT <= 0) {
      e.fireT = p2 ? 0.11 : 0.16;
      const arms = p2 ? 3 : 2;
      for (let k = 0; k < arms; k++) {
        const a = e.spinA + (k / arms) * TAU;
        ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 145, vy: Math.sin(a) * 145, r: 6, dmg: 13 * dmgScale(), life: 6 });
      }
    }
    // summon wisps to drink your light
    e.summonT -= dt;
    if (e.summonT <= 0) {
      e.summonT = p2 ? 6 : 9.5;
      const k = p2 ? 4 : 3;
      for (let i = 0; i < k; i++) spawnEnemy('wisp', Math.random() * TAU, 0.5);
      Sound.play('nova');
    }
    // an aimed lantern-volley to punish standing still
    e.castT -= dt;
    if (e.castT <= 0) {
      e.castT = p2 ? 2.6 : 3.9;
      const base = Math.atan2(P.y - e.y, P.x - e.x);
      for (let i = -2; i <= 2; i++) {
        ebullets.push({ x: e.x, y: e.y, vx: Math.cos(base + i * 0.12) * 210, vy: Math.sin(base + i * 0.12) * 210, r: 6, dmg: 14 * dmgScale(), life: 5 });
      }
      Sound.play('foxfire');
    }
    if (Math.random() < 0.4) puff(e.x + rand(-22, 22), e.y + rand(-22, 22), '#2a3a55', 1, 18, 0.6, 4);
  }

  /* gutter, the leaping dark — blinks around scattering shots, then leaps and slams concentric waves */
  function updateGutter(e, dt, nx, ny, d) {
    if (e.phaseN === 1 && e.hp < e.maxHp * 0.5) { e.phaseN = 2; announce('gutter splits the dark', true); addShake(8); }
    const p2 = e.phaseN >= 2;
    e.bT -= dt;
    if (e.bState === 'chase') { e.bState = 'blinkwait'; e.bT = 0.5; e.blinks = 0; e.blinkGoal = 4 + (Math.random() * 3 | 0); }
    else if (e.bState === 'blinkwait') {
      e.x += nx * e.spd * 0.3 * dt; e.y += ny * e.spd * 0.3 * dt;
      if (e.bT <= 0) {
        // blink to a new spot — erratic, and farther out with each jump of the cycle
        const a = Math.random() * TAU, dist = 220 + e.blinks * 45 + rand(0, 120);
        puff(e.x, e.y, '#6a4aa8', 8, 120, 0.4, 4);
        e.x = P.x + Math.cos(a) * dist; e.y = P.y + Math.sin(a) * dist;
        puff(e.x, e.y, '#9a6ad8', 14, 170, 0.5, 4); addShake(2); Sound.play('shoot');
        // a scatter of bolts at where you are now
        const base = Math.atan2(P.y - e.y, P.x - e.x), cnt = p2 ? 7 : 5;
        for (let i = 0; i < cnt; i++) {
          const aa = base + (i - (cnt - 1) / 2) * 0.16 + rand(-0.04, 0.04);
          ebullets.push({ x: e.x, y: e.y, vx: Math.cos(aa) * 235, vy: Math.sin(aa) * 235, r: 6, dmg: 13 * dmgScale(), life: 4 });
        }
        e.blinks++;
        if (e.blinks >= e.blinkGoal) { e.bState = 'leaptell'; e.bT = p2 ? 2.6 : 3.0; e.lx = P.x; e.ly = P.y; } // long, readable wind-up
        else { e.bT = p2 ? 0.9 : 1.2; } // longer pauses between teleports
      }
    } else if (e.bState === 'leaptell') {
      // landing locked where you stood — a full ~3s to read it and run off the mark
      if (e.bT <= 0) { e.bState = 'leap'; e.bT = 0.75; e.lsx = e.x; e.lsy = e.y; addShake(3); }
    } else if (e.bState === 'leap') {
      const k = 1 - clamp(e.bT / 0.75, 0, 1); // a slower, floatier arc
      e.x = lerp(e.lsx, e.lx, k); e.y = lerp(e.lsy, e.ly, k) - Math.sin(k * Math.PI) * 80; // an arc
      if (Math.random() < 0.7) puff(e.x, e.y, '#9a6ad8', 1, 50, 0.4, 4);
      if (e.bT <= 0) {
        e.x = e.lx; e.y = e.ly;
        addShake(13); Sound.play('nova');
        for (let i = 0; i < 3; i++) addWave(e.x, e.y, i * (p2 ? 0.22 : 0.3), p2);
        if (p2) for (let i = 0; i < 3; i++) spawnEnemy('skitter', Math.random() * TAU, 0.5);
        e.bState = 'blinkwait'; e.bT = 0.7; e.blinks = 0; e.blinkGoal = 4 + (Math.random() * 3 | 0);
      }
    }
  }

  function addWave(x, y, delay, fast) {
    waves.push({ x, y, r: 12, maxr: 380, spd: fast ? 520 : 430, band: 28, dmg: 22 * dmgScale(), delay: delay || 0, hit: false });
  }

  function updateWaves(dt) {
    for (const w of waves) {
      if (w.delay > 0) { w.delay -= dt; continue; }
      w.r += w.spd * dt;
      if (!w.hit) {
        const pd = Math.hypot(P.x - w.x, P.y - w.y);
        if (pd >= w.r - w.band && pd <= w.r + w.band) { damagePlayer(w.dmg); w.hit = true; }
      }
    }
    waves = waves.filter(w => w.r < w.maxr);
  }

  function updateEnemies(dt) {
    const far2 = Math.pow(offR() * 2.2, 2);
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.orbitT > 0) e.orbitT -= dt;
      if (e.hitT > 0) e.hitT -= dt;

      const dx = P.x - e.x, dy = P.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;

      if (e.def.boss) {
        if (e.def.gaunt) updateHush(e, dt, nx, ny, d);
        else if (e.def.leaper) updateGutter(e, dt, nx, ny, d);
        else updateMourn(e, dt, nx, ny);
      } else {
        let vx = nx * e.spd, vy = ny * e.spd;
        if (e.type === 'skitter') {
          const j = Math.sin(G.time * 6 + e.phase) * 0.85;
          vx += -ny * e.spd * j;
          vy += nx * e.spd * j;
        } else if (e.type === 'spitter') {
          if (d > 290) { /* approach */ }
          else if (d < 210) { vx = -nx * e.spd * 0.7; vy = -ny * e.spd * 0.7; }
          else { vx = -ny * e.spd * 0.4; vy = nx * e.spd * 0.4; } // strafe
          e.fireT -= dt;
          if (e.fireT <= 0 && d < 480) {
            e.fireT = 3;
            ebullets.push({
              x: e.x, y: e.y, vx: nx * 165, vy: ny * 165,
              r: 6, dmg: e.dmg, life: 5
            });
          }
        } else if (e.type === 'blob' || e.type === 'blobette') {
          const wob = 1 + 0.3 * Math.sin(G.time * 4 + e.phase);
          vx *= wob; vy *= wob;
        } else if (e.type === 'wisp') {
          // drifts in, then drinks your flame's reach from well outside arm's length
          const wob = Math.sin(G.time * 3 + e.phase) * 0.45;
          vx += -ny * e.spd * wob; vy += nx * e.spd * wob;
          e.draining = d < 240;
          e.fireT -= dt;
          if (e.draining && e.fireT <= 0) {
            e.fireT = 1.4;
            G.lightDrain = Math.min(2.6, G.lightDrain + 0.6);
            rings.push({ x: e.x, y: e.y, r: 6, maxr: 72, life: 0.42, maxlife: 0.42, cold: true });
            if (!G.taughtWisp) { G.taughtWisp = true; announce('a wisp is drinking your light — the dark closes in. put it out.'); }
            if (Math.random() < 0.7) puff(e.x, e.y, '#bcd4ff', 6, 90, 0.5, 3);
          }
        } else if (e.type === 'thief') {
          // priorities: 0) once its sack is full, bolt for the dark to escape with the loot
          //             1) keep away from the candle  2) grab sparks  3) orbit, never follow
          const full = e.carry >= 40;
          if (!full) {
            let tg = null, bd = 1e9;
            for (const g of gems) { if (g.dead) continue; const gd = dist2(e.x, e.y, g.x, g.y); if (gd < bd) { bd = gd; tg = g; } }
            if (tg && bd < (e.r + 14) * (e.r + 14)) { e.carry += tg.v; tg.dead = true; puff(e.x, e.y, '#ffe066', 5, 70, 0.4, 2); }
            if (d < 280) { vx = -nx * e.spd; vy = -ny * e.spd; }            // 1: too close — run
            else if (tg) { const gd = Math.sqrt(bd) || 1; vx = ((tg.x - e.x) / gd) * e.spd; vy = ((tg.y - e.y) / gd) * e.spd; } // 2: scoop
            else { const orbitR = 340, radial = clamp((d - orbitR) * 0.5, -e.spd, e.spd); vx = -ny * e.spd + nx * radial; vy = nx * e.spd + ny * radial; } // 3: orbit
          } else {
            vx = -nx * e.spd; vy = -ny * e.spd; // full — make for the edge of the world and gone
          }
        } else if (e.type === 'snuffer') {
          if (Math.random() < 0.25) puff(e.x, e.y - 10, '#1c1830', 1, 14, 0.8, 4);
        }
        e.x += vx * dt;
        e.y += vy * dt;
      }

      // knockback
      e.x += e.kbx * dt;
      e.y += e.kby * dt;
      const decay = Math.exp(-8 * dt);
      e.kbx *= decay;
      e.kby *= decay;

      // light separation so they don't fuse into a single blob
      if (!e.def.boss) {
        const near = gridQuery(e.x, e.y, e.r + 14);
        let pushed = 0;
        for (const o of near) {
          if (o === e || o.dead || pushed > 4) continue;
          const rr = e.r + o.r;
          const dd2 = dist2(e.x, e.y, o.x, o.y);
          if (dd2 > 0.01 && dd2 < rr * rr) {
            const dd = Math.sqrt(dd2);
            const push = (rr - dd) * 0.5;
            e.x += ((e.x - o.x) / dd) * push * 0.5;
            e.y += ((e.y - o.y) / dd) * push * 0.5;
            pushed++;
          }
        }
      }

      // contact damage
      const cr = e.r + 11;
      if (e.hitT <= 0 && dist2(e.x, e.y, P.x, P.y) < cr * cr) {
        e.hitT = 0.85;
        damagePlayer(e.dmg);
      }

      // wandered way off — bring it back around the player
      if (!e.def.boss && !e.def.elite && dist2(e.x, e.y, P.x, P.y) > far2) {
        if (e.def.steals && e.carry > 0) {
          // a laden thief that gets away keeps everything it stole — chase it or lose it
          e.dead = true;
          announce('a thief slipped into the dark with your sparks');
          continue;
        }
        const a = Math.random() * TAU;
        e.x = P.x + Math.cos(a) * offR();
        e.y = P.y + Math.sin(a) * offR();
      }
    }
    enemies = enemies.filter(e => !e.dead);
  }

  /* ---------------- pickups ---------------- */

  function updateGems(dt) {
    const gatherR = Math.max(P.pickupR, G.haloR || 0); // halo of ash reels sparks in across its ring
    const pr2 = gatherR * gatherR;
    for (const g of gems) {
      // scatter drift settles quickly
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.vx *= Math.exp(-4 * dt); g.vy *= Math.exp(-4 * dt);
      const d2 = dist2(g.x, g.y, P.x, P.y);
      if (g.magnet || d2 < pr2) {
        const d = Math.sqrt(d2) || 1;
        const sp = g.magnet ? 760 : lerp(720, 240, clamp(d / gatherR, 0, 1));
        g.x += ((P.x - g.x) / d) * sp * dt;
        g.y += ((P.y - g.y) / d) * sp * dt;
      }
      if (d2 < 16 * 16) {
        g.dead = true;
        Sound.play('pickup');
        gainXP(g.v);
      }
    }
    gems = gems.filter(g => !g.dead);

    for (const p of pickups) {
      if (dist2(p.x, p.y, P.x, P.y) < 20 * 20) {
        p.dead = true;
        if (p.type === 'heart') {
          P.hp = Math.min(P.maxHp, P.hp + 30);
          Sound.play('heart');
          addFloater(P.x, P.y - 26, '+30', '#7ee08a', 14, true);
        } else if (p.type === 'magnet') {
          Sound.play('chest');
          for (const g of gems) g.magnet = true;
        } else if (p.type === 'chest') {
          Sound.play('chest');
          P.hp = Math.min(P.maxHp, P.hp + 15);
          G.choiceQueue.push('chest');
        }
      }
    }
    pickups = pickups.filter(p => !p.dead);
  }

  function gainXP(v) {
    G.xp += v;
    while (G.xp >= G.xpNext) {
      G.xp -= G.xpNext;
      G.lvl++;
      G.xpNext = xpNeed(G.lvl);
      G.pulse = 1;
      G.choiceQueue.push('level');
      Sound.play('level');
    }
  }

  /* ---------------- fx ---------------- */

  function puff(x, y, color, n, spd, life, size) {
    if (particles.length > 380) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(spd * 0.3, spd);
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20,
        life: rand(life * 0.5, life), maxlife: life,
        size: rand(size * 0.5, size), color
      });
    }
  }

  function addFloater(x, y, txt, color, size, force) {
    if (!force && floaters.length > 48) return;
    floaters.push({ x: x, y: y, txt: String(txt), color, size, t: 0.8 });
  }

  function addShake(v) { G.shake = Math.min(18, G.shake + v); }

  let announceTimer = null;
  function announce(txt, grim) {
    const el = $('announce');
    el.textContent = txt;
    el.classList.toggle('grim', !!grim);
    el.classList.add('show');
    if (announceTimer) clearTimeout(announceTimer);
    announceTimer = setTimeout(() => el.classList.remove('show'), grim ? 3400 : 2500);
  }

  /* ---------------- level-up cards ---------------- */

  function weaponSlots() { return P.weapons.length; }
  function passiveSlots() { return Object.keys(P.passives).filter(k => P.passives[k] > 0).length; }

  /* which of the player's weapons are ready to evolve right now */
  function evoReady() {
    const out = [];
    for (const id in EVOS) {
      const ev = EVOS[id];
      const owned = P.weapons.find(w => w.id === id);
      // both the weapon AND its paired gift must be fully maxed (level 5)
      if (owned && !owned.evo && owned.lvl >= 5 && lvOf(ev.req) >= 5) out.push({ id, ev });
    }
    return out;
  }

  // teach the evolution system the first time one is reachable
  function checkEvoHint() {
    if (G.taughtEvo) return;
    if (evoReady().length) {
      G.taughtEvo = true;
      announce('a flame strains toward something more — claim it when you next grow');
    }
  }

  function rollChoices() {
    const picks = [];
    // a ready evolution always takes the first slot — earned, and impossible to miss
    const ready = evoReady();
    if (ready.length) {
      const pick = ready[(Math.random() * ready.length) | 0];
      picks.push({ type: 'evo', id: pick.id });
    }

    const pool = [];
    for (const id in WEAPONS) {
      const owned = P.weapons.find(w => w.id === id);
      if (owned) { if (!owned.evo && owned.lvl < 5) pool.push({ type: 'w', id, wgt: 3 }); }
      else if (weaponSlots() < 4) pool.push({ type: 'w', id, wgt: 2 });
    }
    for (const id in PASSIVES) {
      const lv = lvOf(id);
      if (lv > 0) { if (lv < 5) pool.push({ type: 'p', id, wgt: 3 }); }
      else if (passiveSlots() < 5) pool.push({ type: 'p', id, wgt: 2 });
    }
    while (picks.length < 3 && pool.length) {
      let total = 0;
      for (const c of pool) total += c.wgt;
      let roll = Math.random() * total;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) { roll -= pool[i].wgt; if (roll <= 0) { idx = i; break; } }
      picks.push(pool.splice(idx, 1)[0]);
    }
    const fillers = [{ type: 'snack' }, { type: 'flare' }];
    while (picks.length < 3 && fillers.length) picks.push(fillers.shift());
    return picks;
  }

  function describeWeaponUpgrade(id, lvl) {
    // lvl is the level being bought (2..5) — show targeted deltas, e.g. "damage +5 · projectiles +1"
    const stats = WEAPONS[id].stats;
    const sign = d => (d >= 0 ? '+' : '−') + (Math.round(Math.abs(d) * 100) / 100);
    const parts = [];
    for (const key in stats) {
      const v = stats[key];
      if (!Array.isArray(v)) continue;
      const a = v[lvl - 2], b = v[lvl - 1];
      if (a === b) continue;
      if (key === 'cd') parts.push('cooldown ' + sign(b - a) + 's');
      else if (key === 'count') {
        const dd = b - a, u = COUNT_UNIT[id] || 'projectile';
        parts.push('+' + dd + ' ' + u + (dd > 1 ? 's' : ''));
      }
      else parts.push((STAT_LABEL[key] || key) + ' ' + sign(b - a));
    }
    return parts.join(' · ');
  }

  function buildCard(c) {
    const btn = document.createElement('button');
    btn.className = 'card';
    let icon, name, tier, tierCls = '', desc, flav;
    if (c.type === 'w') {
      const def = WEAPONS[c.id];
      const owned = P.weapons.find(w => w.id === c.id);
      icon = def.icon; name = def.name; flav = def.flavor;
      if (owned) {
        tier = 'level ' + (owned.lvl + 1);
        desc = describeWeaponUpgrade(c.id, owned.lvl + 1);
      } else {
        tier = 'new!'; tierCls = 'new';
        desc = def.blurb;
      }
    } else if (c.type === 'p') {
      const def = PASSIVES[c.id];
      btn.classList.add('passive');
      icon = def.icon; name = def.name; flav = def.flavor;
      const lv = lvOf(c.id);
      tier = lv > 0 ? 'level ' + (lv + 1) : 'new!';
      if (lv === 0) tierCls = 'new';
      desc = def.per;
    } else if (c.type === 'evo') {
      const ev = EVOS[c.id];
      btn.classList.add('evo');
      icon = ev.icon; name = ev.name; flav = ev.flavor;
      tier = 'evolution'; tierCls = 'evoTier';
      desc = '<b>' + WEAPONS[c.id].name + '</b> becomes more — ' + ev.blurb;
    } else if (c.type === 'snack') {
      btn.classList.add('passive');
      icon = IC.heart; name = 'Wax Snack'; flav = 'Tastes like a quiet afternoon.';
      tier = 'consumable'; desc = 'restore 40 flame, right now';
    } else { // flare
      icon = IC.flare; name = 'Flare'; flav = 'For one breath, the night blinks first.';
      tier = 'consumable'; desc = 'scorch every shadow you can see';
    }

    btn.innerHTML =
      '<div class="cicon">' + icon + '</div>' +
      '<div class="cname">' + name + '</div>' +
      '<div class="ctier ' + tierCls + '">' + tier + '</div>' +
      '<div class="cdesc">' + desc + '</div>' +
      '<div class="cflav">&ldquo;' + flav + '&rdquo;</div>';
    btn.addEventListener('click', () => {
      Sound.play('click');
      applyChoice(c);
      refreshLoadout();
      processQueue();
    });

    const wrap = document.createElement('div');
    wrap.className = 'cardwrap';
    wrap.appendChild(btn);

    // upgrades that are an evolution key wear an "EVO:" tag BELOW the card,
    // showing the icon of the weapon they evolve (e.g. Drawing Draft → Cinderlings)
    if (c.type === 'p') {
      for (const wid in EVOS) {
        if (EVOS[wid].req === c.id) {
          const tag = document.createElement('div');
          tag.className = 'cardEvoTag';
          tag.innerHTML = 'EVO: <span class="evoIco">' + WEAPONS[wid].icon + '</span>';
          tag.title = 'maxing this evolves ' + WEAPONS[wid].name + ' into ' + EVOS[wid].name;
          wrap.appendChild(tag);
          break;
        }
      }
    }
    return wrap;
  }

  function applyChoice(c) {
    if (c.type === 'w') {
      const owned = P.weapons.find(w => w.id === c.id);
      if (owned) owned.lvl++;
      else P.weapons.push({ id: c.id, lvl: 1, t: 0.3, ang: Math.random() * TAU, wisps: [] });
      checkEvoHint();
    } else if (c.type === 'evo') {
      const owned = P.weapons.find(w => w.id === c.id);
      if (owned) { owned.evo = EVOS[c.id].evo; owned.lvl = 5; owned.t = 0.2; }
      announce(EVOS[c.id].name + ' is born', true);
      addShake(10); G.flashV = 0.4;
      puff(P.x, P.y, '#ffd23f', 30, 280, 0.8, 5);
      Sound.play('win');
    } else if (c.type === 'p') {
      P.passives[c.id] = lvOf(c.id) + 1;
      recalcStats();
      if (c.id === 'wick') P.hp = Math.min(P.maxHp, P.hp + 25);
      checkEvoHint();
    } else if (c.type === 'snack') {
      P.hp = Math.min(P.maxHp, P.hp + 40);
    } else if (c.type === 'flare') {
      addShake(8);
      G.flashV = 0.3;
      puff(P.x, P.y, '#ffd23f', 24, 260, 0.7, 4);
      for (const e of enemies) {
        if (e.dead) continue;
        const dd = Math.hypot(e.x - P.x, e.y - P.y) || 1;
        damageEnemy(e, 60 + G.lvl * 2, (e.x - P.x) / dd, (e.y - P.y) / dd, 240);
      }
    }
  }

  function openChoice(kind) {
    state = 'levelup';
    $('lvTitle').textContent = kind === 'chest' ? 'a gift in the dark' : 'the flame grows';
    $('lvSub').textContent = kind === 'chest' ? "from the snuffer's hoard" : 'choose, little light';
    const wrap = $('cards');
    wrap.innerHTML = '';
    for (const c of rollChoices()) wrap.appendChild(buildCard(c));
    $('levelup').classList.remove('hidden');
  }

  function processQueue() {
    if (G.choiceQueue.length) {
      openChoice(G.choiceQueue.shift());
    } else {
      $('levelup').classList.add('hidden');
      if (state === 'levelup') state = 'playing';
    }
  }

  function maybeOpenChoices() {
    if (state === 'playing' && G.choiceQueue.length) processQueue();
  }

  /* ---------------- hud ---------------- */

  function refreshLoadout() {
    const el = $('loadout');
    el.innerHTML = '';
    for (const w of P.weapons) {
      const s = document.createElement('div');
      s.className = 'slot';
      let pips = '<div class="pips">';
      for (let i = 0; i < 5; i++) pips += '<div class="pip' + (i < w.lvl ? ' on' : '') + '"></div>';
      pips += '</div>';
      s.innerHTML = WEAPONS[w.id].icon + pips;
      s.title = WEAPONS[w.id].name + ' — level ' + w.lvl;
      el.appendChild(s);
    }
  }

  function updateHud() {
    $('hpfill').style.width = (100 * P.hp / P.maxHp) + '%';
    $('hptext').textContent = Math.ceil(P.hp);
    $('xpfill').style.width = (100 * G.xp / G.xpNext) + '%';
    $('timer').textContent = fmtTime(G.time);
    $('lvl').textContent = 'lv ' + G.lvl;
    $('kills').textContent = G.kills;
    if (G.boss && !G.boss.dead) {
      $('bossfill').style.width = (100 * Math.max(0, G.boss.hp) / G.boss.maxHp) + '%';
    }
  }

  /* ---------------- flow ---------------- */

  function hideAllOverlays() {
    for (const id of ['title', 'levelup', 'pause', 'gameover', 'victory']) {
      $(id).classList.add('hidden');
    }
  }

  function dropFocus() {
    // keep Enter/Space from re-clicking whichever button was pressed last
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function startRun() {
    dropFocus();
    Sound.init();
    Sound.play('click');
    resetWorld();
    recalcStats();
    refreshLoadout();
    hideAllOverlays();
    $('hud').classList.remove('hidden');
    $('bosswrap').classList.add('hidden');
    $('hint').textContent = 'wasd or arrows to move';
    $('hint').style.opacity = 1;
    state = 'playing';
    SAVE.runs++;
    persist();
    Sound.startMusic();
  }

  function pauseGame() {
    state = 'paused';
    Sound.play('click');
    const st = $('pauseStats');
    let html =
      '<div class="row"><span>time in the dark</span><span>' + fmtTime(G.time) + '</span></div>' +
      '<div class="row"><span>flame level</span><span>' + G.lvl + '</span></div>' +
      '<div class="row"><span>shadows undone</span><span>' + G.kills + '</span></div><hr>';
    for (const w of P.weapons) {
      html += '<div class="row"><span>' + WEAPONS[w.id].name + '</span><span>lv ' + w.lvl + '</span></div>';
    }
    const ps = Object.keys(P.passives).filter(k => P.passives[k] > 0);
    if (ps.length) {
      html += '<hr>';
      for (const id of ps) {
        html += '<div class="row"><span>' + PASSIVES[id].name + '</span><span>lv ' + P.passives[id] + '</span></div>';
      }
    }
    st.innerHTML = html;
    $('pause').classList.remove('hidden');
  }

  function resumeGame() {
    dropFocus();
    Sound.play('click');
    $('pause').classList.add('hidden');
    state = 'playing';
  }

  function showGameOver() {
    state = 'gameover';
    Sound.stopMusic();
    if (G.time > SAVE.best) { SAVE.best = G.time; persist(); }
    $('goFlavor').textContent = pickFrom(DEATH_LINES);
    $('goStats').innerHTML =
      '<div class="row"><span>survived</span><span>' + fmtTime(G.time) + '</span></div>' +
      '<div class="row"><span>flame level</span><span>' + G.lvl + '</span></div>' +
      '<div class="row"><span>shadows undone</span><span>' + G.kills + '</span></div>' +
      '<div class="row"><span>longest night</span><span>' + fmtTime(SAVE.best) + '</span></div>';
    $('hud').classList.add('hidden');
    $('gameover').classList.remove('hidden');
  }

  function showVictory() {
    state = 'victory';
    G.won = true;
    Sound.stopMusic();
    Sound.play('win');
    SAVE.wins++;
    if (G.time > SAVE.best) SAVE.best = G.time;
    persist();
    $('vicStats').innerHTML =
      '<div class="row"><span>the night lasted</span><span>' + fmtTime(G.time) + '</span></div>' +
      '<div class="row"><span>flame level</span><span>' + G.lvl + '</span></div>' +
      '<div class="row"><span>shadows undone</span><span>' + G.kills + '</span></div>' +
      '<div class="row"><span>dawns seen</span><span>' + SAVE.wins + '</span></div>';
    $('victory').classList.remove('hidden');
  }

  function goEndless() {
    dropFocus();
    Sound.play('click');
    $('victory').classList.add('hidden');
    $('hud').classList.remove('hidden');
    G.endless = true;
    G.noSpawn = false;
    G.surgeT = 50;
    G.eBossT = 170;
    state = 'playing';
    Sound.startMusic();
    announce('the dark does not end. neither do you.');
  }

  function goToTitle() {
    dropFocus();
    Sound.play('click');
    Sound.stopMusic();
    $('flash').style.opacity = 0;
    hideAllOverlays();
    $('hud').classList.add('hidden');
    resetWorld();
    recalcStats();
    state = 'title';
    motes = [];
    renderBest();
    $('title').classList.remove('hidden');
  }

  function renderBest() {
    const bestEl = $('best');
    if (SAVE.best > 0) {
      bestEl.innerHTML = 'longest night: <b>' + fmtTime(SAVE.best) + '</b>' +
        (SAVE.wins > 0 ? ' &middot; dawns seen: <b>' + SAVE.wins + '</b>' : '');
    } else {
      bestEl.textContent = '';
    }
  }

  /* ---------------- update ---------------- */

  function update(dt) {
    if (state !== 'playing' && state !== 'dying') return;

    if (state === 'dying') {
      G.deathT -= dt;
      if (Math.random() < 0.4) puff(P.x, P.y - 16, '#5a5570', 1, 24, 1.2, 3);
      updateParticles(dt);
      updateFloaters(dt);
      updateRings(dt);
      if (G.deathT <= 0) showGameOver();
      return;
    }

    // while a boss is alive the night holds its breath: the clock, the scheduled
    // arrivals and the endless escalation all freeze until the boss is put down
    G.bossUp = !!(G.boss && !G.boss.dead);
    if (!G.bossUp) G.time += dt;

    // movement
    const [dx, dy] = inputDir();
    P.moving = !!(dx || dy);
    if (P.moving) {
      P.x += dx * P.speed * dt;
      P.y += dy * P.speed * dt;
      P.faceX = dx; P.faceY = dy;
      P.moveT += dt;
      G.movedT += dt;
      if (G.movedT > 1.2) $('hint').style.opacity = 0;
      if (Math.random() < 0.12) puff(P.x + rand(-6, 6), P.y + 10, '#2a2740', 1, 10, 0.5, 2);
    }
    if (P.iframes > 0) P.iframes -= dt;
    if (P.regen > 0) P.hp = Math.min(P.maxHp, P.hp + P.regen * dt);

    // events + endless escalation only advance when no boss is holding the floor
    if (!G.bossUp) {
      while (G.events.length && G.time >= G.events[0].t) {
        G.events.shift().f();
      }
      if (G.endless) {
        G.surgeT -= dt;
        if (G.surgeT <= 0) {
          G.surgeT = 55;
          announce('the dark presses in');
          spawnRing(pickFrom(['moth', 'skitter', 'blob', 'brute']), 16);
        }
        G.eBossT -= dt;
        if (G.eBossT <= 0) {
          G.eBossT = 180;
          G.eBossPow++;
          spawnBoss(['hush', 'gutter', 'mourn'][G.eBossPow % 3]); // endless rotates all three
        }
      }
      // a lone thief prowls in now and then — never in packs, at most two at once
      G.thiefT -= dt;
      if (G.thiefT <= 0) {
        G.thiefT = rand(30, 38);
        let nthief = 0;
        for (const e of enemies) if (e.type === 'thief' && !e.dead) nthief++;
        if (nthief < 2) spawnEnemy('thief');
      }
    }

    if (G.lightDrain > 0) G.lightDrain = Math.max(0, G.lightDrain - dt * 0.7); // light returns once the wisps are gone

    spawnTick(dt);
    gridBuild();
    updateWeapons(dt);
    updateBullets(dt);
    updateEbullets(dt);
    updateEnemies(dt);
    updateGems(dt);
    updateFlames(dt);
    updateWaves(dt);
    updateParticles(dt);
    updateFloaters(dt);
    updateRings(dt);

    if (G.pulse > 0) G.pulse -= dt * 1.4;

    if (G.winT > 0) {
      G.winT -= dt;
      if (G.winT <= 0) { showVictory(); return; }
    }

    maybeOpenChoices();
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-2 * dt);
      p.vy *= Math.exp(-2 * dt);
      p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);
  }

  function updateFloaters(dt) {
    for (const f of floaters) {
      f.y -= 34 * dt;
      f.t -= dt;
    }
    floaters = floaters.filter(f => f.t > 0);
  }

  function updateRings(dt) {
    for (const r of rings) r.life -= dt;
    rings = rings.filter(r => r.life > 0);
  }

  /* ---------------- drawing ---------------- */

  function drawPlayer(AT) {
    const hpRatio = P.maxHp > 0 ? P.hp / P.maxHp : 0;
    let fl = 0.55 + 0.45 * hpRatio;
    if (state === 'dying') fl *= clamp(G.deathT / 1.8, 0, 1);
    const flick = 1 + 0.18 * Math.sin(AT * 13) + 0.08 * Math.sin(AT * 29);
    const bob = P.moving ? Math.sin(P.moveT * 14) * 1.6 : Math.sin(AT * 2) * 0.7;
    const blink = (AT % 4.3) < 0.13;

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(P.x, P.y + 13, 11, 4, 0, 0, TAU);
    ctx.fill();

    if (P.iframes > 0 && Math.sin(AT * 42) > 0) ctx.globalAlpha = 0.4;

    // body — a stubby candle with drips
    const tilt = P.moving ? P.faceX * 0.06 : 0;
    ctx.save();
    ctx.translate(P.x, P.y + bob * 0.4);
    ctx.rotate(tilt);
    ctx.fillStyle = '#f2e8d5';
    ctx.beginPath();
    ctx.moveTo(-9, 13);
    ctx.lineTo(-9, -8);
    ctx.quadraticCurveTo(-9, -13, -4, -13);
    ctx.lineTo(5, -13);
    ctx.quadraticCurveTo(9, -13, 9, -8);
    ctx.lineTo(9, 13);
    ctx.closePath();
    ctx.fill();
    // drips
    ctx.beginPath();
    ctx.ellipse(-8, -6, 2.4, 4.5, 0, 0, TAU);
    ctx.ellipse(7, -2, 2, 3.8, 0, 0, TAU);
    ctx.fill();
    // face
    ctx.fillStyle = '#2a2438';
    if (blink) {
      ctx.fillRect(-5.4, -3.4, 3, 1.2);
      ctx.fillRect(2.4, -3.4, 3, 1.2);
    } else {
      ctx.beginPath();
      ctx.arc(-4, -3, 1.5, 0, TAU);
      ctx.arc(4, -3, 1.5, 0, TAU);
      ctx.fill();
    }
    // a small contented mouth
    ctx.strokeStyle = '#2a2438';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(0, 1.5, 2.2, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();

    // flame
    if (fl > 0.03) {
      const fx = P.x + tilt * -20, fy = P.y + bob * 0.4 - 13;
      drawGlow(ctx, fx, fy - 8, 46 * fl * flick, 'rgba(255,154,61,0.9)', 0.55);
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(1, 1 + 0.1 * Math.sin(AT * 17));
      ctx.fillStyle = 'rgba(255,140,58,0.92)';
      ctx.beginPath();
      ctx.ellipse(0, -8 * fl, 5.2 * fl * flick, 9.5 * fl * flick, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.ellipse(0, -7 * fl, 3 * fl, 5.8 * fl * flick, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff7e0';
      ctx.beginPath();
      ctx.ellipse(0, -6 * fl, 1.3 * fl, 2.6 * fl, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = 1;
  }

  function drawEnemy(e, AT) {
    const t = AT * 1 + e.phase;
    ctx.save();
    ctx.translate(e.x, e.y);

    if (e.type === 'moth') {
      const flap = Math.sin(t * 14) * 0.6;
      ctx.fillStyle = '#262335';
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.lineTo(-11, -3 - 7 * (1 + flap));
      ctx.lineTo(-7, 3);
      ctx.closePath();
      ctx.moveTo(0, -3);
      ctx.lineTo(11, -3 - 7 * (1 - flap));
      ctx.lineTo(7, 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2e2a40';
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.5, 7, 0, 0, TAU);
      ctx.fill();
    } else if (e.type === 'skitter') {
      ctx.strokeStyle = '#242136';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) {
        const la = (i / 4) * TAU + Math.sin(t * 18 + i) * 0.3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(la) * 12, Math.sin(la) * 12);
        ctx.stroke();
      }
      ctx.fillStyle = '#2b2740';
      ctx.beginPath();
      ctx.arc(0, 0, 6.5, 0, TAU);
      ctx.fill();
    } else if (e.type === 'blob' || e.type === 'blobette') {
      const wob = 1 + 0.09 * Math.sin(t * 5);
      ctx.fillStyle = '#2c2342';
      ctx.beginPath();
      ctx.ellipse(0, 0, e.r * wob, e.r / wob, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(160,120,220,0.12)';
      ctx.beginPath();
      ctx.ellipse(-e.r * 0.25, -e.r * 0.3, e.r * 0.35, e.r * 0.25, 0, 0, TAU);
      ctx.fill();
    } else if (e.type === 'spitter') {
      ctx.fillStyle = '#23202f';
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.quadraticCurveTo(11, -4, 9, 11);
      ctx.lineTo(-9, 11);
      ctx.quadraticCurveTo(-11, -4, 0, -15);
      ctx.fill();
    } else if (e.type === 'brute') {
      ctx.fillStyle = '#272135';
      ctx.beginPath();
      ctx.arc(-12, -4, 11, 0, TAU);
      ctx.arc(12, -4, 11, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
    } else if (e.type === 'gloom') {
      // a heavy, plated mass — slabs of cooled wax over a dark core
      const wob = 1 + 0.04 * Math.sin(t * 2.5);
      ctx.fillStyle = '#211b30';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * wob, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2c2742';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + t * 0.3;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(e.r * 0.62, 0, e.r * 0.34, e.r * 0.22, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(120,150,255,0.10)';
      ctx.beginPath();
      ctx.arc(-e.r * 0.3, -e.r * 0.3, e.r * 0.3, 0, TAU);
      ctx.fill();
    } else if (e.type === 'wisp') {
      // a cold pale flame, inverted — it gives no light, only takes
      const fl = 1 + 0.2 * Math.sin(t * 11) + 0.1 * Math.sin(t * 23);
      ctx.fillStyle = 'rgba(150,180,235,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6 * fl, 10 * fl, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1a2236';
      ctx.beginPath();
      ctx.ellipse(0, 1, 3.2, 5.4 * fl, 0, 0, TAU);
      ctx.fill();
    } else if (e.type === 'thief') {
      // a big hunched scurrier with a swollen sack of stolen sparks
      const sk = Math.sin(t * 18) * 2;
      ctx.fillStyle = '#2a2536';
      ctx.beginPath();
      ctx.ellipse(0, sk * 0.3, e.r * 0.78, e.r * 0.66, 0, 0, TAU);
      ctx.fill();
      // the sack glows brighter the more it's carrying
      const gl = clamp(e.carry / 30, 0.12, 1);
      ctx.fillStyle = 'rgba(255,224,102,' + (0.4 + 0.5 * gl) + ')';
      ctx.beginPath();
      ctx.arc(e.r * 0.55, -e.r * 0.3, 4 + 7 * gl, 0, TAU);
      ctx.fill();
      drawGlow(ctx, e.r * 0.55, -e.r * 0.3, (4 + 7 * gl) * 2.4, 'rgba(255,224,102,0.9)', 0.4 * gl);
      ctx.strokeStyle = '#201c2c';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-e.r * 0.4 + i * e.r * 0.27, e.r * 0.5);
        ctx.lineTo(-e.r * 0.42 + i * e.r * 0.27 + sk, e.r * 0.5 + 8);
        ctx.stroke();
      }
    } else if (e.type === 'snuffer') {
      const bobS = Math.sin(t * 3) * 2;
      ctx.fillStyle = '#1d1a30';
      ctx.beginPath();
      ctx.ellipse(0, bobS, 12, 22, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(120,150,255,0.1)';
      ctx.beginPath();
      ctx.ellipse(0, bobS - 8, 8, 9, 0, 0, TAU);
      ctx.fill();
    } else if (e.type === 'mourn') {
      // ragged mass
      ctx.fillStyle = '#1b1730';
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * TAU;
        const rr = e.r * (1 + 0.09 * Math.sin(a * 3 + t * 2.2));
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      // a crown of dead wicks — one more lights with each phase
      ctx.strokeStyle = (e.phaseN >= 3) ? '#ff5d5d' : '#0e0c1a';
      ctx.lineWidth = 4;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 18, -e.r + 6);
        ctx.lineTo(i * 22, -e.r - 14);
        ctx.stroke();
      }
    } else if (e.type === 'hush') {
      // a tall iron lantern frame around a cold core
      const sway = Math.sin(t * 2) * 0.05;
      ctx.rotate(sway);
      ctx.fillStyle = '#171a28';
      ctx.beginPath();
      ctx.moveTo(0, -e.r);
      ctx.quadraticCurveTo(e.r * 0.8, -e.r * 0.5, e.r * 0.7, e.r * 0.6);
      ctx.lineTo(-e.r * 0.7, e.r * 0.6);
      ctx.quadraticCurveTo(-e.r * 0.8, -e.r * 0.5, 0, -e.r);
      ctx.fill();
      // iron ribs
      ctx.strokeStyle = '#0c0e18';
      ctx.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * e.r * 0.45, -e.r * 0.7);
        ctx.lineTo(i * e.r * 0.5, e.r * 0.55);
        ctx.stroke();
      }
      // the cold core
      const core = e.phaseN >= 2 ? '#bfe0ff' : '#7fa8d8';
      const pulse = 0.5 + 0.4 * Math.sin(t * (e.phaseN >= 2 ? 8 : 4));
      ctx.fillStyle = core;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.ellipse(0, -e.r * 0.05, e.r * 0.34, e.r * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (e.type === 'gutter') {
      // a tattered leaping shade; stretches when it leaps, splits in two in phase 2
      const leaping = e.bState === 'leap';
      const sx = leaping ? 0.7 : 1, sy = leaping ? 1.4 : 1;
      const ragged = (off) => {
        ctx.beginPath();
        for (let i = 0; i <= 18; i++) {
          const a = (i / 18) * TAU;
          const rr = e.r * (1 + 0.16 * Math.sin(a * 4 + t * 3 + off)) ;
          const px = Math.cos(a) * rr * sx, py = Math.sin(a) * rr * sy;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      };
      if (e.phaseN >= 2) {
        ctx.fillStyle = '#211833';
        ctx.save(); ctx.translate(-e.r * 0.4, 0); ragged(1.7); ctx.restore();
        ctx.save(); ctx.translate(e.r * 0.4, 0); ragged(3.1); ctx.restore();
      } else {
        ctx.fillStyle = '#241a36';
        ragged(0);
      }
      // a violet inner spark
      ctx.fillStyle = '#c98aff';
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 9);
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.28, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (e.flash > 0) {
      ctx.globalAlpha = e.flash * 5;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 2, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // mourn's charge warning
    if (e.type === 'mourn' && e.bState === 'tell') {
      ctx.save();
      ctx.globalAlpha = 0.16 + 0.1 * Math.sin(AT * 24);
      ctx.strokeStyle = '#c9b5ff';
      ctx.lineWidth = e.r * 1.6;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + e.cdx * 460, e.y + e.cdy * 460);
      ctx.stroke();
      ctx.restore();
    }

    // eyes get drawn above the darkness so they watch you from the black
    const elook = Math.atan2(P.y - e.y, P.x - e.x);
    const ox = Math.cos(elook) * 2, oy = Math.sin(elook) * 2;
    const sep = e.def.eyeS * 1.9;
    const eyeY = e.def.boss ? e.y - 10 : e.y - 2;
    eyesList.push({ x: e.x - sep + ox, y: eyeY + oy, c: e.def.eye, s: e.def.eyeS });
    eyesList.push({ x: e.x + sep + ox, y: eyeY + oy, c: e.def.eye, s: e.def.eyeS });
  }

  function drawGroundAndProps() {
    ctx.fillStyle = groundPattern;
    ctx.fillRect(camX - 8, camY - 8, W + 16, H + 16);

    const cx0 = Math.floor(camX / CHUNK), cx1 = Math.floor((camX + W) / CHUNK);
    const cy0 = Math.floor(camY / CHUNK), cy1 = Math.floor((camY + H) / CHUNK);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (const p of chunkProps(cx, cy)) {
          if (p.t === 'pebble') {
            ctx.fillStyle = '#1a1828';
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, 4 * p.s, 3 * p.s, p.a, 0, TAU);
            ctx.ellipse(p.x + 6 * p.s, p.y + 2, 2.6 * p.s, 2 * p.s, p.a, 0, TAU);
            ctx.fill();
          } else if (p.t === 'shroom') {
            ctx.strokeStyle = '#2c3850';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x, p.y - 6 * p.s);
            ctx.stroke();
            ctx.fillStyle = '#5d86a8';
            ctx.beginPath();
            ctx.arc(p.x, p.y - 7 * p.s, 3.2 * p.s, 0, TAU);
            ctx.fill();
            lights.push({ x: p.x, y: p.y - 7 * p.s, r: 30 * p.s, a: 0.35 });
          } else {
            ctx.fillStyle = 'rgba(240,230,210,0.045)';
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, 14 * p.s, 9 * p.s, p.a, 0, TAU);
            ctx.fill();
          }
        }
      }
    }
  }

  function render(rdt) {
    const AT = performance.now() / 1000;

    // decay cosmetics on real time so they settle even in menus
    G.shake = Math.max(0, (G.shake || 0) - 40 * rdt);
    G.flashV = Math.max(0, (G.flashV || 0) - 1.6 * rdt);

    const shx = G.shake ? rand(-G.shake, G.shake) * 0.5 : 0;
    const shy = G.shake ? rand(-G.shake, G.shake) * 0.5 : 0;
    camX = P.x - W / 2 + shx;
    camY = P.y - H / 2 + shy;

    eyesList.length = 0;
    lights.length = 0;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (state === 'title') {
      renderTitle(rdt, AT);
      return;
    }

    ctx.save();
    ctx.translate(-camX, -camY);

    drawGroundAndProps();

    // lingering fire pools (pyre / wildfire / evolved bursts) — under the entities
    for (const f of flames) {
      const k = clamp(f.life / f.maxlife, 0, 1);
      const flick = 0.8 + 0.2 * Math.sin(AT * 16 + f.x * 0.05);
      drawGlow(ctx, f.x, f.y, f.r * flick, 'rgba(255,150,55,0.9)', 0.34 * k);
      ctx.globalAlpha = 0.22 * k;
      ctx.fillStyle = '#ff8a3a';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 0.55 * flick, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      lights.push({ x: f.x, y: f.y, r: f.r + 24, a: 0.5 * k });
    }

    // rings (nova shockwaves, foxfire pops, cold wisp pulses)
    for (const r of rings) {
      const k = 1 - r.life / r.maxlife;
      const rr = lerp(r.r, r.maxr, k);
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = r.cold ? '#9fc0ff' : '#ffcf6b';
      ctx.lineWidth = 4 * (1 - k) + 1.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rr, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (!r.cold) lights.push({ x: r.x, y: r.y, r: rr + 30, a: (1 - k) * 0.8 });
    }

    // pickups
    for (const p of pickups) {
      const bobP = Math.sin(AT * 3 + p.x) * 2;
      if (p.type === 'heart') {
        drawGlow(ctx, p.x, p.y + bobP, 18, 'rgba(255,93,93,0.8)', 0.5);
        ctx.fillStyle = '#ff5d5d';
        ctx.save();
        ctx.translate(p.x, p.y + bobP);
        ctx.beginPath();
        ctx.moveTo(0, 5);
        ctx.bezierCurveTo(-7, -1, -5, -7, 0, -3);
        ctx.bezierCurveTo(5, -7, 7, -1, 0, 5);
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'magnet') {
        drawGlow(ctx, p.x, p.y + bobP, 18, 'rgba(123,232,255,0.8)', 0.5);
        ctx.strokeStyle = '#7be8ff';
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y + bobP, 6, Math.PI * 0.15, Math.PI * 0.85, true);
        ctx.stroke();
      } else { // chest
        drawGlow(ctx, p.x, p.y + bobP, 24, 'rgba(255,210,63,0.8)', 0.55);
        ctx.fillStyle = '#8a6230';
        ctx.fillRect(p.x - 8, p.y + bobP - 6, 16, 12);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(p.x - 8, p.y + bobP - 2, 16, 3);
      }
      lights.push({ x: p.x, y: p.y, r: 52, a: 0.8 });
    }

    // enemies, player, wisps, bullets
    for (const e of enemies) drawEnemy(e, AT);
    drawPlayer(AT);

    for (const w of P.weapons) {
      if (w.id === 'cinder') {
        for (const wsp of w.wisps) {
          drawGlow(ctx, wsp.x, wsp.y, 18, 'rgba(255,154,61,0.9)', 0.6);
          ctx.fillStyle = '#ffd23f';
          ctx.beginPath();
          ctx.arc(wsp.x, wsp.y, 4, 0, TAU);
          ctx.fill();
          lights.push({ x: wsp.x, y: wsp.y, r: 36, a: 0.55 });
        }
      }
    }

    for (const b of bullets) {
      if (b.kind === 'bolt') {
        drawGlow(ctx, b.x, b.y, 16, 'rgba(255,180,80,0.9)', 0.6);
        ctx.fillStyle = '#ffe9a3';
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.beginPath();
        ctx.ellipse(0, 0, 7, 2.6, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
        lights.push({ x: b.x, y: b.y, r: 50, a: 0.6 });
      } else if (b.kind === 'pellet') {
        ctx.fillStyle = '#ffcf6b';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.2, 0, TAU);
        ctx.fill();
        lights.push({ x: b.x, y: b.y, r: 26, a: 0.4 });
      } else { // fox
        drawGlow(ctx, b.x, b.y, 20, 'rgba(123,232,255,0.9)', 0.7);
        ctx.fillStyle = '#d6f6ff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4.5, 0, TAU);
        ctx.fill();
        lights.push({ x: b.x, y: b.y, r: 64, a: 0.7 });
      }
    }

    // particles (under the darkness — distant deaths stay unseen)
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.maxlife, 0, 1) * 0.85;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    /* ---- darkness ---- */
    const hpRatio = P.maxHp > 0 ? P.hp / P.maxHp : 0;
    let lightR = 190 + 250 * hpRatio + (G.pulse > 0 ? G.pulse * 150 : 0);
    lightR = Math.max(120, lightR) * (1 + 0.015 * Math.sin(AT * 9));
    // wisps drink the light — your reach shrinks hard while they pulse on you
    if (G.lightDrain > 0) lightR *= 1 - 0.27 * clamp(G.lightDrain, 0, 2.6);
    if (state === 'dying') lightR = lerp(90, lightR, clamp(G.deathT / 1.8, 0, 1));
    if (G.boss && !G.boss.dead) {
      lights.push({ x: G.boss.x, y: G.boss.y, r: G.boss.def.gaunt ? 90 : 130, a: G.boss.def.gaunt ? 0.45 : 0.6 });
    }

    darkCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    darkCtx.clearRect(0, 0, W, H);
    darkCtx.fillStyle = 'rgba(5,4,12,0.94)';
    darkCtx.fillRect(0, 0, W, H);
    darkCtx.globalCompositeOperation = 'destination-out';
    darkCtx.globalAlpha = 1;
    darkCtx.drawImage(lightMask, P.x - camX - lightR, P.y - camY - lightR, lightR * 2, lightR * 2);
    for (const L of lights) {
      darkCtx.globalAlpha = L.a;
      darkCtx.drawImage(punchSprite, L.x - camX - L.r, L.y - camY - L.r, L.r * 2, L.r * 2);
    }
    darkCtx.globalAlpha = 1;
    darkCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(darkCv, 0, 0, W, H);

    /* ---- above the darkness: sparks, eyes, enemy shots, text ---- */
    ctx.save();
    ctx.translate(-camX, -camY);

    for (const g of gems) {
      const c = g.v >= 20 ? '#c98aff' : g.v >= 8 ? '#7be8ff' : g.v >= 3 ? '#ffb347' : '#ffe9a3';
      const sz = g.v >= 20 ? 5.5 : g.v >= 8 ? 4.6 : g.v >= 3 ? 3.8 : 3;
      const tw = 0.7 + 0.3 * Math.sin(AT * 6 + g.x * 0.1);
      drawGlow(ctx, g.x, g.y, sz * 4, c === '#ffe9a3' ? 'rgba(255,233,163,0.9)' : c, 0.5 * tw);
      ctx.fillStyle = c;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-sz / 1.5, -sz / 1.5, sz * 1.33, sz * 1.33);
      ctx.restore();
    }

    for (const b of ebullets) {
      drawGlow(ctx, b.x, b.y, 16, 'rgba(201,138,255,0.9)', 0.7);
      ctx.fillStyle = '#e7d4ff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, TAU);
      ctx.fill();
    }

    // the gutterer's slam waves — concentric purple rings you weave between
    for (const w of waves) {
      if (w.delay > 0) continue;
      const k = clamp(w.r / w.maxr, 0, 1);
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = '#b07cf0';
      ctx.lineWidth = w.band * 0.9;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.55;
      ctx.strokeStyle = '#ecd9ff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // the gutterer's landing reticle while it hangs in the air
    if (G.boss && !G.boss.dead && G.boss.def.leaper && (G.boss.bState === 'leaptell' || G.boss.bState === 'leap')) {
      const b = G.boss;
      ctx.globalAlpha = 0.3 + 0.25 * Math.sin(AT * 22);
      ctx.strokeStyle = '#d6a8ff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.lx, b.ly, 34, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.lx - 44, b.ly); ctx.lineTo(b.lx + 44, b.ly);
      ctx.moveTo(b.lx, b.ly - 44); ctx.lineTo(b.lx, b.ly + 44); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // wisp tethers — a visible thread of light being drunk out of you
    for (const e of enemies) {
      if (e.type === 'wisp' && e.draining) {
        ctx.globalAlpha = 0.22 + 0.16 * Math.sin(AT * 18 + e.phase);
        ctx.strokeStyle = '#bcd4ff';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(P.x, P.y); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    for (const ey of eyesList) {
      // eyes in your light are full bright; those well outside are dimmed hard — the dark hides what's far
      const lit = dist2(ey.x, ey.y, P.x, P.y) < (lightR * 0.92) * (lightR * 0.92) ? 1 : 0.125;
      drawGlow(ctx, ey.x, ey.y, ey.s * 4, ey.c, 0.55 * lit);
      ctx.globalAlpha = lit;
      ctx.fillStyle = ey.c;
      ctx.beginPath();
      ctx.arc(ey.x, ey.y, ey.s, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = 'center';
    for (const f of floaters) {
      ctx.globalAlpha = clamp(f.t / 0.4, 0, 1);
      ctx.font = '800 ' + f.size + 'px Mulish, sans-serif';
      ctx.fillStyle = f.color;
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // red flash / low-hp pulse
    const lowHp = (state === 'playing' && hpRatio < 0.3)
      ? 0.1 + 0.08 * Math.sin(AT * 5)
      : 0;
    $('flash').style.opacity = Math.max(G.flashV, lowHp);

    if (state !== 'gameover' && state !== 'victory') updateHud();
  }

  /* title screen: the candle alone in the dark, motes drifting */
  function renderTitle(rdt, AT) {
    if (motes.length < 40 && Math.random() < 0.3) {
      motes.push({
        x: rand(0, W), y: H + 10,
        vx: rand(-6, 6), vy: rand(-30, -12),
        s: rand(1, 2.6), tw: rand(0, TAU)
      });
    }
    for (const m of motes) {
      m.x += m.vx * rdt;
      m.y += m.vy * rdt;
    }
    motes = motes.filter(m => m.y > -20);

    ctx.save();
    ctx.translate(-camX, -camY);
    drawGroundAndProps();
    drawPlayer(AT);
    ctx.restore();

    const lightR = (340 + 14 * Math.sin(AT * 2)) * (1 + 0.015 * Math.sin(AT * 9));
    darkCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    darkCtx.clearRect(0, 0, W, H);
    darkCtx.fillStyle = 'rgba(5,4,12,0.93)';
    darkCtx.fillRect(0, 0, W, H);
    darkCtx.globalCompositeOperation = 'destination-out';
    darkCtx.drawImage(punchSprite, W / 2 - lightR, H / 2 - lightR, lightR * 2, lightR * 2);
    for (const L of lights) {
      darkCtx.globalAlpha = L.a;
      darkCtx.drawImage(punchSprite, L.x - camX - L.r, L.y - camY - L.r, L.r * 2, L.r * 2);
    }
    darkCtx.globalAlpha = 1;
    darkCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(darkCv, 0, 0, W, H);

    for (const m of motes) {
      const a = 0.25 + 0.25 * Math.sin(AT * 3 + m.tw);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffd9a0';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.s, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- main loop ---------------- */

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (state === 'playing' || state === 'dying') {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 5) {
        update(STEP);
        acc -= STEP;
        steps++;
      }
      if (steps === 5) acc = 0; // long stall — drop the backlog, keep the framerate
    }
    render(dt);
  }

  /* ---------------- buttons ---------------- */

  $('btnStart').addEventListener('click', startRun);
  $('btnHow').addEventListener('click', () => {
    Sound.init();
    Sound.play('click');
    $('howto').classList.toggle('hidden');
  });
  $('btnResume').addEventListener('click', resumeGame);
  $('btnRestart').addEventListener('click', startRun);
  $('btnQuitP').addEventListener('click', goToTitle);
  $('btnRetry').addEventListener('click', startRun);
  $('btnQuit1').addEventListener('click', goToTitle);
  $('btnEndless').addEventListener('click', goEndless);
  $('btnQuit2').addEventListener('click', goToTitle);

  /* ---------------- starting-flame picker ---------------- */

  const START_FLAMES = ['flicker', 'cinder', 'tallow', 'scatter', 'foxfire'];
  function buildFlamePicker() {
    const row = $('fpRow');
    if (!row) return;
    row.innerHTML = '';
    for (const id of START_FLAMES) {
      const def = WEAPONS[id];
      const b = document.createElement('button');
      b.className = 'fpBtn' + (id === chosenStart ? ' on' : '');
      b.innerHTML = def.icon;
      b.title = def.name;
      b.addEventListener('click', () => {
        chosenStart = id;
        Sound.init(); Sound.play('click');
        for (const c of row.children) c.classList.remove('on');
        b.classList.add('on');
        $('fpDesc').innerHTML = '<b>' + def.name + '</b> — ' + def.blurb;
      });
      row.appendChild(b);
    }
    const d = WEAPONS[chosenStart];
    $('fpDesc').innerHTML = '<b>' + d.name + '</b> — ' + d.blurb;
  }

  /* ---------------- boot ---------------- */

  Sound.setMute(SAVE.mute);
  resetWorld();
  recalcStats();
  buildFlamePicker();
  goToTitle();
  loadServerSave();
  requestAnimationFrame(frame);

})();
