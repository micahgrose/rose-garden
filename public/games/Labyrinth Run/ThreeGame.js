'use strict';
import * as THREE from 'three';

// ══════════════════════════════════════════════════════════════════════════
// SECTION 1 — Constants & Config
// ══════════════════════════════════════════════════════════════════════════

// — Player movement
const MOVE_SPEED             = 1;
const RUN_SPEED              = 1.8;
const PENALTY_SPEED          = 0.7;
const STAMINA_MAX            = 100;
const STAMINA_DRAIN          = 30;
const STAMINA_REGEN_NORMAL   = 30;
const STAMINA_REGEN_PENALTY  = 10;

// — Head bob
const BOB_AMP                = 0.025;
const BOB_FREQ               = 8;
const BOB_SMOOTH             = 10;

// — Battery
const BATTERY_MAX            = 150;
const BATTERY_DRAIN          = 1.5;
const BATTERY_PICKUP_AMOUNT  = 50;
const BATTERY_DEAD_DELAY     = 10;

// — Flashlight
const FLASHLIGHT_RADIUS_FULL = 0.2;
const FLASHLIGHT_REACH       = 4.75;
const FLICKER_CHANCE_BASE    = 0.02;
const FLICKER_CHANCE_SCALE   = 0.48;
const RADIUS_DRAIN_CURVE     = 0.55;
const REACH_DRAIN_CURVE      = 0.45;
const REACH_FLOOR            = 0.70;
const BRIGHTNESS_DRAIN       = 0.01;

// — Camera & controls
const MOUSE_SENSITIVITY      = 0.00075;
const MAX_PITCH_RAD          = 0.42;
const PITCH_SENS             = 0.0012;
const PLANE_LEN              = Math.tan(Math.PI / 4); // 90° horizontal FOV

// — World
const TEXTURE_SIZE           = 128;
const CELL_SCALE             = 1;
const HEALTH_MAX             = 100;
const TOMB_HALL_LEN          = 5;
const SWOOSH_LEAD_TIME       = 0.1;
const SQUEEZE_CLOSE_DUR      = 4.0;

// — Colors  (rgb, each channel 0.0–1.0)
const COLOR_WALL    = [0.03, 0.024, 0.015];
const COLOR_FLOOR   = [0.25, 0.18, 0.08 ];
const COLOR_CEILING = COLOR_FLOOR;
const COLOR_DOOR    = [0.65, 0.55,  0.42 ];
const COLOR_SUN     = [1.0,  0.77,  0.27 ];

const MODE_CONFIGS = {
    speed: {
        easy:     { labSizes: [11,15,19], batteries: [1,1,2], batMax: 150, batDrain: 1.5,  maxLabs: 3 },
        moderate: { labSizes: [15,19,23], batteries: [1,2,3], batMax: 150, batDrain: 2, maxLabs: 3 },
        hard:     { labSizes: [19,23,27], batteries: [1,2,2], batMax: 125, batDrain: 2.75, maxLabs: 3 },
    },
    level: {
        easy:     { startSize: 9,  sizeInc: 3, batMax: 200, batDrain: 1.5,  startBats: 1, batInc: 1, batIncEvery: 1 },
        moderate: { startSize: 11, sizeInc: 4, batMax: 175, batDrain: 1.75, startBats: 1, batInc: 2, batIncEvery: 2 },
        hard:     { startSize: 10, sizeInc: 5, batMax: 100, batDrain: 1.95, startBats: 2, batInc: 2, batIncEvery: 3 },
    },
    'tomb-robber': {
        easy:     { labSizes: [21,51], batteries: [1,5], batMax: 500, batDrain: 1.0, maxLabs: 2 },
        moderate: { labSizes: [21,51], batteries: [3,7], batMax: 500, batDrain: 1.0, maxLabs: 2 },
        hard:     { labSizes: [21,51], batteries: [3,7], batMax: 500, batDrain: 1.0, maxLabs: 2 },
    },
};

let selectedMode = 'speed';
let selectedDiff = 'easy';
let runConfig    = MODE_CONFIGS.speed.easy;

function applyRunConfig() { runConfig = MODE_CONFIGS[selectedMode][selectedDiff]; }

function getLabSize(labIndex) {
    if (selectedMode === 'speed' || selectedMode === 'tomb-robber') return runConfig.labSizes[labIndex];
    const s = runConfig.startSize + labIndex * runConfig.sizeInc;
    return s % 2 === 0 ? s + 1 : s;
}

function getLabBatteries(labIndex) {
    if (selectedMode === 'speed' || selectedMode === 'tomb-robber') return runConfig.batteries[labIndex];
    return runConfig.startBats + Math.floor(labIndex / runConfig.batIncEvery) * runConfig.batInc;
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 1.5 — Audio
// ══════════════════════════════════════════════════════════════════════════

const sndFootsteps = [new Audio('footstep1.mp3'), new Audio('footstep2.mp3')];
sndFootsteps.forEach(s => s.volume = 1);
let footstepIndex = 0;
const BASE_STEP_INTERVAL = 0.6;

const sndFlicker = new Audio('flashlightFlicker.mp3');
sndFlicker.volume = 0.75;
sndFlicker.playbackRate = 1.25;
const DROP_VOL_RANGE = 0.25;
const DROP_VOL_FLOOR = 0.25;

const sndDrops = [new Audio('drop1.mp3'), new Audio('drop2.mp3'), new Audio('drop3.mp3')];
const sndSwoosh = new Audio('swoosh.mp3');
sndSwoosh.volume = 1;
sndSwoosh.playbackRate = 0.85;

const sndSpooks = ['Spook1.mp3','Spook2.mp3','Spook3.mp3','Spook4.mp3'].map(f => new Audio(f));
const SPOOK_INTERVAL_MIN = 15;
const SPOOK_INTERVAL_MAX = 30;

const sndSpookSong = new Audio('SpookSong.mp3');
sndSpookSong.loop = true;
sndSpookSong.volume = 0;
const SPOOK_SONG_DELAY   = 5;
const SPOOK_SONG_FADE_IN = 15;
const SPOOK_SONG_MAX_VOL = 0.6;

const sndWhispers = new Audio('Whisphers.mp3');
sndWhispers.loop = true;
sndWhispers.volume = 0;
const WHISPERS_MAX_VOL     = 0.75;
const WHISPERS_FADE_IN_DUR = 8.0;
const WHISPERS_FADE_OUT_DUR = 2.4;
const DEATH_FADE_OUT_DUR   = 8;

let footstepTimer    = 0;
let dropTimer        = 5 + Math.random() * 8;
let spookTimer       = SPOOK_INTERVAL_MIN + Math.random() * (SPOOK_INTERVAL_MAX - SPOOK_INTERVAL_MIN);
let spookSongStarted = false;

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
    dropTimer -= dt;
    if (dropTimer <= 0) {
        const sndDrop = sndDrops[Math.floor(Math.random() * sndDrops.length)];
        sndDrop.currentTime = 0;
        sndDrop.volume = Math.random() * DROP_VOL_RANGE + DROP_VOL_FLOOR;
        sndDrop.play().catch(() => {});
        dropTimer = 1 + Math.random() * 15;
    }
    spookTimer -= dt;
    if (spookTimer <= 0) {
        const snd = sndSpooks[Math.floor(Math.random() * sndSpooks.length)];
        snd.currentTime = 0;
        snd.play().catch(() => {});
        spookTimer = SPOOK_INTERVAL_MIN + Math.random() * (SPOOK_INTERVAL_MAX - SPOOK_INTERVAL_MIN);
    }
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

// ══════════════════════════════════════════════════════════════════════════
// SECTION 2 — Hotbar
// ══════════════════════════════════════════════════════════════════════════

let flashlightOn = true;
let selectedSlot  = 0;
const hotbar      = new Array(5).fill(null);
let markers       = [];

function initHotbar() {
    for (let i = 0; i < hotbar.length; i++) hotbar[i] = null;
    hotbar[0] = { type: 'flashlight' };
    if (selectedMode === 'tomb-robber') hotbar[1] = { type: 'marker', count: 5 };
    selectedSlot = 0;
    flashlightOn = true;
    markers = [];
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
            syncBatteryMeshes();
            return;
        }
    }
    for (let i = markers.length - 1; i >= 0; i--) {
        const m = markers[i];
        if (Math.sqrt((m.wx - player.x) ** 2 + (m.wy - player.y) ** 2) <= 1.0 * CELL_SCALE) {
            markers.splice(i, 1);
            scene.remove(m.sprite);
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
    const sprite = new THREE.Sprite(markerSpriteMat);
    sprite.scale.set(0.12, 0.12, 1);
    sprite.position.set(hit.wx - player.dirX * 0.04, 0.5, hit.wy - player.dirY * 0.04);
    scene.add(sprite);
    markers.push({ wx: hit.wx, wy: hit.wy, sprite });
    updateHotbarUI();
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 3 — Texture Generation
// ══════════════════════════════════════════════════════════════════════════

function generateSandstoneTexture() {
    const size = TEXTURE_SIZE;
    const img  = new ImageData(size, size);
    const d    = img.data;
    const BASE_R = 200, BASE_G = 165, BASE_B = 90;
    const HIEROGLYPHS = [
        [[0,0,1,1,1,1,1,1,1,1,0,0,0,0],[0,1,0,0,0,0,0,0,0,0,1,0,0,0],[1,0,0,0,1,1,1,1,0,0,0,1,0,0],[1,0,0,1,0,0,0,0,1,0,0,1,0,0],[1,0,0,1,0,0,0,0,1,0,0,1,0,0],[1,0,0,0,1,1,1,1,0,0,0,1,0,0],[0,1,0,0,0,0,0,0,0,0,1,0,0,0],[0,0,1,1,1,1,1,1,1,1,0,0,0,0],[0,0,0,0,1,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,1,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,1,1,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0]],
        [[0,0,0,1,1,1,1,0,0,0,0,0,0,0],[0,0,1,0,0,0,0,1,0,0,0,0,0,0],[0,1,0,0,0,0,0,0,1,0,0,0,0,0],[0,1,0,0,0,0,0,0,1,0,0,0,0,0],[0,0,1,0,0,0,0,1,0,0,0,0,0,0],[0,0,0,1,1,1,1,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0,0,0,0,0],[0,0,0,0,1,1,0,0,0,0,0,0,0,0],[0,0,0,0,1,1,0,0,0,0,0,0,0,0],[0,0,0,0,1,1,0,0,0,0,0,0,0,0],[0,0,0,0,1,1,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0]],
        [[0,0,0,0,0,0,0,1,1,1,0,0,0,0],[0,0,0,0,0,0,1,0,0,0,1,1,1,0],[0,0,0,0,0,0,1,0,0,0,1,1,0,0],[0,0,0,0,0,0,0,1,1,1,0,0,0,0],[0,0,0,1,1,1,1,1,1,0,0,0,0,0],[0,0,1,0,0,0,0,0,0,1,0,0,0,0],[1,1,0,0,0,0,0,0,0,1,0,0,0,0],[1,0,0,0,0,0,0,0,1,0,0,0,0,0],[0,1,1,0,0,0,0,0,1,0,0,0,0,0],[0,0,0,1,1,1,1,1,0,0,0,0,0,0],[0,0,0,0,0,1,0,0,0,0,0,0,0,0],[0,0,0,0,0,1,0,0,0,0,0,0,0,0],[0,0,0,0,0,1,1,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0]],
        [[0,0,1,0,0,0,0,0,0,0,1,0,0,0],[0,0,1,1,0,1,1,1,0,1,1,0,0,0],[1,0,1,0,1,0,0,0,1,0,1,0,1,0],[1,0,0,1,1,0,0,0,1,1,0,0,1,0],[1,0,1,0,0,0,0,0,0,0,1,0,1,0],[0,1,1,0,0,0,0,0,0,0,1,1,0,0],[0,0,1,0,0,0,0,0,0,0,1,0,0,0],[0,1,1,0,0,0,0,0,0,0,1,1,0,0],[1,0,1,0,0,0,0,0,0,0,1,0,1,0],[1,0,1,0,0,0,0,0,0,0,1,0,1,0],[0,0,0,1,0,0,0,0,0,1,0,0,0,0],[0,1,1,0,1,1,1,1,1,0,1,1,0,0],[1,0,0,0,0,0,0,0,0,0,0,0,1,0],[1,0,0,0,0,0,0,0,0,0,0,0,1,0]],
        [[0,0,0,0,1,1,1,1,1,1,0,0,0,0],[0,0,0,1,1,1,1,1,1,1,1,0,0,0],[0,0,1,1,1,0,0,0,0,1,1,1,0,0],[0,1,1,1,0,1,1,1,1,0,1,1,1,0],[0,1,1,0,1,1,1,1,1,1,0,1,1,0],[1,1,1,0,1,0,1,1,0,1,0,1,1,1],[1,1,1,0,1,1,1,1,1,1,0,1,1,1],[1,1,1,0,0,1,1,1,1,0,0,1,1,1],[0,1,1,1,0,0,1,1,0,0,1,1,1,0],[0,1,1,1,1,0,0,0,0,1,1,1,1,0],[0,0,1,1,1,1,1,1,1,1,1,1,0,0],[0,0,0,1,1,0,0,0,0,1,1,0,0,0],[0,0,0,1,1,0,0,0,0,1,1,0,0,0],[0,0,1,1,1,0,0,0,0,1,1,1,0,0]],
    ];
    const centY = Math.floor((size - 14) / 2);
    const numGlyphs = HIEROGLYPHS.length;
    const MIN_GAP = 22;
    const glyphPool = HIEROGLYPHS.map((_, i) => i).sort(() => Math.random() - 0.5);
    const PLACEMENTS = [];
    let attempts = 0;
    while (PLACEMENTS.length < numGlyphs && attempts < 300) {
        attempts++;
        const x = Math.floor(Math.random() * (size - 14));
        if (PLACEMENTS.every(p => Math.abs(p.x - x) >= MIN_GAP))
            PLACEMENTS.push({ g: glyphPool[PLACEMENTS.length % glyphPool.length], x, y: centY });
    }
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const noise = (Math.random() - 0.5) * 28 + (Math.random() - 0.5) * 10;
            let r = Math.min(255, Math.max(0, BASE_R + noise));
            let g = Math.min(255, Math.max(0, BASE_G + noise * 0.82));
            let b = Math.min(255, Math.max(0, BASE_B + noise * 0.52));
            for (const p of PLACEMENTS) {
                const px = x - p.x, py = y - p.y;
                if (px >= 0 && px < 14 && py >= 0 && py < 14 && HIEROGLYPHS[p.g][py][px]) {
                    r = Math.floor(r * 0.22); g = Math.floor(g * 0.22); b = Math.floor(b * 0.22); break;
                }
            }
            d[idx] = r; d[idx+1] = g; d[idx+2] = b; d[idx+3] = 255;
        }
    }
    return img;
}

function generateDoorTexture() {
    const size = TEXTURE_SIZE;
    const img  = new ImageData(size, size);
    const d    = img.data;
    const grainLines = [];
    for (let y = 0; y < size; y++)
        grainLines.push(Math.sin(y * 0.47 + Math.random() * 0.5) * 12 + (Math.random() - 0.5) * 6);
    const BORDER = 3;
    for (let y = 0; y < size; y++) {
        const isBorderY = y < BORDER || y >= size - BORDER;
        for (let x = 0; x < size; x++) {
            const panelLine = (x === Math.floor(size / 3) || x === Math.floor(2 * size / 3));
            const isBorder  = isBorderY || x < BORDER || x >= size - BORDER;
            const idx = (y * size + x) * 4;
            if (isBorder) {
                d[idx] = 52; d[idx+1] = 44; d[idx+2] = 36; d[idx+3] = 255;
            } else if (panelLine) {
                d[idx] = 72; d[idx+1] = 44; d[idx+2] = 18; d[idx+3] = 255;
            } else {
                const grain = grainLines[y];
                const noise = (Math.random() - 0.5) * 14;
                d[idx]   = Math.min(255, Math.max(0, 110 + grain * 0.9 + noise));
                d[idx+1] = Math.min(255, Math.max(0,  68 + grain * 0.55 + noise * 0.7));
                d[idx+2] = Math.min(255, Math.max(0,  28 + grain * 0.2  + noise * 0.35));
                d[idx+3] = 255;
            }
        }
    }
    return img;
}

function generateFloorTexture() {
    const size = TEXTURE_SIZE;
    const img  = new ImageData(size, size);
    const d    = img.data;
    const BASE_R = 72, BASE_G = 54, BASE_B = 33;
    const TILE = 32;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const isTile = (x % TILE === 0 || y % TILE === 0);
            const noise  = (Math.random() - 0.5) * 14;
            const idx = (y * size + x) * 4;
            d[idx]   = Math.min(255, Math.max(0, BASE_R + noise - (isTile ? 16 : 0)));
            d[idx+1] = Math.min(255, Math.max(0, BASE_G + noise * 0.75 - (isTile ? 12 : 0)));
            d[idx+2] = Math.min(255, Math.max(0, BASE_B + noise * 0.5  - (isTile ? 7  : 0)));
            d[idx+3] = 255;
        }
    }
    return img;
}

function generateCeilingTexture() {
    const size = TEXTURE_SIZE;
    const img  = new ImageData(size, size);
    const d    = img.data;
    const TILE = 48;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const isTile = (x % TILE === 0 || y % TILE === 0);
            const noise  = (Math.random() - 0.5) * 8;
            const idx = (y * size + x) * 4;
            d[idx]   = Math.min(255, Math.max(0, 28 + noise - (isTile ? 8 : 0)));
            d[idx+1] = Math.min(255, Math.max(0, 20 + noise * 0.75 - (isTile ? 6 : 0)));
            d[idx+2] = Math.min(255, Math.max(0, 12 + noise * 0.5  - (isTile ? 4 : 0)));
            d[idx+3] = 255;
        }
    }
    return img;
}

function imageDataToTexture(imgData, repeat = false) {
    const oc = document.createElement('canvas');
    oc.width = oc.height = TEXTURE_SIZE;
    oc.getContext('2d').putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(oc);
    if (repeat) { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; }
    return tex;
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 4 — Maze Generation
// ══════════════════════════════════════════════════════════════════════════

function generateMaze(w, h) {
    const grid = [];
    for (let y = 0; y < h; y++) grid.push(new Array(w).fill(1));
    const dirs = [[0,-2],[0,2],[-2,0],[2,0]];
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    function carve(cx, cy) {
        grid[cy][cx] = 0;
        for (const [dx, dy] of shuffle([...dirs])) {
            const nx = cx + dx, ny = cy + dy;
            if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1 && grid[ny][nx] === 1) {
                grid[cy + dy/2][cx + dx/2] = 0;
                carve(nx, ny);
            }
        }
    }
    carve(1, 1);
    return grid;
}

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

function buildLevel(labIndex) {
    if (selectedMode === 'tomb-robber' && isDemoUser && labIndex === 0) return buildDemoRoom();
    if (selectedMode === 'tomb-robber' && labIndex === 0) return buildTombRobberEntry(getLabSize(0));
    if (selectedMode === 'tomb-robber' && labIndex === 1) return buildTombRobberLab1Generic();
    const size = getLabSize(labIndex);
    const grid = generateMaze(size, size);
    const door = bfsFurthest(grid, 1, 1);
    if (door.x === 1 && door.y === 1) {
        for (const f of [{x:size-2,y:size-2},{x:size-2,y:1},{x:1,y:size-2}]) {
            if (grid[f.y][f.x] === 0) { door.x = f.x; door.y = f.y; break; }
        }
    }
    grid[door.y][door.x] = 2;
    const numBat = getLabBatteries(labIndex);
    const batteries = [];
    const openCells = [];
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
            if (grid[y][x] === 0 && !(x === 1 && y === 1)) openCells.push({ x, y });
    openCells.sort(() => Math.random() - 0.5);
    let placed = 0;
    for (const cell of openCells) {
        if (Math.abs(cell.x-1)+Math.abs(cell.y-1) >= 4 && placed < numBat)
            batteries.push({ x: cell.x, y: cell.y, active: true }), placed++;
    }
    for (const cell of openCells) {
        if (placed >= numBat) break;
        if (!batteries.find(b => b.x === cell.x && b.y === cell.y))
            batteries.push({ x: cell.x, y: cell.y, active: true }), placed++;
    }
    return { grid, batteries, doorX: door.x, doorY: door.y, ladderX: -1, ladderY: -1 };
}

function buildTombRobberEntry(mazeSize) {
    const maze = generateMaze(mazeSize, mazeSize);
    maze[0][1] = 0; maze[0][2] = 0; maze[0][3] = 0;
    maze[1][2] = 0; maze[1][3] = 0;
    const fullGrid = [];
    const entRow = new Array(mazeSize).fill(1);
    entRow[1] = 4; entRow[2] = 4; entRow[3] = 4;
    fullGrid.push(entRow);
    for (let r = 0; r < TOMB_HALL_LEN; r++) {
        const row = new Array(mazeSize).fill(1);
        row[1] = 0; row[2] = 0; row[3] = 0;
        fullGrid.push(row);
    }
    for (const mazeRow of maze) fullGrid.push([...mazeRow]);
    const ladder = bfsFurthest(fullGrid, 2, 1);
    const ladderX = ladder.x, ladderY = ladder.y;
    const numBat = getLabBatteries(0);
    const batteries = [];
    const openCells = [];
    for (let y = 0; y < fullGrid.length; y++)
        for (let x = 0; x < fullGrid[y].length; x++)
            if (fullGrid[y][x] === 0 && !(x === 2 && y <= 2) && !(x === ladderX && y === ladderY))
                openCells.push({ x, y });
    openCells.sort(() => Math.random() - 0.5);
    let placed = 0;
    for (const cell of openCells) {
        if (Math.abs(cell.x-2)+Math.abs(cell.y-1) >= 6 && placed < numBat)
            batteries.push({ x: cell.x, y: cell.y, active: true }), placed++;
    }
    for (const cell of openCells) {
        if (placed >= numBat) break;
        if (!batteries.find(b => b.x === cell.x && b.y === cell.y))
            batteries.push({ x: cell.x, y: cell.y, active: true }), placed++;
    }
    return { grid: fullGrid, batteries, doorX: -1, doorY: -1, ladderX, ladderY };
}

function buildTombRobberLab1Generic() {
    const size = getLabSize(1);
    const grid = generateMaze(size, size);
    const door = bfsFurthest(grid, 1, 1);
    grid[door.y][door.x] = 2;
    const numBat = getLabBatteries(1);
    const batteries = [];
    const openCells = [];
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
            if (grid[y][x] === 0 && !(x === 1 && y === 1)) openCells.push({ x, y });
    openCells.sort(() => Math.random() - 0.5);
    let placed = 0;
    for (const cell of openCells) {
        if (Math.abs(cell.x-1)+Math.abs(cell.y-1) >= 4 && placed < numBat)
            batteries.push({ x: cell.x, y: cell.y, active: true }), placed++;
    }
    for (const cell of openCells) {
        if (placed >= numBat) break;
        if (!batteries.find(b => b.x === cell.x && b.y === cell.y))
            batteries.push({ x: cell.x, y: cell.y, active: true }), placed++;
    }
    const sqCandidates = findSqueezeCandidates(grid);
    sqCandidates.sort(() => Math.random() - 0.5);
    const sqTraps = sqCandidates.filter(cells => cells.every(c =>
        Math.abs(c.x - 1) + Math.abs(c.y - 1) > 5 &&
        Math.abs(c.x - door.x) + Math.abs(c.y - door.y) > 5
    )).slice(0, 3);
    return { grid, batteries, doorX: door.x, doorY: door.y, ladderX: -1, ladderY: -1, squeezeTraps: sqTraps };
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 3.5 — Squeeze Trap System
// ══════════════════════════════════════════════════════════════════════════

function initSqueezeTraps(arr) {
    squeezeTraps = (arr || []).map(cells => {
        const axis = cells.every(c => c.x === cells[0].x) ? 'y' : 'x';
        return { cells, state: 'idle', timer: 0, axis };
    });
    squeezeGrid = {};
}

function rebuildSqueezeGrid() {
    squeezeGrid = {};
    for (const trap of squeezeTraps) {
        if (trap.state === 'idle') continue;
        const progress = trap.state === 'closed' ? 1 : Math.min(1, trap.timer / SQUEEZE_CLOSE_DUR);
        if (progress <= 0) continue;
        for (const c of trap.cells) squeezeGrid[c.x + ',' + c.y] = { progress, axis: trap.axis };
    }
}

function findSqueezeCandidates(grid) {
    const rows = grid.length, cols = grid[0].length;
    const candidates = [];
    for (let y = 1; y < rows - 1; y++) {
        let runStart = -1;
        for (let x = 1; x <= cols - 1; x++) {
            const ok = x < cols - 1 && grid[y][x] === 0 && grid[y-1][x] === 1 && grid[y+1][x] === 1;
            if (ok) { if (runStart < 0) runStart = x; }
            else {
                if (runStart >= 0 && x - runStart >= 3) {
                    const mid = Math.floor((runStart + x - 1) / 2);
                    candidates.push([{ x: mid-1, y }, { x: mid, y }, { x: mid+1, y }]);
                }
                runStart = -1;
            }
        }
    }
    for (let x = 1; x < cols - 1; x++) {
        let runStart = -1;
        for (let y = 1; y <= rows - 1; y++) {
            const ok = y < rows - 1 && grid[y][x] === 0 && grid[y][x-1] === 1 && grid[y][x+1] === 1;
            if (ok) { if (runStart < 0) runStart = y; }
            else {
                if (runStart >= 0 && y - runStart >= 3) {
                    const mid = Math.floor((runStart + y - 1) / 2);
                    candidates.push([{ x, y: mid-1 }, { x, y: mid }, { x, y: mid+1 }]);
                }
                runStart = -1;
            }
        }
    }
    return candidates;
}

function updateSqueezeTraps(dt) {
    const px = Math.floor(player.x / CELL_SCALE);
    const py = Math.floor(player.y / CELL_SCALE);
    for (const trap of squeezeTraps) {
        if (trap.state === 'idle') {
            if (trap.cells.some(c => c.x === px && c.y === py)) {
                trap.state = 'closing';
                trap.timer = 0;
            }
        } else if (trap.state === 'closing') {
            trap.timer = Math.min(trap.timer + dt, SQUEEZE_CLOSE_DUR);
            if (trap.timer >= SQUEEZE_CLOSE_DUR) {
                trap.state = 'closed';
                if (trap.cells.some(c => c.x === px && c.y === py)) player.health = 0;
            }
        }
    }
    rebuildSqueezeGrid();
}

const SQUEEZE_PUSH_MARGIN = 0.27; // matches MARGIN in updatePlayer

function pushPlayerFromSqueezeWalls() {
    const pcx = Math.floor(player.x / CELL_SCALE);
    const pcy = Math.floor(player.y / CELL_SCALE);
    for (const trap of squeezeTraps) {
        if (trap.state === 'idle') continue;
        const progress = trap.state === 'closed' ? 1 : Math.min(1, trap.timer / SQUEEZE_CLOSE_DUR);
        if (progress <= 0) continue;
        if (!trap.cells.some(c => c.x === pcx && c.y === pcy)) continue;
        const depth = progress * 0.5 * CELL_SCALE;
        if (trap.axis === 'y') {
            const leftWall  = pcx * CELL_SCALE + depth + SQUEEZE_PUSH_MARGIN;
            const rightWall = (pcx + 1) * CELL_SCALE - depth - SQUEEZE_PUSH_MARGIN;
            if (leftWall <= rightWall) {
                if (player.x < leftWall)  player.x = leftWall;
                if (player.x > rightWall) player.x = rightWall;
            } else {
                player.x = (pcx + 0.5) * CELL_SCALE;
            }
        } else {
            const topWall    = pcy * CELL_SCALE + depth + SQUEEZE_PUSH_MARGIN;
            const bottomWall = (pcy + 1) * CELL_SCALE - depth - SQUEEZE_PUSH_MARGIN;
            if (topWall <= bottomWall) {
                if (player.y < topWall)    player.y = topWall;
                if (player.y > bottomWall) player.y = bottomWall;
            } else {
                player.y = (pcy + 0.5) * CELL_SCALE;
            }
        }
    }
}

function buildSqueezePanels() {
    squeezePanels.forEach(({ meshA, meshB }) => { scene.remove(meshA); scene.remove(meshB); });
    squeezePanels = [];
    for (const trap of squeezeTraps) {
        for (const cell of trap.cells) {
            let meshA, meshB;
            if (trap.axis === 'y') {
                meshA = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.02, 1.0), squeezeMat);
                meshB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.02, 1.0), squeezeMat);
                meshA.position.set(cell.x * CELL_SCALE, 0.5, (cell.y + 0.5) * CELL_SCALE);
                meshB.position.set((cell.x + 1) * CELL_SCALE, 0.5, (cell.y + 0.5) * CELL_SCALE);
                meshA.scale.x = 0; meshB.scale.x = 0;
            } else {
                meshA = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.02, 0.5), squeezeMat);
                meshB = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.02, 0.5), squeezeMat);
                meshA.position.set((cell.x + 0.5) * CELL_SCALE, 0.5, cell.y * CELL_SCALE);
                meshB.position.set((cell.x + 0.5) * CELL_SCALE, 0.5, (cell.y + 1) * CELL_SCALE);
                meshA.scale.z = 0; meshB.scale.z = 0;
            }
            scene.add(meshA); scene.add(meshB);
            squeezePanels.push({ meshA, meshB, trap, cell });
        }
    }
}

function updateSqueezePanelMeshes() {
    for (const { meshA, meshB, trap, cell } of squeezePanels) {
        const p = trap.state === 'closed' ? 1 : (trap.state === 'idle' ? 0 : Math.min(1, trap.timer / SQUEEZE_CLOSE_DUR));
        if (trap.axis === 'y') {
            meshA.scale.x = p;
            meshA.position.x = cell.x * CELL_SCALE + 0.25 * CELL_SCALE * p;
            meshB.scale.x = p;
            meshB.position.x = (cell.x + 1) * CELL_SCALE - 0.25 * CELL_SCALE * p;
        } else {
            meshA.scale.z = p;
            meshA.position.z = cell.y * CELL_SCALE + 0.25 * CELL_SCALE * p;
            meshB.scale.z = p;
            meshB.position.z = (cell.y + 1) * CELL_SCALE - 0.25 * CELL_SCALE * p;
        }
    }
}

function buildDemoRoom() {
    const GW = 5, GH = 11;
    const grid = [];
    for (let y = 0; y < GH; y++) {
        const row = new Array(GW).fill(1);
        if (y > 0 && y < GH - 1) row[2] = 0;
        grid.push(row);
    }
    grid[1][2] = 2;
    return { grid, batteries: [], doorX: 2, doorY: 1, ladderX: -1, ladderY: -1,
        squeezeTraps: [[{ x: 2, y: 4 }, { x: 2, y: 5 }, { x: 2, y: 6 }]] };
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 5 — Three.js Setup
// ══════════════════════════════════════════════════════════════════════════

const canvas  = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(window.devicePixelRatio > 1 ? 1.5 : 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 0.3, FLASHLIGHT_REACH);

// Camera — vertical FOV derived from 90° horizontal
let camAspect = window.innerWidth / window.innerHeight;
let camVFov   = 2 * Math.atan(1 / camAspect) * (180 / Math.PI);
const camera  = new THREE.PerspectiveCamera(camVFov, camAspect, 0.02, 80);
camera.rotation.order = 'YXZ';

function resizeRenderer() {
    const W = window.innerWidth, H = window.innerHeight;
    renderer.setSize(W, H);
    camAspect = W / H;
    camVFov   = 2 * Math.atan(1 / camAspect) * (180 / Math.PI);
    camera.fov    = camVFov;
    camera.aspect = camAspect;
    camera.updateProjectionMatrix();
}
resizeRenderer();
window.addEventListener('resize', resizeRenderer);

// Shared box geometry — 1.02 tall so bottom/top faces don't z-fight with floor/ceiling planes
const boxGeom = new THREE.BoxGeometry(1, 1.02, 1);

// Generate textures once
const sandstoneTex = imageDataToTexture(generateSandstoneTexture());
const doorTex      = imageDataToTexture(generateDoorTexture());
const floorTex     = imageDataToTexture(generateFloorTexture(), true);
const ceilingTex   = imageDataToTexture(generateCeilingTexture(), true);

// Materials
const wallColor    = new THREE.Color(...COLOR_WALL);
const doorColor    = new THREE.Color(...COLOR_DOOR);
const sunColor     = new THREE.Color(...COLOR_SUN);
const floorColor   = new THREE.Color(...COLOR_FLOOR);
const ceilingColor = new THREE.Color(...COLOR_CEILING);

const wallMat    = new THREE.MeshBasicMaterial({ map: sandstoneTex, color: wallColor });
const doorMat    = new THREE.MeshBasicMaterial({ map: doorTex,      color: doorColor });
const sunMat     = new THREE.MeshBasicMaterial({ color: sunColor });
const floorMat   = new THREE.MeshBasicMaterial({ map: floorTex,    color: floorColor,   side: THREE.DoubleSide });
const ceilingMat = new THREE.MeshBasicMaterial({ map: ceilingTex,  color: ceilingColor, side: THREE.DoubleSide });

// Scene objects rebuilt per level
let sceneWalls   = null;
let sceneDoors   = null;
let sceneSun     = null;
let sceneFloor   = null;
let sceneCeiling = null;
let sceneLadder  = null;
let batMeshes     = [];   // { group, bat } per battery
let squeezePanels = [];   // { meshA, meshB, trap, cell }
let squeezeTraps  = [];   // [{ cells, state, timer, axis }]
let squeezeGrid   = {};   // 'gx,gy' → { progress, axis }
let effectiveReach = FLASHLIGHT_REACH;

// Squeeze panel material — plain color, no texture
const squeezeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...COLOR_WALL) });

// Battery 3D materials (shared)
const batTopMat = new THREE.MeshBasicMaterial({ color: 0x4A2C10 }); // dull dark brown
const batBotMat = new THREE.MeshBasicMaterial({ color: 0x141414 }); // near black
const batCapMat = new THREE.MeshBasicMaterial({ color: 0x5A4A18 }); // tarnished gold

// Marker sprite material
const mrkCanvas = document.createElement('canvas');
mrkCanvas.width = mrkCanvas.height = 32;
{
    const mc = mrkCanvas.getContext('2d');
    mc.fillStyle = 'rgba(148,55,42,0.75)';
    mc.beginPath(); mc.moveTo(4,4); mc.lineTo(28,16); mc.lineTo(4,28); mc.closePath(); mc.fill();
}
const markerSpriteMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mrkCanvas), fog: false, transparent: true, depthTest: true });

// Overlay elements
const flashlightOverlay = document.createElement('div');
flashlightOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
document.body.appendChild(flashlightOverlay);

const fadeOverlay = document.createElement('div');
fadeOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;background:transparent;transition:none;';
document.body.appendChild(fadeOverlay);

const rippleCanvas = document.createElement('canvas');
rippleCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:12;display:none;';
document.body.appendChild(rippleCanvas);
const rctx = rippleCanvas.getContext('2d');

// ══════════════════════════════════════════════════════════════════════════
// SECTION 6 — Build 3D Scene from Grid
// ══════════════════════════════════════════════════════════════════════════

function clearSceneObjects() {
    if (sceneWalls)   { scene.remove(sceneWalls);   sceneWalls = null; }
    if (sceneDoors)   { scene.remove(sceneDoors);   sceneDoors = null; }
    if (sceneSun)     { scene.remove(sceneSun);     sceneSun = null; }
    if (sceneFloor)   { scene.remove(sceneFloor);   sceneFloor = null; }
    if (sceneCeiling) { scene.remove(sceneCeiling); sceneCeiling = null; }
    if (sceneLadder)  { scene.remove(sceneLadder);  sceneLadder = null; }
    batMeshes.forEach(({ group }) => scene.remove(group));
    batMeshes = [];
    squeezePanels.forEach(({ meshA, meshB }) => { scene.remove(meshA); scene.remove(meshB); });
    squeezePanels = [];
    markers.forEach(m => scene.remove(m.sprite));
    markers = [];
}

function buildSceneFromGrid(grid) {
    clearSceneObjects();
    const rows = grid.length, cols = grid[0].length;
    let wc = 0, dc = 0, sc = 0;
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === 1) wc++;
            else if (grid[r][c] === 2) dc++;
            else if (grid[r][c] === 4) sc++;
        }

    const dummy = new THREE.Object3D();
    sceneWalls = new THREE.InstancedMesh(boxGeom, wallMat, Math.max(1, wc));
    if (dc > 0) sceneDoors = new THREE.InstancedMesh(boxGeom, doorMat, dc);
    if (sc > 0) sceneSun   = new THREE.InstancedMesh(boxGeom, sunMat, sc);

    let wi = 0, di = 0, si = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const v = grid[r][c];
            if (v === 1 || v === 2 || v === 4) {
                dummy.position.set(c + 0.5, 0.5, r + 0.5);
                dummy.updateMatrix();
                if (v === 1) sceneWalls.setMatrixAt(wi++, dummy.matrix);
                else if (v === 2 && sceneDoors) sceneDoors.setMatrixAt(di++, dummy.matrix);
                else if (v === 4 && sceneSun)   sceneSun.setMatrixAt(si++, dummy.matrix);
            }
        }
    }
    sceneWalls.instanceMatrix.needsUpdate = true;
    scene.add(sceneWalls);
    if (sceneDoors) { sceneDoors.instanceMatrix.needsUpdate = true; scene.add(sceneDoors); }
    if (sceneSun)   { sceneSun.instanceMatrix.needsUpdate = true;   scene.add(sceneSun); }

    // Floor
    floorTex.repeat.set(cols, rows); floorTex.needsUpdate = true;
    sceneFloor = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), floorMat);
    sceneFloor.rotation.x = -Math.PI / 2;
    sceneFloor.position.set(cols / 2, 0, rows / 2);
    scene.add(sceneFloor);

    // Ceiling
    ceilingTex.repeat.set(cols, rows); ceilingTex.needsUpdate = true;
    sceneCeiling = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), ceilingMat);
    sceneCeiling.rotation.x = Math.PI / 2;
    sceneCeiling.position.set(cols / 2, 1, rows / 2);
    scene.add(sceneCeiling);
}

function buildBatteryMesh(bat, grid) {
    const group = new THREE.Group(); // outer: random Y rotation
    const R = 0.010, H = 0.048, segs = 8;
    const botH = H * 0.45, topH = H * 0.55;

    // Inner group: cylinder upright then tipped flat along X
    const inner = new THREE.Group();
    const botMesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, botH, segs), batBotMat);
    botMesh.position.y = botH / 2;
    const topMesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, topH, segs), batTopMat);
    topMesh.position.y = botH + topH / 2;
    const capMesh = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.45, R * 0.45, 0.008, segs), batCapMat);
    capMesh.position.y = H + 0.004;
    inner.add(botMesh, topMesh, capMesh);
    inner.rotation.z = Math.PI / 2;
    group.add(inner);

    // Random Y rotation so each battery faces a different direction
    group.rotation.y = Math.random() * Math.PI * 2;

    // Nudge toward nearest wall
    let ox = 0, oz = 0;
    const { x, y } = bat;
    if      (grid[y]     && grid[y][x - 1])     ox = -0.4;
    else if (grid[y]     && grid[y][x + 1])     ox =  0.4;
    else if (grid[y - 1] && grid[y - 1][x])     oz = -0.4;
    else if (grid[y + 1] && grid[y + 1][x])     oz =  0.4;

    group.position.set((bat.x + 0.5 + ox) * CELL_SCALE, R, (bat.y + 0.5 + oz) * CELL_SCALE);
    group.visible = bat.active;
    return group;
}

function setupBatteryMeshes(batteries, grid) {
    batMeshes = batteries.map(bat => {
        const group = buildBatteryMesh(bat, grid);
        scene.add(group);
        return { group, bat };
    });
}

function syncBatteryMeshes() {
    for (const { group, bat } of batMeshes) group.visible = bat.active;
}

function buildLadderGeometry(lx, ly) {
    const group = new THREE.Group();
    const railMat = new THREE.MeshBasicMaterial({ color: 0x4b341c });
    const rungMat = new THREE.MeshBasicMaterial({ color: 0x5a3f21 });
    const rW = 0.035, ladderHW = 0.13, numRungs = 7;

    const railGeom = new THREE.BoxGeometry(rW, 1.0, rW);
    [-ladderHW, ladderHW].forEach(ox => {
        const rail = new THREE.Mesh(railGeom, railMat);
        rail.position.set(ox, 0.5, 0);
        group.add(rail);
    });
    const rungGeom = new THREE.BoxGeometry(ladderHW * 2 + rW, rW * 0.8, rW);
    for (let i = 0; i <= numRungs; i++) {
        const rung = new THREE.Mesh(rungGeom, rungMat);
        rung.position.set(0, 0.08 + i * 0.84 / numRungs, 0);
        group.add(rung);
    }
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), holeMat);
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(0, 1.002, 0);
    group.add(hole);

    group.position.set((lx + 0.5) * CELL_SCALE, 0, (ly + 0.5) * CELL_SCALE);
    return group;
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 7 — Flashlight & Flicker
// ══════════════════════════════════════════════════════════════════════════

let flickerMult     = 1.0;
let flickerTimer    = 0;
let flickerCooldown = 0;

function resetFlicker() { flickerMult = 1.0; flickerTimer = 0; flickerCooldown = 0; }

function updateFlicker(dt, batteryPct) {
    if (flickerTimer > 0) {
        flickerTimer -= dt;
        if (flickerTimer <= 0) { flickerMult = 1.0; flickerCooldown = 0.25 + Math.random() * 0.75; }
    } else if (flickerCooldown > 0) {
        flickerCooldown -= dt;
    } else {
        const chance = (FLICKER_CHANCE_BASE + FLICKER_CHANCE_SCALE * (1 - batteryPct)) * dt;
        if (Math.random() < chance) {
            flickerMult  = 0;
            flickerTimer = 0.04 + Math.random() * 0.13;
            sndFlicker.currentTime = 0;
            sndFlicker.play().catch(() => {});
        }
    }
}

function updateFlashlightOverlay(batteryPct) {
    if (!flashlightOn) { flashlightOverlay.style.background = '#000'; return; }
    const ep = batteryPct * flickerMult;
    if (ep <= 0.005) { flashlightOverlay.style.background = '#000'; scene.fog.far = 0.1; return; }
    scene.fog.far = effectiveReach * flickerMult;
    const outerR  = 0.88;
    const beamR   = FLASHLIGHT_RADIUS_FULL * Math.pow(batteryPct, RADIUS_DRAIN_CURVE) * flickerMult;
    const edgeDark = Math.min(0.999, 0.97 + BRIGHTNESS_DRAIN * (1 - batteryPct));
    const f0 = Math.min(99, beamR * 100).toFixed(1);
    const f1 = Math.min(99.5, beamR * 100 + 12).toFixed(1);
    flashlightOverlay.style.background =
        `radial-gradient(circle at 50% 50%, transparent 0%, transparent ${f0}%, rgba(0,0,0,0.88) ${f1}%, rgba(0,0,0,${edgeDark.toFixed(3)}) 100%)`;
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 8 — Player & Camera
// ══════════════════════════════════════════════════════════════════════════

const player = {
    x: 1.5 * CELL_SCALE, y: 1.5 * CELL_SCALE,
    dirX: 1, dirY: 0,
    planeX: 0, planeY: PLANE_LEN,
    stamina: STAMINA_MAX,
    staminaPenalty: false,
    battery: BATTERY_MAX,
    health: HEALTH_MAX,
};

let yaw         = 0;
let pitchAngle  = 0;
let bobPhase    = 0;
let bobAmp      = 0;

function syncYawFromPlayer() {
    yaw = Math.atan2(-player.dirX, -player.dirY);
}

function syncPlayerFromYaw() {
    player.dirX  = -Math.sin(yaw);
    player.dirY  = -Math.cos(yaw);
    player.planeX =  Math.cos(yaw) * PLANE_LEN;
    player.planeY = -Math.sin(yaw) * PLANE_LEN;
}

function syncCamera() {
    const bobOffset = bobAmp * Math.sin(bobPhase);
    camera.position.set(player.x, 0.5 + bobOffset, player.y);
    camera.rotation.y = yaw;
    camera.rotation.x = pitchAngle;
}

function resetPlayer() {
    player.x = 1.5; player.y = 1.5;
    player.dirX = 1; player.dirY = 0;
    player.planeX = 0; player.planeY = PLANE_LEN;
    player.stamina = STAMINA_MAX;
    player.staminaPenalty = false;
    player.battery = runConfig.batMax;
    player.health  = HEALTH_MAX;
    yaw = 0; pitchAngle = 0;
    bobPhase = 0; bobAmp = 0;
}

function setSpawnDirection(grid) {
    const dirs = [
        { gx:1,gy:0,dirX:1,dirY:0,pX:0,pY:PLANE_LEN },
        { gx:0,gy:1,dirX:0,dirY:1,pX:-PLANE_LEN,pY:0 },
        { gx:-1,gy:0,dirX:-1,dirY:0,pX:0,pY:-PLANE_LEN },
        { gx:0,gy:-1,dirX:0,dirY:-1,pX:PLANE_LEN,pY:0 },
    ];
    for (const d of dirs) {
        const nx = 1 + d.gx, ny = 1 + d.gy;
        if (ny >= 0 && ny < grid.length && nx >= 0 && nx < grid[0].length && grid[ny][nx] === 0) {
            player.dirX = d.dirX; player.dirY = d.dirY;
            player.planeX = d.pX; player.planeY = d.pY;
            syncYawFromPlayer();
            return;
        }
    }
}

function isWall(grid, px, py, margin) {
    const h = grid.length, w = grid[0].length;
    for (const [cx, cy] of [[px-margin,py-margin],[px+margin,py-margin],[px-margin,py+margin],[px+margin,py+margin]]) {
        const mx = Math.floor(cx / CELL_SCALE), my = Math.floor(cy / CELL_SCALE);
        if (mx < 0 || mx >= w || my < 0 || my >= h) return true;
        if (grid[my][mx] === 1) return true;
        const sq = squeezeGrid[mx + ',' + my];
        if (sq) {
            const depth = sq.progress * 0.5 * CELL_SCALE;
            if (sq.axis === 'y') {
                if (cx < mx * CELL_SCALE + depth || cx > (mx + 1) * CELL_SCALE - depth) return true;
            } else {
                if (cy < my * CELL_SCALE + depth || cy > (my + 1) * CELL_SCALE - depth) return true;
            }
        }
    }
    return false;
}

function isOnDoor(doorX, doorY) {
    return Math.floor(player.x / CELL_SCALE) === doorX && Math.floor(player.y / CELL_SCALE) === doorY;
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 9 — Input & Player Update
// ══════════════════════════════════════════════════════════════════════════

const keys = { w: false, a: false, s: false, d: false, shift: false, e: false };
let mouseMovX = 0, mouseMovY = 0;
let pointerLocked = false;
let eJustPressed  = false;

document.addEventListener('keydown', e => {
    switch (e.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyD': keys.d = true; break;
        case 'ShiftLeft': case 'ShiftRight': keys.shift = true; break;
        case 'KeyE': if (!keys.e) eJustPressed = true; keys.e = true; break;
        case 'Escape': if (gameState === 'playing') onEscapeQuit(); break;
        case 'Digit1': if (gameState==='playing'){selectedSlot=0;updateHotbarUI();} break;
        case 'Digit2': if (gameState==='playing'){selectedSlot=1;updateHotbarUI();} break;
        case 'Digit3': if (gameState==='playing'){selectedSlot=2;updateHotbarUI();} break;
        case 'Digit4': if (gameState==='playing'){selectedSlot=3;updateHotbarUI();} break;
        case 'Digit5': if (gameState==='playing'){selectedSlot=4;updateHotbarUI();} break;
    }
});
document.addEventListener('wheel', e => {
    if (gameState !== 'playing') return;
    selectedSlot = e.deltaY > 0 ? (selectedSlot + 1) % 5 : (selectedSlot + 4) % 5;
    updateHotbarUI();
}, { passive: true });
document.addEventListener('keyup', e => {
    switch (e.code) {
        case 'KeyW': keys.w = false; break;
        case 'KeyA': keys.a = false; break;
        case 'KeyS': keys.s = false; break;
        case 'KeyD': keys.d = false; break;
        case 'ShiftLeft': case 'ShiftRight': keys.shift = false; break;
        case 'KeyE': keys.e = false; break;
    }
});
document.addEventListener('mousemove', e => {
    if (pointerLocked) { mouseMovX += e.movementX; mouseMovY += e.movementY; }
});
document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === canvas; });
document.addEventListener('pointerlockerror',  () => { pointerLocked = false; });
canvas.addEventListener('click', () => { if (gameState === 'playing') canvas.requestPointerLock(); });
canvas.addEventListener('mousedown', e => {
    if (gameState === 'playing' && e.button === 0 && pointerLocked) useSelectedSlot();
});

function updatePlayer(dt, grid, batteries) {
    if (mouseMovX !== 0) {
        yaw -= mouseMovX * MOUSE_SENSITIVITY;
        syncPlayerFromYaw();
        mouseMovX = 0;
    }
    if (mouseMovY !== 0) {
        pitchAngle = Math.max(-MAX_PITCH_RAD, Math.min(MAX_PITCH_RAD, pitchAngle - mouseMovY * PITCH_SENS));
        mouseMovY = 0;
    }

    const wantsRun = flashlightOn && keys.shift && player.stamina > 0 && !player.staminaPenalty;
    const speed = !flashlightOn ? PENALTY_SPEED
        : wantsRun ? RUN_SPEED
        : player.staminaPenalty ? PENALTY_SPEED
        : MOVE_SPEED;

    if (wantsRun) {
        player.stamina -= STAMINA_DRAIN * dt;
        if (player.stamina <= 0) { player.stamina = 0; player.staminaPenalty = true; }
    } else {
        const regen = player.staminaPenalty ? STAMINA_REGEN_PENALTY : STAMINA_REGEN_NORMAL;
        player.stamina = Math.min(STAMINA_MAX, player.stamina + regen * dt);
        if (player.staminaPenalty && player.stamina >= STAMINA_MAX) player.staminaPenalty = false;
    }

    const moveFwd  = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    const moveSide = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    const MARGIN = 0.27 * CELL_SCALE;

    if (moveFwd !== 0) {
        const ms = speed * dt * moveFwd;
        const nx = player.x + player.dirX * ms;
        const ny = player.y + player.dirY * ms;
        if (!isWall(grid, nx, player.y, MARGIN)) player.x = nx;
        if (!isWall(grid, player.x, ny, MARGIN)) player.y = ny;
    }
    if (moveSide !== 0) {
        const ms = speed * dt * moveSide;
        const sx = player.x + player.planeX * ms;
        const sy = player.y + player.planeY * ms;
        if (!isWall(grid, sx, player.y, MARGIN)) player.x = sx;
        if (!isWall(grid, player.x, sy, MARGIN)) player.y = sy;
    }

    const isMoving = moveFwd !== 0 || moveSide !== 0;
    const targetBobAmp = isMoving ? BOB_AMP * (speed / MOVE_SPEED) : 0;
    bobAmp += (targetBobAmp - bobAmp) * Math.min(1, BOB_SMOOTH * dt);
    if (isMoving) bobPhase += speed * BOB_FREQ * dt;

    if (batteryDeadTimer < 0) updateAudio(dt, isMoving, speed);

    if (flashlightOn) player.battery = Math.max(0, player.battery - runConfig.batDrain * dt);

    if (eJustPressed) { eJustPressed = false; tryPickup(batteries); }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 10 — HUD
// ══════════════════════════════════════════════════════════════════════════

const hudEl          = document.getElementById('hud');
const labyrinthLabel = document.getElementById('labyrinthLabel');
const timerDisplay   = document.getElementById('timerDisplay');
const staminaBar     = document.getElementById('staminaBar');
const batteryBar     = document.getElementById('batteryBar');
const healthBarGroup = document.getElementById('healthBarGroup');
const healthBar      = document.getElementById('healthBar');
const hotbarEl       = document.getElementById('hotbar');
const deathScreenEl  = document.getElementById('deathScreen');
let   healthDeadActive = false;

function updateHUD(labNum, elapsedSec) {
    labyrinthLabel.textContent = selectedMode === 'level'
        ? `LABYRINTH ${labNum}`
        : `LABYRINTH ${labNum} / ${runConfig.maxLabs}`;
    timerDisplay.textContent = formatTime(elapsedSec);
    staminaBar.style.width = (player.stamina / STAMINA_MAX * 100).toFixed(1) + '%';
    staminaBar.classList.toggle('penalty', player.staminaPenalty);
    const batPct = player.battery / runConfig.batMax;
    batteryBar.style.width = (batPct * 100).toFixed(1) + '%';
    batteryBar.classList.toggle('low', batPct < 0.25);
    if (selectedMode === 'tomb-robber') {
        healthBarGroup.style.display = '';
        const hpPct = player.health / HEALTH_MAX;
        healthBar.style.width = (hpPct * 100).toFixed(1) + '%';
        healthBar.classList.toggle('low', hpPct < 0.3);
    } else {
        healthBarGroup.style.display = 'none';
    }
}

function formatTime(seconds) {
    if (seconds == null) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const t = Math.floor((seconds % 1) * 10);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${t}`;
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 11 — Game State Machine
// ══════════════════════════════════════════════════════════════════════════

let gameState = 'menu';
const menuEl         = document.getElementById('menu');
const controlsScreen = document.getElementById('controlsScreen');
const modesScreen    = document.getElementById('modesScreen');
const summaryScreen  = document.getElementById('summaryScreen');
const summaryTitle   = document.getElementById('summaryTitle');
const summaryBody    = document.getElementById('summaryBody');
const controlsBtn    = document.getElementById('controlsBtn');
const enterBtn       = document.getElementById('enterBtn');
const modesBtn       = document.getElementById('modesBtn');
const controlsBackBtn = document.getElementById('controlsBackBtn');
const modesBackBtn   = document.getElementById('modesBackBtn');
const playAgainBtn   = document.getElementById('summaryPlayAgain');
const menuBtn        = document.getElementById('summaryMenu');
const modeCards      = document.querySelectorAll('.modeCard');
const diffBtns       = document.querySelectorAll('.diffBtn');

function showMenu() {
    gameState = 'menu';
    menuEl.classList.remove('hidden');
    controlsScreen.classList.add('hidden');
    modesScreen.classList.add('hidden');
    canvas.classList.add('hidden');
    hudEl.classList.add('hidden');
    hotbarEl.classList.add('hidden');
    summaryScreen.classList.add('hidden');
    flashlightOverlay.style.background = 'transparent';
    if (document.pointerLockElement) document.exitPointerLock();
    loadStats();
}

function showControls() {
    gameState = 'controls';
    menuEl.classList.add('hidden');
    controlsScreen.classList.remove('hidden');
}

let isDemoUser = false;
const tombRobberCard = document.querySelector('.modeCard[data-mode="tomb-robber"]');

async function checkTombRobberAccess() {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch('/api/me', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (data.email === 'micahgrose@gmail.com') {
            isDemoUser = true;
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
    flashlightOverlay.style.background = 'transparent';
    if (document.pointerLockElement) document.exitPointerLock();

    summaryTitle.textContent = quit ? 'RUN ABANDONED' : 'RUN COMPLETE';
    summaryTitle.className   = quit ? 'quit' : '';
    const isLevel = selectedMode === 'level';
    const theadRow = summaryScreen.querySelector('thead tr');
    theadRow.innerHTML = isLevel
        ? '<th>Labyrinth</th><th>Time</th><th class="statusTh">Status</th>'
        : '<th>Labyrinth</th><th>Time</th>';
    const summaryTotalRow = document.getElementById('summaryTotal');
    summaryTotalRow.innerHTML = isLevel
        ? '<td colspan="2">TOTAL</td><td id="summaryTotalTime">—</td>'
        : '<td>TOTAL</td><td id="summaryTotalTime">—</td>';

    summaryBody.innerHTML = '';
    let totalTime = 0;
    if (isLevel) {
        for (let i = 0; i < lapTimes.length; i++) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>Labyrinth ${i+1}</td><td>${formatTime(lapTimes[i])}</td><td class="statusCell"><span class="statusBadge statusCompleted">COMPLETED</span></td>`;
            totalTime += lapTimes[i];
            summaryBody.appendChild(tr);
        }
        if (quit && failedTime != null) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>Labyrinth ${lapTimes.length+1}</td><td>${formatTime(failedTime)}</td><td class="statusCell"><span class="statusBadge statusFailed">FAILED</span></td>`;
            totalTime += failedTime;
            summaryBody.appendChild(tr);
        }
    } else {
        for (let i = 0; i < runConfig.maxLabs; i++) {
            const tr = document.createElement('tr');
            const timeStr = lapTimes[i] != null ? formatTime(lapTimes[i]) : 'Abandoned';
            tr.innerHTML = `<td>Labyrinth ${i+1}</td><td class="${lapTimes[i]==null?'abandoned':''}">${timeStr}</td>`;
            if (lapTimes[i] != null) totalTime += lapTimes[i];
            summaryBody.appendChild(tr);
        }
    }
    document.getElementById('summaryTotalTime').textContent =
        (quit && selectedMode === 'speed') ? '—' : formatTime(totalTime);
}

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

// ══════════════════════════════════════════════════════════════════════════
// SECTION 12 — Transitions
// ══════════════════════════════════════════════════════════════════════════

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
    const FADE_IN = 500, HOLD = 2500, FADE_OUT = 900, TOTAL = FADE_IN + HOLD + FADE_OUT;
    (function animDeath(now) {
        const ms = now - t0;
        let alpha;
        if (ms < FADE_IN)             alpha = ms / FADE_IN;
        else if (ms < FADE_IN + HOLD) alpha = 1;
        else                          alpha = 1 - (ms - FADE_IN - HOLD) / FADE_OUT;
        deathScreenEl.style.background = `rgba(155,0,0,${Math.max(0,Math.min(1,alpha))*0.92})`;
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

    const LOOK_UP_DUR  = 1300;
    const FADE_OUT_DUR = 650;
    const BLACK_DUR    = 400;
    const FADE_IN_DUR  = 950;
    const TOTAL = LOOK_UP_DUR + FADE_OUT_DUR + BLACK_DUR + FADE_IN_DUR;
    const targetPitch = -MAX_PITCH_RAD * 1.65;
    const risePitch   =  MAX_PITCH_RAD * 0.80;
    const t0 = performance.now();
    let transitioned = false;

    function frame(now) {
        const ms = now - t0;
        if (ms < LOOK_UP_DUR) {
            const t = ms / LOOK_UP_DUR;
            pitchAngle = (1 - (1-t)**3) * targetPitch;
            syncCamera();
            renderer.render(scene, camera);
            updateFlashlightOverlay(player.battery / runConfig.batMax);
            updateHUD(currentLab + 1, lapTime + ms / 1000);
            fadeOverlay.style.background = 'transparent';
        } else if (ms < LOOK_UP_DUR + FADE_OUT_DUR) {
            const t = (ms - LOOK_UP_DUR) / FADE_OUT_DUR;
            pitchAngle = targetPitch;
            syncCamera();
            renderer.render(scene, camera);
            updateFlashlightOverlay(player.battery / runConfig.batMax);
            fadeOverlay.style.background = `rgba(0,0,0,${t.toFixed(3)})`;
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
                buildSceneFromGrid(currentGrid);
                setupBatteryMeshes(currentBats, currentGrid);
                initSqueezeTraps(level.squeezeTraps);
                buildSqueezePanels();
                if (ladderX >= 0) {
                    sceneLadder = buildLadderGeometry(ladderX, ladderY);
                    scene.add(sceneLadder);
                }
                player.x = 1.5 * CELL_SCALE; player.y = 1.5 * CELL_SCALE;
                player.battery = runConfig.batMax;
                setSpawnDirection(currentGrid);
                pitchAngle = risePitch;
                lapStart = performance.now();
            }
            fadeOverlay.style.background = '#000';
        } else if (ms < TOTAL) {
            const t = (ms - LOOK_UP_DUR - FADE_OUT_DUR - BLACK_DUR) / FADE_IN_DUR;
            pitchAngle = risePitch * (1 - t);
            syncCamera();
            renderer.render(scene, camera);
            updateFlashlightOverlay(player.battery / runConfig.batMax);
            fadeOverlay.style.background = `rgba(0,0,0,${(1-t).toFixed(3)})`;
            updateHUD(currentLab + 1, 0);
        } else {
            pitchAngle = 0;
            fadeOverlay.style.background = 'transparent';
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

function playRippleTransition(onComplete) {
    rippleCanvas.width  = window.innerWidth;
    rippleCanvas.height = window.innerHeight;
    rippleCanvas.style.display = 'block';
    canvas.classList.remove('hidden');
    const W = rippleCanvas.width, H = rippleCanvas.height;
    const cx = W / 2, cy = H / 2;
    const maxR = Math.hypot(cx, cy) * 1.15;
    let start = null;
    const DURATION = 2400;
    function frame(ts) {
        if (!start) start = ts;
        const t = Math.min(1, (ts - start) / DURATION);
        rctx.clearRect(0, 0, W, H);
        rctx.fillStyle = '#000'; rctx.fillRect(0, 0, W, H);
        if (t < 0.28) {
            const ft = t / 0.28;
            const flickR = 40 * Math.sin(ft * Math.PI * 6) * (1 - ft);
            if (flickR > 1) {
                const grd = rctx.createRadialGradient(cx, cy, 0, cx, cy, flickR);
                grd.addColorStop(0, `rgba(212,168,67,${0.5*(1-ft)})`);
                grd.addColorStop(1, 'rgba(0,0,0,0)');
                rctx.fillStyle = grd; rctx.fillRect(0, 0, W, H);
            }
        }
        if (t > 0.2) {
            const rt = (t - 0.2) / 0.65;
            for (let i = 0; i < 8; i++) {
                const ringT = rt - (i / 8) * 0.55;
                if (ringT <= 0 || ringT > 1) continue;
                rctx.beginPath();
                rctx.arc(cx, cy, ringT * maxR, 0, Math.PI * 2);
                rctx.strokeStyle = `rgba(212,168,67,${Math.max(0,(1-ringT)*0.75)})`;
                rctx.lineWidth = (1 - ringT) * 5 + 1;
                rctx.stroke();
            }
        }
        if (t > 0.78) {
            const ft = (t - 0.78) / 0.22;
            const grd = rctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
            grd.addColorStop(0,   `rgba(212,168,67,${ft*0.7})`);
            grd.addColorStop(0.4, `rgba(212,168,67,${ft*0.25})`);
            grd.addColorStop(1,   'rgba(0,0,0,0)');
            rctx.fillStyle = grd; rctx.fillRect(0, 0, W, H);
            if (ft > 0.65) {
                rctx.fillStyle = `rgba(212,168,67,${((ft-0.65)/0.35)*0.95})`;
                rctx.fillRect(0, 0, W, H);
            }
        }
        if (t < 1) {
            requestAnimationFrame(frame);
        } else {
            rippleCanvas.style.display = 'none';
            canvas.classList.add('hidden');
            onComplete();
        }
    }
    requestAnimationFrame(frame);
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 13 — Run Logic
// ══════════════════════════════════════════════════════════════════════════

let currentLab   = 0;
let lapTimes     = [];
let lapStart     = 0;
let runStart     = 0;
let currentGrid  = null;
let currentBats  = [];
let doorX = 0, doorY = 0;
let ladderX = -1, ladderY = -1;
let ladderCutsceneActive = false;
let lastFrameTime = 0;
let animFrameId   = 0;
let runActive     = false;
let batteryDeadTimer = -1;

function startRun() {
    applyRunConfig();
    currentLab       = 0;
    lapTimes         = [];
    runStart         = performance.now();
    lapStart         = runStart;
    batteryDeadTimer = -1;
    healthDeadActive = false;
    fadeOverlay.style.background = 'transparent';

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
    doorX   = level.doorX  ?? -1;
    doorY   = level.doorY  ?? -1;
    ladderX = level.ladderX ?? -1;
    ladderY = level.ladderY ?? -1;
    markers = [];

    buildSceneFromGrid(currentGrid);
    setupBatteryMeshes(currentBats, currentGrid);
    initSqueezeTraps(level.squeezeTraps);
    buildSqueezePanels();

    if (ladderX >= 0) {
        sceneLadder = buildLadderGeometry(ladderX, ladderY);
        scene.add(sceneLadder);
    }

    player.battery = runConfig.batMax;

    if (selectedMode === 'tomb-robber' && isDemoUser && currentLab === 0) {
        player.x = 2.5; player.y = 9.5;
        player.dirX = 0; player.dirY = -1;
        player.planeX = PLANE_LEN; player.planeY = 0;
        syncYawFromPlayer();
    } else if (selectedMode === 'tomb-robber' && currentLab === 0) {
        player.x = 2.5; player.y = (TOMB_HALL_LEN - 0.5) * CELL_SCALE;
        player.dirX = 0; player.dirY = 1;
        player.planeX = -PLANE_LEN; player.planeY = 0;
        syncYawFromPlayer();
    } else {
        player.x = 1.5; player.y = 1.5;
        setSpawnDirection(currentGrid);
    }
    syncCamera();
}

function gameLoop(now) {
    if (!runActive) return;
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;
    const elapsed = (now - lapStart) / 1000;

    updateSqueezeTraps(dt);
    pushPlayerFromSqueezeWalls();
    updatePlayer(dt, currentGrid, currentBats);
    updateSqueezePanelMeshes();

    const batPct = player.battery / runConfig.batMax;
    effectiveReach = FLASHLIGHT_REACH * (REACH_FLOOR + (1 - REACH_FLOOR) * Math.pow(batPct, REACH_DRAIN_CURVE));

    if (batteryDeadTimer < 0) updateFlicker(dt, batPct);

    syncCamera();

    // Always render — flashlight off just makes fog extremely close (pitch black)
    scene.fog.near = 0.3;
    if (flashlightOn) {
        updateFlashlightOverlay(batPct);
    } else {
        scene.fog.far = 0.1;
        flashlightOverlay.style.background = '#000';
    }

    renderer.render(scene, camera);
    updateHUD(currentLab + 1, elapsed);

    if (isOnDoor(doorX, doorY)) { advanceLab(elapsed); return; }

    if (ladderX >= 0) {
        const px = Math.floor(player.x / CELL_SCALE);
        const py = Math.floor(player.y / CELL_SCALE);
        if (Math.abs(px - ladderX) + Math.abs(py - ladderY) === 1) {
            triggerLadderCutscene(elapsed);
            return;
        }
    }

    if (selectedMode === 'tomb-robber' && player.health <= 0 && !healthDeadActive) {
        triggerHealthDeath(); return;
    }

    if (player.battery <= 0 && batteryDeadTimer < 0) {
        batteryDeadTimer = BATTERY_DEAD_DELAY;
        sndFootsteps.forEach(s => fadeAudio(s, 0, DEATH_FADE_OUT_DUR));
        sndDrops.forEach(s => fadeAudio(s, 0, DEATH_FADE_OUT_DUR));
        sndSpooks.forEach(s => fadeAudio(s, 0, DEATH_FADE_OUT_DUR));
        if (spookSongStarted) fadeAudio(sndSpookSong, 0, DEATH_FADE_OUT_DUR);
        sndFlicker.pause(); sndFlicker.currentTime = 0;
        sndWhispers.currentTime = 0; sndWhispers.play().catch(() => {});
        fadeAudio(sndWhispers, WHISPERS_MAX_VOL, WHISPERS_FADE_IN_DUR);
        if (document.pointerLockElement) document.exitPointerLock();
        hudEl.classList.add('hidden');
        hotbarEl.classList.add('hidden');
    }
    if (batteryDeadTimer >= 0) {
        batteryDeadTimer -= dt;
        if (batteryDeadTimer <= SWOOSH_LEAD_TIME && batteryDeadTimer + dt > SWOOSH_LEAD_TIME) {
            sndSwoosh.currentTime = 0; sndSwoosh.play().catch(() => {});
        }
        if (batteryDeadTimer <= 0) {
            batteryDeadTimer = -1;
            runActive = false;
            cancelAnimationFrame(animFrameId);
            fadeAudio(sndWhispers, 0, WHISPERS_FADE_OUT_DUR, () => { sndWhispers.pause(); sndWhispers.currentTime = 0; });
            const elapsed2 = (performance.now() - lapStart) / 1000;
            const total2 = lapTimes.reduce((s, t) => s + (t || 0), 0) + elapsed2;
            if (selectedMode === 'level') saveStats({ completed: false, total_time: total2, labs_cleared: lapTimes.length });
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

function onEscapeQuit() {
    runActive = false;
    cancelAnimationFrame(animFrameId);
    stopAllAudio();
    const elapsed = (performance.now() - lapStart) / 1000;
    const partialTimes = [...lapTimes];
    const total = partialTimes.reduce((s, t) => s + (t || 0), 0) + elapsed;
    if (selectedMode === 'level') saveStats({ completed: false, total_time: total, labs_cleared: lapTimes.length });
    showSummary(partialTimes, true, elapsed);
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 14 — Stats
// ══════════════════════════════════════════════════════════════════════════

const statsContent = document.getElementById('statsContent');

function getToken() { return localStorage.getItem('rg_token'); }

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
        if (!res.ok) throw new Error();
        renderStats(await res.json());
    } catch { statsContent.innerHTML = '<div class="statsNotLoggedIn">Could not load stats.</div>'; }
}

function renderStats(stats) {
    const modeLabel = `${selectedMode.toUpperCase()} · ${selectedDiff.toUpperCase()}`;
    let rows;
    if (selectedMode === 'speed') {
        const fpl = stats.fastest_per_lab || [null,null,null];
        rows = [
            ['Runs Completed', stats.total_runs ?? 0],
            ['Best Total Time', stats.best_total_time != null ? formatTime(stats.best_total_time) : '—'],
            ['Fastest Lab 1', fpl[0] != null ? formatTime(fpl[0]) : '—'],
            ['Fastest Lab 2', fpl[1] != null ? formatTime(fpl[1]) : '—'],
            ['Fastest Lab 3', fpl[2] != null ? formatTime(fpl[2]) : '—'],
        ];
    } else {
        const depth = stats.best_labs_cleared;
        rows = [
            ['Runs',        stats.total_runs ?? 0],
            ['Best Depth',  depth != null ? `Lab ${depth}` : '—'],
            ['Best Time',   stats.best_total_time != null ? formatTime(stats.best_total_time) : '—'],
        ];
    }
    statsContent.innerHTML =
        `<div class="statsRow"><span class="statsLabel" style="color:var(--gold-dim);font-size:0.68rem;letter-spacing:0.12em;">${modeLabel}</span></div>` +
        rows.map(([l,v]) => `<div class="statsRow"><span class="statsLabel">${l}</span><span class="statsValue">${v}</span></div>`).join('');
}

async function saveStats(runData) {
    const token = getToken();
    if (!token) return;
    try {
        await fetch('/api/stats/labyrinth', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...runData, mode: selectedMode, diff: selectedDiff })
        });
    } catch (err) { console.warn('Failed to save stats:', err); }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 15 — Init
// ══════════════════════════════════════════════════════════════════════════

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
