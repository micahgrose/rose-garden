/* ============ Foundry ↔ RoseGarden account bridge ============

   RoseGarden-only glue. The game itself (core/data/sim/audio/render/ui/main)
   is copied verbatim from the standalone build and knows nothing about
   accounts — it just keeps three save slots in localStorage. This file sits
   between those slots and /api/foundry/save so a logged-in player's factories
   follow them from device to device.

   It is deliberately external and hook-light so the game files can be
   re-copied over the top at any time without losing the integration. The one
   line it needs from ui.js is `UI.renderSlots = renderSlots;` (marked there
   with a ROSEGARDEN comment); without it, everything still works except the
   title screen won't refresh itself when a newer world arrives from the
   account mid-boot.

   How it works:
     · localStorage.setItem / removeItem are wrapped for the three slot keys,
       so every write the game makes — autosave, new game, delete — is mirrored
       up without the game needing to ask.
     · Pushes are throttled; localStorage is always current, and a world that
       never made it up is migrated on the next visit (newest timestamp wins).
     · The pre-slot save (`foundry_save_v1`) is purged on load. Those worlds
       predate the tech tree, the day/night cycle and the new tiers, and the
       matching account blobs are deleted server-side on boot.
*/
(function(root){
'use strict';

const F = root.F;
if (!F || !F.ui) return;

const SAVE_KEYS   = ['foundry_save_v1_0', 'foundry_save_v1_1', 'foundry_save_v1_2'];
const LEGACY_KEYS = ['foundry_save_v1', 'foundry_save_ts'];   // the pre-slot single save
const OWNER_KEY   = 'foundry_save_owner';                     // whose slots this browser is caching
const API         = '/api/foundry/save';
const PUSH_MS     = 30000;                                    // never hammer the server faster than this

/* ---- raw storage access, so our own writes don't re-enter the wrapper ---- */
let LS = null;
try { LS = root.localStorage; LS.getItem(OWNER_KEY); } catch (e){ LS = null; }
if (!LS) return;                                   // private mode / storage blocked — game runs local-only

const rawGet = k      => { try { return Storage.prototype.getItem.call(LS, k); } catch (e){ return null; } };
const rawSet = (k, v) => { try { Storage.prototype.setItem.call(LS, k, v); } catch (e){} };
const rawDel = k      => { try { Storage.prototype.removeItem.call(LS, k); } catch (e){} };

/* ---- who's logged in ---- */
const token = rawGet('rg_token');
function jwtPayload(t){
  try {
    const b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b))));
  } catch (e){ return null; }
}
const me = token ? jwtPayload(token) : null;

/* ---- 1. drop the pre-slot save, always ----
   It is an older world format and the current game would migrate it straight
   into slot 0. Deleting it is the whole point of the changeover. */
for (const k of LEGACY_KEYS) rawDel(k);

/* ---- 2. shared browsers: don't hand one account another's cached slots ---- */
if (me && me.id){
  const prev = rawGet(OWNER_KEY);
  if (prev && prev !== me.id) for (const k of SAVE_KEYS) rawDel(k);
  rawSet(OWNER_KEY, me.id);
}

/* ==================================================================== */
/* PUSH — slot writes travel up to the account                          */
/* ==================================================================== */
const pending = [null, null, null];
let pushT = null, lastPush = 0;

function readLocal(i){
  const raw = rawGet(SAVE_KEYS[i]);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    return (o && o.save) ? o : null;
  } catch (e){ return null; }
}

function queue(i, o){
  if (!token || !o) return;
  pending[i] = o;
  if (pushT) return;
  pushT = setTimeout(flush, Math.max(0, PUSH_MS - (Date.now() - lastPush)));
}

function flush(){
  if (pushT){ clearTimeout(pushT); pushT = null; }
  if (!token) return;
  lastPush = Date.now();
  for (let i = 0; i < 3; i++){
    const o = pending[i];
    if (!o) continue;
    pending[i] = null;
    push(i, o);
  }
}

function push(i, o){
  let body;
  try {
    body = JSON.stringify({
      slot: i,
      name: o.name || 'Foundry',
      save: JSON.stringify(o.save),
      updatedAt: o.ts || Date.now()
    });
  } catch (e){ return; }
  try {
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body
    }).catch(() => {});
  } catch (e){}
}

function dropRemote(i){
  if (!token) return;
  try {
    fetch(API + '/' + i, {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token }
    }).catch(() => {});
  } catch (e){}
}

/* ---- wrap the slot keys ---- */
const patchedSet = function(k, v){
  const i = SAVE_KEYS.indexOf(k);
  if (i >= 0){
    // stamp the write so local-vs-account conflicts can be resolved by age
    try {
      const o = JSON.parse(v);
      o.ts = Date.now();
      v = JSON.stringify(o);
      queue(i, o);
    } catch (e){}
  }
  return Storage.prototype.setItem.call(LS, k, v);
};
const patchedDel = function(k){
  const i = SAVE_KEYS.indexOf(k);
  if (i >= 0){ pending[i] = null; dropRemote(i); }
  return Storage.prototype.removeItem.call(LS, k);
};
let patched = false;
try {
  LS.setItem = patchedSet;
  LS.removeItem = patchedDel;
  patched = (LS.setItem === patchedSet);
} catch (e){ patched = false; }

/* Belt and braces: if the wrapper didn't take, autosaves still get mirrored.
   (When it did take this is a harmless re-queue of the same slot.) */
const origSave = F.ui.save;
F.ui.save = function(){
  origSave.apply(this, arguments);
  const i = F.ui.slot;
  if (token && i != null && i >= 0 && i < 3) queue(i, readLocal(i));
};

// last chance to get the newest world up; if it doesn't make it, localStorage
// still has it and the next visit migrates it
root.addEventListener('pagehide', flush);
root.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

/* ==================================================================== */
/* PULL — the account's worlds come down at boot                        */
/* ==================================================================== */
async function pull(){
  if (!token) return;
  let slots;
  try {
    const r = await fetch(API, { headers: { 'Authorization': 'Bearer ' + token } });
    if (!r.ok) return;
    slots = (await r.json()).slots;
  } catch (e){ return; }
  if (!Array.isArray(slots)) return;

  let changed = false;
  for (let i = 0; i < 3; i++){
    const remote = slots[i];
    const local  = readLocal(i);
    const rTs = remote ? (remote.updatedAt || 0) : -1;
    const lTs = local  ? (local.ts || 0)         : -1;

    if (remote && rTs > lTs){
      let save = null;
      try { save = JSON.parse(remote.save); } catch (e){ continue; }
      rawSet(SAVE_KEYS[i], JSON.stringify({ name: remote.name || 'Foundry', save, ts: rTs }));
      changed = true;
    } else if (local && lTs > rTs){
      push(i, local);              // built here (or offline) and never made it up
    }
  }
  if (changed) refreshTitle();
}

/* Only redraw the slot rows while the player is still standing on the title
   screen and isn't mid-way through naming a new foundry. */
function refreshTitle(){
  if (F.ui.started || F.ui.S) return;
  if (document.querySelector('#titleBtns .saveSlot.naming')) return;
  if (typeof F.ui.renderSlots === 'function') F.ui.renderSlots();
}

/* ---- account note under the slots ---- */
function showNote(){
  const inner = document.getElementById('titleInner');
  const btns  = document.getElementById('titleBtns');
  if (!inner || !btns || document.getElementById('rgNote')) return;
  const n = document.createElement('div');
  n.id = 'rgNote';
  n.style.cssText = 'margin-top:10px;font-size:.72rem;letter-spacing:.06em;' +
                    'text-transform:uppercase;opacity:.5;text-align:center;';
  n.textContent = me && me.username
    ? 'saved to ' + me.username + "'s account"
    : 'saved on this device only — log in to RoseGarden to carry your foundries with you';
  btns.insertAdjacentElement('afterend', n);
}

const origInit = F.ui.init;
F.ui.init = function(){
  origInit.apply(this, arguments);
  showNote();
  pull();
};

})(typeof window !== 'undefined' ? window : globalThis);
