// ═══════════════════════════════════════════════════════════════════
//  SPLIT / MERGE ARCHIVE — not loaded by the game
//  To reinstate: follow the "WHERE IT GOES" comments below and
//  restore the matching sections in Amoeba.js and server.js
// ═══════════════════════════════════════════════════════════════════


// ─────────────────────────────────────────────────────────────────
//  AMOEBA.JS — CLIENT SIDE
// ─────────────────────────────────────────────────────────────────

// ── WHERE IT GOES: top of file, with the other game constants ────
// const SPLIT_MIN = 20;
// const ANIM_MS   = 1000; // split / merge animation duration (ms)


// ── WHERE IT GOES: after myUsername / botRender declarations ─────
// // Split: captures pre-split cell states, plays fission shape 0→1
// let splitAnim = null;
// // { splittingCells: [{cx,cy,size,phase,dir}], nonSplittingIds: Set,
// //   splittingIds: Set, preSplitIds: Set, startedAt, duration }
//
// // Merge: captures pre-merge cell positions, plays fission shape 1→0
// let mergeAnim = null;
// // { pairs: [{ax,ay,aSize,bx,by,bSize,dir}], mergeIds: Set,
// //   preMergeIds: Set, startedAt, duration }


// ── WHERE IT GOES: inside socket.on('died') after myLocals.clear() ─
// splitAnim = null; mergeAnim = null;


// ── WHERE IT GOES: standalone event listeners (before game logic) ─
document.addEventListener('click', () => {
    if (myLocals.size === 0) return;

    const dx  = mouseX - c.width / 2, dy = mouseY - c.height / 2;
    const mag = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / mag, y: dy / mag };

    const splittingCells  = [];
    const nonSplittingIds = new Set();
    const splittingIds    = new Set();
    const preSplitIds     = new Set();

    for (const [id, cell] of myLocals) {
        preSplitIds.add(id);
        if (cell.size >= SPLIT_MIN) {
            splittingCells.push({ cx: cell.x, cy: cell.y, size: cell.size, phase: cell.phase, dir });
            splittingIds.add(id);
        } else {
            nonSplittingIds.add(id);
        }
    }

    if (splittingCells.length > 0) {
        splitAnim = { splittingCells, nonSplittingIds, splittingIds, preSplitIds, startedAt: performance.now(), duration: ANIM_MS };
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


// ── WHERE IT GOES: calcSpeed — restore splitBoost parameter ──────
// function calcSpeed(size, splitBoost) {
//     return Math.pow(BASE_SIZE / size, 0.45) * 9 * (splitBoost ? 1.3 : 1);
// }
// Also update the call in loop():
//     const spd = calcSpeed(cell.size, cell.splitBoost);


// ── WHERE IT GOES: in loop(), restore splitBoost to loc tracking ─
// loc.splitBoost = sc.splitBoost;   (in socket.on('tick') reconcile block)


// ── WHERE IT GOES: before drawAmoeba, as standalone functions ────
function drawFissionShape(cx, cy, radius, color, dir, splitS) {
    ctx.fillStyle = color;
    const perp = { x: -dir.y, y: dir.x };

    if (splitS < 0.18) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    const ss = (splitS - 0.18) / 0.82;

    if (ss > 0.84) {
        const emerge = (ss - 0.84) / 0.16;
        const sep = radius * (0.52 + emerge * 1.1);
        const r   = radius * 0.5 * (1 + emerge * 0.25);
        ctx.beginPath(); ctx.arc(cx + dir.x * sep, cy + dir.y * sep, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx - dir.x * sep, cy - dir.y * sep, r, 0, Math.PI * 2); ctx.fill();
        return;
    }

    const elongation = Math.min(ss / 0.38, 1.0);
    const pinchDepth = Math.max(0, (ss - 0.38) / 0.46);
    const a = radius * (1.0 + elongation * 0.85);
    const b = radius * (1.0 - elongation * 0.28);
    const N = 32, pts = [];
    for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2;
        const ex = Math.cos(angle), ey = Math.sin(angle);
        const pf      = pinchDepth * Math.exp(-ex * ex * 8);
        const scaledA = ex * a;
        const scaledB = ey * b * (1 - pf);
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

function drawMergeAnim(ax, ay, aSize, bx, by, bSize, color, dir, s, targetX, targetY) {
    const centX    = targetX, centY = targetY;
    const halfSize = (aSize + bSize) / 2;
    if (s < 0.28) {
        const t = s / 0.28;
        const curAx = ax + (centX - ax) * t, curAy = ay + (centY - ay) * t;
        const curBx = bx + (centX - bx) * t, curBy = by + (centY - by) * t;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(curAx, curAy, aSize * (1 - t * 0.12), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(curBx, curBy, bSize * (1 - t * 0.12), 0, Math.PI * 2); ctx.fill();
    } else {
        const splitS = 0.74 * (1 - (s - 0.28) / 0.72);
        drawFissionShape(centX, centY, halfSize, color, dir, splitS);
    }
}


// ── WHERE IT GOES: in draw(), replace the normal-render else block ─
// Replace:
//   if (myLocals.size === 0) { ... connecting ... }
// With:
//   if (myLocals.size === 0 && !splitAnim && !mergeAnim) { ... connecting ... }
//
// Then replace the normal cell render block with this full if/else-if/else:

/*
    if (splitAnim && now - splitAnim.startedAt < splitAnim.duration) {
        const s = (now - splitAnim.startedAt) / splitAnim.duration;

        const allNew = [];
        for (const [id, cell] of myLocals) {
            if (!splitAnim.preSplitIds.has(id)) allNew.push(cell);
        }

        for (const [id, cell] of myLocals) {
            if (!splitAnim.nonSplittingIds.has(id)) continue;
            const cn = [], ce = [...myEatableFood];
            for (const e of others) {
                const dx = e.x - cell.x, dy = e.y - cell.y;
                if (dx*dx + dy*dy < (cell.size + e.size) ** 2 * 4) {
                    if (cell.size >= e.size * EAT_RATIO) ce.push({ x: e.x, y: e.y, r: e.size });
                    else cn.push({ x: e.x, y: e.y, r: e.size });
                }
            }
            drawAmoeba(cell.x, cell.y, cell.size, myColor || '#fff',
                cell.velX || 0, cell.velY || 0, cell.phase || 0, cn, ce, animT);
            drawLabel(cell.x, cell.y, cell.size, myUsername || '(you)', Math.floor(cell.size));
        }

        const splittingIdsList = [...splitAnim.splittingIds];
        for (let k = 0; k < splitAnim.splittingCells.length; k++) {
            const sc       = splitAnim.splittingCells[k];
            const nA       = allNew[k];
            const origCell = myLocals.get(splittingIdsList[k]);
            const animCx   = (nA && origCell) ? (nA.x + origCell.x) / 2 : sc.cx;
            const animCy   = (nA && origCell) ? (nA.y + origCell.y) / 2 : sc.cy;

            const SPLIT_PHASE = 0.62;
            if (s < SPLIT_PHASE) {
                drawFissionShape(animCx, animCy, sc.size, myColor || '#fff', sc.dir, s);
                drawLabel(animCx, animCy, sc.size, myUsername || '(you)', Math.floor(sc.size));
            } else {
                const emerge = (s - SPLIT_PHASE) / (1 - SPLIT_PHASE);
                if (origCell) {
                    drawAmoeba(origCell.x, origCell.y, origCell.size, myColor || '#fff',
                        origCell.velX||0, origCell.velY||0, origCell.phase||0, [], myEatableFood, animT);
                }
                if (nA) {
                    const rA = nA.size * emerge;
                    if (rA > 1) drawAmoeba(nA.x, nA.y, rA, myColor || '#fff', nA.velX||0, nA.velY||0, nA.phase||0, [], myEatableFood, animT);
                }
                drawLabel(animCx, animCy, sc.size * 0.5, myUsername || '(you)', Math.floor(sc.size * 0.5));
            }
        }

    } else if (mergeAnim && now - mergeAnim.startedAt < mergeAnim.duration) {
        const s = (now - mergeAnim.startedAt) / mergeAnim.duration;

        let mergedCell = null;
        for (const [id, cell] of myLocals) {
            if (!mergeAnim.preMergeIds.has(id)) { mergedCell = cell; break; }
        }

        for (const [id, cell] of myLocals) {
            if (!mergeAnim.preMergeIds.has(id)) continue;
            if (mergeAnim.mergeIds.has(id)) continue;
            const cn = [], ce = [...myEatableFood];
            for (const e of others) {
                const dx = e.x - cell.x, dy = e.y - cell.y;
                if (dx*dx + dy*dy < (cell.size + e.size) ** 2 * 4) {
                    if (cell.size >= e.size * EAT_RATIO) ce.push({ x: e.x, y: e.y, r: e.size });
                    else cn.push({ x: e.x, y: e.y, r: e.size });
                }
            }
            drawAmoeba(cell.x, cell.y, cell.size, myColor || '#fff',
                cell.velX || 0, cell.velY || 0, cell.phase || 0, cn, ce, animT);
        }

        const MERGE_APPROACH = 0.5;
        const MERGE_EMERGE   = 0.42;
        if (s < MERGE_APPROACH) {
            const t = s / MERGE_APPROACH;
            for (const pair of mergeAnim.pairs) {
                const targetX = mergedCell ? mergedCell.x : (pair.ax + pair.bx) / 2;
                const targetY = mergedCell ? mergedCell.y : (pair.ay + pair.by) / 2;
                const curAx = pair.ax + (targetX - pair.ax) * t, curAy = pair.ay + (targetY - pair.ay) * t;
                const curBx = pair.bx + (targetX - pair.bx) * t, curBy = pair.by + (targetY - pair.by) * t;
                const rA = pair.aSize * (1 - t), rB = pair.bSize * (1 - t);
                if (rA > 0.5) drawAmoeba(curAx, curAy, rA, myColor || '#fff', 0, 0, 0, [], [], animT);
                if (rB > 0.5) drawAmoeba(curBx, curBy, rB, myColor || '#fff', 0, 0, 0, [], [], animT);
            }
        }

        if (s >= MERGE_EMERGE && mergedCell) {
            const emerge = (s - MERGE_EMERGE) / (1 - MERGE_EMERGE);
            const r = mergedCell.size * emerge;
            if (r > 0.5) {
                drawAmoeba(mergedCell.x, mergedCell.y, r, myColor || '#fff',
                    mergedCell.velX||0, mergedCell.velY||0, mergedCell.phase||0, [], myEatableFood, animT);
                drawLabel(mergedCell.x, mergedCell.y, r, myUsername || '(you)', Math.floor(mergedCell.size));
            }
        }

    } else {
        splitAnim = null; mergeAnim = null;
        // ... normal cell render (already in file) ...
    }
*/


// ─────────────────────────────────────────────────────────────────
//  SERVER.JS — SERVER SIDE
// ─────────────────────────────────────────────────────────────────

// ── WHERE IT GOES: inside the AG config object ───────────────────
//     SPLIT_MIN:  20,
//     SHOOT_DECAY: 0.88,

// ── WHERE IT GOES: agNewCell return value ────────────────────────
//     velX: 0, velY: 0, shootX: 0, shootY: 0,
//     ...
//     splitBoost: false

// ── WHERE IT GOES: top of agMovePlayers cell loop, before normal movement ─
/*
    // While sliding from a split, coast on shoot boost only — skip mouse movement
    if (cell.shootX || cell.shootY) {
        cell.x = Math.max(0, Math.min(AG.WORLD_W, cell.x + cell.shootX));
        cell.y = Math.max(0, Math.min(AG.WORLD_H, cell.y + cell.shootY));
        cell.velX = cell.shootX; cell.velY = cell.shootY;
        cell.shootX *= AG.SHOOT_DECAY; cell.shootY *= AG.SHOOT_DECAY;
        if (Math.abs(cell.shootX) < 0.1 && Math.abs(cell.shootY) < 0.1) {
            cell.shootX = cell.shootY = 0; cell.splitBoost = false;
        }
        continue;
    }
*/

// ── WHERE IT GOES: mapPlayer cell projection (tick + init) ───────
//     splitBoost: c.splitBoost

// ── WHERE IT GOES: inside io.of('/amoeba').on('connection') ──────
socket.on('split', () => {
    const p = agPlayers.get(socket.id);
    if (!p) return;
    const next = [];
    for (const cell of p.cells) {
        if (cell.size < AG.SPLIT_MIN) { next.push(cell); continue; }
        const half = cell.size / 2;
        const mdx  = p.mouseX - cell.x, mdy = p.mouseY - cell.y;
        const mag  = Math.hypot(mdx, mdy) || 1;
        const px   = mdx / mag, py = mdy / mag;
        const spd  = agSpeed(half);
        const shootSpd = spd * 8;
        cell.size = half; cell.speed = spd; cell.splitBoost = false;
        next.push(cell);
        next.push({
            id: agId(), size: half, speed: spd,
            x: cell.x, y: cell.y,
            velX: 0, velY: 0,
            shootX: px * shootSpd, shootY: py * shootSpd,
            phase: cell.phase, splitBoost: true
        });
    }
    p.cells = next;
});

socket.on('merge', () => {
    const p = agPlayers.get(socket.id);
    if (!p || p.cells.length < 2) return;
    let changed = true;
    while (changed && p.cells.length > 1) {
        changed = false;
        outer: for (let i = 0; i < p.cells.length; i++) {
            for (let j = i + 1; j < p.cells.length; j++) {
                const a = p.cells[i], b = p.cells[j];
                const dx = a.x - b.x, dy = a.y - b.y;
                if (Math.hypot(dx, dy) < (a.size + b.size) * 1.2) {
                    a.size += b.size; a.speed = agSpeed(a.size);
                    a.x = (a.x + b.x) / 2; a.y = (a.y + b.y) / 2;
                    a.velX = 0; a.velY = 0; a.splitBoost = false;
                    p.cells.splice(j, 1);
                    changed = true; break outer;
                }
            }
        }
    }
    for (const cell of p.cells) cell.splitBoost = false;
});
