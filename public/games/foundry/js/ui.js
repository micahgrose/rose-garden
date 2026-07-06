/* ============ Foundry — UI: build bar, panels, input, teaching ============ */
(function(root){
'use strict';
const F = root.F;
const R = F.render;
const A = F.audio;
const { DX, DY, clamp } = F;

const UI = F.ui = {
  S: null,
  tool: null, dir: 1,
  hover: null,           // [tx,ty] under cursor
  selection: null,
  activeCat: 'ext',
  bigTab: null,
  pointer: { x: 0, y: 0, down: false, btn: 0, id: null, panning: false, moved: 0,
             lastTile: null, mining: false, sx: 0, sy: 0, camx: 0, camy: 0 },
  mouse: { x: 0, y: 0 },
  holdStack: null,
  keys: {},
  toastSeen: {},
  autosaveT: 0,
  uiT: 0,
  arrow: null,
  started: false,
  cineStage: 0,
};

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const SAVE_KEY = 'foundry_save_v1';
const TS_KEY   = 'foundry_save_ts';

// RoseGarden account: if logged in, the saved world is tied to the user and
// follows them across devices. localStorage stays as an offline cache.
let RG_TOKEN = null;
try { RG_TOKEN = localStorage.getItem('rg_token'); } catch (e){}

function localSaveTs(){ try { return Number(localStorage.getItem(TS_KEY)) || 0; } catch (e){ return 0; } }

function serverSaveWorld(worldStr, ts){
  if (!RG_TOKEN || worldStr == null) return;
  try {
    fetch('/api/foundry/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + RG_TOKEN },
      body: JSON.stringify({ world: worldStr, updatedAt: ts })
    }).catch(() => {});
  } catch (e){}
}
function serverDeleteWorld(){
  if (!RG_TOKEN) return;
  try {
    fetch('/api/foundry/save', {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + RG_TOKEN }
    }).catch(() => {});
  } catch (e){}
}

/* ==================================================================== */
/* INIT                                                                 */
/* ==================================================================== */
UI.init = function(){
  R.init($('game'));
  root.addEventListener('resize', () => R.resize());

  bindPointer();
  bindKeys();
  bindHud();
  initTitle();

  // global mouse tracking for the cursor-held stack
  root.addEventListener('pointermove', (e) => {
    UI.mouse.x = e.clientX; UI.mouse.y = e.clientY;
    positionHeld();
  });
};

function hasSave(){
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e){ return false; }
}
UI.save = function(){
  if (!UI.S || R.cine || UI.S.testWorld) return;   // test worlds never touch the real save
  let worldStr = null;
  try { worldStr = JSON.stringify(F.serialize(UI.S)); } catch (e){ return; }
  const ts = Date.now();
  try { localStorage.setItem(SAVE_KEY, worldStr); localStorage.setItem(TS_KEY, String(ts)); } catch (e){}
  serverSaveWorld(worldStr, ts);   // mirror to the account (no-op if logged out)
};
function loadSave(){
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return F.deserialize(JSON.parse(raw));
  } catch (e){ return null; }
}
// pull the account's world on boot; newest of {account, local} wins.
async function syncAccountSave(btnC){
  if (!RG_TOKEN) return;
  try {
    const r = await fetch('/api/foundry/save', { headers: { 'Authorization': 'Bearer ' + RG_TOKEN } });
    if (!r.ok) return;
    const d = await r.json();                 // { world: string|null, updatedAt }
    const lTs = localSaveTs(), lHas = hasSave();
    if (d.world && (!lHas || d.updatedAt >= lTs)){
      // account has the newer world — pull it into the local cache and offer Continue
      try { localStorage.setItem(SAVE_KEY, d.world); localStorage.setItem(TS_KEY, String(d.updatedAt || Date.now())); } catch (e){}
      if (btnC) btnC.classList.remove('hidden');
    } else if (lHas && (!d.world || lTs > (d.updatedAt || 0))){
      // local world is newer (e.g. built before logging in) — migrate it up
      serverSaveWorld(localStorage.getItem(SAVE_KEY), lTs || Date.now());
    }
  } catch (e){}
}

/* ==================================================================== */
/* TITLE                                                                */
/* ==================================================================== */
let titleRaf = null;
function initTitle(){
  const btnC = $('btnContinue'), btnN = $('btnNew');
  if (hasSave()) btnC.classList.remove('hidden');
  syncAccountSave(btnC);   // reveals Continue if the account has a world
  btnC.addEventListener('click', () => {
    A.init(); A.resume();
    const S = loadSave();
    startGame(S || F.newGame());
  });
  btnN.addEventListener('click', () => {
    A.init(); A.resume();
    if (hasSave() && !btnN.dataset.confirm){
      btnN.dataset.confirm = '1';
      btnN.textContent = 'OVERWRITE SAVE?';
      setTimeout(() => { btnN.dataset.confirm = ''; btnN.textContent = 'NEW WORLD'; }, 2600);
      return;
    }
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(TS_KEY); } catch (e){}
    serverDeleteWorld();   // clear the account world too
    startGame(F.newGame());
  });
  startTitleFx();
}

function startTitleFx(){
  const fx = $('titleFx');
  const t0 = performance.now();
  if (titleRaf) cancelAnimationFrame(titleRaf);
  const tick = (now) => {
    if ($('title').classList.contains('hidden')) return;
    R.titleFx(fx, 0, (now - t0) / 1000);
    titleRaf = requestAnimationFrame(tick);
  };
  titleRaf = requestAnimationFrame(tick);
}

function quitToTitle(){
  returnHeld();
  UI.save();
  closeMenu();
  if (UI.bigTab) closeBig();
  select(null);
  UI.tool = null;
  UI.started = false;
  UI.S = null;
  R.cine = null;
  R.particles.length = 0;
  R.floats.length = 0;
  A.setActivity(0);
  $('hud').classList.add('hidden');
  $('winOverlay').classList.add('hidden');
  $('winOverlay').classList.remove('solid');
  $('title').classList.remove('hidden');
  $('btnContinue').classList.remove('hidden');
  startTitleFx();
}

/* dev/test sandbox: everything unlocked, deep pockets, never saved */
function startTestWorld(){
  const S = F.newGame();
  S.testWorld = true;
  for (const k in F.BUILDINGS) S.unlocked[k] = true;
  for (const k in F.RECIPES) S.unlocked['r:' + k] = true;
  for (const k in F.ITEMS) S.inv[k] = 1000;
  S.msIndex = F.MILESTONES.length - 1;   // sit at Ignition with all prior tiers done
  S.flags.welcomed = true;
  startGame(S);
  toast('<b>Test world</b> — every tier unlocked, 1000 of each item. Progress here is <b>not saved</b>.', 'warn', 10000);
}

function startGame(S){
  UI.S = S;
  R.particles.length = 0;
  R.floats.length = 0;
  R.cine = null;
  R.buildGround(S);
  // camera on core
  R.cam.x = S.core.x + S.core.w / 2;
  R.cam.y = S.core.y + S.core.h / 2;
  R.cam.zoom = 1.15;
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (titleRaf) cancelAnimationFrame(titleRaf);
  UI.started = true;
  buildTabs();
  buildBar();
  refreshObjective();
  if (S.msIndex === 0 && !S.flags.welcomed){
    S.flags.welcomed = true;
    toast('The Core is dark. Hold <b>left-click</b> on an ore deposit to mine by hand.', 'tip', 9000);
  }
}

/* ==================================================================== */
/* POINTER INPUT                                                        */
/* robust: state machine on the canvas; last-known position drives      */
/* everything each frame (no reliance on a steady event stream).        */
/* ==================================================================== */
function bindPointer(){
  const cv = $('game');
  const P = UI.pointer;

  cv.addEventListener('pointerdown', (e) => {
    A.init(); A.resume();
    if (UI.holdStack){ returnHeld(); return; }   // clicking the world drops the carried stack back in your pocket
    P.x = e.clientX; P.y = e.clientY;
    P.down = true; P.btn = e.button; P.id = e.pointerId;
    P.moved = 0; P.sx = e.clientX; P.sy = e.clientY;
    P.camx = R.cam.x; P.camy = R.cam.y;
    P.lastTile = tileUnder(e.clientX, e.clientY);
    P.panning = (e.button === 1);
    if (e.button === 0){
      if (UI.tool) placeAt(P.lastTile, true);
      // selection / mining resolved on up (if not dragged) or per-frame (mining)
    } else if (e.button === 2){
      if (UI.tool){ setTool(null); }
      else removeAt(P.lastTile);
    }
    // always capture: guarantees we see pointerup even if released off-window,
    // so held-to-mine / drag states can never stick
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  });

  cv.addEventListener('pointermove', (e) => {
    if (P.id !== null && e.pointerId !== P.id && P.down) return;
    const px = e.clientX, py = e.clientY;
    P.moved += Math.abs(px - P.x) + Math.abs(py - P.y);
    P.x = px; P.y = py;
    if (P.down && P.panning){
      const s = R.tilePx();
      R.cam.x = P.camx - (px - P.sx) / s;
      R.cam.y = P.camy - (py - P.sy) / s;
      clampCam();
      return;
    }
    if (P.down && P.btn === 0 && UI.tool){
      dragPlace(px, py);
    } else if (P.down && P.btn === 2 && !UI.tool){
      const t = tileUnder(px, py);
      if (t) removeAt(t);
    } else if (P.down && P.btn === 0 && !UI.tool){
      // drag-pan with left on empty ground (after small threshold, not while mining)
      if (P.moved > 8 && !P.mining){
        const s = R.tilePx();
        R.cam.x = P.camx - (px - P.sx) / s;
        R.cam.y = P.camy - (py - P.sy) / s;
        clampCam();
      }
    }
  });

  const endPointer = (e) => {
    if (P.id !== null && e.pointerId !== P.id) return;
    if (P.down && P.btn === 0 && !UI.tool && P.moved <= 8 && !P.mining){
      // a clean click: select
      const t = tileUnder(e.clientX, e.clientY);
      const ent = t && F.entAt(UI.S, t[0], t[1]);
      if (ent && ent.kind !== 'core') select(ent);
      else if (ent && ent.kind === 'core'){ openBig('milestones'); A.sfx.open(); }
      else select(null);
    }
    P.down = false; P.panning = false; P.mining = false; P.id = null;
    $('mineRing').classList.add('hidden');
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  root.addEventListener('blur', () => {
    P.down = false; P.panning = false; P.mining = false; P.id = null;
    UI.keys = {};
    $('mineRing').classList.add('hidden');
  });

  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!UI.S) return;
    const [wx, wy] = R.screenToWorld(e.clientX, e.clientY);
    const dz = e.deltaY > 0 ? .88 : 1.14;
    R.cam.zoom = clamp(R.cam.zoom * dz, .3, 2.6);
    // keep the point under the cursor fixed
    const [wx2, wy2] = R.screenToWorld(e.clientX, e.clientY);
    R.cam.x += wx - wx2; R.cam.y += wy - wy2;
    clampCam();
  }, { passive: false });

  cv.addEventListener('contextmenu', e => e.preventDefault());
}

function clampCam(){
  const S = UI.S;
  if (!S) return;
  R.cam.x = clamp(R.cam.x, 0, S.w);
  R.cam.y = clamp(R.cam.y, 0, S.h);
}

function tileUnder(px, py){
  if (!UI.S) return null;
  const [wx, wy] = R.screenToWorld(px, py);
  const tx = Math.floor(wx), ty = Math.floor(wy);
  if (!F.inMap(UI.S, tx, ty)) return null;
  return [tx, ty];
}

/* place with the active tool at tile (from pointer) */
function placeAt(t, first){
  if (!t || !UI.tool) return;
  const S = UI.S;
  const def = F.BUILDINGS[UI.tool];
  const [gx, gy] = ghostOrigin(t, def);
  const chk = F.canPlace(S, UI.tool, gx, gy, UI.dir);
  if (!chk.ok){
    if (first){
      if (chk.why === 'cost'){ A.sfx.error(); toastCost(def); }
      else if (chk.why !== 'occupied'){ A.sfx.error(); toast(cap(chk.why), 'warn', 2600); }
    }
    return;
  }
  const e = F.place(S, UI.tool, gx, gy, UI.dir, false);
  if (e){
    A.sfx.place();
    if (e.kind === 'belt') tipOnce('firstBelt');
    if (e.kind === 'splitter') tipOnce('firstSplitter');
    if (e.kind === 'pump') tipOnce('firstPipe');
    buildBarAfford();
  }
}

/* drag-lay 1x1 lines (belts, pipes) with auto-rotation; fills gaps */
function dragPlace(px, py){
  const S = UI.S;
  const def = F.BUILDINGS[UI.tool];
  if (!def) return;
  const t = tileUnder(px, py);
  if (!t) return;
  const P = UI.pointer;
  const last = P.lastTile;
  if (!last || (t[0] === last[0] && t[1] === last[1])) return;
  if (def.kind !== 'belt' && def.kind !== 'pipe'){
    P.lastTile = t;   // machines, tunnels, splitters: click to place, no drag-spam
    return;
  }
  // walk axis-major from last to current
  let [cx, cy] = last;
  let guard = 64;
  while ((cx !== t[0] || cy !== t[1]) && guard-- > 0){
    const dx = t[0] - cx, dy = t[1] - cy;
    let d;
    if (Math.abs(dx) >= Math.abs(dy)) d = dx > 0 ? 1 : 3;
    else d = dy > 0 ? 2 : 0;
    // rotate the belt we're leaving to point at the next tile
    if (def.kind === 'belt'){
      const prev = F.entAt(S, cx, cy);
      if (prev && prev.kind === 'belt' && F.BUILDINGS[prev.key] === def) prev.dir = d;
      UI.dir = d;
    }
    cx += DX[d]; cy += DY[d];
    placeAt([cx, cy], false);
  }
  P.lastTile = t;
}

function removeAt(t){
  if (!t) return;
  const e = F.entAt(UI.S, t[0], t[1]);
  if (!e || e.kind === 'core') return;
  if (UI.selection === e) select(null);
  F.remove(UI.S, t[0], t[1]);
  A.sfx.remove();
  buildBarAfford();
}

/* multi-tile ghosts centre on the cursor */
function ghostOrigin(t, def){
  return [t[0] - ((def.w - 1) >> 1), t[1] - ((def.h - 1) >> 1)];
}

/* ==================================================================== */
/* KEYBOARD                                                             */
/* ==================================================================== */
function bindKeys(){
  root.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    UI.keys[e.code] = true;
    if (!UI.started){
      // title screen: T = test world sandbox
      if (e.code === 'KeyT' && !$('title').classList.contains('hidden')){
        A.init(); A.resume();
        startTestWorld();
      }
      return;
    }
    switch (e.code){
      case 'KeyR': {
        UI.dir = (UI.dir + 1) & 3;
        if (!UI.tool && UI.selection && UI.selection.kind !== 'core'){
          UI.selection.dir = (UI.selection.dir + 1) & 3;
          refreshSelPanel();
        }
        A.sfx.rotate();
        break;
      }
      case 'KeyQ': {
        const t = UI.hover;
        const ent = t && F.entAt(UI.S, t[0], t[1]);
        if (ent && ent.kind !== 'core' && UI.S.unlocked[ent.key]) setTool(ent.key);
        break;
      }
      case 'KeyE': toggleBig('inventory'); break;
      case 'KeyU': toggleBig('milestones'); break;
      case 'KeyM': A.setOn(!A.on); $('btnSound').style.opacity = A.on ? 1 : .4; break;
      case 'KeyF': R.cam.x = UI.S.core.x + 2; R.cam.y = UI.S.core.y + 2; break;
      case 'Escape':
        if (UI.holdStack) returnHeld();
        else if (!$('menuPop').classList.contains('hidden')) closeMenu();
        else if (UI.bigTab) closeBig();
        else if (UI.tool) setTool(null);
        else if (UI.selection) select(null);
        else openMenu();
        break;
      case 'KeyH': toggleBig('howto'); break;
      default: {
        if (e.code.startsWith('Digit')){
          const n = +e.code.slice(5) - 1;
          const list = catBuildings(UI.activeCat);
          if (list[n] && UI.S.unlocked[list[n]]) setTool(list[n]);
        }
      }
    }
  });
  root.addEventListener('keyup', (e) => { UI.keys[e.code] = false; });
}

/* ==================================================================== */
/* HUD BINDINGS                                                         */
/* ==================================================================== */
function bindHud(){
  $('objHead').addEventListener('click', () => {
    $('objCard').classList.toggle('collapsed');
    A.sfx.click();
  });
  $('btnFoundry').addEventListener('click', () => toggleBig('milestones'));
  $('btnInv').addEventListener('click', () => toggleBig('inventory'));
  $('btnSound').addEventListener('click', () => {
    A.init(); A.resume();
    A.setOn(!A.on);
    $('btnSound').style.opacity = A.on ? 1 : .4;
  });
  $('btnMenu').addEventListener('click', toggleMenu);
  $('mResume').addEventListener('click', closeMenu);
  $('mHowto').addEventListener('click', () => { closeMenu(); openBig('howto'); });
  $('mSave').addEventListener('click', () => {
    UI.save();
    closeMenu();
    toast('Progress saved.', '', 1800);
  });
  $('mQuit').addEventListener('click', quitToTitle);
  $('bigClose').addEventListener('click', closeBig);
  $('bigPanelWrap').addEventListener('pointerdown', (e) => {
    if (e.target === $('bigPanelWrap')) closeBig();
  });
  $('btnFreeplay').addEventListener('click', () => {
    UI.S.freeplay = true;
    R.cine = null;
    $('winOverlay').classList.add('hidden');
    $('winOverlay').classList.remove('solid');
    UI.save();
  });
  // draw the little power bolt
  const pc = $('powerIcon').getContext('2d');
  pc.strokeStyle = 'rgba(0,0,0,0)';
  pc.fillStyle = '#59d6ff';
  pc.beginPath();
  pc.moveTo(15, 3); pc.lineTo(7, 15); pc.lineTo(12, 15);
  pc.lineTo(10, 23); pc.lineTo(19, 11); pc.lineTo(14, 11);
  pc.closePath(); pc.fill();
}

/* ==================================================================== */
/* BUILD BAR                                                            */
/* ==================================================================== */
function catBuildings(cat){
  return F.BUILD_ORDER.filter(k => F.BUILDINGS[k].cat === cat);
}

function buildTabs(){
  const bt = $('buildTabs');
  bt.innerHTML = '';
  for (const c of F.CATS){
    const b = el('button', 'buildTab' + (c.id === UI.activeCat ? ' on' : ''), c.name);
    b.addEventListener('click', () => {
      UI.activeCat = c.id;
      buildTabs(); buildBar();
      A.sfx.click();
    });
    bt.appendChild(b);
  }
}

function buildBar(){
  const bar = $('buildBar');
  bar.innerHTML = '';
  const S = UI.S;
  const list = catBuildings(UI.activeCat);
  list.forEach((key, i) => {
    const def = F.BUILDINGS[key];
    const unlocked = !!S.unlocked[key];
    const b = el('button', 'buildBtn' + (UI.tool === key ? ' on' : '') + (unlocked ? '' : ' locked'));
    b.dataset.key = key;
    const ic = R.makeBuildingIcon(key, 34);
    b.appendChild(el('span', 'bkey', String(i + 1)));
    b.appendChild(ic);
    b.appendChild(el('span', 'bname', def.name));
    b.addEventListener('click', () => {
      if (!S.unlocked[key]){ A.sfx.error(); toast('Locked — reach <b>' + F.MILESTONES[def.unlock].name + '</b>', 'warn', 3000); return; }
      setTool(UI.tool === key ? null : key);
    });
    b.addEventListener('pointerenter', (ev) => showBuildTip(ev, key));
    b.addEventListener('pointerleave', hideTip);
    bar.appendChild(b);
  });
  buildBarAfford();
}

function buildBarAfford(){
  const S = UI.S;
  if (!S) return;
  for (const b of $('buildBar').children){
    const key = b.dataset.key;
    if (!key) continue;
    b.classList.toggle('cant', S.unlocked[key] && !F.canAfford(S, F.BUILDINGS[key].cost));
  }
}

function setTool(key){
  UI.tool = key;
  if (key){
    select(null);
    tipOnce('firstSelect');
    const def = F.BUILDINGS[key];
    if (def.kind === 'belt' || def.kind === 'pipe') { /* keep dir */ }
  }
  for (const b of $('buildBar').children)
    b.classList.toggle('on', b.dataset.key === key);
  A.sfx.click();
}

/* ---------- tooltip ---------- */
function showBuildTip(ev, key){
  const S = UI.S;
  const def = F.BUILDINGS[key];
  const tt = $('tooltip');
  let html = `<div class="tt-name">${def.name}</div><div class="tt-desc">${def.desc}</div>`;
  const stats = [];
  if (def.speed && def.kind === 'belt') stats.push(`${(def.speed).toFixed(1)} tiles/s`);
  if (def.kind === 'miner') stats.push(`${(def.speed / def.mineTime).toFixed(2)} ore/s`);
  if (def.kind === 'machine') stats.push(`${def.speed}× speed`);
  if (def.out) stats.push(`+${def.out} P`);
  if (def.power) stats.push(`${def.power} P draw`);
  if (def.fuel) stats.push('burns coal');
  if (def.span) stats.push(`spans ${def.span} tiles`);
  if (def.kind === 'pole') stats.push(`links ${def.reach} tiles · powers ${def.cover * 2 + 1}×${def.cover * 2 + 1}`);
  if (def.cap && def.kind === 'chest') stats.push(`holds ${def.cap}`);
  if (stats.length) html += `<div class="tt-stat">${stats.join(' · ')}</div>`;
  html += '<div class="tt-cost">' + Object.entries(def.cost).map(([k, n]) => {
    const have = F.invCount(S, k);
    return `<span class="${have < n ? 'lack' : ''}">${iconImg(k, 14)} ${n} <span class="have">(${F.fmt(have)})</span></span>`;
  }).join('') + '</div>';
  if (!S.unlocked[key]) html += `<div class="tt-lock">Unlocks at: ${F.MILESTONES[def.unlock] ? F.MILESTONES[def.unlock].name : '—'}</div>`;
  tt.innerHTML = html;
  tt.classList.remove('hidden');
  positionTip(ev.clientX, ev.clientY);
}
const iconImgCache = {};
function iconImg(item, size){
  const key = item + '_' + size;
  if (!iconImgCache[key]){
    const cv = R.itemIcon(item, size * 2);
    iconImgCache[key] = `<img src="${cv.toDataURL()}" width="${size}" height="${size}" style="vertical-align:-2px">`;
  }
  return iconImgCache[key];
}
function positionTip(px, py){
  const tt = $('tooltip');
  const r = tt.getBoundingClientRect();
  let x = px + 14, y = py - r.height - 10;
  if (x + r.width > innerWidth - 8) x = innerWidth - r.width - 8;
  if (y < 8) y = py + 18;
  tt.style.left = x + 'px';
  tt.style.top = y + 'px';
}
function hideTip(){ $('tooltip').classList.add('hidden'); }

/* ==================================================================== */
/* SELECTION PANEL                                                      */
/* ==================================================================== */
function select(e){
  UI.selection = e;
  UI.selSig = null;          // force a fresh structural build
  UI._bufsCache = null;
  const p = $('selPanel');
  if (!e){ p.classList.add('hidden'); return; }
  p.classList.remove('hidden');
  refreshSelPanel();
  A.sfx.click();
}

/* The panel is split in two layers so hover states survive live updates:
   - buildSelPanel(): full innerHTML render — ONLY when the structure changes
     (new selection, recipe change, tunnel links, tier unlocks)
   - updateSelPanel(): 4×/s — pokes numbers/bars into the existing DOM       */
function refreshSelPanel(force){
  const e = UI.selection;
  if (!e) return;
  const S = UI.S;
  if (S.ents.indexOf(e) < 0){ select(null); return; }
  const sig = [e.id, e.recipe || '', e.linkId || 0, S.msIndex].join('|');
  if (force || UI.selSig !== sig){
    UI.selSig = sig;
    buildSelPanel(e);
  }
  updateSelPanel(e);
}

/* every value that changes while the panel is open, keyed for in-place updates */
function dynVals(e){
  const S = UI.S;
  const def = F.BUILDINGS[e.key];
  const d = {};
  switch (e.kind){
    case 'miner':
      d.rate = rateStr(e);
      break;
    case 'machine':
      d.rate = rateStr(e);
      if (def.fam === 'refinery') d.tank = `${e.tank.toFixed(0)} / ${def.tank}`;
      break;
    case 'gen': case 'turbine':
      d.out = `${Math.round(def.out * F.powerMul(S))} P`;
      d.load = `${Math.round((e.load || 0) * 100)}%`;
      break;
    case 'solar':
      d.out = `${Math.round(def.out * F.powerMul(S))} P`;
      break;
    case 'belt':
      d.speed = `${(def.speed * F.beltMul(S)).toFixed(2)} tiles/s`;
      break;
    case 'ubelt':
      d.link = e.linkId ? (e.isExit ? 'exit ✓' : 'entrance ✓') : '<span style="color:var(--accent)">unlinked</span>';
      break;
    case 'chest':
      d.stored = `${e.total} / ${F.CHEST_CAP + F.upRank(S, 'capacitors') * 20}`;
      break;
    case 'pump':
      d.tank = `${e.tank.toFixed(1)} / 30`;
      break;
    case 'pipe':
      d.fluid = `${e.fluid.toFixed(1)} / ${def.cap}`;
      break;
    case 'pole': {
      d.links = String(e.links ? e.links.length : 0);
      if (e.netId){
        const sup = (S._netSupply && S._netSupply[e.netId]) || 0;
        const dm = (S._netDemand && S._netDemand[e.netId]) || 0;
        d.net = '#' + e.netId;
        d.netpow = `${Math.round(dm)} / ${Math.round(sup)} P`;
      } else {
        d.net = '<span style="color:var(--bad)">isolated</span>';
        d.netpow = '—';
      }
      break;
    }
  }
  return d;
}

function bufsFor(e){
  if (e.kind === 'machine') return buffers(e);
  if (e.kind === 'chest') return bufList(e.store);
  return '';
}

function buildSelPanel(e){
  const S = UI.S;
  const def = F.BUILDINGS[e.key];
  const p = $('selPanel');
  const dv = dynVals(e);
  let html = '';
  html += `<div class="selHead"><canvas data-icon="${e.key}" width="44" height="44"></canvas>
    <div><div class="selTitle">${def.name}</div><div class="selSub">${kindLabel(def)}</div></div></div>`;

  if (e.kind === 'miner'){
    const i = F.tileIdx(S, e.x, e.y);
    const t = S.oreType[i];
    const ore = t ? F.ORES[t] : null;
    html += row('Deposit', ore ? `${ore.name} · endless vein` : '—');
    html += row('Rate', dv.rate, 'rate');
    if (def.power) html += row('Power draw', def.power + ' P');
  }
  if (e.kind === 'machine'){
    html += recipeSection(S, e, def);
    html += `<div data-bufs>${bufsFor(e)}</div>`;
    if (def.fam === 'refinery') html += row('Crude tank', dv.tank, 'tank');
    html += row('Rate', dv.rate, 'rate');
    if (def.power) html += row('Power draw', def.power + ' P');
    html += `<div class="progOuter" data-prog-wrap style="display:none"><div class="progFill" data-prog style="width:0%"></div></div>`;
  }
  if (e.kind === 'gen' || e.kind === 'turbine'){
    html += row('Output', dv.out, 'out');
    html += row('Load', dv.load, 'load');
  }
  if (e.kind === 'solar') html += row('Output', dv.out, 'out');
  if (e.kind === 'belt') html += row('Speed', dv.speed, 'speed');
  if (e.kind === 'ubelt'){
    html += row('Linked', dv.link, 'link');
    if (!e.linkId) html += `<div class="ghostNote">Place a matching tunnel within ${def.span} tiles, in the same direction, to link.</div>`;
  }
  if (e.kind === 'chest'){
    html += row('Stored', dv.stored, 'stored');
    html += `<div data-bufs>${bufsFor(e)}</div>`;
  }
  if (e.kind === 'pump'){
    html += row('Tank', dv.tank, 'tank');
    html += row('Power draw', def.power + ' P');
  }
  if (e.kind === 'pipe') html += row('Crude', dv.fluid, 'fluid');
  if (e.kind === 'pole'){
    html += row('Linked poles', dv.links, 'links');
    html += row('Network', dv.net, 'net');
    html += row('Net power', dv.netpow, 'netpow');
    html += `<div class="ghostNote">Powers everything in the ${def.cover * 2 + 1}×${def.cover * 2 + 1} area around it; links to poles within ${def.reach} tiles.</div>`;
  }

  // fuel: two transfer slots — machine buffer ⇄ your pocket
  if (def.fuel || e.kind === 'gen' || e.kind === 'turbine'){
    const isT = e.kind === 'turbine';
    const item = isT ? 'fuelCell' : 'coal';
    html += `<div class="selDivider"></div><div class="selSection">Fuel — ${isT ? 'fuel cells' : 'coal'}</div>
      <div class="bufRow">${iconImg(item, 16)}
        <div class="fuelBarOuter"><div class="fuelBarFill" data-fbar style="width:0%"></div></div></div>
      <div class="slotRow">
        <div class="slotBox" data-side="machine">
          ${iconImg(item, 22)}
          <span class="slotN" data-sn="machine">${e.fuelBuf} / ${F.FUEL_CAP}</span>
          <span class="slotLbl">in machine</span>
        </div>
        <div class="slotArrows">⇄</div>
        <div class="slotBox" data-side="inv">
          ${iconImg(item, 22)}
          <span class="slotN" data-sn="inv">${F.fmt(F.invCount(S, item))}</span>
          <span class="slotLbl">your pocket</span>
        </div>
      </div>
      <div class="ghostNote">click: pick up all · right-click: half · with a stack in hand, scroll over a box to move one at a time</div>`;
  }

  html += `<button class="dangerBtn" data-del="1">Remove (full refund)</button>`;
  p.innerHTML = html;
  UI._bufsCache = bufsFor(e);

  // wire interactive bits (these elements now live until the structure changes)
  const ic = p.querySelector('canvas[data-icon]');
  if (ic){
    const src = R.makeBuildingIcon(e.key, 44);
    ic.getContext('2d').drawImage(src, 0, 0);
  }
  p.querySelectorAll('[data-recipe]').forEach(b => {
    b.addEventListener('click', () => {
      e.recipe = b.dataset.recipe === '_' ? null : b.dataset.recipe;
      e.crafting = false; e.prog = 0;
      A.sfx.click();
      refreshSelPanel(true);
    });
  });
  p.querySelectorAll('.slotBox').forEach(box => {
    const isT = e.kind === 'turbine';
    const item = isT ? 'fuelCell' : 'coal';
    box.addEventListener('pointerdown', ev => slotDown(ev, box, box.dataset.side, e, item));
    box.addEventListener('wheel', ev => slotWheel(ev, box, box.dataset.side, e, item), { passive: false });
    box.addEventListener('contextmenu', ev => ev.preventDefault());
  });
  p.querySelector('[data-del]').addEventListener('click', () => {
    F.remove(S, e.x, e.y);
    A.sfx.remove();
    select(null);
    buildBarAfford();
  });
}

function updateSelPanel(e){
  const S = UI.S;
  const def = F.BUILDINGS[e.key];
  const p = $('selPanel');
  const dv = dynVals(e);
  p.querySelectorAll('[data-dyn]').forEach(el2 => {
    const v = dv[el2.dataset.dyn];
    if (v != null && el2.innerHTML !== v) el2.innerHTML = v;
  });
  // buffer lists (no interactive children → safe to swap when contents change)
  const bufs = p.querySelector('[data-bufs]');
  if (bufs){
    const h = bufsFor(e);
    if (UI._bufsCache !== h){ UI._bufsCache = h; bufs.innerHTML = h; }
  }
  // craft progress
  const pw = p.querySelector('[data-prog-wrap]');
  if (pw){
    pw.style.display = e.crafting ? '' : 'none';
    if (e.crafting){
      const pf = pw.querySelector('[data-prog]');
      if (pf) pf.style.width = (clamp(e.prog, 0, 1) * 100).toFixed(0) + '%';
    }
  }
  // fuel bar + slot counts
  const fb = p.querySelector('[data-fbar]');
  if (fb){
    const isT = e.kind === 'turbine';
    fb.style.width = (clamp(e.fuelT / (isT ? def.burn : F.COAL_BURN), 0, 1) * 100).toFixed(1) + '%';
    const item = isT ? 'fuelCell' : 'coal';
    const snM = p.querySelector('[data-sn="machine"]');
    const tM = `${e.fuelBuf} / ${F.FUEL_CAP}`;
    if (snM && snM.textContent !== tM) snM.textContent = tM;
    const snI = p.querySelector('[data-sn="inv"]');
    const tI = F.fmt(F.invCount(S, item));
    if (snI && snI.textContent !== tI) snI.textContent = tI;
  }
}

function kindLabel(def){
  return { belt:'logistics', ubelt:'logistics', splitter:'logistics', chest:'storage', pipe:'fluid',
    miner:'extraction', machine:{smelter:'furnace', alloy:'furnace', asm:'assembler', refinery:'refinery'}[def.fam] || 'machine',
    gen:'power', turbine:'power', solar:'power', pole:'power grid', pump:'extraction' }[def.kind] || def.kind;
}
function row(k, v, dyn){ return `<div class="selRow"><span>${k}</span><b${dyn ? ` data-dyn="${dyn}"` : ''}>${v}</b></div>`; }
function rateStr(e){
  return e.ema > 0.001 ? (e.ema * 60).toFixed(1) + ' /min' : '—';
}
function buffers(e){
  let html = '';
  if (Object.keys(e.inBuf).length){
    html += `<div class="selSection">Input</div>` + bufList(e.inBuf);
  }
  if (Object.keys(e.outBuf).length){
    html += `<div class="selSection">Output</div>` + bufList(e.outBuf);
  }
  return html;
}
function bufList(o){
  let h = '';
  for (const k in o){
    if (o[k] <= 0) continue;
    h += `<div class="bufRow">${iconImg(k, 16)} ${F.ITEMS[k] ? F.ITEMS[k].name : k}<span class="n">${Math.floor(o[k])}</span></div>`;
  }
  return h || '<div class="ghostNote">empty</div>';
}

function recipeSection(S, e, def){
  if (def.fam === 'smelter' || def.fam === 'alloy'){
    const opts = F.AUTO_RECIPES[def.fam].filter(k => F.recipeUnlocked(S, k));
    return `<div class="selSection">Smelts automatically</div>
      <div class="compChain">${opts.map(k => `<span>${iconImg(F.RECIPES[k].out, 15)}</span>`).join('')}</div>`;
  }
  const opts = Object.keys(F.RECIPES).filter(k => {
    const r = F.RECIPES[k];
    return r.machine === def.fam && F.recipeUnlocked(S, k);
  });
  let h = `<div class="selSection">Recipe</div><div class="recipeGrid">`;
  for (const k of opts){
    h += `<button class="recipeBtn${e.recipe === k ? ' on' : ''}" data-recipe="${k}" title="${F.ITEMS[F.RECIPES[k].out].name}">${iconImg(F.RECIPES[k].out, 24)}</button>`;
  }
  h += '</div>';
  if (e.recipe){
    const r = F.RECIPES[e.recipe];
    h += `<div class="compChain" style="margin-top:7px">` +
      Object.entries(r.in).map(([k, n]) => `<span>${n}× ${iconImg(k, 14)}</span>`).join(' ') +
      (r.fluid ? `<span>${r.fluid} crude</span>` : '') +
      `<span class="arrow">→</span><span>${r.outN}× ${iconImg(r.out, 14)}</span></div>`;
  } else {
    h += `<div class="ghostNote">Choose what this machine crafts.</div>`;
  }
  return h;
}

/* ==================================================================== */
/* OBJECTIVE CARD                                                       */
/* ==================================================================== */
function refreshObjective(){
  const S = UI.S;
  if (!S) return;
  const ms = F.MILESTONES[S.msIndex];
  if (!ms){
    $('objTier').textContent = '✦';
    $('objName').textContent = 'The Engine turns';
    const h = '<div class="objFlavor">Freeplay — the world is yours to pave.</div>';
    if (UI._objCache !== h){ UI._objCache = h; $('objBody').innerHTML = h; }
    return;
  }
  $('objTier').textContent = 'T' + S.msIndex;
  $('objName').textContent = ms.name;
  const req = ms.req || ms.handMine;
  let html = `<div class="objFlavor">${ms.flavor}</div>`;
  for (const k in req){
    const cur = Math.min(S.msProg[k] || 0, req[k]);
    const done = cur >= req[k];
    html += `<div class="objReq${done ? ' done' : ''}">
      <img src="${R.itemIcon(k, 36).toDataURL()}" width="18" height="18">
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between">
          <span class="objReqName">${F.ITEMS[k].name}${ms.handMine ? ' (by hand)' : ''}</span>
          <span class="objReqNum">${cur} / ${req[k]}</span>
        </div>
        <div class="objBarOuter"><div class="objBarFill" style="width:${(cur / req[k] * 100).toFixed(1)}%"></div></div>
      </div></div>`;
  }
  if (ms.hint) html += `<div class="objHint">${ms.hint}</div>`;
  const grants = Object.entries(ms.grant || {});
  const unlockNames = ms.unlocks.filter(u => !u.startsWith('r:')).map(u => F.BUILDINGS[u].name);
  const recipeNames = ms.unlocks.filter(u => u.startsWith('r:')).map(u => F.ITEMS[F.RECIPES[u.slice(2)].out].name);
  if (unlockNames.length || recipeNames.length){
    html += `<div class="objReward">unlocks: ${[...unlockNames, ...recipeNames].join(', ')}</div>`;
  }
  if (grants.length){
    html += `<div class="objReward">reward: ${grants.map(([k, n]) => `${n} ${iconImg(k, 13)}`).join(' ')}</div>`;
  }
  if (UI._objCache !== html){ UI._objCache = html; $('objBody').innerHTML = html; }
}

/* ==================================================================== */
/* POWER BAR                                                            */
/* ==================================================================== */
function refreshPower(){
  const S = UI.S;
  const st = S.stats;
  const fill = $('powerBarFill');
  if (st.powerSupply <= 0 && st.powerDemand <= 0){
    fill.style.width = '0%';
    $('powerText').textContent = 'no grid';
    return;
  }
  const frac = st.powerSupply > 0 ? clamp(st.powerDemand / st.powerSupply, 0, 1) : 1;
  fill.style.width = (frac * 100).toFixed(0) + '%';
  fill.className = '';
  fill.id = 'powerBarFill';
  if (st.powerRatio < .999) fill.classList.add('brown');
  else if (frac > .8) fill.classList.add('strain');
  $('powerText').textContent = `${Math.round(st.powerDemand)} / ${Math.round(st.powerSupply)} P` +
    (st.unpowered ? ` · ${st.unpowered} no pole` : '');
}

/* ==================================================================== */
/* BIG PANEL                                                            */
/* ==================================================================== */
const BIG_TABS = [
  { id:'inventory', name:'Inventory' },
  { id:'milestones', name:'Milestones' },
  { id:'upgrades', name:'Upgrades' },
  { id:'compendium', name:'Recipes' },
  { id:'howto', name:'How to play' },
  { id:'stats', name:'Stats' },
];

function toggleBig(tab){
  if (UI.bigTab === tab) closeBig();
  else openBig(tab);
}
function openBig(tab){
  UI.bigTab = tab;
  $('bigPanelWrap').classList.remove('hidden');
  const bt = $('bigTabs');
  bt.innerHTML = '';
  for (const t of BIG_TABS){
    const b = el('button', 'bigTab' + (t.id === tab ? ' on' : ''), t.name);
    b.addEventListener('click', () => openBig(t.id));
    bt.appendChild(b);
  }
  renderBig();
  A.sfx.open();
}
function closeBig(){
  UI.bigTab = null;
  $('bigPanelWrap').classList.add('hidden');
  A.sfx.close();
}

function renderBig(){
  const S = UI.S;
  const body = $('bigBody');
  switch (UI.bigTab){
    case 'inventory': {
      const keys = F.ITEM_ORDER.filter(k => (S.inv[k] || 0) > 0);
      if (!keys.length){ body.innerHTML = '<div class="ghostNote">Nothing yet — mine some ore.</div>'; UI._invSig = ''; break; }
      const sig = keys.join(',');
      if (UI._invSig !== sig || !body.querySelector('.invGrid')){
        // item set changed → rebuild the grid
        UI._invSig = sig;
        body.innerHTML = '<div class="invGrid">' + keys.map(k =>
          `<div class="invCell" data-item="${k}"><img src="${R.itemIcon(k, 52).toDataURL()}" width="26" height="26">
           <span class="cnt">${F.fmt(S.inv[k])}</span><span class="nm">${F.ITEMS[k].name}</span></div>`).join('') + '</div>';
      } else {
        // same items → update counts in place (keeps hover states alive)
        body.querySelectorAll('.invCell').forEach(c => {
          const t = F.fmt(S.inv[c.dataset.item] || 0);
          const el2 = c.querySelector('.cnt');
          if (el2 && el2.textContent !== t) el2.textContent = t;
        });
      }
      break;
    }
    case 'milestones': {
      let h = '';
      F.MILESTONES.forEach((ms, i) => {
        const state = i < S.msIndex ? 'done' : i === S.msIndex ? 'current' : 'future';
        const req = ms.req || ms.handMine;
        h += `<div class="msRow ${state}">
          <div class="msTier">${i < S.msIndex ? '✓' : 'T' + i}</div>
          <div class="msInfo">
            <div class="msName">${ms.name}</div>`;
        if (state === 'future' && i > S.msIndex){
          h += `<div class="msLocked">…the ash keeps its secrets…</div>`;
        } else {
          h += `<div class="msDesc">${ms.flavor}</div>
            <div class="msReqs">${Object.entries(req).map(([k, n]) =>
              `<span>${iconImg(k, 14)} ${state === 'current' ? Math.min(S.msProg[k] || 0, n) + ' / ' : ''}${n}</span>`).join('')}</div>`;
          const chips = ms.unlocks.map(u => u.startsWith('r:')
            ? F.ITEMS[F.RECIPES[u.slice(2)].out].name
            : F.BUILDINGS[u].name);
          if (chips.length) h += `<div class="msUnlocks">${chips.map(c => `<span class="msChip">${c}</span>`).join('')}</div>`;
        }
        h += '</div></div>';
      });
      body.innerHTML = h;
      break;
    }
    case 'upgrades': {
      let h = '<div class="upGrid">';
      for (const id in F.UPGRADES){
        const up = F.UPGRADES[id];
        const rank = S.upgrades[id] || 0;
        const maxed = rank >= up.max;
        h += `<div class="upCard${maxed ? ' maxed' : ''}">
          <div class="upHead"><span class="upName">${up.name}</span><span class="upRank">${maxed ? 'MAX' : `rank ${rank} / ${up.max}`}</span></div>
          <div class="upDesc">${up.desc}</div>
          <div class="upPips">${Array.from({length: up.max}, (_, i) => `<div class="upPip${i < rank ? ' filled' : ''}"></div>`).join('')}</div>`;
        if (!maxed){
          const cost = up.costs[rank];
          const can = F.canAfford(S, cost);
          h += `<button class="upBuy" data-up="${id}" ${can ? '' : 'disabled'}>` +
            Object.entries(cost).map(([k, n]) =>
              `<span class="${F.invCount(S, k) < n ? 'lack' : ''}">${iconImg(k, 14)} ${n}</span>`).join('') +
            '</button>';
        }
        h += '</div>';
      }
      body.innerHTML = h + '</div>';
      body.querySelectorAll('[data-up]').forEach(b => {
        b.addEventListener('click', () => {
          if (F.buyUpgrade(S, b.dataset.up)){
            A.sfx.buy();
            renderBig();
            buildBarAfford();
          } else A.sfx.error();
        });
      });
      break;
    }
    case 'compendium': {
      body.innerHTML = renderRecipeBook(S);
      break;
    }
    case 'howto': {
      body.innerHTML = renderHowTo();
      break;
    }
    case 'stats': {
      const st = S.stats;
      // per-minute rates from buckets (last 60s = 12 buckets)
      const win = st.buckets.slice(-12);
      const rates = {};
      for (const b of win) for (const k in b) rates[k] = (rates[k] || 0) + b[k];
      const mins = Math.max(1 / 60, win.length * 5 / 60);
      let h = `<div class="selSection">Production (last ${Math.round(mins * 60)}s)</div><table class="statTable">`;
      const keys = F.ITEM_ORDER.filter(k => rates[k] || st.made[k]);
      if (!keys.length) h += '<tr><td class="ghostNote">No production yet.</td></tr>';
      for (const k of keys){
        h += `<tr><td>${iconImg(k, 15)} ${F.ITEMS[k].name}</td>
          <td>${((rates[k] || 0) / mins).toFixed(1)} /min</td>
          <td>${F.fmt(st.made[k] || 0)} lifetime</td></tr>`;
      }
      h += '</table>';
      h += `<div class="selSection" style="margin-top:14px">World</div><table class="statTable">
        <tr><td>Time</td><td>${F.fmtTime(S.time)}</td></tr>
        <tr><td>Machines placed</td><td>${S.ents.length - 1}</td></tr>
        <tr><td>Delivered to Core</td><td>${F.fmt(Object.values(S.delivered).reduce((a, b) => a + b, 0))}</td></tr>
        <tr><td>Power</td><td>${Math.round(st.powerDemand)} / ${Math.round(st.powerSupply)} P</td></tr>
      </table>`;
      body.innerHTML = h;
      break;
    }
  }
}

/* ==================================================================== */
/* RECIPE BOOK                                                          */
/* ==================================================================== */
const MACHINE_NAMES = { smelter:'Furnace', alloy:'Alloy furnace', asm:'Assembler', refinery:'Refinery' };

function recipeRevealed(S, k){
  const r = F.RECIPES[k];
  if (F.recipeUnlocked(S, k)) return true;
  const ms = F.MILESTONES[S.msIndex];
  if (ms && ms.req && ms.req[r.out]) return true;                       // needed this tier
  return !!(S.inv[r.out] || S.delivered[r.out] || S.stats.made[r.out]); // held it before
}

function unlockMsOf(recipeKey){
  const i = F.MILESTONES.findIndex(ms => ms.unlocks.includes('r:' + recipeKey));
  return i >= 0 ? F.MILESTONES[i] : null;
}

/* everything that consumes `item`: revealed recipes + unlocked buildings */
function usedInHtml(S, item){
  const uses = [];
  for (const k in F.RECIPES){
    const r = F.RECIPES[k];
    if (r.in[item] && recipeRevealed(S, k))
      uses.push(`<span title="${F.ITEMS[r.out].name}">${iconImg(r.out, 14)}</span>`);
  }
  const bld = [];
  for (const k of F.BUILD_ORDER){
    if (S.unlocked[k] && F.BUILDINGS[k].cost[item]) bld.push(F.BUILDINGS[k].name);
  }
  for (const id in F.UPGRADES){
    if (F.UPGRADES[id].costs.some(c => c[item])){ bld.push(F.UPGRADES[id].name + ' upgrades'); break; }
  }
  if (!uses.length && !bld.length) return '';
  let h = `<div class="compUse">used in: ${uses.join(' ')}`;
  if (bld.length) h += `<span class="compUseB">${uses.length ? ' · ' : ''}${bld.join(', ')}</span>`;
  return h + '</div>';
}

function renderRecipeBook(S){
  const ms = F.MILESTONES[S.msIndex];
  const needed = (ms && (ms.req || ms.handMine)) || {};
  let h = '';

  /* --- raw materials --- */
  h += `<div class="selSection">Raw materials — dug from deposits (endless)</div>`;
  const RAW = [
    ['ironOre',  'Grey-blue boulders near the Core. Your first metal.'],
    ['copperOre','Orange boulders near the Core. Becomes wire.'],
    ['coal',     'Dark boulders. Fuel for every burner machine and generator, and an alloying agent.'],
    ['stone',    'Pale boulders. Kilns and bricks.'],
    ['quartz',   'Pale-blue crystal, a journey out from the Core. Glass and silicon.'],
    ['titanOre', 'Violet boulders at the far edges of the world. The last age of machines.'],
  ];
  for (const [id, note] of RAW){
    h += `<div class="compRow">
      <img src="${R.itemIcon(id, 52).toDataURL()}" width="26" height="26">
      <div class="compMid">
        <div class="compName">${F.ITEMS[id].name}${needed[id] ? neededBadge() : ''}</div>
        <div class="compChain"><span>${note}</span></div>
        ${usedInHtml(S, id)}
      </div>
      <span class="compMachine">Drill / hand</span>
    </div>`;
  }
  h += `<div class="compRow">
    <div style="width:26px;height:26px;border-radius:50%;background:#141712;border:2px solid #3b3320;flex:none"></div>
    <div class="compMid">
      <div class="compName">Crude oil</div>
      <div class="compChain"><span>Black seeps in the far wastes. Pumpjacks draw it; pipes carry it to refineries.</span></div>
    </div>
    <span class="compMachine">Pumpjack</span>
  </div>`;

  /* --- recipes, grouped by tier --- */
  const TIER_NAMES = { 1:'Smelting & basic parts', 2:'Industrial parts', 3:'Advanced fabrication', 4:'The three works' };
  let hidden = 0;
  for (const tier of [1, 2, 3, 4]){
    let group = '';
    for (const k in F.RECIPES){
      const r = F.RECIPES[k];
      if ((F.ITEMS[r.out].tier || 1) !== tier) continue;
      if (!recipeRevealed(S, k)){ hidden++; continue; }
      const locked = !F.recipeUnlocked(S, k);
      const msu = locked ? unlockMsOf(k) : null;
      group += `<div class="compRow${locked ? ' compLocked' : ''}">
        <img src="${R.itemIcon(r.out, 52).toDataURL()}" width="26" height="26">
        <div class="compMid">
          <div class="compName">${F.ITEMS[r.out].name}${r.outN > 1 ? ' ×' + r.outN : ''}${needed[r.out] ? neededBadge() : ''}${locked && msu ? `<span class="lockBadge">unlocks: ${msu.name}</span>` : ''}</div>
          <div class="compChain">${Object.entries(r.in).map(([ik, n]) => `<span>${n}× ${iconImg(ik, 13)} ${F.ITEMS[ik].name}</span>`).join('<span class="arrow">+</span>')}${r.fluid ? `<span class="arrow">+</span><span>${r.fluid} crude</span>` : ''}</div>
          ${usedInHtml(S, r.out)}
        </div>
        <span class="compMachine">${MACHINE_NAMES[r.machine]}</span>
        <span class="compTime">${r.time}s</span>
      </div>`;
    }
    if (group) h += `<div class="selSection" style="margin-top:14px">${TIER_NAMES[tier]}</div>` + group;
  }
  if (hidden) h += `<div class="ghostNote" style="margin-top:10px">…${hidden} more recipe${hidden > 1 ? 's' : ''} await discovery in later tiers…</div>`;

  /* --- buildings --- */
  const bld = F.BUILD_ORDER.filter(k => S.unlocked[k]);
  if (bld.length){
    h += `<div class="selSection" style="margin-top:16px">Your buildings</div>`;
    for (const k of bld){
      const d = F.BUILDINGS[k];
      const stats = [];
      if (d.kind === 'belt') stats.push(`${d.speed} tiles/s`);
      if (d.kind === 'miner') stats.push(`${(d.speed / d.mineTime).toFixed(2)} ore/s`);
      if (d.kind === 'machine') stats.push(`${d.speed}× speed`);
      if (d.out) stats.push(`+${d.out} P`);
      if (d.power) stats.push(`${d.power} P`);
      if (d.fuel) stats.push('coal-fired');
      if (d.kind === 'pole') stats.push(`links ${d.reach} · powers ${d.cover * 2 + 1}×${d.cover * 2 + 1}`);
      if (d.span) stats.push(`spans ${d.span}`);
      h += `<div class="compRow">
        <img src="${R.makeBuildingIcon(k, 52).toDataURL()}" width="26" height="26">
        <div class="compMid">
          <div class="compName">${d.name}</div>
          <div class="compChain">${Object.entries(d.cost).map(([ik, n]) => `<span>${n}× ${iconImg(ik, 13)}</span>`).join(' ')}</div>
        </div>
        <span class="compMachine">${stats.join(' · ')}</span>
      </div>`;
    }
  }
  return h;
}
function neededBadge(){ return '<span class="needBadge">needed this tier</span>'; }

/* ==================================================================== */
/* HOW TO PLAY                                                          */
/* ==================================================================== */
function renderHowTo(){
  const kb = k => `<span class="kbd">${k}</span>`;
  const ic = (id, s) => iconImg(id, s || 14);
  return `
  <div class="selSection">The loop</div>
  <p class="howP">The dormant <b>Core</b> sits at the centre of the world. Everything you belt into it
  becomes <b>construction material</b> in your inventory — deliveries literally fund every building,
  upgrade and expansion. Each <b>milestone tier</b> asks for specific goods and <b>only counts items
  that arrive by conveyor</b>; hand-mining fills your pockets but never advances a tier.
  Complete all ten tiers to reignite the World Engine.</p>

  <div class="selSection">First steps</div>
  <p class="howP"><b>Hold left-click on an ore deposit</b> to hand-mine it — slow, but always available,
  and deposits never run dry. Use your first ore to place a <b>burner drill</b> on iron, feed it coal
  (click it and move coal from your pocket into its fuel slot — or belt coal into its side), and run a
  conveyor from the drill's <b>output chute</b> (the small amber arrow) into any side of the Core.
  In fuel slots: <b>click</b> picks up the whole stack, <b>right-click</b> half; with a stack in hand,
  click a box to deposit it — or <b>hover a box and scroll</b> to move items one at a time.</p>

  <div class="selSection">Belts & routing</div>
  <p class="howP"><b>Drag</b> to lay a belt line — it follows your pointer and turns corners automatically.
  ${kb('R')} rotates before placing. Belts push items into whatever they point at: a machine, the Core,
  or another belt (side entries merge; head-on is refused). The <b>splitter</b> deals items evenly to
  every open exit — ideal for feeding rows of machines. <b>Tunnels</b> dive under up to 4 tiles
  (place the entrance, then the exit in the same direction) and let lines cross. The <b>depot</b>
  buffers 60 items and releases them out its front — a shock-absorber for uneven flows.
  Right-click removes anything for a <b>full refund</b>, contents included — redesign freely.</p>

  <div class="selSection">Machines</div>
  <p class="howP">Machines accept ingredients from belts on <b>any side</b> and eject from their
  <b>chute</b> (amber arrow — watch it when rotating). <b>Furnaces</b> smelt whatever suits their
  contents; <b>fabricators and assemblers</b> craft one chosen recipe — click the machine and pick it.
  The <b>alloy furnace</b> fuses two inputs: iron ingots + coal → ${ic('steel')} steel,
  quartz + coal → ${ic('silicon')} silicon. Mk1 machines burn coal; electric machines are far faster
  but need the grid. A machine with a blinking <b>amber dot</b> is out of fuel; a stalled machine
  usually has a jammed chute or missing ingredients — click it to see its buffers.</p>

  <div class="selSection">Power</div>
  <p class="howP">Generators make power but <b>poles deliver it</b>. A ${ic('wire')} <b>power pole</b>
  links to poles within 7 tiles (wires draw automatically) and energises the 5×5 area around it —
  generators must stand in a pole's area too. Separate pole clusters are <b>separate grids</b>, each
  with its own supply and demand. A blinking <b>red bolt</b> means no pole in range; when demand
  exceeds supply everything electric slows down proportionally (a brown-out — the top-right bar
  turns red). Generators idle when nothing draws power, so fuel is never wasted. Later:
  <b>solar arrays</b> trickle free power and <b>fuel turbines</b> burn ${ic('fuelCell')} fuel cells
  for serious output; the <b>pylon</b> spans 14 tiles.</p>

  <div class="selSection">Oil</div>
  <p class="howP">Black seeps in the far wastes hold crude. A <b>pumpjack</b> placed over a seep draws
  it endlessly; <b>pipes</b> carry it to a <b>refinery</b>, which cracks it into ${ic('plastic')}
  plastic (with coal) or ${ic('fuelCell')} fuel cells (with steel). Pipes only connect pumpjacks,
  refineries and other pipes.</p>

  <div class="selSection">Growing the factory</div>
  <p class="howP">Ore near the Core is humble; <b>quartz waits in the middle distance and titanium and
  oil at the world's edge</b> — every age pushes your logistics farther out. Ratios matter: one
  fabricator eats the output of two or three kilns, so belt more smelting into your assemblers than
  feels polite. The <b>Foundry panel</b> (${kb('U')}) sells permanent upgrades — belt speed, drill
  speed, furnace heat, grid output — paid in parts, and each machine family has faster Mk versions to
  rebuild with. Check <b>Stats</b> to see production per minute and find your bottleneck.</p>

  <div class="selSection">Controls</div>
  <table class="statTable">
    <tr><td>Place / select / hand-mine</td><td>${kb('Left click')} / hold</td></tr>
    <tr><td>Lay belt lines</td><td>${kb('Left drag')} with a belt selected</td></tr>
    <tr><td>Remove (full refund)</td><td>${kb('Right click')} / drag</td></tr>
    <tr><td>Rotate</td><td>${kb('R')}</td></tr>
    <tr><td>Pan</td><td>${kb('W A S D')} · ${kb('Middle drag')} · ${kb('Left drag')} on empty ground</td></tr>
    <tr><td>Zoom</td><td>${kb('Wheel')}</td></tr>
    <tr><td>Copy hovered building</td><td>${kb('Q')}</td></tr>
    <tr><td>Quick-select from build bar</td><td>${kb('1')}–${kb('9')}</td></tr>
    <tr><td>Inventory</td><td>${kb('E')}</td></tr>
    <tr><td>Foundry panel</td><td>${kb('U')}</td></tr>
    <tr><td>This guide</td><td>${kb('H')}</td></tr>
    <tr><td>Centre on the Core</td><td>${kb('F')}</td></tr>
    <tr><td>Mute</td><td>${kb('M')}</td></tr>
    <tr><td>Menu / cancel</td><td>${kb('Esc')}</td></tr>
  </table>`;
}

/* ==================================================================== */
/* TOASTS + TIPS                                                        */
/* ==================================================================== */
function toast(html, kind, ms){
  const box = $('toasts');
  while (box.children.length >= 3) box.removeChild(box.firstChild);
  const t = el('div', 'toast' + (kind ? ' ' + kind : ''), html);
  box.appendChild(t);
  setTimeout(() => {
    t.classList.add('gone');
    setTimeout(() => t.remove(), 400);
  }, ms || 5000);
}
UI.toast = toast;

function tipOnce(id){
  const S = UI.S;
  if (!S || S.flags['tip_' + id]) return;
  S.flags['tip_' + id] = true;
  if (F.TIPS[id]){
    toast(F.TIPS[id], 'tip', 8000);
    A.sfx.tip();
  }
}

function toastCost(def){
  const S = UI.S;
  const lacks = Object.entries(def.cost)
    .filter(([k, n]) => F.invCount(S, k) < n)
    .map(([k, n]) => `${iconImg(k, 13)} ${n - F.invCount(S, k)} more ${F.ITEMS[k].name}`);
  toast('Need ' + lacks.join(', '), 'warn', 3200);
}

function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

/* ---------- menu popup ---------- */
function openMenu(){ $('menuPop').classList.remove('hidden'); A.sfx.open(); }
function closeMenu(){ $('menuPop').classList.add('hidden'); }
function toggleMenu(){
  if ($('menuPop').classList.contains('hidden')) openMenu();
  else closeMenu();
}

/* ==================================================================== */
/* FUEL SLOT TRANSFER (pick a stack up onto the cursor, deposit it)     */
/* UI.holdStack = stack riding the cursor: {item, n}                    */
/* click: whole stack · right-click: half · with a stack in hand,       */
/* hovering a box and scrolling moves items 1-by-1 between hand & box   */
/* ==================================================================== */

function slotAvail(side, ent, item){
  return side === 'machine' ? ent.fuelBuf : F.invCount(UI.S, item);
}

function slotDown(ev, box, side, ent, item){
  ev.preventDefault();
  ev.stopPropagation();
  if (ev.button !== 0 && ev.button !== 2) return;
  if (UI.holdStack){ depositTo(side, ent, item, ev.button); return; }
  // pick up: all (LMB) or half (RMB)
  const avail = slotAvail(side, ent, item);
  if (!avail){ A.sfx.error(); return; }
  const n = ev.button === 2 ? Math.ceil(avail / 2) : avail;
  if (side === 'machine') ent.fuelBuf -= n;
  else F.invAdd(UI.S, item, -n);
  UI.holdStack = { item, n };
  showHeld();
  A.sfx.click();
  refreshSelPanel();
}

/* holding a stack + hovering a box + scroll: up takes 1 from the box, down puts 1 in */
function slotWheel(ev, box, side, ent, item){
  const H = UI.holdStack;
  if (!H) return;                       // scroll does nothing with empty hands
  ev.preventDefault();
  ev.stopPropagation();
  if (H.item !== item){ A.sfx.error(); return; }
  if (ev.deltaY < 0){
    // take one more into the hand
    if (slotAvail(side, ent, item) <= 0){ A.sfx.error(); return; }
    if (side === 'machine') ent.fuelBuf -= 1;
    else F.invAdd(UI.S, item, -1);
    H.n += 1;
  } else {
    // drop one from the hand into this box
    if (H.n <= 0) return;
    if (side === 'machine'){
      if (ent.fuelBuf >= F.FUEL_CAP){ A.sfx.error(); return; }
      ent.fuelBuf += 1;
    } else {
      F.invAdd(UI.S, item, 1);
    }
    H.n -= 1;
  }
  if (H.n <= 0){ UI.holdStack = null; hideHeld(); }
  else showHeld();
  A.sfx.click();
  refreshSelPanel();
}

function depositTo(side, ent, item, btn){
  const H = UI.holdStack;
  if (!H) return;
  const amt = btn === 2 ? Math.ceil(H.n / 2) : H.n;
  let put = 0;
  if (side === 'machine'){
    if (H.item !== item){ A.sfx.error(); return; }
    put = Math.min(amt, F.FUEL_CAP - ent.fuelBuf);
    if (!put){ A.sfx.error(); return; }
    ent.fuelBuf += put;
  } else {
    put = amt;
    F.invAdd(UI.S, H.item, put);
  }
  H.n -= put;
  A.sfx.click();
  if (H.n <= 0){ UI.holdStack = null; hideHeld(); }
  else showHeld();
  refreshSelPanel();
}

function returnHeld(){
  const H = UI.holdStack;
  if (!H) return;
  F.invAdd(UI.S, H.item, H.n);
  UI.holdStack = null;
  hideHeld();
  if (UI.selection) refreshSelPanel();
}

function showHeld(){
  const H = UI.holdStack;
  const el2 = $('heldStack');
  if (!H){ el2.classList.add('hidden'); return; }
  el2.querySelector('img').src = R.itemIcon(H.item, 44).toDataURL();
  el2.querySelector('span').textContent = H.n;
  el2.classList.remove('hidden');
  positionHeld();
}
function hideHeld(){ $('heldStack').classList.add('hidden'); }
function positionHeld(){
  const el2 = $('heldStack');
  if (el2.classList.contains('hidden')) return;
  el2.style.left = UI.mouse.x + 'px';
  el2.style.top = UI.mouse.y + 'px';
}

/* ==================================================================== */
/* EVENTS from the sim                                                  */
/* ==================================================================== */
function drainEvents(){
  const S = UI.S;
  for (const ev of S.events){
    R.onEvent(S, ev);
    switch (ev.type){
      case 'deliver':
        A.sfx.deliver();
        tipOnce('coreFull');
        break;
      case 'handmine': A.sfx.mineDone(); break;
      case 'craft': break;
      case 'tip': tipOnce(ev.id); break;
      case 'milestone': {
        A.sfx.milestone();
        const next = F.MILESTONES[S.msIndex];
        toast(`<b style="color:var(--accent)">◆ ${ev.name} complete</b>` +
          (next ? `<br>Next: <b>${next.name}</b>` : ''), '', 8000);
        refreshObjective();
        buildBar();
        if (S.msIndex === 3) tipOnce('firstUpgrade');
        UI.save();
        break;
      }
      case 'win': startWin(); break;
    }
  }
  S.events.length = 0;
}

/* ==================================================================== */
/* WIN CINEMATIC                                                        */
/* ==================================================================== */
function startWin(){
  A.sfx.win();
  select(null);
  setTool(null);
  if (UI.bigTab) closeBig();
  UI.cineStage = 0;
  const ov = $('winOverlay');
  ov.classList.remove('hidden');
  const lines = $('winLines');
  const S = UI.S;
  const delivered = Object.values(S.delivered).reduce((a, b) => a + b, 0);
  lines.innerHTML = `
    <div>The World Engine draws its first breath in a thousand years.</div>
    <div>Every belt still turns. Every furnace still burns. It remembers you now.</div>
    <div style="color:var(--ink-dim);font-size:.85em;margin-top:10px">
      ${F.fmtTime(S.time)} · ${F.fmt(delivered)} items delivered · ${S.ents.length - 1} machines</div>`;
  // staged reveal
  setTimeout(() => ov.classList.add('solid'), 6200);
  const ls = lines.children;
  setTimeout(() => ls[0] && ls[0].classList.add('show'), 8000);
  setTimeout(() => ls[1] && ls[1].classList.add('show'), 10200);
  setTimeout(() => ls[2] && ls[2].classList.add('show'), 12200);
  setTimeout(() => $('btnFreeplay').classList.remove('hidden'), 12800);
}

/* ==================================================================== */
/* TUTORIAL ARROW targets                                               */
/* ==================================================================== */
function updateArrow(){
  const S = UI.S;
  UI.arrow = null;
  if (S.msIndex > 1 || S.won) return;
  const ms = F.MILESTONES[S.msIndex];
  if (S.msIndex === 0){
    // point at the nearest needed ore
    const need = Object.keys(ms.handMine).find(k => (S.msProg[k] || 0) < ms.handMine[k]);
    if (!need) return;
    UI.arrow = nearestOre(F.oreTypeByItem[need]);
  } else if (S.msIndex === 1){
    // until a miner exists, point at iron; then at the core if nothing delivered yet
    const hasMiner = S.ents.some(e => e.kind === 'miner');
    if (!hasMiner) UI.arrow = nearestOre(1);
    else if (!Object.keys(S.delivered).length){
      UI.arrow = { x: S.core.x + S.core.w / 2, y: S.core.y };
    }
  }
}
function nearestOre(type){
  const S = UI.S;
  const cx = R.cam.x, cy = R.cam.y;
  let best = null, bd = 1e9;
  // coarse scan
  for (let y = 0; y < S.h; y += 2) for (let x = 0; x < S.w; x += 2){
    const i = y * S.w + x;
    if (S.oreType[i] === type && S.oreAmt[i] > 0 && !S.grid[i]){
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bd){ bd = d; best = { x: x + .5, y: y + .5 }; }
    }
  }
  return best;
}

/* ==================================================================== */
/* PER-FRAME UPDATE                                                     */
/* ==================================================================== */
UI.update = function(dt){
  const S = UI.S;
  if (!S) return;
  const P = UI.pointer;

  /* WASD / arrows pan */
  const panSpd = 16 / R.cam.zoom * dt;
  if (UI.keys.KeyW || UI.keys.ArrowUp) R.cam.y -= panSpd;
  if (UI.keys.KeyS || UI.keys.ArrowDown) R.cam.y += panSpd;
  if (UI.keys.KeyA || UI.keys.ArrowLeft) R.cam.x -= panSpd;
  if (UI.keys.KeyD || UI.keys.ArrowRight) R.cam.x += panSpd;
  clampCam();

  /* hover tile from last-known pointer (robust to missing move events) */
  UI.hover = tileUnder(P.x, P.y);

  /* hand mining: hold LMB on ore with no tool */
  if (P.down && P.btn === 0 && !UI.tool && !P.panning && !R.cine){
    const t = UI.hover;
    if (t && P.moved <= 8){
      const i = F.tileIdx(S, t[0], t[1]);
      const ot = S.oreType[i];
      if (ot && ot !== F.OIL_TYPE && S.oreAmt[i] > 0 && !S.grid[i]){
        P.mining = true;
        const res = F.handMine(S, t[0], t[1], dt);
        if (res){
          A.sfx.mine();
          const ring = $('mineRing');
          ring.classList.remove('hidden');
          const [sx, sy] = R.worldToScreen(t[0] + .5, t[1] + .5);
          ring.style.left = sx + 'px';
          ring.style.top = sy + 'px';
          ring.querySelector('.fg').style.strokeDashoffset = 113 * (1 - clamp(S.handProg, 0, 1));
        }
      } else if (P.mining){
        P.mining = false;
        $('mineRing').classList.add('hidden');
      }
    }
  } else if (P.mining){
    P.mining = false;
    $('mineRing').classList.add('hidden');
  }

  drainEvents();

  /* throttled HUD refresh */
  UI.uiT += dt;
  if (UI.uiT >= .25){
    UI.uiT = 0;
    refreshObjective();
    refreshPower();
    if (UI.selection) refreshSelPanel();
    buildBarAfford();
    if (UI.bigTab === 'stats' || UI.bigTab === 'inventory') renderBig();
    updateArrow();
  }

  /* audio activity follows the working factory */
  let act = 0;
  for (const e of S.ents){
    if (e.active || e.load > .05) act++;
    if (act > 40) break;
  }
  A.setActivity(act / 40);

  /* autosave */
  UI.autosaveT += dt;
  if (UI.autosaveT > 20){
    UI.autosaveT = 0;
    UI.save();
  }
};

/* view-state for the renderer */
UI.viewState = function(){
  const S = UI.S;
  let ghost = null;
  if (UI.tool && UI.hover && !R.cine){
    const def = F.BUILDINGS[UI.tool];
    const [gx, gy] = ghostOrigin(UI.hover, def);
    const chk = F.canPlace(S, UI.tool, gx, gy, UI.dir);
    ghost = { key: UI.tool, x: gx, y: gy, dir: UI.dir, ok: chk.ok };
  }
  return {
    ghost,
    hover: UI.hover,
    selection: UI.selection,
    arrow: UI.arrow,
    beltPath: null,
  };
};

/* save on tab hide / close */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) UI.save();
});
root.addEventListener('beforeunload', () => UI.save());

})(typeof window !== 'undefined' ? window : globalThis);
