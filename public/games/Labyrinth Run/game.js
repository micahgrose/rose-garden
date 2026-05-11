'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   LABYRINTH RUN — game.js
   Raycasted 3-D maze game, Egyptian sandstone aesthetic
   ══════════════════════════════════════════════════════════════════════════ */

// ══════════════════════════════════════════════════════════════════════════
// SECTION 1 — Constants & Config
// ══════════════════════════════════════════════════════════════════════════

const CELL_SIZE             = 1;
const MOVE_SPEED            = 0.8;
const RUN_SPEED             = 1.5;
const STAMINA_MAX           = 100;
const STAMINA_DRAIN         = 30;
const STAMINA_REGEN_NORMAL  = 15;
const STAMINA_REGEN_PENALTY = 5;
const BATTERY_MAX           = 100;
const BATTERY_DRAIN         = 6.0;
const BATTERY_PICKUP_AMOUNT = 40;
const FLASHLIGHT_RADIUS_FULL = 0.175;
const FLASHLIGHT_REACH       = 4;   // world units before walls fade to black
const SIDE_SHADE_MULT        = 0.85; // east/west faces are this much darker than north/south faces
const MOUSE_SENSITIVITY     = 0.00075;
const FOV                   = Math.PI * 90 / 180;
const TEXTURE_SIZE          = 128;
const CELL_SCALE            = 1; // each maze cell = 1 world unit (wide corridors)
const LAB_SIZES             = [11, 15, 19];
const NUM_BATTERIES_PER_LAB = [1, 1, 2];
const MAX_LABYRINTHS        = 3;

// ══════════════════════════════════════════════════════════════════════════
// SECTION 2 — Texture Generation
// ══════════════════════════════════════════════════════════════════════════

/**
 * Generate a sandstone brick texture (64×64 ImageData).
 * Sandy base with mortar lines, pixel noise, and brick-level variation.
 */
function generateSandstoneTexture() {
    const size   = TEXTURE_SIZE; // 128
    const img    = new ImageData(size, size);
    const d      = img.data;

    const BRICK_H = 32; // tall bricks for large-brick look
    const MORTAR  = 1;
    const HALF_W  = 32; // wide bricks (BRICK_W=64, stagger by 32)

    const BASE_R = 200, BASE_G = 165, BASE_B = 90;
    const MRT_R  = 160,  MRT_G = 132,  MRT_B = 70; // mortar close to sandstone

    // Hieroglyph bitmaps (14×14 pixel art, 1 = dark carved stroke)
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
    ];

    // Only 2 bricks out of 16 get hieroglyphs (sparse)
    const HIERO_MAP = { 3: 0, 10: 1 };

    const brickNoise = [];
    for (let i = 0; i < 64; i++) brickNoise.push((Math.random() - 0.5) * 32);

    for (let y = 0; y < size; y++) {
        const row    = Math.floor(y / BRICK_H);
        const rowY   = y % BRICK_H;
        const mortar = rowY < MORTAR;
        const offset = (row % 2 === 0) ? 0 : HALF_W;

        for (let x = 0; x < size; x++) {
            const shifted  = (x + offset) & (size - 1);
            const col      = Math.floor(shifted / HALF_W);
            const colX     = shifted % HALF_W;
            const isMortar = mortar || colX < MORTAR;

            const idx = (y * size + x) * 4;

            if (isMortar) {
                d[idx] = MRT_R; d[idx+1] = MRT_G; d[idx+2] = MRT_B; d[idx+3] = 255;
            } else {
                const bIdx  = (row * 4 + col) % brickNoise.length;
                const bDark = brickNoise[bIdx];
                // Two-frequency noise for more realistic stone surface
                const noise1 = (Math.random() - 0.5) * 28;
                const noise2 = (Math.random() - 0.5) * 10;
                const noise  = noise1 + noise2;
                let r = Math.min(255, Math.max(0, BASE_R + bDark + noise));
                let g = Math.min(255, Math.max(0, BASE_G + bDark * 0.82 + noise * 0.82));
                let b = Math.min(255, Math.max(0, BASE_B + bDark * 0.52 + noise * 0.52));

                // Fine surface grain
                const grain = (Math.random() - 0.5) * 6;
                r = Math.min(255, Math.max(0, r + grain));
                g = Math.min(255, Math.max(0, g + grain * 0.8));
                b = Math.min(255, Math.max(0, b + grain * 0.4));

                // Stamp hieroglyph pattern if this brick is mapped
                const brickId = row * 4 + col;
                if (HIERO_MAP[brickId] !== undefined) {
                    const hPat    = HIEROGLYPHS[HIERO_MAP[brickId]];
                    const localX  = colX - MORTAR;
                    const localY  = rowY - MORTAR;
                    const contentW = HALF_W - MORTAR; // 31
                    const contentH = BRICK_H - MORTAR; // 31
                    const ox = Math.floor((contentW - 14) / 2); // 8
                    const oy = Math.floor((contentH - 14) / 2); // 8
                    const px = localX - ox;
                    const py = localY - oy;
                    if (px >= 0 && px < 14 && py >= 0 && py < 14 && hPat[py] && hPat[py][px]) {
                        r = Math.floor(r * 0.25);
                        g = Math.floor(g * 0.25);
                        b = Math.floor(b * 0.25);
                    }
                }

                d[idx] = r; d[idx+1] = g; d[idx+2] = b; d[idx+3] = 255;
            }
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

    // Precompute grain lines (varying widths and lightness offsets)
    const grainLines = [];
    for (let x = 0; x < size; x++) {
        const v = Math.sin(x * 0.47 + Math.random() * 0.5) * 12 + (Math.random() - 0.5) * 6;
        grainLines.push(v);
    }

    const BORDER = 3; // metal border width

    for (let y = 0; y < size; y++) {
        const panelLine = (y === Math.floor(size / 3) || y === Math.floor(2 * size / 3));
        const isBorderY = y < BORDER || y >= size - BORDER;

        for (let x = 0; x < size; x++) {
            const isBorderX = x < BORDER || x >= size - BORDER;
            const isBorder  = isBorderX || isBorderY;
            const idx = (y * size + x) * 4;

            if (isBorder) {
                // Dark grey metal border
                d[idx] = 38; d[idx+1] = 38; d[idx+2] = 42; d[idx+3] = 255;
            } else if (panelLine) {
                // Horizontal panel divider - slightly lighter
                d[idx] = 55; d[idx+1] = 32; d[idx+2] = 10; d[idx+3] = 255;
            } else {
                // Wood grain
                const grain = grainLines[x];
                const noise = (Math.random() - 0.5) * 8;
                const r = Math.min(255, Math.max(0, 45 + grain * 0.4 + noise));
                const g = Math.min(255, Math.max(0, 26 + grain * 0.25 + noise * 0.6));
                const b = Math.min(255, Math.max(0, 10 + grain * 0.1 + noise * 0.3));
                d[idx] = r; d[idx+1] = g; d[idx+2] = b; d[idx+3] = 255;
            }
        }
    }
    return img;
}

// Generate textures once at startup
const sandstoneImg = generateSandstoneTexture();
const doorImg      = generateDoorTexture();

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
    const size = LAB_SIZES[labIndex];
    const grid = generateMaze(size, size);

    // Door at cell furthest from start (1,1)
    const door = bfsFurthest(grid, 1, 1);
    // Make sure door isn't right at start
    if (door.x === 1 && door.y === 1) {
        // Fallback: pick a corner cell that is open
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
    const numBat = NUM_BATTERIES_PER_LAB[labIndex];
    const batteries = [];
    const openCells = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (grid[y][x] === 0 && !(x === 1 && y === 1)) {
                openCells.push({ x, y });
            }
        }
    }
    // Shuffle and pick cells that are reasonably far from start
    openCells.sort(() => Math.random() - 0.5);
    let placed = 0;
    for (const cell of openCells) {
        const dist = Math.abs(cell.x - 1) + Math.abs(cell.y - 1);
        if (dist >= 4 && placed < numBat) {
            batteries.push({ x: cell.x, y: cell.y, active: true });
            placed++;
        }
    }
    // If not enough far cells, just take whatever is open
    if (placed < numBat) {
        for (const cell of openCells) {
            if (placed >= numBat) break;
            if (!batteries.find(b => b.x === cell.x && b.y === cell.y)) {
                batteries.push({ x: cell.x, y: cell.y, active: true });
                placed++;
            }
        }
    }

    return { grid, batteries, doorX: door.x, doorY: door.y };
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
    const horizon = Math.round(halfH + pitch); // shifted by vertical look

    // ── Fill ceiling & floor (distance-based gradient) ───────
    for (let y = 0; y < H; y++) {
        const isCeiling      = y < horizon;
        const distFromCenter = Math.abs(y - horizon);
        const rowDist        = distFromCenter > 0 ? (0.5 * H / distFromCenter) : 99999;
        const shade          = Math.max(0, 1 - rowDist / 3);
        let r, g, b;
        if (isCeiling) {
            r = Math.floor(shade * 9);
            g = Math.floor(shade * 6);
            b = Math.floor(shade * 2);
        } else {
            r = Math.floor(shade * 22 + 3);
            g = Math.floor(shade * 15 + 2);
            b = Math.floor(shade * 6  + 1);
        }
        for (let x = 0; x < W; x++) {
            setPixel(x, y, r, g, b);
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
        const distFactor = Math.max(0, 1 - perpWallDist / FLASHLIGHT_REACH);
        // Side darkening: y-side walls are 30% darker
        const sideMult = side === 1 ? SIDE_SHADE_MULT : 1.0;

        const isDoor = cellVal === 2;
        // Doors are less dark than walls so they stand out
        const darkMult = isDoor ? 0.55 : 0.25;

        // Door opening covers middle 65% of the wall column; top/bottom 17.5% = stone frame
        const DOOR_GAP_FRAC = 0.175;

        // Draw wall column pixel by pixel
        const step = TEXTURE_SIZE / lineH;
        let texPos = (drawStart - horizon + (lineH >> 1)) * step;

        for (let y = drawStart; y <= drawEnd; y++) {
            const texY = Math.floor(texPos) & (TEXTURE_SIZE - 1);
            texPos += step;

            // For door cells: top/bottom fringe uses sandstone (embedded look)
            let useTexImg = texImg;
            if (isDoor) {
                const wallFrac = drawEnd > drawStart ? (y - drawStart) / (drawEnd - drawStart) : 0.5;
                if (wallFrac < DOOR_GAP_FRAC || wallFrac > 1 - DOOR_GAP_FRAC) {
                    useTexImg = sandstoneImg;
                }
            }

            let r, g, b;
            if (useTexImg === doorImg) {
                const i = (texY * TEXTURE_SIZE + texX) * 4;
                r = useTexImg.data[i];
                g = useTexImg.data[i + 1];
                b = useTexImg.data[i + 2];
            } else {
                // Flat sandstone colour — no texture
                r = 200; g = 165; b = 90;
            }

            // Global darkness + distance + side darkening
            const bright = distFactor * sideMult * darkMult;
            r = Math.floor(r * bright);
            g = Math.floor(g * bright);
            b = Math.floor(b * bright);

            // Orange-amber tint on all surfaces
            g = Math.floor(g * 0.85);
            b = Math.floor(b * 0.65);

            // Door glow: warm amber additive tint
            if (isDoor) {
                const glowStrength = 0.9 * distFactor;
                r = Math.min(255, r + Math.floor(212 * glowStrength));
                g = Math.min(255, g + Math.floor(136 * glowStrength));
                b = Math.min(255, b + Math.floor(34  * glowStrength));
            }

            setPixel(screenX, y, r, g, b);
        }
    }

    // ── Write pixel buffer to canvas ─────────────────────────
    ctx.putImageData(imgBuffer, 0, 0);

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

        // Draw a small green glow gradient
        const glowR = Math.max(4, spriteH / 4);
        const alpha = Math.min(0.5, 1 / (dist * 0.5));
        const grd = ctx.createRadialGradient(
            spriteScreenX, drawY + spriteH / 2, 0,
            spriteScreenX, drawY + spriteH / 2, glowR
        );
        grd.addColorStop(0,   `rgba(80, 220, 100, ${alpha})`);
        grd.addColorStop(0.4, `rgba(50, 180, 70,  ${alpha * 0.4})`);
        grd.addColorStop(1,   'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(spriteScreenX, drawY + spriteH / 2, glowR * 1.5, glowR, 0, 0, Math.PI * 2);
        ctx.fill();
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
        // Chance per second: ~1% at full battery, ~55% at empty
        const chance = (0.01 + 0.54 * (1 - batteryPct)) * dt;
        if (Math.random() < chance) {
            flickerMult  = Math.random() < 0.25 ? 0 : Math.random() * 0.2;
            flickerTimer = 0.04 + Math.random() * 0.13; // 40–170 ms flicker
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

    const outerR = maxDim * 0.88;
    const beamR  = maxDim * FLASHLIGHT_RADIUS_FULL * effectivePct;
    const edgeDark = Math.min(0.999, 0.97 + 0.028 * (1 - batteryPct));

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
    battery: BATTERY_MAX
};

/** Reset player position & state for a new run */
function resetPlayer() {
    player.x = 1.5 * CELL_SCALE; player.y = 1.5 * CELL_SCALE;
    player.dirX = 1; player.dirY = 0;
    player.planeX = 0; player.planeY = PLANE_LEN;
    player.stamina = STAMINA_MAX;
    player.staminaPenalty = false;
    player.battery = BATTERY_MAX;
    pitch = 0;
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
    const wantsRun = keys.shift && player.stamina > 0 && !player.staminaPenalty;
    const speed = wantsRun ? RUN_SPEED : MOVE_SPEED;

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

    const MARGIN = 0.38 * CELL_SCALE;

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

    // ── Battery drain ────────────────────────────────────────
    player.battery = Math.max(0, player.battery - BATTERY_DRAIN * dt);

    // ── Battery pickup (E key) ───────────────────────────────
    if (eJustPressed) {
        eJustPressed = false;
        for (const bat of batteries) {
            if (!bat.active) continue;
            const bx = (bat.x + 0.5) * CELL_SCALE, by = (bat.y + 0.5) * CELL_SCALE;
            const dist = Math.sqrt((bx - player.x) ** 2 + (by - player.y) ** 2);
            if (dist <= 1.2 * CELL_SCALE) {
                bat.active = false;
                player.battery = Math.min(BATTERY_MAX, player.battery + BATTERY_PICKUP_AMOUNT);
                break;
            }
        }
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

function updateHUD(labNum, elapsedSec) {
    // Labyrinth label
    labyrinthLabel.textContent = `LABYRINTH ${labNum} / ${MAX_LABYRINTHS}`;

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
    const batPct = player.battery / BATTERY_MAX;
    batteryBar.style.width = (batPct * 100).toFixed(1) + '%';
    if (batPct < 0.25) {
        batteryBar.classList.add('low');
    } else {
        batteryBar.classList.remove('low');
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
// SECTION 8 — Ambient Sound
// ══════════════════════════════════════════════════════════════════════════

let ambientStarted = false;
let ambientGain    = null;

function createAmbientSound() {
    if (ambientStarted) return;
    ambientStarted = true;

    try {
        const audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = audioCtx.sampleRate * 2;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data   = buffer.getChannelData(0);
        let lastOut  = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            data[i]  = (lastOut + 0.02 * white) / 1.02;
            lastOut  = data[i];
            data[i] *= 3.5;
        }
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.loop   = true;
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.04;
        ambientGain = gainNode;
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        source.start();
    } catch (err) {
        console.warn('Audio failed:', err);
    }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 9 — Game State Machine
// ══════════════════════════════════════════════════════════════════════════

let gameState = 'menu'; // 'menu' | 'controls' | 'playing' | 'summary'

// DOM references
const menuEl          = document.getElementById('menu');
const controlsScreen  = document.getElementById('controlsScreen');
const summaryScreen   = document.getElementById('summaryScreen');
const summaryTitle    = document.getElementById('summaryTitle');
const summaryBody     = document.getElementById('summaryBody');
const summaryTotalEl  = document.getElementById('summaryTotalTime');
const controlsBtn     = document.getElementById('controlsBtn');
const enterBtn        = document.getElementById('enterBtn');
const controlsBackBtn = document.getElementById('controlsBackBtn');
const playAgainBtn    = document.getElementById('summaryPlayAgain');
const menuBtn         = document.getElementById('summaryMenu');

function showMenu() {
    gameState = 'menu';
    menuEl.classList.remove('hidden');
    controlsScreen.classList.add('hidden');
    canvas.classList.add('hidden');
    hudEl.classList.add('hidden');
    summaryScreen.classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    loadStats();
}

function showControls() {
    gameState = 'controls';
    menuEl.classList.add('hidden');
    controlsScreen.classList.remove('hidden');
}

function showGame() {
    gameState = 'playing';
    menuEl.classList.add('hidden');
    controlsScreen.classList.add('hidden');
    canvas.classList.remove('hidden');
    hudEl.classList.remove('hidden');
    summaryScreen.classList.add('hidden');
    canvas.requestPointerLock();
    createAmbientSound();
}

function showSummary(lapTimes, quit) {
    gameState = 'summary';
    canvas.classList.add('hidden');
    hudEl.classList.add('hidden');
    summaryScreen.classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();

    summaryTitle.textContent  = quit ? 'RUN ABANDONED' : 'RUN COMPLETE';
    summaryTitle.className    = quit ? 'quit' : '';

    // Build table rows
    summaryBody.innerHTML = '';
    let totalTime = 0;
    for (let i = 0; i < MAX_LABYRINTHS; i++) {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        const td2 = document.createElement('td');
        td1.textContent = `Labyrinth ${i + 1}`;
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

    summaryTotalEl.textContent = quit ? '—' : formatTime(totalTime);
}

// ── Button wiring ────────────────────────────────────────────
controlsBtn.addEventListener('click', showControls);
controlsBackBtn.addEventListener('click', showMenu);
enterBtn.addEventListener('click', startRun);
playAgainBtn.addEventListener('click', startRun);
menuBtn.addEventListener('click', showMenu);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 10 — Run Logic
// ══════════════════════════════════════════════════════════════════════════

let currentLab   = 0; // 0-based index
let lapTimes     = [null, null, null];
let lapStart     = 0;  // performance.now() at start of current lap
let runStart     = 0;  // performance.now() at start of run
let currentGrid  = null;
let currentBats  = [];
let doorX = 0, doorY = 0;
let lastFrameTime = 0;
let animFrameId   = 0;
let runActive     = false;

function startRun() {
    currentLab  = 0;
    lapTimes    = [null, null, null];
    runStart    = performance.now();
    lapStart    = runStart;

    resetPlayer();
    resetFlicker();
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
    doorX = level.doorX;
    doorY = level.doorY;

    // Reset player to start position
    player.x = 1.5 * CELL_SCALE; player.y = 1.5 * CELL_SCALE;
    player.battery = BATTERY_MAX;
}

function gameLoop(now) {
    if (!runActive) return;
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1); // cap at 100ms
    lastFrameTime = now;

    const elapsed = (now - lapStart) / 1000;

    // Update player
    updatePlayer(dt, currentGrid, currentBats);

    // Update flashlight flicker
    updateFlicker(dt, player.battery / BATTERY_MAX);

    // Render
    renderScene(currentGrid, player, currentBats);
    drawFlashlight(player.battery / BATTERY_MAX);

    // HUD
    updateHUD(currentLab + 1, elapsed);

    // Check door
    if (isOnDoor(doorX, doorY)) {
        advanceLab(elapsed);
        return;
    }

    animFrameId = requestAnimationFrame(gameLoop);
}

function advanceLab(lapTime) {
    lapTimes[currentLab] = lapTime;
    currentLab++;

    if (currentLab >= MAX_LABYRINTHS) {
        // Run complete
        runActive = false;
        cancelAnimationFrame(animFrameId);
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
    const elapsed = (performance.now() - lapStart) / 1000;
    // Current lab time is partial — leave as null (abandoned)
    const partialTimes = [...lapTimes];
    const total = partialTimes.reduce((s, t) => s + (t || 0), 0) + elapsed;
    saveStats({ completed: false, quit: true, lap_times: partialTimes, total_time: total });
    showSummary(partialTimes, true);
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
        const res = await fetch('/api/stats/labyrinth', {
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
    const best = stats.best_total_time != null ? formatTime(stats.best_total_time) : '—';
    const fpl  = stats.fastest_per_lab || [null, null, null];
    const rows = [
        ['Runs Completed',  stats.total_runs  ?? 0],
        ['Runs Quit',       stats.total_quits ?? 0],
        ['Best Total Time', best],
        ['Fastest Lab 1',   fpl[0] != null ? formatTime(fpl[0]) : '—'],
        ['Fastest Lab 2',   fpl[1] != null ? formatTime(fpl[1]) : '—'],
        ['Fastest Lab 3',   fpl[2] != null ? formatTime(fpl[2]) : '—'],
    ];
    statsContent.innerHTML = rows.map(([label, val]) =>
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
            body: JSON.stringify(runData)
        });
    } catch (err) {
        console.warn('Failed to save stats:', err);
    }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 12 — Init
// ══════════════════════════════════════════════════════════════════════════

resizeCanvas();
showMenu();
