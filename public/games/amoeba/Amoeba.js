const c   = document.getElementById('c');
const ctx = c.getContext('2d');
c.width   = window.innerWidth;
c.height  = window.innerHeight;
window.addEventListener('resize', () => { c.width = window.innerWidth; c.height = window.innerHeight; });

let mouseX = c.width / 2, mouseY = c.height / 2;
document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

// ── Game constants ────────────────────────────────────
const WORLD_W      = 4000;
const WORLD_H      = 4000;
const BASE_SIZE    = 10;
const TICK_MS      = 50;
const SPLIT_MIN    = 20;

const CAM_MIN      = 0.1;
const CAM_MAX      = 4;
const CAM_LERP     = 0.05;
const CAM_ZOOM     = 2.5;

const SNAP_HARD    = 200;
const SNAP_SOFT    = 40;
const SNAP_LERP    = 0.25;

const ANIM_MS      = 1000; // split / merge animation duration (ms)

let camScale       = CAM_MAX;
let camX           = WORLD_W / 2;
let camY           = WORLD_H / 2;
let time           = 0;
let lastInput      = 0;
let lastFrameTime  = performance.now();
let lastTickTime   = performance.now();

// ── Server state ──────────────────────────────────────
let youId      = null;
let food       = [];
let players    = [];
let myLocals   = new Map(); // cellId → local predicted cell
let myColor    = null;
let myUsername = null;
const botRender = new Map();

// ── Animation state ───────────────────────────────────
// Split: captures pre-split cell states, plays fission shape 0→1
let splitAnim = null;
// { splittingCells: [{cx,cy,size,phase,dir}], nonSplittingIds: Set,
//   preSplitIds: Set, startedAt, duration }

// Merge: captures pre-merge cell positions, plays fission shape 1→0
let mergeAnim = null;
// { pairs: [{ax,ay,aSize,bx,by,bSize,dir}], mergeIds: Set,
//   preMergeIds: Set, startedAt, duration }

// ── Socket ────────────────────────────────────────────
const socket = io('/amoeba', { auth: { token: localStorage.getItem('rg_token') } });

socket.on('init', data => {
    youId   = data.youId;
    food    = data.food;
    players = data.players;
    for (const b of data.bots) botRender.set(b.id, { ...b });
    const me = players.find(p => p.id === youId);
    if (me) {
        myColor = me.color; myUsername = me.username;
        myLocals.clear();
        for (const cell of me.cells) myLocals.set(cell.id, { ...cell });
    }
});

socket.on('tick', data => {
    for (const id of data.foodRemoved) {
        const i = food.findIndex(f => f.id === id);
        if (i !== -1) food.splice(i, 1);
    }
    for (const f of data.foodAdded) food.push(f);
    players = data.players;
    lastTickTime = performance.now();

    const activeIds = new Set();
    for (const b of data.bots) {
        activeIds.add(b.id);
        if (!botRender.has(b.id)) {
            botRender.set(b.id, { ...b });
        } else {
            const v = botRender.get(b.id);
            v.tx = b.x; v.ty = b.y;
            v.size = b.size; v.color = b.color;
            v.velX = b.velX; v.velY = b.velY;
            v.phase = b.phase; v.name = b.name;
        }
    }
    for (const id of botRender.keys()) if (!activeIds.has(id)) botRender.delete(id);

    const serverMe = players.find(p => p.id === youId);
    if (serverMe) {
        myColor = serverMe.color; myUsername = serverMe.username;
        const serverIds = new Set(serverMe.cells.map(sc => sc.id));
        for (const id of myLocals.keys()) if (!serverIds.has(id)) myLocals.delete(id);
        for (const sc of serverMe.cells) {
            if (myLocals.has(sc.id)) {
                const loc = myLocals.get(sc.id);
                const d = Math.hypot(sc.x - loc.x, sc.y - loc.y);
                if (d > SNAP_HARD) { loc.x = sc.x; loc.y = sc.y; }
                else if (d > SNAP_SOFT) { loc.x += (sc.x - loc.x) * SNAP_LERP; loc.y += (sc.y - loc.y) * SNAP_LERP; }
                loc.size = sc.size; loc.velX = sc.velX; loc.velY = sc.velY;
                loc.phase = sc.phase; loc.splitBoost = sc.splitBoost;
            } else {
                myLocals.set(sc.id, { ...sc });
            }
        }
    }
});

socket.on('died', ({ killedBy }) => {
    document.getElementById('killerName').textContent = killedBy || 'something';
    const screen = document.getElementById('killScreen');
    screen.classList.add('active');
    setTimeout(() => screen.classList.remove('active'), 2500);
    myLocals.clear();
    splitAnim = null; mergeAnim = null;
});

// ── Input: split / merge ──────────────────────────────
document.addEventListener('click', () => {
    if (myLocals.size === 0) return;

    const dx  = mouseX - c.width / 2, dy = mouseY - c.height / 2;
    const mag = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / mag, y: dy / mag };

    const splittingCells  = [];
    const nonSplittingIds = new Set();
    const preSplitIds     = new Set();

    for (const [id, cell] of myLocals) {
        preSplitIds.add(id);
        if (cell.size >= SPLIT_MIN) {
            splittingCells.push({ cx: cell.x, cy: cell.y, size: cell.size, phase: cell.phase, dir });
        } else {
            nonSplittingIds.add(id);
        }
    }

    if (splittingCells.length > 0) {
        splitAnim = { splittingCells, nonSplittingIds, preSplitIds, startedAt: performance.now(), duration: ANIM_MS };
        mergeAnim = null;
    }
    socket.emit('split');
});

document.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (myLocals.size < 2) { socket.emit('merge'); return; }

    const cells       = [...myLocals.entries()];
    const pairs       = [];
    const mergeIds    = new Set();
    const preMergeIds = new Set(myLocals.keys());

    for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
            const [idA, a] = cells[i], [idB, b] = cells[j];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (dist < (a.size + b.size) * 1.2) {
                const ddx = b.x - a.x, ddy = b.y - a.y;
                const dmag = Math.hypot(ddx, ddy) || 1;
                pairs.push({ ax: a.x, ay: a.y, aSize: a.size, bx: b.x, by: b.y, bSize: b.size,
                    dir: { x: ddx / dmag, y: ddy / dmag } });
                mergeIds.add(idA); mergeIds.add(idB);
            }
        }
    }

    if (pairs.length > 0) {
        mergeAnim = { pairs, mergeIds, preMergeIds, startedAt: performance.now(), duration: ANIM_MS };
        splitAnim = null;
    }
    socket.emit('merge');
});

// ── Game logic ────────────────────────────────────────
function calcSpeed(size, splitBoost) {
    return Math.pow(BASE_SIZE / size, 0.45) * 9 * (splitBoost ? 1.3 : 1);
}

function loop() {
    const now = performance.now();
    const dtScale = Math.min((now - lastFrameTime) / TICK_MS, 3);
    lastFrameTime = now;
    time++;

    if (myLocals.size > 0) {
        const dx   = mouseX - c.width  / 2;
        const dy   = mouseY - c.height / 2;
        const dist = Math.hypot(dx, dy);

        for (const cell of myLocals.values()) {
            if (dist > 1) {
                const spd = calcSpeed(cell.size, cell.splitBoost);
                cell.velX = (dx / dist) * spd * dtScale;
                cell.velY = (dy / dist) * spd * dtScale;
                cell.x = Math.max(0, Math.min(WORLD_W, cell.x + cell.velX));
                cell.y = Math.max(0, Math.min(WORLD_H, cell.y + cell.velY));
            } else {
                cell.velX = cell.velY = 0;
            }
        }

        if (now - lastInput >= TICK_MS) {
            lastInput = now;
            socket.emit('input', dist > 1
                ? { dirX: dx / dist, dirY: dy / dist }
                : { dirX: 0, dirY: 0 });
        }

        // Camera: centroid + zoom to fit all cells
        let sumX = 0, sumY = 0, maxSize = 0;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const cell of myLocals.values()) {
            sumX += cell.x; sumY += cell.y;
            minX = Math.min(minX, cell.x - cell.size); maxX = Math.max(maxX, cell.x + cell.size);
            minY = Math.min(minY, cell.y - cell.size); maxY = Math.max(maxY, cell.y + cell.size);
            maxSize = Math.max(maxSize, cell.size);
        }
        camX = sumX / myLocals.size;
        camY = sumY / myLocals.size;

        const spread   = Math.max(maxX - minX, maxY - minY, 1);
        const sizeZoom = Math.max(CAM_MIN, Math.min(CAM_MAX, Math.pow(BASE_SIZE / maxSize, 0.5) * CAM_ZOOM));
        const fitZoom  = Math.min(c.width, c.height) / (spread * 1.6);
        const target   = Math.max(CAM_MIN, Math.min(sizeZoom, fitZoom));
        camScale += (target - camScale) * CAM_LERP;

        let totalSize = 0;
        for (const cell of myLocals.values()) totalSize += cell.size;
        document.getElementById('sizeText').textContent   = `Size: ${Math.floor(totalSize)}`;
        document.getElementById('playerText').textContent = `Players: ${players.length}`;
    }

    const tickElapsed = Math.min((now - lastTickTime) / TICK_MS, 1.5);
    for (const v of botRender.values()) {
        if (v.tx !== undefined) {
            const extraX = v.tx + (v.velX || 0) * tickElapsed;
            const extraY = v.ty + (v.velY || 0) * tickElapsed;
            v.x += (extraX - v.x) * 0.4;
            v.y += (extraY - v.y) * 0.4;
        }
    }

    draw();
    requestAnimationFrame(loop);
}

// ── Fission shape ─────────────────────────────────────
// splitS: 0 = round ball, 1 = two fully separated cells
// dir: unit vector — long axis of the oval (faces mouse)
function drawFissionShape(cx, cy, radius, color, dir, splitS) {
    ctx.fillStyle = color;
    const perp = { x: -dir.y, y: dir.x };

    if (splitS < 0.18) {
        // Smooth ball (wobble already suppressed)
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    const ss = (splitS - 0.18) / 0.82; // remap to 0→1 for morph phase

    if (ss > 0.84) {
        // Two cells emerging and shooting out
        const emerge = (ss - 0.84) / 0.16;
        const sep = radius * (0.52 + emerge * 1.1);
        const r   = radius * 0.5 * (1 + emerge * 0.25);
        ctx.beginPath(); ctx.arc(cx + dir.x * sep, cy + dir.y * sep, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx - dir.x * sep, cy - dir.y * sep, r, 0, Math.PI * 2); ctx.fill();
        return;
    }

    // Oval → neck pinch
    const elongation = Math.min(ss / 0.38, 1.0);
    const pinchDepth = Math.max(0, (ss - 0.38) / 0.46);

    const a = radius * (1.0 + elongation * 0.85); // semi-major along dir
    const b = radius * (1.0 - elongation * 0.28); // semi-minor perpendicular

    const N = 32, pts = [];
    for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2;
        const ex    = Math.cos(angle); // along dir [-1,1]
        const ey    = Math.sin(angle); // perp
        // Gaussian neck pinch at ex=0
        const pf       = pinchDepth * Math.exp(-ex * ex * 8);
        const scaledA  = ex * a;
        const scaledB  = ey * b * (1 - pf);
        pts.push({ x: cx + dir.x * scaledA + perp.x * scaledB,
                   y: cy + dir.y * scaledA + perp.y * scaledB });
    }

    ctx.beginPath();
    const sp = { x: (pts[N - 1].x + pts[0].x) / 2, y: (pts[N - 1].y + pts[0].y) / 2 };
    ctx.moveTo(sp.x, sp.y);
    for (let i = 0; i < N; i++) {
        const p = pts[i], next = pts[(i + 1) % N];
        ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
    }
    ctx.closePath();
    ctx.fill();
}

// Merge: two cells converge then play reverse fission
// targetX/Y is the actual merged cell position so the animation tracks with it
function drawMergeAnim(ax, ay, aSize, bx, by, bSize, color, dir, s, targetX, targetY) {
    const centX    = targetX, centY = targetY;
    const halfSize = (aSize + bSize) / 2;

    if (s < 0.28) {
        // Approach phase: both cells slide toward the actual merged cell position
        const t = s / 0.28;
        const curAx = ax + (centX - ax) * t, curAy = ay + (centY - ay) * t;
        const curBx = bx + (centX - bx) * t, curBy = by + (centY - by) * t;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(curAx, curAy, aSize * (1 - t * 0.12), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(curBx, curBy, bSize * (1 - t * 0.12), 0, Math.PI * 2); ctx.fill();
    } else {
        // Reverse fission: from splitS≈0.74 down to 0 (pinched oval → round ball)
        const splitS = 0.74 * (1 - (s - 0.28) / 0.72);
        drawFissionShape(centX, centY, halfSize, color, dir, splitS);
    }
}

// ── Standard amoeba drawing ───────────────────────────
function drawAmoeba(x, y, radius, color, velX, velY, phase, nearby = []) {
    const screenR   = radius * camScale;
    const N         = screenR < 15 ? 12 : 24;
    const speed     = Math.hypot(velX, velY);
    const moveAngle = speed > 0.01 ? Math.atan2(velY, velX) : 0;
    const t         = time * 0.012;

    const pts = [];
    for (let i = 0; i < N; i++) {
        let a = (i / N) * Math.PI * 2;
        let r = radius;
        r += Math.sin(a * 2 + t       + phase)       * radius * 0.10;
        r += Math.sin(a * 3 + t * 1.3 + phase * 0.7) * radius * 0.08;
        r += Math.sin(a * 5 + t * 0.7 + phase * 1.5) * radius * 0.05;
        r += Math.pow(Math.max(0, Math.sin(a * 2 + t * 0.6  + phase)),       5) * radius * 0.65;
        r += Math.pow(Math.max(0, Math.sin(a * 2 + t * 0.45 + phase + 2.1)), 5) * radius * 0.55;
        r += Math.pow(Math.max(0, Math.sin(a * 2 + t * 0.35 + phase + 4.3)), 5) * radius * 0.45;
        if (speed > 0.1) {
            const align = Math.cos(a - moveAngle);
            r += Math.max(0, align) * Math.min(speed / 3, 1) * radius * 0.3;
        }
        pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }

    for (const obj of nearby) {
        const infR = obj.r * 1.6, infR2 = infR * infR;
        for (let i = 0; i < N; i++) {
            const pdx = pts[i].x - obj.x, pdy = pts[i].y - obj.y;
            const d2 = pdx*pdx + pdy*pdy;
            if (d2 >= infR2) continue;
            const d   = Math.sqrt(d2);
            const inf = 1 - d / infR;
            const ax  = pts[i].x - x, ay = pts[i].y - y;
            const aD  = Math.sqrt(ax*ax + ay*ay);
            if (aD < 0.001) continue;
            const push = obj.r * inf * 0.7;
            const newR = Math.max(aD * 0.1, aD - push);
            pts[i].x = x + (ax / aD) * newR;
            pts[i].y = y + (ay / aD) * newR;
        }
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    const s = { x: (pts[N - 1].x + pts[0].x) / 2, y: (pts[N - 1].y + pts[0].y) / 2 };
    ctx.moveTo(s.x, s.y);
    for (let i = 0; i < N; i++) {
        const p    = pts[i];
        const next = pts[(i + 1) % N];
        ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
    }
    ctx.closePath();
    ctx.fill();
}

function drawLabel(x, y, radius, text) {
    const fontSize = Math.max(6, Math.min(14 / camScale, radius * 0.8));
    ctx.fillStyle = 'white'; ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
}

// ── Draw ──────────────────────────────────────────────
function draw() {
    ctx.clearRect(0, 0, c.width, c.height);

    if (myLocals.size === 0 && !splitAnim && !mergeAnim) {
        ctx.fillStyle = '#555'; ctx.font = '22px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Connecting...', c.width / 2, c.height / 2);
        return;
    }

    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    ctx.scale(camScale, camScale);
    ctx.translate(-camX, -camY);

    const hw    = (c.width  / 2) / camScale + 100;
    const hh    = (c.height / 2) / camScale + 100;
    const vMinX = camX - hw, vMaxX = camX + hw;
    const vMinY = camY - hh, vMaxY = camY + hh;

    // Grid
    const gx0 = Math.max(0,       Math.floor(vMinX / 100) * 100);
    const gx1 = Math.min(WORLD_W, Math.ceil(vMaxX  / 100) * 100);
    const gy0 = Math.max(0,       Math.floor(vMinY / 100) * 100);
    const gy1 = Math.min(WORLD_H, Math.ceil(vMaxY  / 100) * 100);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = gx0; x <= gx1; x += 100) { ctx.moveTo(x, gy0); ctx.lineTo(x, gy1); }
    for (let y = gy0; y <= gy1; y += 100) { ctx.moveTo(gx0, y); ctx.lineTo(gx1, y); }
    ctx.stroke();

    ctx.strokeStyle = '#c0394b'; ctx.lineWidth = 30;
    ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

    // Food
    for (const f of food) {
        if (f.x < vMinX || f.x > vMaxX || f.y < vMinY || f.y > vMaxY) continue;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2); ctx.fill();
    }

    const myCells    = [...myLocals.values()];
    const myCellObjs = myCells.map(cell => ({ x: cell.x, y: cell.y, r: cell.size }));

    const myNearbyFood = [];
    for (const f of food) {
        for (let k = 0; k < myCells.length; k++) {
            const mc = myCells[k];
            const dx = f.x - mc.x, dy = f.y - mc.y;
            if (dx*dx + dy*dy < (mc.size * 1.7 + f.size * 2) ** 2) {
                myNearbyFood.push({ x: f.x, y: f.y, r: f.size }); break;
            }
        }
    }

    // Build other entities (enemy players' cells + bots)
    const maxR   = 200;
    const others = [];
    for (const p of players) {
        if (p.id === youId) continue;
        for (const cell of p.cells) others.push({ ...cell, color: p.color, label: p.username });
    }
    for (const b of botRender.values()) others.push({ ...b, label: b.name });
    others.sort((a, b) => b.size - a.size);

    // Draw other entities
    for (const e of others) {
        if (e.x + maxR < vMinX || e.x - maxR > vMaxX ||
            e.y + maxR < vMinY || e.y - maxR > vMaxY) continue;
        const eNearby = [];
        for (let k = 0; k < myCells.length; k++) {
            const mc = myCells[k];
            const edx = e.x - mc.x, edy = e.y - mc.y;
            if (edx*edx + edy*edy < (mc.size + e.size) ** 2 * 4) eNearby.push(myCellObjs[k]);
        }
        for (const o of others) {
            if (o === e) continue;
            const odx = o.x - e.x, ody = o.y - e.y;
            if (odx*odx + ody*ody < (e.size + o.size) ** 2 * 4) eNearby.push({ x: o.x, y: o.y, r: o.size });
        }
        drawAmoeba(e.x, e.y, e.size, e.color, e.velX || 0, e.velY || 0, e.phase || 0, eNearby);
        drawLabel(e.x, e.y, e.size, e.label);
    }

    // Draw my cells — with animation overrides
    const now = performance.now();

    if (splitAnim && now - splitAnim.startedAt < splitAnim.duration) {
        const s = (now - splitAnim.startedAt) / splitAnim.duration;

        // Collect new cells created by split (not present before split)
        const allNew = [];
        for (const [id, cell] of myLocals) {
            if (!splitAnim.preSplitIds.has(id)) allNew.push(cell);
        }

        // Non-splitting cells render normally (same IDs, unchanged on server)
        for (const [id, cell] of myLocals) {
            if (!splitAnim.nonSplittingIds.has(id)) continue;
            const cn = [...myNearbyFood];
            for (const e of others) {
                const dx = e.x - cell.x, dy = e.y - cell.y;
                if (dx*dx + dy*dy < (cell.size + e.size) ** 2 * 4) cn.push({ x: e.x, y: e.y, r: e.size });
            }
            drawAmoeba(cell.x, cell.y, cell.size, myColor || '#fff',
                cell.velX || 0, cell.velY || 0, cell.phase || 0, cn);
            drawLabel(cell.x, cell.y, cell.size, myUsername || '(you)');
        }

        // Fission animation for each splitting cell, anchored to actual new cell positions
        for (let k = 0; k < splitAnim.splittingCells.length; k++) {
            const sc  = splitAnim.splittingCells[k];
            const nA  = allNew[k * 2];
            const nB  = allNew[k * 2 + 1];

            // Track the actual centroid of the two new cells so the shape moves with them
            const animCx = (nA && nB) ? (nA.x + nB.x) / 2 : sc.cx;
            const animCy = (nA && nB) ? (nA.y + nB.y) / 2 : sc.cy;

            // In the final "two circles" phase draw the real cells at their actual positions
            const ss = s < 0.18 ? 0 : (s - 0.18) / 0.82;
            if (ss > 0.84 && nA && nB) {
                const emerge = (ss - 0.84) / 0.16;
                const r = sc.size * 0.5 * (1 + emerge * 0.25);
                ctx.fillStyle = myColor || '#fff';
                ctx.beginPath(); ctx.arc(nA.x, nA.y, r, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(nB.x, nB.y, r, 0, Math.PI * 2); ctx.fill();
                drawLabel(animCx, animCy, sc.size * 0.5, myUsername || '(you)');
            } else {
                drawFissionShape(animCx, animCy, sc.size, myColor || '#fff', sc.dir, s);
                drawLabel(animCx, animCy, sc.size, myUsername || '(you)');
            }
        }

    } else if (mergeAnim && now - mergeAnim.startedAt < mergeAnim.duration) {
        const s = (now - mergeAnim.startedAt) / mergeAnim.duration;

        // Find the actual merged cell so we can track its position
        let mergedCell = null;
        for (const [id, cell] of myLocals) {
            if (!mergeAnim.preMergeIds.has(id)) { mergedCell = cell; break; }
        }

        // Non-merging cells (in preMergeIds but not mergeIds) render normally
        for (const [id, cell] of myLocals) {
            if (!mergeAnim.preMergeIds.has(id)) continue; // suppress new merged cell
            if (mergeAnim.mergeIds.has(id)) continue;     // suppress animating cells
            const cn = [...myNearbyFood];
            for (const e of others) {
                const dx = e.x - cell.x, dy = e.y - cell.y;
                if (dx*dx + dy*dy < (cell.size + e.size) ** 2 * 4) cn.push({ x: e.x, y: e.y, r: e.size });
            }
            drawAmoeba(cell.x, cell.y, cell.size, myColor || '#fff',
                cell.velX || 0, cell.velY || 0, cell.phase || 0, cn);
            drawLabel(cell.x, cell.y, cell.size, myUsername || '(you)');
        }

        // Merge animations, tracking toward actual merged cell position
        for (const pair of mergeAnim.pairs) {
            const targetX = mergedCell ? mergedCell.x : (pair.ax + pair.bx) / 2;
            const targetY = mergedCell ? mergedCell.y : (pair.ay + pair.by) / 2;
            drawMergeAnim(pair.ax, pair.ay, pair.aSize, pair.bx, pair.by, pair.bSize,
                myColor || '#fff', pair.dir, s, targetX, targetY);
        }

    } else {
        // No animation — clear state and render normally
        splitAnim = null; mergeAnim = null;

        const sortedMy = [...myCells].sort((a, b) => b.size - a.size);
        for (const cell of sortedMy) {
            const cn = [...myNearbyFood];
            for (const mc of myCells) {
                if (mc === cell) continue;
                const dx = mc.x - cell.x, dy = mc.y - cell.y;
                if (dx*dx + dy*dy < (cell.size + mc.size) ** 2 * 4) cn.push({ x: mc.x, y: mc.y, r: mc.size });
            }
            for (const e of others) {
                const dx = e.x - cell.x, dy = e.y - cell.y;
                if (dx*dx + dy*dy < (cell.size + e.size) ** 2 * 4) cn.push({ x: e.x, y: e.y, r: e.size });
            }
            drawAmoeba(cell.x, cell.y, cell.size, myColor || '#fff',
                cell.velX || 0, cell.velY || 0, cell.phase || 0, cn);
            drawLabel(cell.x, cell.y, cell.size, myUsername || '(you)');
        }
    }

    ctx.restore();
}

requestAnimationFrame(loop);
