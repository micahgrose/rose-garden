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
  mouse: { x: null, y: null },   // null until the pointer first moves — keeps the cursor lantern off
  holdStack: null,
  speed: 1, lastSpeed: 1,
  mode: null,            // null | 'decon' | 'copy' | 'stamp'
  marquee: null,         // {sx,sy,ex,ey} in tile coords while dragging a box
  blueprint: null,       // {w,h,parts:[{key,dx,dy,dir,recipe}]}
  bpDir: 0,              // blueprint rotation (0..3)
  recipeClip: null,      // last-copied machine recipe (pipette)
  keys: {},
  toastSeen: {},
  autosaveT: 0,
  uiT: 0,
  arrow: null,
  started: false,
  cineStage: 0,
  slot: null,            // which save slot (0..2) the live game writes to
  slotName: null,        // its player-given name
};

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const SAVE_KEYS = ['foundry_save_v1_0', 'foundry_save_v1_1', 'foundry_save_v1_2'];
const LEGACY_KEY = 'foundry_save_v1';   // the old single-save; migrates into slot 0

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

  // global mouse tracking for the cursor-held stack — the renderer shares
  // the same object so the night pass can hang a little lantern on it
  R.mouse = UI.mouse;
  root.addEventListener('pointermove', (e) => {
    UI.mouse.x = e.clientX; UI.mouse.y = e.clientY;
    positionHeld();
  });
};

/* ---- three save slots ----
   Each slot key holds { name, save } (name + serialized world). The old
   single save migrates into slot 0 on first run. UI.slot / UI.slotName
   track which slot the live game writes back to. */
function migrateLegacy(){
  try {
    const old = localStorage.getItem(LEGACY_KEY);
    if (old){
      if (!localStorage.getItem(SAVE_KEYS[0]))
        localStorage.setItem(SAVE_KEYS[0], JSON.stringify({ name: 'Foundry', save: JSON.parse(old) }));
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch (e){}
}
function readSlot(i){
  try {
    const raw = localStorage.getItem(SAVE_KEYS[i]);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o && o.save) return { name: o.name || 'Foundry', data: o.save };
    return { name: 'Foundry', data: o };   // stray unwrapped save, tolerate it
  } catch (e){ return null; }
}
/* name + one-line progress label for a slot, or null if empty */
function slotMeta(i){
  const s = readSlot(i);
  if (!s) return null;
  const d = s.data;
  let idx = d.msIndex || 0;
  if (d.msId === 'won') idx = F.MILESTONES.length;
  else if (d.msId != null){ const mi = F.MILESTONES.findIndex(m => m.id === d.msId); if (mi >= 0) idx = mi; }
  const label = idx >= F.MILESTONES.length
    ? 'the Engine wakes'
    : `Tier ${idx + 1}/${F.MILESTONES.length} · ${F.MILESTONES[idx].name}`;
  return { name: s.name, label };
}
function loadSlot(i){
  const s = readSlot(i);
  if (!s) return null;
  try { return F.deserialize(s.data); } catch (e){ return null; }
}
UI.save = function(){
  if (!UI.S || R.cine || UI.S.testWorld || UI.slot == null) return;   // test worlds never touch a slot
  try {
    localStorage.setItem(SAVE_KEYS[UI.slot],
      JSON.stringify({ name: UI.slotName || 'Foundry', save: F.serialize(UI.S) }));
  } catch (e){}
};

/* ==================================================================== */
/* TITLE                                                                */
/* ==================================================================== */
let titleRaf = null;
function initTitle(){
  migrateLegacy();
  renderSlots();
  startTitleFx();
}

/* draw the three save-slot rows on the title screen */
function renderSlots(){
  const wrap = $('titleBtns');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < 3; i++){
    const meta = slotMeta(i);
    const row = el('div', 'saveSlot' + (meta ? '' : ' empty'));
    if (meta){
      row.appendChild(el('div', 'slotInfo',
        `<div class="slotName">${escapeHtml(meta.name)}</div><div class="slotSub">${escapeHtml(meta.label)}</div>`));
      const play = el('button', 'slotBtn slotPlay', 'CONTINUE');
      play.addEventListener('click', () => {
        A.init(); A.resume();
        const S = loadSlot(i);
        if (!S) return;
        UI.slot = i; UI.slotName = meta.name;
        startGame(S);
      });
      const del = el('button', 'slotBtn slotDel', '✕');
      del.title = 'Delete this save';
      del.addEventListener('click', () => confirmDeleteSlot(i, del));
      row.appendChild(play); row.appendChild(del);
    } else {
      row.appendChild(el('div', 'slotInfo', `<div class="slotName">Empty slot ${i + 1}</div>`));
      const nw = el('button', 'slotBtn slotNew', 'NEW GAME');
      nw.addEventListener('click', () => beginNewInSlot(i, row));
      row.appendChild(nw);
    }
    wrap.appendChild(row);
  }
}
// ROSEGARDEN: js/rosegarden.js redraws these rows when a newer world arrives
// from the player's account mid-boot. Keep this line when re-copying the game.
UI.renderSlots = renderSlots;

/* name-your-foundry input, inline in the slot row */
function beginNewInSlot(i, row){
  A.init(); A.resume();
  row.className = 'saveSlot naming';
  row.innerHTML = '';
  const input = el('input', 'slotInput');
  input.type = 'text'; input.maxLength = 24;
  input.placeholder = 'Name your foundry…';
  input.value = 'Foundry ' + (i + 1);
  const start = el('button', 'slotBtn slotStart', 'START');
  row.appendChild(input); row.appendChild(start);
  input.focus(); input.select();
  const go = () => {
    const name = (input.value || '').trim() || ('Foundry ' + (i + 1));
    const S = F.newGame();
    UI.slot = i; UI.slotName = name;
    try { localStorage.setItem(SAVE_KEYS[i], JSON.stringify({ name, save: F.serialize(S) })); } catch (e){}
    startGame(S);
  };
  start.addEventListener('click', go);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go();
    else if (e.key === 'Escape') renderSlots();
  });
}

function confirmDeleteSlot(i, btn){
  if (btn.dataset.confirm){
    try { localStorage.removeItem(SAVE_KEYS[i]); } catch (e){}
    renderSlots();
    return;
  }
  btn.dataset.confirm = '1';
  btn.textContent = 'SURE?';
  setTimeout(() => { renderSlots(); }, 2600);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
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
  setMode(null);
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
  UI.slot = null;
  renderSlots();
  startTitleFx();
}

/* dev/test sandbox: everything unlocked, deep pockets, never saved */
function startTestWorld(){
  const S = F.newGame();
  S.testWorld = true;
  UI.slot = null;   // sandbox is never written to a slot
  for (const k in F.BUILDINGS) S.unlocked[k] = true;
  for (const k in F.RECIPES) S.unlocked['r:' + k] = true;
  for (const k in F.ITEMS) S.inv[k] = 1000;
  for (const id in F.TECHS) S.research.done[id] = true;   // tree fully researched
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
  setSpeed(1);
  UI.mode = null; UI.marquee = null; UI.blueprint = null; UI.bpDir = 0;
  $('btnDecon').classList.remove('on'); $('btnBlueprint').classList.remove('on');
  $('modeHint').classList.add('hidden');
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
      if (UI.mode === 'decon' || UI.mode === 'copy'){ beginMarquee(P.lastTile); P.marqueeing = true; }
      else if (UI.mode === 'stamp'){ stampBlueprint(P.lastTile); }
      else if (UI.tool) placeAt(P.lastTile, true);
      // selection / mining resolved on up (if not dragged) or per-frame (mining)
    } else if (e.button === 2){
      if (UI.mode){ clearBuildMode(); }
      else if (UI.tool){ setTool(null); }
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
    if (P.down && P.marqueeing){
      const t = tileUnder(px, py);
      if (t) updateMarquee(t);
    } else if (P.down && P.btn === 0 && UI.tool){
      dragPlace(px, py);
    } else if (P.down && P.btn === 2 && !UI.tool && !UI.mode){
      const t = tileUnder(px, py);
      if (t) removeAt(t);
    } else if (P.down && P.btn === 0 && !UI.tool && !UI.mode){
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
    if (P.marqueeing){ finishMarquee(); P.marqueeing = false; }
    else if (P.down && P.btn === 0 && !UI.tool && !UI.mode && P.moved <= 8 && !P.mining){
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
    // occupied by a lower-tier line of the same kind → upgrade it in place
    if (chk.why === 'occupied' && (def.kind === 'belt' || def.kind === 'pipe')){
      if (tryUpgradeLine(gx, gy, def)) return;
    }
    // a splitter stamped onto a belt swaps in where the belt was
    if (chk.why === 'occupied' && def.kind === 'splitter'){
      if (trySplitterOnBelt(gx, gy)) return;
    }
    if (first){
      if (chk.why === 'cost'){ A.sfx.error(); toastCost(UI.tool); }
      else if (chk.why !== 'occupied'){ A.sfx.error(); toast(cap(chk.why), 'warn', 2600); }
    }
    return;
  }
  const e = F.place(S, UI.tool, gx, gy, UI.dir, false);
  if (e){
    A.sfx.place();
    UI.pointer.lastPlaced = [t[0], t[1]];   // anchor for spaced drag-lines
    if (e.platform){ R.platTile(S, e.x, e.y); buildBarAfford(); return; }
    if (e.kind === 'belt') tipOnce('firstBelt');
    if (e.kind === 'splitter') tipOnce('firstSplitter');
    if (e.kind === 'pump') tipOnce('firstPipe');
    if (e.kind === 'machine' && UI.recipeClip && F.recipeUnlocked(S, UI.recipeClip)){
      const r = F.RECIPES[UI.recipeClip];
      if (r && r.machine === def.fam){ e.recipe = UI.recipeClip; }
    }
    buildBarAfford();
  }
}

/* replace an existing belt/pipe with a different tier, preserving flow */
function tryUpgradeLine(x, y, def){
  const S = UI.S;
  const old = F.entAt(S, x, y);
  if (!old || old.kind !== def.kind) return false;
  if (old.key === UI.tool) return false;                 // same tier — nothing to do
  if (!F.canAfford(S, F.buildCost(S, UI.tool))){ return false; }
  // capture flow state
  const carry = { dir: old.dir, item: old.item, t: old.t, srcDir: old.srcDir,
                  fluid: old.fluid, isExit: old.isExit };
  F.remove(S, old.x, old.y);                             // refunds the old one (incl. its item)
  const e = F.place(S, UI.tool, x, y, carry.dir, false);
  if (!e){ return false; }
  if (def.kind === 'belt' && carry.item){
    e.item = carry.item; e.t = carry.t || 0; e.srcDir = carry.srcDir != null ? carry.srcDir : e.dir;
    F.invAdd(S, carry.item, -1);   // it was refunded by remove(); it's back on the belt now
  }
  if (def.kind === 'pipe' && carry.fluid) e.fluid = carry.fluid;
  A.sfx.place();
  buildBarAfford();
  return true;
}

/* the whole run of belts this one belongs to: forward along each belt's own
   direction, backward through whichever SINGLE belt feeds the chain —
   stopping at machines, splitters, tunnels, junctions and gaps */
function beltLineOf(S, start){
  const line = [start], seen = new Set([start.id]);
  let cur = start;
  while (true){
    const nxt = F.entAt(S, cur.x + F.DX[cur.dir], cur.y + F.DY[cur.dir]);
    if (!nxt || nxt.kind !== 'belt' || seen.has(nxt.id)) break;
    line.push(nxt); seen.add(nxt.id); cur = nxt;
  }
  cur = start;
  while (true){
    let prev = null, feeders = 0;
    for (let d = 0; d < 4; d++){
      const b = F.entAt(S, cur.x - F.DX[d], cur.y - F.DY[d]);
      if (b && b.kind === 'belt' && b.dir === d){ prev = b; feeders++; }
    }
    if (feeders !== 1 || seen.has(prev.id)) break;   // gap or junction — the line ends here
    line.unshift(prev); seen.add(prev.id); cur = prev;
  }
  return line;
}

/* drop a splitter straight onto a belt — the belt folds into it, keeping
   its direction and whatever item was riding it */
function trySplitterOnBelt(x, y){
  const S = UI.S;
  const old = F.entAt(S, x, y);
  if (!old || old.kind !== 'belt') return false;
  if (!F.canAfford(S, F.buildCost(S, 'splitter'))) return false;
  const carry = { dir: old.dir, item: old.item, t: old.t, srcDir: old.srcDir };
  F.remove(S, old.x, old.y);                             // refunds the belt (incl. its item)
  const e = F.place(S, 'splitter', x, y, carry.dir, false);
  if (!e){ return false; }
  if (carry.item){
    e.item = carry.item; e.t = carry.t || 0; e.srcDir = carry.srcDir != null ? carry.srcDir : e.dir;
    F.invAdd(S, carry.item, -1);
  }
  A.sfx.place();
  buildBarAfford();
  return true;
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
  if (def.kind !== 'belt' && def.kind !== 'pipe' && def.kind !== 'platform'){
    // machines/poles: drag lays a spaced line (tunnels stay click-only)
    P.lastTile = t;
    if (def.kind === 'ubelt') return;
    const spacing = def.kind === 'pole' ? Math.max(1, def.reach - 1) : Math.max(def.w, def.h);
    const lp = P.lastPlaced;
    if (!lp || Math.max(Math.abs(t[0] - lp[0]), Math.abs(t[1] - lp[1])) >= spacing){
      placeAt(t, false);
    }
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
  if (!e){
    // bare platform deck → lift it (only when nothing stands on it)
    if (F.removePlatform(UI.S, t[0], t[1])){
      R.platTile(UI.S, t[0], t[1]);
      A.sfx.remove();
      buildBarAfford();
    }
    return;
  }
  if (e.kind === 'core') return;
  if (UI.selection === e) select(null);
  const r = F.remove(UI.S, t[0], t[1]);
  A.sfx.remove();
  if (r && r.broken){
    const had = r.mods ? r.mods.length : 0;
    toast(had ? `Scrapped the wreck — salvaged ${r._salvaged} of ${had} module${had > 1 ? 's' : ''}.`
              : 'Scrapped the wreck — nothing worth keeping.', '', 2600);
  }
  buildBarAfford();
}

/* ==================================================================== */
/* BUILD MODES: box-deconstruct + blueprint copy/stamp                  */
/* ==================================================================== */
function setMode(m){
  UI.mode = m;
  if (m){ setTool(null); select(null); }
  if (m !== 'stamp'){ UI.blueprint = null; UI.bpDir = 0; }
  const bd = $('btnDecon'), bc = $('btnBlueprint');
  if (bd) bd.classList.toggle('on', m === 'decon');
  if (bc) bc.classList.toggle('on', m === 'copy' || m === 'stamp');
  hudModeHint();
}
function clearBuildMode(){ setMode(null); }

function hudModeHint(){
  const h = $('modeHint');
  if (!h) return;
  if (UI.mode === 'decon') h.textContent = 'DECONSTRUCT — drag a box to remove (full refund). Esc to exit.';
  else if (UI.mode === 'copy') h.textContent = 'COPY — drag a box over buildings to capture a blueprint.';
  else if (UI.mode === 'stamp') h.textContent = 'BLUEPRINT — click to stamp · R rotate · Esc to put away.';
  else { h.classList.add('hidden'); return; }
  h.classList.remove('hidden');
}

function boxOf(m){
  return { x0: Math.min(m.sx, m.ex), y0: Math.min(m.sy, m.ey),
           x1: Math.max(m.sx, m.ex), y1: Math.max(m.sy, m.ey) };
}

function beginMarquee(t){ UI.marquee = { sx: t[0], sy: t[1], ex: t[0], ey: t[1] }; }
function updateMarquee(t){ if (UI.marquee){ UI.marquee.ex = t[0]; UI.marquee.ey = t[1]; } }
function finishMarquee(){
  const m = UI.marquee; UI.marquee = null;
  if (!m) return;
  const b = boxOf(m);
  if (UI.mode === 'decon') applyDecon(b);
  else if (UI.mode === 'copy') captureBlueprint(b);
}

function entsInBox(b){
  const S = UI.S, seen = new Set(), out = [];
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++){
    const e = F.entAt(S, x, y);
    if (e && e.kind !== 'core' && !seen.has(e.id)){ seen.add(e.id); out.push(e); }
  }
  return out;
}

function applyDecon(b){
  const list = entsInBox(b);
  if (!list.length){ A.sfx.error(); return; }
  let wrecks = 0, saved = 0;
  for (const e of list){
    if (UI.selection === e) select(null);
    const r = F.remove(UI.S, e.x, e.y);
    if (r && r.broken){ wrecks++; saved += r._salvaged || 0; }
  }
  A.sfx.remove();
  buildBarAfford();
  toast(`Deconstructed ${list.length} building${list.length > 1 ? 's' : ''} (refunded)` +
    (wrecks ? ` — ${wrecks} wreck${wrecks > 1 ? 's' : ''} scrapped for nothing${
      saved ? ` (${saved} module${saved > 1 ? 's' : ''} salvaged)` : ''}.` : '.'), '', 2600);
}

function captureBlueprint(b){
  const list = entsInBox(b);
  if (!list.length){ A.sfx.error(); toast('Nothing to copy in that area.', 'warn', 2000); return; }
  const parts = list.map(e => ({ key: e.key, dx: e.x - b.x0, dy: e.y - b.y0, dir: e.dir,
    recipe: e.recipe || null,
    exPrio: e.exPrio ? Object.assign({}, e.exPrio) : null,
    exFilt: e.exFilt ? Object.assign({}, e.exFilt) : null,
    mode: e.mode || null, portItem: e.portItem || null }));
  UI.blueprint = { w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1, parts };
  UI.bpDir = 0;
  setMode('stamp');
  A.sfx.buy();
  toast(`Blueprint captured — ${parts.length} buildings. Click to stamp, R to rotate.`, 'tip', 5000);
}

/* rotate an offset within a w×h box by UI.bpDir quarter-turns (CW) */
function bpTransform(dx, dy, w, h, rot){
  switch (rot & 3){
    case 1: return [h - 1 - dy, dx];
    case 2: return [w - 1 - dx, h - 1 - dy];
    case 3: return [dy, w - 1 - dx];
    default: return [dx, dy];
  }
}
function bpParts(anchorX, anchorY){
  const bp = UI.blueprint;
  if (!bp) return [];
  const rot = UI.bpDir;
  return bp.parts.map(p => {
    const [ox, oy] = bpTransform(p.dx, p.dy, bp.w, bp.h, rot);
    return { key: p.key, x: anchorX + ox, y: anchorY + oy, dir: (p.dir + rot) & 3,
             recipe: p.recipe, exPrio: p.exPrio, exFilt: p.exFilt,
             mode: p.mode, portItem: p.portItem };
  });
}

function stampBlueprint(t){
  const S = UI.S, bp = UI.blueprint;
  if (!bp || !t) return;
  const parts = bpParts(t[0], t[1]);
  let placed = 0, skip = 0, poor = 0;
  for (const p of parts){
    if (!S.unlocked[p.key]){ skip++; continue; }
    const chk = F.canPlace(S, p.key, p.x, p.y, p.dir);
    if (!chk.ok){ if (chk.why === 'cost') poor++; else skip++; continue; }
    const e = F.place(S, p.key, p.x, p.y, p.dir, false);
    if (e){
      placed++;
      if (p.recipe && F.recipeUnlocked(S, p.recipe)) e.recipe = p.recipe;
      if (p.exPrio && e.exPrio) Object.assign(e.exPrio, p.exPrio);
      if (p.exFilt && e.exFilt) Object.assign(e.exFilt, p.exFilt);
      if (p.mode && e.kind === 'port'){ e.mode = p.mode; e.portItem = p.portItem; }
    }
    else poor++;
  }
  if (placed) A.sfx.place(); else A.sfx.error();
  buildBarAfford();
  if (poor && !placed) toast('Not enough materials to stamp this blueprint.', 'warn', 2400);
  else if (poor || skip) toast(`Stamped ${placed} · ${poor + skip} unbuilt (materials/blocked).`, '', 2400);
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
        if (UI.mode === 'stamp'){ UI.bpDir = (UI.bpDir + 1) & 3; A.sfx.rotate(); break; }
        UI.dir = (UI.dir + 1) & 3;
        if (!UI.tool && UI.selection && UI.selection.kind !== 'core'){
          UI.selection.dir = (UI.selection.dir + 1) & 3;
          UI.S.powerDirty = true;
          refreshSelPanel(true);
        }
        A.sfx.rotate();
        break;
      }
      case 'KeyX': setMode(UI.mode === 'decon' ? null : 'decon'); break;
      case 'KeyC': setMode(UI.mode === 'copy' || UI.mode === 'stamp' ? null : 'copy'); break;
      case 'KeyQ': {
        const t = UI.hover;
        const ent = t && F.entAt(UI.S, t[0], t[1]);
        if (ent && ent.kind !== 'core' && UI.S.unlocked[ent.key]){
          UI.recipeClip = ent.recipe || null;   // copy its recipe too
          setTool(ent.key);
        }
        break;
      }
      case 'KeyE': toggleBig('inventory'); break;
      case 'KeyU': toggleBig('milestones'); break;
      case 'KeyM': A.setOn(!A.on); $('btnSound').style.opacity = A.on ? 1 : .4; break;
      case 'KeyF': R.cam.x = UI.S.core.x + 2; R.cam.y = UI.S.core.y + 2; break;
      case 'Escape':
        if (UI.holdStack) returnHeld();
        else if (UI.mode) clearBuildMode();
        else if (!$('menuPop').classList.contains('hidden')) closeMenu();
        else if (UI.bigTab) closeBig();
        else if (UI.tool) setTool(null);
        else if (UI.selection) select(null);
        else openMenu();
        break;
      case 'KeyH': toggleBig('howto'); break;
      case 'KeyT': toggleBig('tree'); break;
      case 'Space': e.preventDefault(); togglePause(); break;
      case 'Equal': case 'NumpadAdd': setSpeed(clamp(UI.speed + 1, 1, 3)); break;
      case 'Minus': case 'NumpadSubtract': setSpeed(clamp(UI.speed - 1, 1, 3)); break;
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
  // requirement rows are clickable "how do I make this?" links (delegated —
  // the card body is rebuilt whenever counts change)
  $('objBody').addEventListener('click', (ev) => {
    const row = ev.target.closest && ev.target.closest('[data-goitem]');
    if (row){ A.sfx.click(); jumpToRecipe(row.dataset.goitem); }
  });
  $('btnFoundry').addEventListener('click', () => toggleBig('milestones'));
  $('btnInv').addEventListener('click', () => toggleBig('inventory'));
  $('techChip').addEventListener('click', () => { toggleBig('tree'); });
  bindMinimap();
  $('btnSound').addEventListener('click', () => {
    A.init(); A.resume();
    A.setOn(!A.on);
    $('btnSound').style.opacity = A.on ? 1 : .4;
  });
  $('btnSpeed').addEventListener('click', cycleSpeed);
  $('btnSun').addEventListener('click', () => {
    const S = UI.S;
    if (!S || !S.research.done.sunAnchor) return;
    S.sunFrozen = !S.sunFrozen;
    $('btnSun').classList.toggle('on', S.sunFrozen);
    toast(S.sunFrozen ? 'The Sun Anchor holds — the sky stands still.'
                      : 'The Sun Anchor releases — the sky turns again.', '', 3200);
    A.sfx.click();
  });
  $('btnDecon').addEventListener('click', () => setMode(UI.mode === 'decon' ? null : 'decon'));
  $('btnBlueprint').addEventListener('click', () => setMode(UI.mode === 'copy' || UI.mode === 'stamp' ? null : 'copy'));
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
  // only what you can actually build — everything still to come lives in the
  // tech tree (and the milestone list), not as greyed-out ads in the bar
  const S = UI.S;
  return F.BUILD_ORDER.filter(k => F.BUILDINGS[k].cat === cat && S && S.unlocked[k]);
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
  if (!list.length){
    const note = el('span', 'bname', 'Nothing here yet — the tech tree (T) opens more');
    note.style.cssText = 'opacity:.55;padding:8px 12px;align-self:center';
    bar.appendChild(note);
  }
  list.forEach((key, i) => {
    const def = F.BUILDINGS[key];
    const b = el('button', 'buildBtn' + (UI.tool === key ? ' on' : ''));
    b.dataset.key = key;
    b.appendChild(el('span', 'bkey', String(i + 1)));
    b.appendChild(R.makeBuildingIcon(key, 34));
    b.appendChild(el('span', 'bname', def.name));
    b.addEventListener('click', () => setTool(UI.tool === key ? null : key));
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
    b.classList.toggle('cant', S.unlocked[key] && !F.canAfford(S, F.buildCost(S, key)));
  }
}

function setTool(key){
  UI.tool = key;
  if (key){
    if (UI.mode){ UI.mode = null; UI.blueprint = null;
      $('btnDecon').classList.remove('on'); $('btnBlueprint').classList.remove('on'); hudModeHint(); }
    select(null);
    tipOnce('firstSelect');
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
  if (def.kind === 'tank') stats.push(`buffers ${def.cap} crude`);
  if (def.kind === 'beacon') stats.push(`boosts a ${def.range * 2 + def.w}×${def.range * 2 + def.w} area`);
  if (def.kind === 'acc') stats.push(`stores ${F.ACC_CAP} P·s · charges ${F.ACC_CHARGE} P, returns ${F.ACC_DISCHARGE} P`);
  if (def.kind === 'lamp') stats.push(`lights ${def.glow * 2} tiles at night`);
  if (stats.length) html += `<div class="tt-stat">${stats.join(' · ')}</div>`;
  html += '<div class="tt-cost">' + Object.entries(F.buildCost(S, key)).map(([k, n]) => {
    const have = F.invCount(S, k);
    return `<span class="${have < n ? 'lack' : ''}">${iconImg(k, 14)} ${n} <span class="have">(${F.fmt(have)})</span></span>`;
  }).join('') + '</div>';
  if (!S.unlocked[key]) html += `<div class="tt-lock">${def.tech ? 'Research: ' + F.TECHS[def.tech].name : 'Unlocks at: ' + (F.MILESTONES[def.unlock] ? F.MILESTONES[def.unlock].name : '—')}</div>`;
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
  if (y < 8) y = py + 18;                                    // no room above → below cursor
  if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;  // keep the bottom on-screen
  if (y < 8) y = 8;                                          // …and the top, for tall tips in the tree
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
  if (!UI.lineSel || !e || UI.lineSel.forId !== e.id) UI.lineSel = null;
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
  const sig = [e.id, e.recipe || '', e.linkId || 0, S.msIndex,
    e.exPrio ? `${e.exPrio.left}${e.exPrio.front}${e.exPrio.right}` : '',
    e.exFilt ? `${e.exFilt.left || ''},${e.exFilt.front || ''},${e.exFilt.right || ''}` : '',
    UI.lineSel && UI.lineSel.forId === e.id ? 'ln' + UI.lineSel.list.length : '',
    Object.keys(S.research.done).length,   // module-type / slot unlocks change the panel
    (e.mods || []).join(','), e.mode || '', e.portItem || ''].join('|');
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
      d.modfx = modFxStr(S, e, def);
      break;
    case 'machine':
      d.rate = rateStr(e);
      if (def.fam === 'refinery') d.tank = `${e.tank.toFixed(0)} / ${def.tank}`;
      d.modfx = modFxStr(S, e, def);
      break;
    case 'beacon': {
      const n = S.ents.filter(o => F.MODDABLE(o) && o._bcn && o._bcn.includes(e)).length;
      d.reach = `${n} machine${n === 1 ? '' : 's'}`;
      break;
    }
    case 'gen': case 'turbine':
      d.out = `${Math.round(def.out * F.powerMul(S))} P`;
      d.load = `${Math.round((e.load || 0) * 100)}%`;
      break;
    case 'solar': {
      const sn = F.sunFactor(S);
      d.out = `${Math.round(def.out * F.powerMul(S) * sn)} P` +
        (sn <= 0 ? ' · night' : sn < 1 ? ' · twilight' : ' · full sun');
      break;
    }
    case 'acc':
      d.charge = `${Math.round(e.charge || 0)} / ${F.ACC_CAP} P·s`;
      d.flow = e.flow > 0 ? `<span style="color:var(--accent2)">charging +${Math.round(e.flow)} P</span>`
        : e.flow < 0 ? `<span style="color:var(--accent)">discharging ${Math.round(e.flow)} P</span>`
        : 'idle';
      break;
    case 'port': {
      d.stored = `${e.total} / ${def.cap}`;
      if (e.mode === 'request' && e.drones){
        const flying = e.drones.filter(dr => dr.st !== 'idle').length;
        d.drones = flying ? `${flying} in flight · ${e.drones.length - flying} docked` : `${e.drones.length || F.DRONES_PER_PORT} docked`;
      } else d.drones = '—';
      break;
    }
    case 'lamp': {
      const sn2 = F.sunFactor(S);
      const powered = e.netId && S._netRatio && (S._netRatio[e.netId] || 0) > 0;
      d.lit = !powered ? '<span style="color:var(--bad)">no power</span>'
        : sn2 >= .85 ? 'off — daylight' : '<span style="color:var(--accent)">lit</span>';
      break;
    }
    case 'belt':
      d.speed = `${(def.speed * F.beltMul(S)).toFixed(2)} tiles/s`;
      break;
    case 'ubelt':
      d.link = e.linkId ? (e.isExit ? 'exit ✓' : 'entrance ✓') : '<span style="color:var(--accent)">unlinked</span>';
      break;
    case 'chest':
      d.stored = `${e.total} / ${(def.cap || F.CHEST_CAP) + F.upRank(S, 'capacitors') * 20}`;
      break;
    case 'pump':
      d.tank = `${e.tank.toFixed(1)} / 30`;
      break;
    case 'pipe':
      d.fluid = `${e.fluid.toFixed(1)} / ${def.cap}`;
      break;
    case 'tank':
      d.fluid = `${e.fluid.toFixed(0)} / ${def.cap}`;
      break;
    case 'lab': {
      const RS = S.research;
      if (RS.cur){
        const tk = F.TECHS[RS.cur];
        const sp = RS.prog[RS.cur] || {};
        d.res = `⚗ Researching: <b>${tk.name}</b>`;
        d.respk = Object.entries(tk.cost).map(([pk, n]) =>
          `${iconImg(pk, 13)} ${Math.min(sp[pk] || 0, n)} / ${n}`).join(' · ');
      } else {
        d.res = '<span class="ghostTxt">No project — open the Tech tree (T) and pick one</span>';
        d.respk = '';
      }
      d.read = e.workItem ? F.ITEMS[e.workItem].name : 'idle';
      break;
    }
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

function modFxStr(S, e, def){
  if (!(e.mods && e.mods.length) && !e._bcn) return '—';
  const fx = F.modEffects(S, e);
  const parts = [];
  if (Math.abs(fx.spd - 1) > .001) parts.push(`speed ×${fx.spd.toFixed(2)}`);
  if (def.power && Math.abs(fx.pow - 1) > .001) parts.push(`power ×${fx.pow.toFixed(2)}`);
  if (fx.prod > 0) parts.push(`+${Math.round(fx.prod * 100)}% bonus output`);
  return parts.join(' · ') || '—';
}

/* module slots + insert buttons for drills / machines / beacons */
function moduleSection(S, e, def){
  const slots = F.modSlots(S, e);
  const types = Object.keys(F.MODULES).filter(k => F.recipeUnlocked(S, k) || F.invCount(S, k) > 0 || (e.mods || []).includes(k));
  if (!types.length && !slots) return '';
  if (!slots){
    return `<div class="selDivider"></div><div class="selSection">Modules</div>` +
      `<div class="ghostNote">No module slots yet — research <b>Module slot I</b> in the Tech tree (T) to fit one.</div>`;
  }
  let h = `<div class="selDivider"></div><div class="selSection">Modules</div><div class="modRow">`;
  for (let i = 0; i < slots; i++){
    const m = (e.mods || [])[i];
    h += `<button class="modSlot${m ? ' filled' : ''}" data-slot="${i}" title="${m ? F.ITEMS[m].name + ' — click to remove' : 'Empty module slot'}">${m ? iconImg(m, 22) : '+'}</button>`;
  }
  h += `</div><div class="recipeGrid" style="margin-top:6px">`;
  for (const k of types){
    const inv = F.invCount(S, k);
    h += `<button class="recipeBtn modAdd" data-mod="${k}" ${inv > 0 ? '' : 'disabled'} title="Slot a ${F.ITEMS[k].name} (${F.fmt(inv)} in pocket)">${iconImg(k, 22)}</button>`;
  }
  h += `</div>`;
  if (e.kind === 'beacon')
    h += `<div class="ghostNote">Broadcasts at half strength to every machine in its ${def.range * 2 + def.w}×${def.range * 2 + def.w} area. Productivity doesn't transmit.</div>`;
  else
    h += row('Module effect', modFxStr(S, e, def), 'modfx');
  return h;
}

function bufsFor(e){
  if (e.kind === 'machine' || e.kind === 'lab') return buffers(e);
  if (e.kind === 'chest') return bufList(e.store);
  if (e.kind === 'port') return e.total > 0 ? bufList(e.store) : '';
  return '';
}

function buildSelPanel(e){
  const S = UI.S;
  const def = F.BUILDINGS[e.key];
  const p = $('selPanel');
  UI._selBroken = !!e.broken;
  const dv = dynVals(e);
  let html = '';
  html += `<div class="selHead"><canvas data-icon="${e.key}" width="44" height="44"></canvas>
    <div><div class="selTitle">${def.name}</div><div class="selSub">${kindLabel(def)}</div></div></div>`;

  if (e.broken){
    html += `<div class="ghostNote" style="color:#ff9a76">⚙ <b>Broken down.</b> Worn out from a lifetime of service — it will never run again. Scrapping it returns <b>nothing</b>; each slotted module has a coin-flip chance to survive the salvage. Durability research and hardened modules stretch machine lifetimes.</div>`;
  }

  if (e.kind === 'miner'){
    const i = F.tileIdx(S, e.x, e.y);
    const t = S.oreType[i];
    const ore = t ? F.ORES[t] : null;
    html += row('Deposit', ore ? `${ore.name} · endless vein` : '—');
    if (ore && (ore.minTier || 1) > (def.tier || 1))
      html += `<div class="ghostNote" style="color:var(--bad)">This drill is too weak to bite ${ore.name.toLowerCase()} — needs a ${minMachineName('miner', ore.minTier)} or better.</div>`;
    html += row('Rate', dv.rate, 'rate');
    if (def.power) html += row('Power draw', def.power + ' P');
    html += moduleSection(S, e, def);
  }
  if (e.kind === 'machine'){
    html += recipeSection(S, e, def);
    html += `<div data-bufs>${bufsFor(e)}</div>`;
    if (def.fam === 'refinery') html += row('Crude tank', dv.tank, 'tank');
    html += row('Rate', dv.rate, 'rate');
    if (def.power) html += row('Power draw', def.power + ' P');
    html += `<div class="progOuter" data-prog-wrap style="display:none"><div class="progFill" data-prog style="width:0%"></div></div>`;
    html += moduleSection(S, e, def);
  }
  if (e.kind === 'beacon'){
    html += row('Power draw', def.power + ' P');
    html += row('In range', dv.reach, 'reach');
    html += moduleSection(S, e, def);
  }
  if (e.kind === 'gen' || e.kind === 'turbine'){
    html += row('Output', dv.out, 'out');
    html += row('Load', dv.load, 'load');
  }
  if (e.kind === 'solar'){
    html += row('Output', dv.out, 'out');
    html += `<div class="ghostNote">Solar power follows the sun — nothing at night. Accumulators bridge the dark hours.</div>`;
  }
  if (e.kind === 'acc'){
    html += row('Charge', dv.charge, 'charge');
    html += row('Flow', dv.flow, 'flow');
    html += `<div class="ghostNote">Charges when its grid runs a surplus (a slow ${F.ACC_CHARGE} P trickle), discharges up to ${F.ACC_DISCHARGE} P to cover deficits.</div>`;
  }
  if (e.kind === 'lamp'){
    html += row('Status', dv.lit, 'lit');
    html += `<div class="ghostNote">Lights the night in a ${def.glow * 2}-tile circle. Needs a pole in range.</div>`;
  }
  if (e.kind === 'belt'){
    html += row('Speed', dv.speed, 'speed');
    const line = UI.lineSel && UI.lineSel.forId === e.id ? UI.lineSel.list : null;
    if (!line){
      html += `<button class="menuBtn" data-line style="margin-top:8px">⛓ Select line</button>`;
      html += `<div class="ghostNote">Selects every belt in this run — through corners, stopping at machines, splitters and gaps — to replace the whole line at once.</div>`;
    } else {
      html += `<div class="selSection">Line — ${line.length} belt${line.length > 1 ? 's' : ''}</div>`;
      const tiers = ['belt1', 'belt2', 'belt3', 'belt4'].filter(k => S.unlocked[k]);
      for (const k of tiers){
        const n = line.filter(b => b.key !== k).length;
        if (!n){ html += `<div class="ghostNote">${F.BUILDINGS[k].name} — the whole line already.</div>`; continue; }
        const per = F.buildCost(S, k), need = {};
        for (const c in per) need[c] = per[c] * n;
        const afford = F.canAfford(S, need);
        const costStr = Object.entries(need).map(([c, q]) =>
          `<span class="${F.invCount(S, c) < q ? 'lack' : ''}">${iconImg(c, 13)} ${F.fmt(q)}</span>`).join(' ');
        html += `<div class="lineRow"><button class="recipeBtn lineRep" data-lrep="${k}" ${afford ? '' : 'disabled'}
          title="Replace ${n} belt${n > 1 ? 's' : ''} with ${F.BUILDINGS[k].name}">${iconImg(k, 20)}</button>
          <div class="lineInfo"><b>${F.BUILDINGS[k].name}</b><div class="lineCost" data-lcost="${k}">${costStr}</div></div></div>`;
      }
      html += `<div class="ghostNote">Old belts refund in full; items riding the line stay on it.</div>`;
    }
  }
  if (e.kind === 'splitter'){
    const N_LBL = { left:'◀ Left exit', front:'▲ Front exit', right:'▶ Right exit' };
    html += `<div class="selSection">Exits</div>`;
    for (const n of ['left', 'front', 'right']){
      const p = e.exPrio[n], f = e.exFilt[n], blk = e.exBlock && e.exBlock[n], rat = (e.exRatio && e.exRatio[n]) || 1;
      html += `<div class="exitRow" data-exit="${n}">
        <span class="exitLbl">${N_LBL[n]}</span>
        <button class="exitSlot${blk ? ' blocked' : ''}" data-blockex="${n}" title="${blk ? 'Blocked — click to open' : 'Click to block this exit'}">${blk ? '✕' : '○'}</button>
        <button class="exitSlot prioSlot${p ? ' set' : ''}" data-clrp="${n}" title="${p ? `Priority ${p} — click to clear` : 'Drag a priority chip here'}">${p || '·'}</button>
        <span class="exitFilterLbl">filter</span>
        <button class="exitSlot filtSlot${f ? ' set' : ''}" data-clrf="${n}" title="${f ? `${F.ITEMS[f].name} only — click to clear` : 'Drag a resource here'}">${f ? iconImg(f, 18) : '·'}</button>
        <span class="ratioLbl">ratio</span><input class="ratioInput" type="number" min="0" max="100" value="${rat}" data-ratio="${n}" title="Weight for this exit (1-100)">
      </div>`;
    }
    html += `<div class="selSection">Priorities — drag onto an exit</div><div class="recipeGrid">`;
    for (const p of [1, 2, 3])
      html += `<button class="recipeBtn prioChip" data-dragp="${p}" title="Priority ${p}${p === 1 ? ' (first pick)' : p === 3 ? ' (last pick)' : ''}">${p}</button>`;
    html += `</div>`;
    const seen = F.ITEM_ORDER.filter(k =>
      F.oreTypeByItem[k] || S.inv[k] || S.delivered[k] || S.stats.made[k]);
    html += `<div class="selSection">Filters — drag onto an exit</div><div class="recipeGrid">`;
    for (const k of seen)
      html += `<button class="recipeBtn" data-dragf="${k}" title="${F.ITEMS[k].name}">${iconImg(k, 22)}</button>`;
    html += `</div>`;
    html += `<div class="ghostNote">Block an exit to make it 2-way. Drag priorities (1 fills first) and filters (item-only) onto exits. Set ratio weights for unranked distribution (1=low, 100=high). Filtered items use only their lanes.</div>`;
  }
  if (e.kind === 'lab'){
    html += `<div class="labProj">
      <div class="labProjName" data-dyn="res">${dv.res}</div>
      <div class="resBarOuter" data-labbar-wrap style="display:none;margin:7px 0 5px"><div class="resBarFill" data-labbar style="width:0%"></div></div>
      <div class="labProjPacks" data-dyn="respk">${dv.respk}</div>
    </div>`;
    html += row('Reading', dv.read, 'read');
    html += `<div data-bufs>${bufsFor(e)}</div>`;
    html += `<div class="progOuter" data-prog-wrap style="display:none"><div class="progFill" data-prog style="width:0%"></div></div>`;
    html += `<button class="menuBtn" data-openres style="margin-top:8px">⚗ Open the Tech tree</button>`;
    html += `<div class="ghostNote">Belt science packs into any side — all labs feed one shared project.</div>`;
  }
  if (e.kind === 'port'){
    html += `<div class="selSection">Mode</div><div class="recipeGrid">`;
    for (const [val, lbl, tip] of [['provide', '▲ Provide', 'Belts feed this depot; drones come and take from it'],
                                   ['request', '▼ Request', 'This depot sends drones to fetch the item, then feeds it out the front']])
      html += `<button class="recipeBtn prioBtn${e.mode === val ? ' on' : ''}" data-pmode="${val}" title="${tip}" style="width:auto;padding:0 10px">${lbl}</button>`;
    html += `</div>`;
    const seenP = F.ITEM_ORDER.filter(k => F.oreTypeByItem[k] || S.inv[k] || S.delivered[k] || S.stats.made[k]);
    html += `<div class="selSection">Item</div><div class="recipeGrid">`;
    html += `<button class="recipeBtn${!e.portItem ? ' on' : ''}" data-pitem="_" title="None">✕</button>`;
    for (const k of seenP)
      html += `<button class="recipeBtn${e.portItem === k ? ' on' : ''}" data-pitem="${k}" title="${F.ITEMS[k].name}">${iconImg(k, 22)}</button>`;
    html += `</div>`;
    html += row('Stored', dv.stored, 'stored');
    html += row('Drones', dv.drones, 'drones');
    html += `<div data-bufs>${bufsFor(e)}</div>`;
    if (!e.mode || !e.portItem)
      html += `<div class="ghostNote">Pick a mode and an item. A ▲ provider is fed by belts; a ▼ requester flies its two drones to the nearest stocked provider and dispenses out its front.</div>`;
    if (def.power) html += row('Power draw', def.power + ' P');
  }
  if (e.kind === 'ubelt'){
    html += row('Linked', dv.link, 'link');
    if (!e.linkId) html += `<div class="ghostNote">Place a matching tunnel within ${def.span} tiles, in the same direction, to link.</div>`;
  }
  if (e.kind === 'chest'){
    html += row('Stored', dv.stored, 'stored');
    html += `<div data-bufs>${bufsFor(e)}</div>`;
  }
  if (e.kind === 'pump'){
    html += row('Draw rate', `${(def.rate * F.pumpMul(S)).toFixed(2)} crude/s`);
    html += row('Tank', dv.tank, 'tank');
    html += row('Power draw', def.power + ' P');
  }
  if (e.kind === 'pipe') html += row('Crude', dv.fluid, 'fluid');
  if (e.kind === 'tank'){
    html += row('Crude stored', dv.fluid, 'fluid');
    html += `<div class="ghostNote">Connect pipes to any side — the reservoir banks crude when the line runs rich and feeds it back when pumps fall behind.</div>`;
  }
  if (e.kind === 'pole'){
    html += row('Linked poles', dv.links, 'links');
    html += row('Network', dv.net, 'net');
    html += row('Net power', dv.netpow, 'netpow');
    html += `<div class="ghostNote">Powers everything in the ${def.cover * 2 + 1}×${def.cover * 2 + 1} area around it; links to poles within ${def.reach} tiles.</div>`;
  }

  // fuel: two transfer slots — machine buffer ⇄ your pocket (burners only)
  if (def.fuel || e.kind === 'gen' || e.kind === 'turbine'){
    const isT = e.kind === 'turbine';
    const item = isT ? 'fuelCell' : 'coal';
    html += `<div class="selDivider"></div><div class="selSection">Fuel — ${isT ? 'fuel cells' : 'coal'}</div>
      <div class="bufRow">${iconImg(item, 16)}
        <div class="fuelBarOuter"><div class="fuelBarFill" data-fbar style="width:0%"></div></div></div>
      <div class="slotRow">
        <div class="slotBox" data-side="machine">
          ${iconImg(item, 22)}
          <span class="slotN" data-sn="machine">${e.fuelBuf} / ${F.fuelCap(S)}</span>
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
  /* splitter config: drag priority chips / resource icons onto exit rows */
  const startCfgDrag = (ev, payload, html) => {
    ev.preventDefault();
    const g = document.createElement('div');
    g.className = 'dragGhost';
    g.innerHTML = html;
    document.body.appendChild(g);
    const at = (e2) => { g.style.left = e2.clientX + 'px'; g.style.top = e2.clientY + 'px'; };
    const hot = (e2) => {
      const el = document.elementFromPoint(e2.clientX, e2.clientY);
      const row = el && el.closest ? el.closest('[data-exit]') : null;
      p.querySelectorAll('[data-exit]').forEach(r => r.classList.toggle('dropHot', r === row));
      return row;
    };
    at(ev);
    const move = (e2) => { at(e2); hot(e2); };
    const up = (e2) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      g.remove();
      p.querySelectorAll('[data-exit]').forEach(r => r.classList.remove('dropHot'));
      const el = document.elementFromPoint(e2.clientX, e2.clientY);
      const rowEl = el && el.closest ? el.closest('[data-exit]') : null;
      if (!rowEl){ A.sfx.click(); return; }
      const exit = rowEl.dataset.exit;
      if (payload.p){
        for (const n of ['left', 'front', 'right']) if (e.exPrio[n] === payload.p) e.exPrio[n] = 0;
        e.exPrio[exit] = payload.p;
      } else if (payload.f){
        e.exFilt[exit] = payload.f;
      }
      A.sfx.buy();
      refreshSelPanel(true);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  p.querySelectorAll('[data-dragp]').forEach(b => {
    b.addEventListener('pointerdown', ev => startCfgDrag(ev, { p: +b.dataset.dragp }, b.innerHTML));
  });
  p.querySelectorAll('[data-dragf]').forEach(b => {
    b.addEventListener('pointerdown', ev => startCfgDrag(ev, { f: b.dataset.dragf }, b.innerHTML));
  });
  p.querySelectorAll('[data-clrp]').forEach(b => {
    b.addEventListener('click', () => {
      if (!e.exPrio[b.dataset.clrp]) return;
      e.exPrio[b.dataset.clrp] = 0;
      A.sfx.click();
      refreshSelPanel(true);
    });
  });
  p.querySelectorAll('[data-clrf]').forEach(b => {
    b.addEventListener('click', () => {
      if (!e.exFilt[b.dataset.clrf]) return;
      e.exFilt[b.dataset.clrf] = null;
      A.sfx.click();
      refreshSelPanel(true);
    });
  });
  p.querySelectorAll('[data-blockex]').forEach(b => {
    b.addEventListener('click', () => {
      const exit = b.dataset.blockex;
      if (!e.exBlock) e.exBlock = { left: false, front: false, right: false };
      e.exBlock[exit] = !e.exBlock[exit];
      A.sfx.click();
      refreshSelPanel(true);
    });
  });
  p.querySelectorAll('[data-ratio]').forEach(inp => {
    let dragStart = null;

    const applyRatio = () => {
      const exit = inp.dataset.ratio;
      if (!e.exRatio) e.exRatio = { left: 1, front: 1, right: 1 };
      let val = parseInt(inp.value) || 1;
      val = Math.max(0, Math.min(100, val)) || 1;
      e.exRatio[exit] = val;
      inp.value = val;
      A.sfx.click();
      refreshSelPanel(true);
    };

    inp.addEventListener('pointerdown', (ev) => {
      dragStart = { y: ev.clientY, val: parseInt(inp.value) || 1 };
      inp.setPointerCapture(ev.pointerId);
    });

    inp.addEventListener('pointermove', (ev) => {
      if (!dragStart) return;
      const delta = dragStart.y - ev.clientY;
      let newVal = dragStart.val + Math.round(delta / 2);
      newVal = Math.max(0, Math.min(100, newVal)) || 1;
      inp.value = newVal;
    });

    inp.addEventListener('pointerup', () => {
      if (!dragStart) return;
      dragStart = null;
      applyRatio();
    });

    inp.addEventListener('change', applyRatio);
  });
  /* belt line select + one-click line replacement */
  const lineBtn = p.querySelector('[data-line]');
  if (lineBtn) lineBtn.addEventListener('click', () => {
    UI.lineSel = { forId: e.id, list: beltLineOf(S, e) };
    A.sfx.click();
    refreshSelPanel(true);
  });
  p.querySelectorAll('[data-lrep]').forEach(b => {
    b.addEventListener('click', () => {
      const key = b.dataset.lrep;
      const line = (UI.lineSel && UI.lineSel.forId === e.id) ? UI.lineSel.list : null;
      if (!line) return;
      const todo = line.filter(x2 => x2.key !== key && S.ents.includes(x2));
      const per = F.buildCost(S, key), need = {};
      for (const c in per) need[c] = per[c] * todo.length;
      if (!todo.length || !F.canAfford(S, need)){ A.sfx.error(); return; }
      let swapped = 0, anchor = null;
      for (const old of todo){
        const carry = { x: old.x, y: old.y, dir: old.dir, item: old.item, t: old.t, srcDir: old.srcDir };
        F.remove(S, old.x, old.y);
        const nb = F.place(S, key, carry.x, carry.y, carry.dir, false);
        if (!nb) continue;
        if (carry.item){
          nb.item = carry.item; nb.t = carry.t || 0;
          nb.srcDir = carry.srcDir != null ? carry.srcDir : nb.dir;
          F.invAdd(S, carry.item, -1);
        }
        swapped++;
        if (old.id === e.id || !anchor) anchor = nb;
      }
      A.sfx.place();
      buildBarAfford();
      toast(`Replaced ${swapped} belt${swapped > 1 ? 's' : ''} with ${F.BUILDINGS[key].name}.`, '', 2600);
      if (anchor){
        select(anchor);
        UI.lineSel = { forId: anchor.id, list: beltLineOf(S, anchor) };
        refreshSelPanel(true);
      } else select(null);
    });
  });
  p.querySelectorAll('[data-pmode]').forEach(b => {
    b.addEventListener('click', () => {
      const m = b.dataset.pmode === e.mode ? null : b.dataset.pmode;
      if (e.mode === 'request' && m !== 'request' && e.drones){
        // recall the fleet: cargo back to your pocket, drones scrapped with the mode
        for (const d of e.drones) if (d.cargo > 0 && d.item) F.invAdd(S, d.item, d.cargo);
        e.drones = [];
      }
      e.mode = m;
      A.sfx.click();
      refreshSelPanel(true);
    });
  });
  p.querySelectorAll('[data-pitem]').forEach(b => {
    b.addEventListener('click', () => {
      e.portItem = b.dataset.pitem === '_' ? null : b.dataset.pitem;
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
  const orb = p.querySelector('[data-openres]');
  if (orb) orb.addEventListener('click', () => { openBig('tree'); });
  p.querySelectorAll('[data-mod]').forEach(b => {
    b.addEventListener('click', () => {
      if (e.broken){ A.sfx.error(); return; }   // no upgrading a corpse
      const k = b.dataset.mod;
      const slots = F.modSlots(S, e);
      if (!e.mods) e.mods = [];
      if (e.mods.length >= slots || F.invCount(S, k) <= 0){ A.sfx.error(); return; }
      F.invAdd(S, k, -1);
      e.mods.push(k);
      A.sfx.buy();
      tipOnce('firstModule');
      refreshSelPanel(true);
    });
  });
  p.querySelectorAll('[data-slot]').forEach(b => {
    b.addEventListener('click', () => {
      if (e.broken){
        A.sfx.error();
        toast('The wreck\'s slots are fused shut — scrap it and hope the modules survive.', 'warn', 2600);
        return;
      }
      const i = +b.dataset.slot;
      if (!e.mods || !e.mods[i]){ A.sfx.click(); return; }
      F.invAdd(S, e.mods[i], 1);
      e.mods.splice(i, 1);
      A.sfx.click();
      refreshSelPanel(true);
    });
  });
  p.querySelector('[data-del]').addEventListener('click', () => {
    const r = F.remove(S, e.x, e.y);
    A.sfx.remove();
    if (r && r.broken){
      const had = r.mods ? r.mods.length : 0;
      toast(had ? `Scrapped the wreck — salvaged ${r._salvaged} of ${had} module${had > 1 ? 's' : ''}.`
                : 'Scrapped the wreck — nothing worth keeping.', '', 2600);
    }
    select(null);
    buildBarAfford();
  });
}

function updateSelPanel(e){
  const S = UI.S;
  const def = F.BUILDINGS[e.key];
  const p = $('selPanel');
  // broke down while the panel was open → rebuild so the banner appears
  if (!!e.broken !== !!UI._selBroken){ UI._selBroken = !!e.broken; buildSelPanel(e); return; }
  // line-replace buttons follow the wallet live
  if (UI.lineSel && UI.lineSel.forId === e.id){
    p.querySelectorAll('[data-lrep]').forEach(b => {
      const key = b.dataset.lrep;
      const n = UI.lineSel.list.filter(x2 => x2.key !== key).length;
      const per = F.buildCost(S, key), need = {};
      for (const c in per) need[c] = per[c] * n;
      b.disabled = !n || !F.canAfford(S, need);
    });
  }
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
  // lab: overall research progress bar
  const lb = p.querySelector('[data-labbar]');
  if (lb){
    const RS = S.research;
    const wrap = p.querySelector('[data-labbar-wrap]');
    if (RS.cur){
      const tk = F.TECHS[RS.cur];
      const sp = RS.prog[RS.cur] || {};
      let tot = 0, got = 0;
      for (const pk in tk.cost){ tot += tk.cost[pk]; got += Math.min(sp[pk] || 0, tk.cost[pk]); }
      wrap.style.display = '';
      lb.style.width = (tot ? got / tot * 100 : 0).toFixed(1) + '%';
    } else wrap.style.display = 'none';
  }
  // craft / read progress
  const pw = p.querySelector('[data-prog-wrap]');
  if (pw){
    const busy = e.crafting || (e.kind === 'lab' && e.workItem);
    pw.style.display = busy ? '' : 'none';
    if (busy){
      const pf = pw.querySelector('[data-prog]');
      if (pf) pf.style.width = (clamp(e.prog, 0, 1) * 100).toFixed(0) + '%';
    }
  }
  // fuel bar + slot counts
  const fb = p.querySelector('[data-fbar]');
  if (fb){
    const isT = e.kind === 'turbine';
    const perFuel = isT ? def.burn : F.COAL_BURN;
    fb.style.width = (clamp(e.fuelT / perFuel, 0, 1) * 100).toFixed(1) + '%';
    const item = isT ? 'fuelCell' : 'coal';
    const snM = p.querySelector('[data-sn="machine"]');
    const tM = `${e.fuelBuf} / ${F.fuelCap(S)}`;
    if (snM && snM.textContent !== tM) snM.textContent = tM;
    const snI = p.querySelector('[data-sn="inv"]');
    const tI = F.fmt(F.invCount(S, item));
    if (snI && snI.textContent !== tI) snI.textContent = tI;
  }
}

function kindLabel(def){
  return { belt:'logistics', ubelt:'logistics', splitter:'logistics', chest:'storage', pipe:'fluid', port:'air freight',
    miner:'extraction', tank:'fluid', machine:{smelter:'furnace', alloy:'furnace', asm:'assembler', refinery:'refinery', crusher:'crusher'}[def.fam] || 'machine',
    gen:'power', turbine:'power', solar:'power', acc:'power storage', lamp:'lighting', pole:'power grid', pump:'extraction', lab:'research', beacon:'support' }[def.kind] || def.kind;
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

// name the weakest machine of a family that can run a recipe (for tier hints)
function minMachineName(fam, tier){
  for (const k in F.BUILDINGS){ const b = F.BUILDINGS[k]; if (b.fam === fam && b.tier === tier) return b.name; }
  return 'a stronger machine';
}
function recipeSection(S, e, def){
  if (F.AUTO_RECIPES[def.fam]){
    const unlocked = F.AUTO_RECIPES[def.fam].filter(k => F.recipeUnlocked(S, k));
    const opts  = unlocked.filter(k => F.recipeFits(def, k));
    const gated = unlocked.filter(k => !F.recipeFits(def, k));
    let h = `<div class="selSection">${def.fam === 'crusher' ? 'Crushes automatically' : 'Smelts automatically'}</div>
      <div class="compChain">${opts.map(k => `<span>${iconImg(F.RECIPES[k].out, 15)}</span>`).join('') || '<span class="ghostTxt">nothing yet</span>'}</div>`;
    if (gated.length){
      const min = Math.min(...gated.map(k => F.RECIPES[k].minTier || 1));
      h += `<div class="ghostNote" style="color:var(--bad)">Too weak for ${gated.map(k => iconImg(F.RECIPES[k].out, 13)).join(' ')} — needs a ${minMachineName(def.fam, min)}.</div>`;
    }
    return h;
  }
  const opts = Object.keys(F.RECIPES).filter(k => {
    const r = F.RECIPES[k];
    return r.machine === def.fam && F.recipeUnlocked(S, k);
  });
  let h = `<div class="selSection">Recipe</div><div class="recipeGrid">`;
  for (const k of opts){
    const fits = F.recipeFits(def, k);
    const need = fits ? '' : ` — needs a ${minMachineName(def.fam, F.RECIPES[k].minTier || 1)}`;
    h += `<button class="recipeBtn${e.recipe === k ? ' on' : ''}${fits ? '' : ' locked'}" data-recipe="${k}"${fits ? '' : ' disabled'} title="${F.ITEMS[F.RECIPES[k].out].name}${need}">${iconImg(F.RECIPES[k].out, 24)}</button>`;
  }
  h += '</div>';
  if (e.recipe){
    const r = F.RECIPES[e.recipe];
    h += `<div class="compChain" style="margin-top:7px">` +
      Object.entries(r.in).map(([k, n]) => `<span>${n}× ${iconImg(k, 14)}</span>`).join(' ') +
      (r.fluid ? `<span>${r.fluid} crude</span>` : '') +
      `<span class="arrow">→</span><span>${r.outN}× ${iconImg(r.out, 14)}</span>` +
      (r.by ? Object.entries(r.by).map(([k, n]) => `<span class="arrow">+</span><span>${n}× ${iconImg(k, 14)}</span>`).join('') : '') +
      `</div>`;
  } else {
    h += `<div class="ghostNote">Choose what this machine crafts.</div>`;
  }
  return h;
}

/* ==================================================================== */
/* OBJECTIVE CARD                                                       */
/* ==================================================================== */
/* Core deliveries per minute over the last-minute window (sim dbuckets) */
function deliveryRate(k){
  const db = UI.S.stats.dbuckets;
  if (!db || !db.length) return 0;
  let n = 0;
  for (const b of db) n += b[k] || 0;
  return n / (db.length * 5 / 60);
}

/* objective requirement clicked → open the recipe book at that item */
function jumpToRecipe(item){
  openBig('compendium');
  const row = $('bigBody').querySelector(`[data-rk="${item}"]`);
  if (row){
    row.scrollIntoView({ block: 'center' });
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 2400);
  }
}

function refreshObjective(){
  const S = UI.S;
  if (!S) return;
  const ms = F.MILESTONES[S.msIndex];
  if (!ms){
    // post-win: the Engine's tribute
    const tr = S.tribute;
    $('objTier').textContent = '✦';
    if (!tr){
      $('objName').textContent = 'The Engine turns';
      const h = '<div class="objFlavor">Freeplay — the world is yours to pave.</div>';
      if (UI._objCache !== h){ UI._objCache = h; $('objBody').innerHTML = h; }
      return;
    }
    $('objName').textContent = 'Tribute ' + (tr.lvl + 1);
    let h = `<div class="objFlavor">${F.TRIBUTE_LINES[tr.lvl % F.TRIBUTE_LINES.length]}</div>`;
    for (const k in tr.req){
      const cur = Math.min(tr.prog[k] || 0, tr.req[k]);
      const done = cur >= tr.req[k];
      h += `<div class="objReq${done ? ' done' : ''}">
        <img src="${R.itemIcon(k, 36).toDataURL()}" width="18" height="18">
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between">
            <span class="objReqName">${F.ITEMS[k].name}</span>
            <span class="objReqNum">${cur} / ${tr.req[k]}</span>
          </div>
          <div class="objBarOuter"><div class="objBarFill" style="width:${(cur / tr.req[k] * 100).toFixed(1)}%"></div></div>
        </div></div>`;
    }
    const bonus = Math.min(tr.lvl, 10) * 3;
    h += `<div class="objReward">Engine's favour: <b style="color:var(--accent)">+${bonus}%</b> machine & drill speed${tr.lvl >= 10 ? ' (max — further tributes are for glory)' : ' · +3% per tribute'}</div>`;
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
    // live delivery rate → a quiet ETA, so long tiers read as progress not grind
    let rateTxt = '';
    if (!done && !ms.handMine){
      const r = deliveryRate(k);
      if (r > 0){
        const mins = (req[k] - cur) / r;
        rateTxt = ` · ${r < 10 ? r.toFixed(1) : Math.round(r)}/min` +
          (mins < 90 ? ` · ~${mins < 1 ? '<1' : Math.round(mins)}m` : '');
      }
    }
    html += `<div class="objReq${done ? ' done' : ''}" data-goitem="${k}" title="How is this made? Click to open its recipe.">
      <img src="${R.itemIcon(k, 36).toDataURL()}" width="18" height="18">
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between">
          <span class="objReqName">${F.ITEMS[k].name}${ms.handMine ? ' (by hand)' : ''}</span>
          <span class="objReqNum">${cur} / ${req[k]}<span class="objRate">${rateTxt}</span></span>
        </div>
        <div class="objBarOuter"><div class="objBarFill" style="width:${(cur / req[k] * 100).toFixed(1)}%"></div></div>
      </div></div>`;
  }
  if (ms.reqResearch){
    const got = Math.min(Object.keys(S.research.done).length, ms.reqResearch);
    const done = got >= ms.reqResearch;
    html += `<div class="objReq${done ? ' done' : ''}">
      <span style="width:18px;text-align:center;flex:none">⚗</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between">
          <span class="objReqName">Any technology researched</span>
          <span class="objReqNum">${got} / ${ms.reqResearch}</span>
        </div>
        <div class="objBarOuter"><div class="objBarFill" style="width:${(got / ms.reqResearch * 100).toFixed(1)}%"></div></div>
      </div></div>`;
  }
  // the guide: a live checklist for this tier (early tiers + later firsts)
  const steps = F.GUIDES[ms.id];
  if (steps){
    const bits = S.flags['g_' + ms.id] || 0;
    if (steps.some((st, i) => !(bits & (1 << i)))){
      html += '<div class="objGuide">';
      steps.forEach((st, i) => {
        const done = !!(bits & (1 << i));
        const cur = i === UI.guideCur;
        html += `<div class="gstep${done ? ' done' : cur ? ' cur' : ''}">
          <span class="gtick">${done ? '✓' : cur ? '▸' : '·'}</span><span>${st.t}</span></div>`;
      });
      html += '</div>';
    }
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
/* RESEARCH CHIP (under the objective card)                             */
/* ==================================================================== */
function refreshTechChip(){
  const S = UI.S;
  const chip = $('techChip');
  if (!chip) return;
  const RS = S && S.research;
  if (!S || !RS || !RS.cur){
    // no project — but if the guide is pointing at the tree, surface the
    // chip in an idle state so there's a visible thing to click
    if (S && UI.pulseKey === 'tree'){
      chip.classList.remove('hidden');
      chip.style.top = ($('objCard').getBoundingClientRect().bottom + 8) + 'px';
      if (UI._chipSig !== 'idle'){
        UI._chipSig = 'idle';
        chip.querySelector('span').textContent = '⚗ Tech tree (T) — pick a project';
        chip.querySelector('#techChipFill').style.width = '0%';
      }
    } else {
      chip.classList.add('hidden');
      UI._chipSig = '';
    }
    return;
  }
  const tk = F.TECHS[RS.cur];
  const sp = RS.prog[RS.cur] || {};
  let tot = 0, got = 0;
  for (const pk in tk.cost){ tot += tk.cost[pk]; got += Math.min(sp[pk] || 0, tk.cost[pk]); }
  const pct = Math.floor(got / tot * 100);
  chip.classList.remove('hidden');
  // ride just below the objective card, whatever its current height
  chip.style.top = ($('objCard').getBoundingClientRect().bottom + 8) + 'px';
  const sig = tk.name + '|' + pct;
  if (UI._chipSig !== sig){
    UI._chipSig = sig;
    chip.querySelector('span').textContent = `⚗ ${tk.name} · ${pct}%`;
    chip.querySelector('#techChipFill').style.width = pct + '%';
  }
}

/* ==================================================================== */
/* POWER BAR                                                            */
/* ==================================================================== */
function refreshPower(){
  const S = UI.S;
  const st = S.stats;
  const sn = F.sunFactor(S);
  // the world's clock: cycle mapped so noon sits mid-day, midnight mid-night;
  // 12-hour face that ticks in 10-minute jumps (1:20 PM → 1:30 PM)
  const h24 = ((((S.dayT || 0) / F.DAY_LEN) - .725) * 24 + 24) % 24;
  const tm = Math.floor(h24 * 6) * 10;          // total minutes, snapped to 10
  const hh = Math.floor(tm / 60), mm = tm % 60;
  const h12 = hh % 12 || 12, ap = hh >= 12 ? 'PM' : 'AM';
  $('clockTime').textContent = `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
  $('clockSky').textContent = sn >= .85 ? '☀' : sn <= .05 ? '☾' : '⛅';
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
  { id:'tree', name:'Tech tree' },
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
  $('bigPanel').classList.toggle('wide', tab === 'tree');   // the tree needs room to branch
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
    case 'tree': {
      renderTreeTab(body);
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
      let h = `<div class="selSection">Production — rate over the last ${Math.round(mins * 60)}s, graph spans 5 min</div><table class="statTable">`;
      const keys = F.ITEM_ORDER.filter(k => rates[k] || st.made[k]);
      if (!keys.length) h += '<tr><td class="ghostNote">No production yet.</td></tr>';
      for (const k of keys){
        h += `<tr><td>${iconImg(k, 15)} ${F.ITEMS[k].name}</td>
          <td><canvas class="spark" width="84" height="20" data-spark="${k}"></canvas></td>
          <td>${((rates[k] || 0) / mins).toFixed(1)} /min</td>
          <td>${F.fmt(st.made[k] || 0)} lifetime</td></tr>`;
      }
      h += '</table>';
      h += `<div class="selSection" style="margin-top:14px">World</div><table class="statTable">
        <tr><td>Time</td><td>${F.fmtTime(S.time)}</td></tr>
        <tr><td>Machines placed</td><td>${S.ents.length - 1}</td></tr>
        <tr><td>Delivered to Core</td><td>${F.fmt(Object.values(S.delivered).reduce((a, b) => a + b, 0))}</td></tr>
        <tr><td>Power</td><td>${Math.round(st.powerDemand)} / ${Math.round(st.powerSupply)} P</td></tr>
        ${S.tribute ? `<tr><td>Tributes offered</td><td>${S.tribute.lvl} · +${Math.min(S.tribute.lvl, 10) * 3}% speed</td></tr>` : ''}
      </table>`;
      body.innerHTML = h;
      fillSparks(body);
      break;
    }
  }
}

/* per-item production sparklines for the stats tab (one point per 5s bucket) */
function fillSparks(body){
  const S = UI.S;
  const bks = S.stats.buckets;
  if (!bks.length) return;
  body.querySelectorAll('canvas.spark').forEach(cv => {
    const item = cv.dataset.spark;
    const x = cv.getContext('2d');
    const w = cv.width, hgt = cv.height;
    x.clearRect(0, 0, w, hgt);
    const vals = bks.map(b => b[item] || 0);
    const mx = Math.max(1, ...vals);
    x.strokeStyle = 'rgba(89,214,255,.85)';
    x.lineWidth = 1;
    x.beginPath();
    const n2 = vals.length;
    for (let i = 0; i < n2; i++){
      const px2 = n2 > 1 ? i / (n2 - 1) * (w - 2) + 1 : w / 2;
      const py2 = hgt - 2 - (vals[i] / mx) * (hgt - 5);
      if (i) x.lineTo(px2, py2); else x.moveTo(px2, py2);
    }
    x.stroke();
    x.lineTo(w - 1, hgt - 1);
    x.lineTo(1, hgt - 1);
    x.closePath();
    x.fillStyle = 'rgba(89,214,255,.13)';
    x.fill();
  });
}

/* ==================================================================== */
/* TECH TREE TAB                                                        */
/* One map of everything that grows from the Engine: permanent upgrade  */
/* ranks (bought with goods) and lab technologies (researched with      */
/* science packs) hang off a single root as branching lanes.            */
/* Rebuilt only on structural change (project switched / tech done /    */
/* rank bought / new packs); progress + affordability are poked in      */
/* place so nodes stay hoverable while labs chew through packs.         */
/* ==================================================================== */
const TREE_COLW = 158, TREE_ROWH = 58, TREE_NW = 140, TREE_NH = 46, TREE_PAD = 14;
const TREE_ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const TREE_UP_ICON = { logistics:'gear', extraction:'ironOre', metallurgy:'ironIngot',
  fabrication:'circuit', gridOutput:'wire', efficiency:'glass', prospecting:'stone', capacitors:'copperIngot',
  durability:'steel' };

/* hand-authored lanes: [groupLabel, [startCol, spec…]…]. A spec is a
   tech id, 'up:track' (expands to five chained rank nodes) or null
   (skip a column so a child lines up with its era). */
const TREE_LANES = [
  ['The coal age',
    [1, 'combustion'],
    [1, 'coalHoppers', 'forcedDraft']],
  ['The grid',
    [2, 'electrification', 'pylons', 'substations'],
    [3, 'solarPower', 'solarTowers', 'helios'],
    [4, 'accumulators'],
    [4, 'sunAnchor'],
    [3, 'fuelTurbines', null, 'chromeTurbines'],
    [4, 'drones'],
    [1, 'up:gridOutput'],
    [1, 'up:efficiency']],
  ['Extraction',
    [1, 'up:extraction'],
    [1, 'up:prospecting'],
    [3, 'electricDrills', 'plasmaBores', 'quantumDrills'],
    [1, 'crushing', null, 'crushing2']],
  ['Logistics',
    [1, 'up:logistics'],
    [1, 'up:capacitors'],
    [1, 'fastBelts', null, 'magRails', 'gravBelts'],
    [1, 'tunnels', null, 'deepTunnels'],
    [1, 'depots', 'massStorage'],
    [1, 'platforms'],
    [2, 'pumpjacks', 'reservoirs'],
    [2, 'up:pumping']],
  ['Production',
    [1, 'up:metallurgy'],
    [1, 'up:fabrication'],
    [1, 'up:durability'],
    [3, 'arcFurnaces', 'plasmaForges'],
    [3, 'poweredAssembly', 'nanoForges'],
    [2, 'modules', 'speedModuleTech', 'effModuleTech', 'durModuleTech'],
    [5, 'prodModules'],
    [3, 'moduleSlot1', 'moduleSlot2', 'moduleSlot3'],
    [4, 'beacons'],
    [3, 'chromeworks', null, 'sunforge'],
    [4, 'tarSynthesis']],
];

let TREE_CACHE = null;
function treeLayout(){
  if (TREE_CACHE) return TREE_CACHE;
  const nodes = {}, edges = [], groups = [];
  nodes.root = { key:'root', root:true, x: TREE_PAD, y: TREE_PAD, h: 52 };
  let y = TREE_PAD + 52 + 16;
  for (const lane of TREE_LANES){
    groups.push({ name: lane[0], y });
    y += 24;
    for (let li = 1; li < lane.length; li++){
      const row = lane[li];
      let col = row[0];
      for (let i = 1; i < row.length; i++){
        const spec = row[i];
        if (spec === null){ col++; continue; }
        if (spec.startsWith('up:')){
          const track = spec.slice(3);
          for (let r = 0; r < F.UPGRADES[track].max; r++){
            const key = spec + ':' + r;
            nodes[key] = { key, up: track, rank: r, x: TREE_PAD + col * TREE_COLW, y };
            edges.push([r ? spec + ':' + (r - 1) : 'root', key]);
            col++;
          }
        } else {
          const tk = F.TECHS[spec];
          if (!tk) { col++; continue; } // skip undefined techs
          nodes[spec] = { key: spec, tech: spec, x: TREE_PAD + col * TREE_COLW, y };
          const req = tk.req, rr = tk.reqRank;
          let any = false;
          if (req && req.length){ for (const r of req) edges.push([r, spec]); any = true; }
          if (rr) for (const tr in rr){ edges.push(['up:' + tr + ':' + (rr[tr] - 1), spec]); any = true; }
          if (!any) edges.push(['root', spec]);
          col++;
        }
      }
      y += TREE_ROWH;
    }
    y += 14;
  }
  TREE_CACHE = { nodes, edges, groups,
    W: TREE_PAD * 2 + 5 * TREE_COLW + TREE_NW, H: y + TREE_PAD };
  return TREE_CACHE;
}

function treeEdgePath(s, d){
  const tx = d.x, ty = d.y + TREE_NH / 2;
  if (s.root){
    const sx = s.x + 34, sy = s.y + s.h;
    return `M ${sx} ${sy} C ${sx} ${ty}, ${tx - 60} ${ty}, ${tx} ${ty}`;
  }
  const sx = s.x + TREE_NW, sy = s.y + TREE_NH / 2;
  return `M ${sx} ${sy} C ${sx + 52} ${sy}, ${tx - 52} ${ty}, ${tx} ${ty}`;
}

/* fog of war: a tech draws in full only when every science pack it costs is
   craftable AND its prereqs are at most one step from done (frontier + 1).
   Anything deeper is a dim, nameless silhouette — the canopy keeps its
   shape, but the map grows with the player. */
function techVisible(S, id){
  const tk = F.TECHS[id], RS = S.research;
  if (RS.done[id] || RS.cur === id) return true;
  for (const pk in tk.cost) if (!F.recipeUnlocked(S, pk)) return false;
  return (tk.req || []).every(r =>
    RS.done[r] || !F.TECHS[r] || (F.TECHS[r].req || []).every(rr => RS.done[rr]));
}

function treeTechNode(S, n){
  const id = n.tech, tk = F.TECHS[id], RS = S.research;
  if (!techVisible(S, id))
    return `<div class="tnode tech tsil" style="left:${n.x}px;top:${n.y}px">
      <div class="tnTop"><span class="tnName">?</span></div></div>`;
  const done = !!RS.done[id], cur = RS.cur === id;
  const reqMet = (tk.req || []).every(r => RS.done[r]) && F.rankMet(S, tk);
  const sp = RS.prog[id] || {};
  let got = 0, tot = 0;
  for (const pk in tk.cost){ tot += tk.cost[pk]; got += Math.min(sp[pk] || 0, tk.cost[pk]); }
  const cls = done ? 'done' : cur ? 'cur' : reqMet ? 'avail' : 'tlock';
  const rankTag = (!done && tk.reqRank && !F.rankMet(S, tk))
    ? `<span class="tnTag" title="Needs Durability V">🔒</span>` : '';
  return `<div class="tnode tech ${cls}" data-node="${id}" style="left:${n.x}px;top:${n.y}px">
    <div class="tnTop">${iconImg(tk.icon, 15)}<span class="tnName">${tk.name}</span>${
      done ? '<span class="tnTag">✓</span>' : cur ? '<span class="tnTag cur">⚗</span>' : rankTag}</div>
    <div class="tnCost">${Object.entries(tk.cost).map(([pk, nn]) =>
      `<span>${iconImg(pk, 12)}<i data-tcost="${id}:${pk}">${done ? nn : Math.min(sp[pk] || 0, nn)}</i>/${nn}</span>`).join('')}</div>
    <div class="tnBar"><i data-tnbar="${id}" style="width:${done ? 100 : tot ? (got / tot * 100).toFixed(1) : 0}%"></i></div>
  </div>`;
}

function treeUpNode(S, n){
  const up = F.UPGRADES[n.up], have = S.upgrades[n.up] || 0;
  const owned = n.rank < have, next = n.rank === have;
  const cost = up.costs[n.rank];
  const cls = owned ? 'done' : next ? 'avail' + (F.canAfford(S, cost) ? ' can' : '') : 'tlock';
  return `<div class="tnode up ${cls}" data-node="${n.key}" style="left:${n.x}px;top:${n.y}px">
    <div class="tnTop">${iconImg(TREE_UP_ICON[n.up], 15)}<span class="tnName">${up.name} ${TREE_ROMAN[n.rank]}</span>${
      owned ? '<span class="tnTag">✓</span>' : ''}</div>
    <div class="tnCost">${Object.entries(cost).map(([k, nn]) =>
      `<span data-need="${k}:${nn}" class="${!owned && F.invCount(S, k) < nn ? 'lack' : ''}">${iconImg(k, 12)}${nn}</span>`).join('')}</div>
  </div>`;
}

function showTreeTip(ev, key){
  const S = UI.S, tt = $('tooltip');
  let html;
  if (key.startsWith('up:')){
    const parts = key.split(':'), track = parts[1], r = +parts[2];
    const up = F.UPGRADES[track], have = S.upgrades[track] || 0;
    html = `<div class="tt-name">${up.name} ${TREE_ROMAN[r]} <span class="tt-kind tkUp">upgrade</span></div>
      <div class="tt-desc">${up.desc}</div>
      <div class="tt-cost">` + Object.entries(up.costs[r]).map(([k, n]) => {
        const hv = F.invCount(S, k);
        return `<span class="${hv < n ? 'lack' : ''}">${iconImg(k, 14)} ${n} <span class="have">(${F.fmt(hv)})</span></span>`;
      }).join('') + `</div>
      <div class="tt-stat">${r < have ? 'owned ✓' : r === have ? 'click to buy' : `buy ${up.name} ${TREE_ROMAN[have]} first`}</div>`;
  } else {
    const tk = F.TECHS[key], RS = S.research;
    html = `<div class="tt-name">${tk.name} <span class="tt-kind tkRes">research</span></div>
      <div class="tt-desc">${tk.desc}</div>`;
    const names = (tk.unlocks || []).map(u => u.startsWith('r:')
      ? F.ITEMS[F.RECIPES[u.slice(2)].out].name : F.BUILDINGS[u].name);
    if (names.length) html += `<div class="tt-stat">unlocks: ${[...new Set(names)].join(', ')}</div>`;
    html += `<div class="tt-cost">` + Object.entries(tk.cost).map(([pk, n]) =>
      `<span>${iconImg(pk, 14)} ${n} ${F.ITEMS[pk].name}</span>`).join('') + `</div>`;
    const rankNeed = tk.reqRank && !F.rankMet(S, tk)
      ? Object.keys(tk.reqRank).map(k => `${F.UPGRADES[k].name} ${TREE_ROMAN[tk.reqRank[k] - 1]}`).join(', ')
      : null;
    if (RS.done[key]) html += `<div class="tt-stat">researched ✓</div>`;
    else if (RS.cur === key) html += `<div class="tt-stat">labs are on it — click to pause</div>`;
    else if (!(tk.req || []).every(r => RS.done[r]))
      html += `<div class="tt-lock">requires: ${tk.req.map(r => (F.TECHS[r] ? F.TECHS[r].name : r)).join(', ')}</div>`;
    else if (rankNeed)
      html += `<div class="tt-lock">requires: ${rankNeed} (max the upgrade first)</div>`;
    else html += `<div class="tt-stat">click to set as the lab project</div>`;
  }
  tt.innerHTML = html;
  tt.classList.remove('hidden');
  positionTip(ev.clientX, ev.clientY);
}

function treeClick(key, body){
  const S = UI.S;
  if (key.startsWith('up:')){
    const parts = key.split(':'), track = parts[1], r = +parts[2];
    if (r !== (S.upgrades[track] || 0)){ A.sfx.error(); return; }
    if (F.buyUpgrade(S, track)){ A.sfx.buy(); buildBarAfford(); }
    else { A.sfx.error(); return; }
  } else {
    const RS = S.research;
    if (RS.done[key]) return;
    if (RS.cur === key){ F.setResearch(S, null); A.sfx.click(); }
    else if (F.setResearch(S, key)) A.sfx.click();
    else { A.sfx.error(); return; }
  }
  hideTip();
  UI._treeSig = null;
  renderTreeTab(body);
}

function renderTreeTab(body){
  const S = UI.S;
  const RS = S.research;
  const L = treeLayout();
  const sig = [RS.cur || '', Object.keys(RS.done).sort().join(','),
    Object.keys(F.UPGRADES).map(k => S.upgrades[k] || 0).join(''),
    F.PACKS.filter(p => F.recipeUnlocked(S, p)).join(',')].join('|');
  if (UI._treeSig !== sig || !body.querySelector('.treeWrap')){
    UI._treeSig = sig;
    let h = '<div class="resHead">';
    if (RS.cur){
      const tk = F.TECHS[RS.cur];
      h += `<div class="resCurName">⚗ Researching: <b>${tk.name}</b> <span class="resLabs" data-reslabs></span></div>
        <div class="resBarOuter"><div class="resBarFill" data-resbar style="width:0%"></div></div>
        <div class="resCurPacks" data-respacks></div>
        <button class="resStop" data-stop>Pause project</button>`;
    } else {
      h += `<div class="ghostNote">Everything grows from the Engine. <b>Amber nodes</b> are upgrade ranks —
        click to buy with parts. <b>Violet nodes</b> are technologies — click one to make it the lab project,
        then belt science packs into <b>laboratories</b>. Switching projects keeps their progress.</div>`;
    }
    h += '</div>';
    /* edges */
    let sv = `<svg class="treeSvg" width="${L.W}" height="${L.H}" viewBox="0 0 ${L.W} ${L.H}">`;
    for (const [a, b] of L.edges){
      const s = L.nodes[a], d = L.nodes[b];
      if (!s || !d) continue;   // an edge to a skipped/undefined node — never crash the tree
      const srcOn = s.root ? true : s.tech ? !!RS.done[s.tech] : (S.upgrades[s.up] || 0) > s.rank;
      const dstOn = d.tech ? !!RS.done[d.tech] : (S.upgrades[d.up] || 0) > d.rank;
      const fogged = d.tech && !techVisible(S, d.tech);
      const cls = fogged ? 'eLock'
        : dstOn ? 'eOwn' : d.tech && RS.cur === d.tech ? 'eCur' : srcOn ? 'eOpen' : 'eLock';
      sv += `<path class="${cls}" d="${treeEdgePath(s, d)}"/>`;
    }
    sv += '</svg>';
    /* nodes + group labels */
    const rn = L.nodes.root;
    let nh = `<div class="tnode root" style="left:${rn.x}px;top:${rn.y}px">
      <div class="tnTop"><span class="tnName">THE ENGINE</span></div>
      <div class="tnSub">…all of it grows from the flame…</div></div>`;
    for (const k in L.nodes){
      if (k === 'root') continue;
      const n = L.nodes[k];
      nh += n.tech ? treeTechNode(S, n) : treeUpNode(S, n);
    }
    const gh = L.groups.map(g =>
      `<div class="treeGroup" style="left:${TREE_PAD + TREE_COLW}px;top:${g.y}px">${g.name}</div>`).join('');
    h += `<div class="treeScroll"><div class="treeWrap" style="width:${L.W}px;height:${L.H}px">${sv}${gh}${nh}</div></div>`;
    body.innerHTML = h;
    body.querySelectorAll('.tnode[data-node]').forEach(nd => {
      const key = nd.dataset.node;
      nd.addEventListener('click', () => treeClick(key, body));
      nd.addEventListener('mouseenter', ev => showTreeTip(ev, key));
      nd.addEventListener('mousemove', ev => positionTip(ev.clientX, ev.clientY));
      nd.addEventListener('mouseleave', hideTip);
    });
    const stop = body.querySelector('[data-stop]');
    if (stop) stop.addEventListener('click', () => {
      F.setResearch(S, null); A.sfx.click(); UI._treeSig = null; renderTreeTab(body);
    });
  }
  /* in-place pokes: header progress, current node's bar + counts, affordability */
  if (RS.cur){
    const tk = F.TECHS[RS.cur];
    const sp = RS.prog[RS.cur] || {};
    let tot = 0, got = 0;
    for (const pk in tk.cost){ tot += tk.cost[pk]; got += Math.min(sp[pk] || 0, tk.cost[pk]); }
    const pct = (got / tot * 100).toFixed(1) + '%';
    const bar = body.querySelector('[data-resbar]');
    if (bar) bar.style.width = pct;
    const nb = body.querySelector(`[data-tnbar="${RS.cur}"]`);
    if (nb) nb.style.width = pct;
    const pkEl = body.querySelector('[data-respacks]');
    if (pkEl){
      const t = Object.entries(tk.cost).map(([pk, n]) =>
        `${iconImg(pk, 13)} ${Math.min(sp[pk] || 0, n)} / ${n}`).join('<span class="arrow">·</span>');
      if (pkEl.innerHTML !== t) pkEl.innerHTML = t;
    }
    const lb = body.querySelector('[data-reslabs]');
    if (lb){
      const working = S.ents.filter(e => e.kind === 'lab' && e.workItem).length;
      const labs = S.ents.filter(e => e.kind === 'lab').length;
      const t = labs ? `· ${working} / ${labs} labs reading` : '· no labs built!';
      if (lb.textContent !== t) lb.textContent = t;
    }
    body.querySelectorAll('[data-tcost]').forEach(el2 => {
      const [id, pk] = el2.dataset.tcost.split(':');
      if (id !== RS.cur || !tk.cost[pk]) return;
      const t = '' + Math.min(sp[pk] || 0, tk.cost[pk]);
      if (el2.textContent !== t) el2.textContent = t;
    });
  }
  body.querySelectorAll('.tnode.up.avail').forEach(nd => {
    let ok = true;
    nd.querySelectorAll('[data-need]').forEach(sp2 => {
      const [k, n] = sp2.dataset.need.split(':');
      const lack = F.invCount(S, k) < +n;
      sp2.classList.toggle('lack', lack);
      if (lack) ok = false;
    });
    nd.classList.toggle('can', ok);
  });
}

/* ==================================================================== */
/* RECIPE BOOK                                                          */
/* ==================================================================== */
const MACHINE_NAMES = { smelter:'Furnace', alloy:'Alloy furnace', asm:'Assembler', refinery:'Refinery', crusher:'Crusher' };

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
  if (F.PACKS.includes(item)){
    // packs are consumed by laboratories, not recipes
    let h2 = `<div class="compUse">used in: <span class="compUseB">laboratory research (${
      F.TECH_ORDER.filter(id => F.TECHS[id].cost[item]).length} technologies)</span></div>`;
    return h2;
  }
  for (const k in F.RECIPES){
    const r = F.RECIPES[k];
    if (r.in[item] && recipeRevealed(S, k))
      uses.push(`<span title="${F.ITEMS[r.out].name}">${iconImg(r.out, 14)}</span>`);
  }
  const bld = [];
  if (F.MODULES[item]) bld.push('module slots in drills, machines & beacons');
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

  /* --- raw materials — only ones you've touched or need right now --- */
  h += `<div class="selSection">Raw materials — dug from deposits (endless)</div>`;
  const RAW = [
    ['ironOre',  'Grey-blue boulders near the Core. Your first metal.'],
    ['copperOre','Orange boulders near the Core. Becomes wire.'],
    ['coal',     'Dark boulders. Fuel for every burner machine and generator, and an alloying agent.'],
    ['stone',    'Pale boulders. Kilns and bricks.'],
    ['quartz',   'Pale-blue crystal, a journey out from the Core. Glass and silicon.'],
    ['titanOre', 'Violet boulders at the far edges of the world. The last age of machines.'],
    ['chromite', 'Teal crystal in the middle and far rings. Alloys into chrome — the metal of the Sunforge.'],
  ];
  const rawSeen = id => needed[id] || S.inv[id] || S.delivered[id] || S.handMined[id] || S.stats.made[id];
  let rawHidden = 0;
  for (const [id, note] of RAW){
    if (!rawSeen(id)){ rawHidden++; continue; }
    h += `<div class="compRow" data-rk="${id}">
      <img src="${R.itemIcon(id, 52).toDataURL()}" width="26" height="26">
      <div class="compMid">
        <div class="compName">${F.ITEMS[id].name}${needed[id] ? neededBadge() : ''}</div>
        <div class="compChain"><span>${note}</span></div>
        ${usedInHtml(S, id)}
      </div>
      <span class="compMachine">Drill / hand</span>
    </div>`;
  }
  if (S.unlocked.pump){
    h += `<div class="compRow">
      <div style="width:26px;height:26px;border-radius:50%;background:#141712;border:2px solid #3b3320;flex:none"></div>
      <div class="compMid">
        <div class="compName">Crude oil</div>
        <div class="compChain"><span>Black seeps in the far wastes. Pumpjacks draw it; pipes carry it to refineries.</span></div>
      </div>
      <span class="compMachine">Pumpjack</span>
    </div>`;
  } else rawHidden++;
  if (rawHidden) h += `<div class="ghostNote">…${rawHidden} more raw material${rawHidden > 1 ? 's' : ''} wait${rawHidden > 1 ? '' : 's'} farther out…</div>`;

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
      const tkid = locked && !msu ? F.techOf('r:' + k) : null;
      group += `<div class="compRow${locked ? ' compLocked' : ''}" data-rk="${r.out}">
        <img src="${R.itemIcon(r.out, 52).toDataURL()}" width="26" height="26">
        <div class="compMid">
          <div class="compName">${F.ITEMS[r.out].name}${r.outN > 1 ? ' ×' + r.outN : ''}${needed[r.out] ? neededBadge() : ''}${locked && msu ? `<span class="lockBadge">unlocks: ${msu.name}</span>` : tkid ? `<span class="lockBadge">research: ${F.TECHS[tkid].name}</span>` : ''}</div>
          <div class="compChain">${Object.entries(r.in).map(([ik, n]) => `<span>${n}× ${iconImg(ik, 13)} ${F.ITEMS[ik].name}</span>`).join('<span class="arrow">+</span>')}${r.fluid ? `<span class="arrow">+</span><span>${r.fluid} crude</span>` : ''}${r.by ? Object.entries(r.by).map(([bk, bn]) => `<span class="arrow">→ also</span><span>${bn}× ${iconImg(bk, 13)} ${F.ITEMS[bk].name}</span>`).join('') : ''}</div>
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
      if (d.kind === 'lab') stats.push(`reads a pack every ${d.packTime}s`);
      if (d.kind === 'chest' && d.cap) stats.push(`holds ${d.cap}`);
      if (d.kind === 'beacon') stats.push(`boosts a ${d.range * 2 + d.w}×${d.range * 2 + d.w} area`);
      if (d.kind === 'tank') stats.push(`buffers ${d.cap} crude`);
      if (d.kind === 'acc') stats.push(`stores ${F.ACC_CAP} P·s`);
      if (d.kind === 'lamp') stats.push(`lights ${d.glow * 2} tiles at night`);
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
  Complete all eighteen tiers to reignite the World Engine — and watch the land: <b>every finished tier
  heals a ring of the ash-waste around the Core back to green</b>. Even after Ignition the game
  goes on: the woken Engine asks for endless <b>tributes</b> — escalating baskets of goods, each
  one granting <b>+3% machine speed</b> (up to +30%).</p>

  <div class="selSection">First steps</div>
  <p class="howP">The early tiers walk you through everything: the objective card (top-left) carries a
  <b>guide checklist</b> that ticks itself off as you play, a gold arrow points at whatever the current
  step needs, and clicking any required item opens its recipe. If you already know the genre, ignore
  it all — the steps complete themselves in any order.</p>
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
  every open exit — and click one to configure each exit: drag <b>priority chips</b> (1 fills first,
  3 last) onto its exits, and drag a <b>resource</b> onto an exit to reserve that lane for it —
  perfect for pulling coal or tar out of a mixed line. A reserved lane takes ONLY its item, and that
  item goes nowhere else. Stamp a splitter <b>directly onto a belt</b> and it swaps in,
  keeping the belt's direction and cargo. Click any belt and <b>Select line</b> to grab its whole
  run and replace every belt in it with a faster tier in one click.
  <b>Tunnels</b> dive under up to 4 tiles
  (place the entrance, then the exit in the same direction) and let lines cross. The <b>depot</b>
  buffers 60 items and releases them out its front — a shock-absorber for uneven flows.
  Right-click removes anything for a <b>full refund</b>, contents included — redesign freely.
  (One exception: a machine that has <b>broken down</b> is scrap — no refund, contents lost,
  and each slotted module only survives the salvage on a coin flip.)</p>

  <div class="selSection">Machines</div>
  <p class="howP">Machines accept ingredients from belts on <b>any side</b> and eject from their
  <b>chute</b> (amber arrow — watch it when rotating). <b>Furnaces</b> smelt whatever suits their
  contents; <b>fabricators and assemblers</b> craft one chosen recipe — click the machine and pick it.
  The <b>alloy furnace</b> fuses two inputs: iron ingots + coal → ${ic('steel')} steel,
  quartz + coal → ${ic('silicon')} silicon. Mk1 machines burn coal; electric machines are far
  faster but only run on <b>grid power</b> — coal means nothing to them. A machine with a blinking
  <b>amber dot</b> is out of fuel;
  a stalled machine usually has a jammed chute or missing ingredients — click it to see its buffers.</p>
  <p class="howP">Nothing lasts forever: every drill, furnace, assembler, crusher, refinery and pumpjack
  <b>wears out</b> as it works — past each stretch of service its survival is a <b>roll of the dice</b>,
  and one day it <b>breaks down for good</b>: a crumbled, smoking wreck you must scrap (nothing comes
  back; slotted modules survive on a coin flip) and replace. Higher-mark machines endure longer,
  <b>Durability</b> ranks in the tech tree add +16% per rank to each service stretch, and the
  ${ic('durModule')} <b>hardened module</b> adds +120% to whatever it's slotted in <i>and</i> makes it
  likelier to survive each wear check. Max the Durability line and you can research
  <b>Invincibility</b> — the brutally expensive endgame tech that <b>ends breakdowns entirely</b>,
  so nothing you build ever wears out again. How long exactly? The machines don't say.</p>

  <div class="selSection">Power</div>
  <p class="howP">Coal serves the burner age: Mk1 drills, kilns, fabricators and crushers eat it
  directly (<b>Coal hoppers</b> triples their bunker, <b>Forced draft</b> runs them 30% faster while
  eating coal 60% faster). Everything beyond runs on electricity, and electricity means
  <b>Electrification</b>: it wakes the grid, where generators make power but <b>poles deliver it</b>.
  A ${ic('wire')}
  <b>power pole</b> links to poles within 7 tiles (wires draw automatically) and energises the 5×5
  area around it — generators must stand in a pole's area too. Separate pole clusters are
  <b>separate grids</b>, each with its own supply and demand. A blinking <b>red bolt</b> means no
  pole in range; when demand exceeds supply everything electric slows down proportionally (a
  brown-out — the top-right bar turns red). Generators idle when nothing draws power, so fuel is
  never wasted. And power is <b>scarce</b>: machines are hungry and generators modest, so budget the
  grid like any other production line — banks of generators, whole fields of solar. Later:
  <b>solar arrays</b> trickle free power and <b>fuel turbines</b> burn
  ${ic('fuelCell')} fuel cells for serious output; the <b>pylon</b> spans 14 tiles.</p>

  <div class="selSection">Air freight</div>
  <p class="howP">The <b>Cargo drones</b> tech unlocks the <b>drone depot</b>. Set one to
  <b>▲ Provide</b> an item and feed it by belt; set another anywhere — the far titanium fields,
  the oil wastes — to <b>▼ Request</b> the same item. Its two drones fly to the nearest stocked
  provider, carry back ${F.DRONE_CAP} at a time, and the depot dispenses out its front like a
  depot chest. Both ends need grid power to dispatch; airborne drones always finish their run.</p>

  <div class="selSection">Day & night</div>
  <p class="howP">The world turns: every eleven minutes a full <b>day/night cycle</b> passes (the
  <b>clock</b> in the top-right corner shows the hour — ☀ by day, ☾ after dark). <b>Solar power follows the sun</b> — full output at
  noon, nothing at night — so a solar-heavy factory browns out after dusk unless you research
  <b>accumulators</b>: grid batteries that bank surplus by day — slowly, a thin trickle per unit,
  so start charging long before dusk — and feed it back through the dark.
  <b>Lamps</b> (cheap, with Electrification) light the night in a warm circle around your factory floors.
  And deep in the solar branch waits <b>The Sun Anchor</b> — a toggle to hold the sky still.</p>

  <div class="selSection">The tech tree</div>
  <p class="howP">Once the <b>laboratory</b> arrives, it is the road onward: milestones hand out only the
  most basic machines, and <b>everything else lives in the tech tree</b> (${kb('T')}) — the power grid,
  every Mk2+ machine, faster belts, depots and tunnels. Distant branches show as dim outlines and
  <b>draw in as you approach them</b>; the map grows with you. The tree holds two
  kinds of node: <b>upgrade ranks</b> (amber) are bought with parts, while
  <b>technologies</b> (violet) are lab projects — craft ${ic('pack1')}
  <b>science packs</b> in a fabricator (cog science = gear + copper ingot),
  belt them into any side of a lab, and click a node to set the project.
  Branches include ${ic('ironDust')} ore-doubling <b>crushers</b>, the 240-item
  <b>vault</b>, area-powering <b>substations</b>, <b>grav-belts</b>, <b>solar towers</b>.
  Later milestones unlock richer packs (${ic('pack2')} volt, ${ic('pack3')} polymer,
  ${ic('pack4')} quantum). More labs read packs in parallel, and switching projects never loses progress.
  Deep in the tree wait ${ic('speedModule')} <b>modules</b> — inserts that trade power for speed
  (or the reverse), plus ${ic('prodModule')} productivity skim — and the <b>beacon</b>, which
  broadcasts its own modules at half strength to every machine in a 10×10 area. Modules take real
  investment: <b>Machine modules</b> only opens the door, then you research each <b>type</b> (Speed,
  Efficiency, Hardened) and each <b>Module slot</b> (I → II → III) on its own — a machine has
  <b>no slots at all</b> until you do. Beacons come with their own two slots. Click any drill or
  machine to fit modules into its earned slots.</p>

  <div class="selSection">Oil</div>
  <p class="howP">Black seeps in the far wastes hold crude. Research <b>Oil prospecting</b> for the
  tools: a <b>pumpjack</b> placed over a seep draws
  it endlessly; <b>pipes</b> carry it to a <b>refinery</b>, which cracks it into ${ic('plastic')}
  plastic (with coal) or ${ic('fuelCell')} fuel cells (with steel). Pipes only connect pumpjacks,
  refineries, <b>reservoirs</b> (a researchable 240-crude buffer tank) and other pipes.
  Cracking always leaves ${ic('tar')} <b>tar</b> in the chute alongside the product — let it pile up
  and the refinery jams. And tar has almost nowhere to go: <b>the Core refuses it, ordinary depots
  refuse it, drones won't haul it</b> — only tar-cooking machines and the squat brick <b>tar pit</b>
  (210 tar, nothing else) will take it off a belt. Reserve a
  <b>splitter exit</b> for tar to pull it aside, smelt it back into coal,
  or research <b>Tar synthesis</b> to re-polymerise it into extra plastic.</p>

  <div class="selSection">Growing the factory</div>
  <p class="howP">Ore near the Core is humble; <b>quartz and teal chromite wait in the middle distance,
  titanium and oil at the world's edge</b> — every age pushes your logistics farther out.
  Dark <b>lakes</b> lie between you and the good deposits: nothing builds on open water until you
  research <b>Pontoon platforms</b>, then drag a line of decking across and belt right over it —
  platforms carry machines and power poles too (tunnels dive underneath, and drones fly straight over).
  Chromite alloys into ${ic('chrome')} chrome and ${ic('chromsteel')} chromsteel, the metal of the
  researchable <b>Mk4 machines</b> and the 400 P <b>chrome turbine</b>. One price rule to know:
  once you own one of an electric building, every further copy of it costs <b>nearly double</b>
  (×1.9). Ratios matter: one
  fabricator eats the output of two or three kilns, so belt more smelting into your assemblers than
  feels polite. The <b>tech tree</b> (${kb('T')}) sells permanent upgrade ranks — belt speed, drill
  speed, furnace heat, grid output — paid in parts, and each machine family has faster Mk
  versions to research and rebuild with. Check <b>Stats</b> to see production per minute — each item now has a 5-minute
  <b>graph</b>, so a flatlining line points straight at your bottleneck. The <b>minimap</b>
  (bottom-left) shows the whole world — click or drag on it to fly anywhere — and the <b>alert
  chips</b> above it count machines that are out of fuel, unpowered or jammed; click a chip to jump
  to the next culprit.</p>

  <div class="selSection">Controls</div>
  <table class="statTable">
    <tr><td>Place / select / hand-mine</td><td>${kb('Left click')} / hold</td></tr>
    <tr><td>Lay belt lines</td><td>${kb('Left drag')} with a belt selected</td></tr>
    <tr><td>Remove (full refund)</td><td>${kb('Right click')} / drag</td></tr>
    <tr><td>Rotate</td><td>${kb('R')}</td></tr>
    <tr><td>Blueprint (copy area → stamp)</td><td>${kb('C')}</td></tr>
    <tr><td>Deconstruct box</td><td>${kb('X')}</td></tr>
    <tr><td>Pause / game speed</td><td>${kb('Space')} · ${kb('+')} ${kb('−')}</td></tr>
    <tr><td>Pan</td><td>${kb('W A S D')} · ${kb('Middle drag')} · ${kb('Left drag')} on empty ground</td></tr>
    <tr><td>Zoom</td><td>${kb('Wheel')}</td></tr>
    <tr><td>Copy hovered building</td><td>${kb('Q')}</td></tr>
    <tr><td>Quick-select from build bar</td><td>${kb('1')}–${kb('9')}</td></tr>
    <tr><td>Inventory</td><td>${kb('E')}</td></tr>
    <tr><td>Foundry panel</td><td>${kb('U')}</td></tr>
    <tr><td>Tech tree</td><td>${kb('T')}</td></tr>
    <tr><td>This guide</td><td>${kb('H')}</td></tr>
    <tr><td>Centre on the Core</td><td>${kb('F')}</td></tr>
    <tr><td>Mute</td><td>${kb('M')}</td></tr>
    <tr><td>Menu / cancel</td><td>${kb('Esc')}</td></tr>
  </table>`;
}

/* ==================================================================== */
/* MINIMAP + PROBLEM ALERTS                                             */
/* ==================================================================== */
const MM_CAT = { ext:'#ffd76e', log:'rgba(170,180,196,.8)', pro:'#59d6ff', pow:'#ffe9b0' };

function drawMinimap(){
  const S = UI.S;
  const wrap = $('minimapWrap');
  if (!S || !R.groundCanvas || wrap.classList.contains('collapsed')) return;
  const cv = $('minimap');
  const x = cv.getContext('2d');
  const k = cv.width / Math.max(S.w, S.h);
  x.clearRect(0, 0, cv.width, cv.height);
  x.drawImage(R.groundCanvas, 0, 0, cv.width, cv.height);
  // buildings — belts faint, machines by category
  for (const e of S.ents){
    if (e.kind === 'core') continue;
    let c;
    if (e.kind === 'belt' || e.kind === 'ubelt' || e.kind === 'pipe' || e.kind === 'splitter')
      c = 'rgba(150,160,175,.5)';
    else if (e.kind === 'pole') c = 'rgba(120,220,255,.65)';
    else c = MM_CAT[F.BUILDINGS[e.key].cat] || '#fff';
    x.fillStyle = c;
    x.fillRect(e.x * k, e.y * k, Math.max(1.2, e.w * k), Math.max(1.2, e.h * k));
  }
  // the Core
  const co = S.core;
  x.fillStyle = '#ffd76e';
  x.fillRect(co.x * k - 1, co.y * k - 1, co.w * k + 2, co.h * k + 2);
  // blinking problem blips
  if (UI._alerts && Math.floor(performance.now() / 400) % 2 === 0){
    const blip = (list, col) => {
      x.fillStyle = col;
      for (const e of list){
        x.beginPath(); x.arc(e.x * k + 1, e.y * k + 1, 2.4, 0, 7); x.fill();
      }
    };
    blip(UI._alerts.power, '#ff7676');
    blip(UI._alerts.fuel, '#ffb454');
  }
  // camera viewport
  const s = R.tilePx();
  const hw = (R.W / 2) / s, hh = (R.H / 2) / s;
  x.strokeStyle = 'rgba(255,255,255,.8)';
  x.lineWidth = 1;
  x.strokeRect((R.cam.x - hw) * k, (R.cam.y - hh) * k, hw * 2 * k, hh * 2 * k);
}

function bindMinimap(){
  const cv = $('minimap');
  let drag = false;
  const move = (ev) => {
    const S = UI.S;
    if (!S) return;
    const r = cv.getBoundingClientRect();
    const k = r.width / Math.max(S.w, S.h);
    R.cam.x = (ev.clientX - r.left) / k;
    R.cam.y = (ev.clientY - r.top) / k;
    clampCam();
  };
  cv.addEventListener('pointerdown', (ev) => { drag = true; cv.setPointerCapture(ev.pointerId); move(ev); ev.preventDefault(); });
  cv.addEventListener('pointermove', (ev) => { if (drag) move(ev); });
  cv.addEventListener('pointerup', () => { drag = false; });
  $('mmToggle').addEventListener('click', () => {
    const w = $('minimapWrap');
    w.classList.toggle('collapsed');
    const on = w.classList.contains('collapsed');
    $('mmToggle').textContent = on ? '▸' : '▾';
    $('mmToggle').title = on ? 'Expand map' : 'Collapse map';
    A.sfx.click();
  });
}

/* scan for troubled machines → clickable chips; click cycles through them */
function refreshAlerts(){
  const S = UI.S;
  const bar = $('alertBar');
  const fuel = [], power = [], jam = [], broken = [];
  // a machine only counts as jammed after sitting at a FULL output buffer
  // for 3+ seconds — brief cap-touches while still ejecting don't flicker it
  if (!UI._jamSince) UI._jamSince = {};
  const now = S.time;
  for (const e of S.ents){
    const def = F.BUILDINGS[e.key];
    if (!def) continue;
    if (e.broken){ broken.push(e); continue; }   // dead machines get one alert, not three
    if ((def.fuel || e.kind === 'gen' || e.kind === 'turbine') &&
        e.fuelT <= 0 && e.fuelBuf <= 0) fuel.push(e);
    if ((def.power || e.kind === 'gen' || e.kind === 'turbine' || e.kind === 'solar') &&
        !e.netId) power.push(e);
    const atCap = (e.kind === 'machine' && e.outTotal >= 6 + F.bufBonus(S)) ||
                  (e.kind === 'miner' && e.outTotal >= 4 + F.bufBonus(S));
    if (atCap){
      if (UI._jamSince[e.id] == null) UI._jamSince[e.id] = now;
      if (now - UI._jamSince[e.id] > 3) jam.push(e);
    } else if (UI._jamSince[e.id] != null){
      delete UI._jamSince[e.id];
    }
  }
  UI._alerts = { fuel, power, jam, broken };
  updateCallout(S, { fuel, power, jam, broken });
  const sig = fuel.length + '|' + power.length + '|' + jam.length + '|' + broken.length;
  if (UI._alertSig === sig) return;
  UI._alertSig = sig;
  let h = '';
  if (fuel.length) h += `<button class="alertChip aFuel" data-alert="fuel" title="Click to jump to one">🔥 ${fuel.length} out of fuel</button>`;
  if (power.length) h += `<button class="alertChip aPower" data-alert="power" title="Click to jump to one">⚡ ${power.length} no power pole</button>`;
  if (jam.length) h += `<button class="alertChip aJam" data-alert="jam" title="Click to jump to one">⛔ ${jam.length} output jammed</button>`;
  if (broken.length) h += `<button class="alertChip aFuel" data-alert="broken" title="Click to jump to one">⚙ ${broken.length} broken down</button>`;
  bar.innerHTML = h;
  bar.querySelectorAll('[data-alert]').forEach(b =>
    b.addEventListener('click', () => jumpAlert(b.dataset.alert)));
}

/* The first time each problem kind ever happens, anchor a label to the
   troubled machine itself — a toast can be missed; this stays until the
   player actually fixes it, then that kind never anchors again. */
const CALLOUT_TEXT = {
  fuel:  'Out of coal',
  power: 'No power',
  jam:   'Output jammed',
  broken:'Broken down — replace it',
};
function updateCallout(S, lists){
  const co = UI.callout;
  if (co){
    // resolved (or removed)? retire this kind for good
    const still = lists[co.kind].some(e => e.id === co.entId);
    if (!still){
      S.flags['co_' + co.kind] = true;
      UI.callout = null;
    } else {
      const e = S.ents.find(en => en.id === co.entId);
      if (e){ co.x = e.x + e.w / 2; co.y = e.y; }
    }
    return;
  }
  for (const kind of ['fuel', 'power', 'jam', 'broken']){
    if (S.flags['co_' + kind] || !lists[kind].length) continue;
    const e = lists[kind][0];
    UI.callout = { kind, entId: e.id, x: e.x + e.w / 2, y: e.y, text: CALLOUT_TEXT[kind] };
    return;
  }
}

function jumpAlert(type){
  const list = (UI._alerts && UI._alerts[type]) || [];
  if (!list.length) return;
  UI._alertIdx = UI._alertIdx || {};
  const i = (UI._alertIdx[type] || 0) % list.length;
  UI._alertIdx[type] = i + 1;
  const e = list[i];
  R.cam.x = e.x + e.w / 2;
  R.cam.y = e.y + e.h / 2;
  clampCam();
  select(e);
  A.sfx.click();
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

function toastCost(key){
  const S = UI.S;
  const lacks = Object.entries(F.buildCost(S, key))
    .filter(([k, n]) => F.invCount(S, k) < n)
    .map(([k, n]) => `${iconImg(k, 13)} ${n - F.invCount(S, k)} more ${F.ITEMS[k].name}`);
  toast('Need ' + lacks.join(', '), 'warn', 3200);
}

function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

/* ---------- game speed ---------- */
const SPEED_GLYPH = { 0: '⏸', 1: '▶', 2: '⏩', 3: '⏭' };
function setSpeed(s){
  UI.speed = s;
  if (s > 0) UI.lastSpeed = s;
  const b = $('btnSpeed');
  b.textContent = SPEED_GLYPH[s];
  b.style.color = s === 0 ? 'var(--accent)' : (s > 1 ? 'var(--accent2)' : '');
  b.title = s === 0 ? 'Paused — click or Space to resume' : `Speed ${s}× — click to change, Space to pause`;
}
function cycleSpeed(){ setSpeed(UI.speed >= 3 ? 1 : (UI.speed === 0 ? 1 : UI.speed + 1)); A.sfx.click(); }
function togglePause(){ setSpeed(UI.speed === 0 ? UI.lastSpeed : 0); A.sfx.click(); }

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
      if (ent.fuelBuf >= F.fuelCap(UI.S)){ A.sfx.error(); return; }
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
    put = Math.min(amt, F.fuelCap(UI.S) - ent.fuelBuf);
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
        A.sfx.engine();
        const done = F.MILESTONES[ev.index];
        const next = F.MILESTONES[S.msIndex];
        const whisper = F.ENGINE_LINES[ev.index] || '';
        toast(`<b style="color:var(--accent)">◆ ${ev.name} complete</b>` +
          (done && done.recap ? `<br>${done.recap}` : '') +
          (next ? `<br>Next: <b>${next.name}</b>` : '') +
          (whisper ? `<br><i style="color:#d9b8ef">${whisper}</i>` : '') +
          `<br><span style="color:#8cdc96">The ash recedes — the land around the Core remembers green.</span>`, '', 9000);
        R.buildGround(S);            // the world heals a ring further
        R.healPulse = { t: 0 };
        refreshObjective();
        buildBar();
        if (next && next.id === 'mLab') tipOnce('firstUpgrade');   // the tree just opened
        UI.save();
        break;
      }
      case 'place':
        if (ev.key === 'lab') tipOnce('firstLab');
        break;
      case 'broken': {
        A.sfx.error();
        toast(`<b style="color:#ff9a76">⚙ ${F.BUILDINGS[ev.key].name} has broken down</b><br>` +
          `Worn out from service. It's scrap now — remove it and place a fresh one. ` +
          `Durability research and hardened modules make them last longer.`, 'warn', 8000);
        break;
      }
      case 'research': {
        A.sfx.milestone();
        const tk = F.TECHS[ev.id];
        const names = (tk.unlocks || []).map(u => u.startsWith('r:')
          ? F.ITEMS[F.RECIPES[u.slice(2)].out].name
          : F.BUILDINGS[u].name);
        toast(`<b style="color:#c07ae8">⚗ ${ev.name} — researched</b>` +
          (names.length ? `<br>unlocked: ${[...new Set(names)].join(', ')}` : ''), '', 9000);
        buildBar();
        UI._treeSig = null;
        if (UI.bigTab === 'tree') renderBig();
        UI.save();
        break;
      }
      case 'tribute': {
        A.sfx.milestone();
        A.sfx.engine();
        const bonus = Math.min(ev.lvl, 10) * 3;
        toast(`<b style="color:#ffd76e">✦ Tribute ${ev.lvl} offered</b><br>The Engine stirs in gratitude — ` +
          (ev.lvl <= 10 ? `machines now run <b>+${bonus}%</b> faster.` : 'your name rings in its halls.'), '', 8000);
        R.healPulse = { t: 0, gold: true };
        refreshObjective();
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
/* GUIDED STEPS + TUTORIAL ARROW                                        */
/* Latches each guide step's predicate into S.flags (bitmask per tier)  */
/* so transient conditions count once seen; the first open step drives  */
/* the world arrow and any build-bar pulse.                             */
/* ==================================================================== */
function guideTick(){
  const S = UI.S;
  const ms = S && F.MILESTONES[S.msIndex];
  UI.guideCur = -1;
  UI.pulseKey = null;
  const steps = ms && F.GUIDES[ms.id];
  if (!steps) return;
  const key = 'g_' + ms.id;
  let bits = S.flags[key] || 0;
  let ticked = false;
  for (let i = 0; i < steps.length; i++){
    if (bits & (1 << i)) continue;
    let d = false;
    try { d = !!steps[i].done(S); } catch (err) {}
    if (d){ bits |= (1 << i); ticked = true; }
  }
  if (bits !== (S.flags[key] || 0)){
    S.flags[key] = bits;
    if (ticked) A.sfx.click();   // one tick even if several steps latch at once
  }
  for (let i = 0; i < steps.length; i++){
    if (!(bits & (1 << i))){
      UI.guideCur = i;
      UI.pulseKey = steps[i].pulse || null;
      return;
    }
  }
}

/* resolve the current guide step's arrow spec to a world point */
function guideArrow(){
  const S = UI.S;
  const ms = F.MILESTONES[S.msIndex];
  const steps = ms && F.GUIDES[ms.id];
  if (!steps || UI.guideCur < 0) return null;
  const spec = steps[UI.guideCur].arrow;
  if (!spec) return null;
  if (spec === 'core') return { x: S.core.x + S.core.w / 2, y: S.core.y };
  if (spec.startsWith('ore:')) return nearestOre(+spec.slice(4));
  if (spec.startsWith('ent:')){
    const fam = (e, f) => e.kind === 'machine' && F.BUILDINGS[e.key].fam === f;
    const match = {
      miner:     e => e.kind === 'miner',
      ironMiner: e => e.kind === 'miner' && S.oreType[e.y * S.w + e.x] === 1,
      smelter:   e => fam(e, 'smelter'),
      asm:       e => fam(e, 'asm'),
      alloy:     e => fam(e, 'alloy'),
      lab:       e => e.kind === 'lab',
    }[spec.slice(4)];
    const e = match && S.ents.find(match);
    if (e) return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
  }
  return null;
}

function updateArrow(){
  const S = UI.S;
  UI.arrow = null;
  if (S.won) return;
  // the guide knows best; otherwise fall back to the old tier-0 pointers
  const g = guideArrow();
  if (g){ UI.arrow = g; return; }
  if (S.msIndex > 1) return;
  const ms = F.MILESTONES[S.msIndex];
  if (S.msIndex === 0 && ms.handMine){
    const need = Object.keys(ms.handMine).find(k => (S.msProg[k] || 0) < ms.handMine[k]);
    if (need) UI.arrow = nearestOre(F.oreTypeByItem[need]);
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

  /* hand mining: hold LMB on ore with no tool and no build mode active */
  if (P.down && P.btn === 0 && !UI.tool && !UI.mode && !P.panning && !R.cine){
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
    guideTick();
    refreshObjective();
    refreshPower();
    refreshAlerts();
    if (UI.selection) refreshSelPanel();
    buildBarAfford();
    if (UI.bigTab === 'stats' || UI.bigTab === 'inventory' || UI.bigTab === 'tree') renderBig();
    refreshTechChip();
    updateArrow();
    // pulse the build-bar button (or tech chip) the current guide step points at
    for (const b of $('buildBar').children)
      if (b.classList) b.classList.toggle('gpulse', !!b.dataset && b.dataset.key === UI.pulseKey);
    $('techChip').classList.toggle('gpulse', UI.pulseKey === 'tree');
    // the Sun Anchor toggle appears once researched
    $('btnSun').classList.toggle('hidden', !S.research.done.sunAnchor);
    $('btnSun').classList.toggle('on', !!S.sunFrozen);
  }

  /* minimap at ~8 Hz */
  UI.mmT = (UI.mmT || 0) + dt;
  if (UI.mmT >= .12){
    UI.mmT = 0;
    drawMinimap();
  }

  /* audio activity follows the working factory */
  let act = 0;
  for (const e of S.ents){
    if (e.active || e.load > .05) act++;
    if (act > 40) break;
  }
  A.setActivity(act / 40);
  if (A.tickMusic) A.tickMusic(dt, S.won ? 1 : S.msIndex / F.MILESTONES.length, F.sunFactor(S) < .5);

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
  if (UI.tool && UI.hover && !R.cine && !UI.mode){
    const def = F.BUILDINGS[UI.tool];
    const [gx, gy] = ghostOrigin(UI.hover, def);
    const chk = F.canPlace(S, UI.tool, gx, gy, UI.dir);
    ghost = { key: UI.tool, x: gx, y: gy, dir: UI.dir, ok: chk.ok };
  }
  // blueprint stamp preview
  let bpGhost = null;
  if (UI.mode === 'stamp' && UI.blueprint && UI.hover && !R.cine){
    bpGhost = bpParts(UI.hover[0], UI.hover[1]).map(p => {
      const chk = F.canPlace(S, p.key, p.x, p.y, p.dir);
      return { key: p.key, x: p.x, y: p.y, dir: p.dir, ok: chk.ok || chk.why === 'cost' };
    });
  }
  return {
    ghost, bpGhost,
    marquee: UI.marquee ? Object.assign(boxOf(UI.marquee), { mode: UI.mode }) : null,
    hover: (UI.mode || UI.holdStack) ? null : UI.hover,
    selection: UI.selection,
    lineSel: (UI.lineSel && UI.selection && UI.lineSel.forId === UI.selection.id) ? UI.lineSel.list : null,
    arrow: UI.arrow,
    callout: UI.callout,
    beltPath: null,
  };
};

/* save on tab hide / close */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) UI.save();
});
root.addEventListener('beforeunload', () => UI.save());

})(typeof window !== 'undefined' ? window : globalThis);
