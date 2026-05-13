'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   LABYRINTH RUN — game.js
   Raycasted 3-D maze game, Egyptian sandstone aesthetic
   ══════════════════════════════════════════════════════════════════════════ */

// ══════════════════════════════════════════════════════════════════════════
// SECTION 1 — Constants & Config
// ══════════════════════════════════════════════════════════════════════════

const CELL_SIZE             = 1;
const MOVE_SPEED            = 1;
const RUN_SPEED             = 1.8;
const PENALTY_SPEED         = 0.7;
const STAMINA_MAX           = 100;
const STAMINA_DRAIN         = 30;
const STAMINA_REGEN_NORMAL  = 30;
const STAMINA_REGEN_PENALTY = 10;
const BOB_AMP               = 8;   // head-bob amplitude in pixels at normal walk speed
const BOB_FREQ              = 8;   // bob cycles per world unit traveled
const BOB_SMOOTH            = 10;  // amplitude lerp speed (attack/release)
const BATTERY_MAX           = 150;
const BATTERY_DRAIN         = 1.5;
const BATTERY_PICKUP_AMOUNT = 50;
const FLASHLIGHT_RADIUS_FULL = 0.2;
const FLASHLIGHT_REACH       = 5;    // world units before walls fade to black (at full battery)
const SIDE_SHADE_MULT        = 0.85; // east/west faces are this much darker than north/south faces

// ── Flashlight deterioration rates (tune each axis independently) ──────────
const FLICKER_CHANCE_BASE  = 0.02;  // flicker probability/sec at 100% battery
const FLICKER_CHANCE_SCALE = 0.48;  // additional probability/sec added at 0% battery
const RADIUS_DRAIN_CURVE   = .55;   // exponent on battery% for beam radius (1=linear, 2=drops faster early)
const REACH_DRAIN_CURVE    = 0.45;   // exponent on battery% for distance reach (higher, drops faster. Always bottoms out at FLOOR)
const REACH_FLOOR          = 0.70;  // minimum reach at 0% battery (fraction of FLASHLIGHT_REACH)
const BRIGHTNESS_DRAIN     = 0.01; // how much darker the outer halo edge gets at 0% battery
const MOUSE_SENSITIVITY     = 0.00075;
const FOV                   = Math.PI * 90 / 180;
const TEXTURE_SIZE          = 128;
const CELL_SCALE            = 1; // each maze cell = 1 world unit (wide corridors)
const LAB_SIZES             = [11, 15, 19];
const NUM_BATTERIES_PER_LAB = [1, 1, 2];
const MAX_LABYRINTHS        = 3;

const BATTERY_DEAD_DELAY = 10; // seconds of darkness after battery dies before ripple
const HEALTH_MAX         = 100;
const TOMB_HALL_LEN      = 5;  // open hallway rows before the maze in tomb-robber lab 0

// ── Mode / difficulty configs ───────────────────────────────────────────────
const MODE_CONFIGS = {
    speed: {
        easy:     { labSizes: [11,15,19], batteries: [1,1,2], batMax: 150, batDrain: 1.5,  maxLabs: 3 },
        moderate: { labSizes: [15,19,23], batteries: [1,2,3], batMax: 150, batDrain: 1.75,  maxLabs: 3 },
        hard:     { labSizes: [19,23,27], batteries: [2,2,2], batMax: 125, batDrain: 1.75, maxLabs: 3 },
    },
    level: {
        easy:     { startSize: 9,  sizeInc: 3, batMax: 200, batDrain: 1.5,  startBats: 1, batInc: 1, batIncEvery: 1 },
        moderate: { startSize: 11, sizeInc: 4, batMax: 175, batDrain: 1.75, startBats: 1, batInc: 2, batIncEvery: 2 },
        hard:     { startSize: 10, sizeInc: 5, batMax: 150, batDrain: 1.75,  startBats: 2, batInc: 2, batIncEvery: 3 },
    },
    'tomb-robber': {
        easy:     { labSizes: [21, 51], batteries: [1, 5], batMax: 500, batDrain: 1.0, maxLabs: 2 },
        moderate: { labSizes: [21, 51], batteries: [3, 7], batMax: 500, batDrain: 1.0, maxLabs: 2 },
        hard:     { labSizes: [21, 51], batteries: [3, 7], batMax: 500, batDrain: 1.0, maxLabs: 2 },
    },
};

let selectedMode = 'speed';
let selectedDiff = 'easy';
let runConfig    = MODE_CONFIGS.speed.easy;

function applyRunConfig() {
    runConfig = MODE_CONFIGS[selectedMode][selectedDiff];
}

function getLabSize(labIndex) {
    if (selectedMode === 'speed' || selectedMode === 'tomb-robber') return runConfig.labSizes[labIndex];
    const s = runConfig.startSize + labIndex * runConfig.sizeInc;
    return s % 2 === 0 ? s + 1 : s;
}

function getLabBatteries(labIndex) {
    if (selectedMode === 'speed' || selectedMode === 'tomb-robber') return runConfig.batteries[labIndex];
    return runConfig.startBats + Math.floor(labIndex / runConfig.batIncEvery) * runConfig.batInc;
}

// Sounds
const sndFootsteps = [new Audio('footstep1.mp3'), new Audio('footstep2.mp3')];
sndFootsteps.forEach(s => s.volume = 1);
let footstepIndex = 0;
const BASE_STEP_INTERVAL = .6; // seconds between footsteps at MOVE_SPEED

const sndFlicker = new Audio('flashlightFlicker.mp3');
sndFlicker.volume  = .75;
sndFlicker.playbackRate = 1.25;
const DROP_VOL_RANGE = .25;
const DROP_VOL_FLOOR = .25;

const sndDrops = [new Audio('drop1.mp3'), new Audio('drop2.mp3'), new Audio('drop3.mp3')];

const sndSwoosh = new Audio('swoosh.mp3');
sndSwoosh.volume = 1;   
sndSwoosh.playbackRate = .85;
const SWOOSH_LEAD_TIME   = .1;   // seconds before ripple that the swoosh plays

const sndSpooks = ['Spook1.mp3','Spook2.mp3','Spook3.mp3','Spook4.mp3'].map(f => new Audio(f));
const SPOOK_INTERVAL_MIN = 15;
const SPOOK_INTERVAL_MAX = 30;

const sndSpookSong = new Audio('SpookSong.mp3');
sndSpookSong.loop   = true;
sndSpookSong.volume = 0;
const SPOOK_SONG_DELAY   = 5;  // seconds into run before song starts
const SPOOK_SONG_FADE_IN = 15;   // seconds to fade in
const SPOOK_SONG_MAX_VOL = 0.6;

const sndWhispers = new Audio('Whisphers.mp3');
sndWhispers.loop   = true;
sndWhispers.volume = 0;
const WHISPERS_MAX_VOL     = 0.75;
const WHISPERS_FADE_IN_DUR = 8.0; // seconds to fade Whispers in on battery death
const WHISPERS_FADE_OUT_DUR = 2.4; // seconds to fade Whispers out (matches ripple duration)
const DEATH_FADE_OUT_DUR   = 8; // seconds to fade gameplay audio out on battery death

// ══════════════════════════════════════════════════════════════════════════
// SECTION 1.5 — Audio
// ══════════════════════════════════════════════════════════════════════════
let footstepTimer    = 0;
let dropTimer        = 5 + Math.random() * 8;
let spookTimer       = SPOOK_INTERVAL_MIN + Math.random() * (SPOOK_INTERVAL_MAX - SPOOK_INTERVAL_MIN);
let spookSongStarted = false;

// ── Hotbar & flashlight ───────────────────────────────────────
let flashlightOn = true;
let selectedSlot  = 0;
const hotbar      = new Array(5).fill(null);
let markers       = []; // placed wall markers: { wx, wy }

/** Smoothly ramp an Audio element's volume to targetVol over duration seconds. */
function fadeAudio(audio, targetVol, duration, onComplete) {
    const startVol = audio.volume;
    const startTime = performance.now();
    (function tick() {
        const t = Math.min(1, (performance.now() - startTime) / (duration * 1000));
        audio.volume = startVol + (targetVol - startVol) * t;
        if (t < 1) requestAnimationFrame(tick);
        else if (onComplete) onComplete();
    })();
}

function updateAudio(dt, isMoving, speed) {
    // ── Footstep trigger ─────────────────────────────────────
    if (isMoving) {
        footstepTimer -= dt;
        if (footstepTimer <= 0) {
            const snd = sndFootsteps[footstepIndex % sndFootsteps.length];
            footstepIndex++;
            snd.currentTime = 0;
            snd.play().catch(() => {});
            footstepTimer = BASE_STEP_INTERVAL * (MOVE_SPEED / speed);
        }
    } else {
        footstepTimer = 0;
    }

    // Ambient drip
    dropTimer -= dt;
    if (dropTimer <= 0) {
        const sndDrop = sndDrops[Math.floor(Math.random() * sndDrops.length)];
        sndDrop.currentTime = 0;
        sndDrop.volume = (Math.random() * DROP_VOL_RANGE) + DROP_VOL_FLOOR;
        sndDrop.play().catch(() => {});
        dropTimer = 1 + Math.random() * 15;
    }

    // Spook stings
    spookTimer -= dt;
    if (spookTimer <= 0) {
        const snd = sndSpooks[Math.floor(Math.random() * sndSpooks.length)];
        snd.currentTime = 0;
        snd.play().catch(() => {});
        spookTimer = SPOOK_INTERVAL_MIN + Math.random() * (SPOOK_INTERVAL_MAX - SPOOK_INTERVAL_MIN);
    }

    // SpookSong: start after SPOOK_SONG_DELAY seconds into run, fade in
    const runElapsed = (performance.now() - runStart) / 1000;
    if (!spookSongStarted && runElapsed >= SPOOK_SONG_DELAY) {
        spookSongStarted = true;
        sndSpookSong.currentTime = 0;
        sndSpookSong.play().catch(() => {});
        fadeAudio(sndSpookSong, SPOOK_SONG_MAX_VOL, SPOOK_SONG_FADE_IN);
    }
}

function stopAllAudio() {
    sndFootsteps.forEach(s => { s.pause(); s.currentTime = 0; s.volume = 1; });
    sndFlicker.pause(); sndFlicker.currentTime = 0;
    sndDrops.forEach(s => { s.pause(); s.currentTime = 0; });
    sndSpooks.forEach(s => { s.pause(); s.currentTime = 0; s.volume = 1; });
    sndSpookSong.pause(); sndSpookSong.currentTime = 0; sndSpookSong.volume = 0;
    sndWhispers.pause(); sndWhispers.currentTime = 0; sndWhispers.volume = 0;
    footstepTimer    = 0;
    dropTimer        = 5 + Math.random() * 8;
    spookTimer       = SPOOK_INTERVAL_MIN + Math.random() * (SPOOK_INTERVAL_MAX - SPOOK_INTERVAL_MIN);
    spookSongStarted = false;
}

// ── Hotbar functions ──────────────────────────────────────────────────────

function initHotbar() {
    for (let i = 0; i < hotbar.length; i++) hotbar[i] = null;
    hotbar[0] = { type: 'flashlight' };
    if (selectedMode === 'tomb-robber') hotbar[1] = { type: 'marker', count: 5 };
    selectedSlot = 0;
    flashlightOn = true;
    markers      = [];
    updateHotbarUI();
}

function updateHotbarUI() {
    for (let i = 0; i < 5; i++) {
        const slotEl = document.getElementById('hslot' + i);
        const bodyEl = document.getElementById('slotBody' + i);
        const item   = hotbar[i];
        slotEl.classList.toggle('hotbarActive', i === selectedSlot);
        slotEl.classList.toggle('hotbarEmpty',  !item);
        slotEl.classList.toggle('slotOff', item && item.type === 'flashlight' && !flashlightOn);
        if (!item) { bodyEl.innerHTML = ''; continue; }
        if (item.type === 'flashlight') {
            bodyEl.innerHTML = `<span class="slotType">LIGHT</span><span class="slotStatus">${flashlightOn ? 'ON' : 'OFF'}</span>`;
        } else if (item.type === 'battery') {
            bodyEl.innerHTML = '<span class="slotType">BAT</span>';
        } else if (item.type === 'marker') {
            bodyEl.innerHTML = `<span class="slotType">FLAG</span><span class="slotStatus">${item.count}x</span>`;
        }
    }
}

function nextOpenSlot() {
    for (let i = 1; i < 5; i++) { if (!hotbar[i]) return i; }
    return -1;
}

function tryPickup(batteries) {
    for (const bat of batteries) {
        if (!bat.active) continue;
        const bx = (bat.x + 0.5) * CELL_SCALE, by = (bat.y + 0.5) * CELL_SCALE;
        if (Math.sqrt((bx - player.x) ** 2 + (by - player.y) ** 2) <= 1.2 * CELL_SCALE) {
            const slot = nextOpenSlot();
            if (slot < 0) return;
            bat.active = false;
            hotbar[slot] = { type: 'battery' };
            updateHotbarUI();
            return;
        }
    }
    for (let i = markers.length - 1; i >= 0; i--) {
        const m = markers[i];
        if (Math.sqrt((m.wx - player.x) ** 2 + (m.wy - player.y) ** 2) <= 1.0 * CELL_SCALE) {
            markers.splice(i, 1);
            const ms = hotbar.findIndex(s => s && s.type === 'marker');
            if (ms >= 0) { hotbar[ms].count++; }
            else { const slot = nextOpenSlot(); if (slot >= 0) hotbar[slot] = { type: 'marker', count: 1 }; }
            updateHotbarUI();
            return;
        }
    }
}

function useSelectedSlot() {
    const item = hotbar[selectedSlot];
    if (!item) return;
    if (item.type === 'flashlight') {
        flashlightOn = !flashlightOn;
        updateHotbarUI();
    } else if (item.type === 'battery') {
        player.battery = Math.min(runConfig.batMax, player.battery + BATTERY_PICKUP_AMOUNT);
        hotbar[selectedSlot] = null;
        updateHotbarUI();
    } else if (item.type === 'marker') {
        placeMarker(item);
    }
}

function castRayForward() {
    const gH = currentGrid.length, gW = currentGrid[0].length;
    let mapX = Math.floor(player.x / CELL_SCALE);
    let mapY = Math.floor(player.y / CELL_SCALE);
    const rx = player.dirX, ry = player.dirY;
    const ddx = Math.abs(rx) < 1e-10 ? 1e30 : Math.abs(CELL_SCALE / rx);
    const ddy = Math.abs(ry) < 1e-10 ? 1e30 : Math.abs(CELL_SCALE / ry);
    let sx, sy, sdx, sdy, side;
    if (rx < 0) { sx = -1; sdx = (player.x - mapX * CELL_SCALE) * Math.abs(1 / rx); }
    else        { sx =  1; sdx = ((mapX + 1) * CELL_SCALE - player.x) * Math.abs(1 / rx); }
    if (ry < 0) { sy = -1; sdy = (player.y - mapY * CELL_SCALE) * Math.abs(1 / ry); }
    else        { sy =  1; sdy = ((mapY + 1) * CELL_SCALE - player.y) * Math.abs(1 / ry); }
    for (let i = 0; i < 32; i++) {
        if (sdx < sdy) { sdx += ddx; mapX += sx; side = 0; }
        else           { sdy += ddy; mapY += sy; side = 1; }
        if (mapX < 0 || mapX >= gW || mapY < 0 || mapY >= gH) return null;
        if (currentGrid[mapY][mapX] !== 0) {
            const perp = side === 0 ? (sdx - ddx) : (sdy - ddy);
            const INSET = 0.08 * CELL_SCALE;
            const wx = side === 0
                ? (sx > 0 ? mapX : mapX + 1) * CELL_SCALE - sx * INSET
                : player.x + perp * rx;
            const wy = side === 1
                ? (sy > 0 ? mapY : mapY + 1) * CELL_SCALE - sy * INSET
                : player.y + perp * ry;
            return { wx, wy };
        }
    }
    return null;
}

function placeMarker(item) {
    if (item.count <= 0) return;
    const hit = castRayForward();
    if (!hit) return;
    item.count--;
    if (item.count <= 0) hotbar[selectedSlot] = null;
    markers.push({ wx: hit.wx, wy: hit.wy });
    updateHotbarUI();
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 2 — Texture Generation
// ══════════════════════════════════════════════════════════════════════════

/** Flat sandstone texture with carved hieroglyphs — no brick grid. */
function generateSandstoneTexture() {
    const size = TEXTURE_SIZE; // 128
    const img  = new ImageData(size, size);
    const d    = img.data;

    const BASE_R = 200, BASE_G = 165, BASE_B = 90;

    // Hieroglyph bitmaps (14×14, 1 = carved stroke)
    const HIEROGLYPHS = [
        // Eye of Ra
        [
            [0,0,1,1,1,1,1,1,1,1,0,0,0,0],
            [0,1,0,0,0,0,0,0,0,0,1,0,0,0],
            [1,0,0,0,1,1,1,1,0,0,0,1,0,0],
            [1,0,0,1,0,0,0,0,1,0,0,1,0,0],
            [1,0,0,1,0,0,0,0,1,0,0,1,0,0],
            [1,0,0,0,1,1,1,1,0,0,0,1,0,0],
            [0,1,0,0,0,0,0,0,0,0,1,0,0,0],
            [0,0,1,1,1,1,1,1,1,1,0,0,0,0],
            [0,0,0,0,1,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,1,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,1,1,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        ],
        // Ankh
        [
            [0,0,0,1,1,1,1,0,0,0,0,0,0,0],
            [0,0,1,0,0,0,0,1,0,0,0,0,0,0],
            [0,1,0,0,0,0,0,0,1,0,0,0,0,0],
            [0,1,0,0,0,0,0,0,1,0,0,0,0,0],
            [0,0,1,0,0,0,0,1,0,0,0,0,0,0],
            [0,0,0,1,1,1,1,0,0,0,0,0,0,0],
            [1,1,1,1,1,1,1,1,1,1,1,0,0,0],
            [0,0,0,0,1,1,0,0,0,0,0,0,0,0],
            [0,0,0,0,1,1,0,0,0,0,0,0,0,0],
            [0,0,0,0,1,1,0,0,0,0,0,0,0,0],
            [0,0,0,0,1,1,0,0,0,0,0,0,0,0],
            [0,0,0,0,1,1,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        ],
        //Bird
        [
            [0,0,0,0,0,0,0,1,1,1,0,0,0,0],
            [0,0,0,0,0,0,1,0,0,0,1,1,1,0],
            [0,0,0,0,0,0,1,0,0,0,1,1,0,0],
            [0,0,0,0,0,0,0,1,1,1,0,0,0,0],
            [0,0,0,1,1,1,1,1,1,0,0,0,0,0],
            [0,0,1,0,0,0,0,0,0,1,0,0,0,0],
            [1,1,0,0,0,0,0,0,0,1,0,0,0,0],
            [1,0,0,0,0,0,0,0,1,0,0,0,0,0],
            [0,1,1,0,0,0,0,0,1,0,0,0,0,0],
            [0,0,0,1,1,1,1,1,0,0,0,0,0,0],
            [0,0,0,0,0,1,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,1,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,1,1,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        ],
        //Beetle Scarab
        [
            [0,0,1,0,0,0,0,0,0,0,1,0,0,0],
            [0,0,1,1,0,1,1,1,0,1,1,0,0,0],
            [1,0,1,0,1,0,0,0,1,0,1,0,1,0],
            [1,0,0,1,1,0,0,0,1,1,0,0,1,0],
            [1,0,1,0,0,0,0,0,0,0,1,0,1,0],
            [0,1,1,0,0,0,0,0,0,0,1,1,0,0],
            [0,0,1,0,0,0,0,0,0,0,1,0,0,0],
            [0,1,1,0,0,0,0,0,0,0,1,1,0,0],
            [1,0,1,0,0,0,0,0,0,0,1,0,1,0],
            [1,0,1,0,0,0,0,0,0,0,1,0,1,0],
            [0,0,0,1,0,0,0,0,0,1,0,0,0,0],
            [0,1,1,0,1,1,1,1,1,0,1,1,0,0],
            [1,0,0,0,0,0,0,0,0,0,0,0,1,0],
            [1,0,0,0,0,0,0,0,0,0,0,0,1,0]
        ],
        //Pharoah
        [
            [0,0,0,0,1,1,1,1,1,1,0,0,0,0],
            [0,0,0,1,1,1,1,1,1,1,1,0,0,0],
            [0,0,1,1,1,0,0,0,0,1,1,1,0,0],
            [0,1,1,1,0,1,1,1,1,0,1,1,1,0],
            [0,1,1,0,1,1,1,1,1,1,0,1,1,0],
            [1,1,1,0,1,0,1,1,0,1,0,1,1,1],
            [1,1,1,0,1,1,1,1,1,1,0,1,1,1],
            [1,1,1,0,0,1,1,1,1,0,0,1,1,1],
            [0,1,1,1,0,0,1,1,0,0,1,1,1,0],
            [0,1,1,1,1,0,0,0,0,1,1,1,1,0],
            [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
            [0,0,0,1,1,0,0,0,0,1,1,0,0,0],
            [0,0,0,1,1,0,0,0,0,1,1,0,0,0],
            [0,0,1,1,1,0,0,0,0,1,1,1,0,0]
        ],
        //sphinx
        [
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,1,1,0,0,0,0,0,0,0,0,0,0,0],
            [0,1,0,0,0,0,0,0,0,1,1,1,1,0],
            [1,0,0,0,0,0,0,0,1,0,0,0,0,1],
            [1,0,0,1,1,1,1,1,1,0,0,0,0,1],
            [0,1,1,0,0,0,0,0,1,0,0,0,1,0],
            [1,0,0,0,1,0,0,0,1,1,0,1,1,0],
            [1,0,0,0,0,1,1,1,0,0,0,0,0,1],
            [0,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        ],
        //wolfman
        [
            [0,0,1,0,0,1,0,0,0,0,0,0,0,0],
            [0,0,1,1,0,1,1,0,0,0,0,0,0,0],
            [0,0,1,1,0,1,1,0,0,0,0,0,0,0],
            [0,0,1,1,1,1,1,0,0,0,0,0,0,0],
            [0,1,0,0,0,0,1,1,1,0,0,0,0,0],
            [1,0,1,1,1,1,0,0,0,1,1,1,0,0],
            [1,0,1,1,0,0,0,1,1,1,1,0,0,0],
            [0,1,0,0,0,0,1,0,0,0,0,1,1,1],
            [0,0,1,0,0,1,0,0,0,1,1,1,1,1],
            [0,0,1,0,0,1,0,0,0,0,0,0,1,0],
            [1,1,1,0,0,1,1,1,1,1,0,0,1,0],
            [1,0,0,0,0,0,0,0,0,0,1,0,1,0],
            [1,0,0,0,0,0,1,1,0,0,1,0,1,0],
            [1,1,1,1,1,1,1,0,1,0,0,1,1,0]
        ]
    ];

    // Random horizontal placement, all vertically centered.
    // Shuffles glyph pool so each placement gets a distinct glyph type.
    // Adding more entries to HIEROGLYPHS above automatically increases the pool.
    const centY    = Math.floor((size - 14) / 2);
    const numGlyphs = HIEROGLYPHS.length;
    const MIN_GAP  = 22; // min pixels between glyph left edges
    const glyphPool = HIEROGLYPHS.map((_, i) => i).sort(() => Math.random() - 0.5);
    const PLACEMENTS = [];
    let attempts = 0;
    while (PLACEMENTS.length < numGlyphs && attempts < 300) {
        attempts++;
        const x = Math.floor(Math.random() * (size - 14));
        if (PLACEMENTS.every(p => Math.abs(p.x - x) >= MIN_GAP)) {
            PLACEMENTS.push({ g: glyphPool[PLACEMENTS.length % glyphPool.length], x, y: centY });
        }
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;

            // Flat sandstone with two-frequency noise
            const noise = (Math.random() - 0.5) * 28 + (Math.random() - 0.5) * 10;
            let r = Math.min(255, Math.max(0, BASE_R + noise));
            let g = Math.min(255, Math.max(0, BASE_G + noise * 0.82));
            let b = Math.min(255, Math.max(0, BASE_B + noise * 0.52));

            // Carved hieroglyphs
            for (const p of PLACEMENTS) {
                const px = x - p.x, py = y - p.y;
                if (px >= 0 && px < 14 && py >= 0 && py < 14 && HIEROGLYPHS[p.g][py][px]) {
                    r = Math.floor(r * 0.22);
                    g = Math.floor(g * 0.22);
                    b = Math.floor(b * 0.22);
                    break;
                }
            }

            d[idx] = r; d[idx+1] = g; d[idx+2] = b; d[idx+3] = 255;
        }
    }
    return img;
}

/**
 * Generate a dark oak door texture (64×64 ImageData).
 * Dark brown with vertical wood grain, horizontal panel lines, and metal border.
 */
function generateDoorTexture() {
    const size = TEXTURE_SIZE;
    const img  = new ImageData(size, size);
    const d    = img.data;

    // Precompute grain lines per y-row → horizontal planks (rotated 90°)
    const grainLines = [];
    for (let y = 0; y < size; y++) {
        const v = Math.sin(y * 0.47 + Math.random() * 0.5) * 12 + (Math.random() - 0.5) * 6;
        grainLines.push(v);
    }

    const BORDER = 3; // metal border width

    for (let y = 0; y < size; y++) {
        const isBorderY = y < BORDER || y >= size - BORDER;

        for (let x = 0; x < size; x++) {
            const panelLine = (x === Math.floor(size / 3) || x === Math.floor(2 * size / 3));
            const isBorderX = x < BORDER || x >= size - BORDER;
            const isBorder  = isBorderX || isBorderY;
            const idx = (y * size + x) * 4;

            if (isBorder) {
                // Dark iron border
                d[idx] = 52; d[idx+1] = 44; d[idx+2] = 36; d[idx+3] = 255;
            } else if (panelLine) {
                // Vertical panel groove
                d[idx] = 72; d[idx+1] = 44; d[idx+2] = 18; d[idx+3] = 255;
            } else {
                // Wood grain — horizontal planks, grain varies by row
                const grain = grainLines[y];
                const noise = (Math.random() - 0.5) * 14;
                const r = Math.min(255, Math.max(0, 110 + grain * 0.9 + noise));
                const g = Math.min(255, Math.max(0,  68 + grain * 0.55 + noise * 0.7));
                const b = Math.min(255, Math.max(0,  28 + grain * 0.2  + noise * 0.35));
                d[idx] = r; d[idx+1] = g; d[idx+2] = b; d[idx+3] = 255;
            }
        }
    }
    return img;
}

/** Dark polished sandstone floor — subtle tile grid, warm dark tones */
function generateFloorTexture() {
    const size = TEXTURE_SIZE;
    const img  = new ImageData(size, size);
    const d    = img.data;
    const BASE_R = 72, BASE_G = 54, BASE_B = 33;
    const TILE   = 32;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const isTile = (x % TILE === 0 || y % TILE === 0);
            const noise  = (Math.random() - 0.5) * 14;
            const r = Math.min(255, Math.max(0, BASE_R + noise - (isTile ? 16 : 0)));
            const g = Math.min(255, Math.max(0, BASE_G + noise * 0.75 - (isTile ? 12 : 0)));
            const b = Math.min(255, Math.max(0, BASE_B + noise * 0.5  - (isTile ? 7  : 0)));
            const idx = (y * size + x) * 4;
            d[idx] = r; d[idx+1] = g; d[idx+2] = b; d[idx+3] = 255;
        }
    }
    return img;
}

/** Near-black stone ceiling — very subtle texture */
function generateCeilingTexture() {
    const size = TEXTURE_SIZE;
    const img  = new ImageData(size, size);
    const d    = img.data;
    const BASE_R = 28, BASE_G = 20, BASE_B = 12;
    const TILE   = 48;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const isTile = (x % TILE === 0 || y % TILE === 0);
            const noise  = (Math.random() - 0.5) * 8;
            const r = Math.min(255, Math.max(0, BASE_R + noise - (isTile ? 8 : 0)));
            const g = Math.min(255, Math.max(0, BASE_G + noise * 0.75 - (isTile ? 6 : 0)));
            const b = Math.min(255, Math.max(0, BASE_B + noise * 0.5  - (isTile ? 4 : 0)));
            const idx = (y * size + x) * 4;
            d[idx] = r; d[idx+1] = g; d[idx+2] = b; d[idx+3] = 255;
        }
    }
    return img;
}

// Generate textures once at startup
const sandstoneImg = generateSandstoneTexture();
const doorImg      = generateDoorTexture();
const floorImg     = generateFloorTexture();
const ceilingImg   = generateCeilingTexture();

/** Sample a texture ImageData at (u, v) ∈ [0,1)×[0,1) → { r, g, b } */
function sampleTexture(imgData, u, v) {
    const tx = Math.floor(u * TEXTURE_SIZE) & (TEXTURE_SIZE - 1);
    const ty = Math.floor(v * TEXTURE_SIZE) & (TEXTURE_SIZE - 1);
    const i  = (ty * TEXTURE_SIZE + tx) * 4;
    return { r: imgData.data[i], g: imgData.data[i+1], b: imgData.data[i+2] };
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 3 — Maze Generation
// ══════════════════════════════════════════════════════════════════════════

/**
 * Generate a perfect maze using recursive backtracking (DFS).
 * @param {number} w  Must be odd
 * @param {number} h  Must be odd
 * @returns {number[][]}  2D grid: 0=open, 1=wall, 2=door
 */
function generateMaze(w, h) {
    // Initialize all cells as walls
    const grid = [];
    for (let y = 0; y < h; y++) {
        grid.push(new Array(w).fill(1));
    }

    const dirs = [
        [0, -2],   // up
        [0,  2],   // down
        [-2, 0],   // left
        [2,  0]    // right
    ];

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function carve(cx, cy) {
        grid[cy][cx] = 0;
        const order = shuffle([...dirs]);
        for (const [dx, dy] of order) {
            const nx = cx + dx, ny = cy + dy;
            if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1 && grid[ny][nx] === 1) {
                // Carve the wall between current and next
                grid[cy + dy / 2][cx + dx / 2] = 0;
                carve(nx, ny);
            }
        }
    }

    // Start carving from (1,1) — always open cells at odd coordinates
    carve(1, 1);

    return grid;
}

/**
 * BFS from (startX, startY) on open cells.
 * Returns the cell {x,y} furthest from start (for door placement).
 */
function bfsFurthest(grid, startX, startY) {
    const h = grid.length, w = grid[0].length;
    const visited = Array.from({ length: h }, () => new Array(w).fill(false));
    const queue = [{ x: startX, y: startY, dist: 0 }];
    visited[startY][startX] = true;
    let furthest = { x: startX, y: startY, dist: 0 };

    const N = [[0,-1],[0,1],[-1,0],[1,0]];
    while (queue.length > 0) {
        const cur = queue.shift();
        if (cur.dist > furthest.dist) furthest = cur;
        for (const [dx, dy] of N) {
            const nx = cur.x + dx, ny = cur.y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            if (visited[ny][nx] || grid[ny][nx] !== 0) continue;
            visited[ny][nx] = true;
            queue.push({ x: nx, y: ny, dist: cur.dist + 1 });
        }
    }
    return furthest;
}

/**
 * Build a complete level: maze + door + batteries.
 * @param {number} labIndex  0-based labyrinth index
 * @returns {{ grid, batteries, doorX, doorY }}
 */
function buildLevel(labIndex) {
    if (selectedMode === 'tomb-robber' && labIndex === 0) {
        return buildTombRobberEntry(getLabSize(0));
    }

    const size = getLabSize(labIndex);
    const grid = generateMaze(size, size);

    // Door at cell furthest from start (1,1)
    const door = bfsFurthest(grid, 1, 1);
    // Make sure door isn't right at start
    if (door.x === 1 && door.y === 1) {
        const fallbacks = [
            { x: size - 2, y: size - 2 },
            { x: size - 2, y: 1 },
            { x: 1, y: size - 2 }
        ];
        for (const f of fallbacks) {
            if (grid[f.y][f.x] === 0) { door.x = f.x; door.y = f.y; break; }
        }
    }
    grid[door.y][door.x] = 2; // door

    // Scatter batteries
    const numBat = getLabBatteries(labIndex);
    const batteries = [];
    const openCells = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (grid[y][x] === 0 && !(x === 1 && y === 1)) {
                openCells.push({ x, y });
            }
        }
    }
    openCells.sort(() => Math.random() - 0.5);
    let placed = 0;
    for (const cell of openCells) {
        const dist = Math.abs(cell.x - 1) + Math.abs(cell.y - 1);
        if (dist >= 4 && placed < numBat) {
            batteries.push({ x: cell.x, y: cell.y, active: true });
            placed++;
        }
    }
    if (placed < numBat) {
        for (const cell of openCells) {
            if (placed >= numBat) break;
            if (!batteries.find(b => b.x === cell.x && b.y === cell.y)) {
                batteries.push({ x: cell.x, y: cell.y, active: true });
                placed++;
            }
        }
    }

    return { grid, batteries, doorX: door.x, doorY: door.y, ladderX: -1, ladderY: -1 };
}

// Tomb Robber lab 0: hallway entrance + maze with ladder exit
function buildTombRobberEntry(mazeSize) {
    const maze = generateMaze(mazeSize, mazeSize);

    // Carve a 3-wide opening through the maze's north border so the hallway connects in
    maze[0][1] = 0; maze[0][2] = 0; maze[0][3] = 0;
    // Widen the junction just inside the border
    maze[1][2] = 0; maze[1][3] = 0;

    // Build full grid: [entrance row] + [TOMB_HALL_LEN hallway rows] + [maze rows]
    const fullGrid = [];

    // Row 0 — entrance wall (cell type 4 = warm sunlight)
    const entRow = new Array(mazeSize).fill(1);
    entRow[1] = 4; entRow[2] = 4; entRow[3] = 4;
    fullGrid.push(entRow);

    // Rows 1–TOMB_HALL_LEN — open hallway (3 cells wide)
    for (let r = 0; r < TOMB_HALL_LEN; r++) {
        const row = new Array(mazeSize).fill(1);
        row[1] = 0; row[2] = 0; row[3] = 0;
        fullGrid.push(row);
    }

    // Append maze
    for (const mazeRow of maze) fullGrid.push([...mazeRow]);

    // Ladder at cell furthest from player spawn (col 2, row 1 in fullGrid)
    const ladder = bfsFurthest(fullGrid, 2, 1);
    const ladderX = ladder.x, ladderY = ladder.y;

    // Scatter batteries across the full grid (hallway + maze)
    const numBat = getLabBatteries(0);
    const batteries = [];
    const openCells = [];
    for (let y = 0; y < fullGrid.length; y++) {
        for (let x = 0; x < fullGrid[y].length; x++) {
            if (fullGrid[y][x] === 0 && !(x === 2 && y <= 2) && !(x === ladderX && y === ladderY)) {
                openCells.push({ x, y });
            }
        }
    }
    openCells.sort(() => Math.random() - 0.5);
    let placed = 0;
    for (const cell of openCells) {
        const dist = Math.abs(cell.x - 2) + Math.abs(cell.y - 1);
        if (dist >= 6 && placed < numBat) {
            batteries.push({ x: cell.x, y: cell.y, active: true });
            placed++;
        }
    }
    if (placed < numBat) {
        for (const cell of openCells) {
            if (placed >= numBat) break;
            if (!batteries.find(b => b.x === cell.x && b.y === cell.y))
                batteries.push({ x: cell.x, y: cell.y, active: true }), placed++;
        }
    }

    return { grid: fullGrid, batteries, doorX: -1, doorY: -1, ladderX, ladderY };
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 4 — Raycasting Engine
// ══════════════════════════════════════════════════════════════════════════

// Canvas & 2D context
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

let imgBuffer  = null; // ImageData for pixel-level rendering
let pixelData  = null; // Uint8ClampedArray view

function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    imgBuffer = ctx.createImageData(canvas.width, canvas.height);
    pixelData = imgBuffer.data;
}

window.addEventListener('resize', () => {
    resizeCanvas();
});

/** Set a pixel in the pixel buffer */
function setPixel(x, y, r, g, b) {
    const idx = (y * canvas.width + x) * 4;
    pixelData[idx]     = r;
    pixelData[idx + 1] = g;
    pixelData[idx + 2] = b;
    pixelData[idx + 3] = 255;
}

/** Render one frame of the raycasted scene */
function renderScene(grid, player, batteries) {
    if (!imgBuffer) return;

    const W = canvas.width;
    const H = canvas.height;
    const halfH  = H >> 1;
    const horizon = Math.round(halfH + pitch + bobOffset); // shifted by vertical look + head bob

    // ── Fill ceiling & floor with texture ───────────────────
    {
        const rdx0 = player.dirX - player.planeX;
        const rdy0 = player.dirY - player.planeY;
        const rdx1 = player.dirX + player.planeX;
        const rdy1 = player.dirY + player.planeY;
        for (let y = 0; y < H; y++) {
            const isFloor = y > horizon;
            const p = isFloor ? (y - horizon) : (horizon - y);
            if (p === 0) continue;
            const rowDist = (0.5 * H) / p;
            const shade = Math.max(0, 1 - rowDist / (effectiveReach * 1.8)) * flickerMult;
            if (shade <= 0.005) {
                for (let x = 0; x < W; x++) setPixel(x, y, 0, 0, 0);
                continue;
            }
            const fsX = rowDist * (rdx1 - rdx0) / W;
            const fsY = rowDist * (rdy1 - rdy0) / W;
            let fx = player.x / CELL_SCALE + rowDist * rdx0;
            let fy = player.y / CELL_SCALE + rowDist * rdy0;
            const tex = isFloor ? floorImg : ceilingImg;
            for (let x = 0; x < W; x++) {
                const tx = Math.floor(TEXTURE_SIZE * (fx - Math.floor(fx))) & (TEXTURE_SIZE - 1);
                const ty = Math.floor(TEXTURE_SIZE * (fy - Math.floor(fy))) & (TEXTURE_SIZE - 1);
                fx += fsX; fy += fsY;
                const ti = (ty * TEXTURE_SIZE + tx) * 4;
                setPixel(x, y,
                    Math.floor(tex.data[ti]     * shade),
                    Math.floor(tex.data[ti + 1] * shade),
                    Math.floor(tex.data[ti + 2] * shade)
                );
            }
        }
    }

    // ── Raycasting columns ───────────────────────────────────
    const zBuffer = new Float64Array(W); // store perpendicular distance per column

    for (let screenX = 0; screenX < W; screenX++) {
        // Camera space x in [-1, 1]
        const camX = (2 * screenX / W) - 1;

        const rayDirX = player.dirX + player.planeX * camX;
        const rayDirY = player.dirY + player.planeY * camX;

        let mapX = Math.floor(player.x / CELL_SCALE);
        let mapY = Math.floor(player.y / CELL_SCALE);

        // Length of ray from one x/y-side to next x/y-side (scaled by CELL_SCALE)
        const deltaDistX = Math.abs(rayDirX) < 1e-10 ? 1e30 : Math.abs(CELL_SCALE / rayDirX);
        const deltaDistY = Math.abs(rayDirY) < 1e-10 ? 1e30 : Math.abs(CELL_SCALE / rayDirY);

        let stepX, stepY;
        let sideDistX, sideDistY;

        if (rayDirX < 0) {
            stepX = -1;
            sideDistX = (player.x - mapX * CELL_SCALE) * Math.abs(1 / rayDirX);
        } else {
            stepX = 1;
            sideDistX = ((mapX + 1.0) * CELL_SCALE - player.x) * Math.abs(1 / rayDirX);
        }
        if (rayDirY < 0) {
            stepY = -1;
            sideDistY = (player.y - mapY * CELL_SCALE) * Math.abs(1 / rayDirY);
        } else {
            stepY = 1;
            sideDistY = ((mapY + 1.0) * CELL_SCALE - player.y) * Math.abs(1 / rayDirY);
        }

        // DDA
        let hit = 0, side = 0, cellVal = 0;
        const gridH = grid.length, gridW = grid[0].length;
        for (let i = 0; i < 64; i++) {
            if (sideDistX < sideDistY) {
                sideDistX += deltaDistX;
                mapX      += stepX;
                side       = 0;
            } else {
                sideDistY += deltaDistY;
                mapY      += stepY;
                side       = 1;
            }
            if (mapX < 0 || mapX >= gridW || mapY < 0 || mapY >= gridH) { hit = 1; cellVal = 1; break; }
            if (grid[mapY][mapX] !== 0) { hit = 1; cellVal = grid[mapY][mapX]; break; }
        }

        // Perpendicular wall distance
        const perpWallDist = side === 0
            ? (sideDistX - deltaDistX)
            : (sideDistY - deltaDistY);

        zBuffer[screenX] = perpWallDist;

        // Wall height on screen
        const lineH  = Math.min(H, Math.floor(H / Math.max(0.001, perpWallDist)));
        const drawStart = Math.max(0, horizon - (lineH >> 1));
        const drawEnd   = Math.min(H - 1, horizon + (lineH >> 1));

        // Where on the wall the ray hits (normalize to [0,1) within cell)
        let wallX;
        if (side === 0) wallX = player.y + perpWallDist * rayDirY;
        else            wallX = player.x + perpWallDist * rayDirX;
        wallX /= CELL_SCALE;
        wallX -= Math.floor(wallX);

        // Choose texture
        const texImg = cellVal === 2 ? doorImg : sandstoneImg;

        // Texture X
        let texX = Math.floor(wallX * TEXTURE_SIZE);
        if (side === 0 && rayDirX > 0) texX = TEXTURE_SIZE - texX - 1;
        if (side === 1 && rayDirY < 0) texX = TEXTURE_SIZE - texX - 1;
        texX = texX & (TEXTURE_SIZE - 1);

        // Distance darkening factor
        const distFactor = Math.max(0, 1 - perpWallDist / effectiveReach);
        // Side darkening: y-side walls are 30% darker
        const sideMult = side === 1 ? SIDE_SHADE_MULT : 1.0;

        const isDoor = cellVal === 2;
        // Doors are less dark than walls so they stand out
        const darkMult = isDoor ? 0.70 : 0.25;

        // Door opening covers middle 65% of cell width; left/right 17.5% = stone frame
        const DOOR_GAP_FRAC = 0.175;

        // Draw wall column pixel by pixel
        const step = TEXTURE_SIZE / lineH;
        let texPos = (drawStart - horizon + (lineH >> 1)) * step;

        for (let y = drawStart; y <= drawEnd; y++) {
            const texY = Math.floor(texPos) & (TEXTURE_SIZE - 1);
            texPos += step;

            // For door cells: left/right fringe uses sandstone so door reads as tall & narrow
            let useTexImg = texImg;
            let isFringe = false;
            if (isDoor) {
                if (wallX < DOOR_GAP_FRAC || wallX > 1 - DOOR_GAP_FRAC) {
                    useTexImg = sandstoneImg;
                    isFringe = true;
                }
            }

            let r, g, b;
            {
                const i = (texY * TEXTURE_SIZE + texX) * 4;
                r = useTexImg.data[i];
                g = useTexImg.data[i + 1];
                b = useTexImg.data[i + 2];
            }

            if (cellVal === 4) {
                // Entrance wall — blinding warm sunlight flooding from outside
                const eb = Math.min(1.0, distFactor * 5.5 + 0.45) * sideMult;
                r = Math.min(255, Math.floor(255 * eb));
                g = Math.min(255, Math.floor(195 * eb));
                b = Math.min(255, Math.floor(70  * eb));
            } else {
                // Global darkness + distance + side darkening
                const pixDark = (isDoor && !isFringe) ? darkMult : 0.25;
                const bright = distFactor * sideMult * pixDark;
                r = Math.floor(r * bright);
                g = Math.floor(g * bright);
                b = Math.floor(b * bright);
                // Orange-amber tint on all surfaces
                g = Math.floor(g * 0.85);
                b = Math.floor(b * 0.65);
                // Door glow only on the wood portion, not the stone frame
                if (isDoor && !isFringe) {
                    const glowStrength = 0.18 * distFactor;
                    r = Math.min(255, r + Math.floor(200 * glowStrength));
                    g = Math.min(255, g + Math.floor(110 * glowStrength));
                    b = Math.min(255, b + Math.floor(30  * glowStrength));
                }
            }

            setPixel(screenX, y, r, g, b);
        }
    }

    // ── Write pixel buffer to canvas ─────────────────────────
    ctx.putImageData(imgBuffer, 0, 0);

    // ── Near-wall vignette (suppress phantom-branch artifact) ─
    {
        const cx = Math.floor(player.x / CELL_SCALE);
        const cy = Math.floor(player.y / CELL_SCALE);
        const dxMin = Math.min(player.x - cx * CELL_SCALE, (cx + 1) * CELL_SCALE - player.x);
        const dyMin = Math.min(player.y - cy * CELL_SCALE, (cy + 1) * CELL_SCALE - player.y);
        const nearDist = Math.min(dxMin, dyMin);
        const VIGNETTE_START = 0.31;
        if (nearDist < VIGNETTE_START) {
            const strength = ((1 - nearDist / VIGNETTE_START) ** 1.4) * 0.72;
            const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, Math.max(W, H) * 0.72);
            grd.addColorStop(0, 'rgba(0,0,0,0)');
            grd.addColorStop(1, `rgba(0,0,0,${strength.toFixed(3)})`);
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, W, H);
        }
    }

    // ── Battery glow sprites ─────────────────────────────────
    for (const bat of batteries) {
        if (!bat.active) continue;
        // World position of battery center
        const bwx = (bat.x + 0.5) * CELL_SCALE;
        const bwy = (bat.y + 0.5) * CELL_SCALE;
        // Transform to camera space
        const dx = bwx - player.x;
        const dy = bwy - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 6 * CELL_SCALE) continue;

        // Camera transform
        const invDet = 1 / (player.planeX * player.dirY - player.dirX * player.planeY);
        const transformX = invDet * (player.dirY * dx - player.dirX * dy);
        const transformY = invDet * (-player.planeY * dx + player.planeX * dy);
        if (transformY <= 0.1) continue; // behind camera

        // Screen X of battery
        const spriteScreenX = Math.floor((W / 2) * (1 + transformX / transformY));
        const screenCol = Math.min(Math.max(0, spriteScreenX), W - 1);

        // Occlusion: check z buffer
        if (zBuffer[screenCol] < transformY) continue;

        const spriteH = Math.abs(Math.floor(H / transformY));
        const drawY = Math.floor(horizon - spriteH / 2);

        // Size based on distance so icon stays ~10px far away, grows as you approach
        const iconH = Math.max(10, Math.min(60, 18 / dist));
        const glowR = iconH * 0.9;
        const alpha = Math.min(0.65, 1 / (dist * 0.4));
        const cy2   = drawY + spriteH / 2;
        const grd = ctx.createRadialGradient(spriteScreenX, cy2, 0, spriteScreenX, cy2, glowR);
        grd.addColorStop(0,   `rgba(80, 160, 255, ${alpha})`);
        grd.addColorStop(0.5, `rgba(40, 100, 220, ${alpha * 0.4})`);
        grd.addColorStop(1,   'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(spriteScreenX, cy2, glowR * 1.6, glowR, 0, 0, Math.PI * 2);
        ctx.fill();

        // Battery icon
        ctx.save();
        const iAlpha = Math.min(0.95, alpha * 2.5);
        const bh  = iconH;
        const bw  = bh * 0.52;
        const lw  = Math.max(0.8, bw * 0.09);
        const bx  = spriteScreenX;
        const by  = cy2;

        // Nub (top terminal)
        ctx.fillStyle = `rgba(140, 210, 255, ${iAlpha})`;
        ctx.fillRect(bx - bw * 0.18, by - bh / 2 - lw * 2.5, bw * 0.36, lw * 2.5);

        // Body outline
        ctx.strokeStyle = `rgba(140, 210, 255, ${iAlpha})`;
        ctx.lineWidth   = lw;
        ctx.strokeRect(bx - bw / 2, by - bh / 2, bw, bh);

        // Fill (65% charged)
        const fillH = (bh - lw * 2) * 0.65;
        ctx.fillStyle = `rgba(80, 160, 255, ${iAlpha * 0.85})`;
        ctx.fillRect(bx - bw / 2 + lw, by + bh / 2 - lw - fillH, bw - lw * 2, fillH);

        ctx.restore();
    }

    // ── Marker sprites (red flags on walls) ──────────────────
    for (const m of markers) {
        const dx = m.wx - player.x;
        const dy = m.wy - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 7 * CELL_SCALE) continue;

        const invDet = 1 / (player.planeX * player.dirY - player.dirX * player.planeY);
        const transformX = invDet * (player.dirY * dx - player.dirX * dy);
        const transformY = invDet * (-player.planeY * dx + player.planeX * dy);
        if (transformY <= 0.1) continue;

        const spriteScreenX = Math.floor((W / 2) * (1 + transformX / transformY));
        const screenCol = Math.min(Math.max(0, spriteScreenX), W - 1);
        if (zBuffer[screenCol] < transformY) continue;

        const flagH = Math.max(3, Math.min(14, 6 / transformY));
        const flagW = flagH * 1.6;
        const distAlpha = Math.max(0, 1 - dist / (effectiveReach * 1.4));
        const alpha = Math.min(0.55, distAlpha * 0.7);
        if (alpha < 0.04) continue;

        // Flat dull-red triangle only — no pole, looks taped to the wall
        ctx.save();
        ctx.fillStyle = `rgba(148, 55, 42, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(spriteScreenX - flagW * 0.45, horizon - flagH * 0.55);
        ctx.lineTo(spriteScreenX + flagW * 0.55, horizon);
        ctx.lineTo(spriteScreenX - flagW * 0.45, horizon + flagH * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // ── Ladder texture (tomb-robber lab 0 exit) ──────────────────
    if (ladderX >= 0) {
        const lwx = (ladderX + 0.5) * CELL_SCALE;
        const lwy = (ladderY + 0.5) * CELL_SCALE;
        const ldx = lwx - player.x;
        const ldy = lwy - player.y;
        const ldist = Math.sqrt(ldx * ldx + ldy * ldy);
        if (ldist <= effectiveReach * 1.6) {
            const invDet = 1 / (player.planeX * player.dirY - player.dirX * player.planeY);
            const ltX = invDet * (player.dirY * ldx - player.dirX * ldy);
            const ltY = invDet * (-player.planeY * ldx + player.planeX * ldy);
            if (ltY > 0.1) {
                const lsx = Math.floor((W / 2) * (1 + ltX / ltY));
                const lscol = Math.min(Math.max(0, lsx), W - 1);
                if (zBuffer[lscol] >= ltY - 0.05) {
                    const lsprH = Math.abs(Math.floor(H / ltY));
                    const distAlpha = Math.max(0, 1 - ldist / (effectiveReach * 1.6));
                    const lalpha = Math.min(0.95, distAlpha * flickerMult);
                    if (lalpha >= 0.05) {
                        const ladderW = Math.max(18, lsprH * 0.3);
                        const railL   = lsx - ladderW * 0.38;
                        const railR   = lsx + ladderW * 0.38;
                        const topY    = Math.max(0, horizon - lsprH);
                        const bottomY = Math.min(H - 1, horizon + lsprH * 0.06);
                        const railW   = Math.max(1.5, ladderW * 0.09);
                        const rungCount = Math.max(4, Math.floor((bottomY - topY) / 16));
                        const rungSpacing = (bottomY - topY) / rungCount;
                        ctx.save();
                        // Black ceiling hole
                        ctx.fillStyle = `rgba(0,0,0,${lalpha * 0.88})`;
                        ctx.fillRect(railL - railW * 2, topY, (railR - railL) + railW * 4, Math.max(10, (bottomY - topY) * 0.55));
                        // Rails
                        ctx.strokeStyle = `rgba(75, 52, 28, ${lalpha})`;
                        ctx.lineWidth = railW;
                        ctx.lineCap = 'square';
                        ctx.beginPath();
                        ctx.moveTo(railL, topY); ctx.lineTo(railL, bottomY);
                        ctx.moveTo(railR, topY); ctx.lineTo(railR, bottomY);
                        ctx.stroke();
                        // Rungs
                        ctx.strokeStyle = `rgba(90, 63, 33, ${lalpha})`;
                        ctx.lineWidth = Math.max(1, railW * 0.65);
                        for (let i = 0; i <= rungCount; i++) {
                            const ry = topY + i * rungSpacing;
                            ctx.beginPath();
                            ctx.moveTo(railL, ry); ctx.lineTo(railR, ry);
                            ctx.stroke();
                        }
                        ctx.restore();
                    }
                }
            }
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 5 — Flashlight Effect
// ══════════════════════════════════════════════════════════════════════════

// ── Flicker state ────────────────────────────────────────────
let flickerMult     = 1.0; // 1=full, 0=off
let flickerTimer    = 0;   // seconds remaining in current flicker
let flickerCooldown = 0;   // minimum wait before next flicker check

function resetFlicker() {
    flickerMult = 1.0; flickerTimer = 0; flickerCooldown = 0;
}

function updateFlicker(dt, batteryPct) {
    if (flickerTimer > 0) {
        flickerTimer -= dt;
        if (flickerTimer <= 0) {
            flickerMult     = 1.0;
            flickerCooldown = 0.25 + Math.random() * 0.75; // brief rest before next
        }
    } else if (flickerCooldown > 0) {
        flickerCooldown -= dt;
    } else {
        const chance = (FLICKER_CHANCE_BASE + FLICKER_CHANCE_SCALE * (1 - batteryPct)) * dt;
        if (Math.random() < chance) {
            flickerMult  = Math.random() < 0.25 ? 0 : Math.random() * 0.2;
            flickerTimer = 0.04 + Math.random() * 0.13; // 40–170 ms flicker
            sndFlicker.currentTime = 0;
            sndFlicker.play().catch(() => {});
        }
    }
}

function drawFlashlight(batteryPct) {
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    const maxDim = Math.max(canvas.width, canvas.height);

    const effectivePct = batteryPct * flickerMult;

    // Dead battery or flicker-off: fill black
    if (effectivePct <= 0.005) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const outerR   = maxDim * 0.88;
    const beamR    = maxDim * FLASHLIGHT_RADIUS_FULL * Math.pow(batteryPct, RADIUS_DRAIN_CURVE) * flickerMult;
    const edgeDark = Math.min(0.999, 0.97 + BRIGHTNESS_DRAIN * (1 - batteryPct));

    // Drive stops from actual beam radius so beam visibly shrinks with battery
    const f0 = Math.min(0.99, beamR / outerR);        // beam edge fraction
    const f1 = Math.min(0.995, f0 + 0.12);            // rapid falloff over next 12%

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
    grad.addColorStop(0,   'rgba(0,0,0,0)');
    grad.addColorStop(f0,  'rgba(0,0,0,0)');
    grad.addColorStop(f1,  'rgba(0,0,0,0.88)');
    grad.addColorStop(1,   `rgba(0,0,0,${edgeDark})`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 6 — Player & Physics
// ══════════════════════════════════════════════════════════════════════════

const HALF_FOV = FOV / 2;
const PLANE_LEN = Math.tan(HALF_FOV); // camera plane half-length

const player = {
    x: 1.5 * CELL_SCALE, y: 1.5 * CELL_SCALE,
    dirX: 1, dirY: 0,
    planeX: 0, planeY: PLANE_LEN,
    stamina: STAMINA_MAX,
    staminaPenalty: false,
    battery: BATTERY_MAX,
    health: HEALTH_MAX,
};

/** Reset player position & state for a new run */
function resetPlayer() {
    player.x = 1.5 * CELL_SCALE; player.y = 1.5 * CELL_SCALE;
    player.dirX = 1; player.dirY = 0;
    player.planeX = 0; player.planeY = PLANE_LEN;
    player.stamina = STAMINA_MAX;
    player.staminaPenalty = false;
    player.battery = runConfig.batMax;
    player.health  = HEALTH_MAX;
    pitch = 0;
    bobPhase = 0; bobAmp = 0; bobOffset = 0;
}

/** Face the first open corridor from the spawn cell so the player never starts wall-staring. */
function setSpawnDirection(grid) {
    const dirs = [
        { gx: 1,  gy: 0,  dirX: 1,  dirY: 0,  planeX: 0,          planeY: PLANE_LEN  }, // East
        { gx: 0,  gy: 1,  dirX: 0,  dirY: 1,  planeX: -PLANE_LEN, planeY: 0          }, // South
        { gx: -1, gy: 0,  dirX: -1, dirY: 0,  planeX: 0,          planeY: -PLANE_LEN }, // West
        { gx: 0,  gy: -1, dirX: 0,  dirY: -1, planeX: PLANE_LEN,  planeY: 0          }, // North
    ];
    for (const d of dirs) {
        const nx = 1 + d.gx, ny = 1 + d.gy;
        if (ny >= 0 && ny < grid.length && nx >= 0 && nx < grid[0].length && grid[ny][nx] === 0) {
            player.dirX = d.dirX; player.dirY = d.dirY;
            player.planeX = d.planeX; player.planeY = d.planeY;
            return;
        }
    }
}

/** Rotate player direction by angle (radians) */
function rotatePlayer(angle) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const oldDirX  = player.dirX,   oldPlaneX = player.planeX;
    player.dirX   = player.dirX   * cos - player.dirY   * sin;
    player.dirY   = oldDirX       * sin + player.dirY   * cos;
    player.planeX = player.planeX * cos - player.planeY * sin;
    player.planeY = oldPlaneX     * sin + player.planeY * cos;
}

// ── Input state ──────────────────────────────────────────────
const keys = { w: false, a: false, s: false, d: false, shift: false, e: false };
let mouseMovX = 0;    // accumulated mouse X delta
let mouseMovY = 0;    // accumulated mouse Y delta
let pitch     = 0;    // vertical horizon offset in pixels (look up/down)
let bobPhase  = 0;    // current head-bob sine phase (radians)
let bobAmp    = 0;    // current smoothed bob amplitude (pixels)
let bobOffset = 0;    // computed bob pixel offset added to horizon each frame
let pointerLocked = false;
let eJustPressed   = false; // single-press detection

document.addEventListener('keydown', e => {
    switch (e.code) {
        case 'KeyW':      keys.w     = true; break;
        case 'KeyA':      keys.a     = true; break;
        case 'KeyS':      keys.s     = true; break;
        case 'KeyD':      keys.d     = true; break;
        case 'ShiftLeft':
        case 'ShiftRight': keys.shift = true; break;
        case 'KeyE':
            if (!keys.e) eJustPressed = true;
            keys.e = true;
            break;
        case 'Escape':
            if (gameState === 'playing') onEscapeQuit();
            break;
        case 'Digit1': if (gameState === 'playing') { selectedSlot = 0; updateHotbarUI(); } break;
        case 'Digit2': if (gameState === 'playing') { selectedSlot = 1; updateHotbarUI(); } break;
        case 'Digit3': if (gameState === 'playing') { selectedSlot = 2; updateHotbarUI(); } break;
        case 'Digit4': if (gameState === 'playing') { selectedSlot = 3; updateHotbarUI(); } break;
        case 'Digit5': if (gameState === 'playing') { selectedSlot = 4; updateHotbarUI(); } break;
    }
});

document.addEventListener('keyup', e => {
    switch (e.code) {
        case 'KeyW':      keys.w     = false; break;
        case 'KeyA':      keys.a     = false; break;
        case 'KeyS':      keys.s     = false; break;
        case 'KeyD':      keys.d     = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': keys.shift = false; break;
        case 'KeyE':      keys.e     = false; break;
    }
});

document.addEventListener('mousemove', e => {
    if (pointerLocked) {
        mouseMovX += e.movementX;
        mouseMovY += e.movementY;
    }
});

// ── Pointer lock ─────────────────────────────────────────────
document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvas;
});
document.addEventListener('pointerlockerror', () => {
    pointerLocked = false;
});

canvas.addEventListener('click', () => {
    if (gameState === 'playing') {
        canvas.requestPointerLock();
    }
});

canvas.addEventListener('mousedown', e => {
    if (gameState === 'playing' && e.button === 0 && pointerLocked) {
        useSelectedSlot();
    }
});

/**
 * Update player movement for one frame.
 * @param {number} dt  Delta time in seconds
 * @param {number[][]} grid  Current maze grid
 * @param {Array}  batteries  Battery positions
 */
function updatePlayer(dt, grid, batteries) {
    // ── Mouse rotation ──────────────────────────────────────
    if (mouseMovX !== 0) {
        rotatePlayer(mouseMovX * MOUSE_SENSITIVITY);
        mouseMovX = 0;
    }
    if (mouseMovY !== 0) {
        const maxPitch = canvas.height * 0.40;
        pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch - mouseMovY * 0.65));
        mouseMovY = 0;
    }

    // ── Stamina logic ───────────────────────────────────────
    const wantsRun = flashlightOn && keys.shift && player.stamina > 0 && !player.staminaPenalty;
    const speed = !flashlightOn ? PENALTY_SPEED
        : wantsRun ? RUN_SPEED
        : player.staminaPenalty ? PENALTY_SPEED
        : MOVE_SPEED;

    if (wantsRun) {
        player.stamina -= STAMINA_DRAIN * dt;
        if (player.stamina <= 0) {
            player.stamina = 0;
            player.staminaPenalty = true;
        }
    } else {
        const regen = player.staminaPenalty ? STAMINA_REGEN_PENALTY : STAMINA_REGEN_NORMAL;
        player.stamina = Math.min(STAMINA_MAX, player.stamina + regen * dt);
        if (player.staminaPenalty && player.stamina >= STAMINA_MAX) {
            player.staminaPenalty = false;
        }
    }

    // ── Movement ────────────────────────────────────────────
    // Forward/backward
    const moveFwd  = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    // Strafe
    const moveSide = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);

    const MARGIN = 0.27 * CELL_SCALE;

    if (moveFwd !== 0) {
        const moveSpeed = speed * dt * moveFwd;
        const nx = player.x + player.dirX * moveSpeed;
        const ny = player.y + player.dirY * moveSpeed;
        if (!isWall(grid, nx, player.y, MARGIN)) player.x = nx;
        if (!isWall(grid, player.x, ny, MARGIN)) player.y = ny;
    }

    if (moveSide !== 0) {
        // Strafe: perpendicular to dir
        const strafeSpeed = speed * dt * moveSide;
        const sx = player.x + player.planeX * strafeSpeed;
        const sy = player.y + player.planeY * strafeSpeed;
        if (!isWall(grid, sx, player.y, MARGIN)) player.x = sx;
        if (!isWall(grid, player.x, sy, MARGIN)) player.y = sy;
    }

    // ── Head bob ─────────────────────────────────────────────
    const isMoving = moveFwd !== 0 || moveSide !== 0;
    const targetBobAmp = isMoving ? BOB_AMP * (speed / MOVE_SPEED) : 0;
    bobAmp += (targetBobAmp - bobAmp) * Math.min(1, BOB_SMOOTH * dt);
    if (isMoving) bobPhase += speed * BOB_FREQ * dt;
    bobOffset = bobAmp * Math.sin(bobPhase);

    if (batteryDeadTimer < 0) updateAudio(dt, isMoving, speed);

    // ── Battery drain (only when flashlight on) ──────────────
    if (flashlightOn) {
        player.battery = Math.max(0, player.battery - runConfig.batDrain * dt);
    }

    // ── Item pickup (E key) ──────────────────────────────────
    if (eJustPressed) {
        eJustPressed = false;
        tryPickup(batteries);
    }
}

/**
 * Check whether position (px, py) with margin would be inside a wall.
 */
function isWall(grid, px, py, margin) {
    const h = grid.length, w = grid[0].length;
    const checks = [
        [px - margin, py - margin],
        [px + margin, py - margin],
        [px - margin, py + margin],
        [px + margin, py + margin]
    ];
    for (const [cx, cy] of checks) {
        const mx = Math.floor(cx / CELL_SCALE), my = Math.floor(cy / CELL_SCALE);
        if (mx < 0 || mx >= w || my < 0 || my >= h) return true;
        if (grid[my][mx] === 1) return true;
    }
    return false;
}

/**
 * Check if player is on the door cell.
 */
function isOnDoor(doorX, doorY) {
    return Math.floor(player.x / CELL_SCALE) === doorX && Math.floor(player.y / CELL_SCALE) === doorY;
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 7 — HUD
// ══════════════════════════════════════════════════════════════════════════

const hudEl          = document.getElementById('hud');
const labyrinthLabel = document.getElementById('labyrinthLabel');
const timerDisplay   = document.getElementById('timerDisplay');
const staminaBar     = document.getElementById('staminaBar');
const batteryBar     = document.getElementById('batteryBar');
const batteryHint    = document.getElementById('batteryHint');
const healthBarGroup = document.getElementById('healthBarGroup');
const healthBar      = document.getElementById('healthBar');
const hotbarEl       = document.getElementById('hotbar');
const deathScreenEl  = document.getElementById('deathScreen');
let   healthDeadActive = false;

function updateHUD(labNum, elapsedSec) {
    // Labyrinth label
    labyrinthLabel.textContent = selectedMode === 'level'
        ? `LABYRINTH ${labNum}`
        : `LABYRINTH ${labNum} / ${runConfig.maxLabs}`;

    // Timer
    timerDisplay.textContent = formatTime(elapsedSec);

    // Stamina bar
    const staminaPct = player.stamina / STAMINA_MAX;
    staminaBar.style.width = (staminaPct * 100).toFixed(1) + '%';
    if (player.staminaPenalty) {
        staminaBar.classList.add('penalty');
    } else {
        staminaBar.classList.remove('penalty');
    }

    // Battery bar
    const batPct = player.battery / runConfig.batMax;
    batteryBar.style.width = (batPct * 100).toFixed(1) + '%';
    batteryBar.classList.toggle('low', batPct < 0.25);

    // Health bar (tomb-robber only)
    if (selectedMode === 'tomb-robber') {
        healthBarGroup.style.display = '';
        const hpPct = player.health / HEALTH_MAX;
        healthBar.style.width = (hpPct * 100).toFixed(1) + '%';
        healthBar.classList.toggle('low', hpPct < 0.3);
    } else {
        healthBarGroup.style.display = 'none';
    }
}

/** Format seconds to MM:SS.t */
function formatTime(seconds) {
    if (seconds == null) return '—';
    const m  = Math.floor(seconds / 60);
    const s  = Math.floor(seconds % 60);
    const t  = Math.floor((seconds % 1) * 10);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${t}`;
}


// ══════════════════════════════════════════════════════════════════════════
// SECTION 9 — Game State Machine
// ══════════════════════════════════════════════════════════════════════════

let gameState = 'menu'; // 'menu' | 'controls' | 'playing' | 'summary'

// DOM references
const menuEl          = document.getElementById('menu');
const controlsScreen  = document.getElementById('controlsScreen');
const modesScreen     = document.getElementById('modesScreen');
const summaryScreen   = document.getElementById('summaryScreen');
const summaryTitle    = document.getElementById('summaryTitle');
const summaryBody     = document.getElementById('summaryBody');
const summaryTotalEl  = document.getElementById('summaryTotalTime');
const controlsBtn     = document.getElementById('controlsBtn');
const enterBtn        = document.getElementById('enterBtn');
const modesBtn        = document.getElementById('modesBtn');
const controlsBackBtn = document.getElementById('controlsBackBtn');
const modesBackBtn    = document.getElementById('modesBackBtn');
const playAgainBtn    = document.getElementById('summaryPlayAgain');
const menuBtn         = document.getElementById('summaryMenu');
const modeCards       = document.querySelectorAll('.modeCard');
const diffBtns        = document.querySelectorAll('.diffBtn');

function showMenu() {
    gameState = 'menu';
    menuEl.classList.remove('hidden');
    controlsScreen.classList.add('hidden');
    modesScreen.classList.add('hidden');
    canvas.classList.add('hidden');
    hudEl.classList.add('hidden');
    hotbarEl.classList.add('hidden');
    summaryScreen.classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    loadStats();
}

function showControls() {
    gameState = 'controls';
    menuEl.classList.add('hidden');
    controlsScreen.classList.remove('hidden');
}

const tombRobberCard = document.querySelector('.modeCard[data-mode="tomb-robber"]');

async function checkTombRobberAccess() {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch('/api/me', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (data.email === 'micahgrose@gmail.com') {
            tombRobberCard.classList.remove('modeCardLocked');
            const soon = tombRobberCard.querySelector('.modeCardSoon');
            if (soon) soon.remove();
        }
    } catch {}
}

function showModes() {
    gameState = 'modes';
    menuEl.classList.add('hidden');
    modesScreen.classList.remove('hidden');
    checkTombRobberAccess();
}

function showGame() {
    gameState = 'playing';
    menuEl.classList.add('hidden');
    controlsScreen.classList.add('hidden');
    canvas.classList.remove('hidden');
    hudEl.classList.remove('hidden');
    hotbarEl.classList.remove('hidden');
    summaryScreen.classList.add('hidden');
    canvas.requestPointerLock();
}

function showSummary(lapTimes, quit, failedTime = null) {
    gameState = 'summary';
    canvas.classList.add('hidden');
    hudEl.classList.add('hidden');
    hotbarEl.classList.add('hidden');
    summaryScreen.classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();

    summaryTitle.textContent  = quit ? 'RUN ABANDONED' : 'RUN COMPLETE';
    summaryTitle.className    = quit ? 'quit' : '';

    const isLevel = selectedMode === 'level';

    // Update thead for level mode (3 columns) vs others (2 columns)
    const theadRow = summaryScreen.querySelector('thead tr');
    theadRow.innerHTML = isLevel
        ? '<th>Labyrinth</th><th>Time</th><th class="statusTh">Status</th>'
        : '<th>Labyrinth</th><th>Time</th>';

    // Update tfoot for level mode
    const summaryTotalRow = document.getElementById('summaryTotal');
    summaryTotalRow.innerHTML = isLevel
        ? '<td colspan="2">TOTAL</td><td id="summaryTotalTime">—</td>'
        : '<td>TOTAL</td><td id="summaryTotalTime">—</td>';

    summaryBody.innerHTML = '';
    let totalTime = 0;

    if (isLevel) {
        for (let i = 0; i < lapTimes.length; i++) {
            const tr = document.createElement('tr');
            const td1 = document.createElement('td'); td1.textContent = `Labyrinth ${i + 1}`;
            const td2 = document.createElement('td'); td2.textContent = formatTime(lapTimes[i]);
            const td3 = document.createElement('td'); td3.className = 'statusCell';
            td3.innerHTML = '<span class="statusBadge statusCompleted">COMPLETED</span>';
            totalTime += lapTimes[i];
            tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
            summaryBody.appendChild(tr);
        }
        if (quit && failedTime != null) {
            const tr = document.createElement('tr');
            const td1 = document.createElement('td'); td1.textContent = `Labyrinth ${lapTimes.length + 1}`;
            const td2 = document.createElement('td'); td2.textContent = formatTime(failedTime);
            const td3 = document.createElement('td'); td3.className = 'statusCell';
            td3.innerHTML = '<span class="statusBadge statusFailed">FAILED</span>';
            totalTime += failedTime;
            tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
            summaryBody.appendChild(tr);
        }
    } else {
        const rowCount = runConfig.maxLabs;
        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');
            const td1 = document.createElement('td'); td1.textContent = `Labyrinth ${i + 1}`;
            const td2 = document.createElement('td');
            if (lapTimes[i] != null) {
                td2.textContent = formatTime(lapTimes[i]);
                totalTime += lapTimes[i];
            } else {
                td2.textContent = 'Abandoned';
                td2.className = 'abandoned';
            }
            tr.appendChild(td1); tr.appendChild(td2);
            summaryBody.appendChild(tr);
        }
    }

    document.getElementById('summaryTotalTime').textContent =
        (quit && selectedMode === 'speed') ? '—' : formatTime(totalTime);
}

// ── Button wiring ────────────────────────────────────────────
controlsBtn.addEventListener('click', showControls);
controlsBackBtn.addEventListener('click', showMenu);
modesBtn.addEventListener('click', showModes);
modesBackBtn.addEventListener('click', showMenu);
enterBtn.addEventListener('click', startRun);
playAgainBtn.addEventListener('click', startRun);
menuBtn.addEventListener('click', showMenu);

function syncDiffButtons() {
    const locked = selectedMode === 'tomb-robber';
    diffBtns.forEach(b => b.classList.toggle('diffDisabled', locked));
}

modeCards.forEach(card => {
    card.addEventListener('click', () => {
        if (card.classList.contains('modeCardLocked')) return;
        selectedMode = card.dataset.mode;
        modeCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        syncDiffButtons();
    });
});

diffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (selectedMode === 'tomb-robber') return;
        selectedDiff = btn.dataset.diff;
        diffBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    });
});

// ── Health death ──────────────────────────────────────────────────────────

function triggerHealthDeath() {
    if (healthDeadActive) return;
    healthDeadActive = true;
    runActive = false;
    cancelAnimationFrame(animFrameId);
    stopAllAudio();
    if (document.pointerLockElement) document.exitPointerLock();
    hudEl.classList.add('hidden');
    hotbarEl.classList.add('hidden');
    deathScreenEl.classList.remove('hidden');
    const t0 = performance.now();
    const FADE_IN = 500, HOLD = 2500, FADE_OUT = 900;
    const TOTAL   = FADE_IN + HOLD + FADE_OUT;
    (function animDeath(now) {
        const ms = now - t0;
        let alpha;
        if (ms < FADE_IN)             alpha = ms / FADE_IN;
        else if (ms < FADE_IN + HOLD) alpha = 1;
        else                          alpha = 1 - (ms - FADE_IN - HOLD) / FADE_OUT;
        deathScreenEl.style.background = `rgba(155, 0, 0, ${Math.max(0, Math.min(1, alpha)) * 0.92})`;
        if (ms < TOTAL) requestAnimationFrame(animDeath);
        else {
            deathScreenEl.classList.add('hidden');
            deathScreenEl.style.background = '';
            healthDeadActive = false;
            showMenu();
        }
    })(performance.now());
}

function triggerLadderCutscene(lapTime) {
    if (ladderCutsceneActive) return;
    ladderCutsceneActive = true;
    runActive = false;
    cancelAnimationFrame(animFrameId);
    Object.keys(keys).forEach(k => { keys[k] = false; });

    const W = canvas.width, H = canvas.height;
    const LOOK_UP_DUR  = 1300; // ms — tilt pitch upward
    const FADE_OUT_DUR = 650;  // ms — fade to black
    const BLACK_DUR    = 400;  // ms — held black while swapping labs
    const FADE_IN_DUR  = 950;  // ms — fade back in rising into new lab
    const TOTAL = LOOK_UP_DUR + FADE_OUT_DUR + BLACK_DUR + FADE_IN_DUR;
    const targetPitch  = H * 0.7; // look nearly straight up
    const risePitch    = -H * 0.35; // start next lab looking slightly down
    const t0 = performance.now();
    let transitioned = false;

    function frame(now) {
        const ms = now - t0;
        const batPct = player.battery / runConfig.batMax;

        if (ms < LOOK_UP_DUR) {
            const t = ms / LOOK_UP_DUR;
            pitch = (1 - (1 - t) ** 3) * targetPitch;
            renderScene(currentGrid, player, currentBats);
            drawFlashlight(batPct);
            updateHUD(currentLab + 1, lapTime + ms / 1000);
        } else if (ms < LOOK_UP_DUR + FADE_OUT_DUR) {
            const t = (ms - LOOK_UP_DUR) / FADE_OUT_DUR;
            pitch = targetPitch;
            renderScene(currentGrid, player, currentBats);
            drawFlashlight(batPct);
            ctx.fillStyle = `rgba(0,0,0,${t.toFixed(3)})`;
            ctx.fillRect(0, 0, W, H);
            updateHUD(currentLab + 1, lapTime + ms / 1000);
        } else if (ms < LOOK_UP_DUR + FADE_OUT_DUR + BLACK_DUR) {
            if (!transitioned) {
                transitioned = true;
                lapTimes[currentLab] = lapTime;
                currentLab++;
                const level = buildLevel(currentLab);
                currentGrid = level.grid;
                currentBats = level.batteries;
                doorX  = level.doorX  ?? -1;
                doorY  = level.doorY  ?? -1;
                ladderX = level.ladderX ?? -1;
                ladderY = level.ladderY ?? -1;
                markers = [];
                player.x = 1.5 * CELL_SCALE; player.y = 1.5 * CELL_SCALE;
                player.battery = runConfig.batMax;
                setSpawnDirection(currentGrid);
                pitch = risePitch;
                lapStart = performance.now();
            }
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
        } else if (ms < TOTAL) {
            const t = (ms - LOOK_UP_DUR - FADE_OUT_DUR - BLACK_DUR) / FADE_IN_DUR;
            pitch = risePitch * (1 - t);
            renderScene(currentGrid, player, currentBats);
            drawFlashlight(player.battery / runConfig.batMax);
            ctx.fillStyle = `rgba(0,0,0,${(1 - t).toFixed(3)})`;
            ctx.fillRect(0, 0, W, H);
            updateHUD(currentLab + 1, 0);
        } else {
            pitch = 0;
            ladderCutsceneActive = false;
            runActive = true;
            lastFrameTime = performance.now();
            animFrameId = requestAnimationFrame(gameLoop);
            return;
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 10 — Run Logic
// ══════════════════════════════════════════════════════════════════════════

let currentLab   = 0; // 0-based index
let lapTimes     = [];
let lapStart     = 0;  // performance.now() at start of current lap
let runStart     = 0;  // performance.now() at start of run
let currentGrid  = null;
let currentBats  = [];
let doorX = 0, doorY = 0;
let ladderX = -1, ladderY = -1;
let ladderCutsceneActive = false;
let lastFrameTime = 0;
let animFrameId   = 0;
let runActive        = false;
let batteryDeadTimer = -1;             // countdown seconds after battery dies; -1 = not triggered
let effectiveReach   = FLASHLIGHT_REACH; // updated each frame based on battery level

function startRun() {
    applyRunConfig();
    currentLab       = 0;
    lapTimes         = [];
    runStart         = performance.now();
    lapStart         = runStart;
    batteryDeadTimer = -1;
    healthDeadActive = false;

    resetPlayer();
    resetFlicker();
    initHotbar();
    loadNextLab();
    showGame();

    lastFrameTime = performance.now();
    runActive     = true;
    cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(gameLoop);
}

function loadNextLab() {
    const level = buildLevel(currentLab);
    currentGrid = level.grid;
    currentBats = level.batteries;
    doorX  = level.doorX  ?? -1;
    doorY  = level.doorY  ?? -1;
    ladderX = level.ladderX ?? -1;
    ladderY = level.ladderY ?? -1;
    markers = [];
    player.battery = runConfig.batMax;

    if (selectedMode === 'tomb-robber' && currentLab === 0) {
        // Spawn in the hallway, facing south toward the maze; entrance wall is at the back (north)
        player.x = 2.5 * CELL_SCALE;
        player.y = (TOMB_HALL_LEN - 0.5) * CELL_SCALE;
        player.dirX = 0; player.dirY = 1;
        player.planeX = -PLANE_LEN; player.planeY = 0;
    } else {
        player.x = 1.5 * CELL_SCALE; player.y = 1.5 * CELL_SCALE;
        setSpawnDirection(currentGrid);
    }
}

function gameLoop(now) {
    if (!runActive) return;
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1); // cap at 100ms
    lastFrameTime = now;

    const elapsed = (now - lapStart) / 1000;

    // Update player
    updatePlayer(dt, currentGrid, currentBats);

    const batPct = player.battery / runConfig.batMax;

    // Update effective reach based on battery level
    effectiveReach = FLASHLIGHT_REACH * (REACH_FLOOR + (1 - REACH_FLOOR) * Math.pow(batPct, REACH_DRAIN_CURVE));

    // Update flashlight flicker
    if (batteryDeadTimer < 0) updateFlicker(dt, batPct);

    // Render
    if (flashlightOn) {
        renderScene(currentGrid, player, currentBats);
        drawFlashlight(batPct);
    } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // HUD
    updateHUD(currentLab + 1, elapsed);

    // Check door
    if (isOnDoor(doorX, doorY)) {
        advanceLab(elapsed);
        return;
    }

    // Check ladder (tomb-robber lab 0 exit) — trigger from adjacent cell
    if (ladderX >= 0) {
        const px = Math.floor(player.x / CELL_SCALE);
        const py = Math.floor(player.y / CELL_SCALE);
        if (Math.abs(px - ladderX) + Math.abs(py - ladderY) === 1) {
            triggerLadderCutscene(elapsed);
            return;
        }
    }

    // Health death (tomb-robber only)
    if (selectedMode === 'tomb-robber' && player.health <= 0 && !healthDeadActive) {
        triggerHealthDeath();
        return;
    }

    // Battery death: darkness then ripple back to menu
    if (player.battery <= 0 && batteryDeadTimer < 0) {
        batteryDeadTimer = BATTERY_DEAD_DELAY;
        sndFootsteps.forEach(s => fadeAudio(s, 0, DEATH_FADE_OUT_DUR));
        sndDrops.forEach(s => fadeAudio(s, 0, DEATH_FADE_OUT_DUR));
        sndSpooks.forEach(s => fadeAudio(s, 0, DEATH_FADE_OUT_DUR));
        if (spookSongStarted) fadeAudio(sndSpookSong, 0, DEATH_FADE_OUT_DUR);
        sndFlicker.pause(); sndFlicker.currentTime = 0;
        sndWhispers.currentTime = 0;
        sndWhispers.play().catch(() => {});
        fadeAudio(sndWhispers, WHISPERS_MAX_VOL, WHISPERS_FADE_IN_DUR);
        if (document.pointerLockElement) document.exitPointerLock();
        hudEl.classList.add('hidden');
        hotbarEl.classList.add('hidden');
    }
    if (batteryDeadTimer >= 0) {
        batteryDeadTimer -= dt;
        if (batteryDeadTimer <= SWOOSH_LEAD_TIME && batteryDeadTimer + dt > SWOOSH_LEAD_TIME) {
            sndSwoosh.currentTime = 0;
            sndSwoosh.play().catch(() => {});
        }
        if (batteryDeadTimer <= 0) {
            batteryDeadTimer = -1;
            runActive = false;
            cancelAnimationFrame(animFrameId);
            // Fade Whispers out over the ripple animation duration
            fadeAudio(sndWhispers, 0, WHISPERS_FADE_OUT_DUR, () => { sndWhispers.pause(); sndWhispers.currentTime = 0; });
            const elapsed2 = (performance.now() - lapStart) / 1000;
            const total2 = lapTimes.reduce((s, t) => s + (t || 0), 0) + elapsed2;
            if (selectedMode === 'level') {
                saveStats({ completed: false, total_time: total2, labs_cleared: lapTimes.length });
            }
            playRippleTransition(showMenu);
            return;
        }
    }

    animFrameId = requestAnimationFrame(gameLoop);
}

function advanceLab(lapTime) {
    lapTimes[currentLab] = lapTime;
    currentLab++;

    if ((selectedMode === 'speed' || selectedMode === 'tomb-robber') && currentLab >= runConfig.maxLabs) {
        // Run complete
        runActive = false;
        cancelAnimationFrame(animFrameId);
        stopAllAudio();
        const total = lapTimes.reduce((s, t) => s + (t || 0), 0);
        saveStats({ completed: true, quit: false, lap_times: lapTimes, total_time: total });
        showSummary(lapTimes, false);
    } else {
        lapStart = performance.now();
        loadNextLab();
        animFrameId = requestAnimationFrame(gameLoop);
    }
}

function playRippleTransition(onComplete) {
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const maxR = Math.hypot(cx, cy) * 1.15;
    let start = null;
    const DURATION = 2400;

    canvas.classList.remove('hidden');

    function frame(ts) {
        if (!start) start = ts;
        const t = Math.min(1, (ts - start) / DURATION);

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        // Phase 1: dying flicker at center (t 0 → 0.28)
        if (t < 0.28) {
            const ft = t / 0.28;
            const flickR = 40 * Math.sin(ft * Math.PI * 6) * (1 - ft);
            if (flickR > 1) {
                const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, flickR);
                grd.addColorStop(0, `rgba(212,168,67,${0.5 * (1 - ft)})`);
                grd.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grd;
                ctx.fillRect(0, 0, W, H);
            }
        }

        // Phase 2: expanding rings (t 0.2 → 0.85)
        if (t > 0.2) {
            const rt = (t - 0.2) / 0.65;
            const NUM_RINGS = 8;
            for (let i = 0; i < NUM_RINGS; i++) {
                const ringT = rt - (i / NUM_RINGS) * 0.55;
                if (ringT <= 0 || ringT > 1) continue;
                const r = ringT * maxR;
                const alpha = Math.max(0, (1 - ringT) * 0.75);
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(212,168,67,${alpha})`;
                ctx.lineWidth = (1 - ringT) * 5 + 1;
                ctx.stroke();
            }
        }

        // Phase 3: radial gold flash then gold wash (t 0.78 → 1.0)
        if (t > 0.78) {
            const ft = (t - 0.78) / 0.22;
            const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
            grd.addColorStop(0,   `rgba(212,168,67,${ft * 0.7})`);
            grd.addColorStop(0.4, `rgba(212,168,67,${ft * 0.25})`);
            grd.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, W, H);

            if (ft > 0.65) {
                const wft = (ft - 0.65) / 0.35;
                ctx.fillStyle = `rgba(212,168,67,${wft * 0.95})`;
                ctx.fillRect(0, 0, W, H);
            }
        }

        if (t < 1) {
            requestAnimationFrame(frame);
        } else {
            canvas.classList.add('hidden');
            onComplete();
        }
    }
    requestAnimationFrame(frame);
}

function onEscapeQuit() {
    runActive = false;
    cancelAnimationFrame(animFrameId);
    stopAllAudio();
    const elapsed = (performance.now() - lapStart) / 1000;
    const partialTimes = [...lapTimes];
    const total = partialTimes.reduce((s, t) => s + (t || 0), 0) + elapsed;
    if (selectedMode === 'level') {
        saveStats({ completed: false, total_time: total, labs_cleared: lapTimes.length });
    }
    showSummary(partialTimes, true, elapsed);
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 11 — Stats
// ══════════════════════════════════════════════════════════════════════════

const statsContent  = document.getElementById('statsContent');

function getToken() {
    return localStorage.getItem('rg_token');
}

async function loadStats() {
    const token = getToken();
    if (!token) {
        statsContent.innerHTML = '<div class="statsNotLoggedIn">Not logged in — stats won\'t be saved.<br>Log in at Rose Garden to track your times.</div>';
        return;
    }

    try {
        const res = await fetch(`/api/stats/labyrinth?mode=${selectedMode}&diff=${selectedDiff}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Not authorized');
        const stats = await res.json();
        renderStats(stats);
    } catch {
        statsContent.innerHTML = '<div class="statsNotLoggedIn">Could not load stats.</div>';
    }
}

function renderStats(stats) {
    const modeLabel = `${selectedMode.toUpperCase()} · ${selectedDiff.toUpperCase()}`;
    let rows;
    if (selectedMode === 'speed') {
        const fpl = stats.fastest_per_lab || [null, null, null];
        rows = [
            ['Runs Completed',  stats.total_runs  ?? 0],
            ['Best Total Time', stats.best_total_time != null ? formatTime(stats.best_total_time) : '—'],
            ['Fastest Lab 1',   fpl[0] != null ? formatTime(fpl[0]) : '—'],
            ['Fastest Lab 2',   fpl[1] != null ? formatTime(fpl[1]) : '—'],
            ['Fastest Lab 3',   fpl[2] != null ? formatTime(fpl[2]) : '—'],
        ];
    } else {
        rows = [
            ['Runs',      stats.total_runs      ?? 0],
            ['Best Time', stats.best_total_time != null ? formatTime(stats.best_total_time) : '—'],
        ];
    }
    statsContent.innerHTML =
        `<div class="statsRow"><span class="statsLabel" style="color:var(--gold-dim);font-size:0.68rem;letter-spacing:0.12em;">${modeLabel}</span></div>` +
        rows.map(([label, val]) =>
            `<div class="statsRow"><span class="statsLabel">${label}</span><span class="statsValue">${val}</span></div>`
        ).join('');
}

async function saveStats(runData) {
    const token = getToken();
    if (!token) return;

    try {
        await fetch('/api/stats/labyrinth', {
            method:  'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type':  'application/json'
            },
            body: JSON.stringify({ ...runData, mode: selectedMode, diff: selectedDiff })
        });
    } catch (err) {
        console.warn('Failed to save stats:', err);
    }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 12 — Init
// ══════════════════════════════════════════════════════════════════════════

resizeCanvas();

// Randomise mode and difficulty on each page load
(function randomiseDefaults() {
    const modes = ['speed', 'level'];
    const diffs = ['easy', 'moderate', 'hard'];
    selectedMode = modes[Math.floor(Math.random() * modes.length)];
    selectedDiff = diffs[Math.floor(Math.random() * diffs.length)];
    modeCards.forEach(c => c.classList.toggle('selected', c.dataset.mode === selectedMode));
    diffBtns.forEach(b => b.classList.toggle('selected', b.dataset.diff === selectedDiff));
    syncDiffButtons();
})();

showMenu();
