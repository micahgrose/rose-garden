const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width  = window.innerWidth;
canvas.height = window.innerHeight;

// ── Classes ────────────────────────────────────────────
class Player {
    constructor(x, y){
        this.x = x; this.y = y;
        this.width = 50; this.height = 50;
        this.velocity = {x: 0, y: 0};
        this.stretchTarget = {width: 45, height: 60};
        this.stretchSpeed  = 0.2;
        this.eyeSize       = {width:10, height:15};
        this.eyePaddingR   = {x: 10, y: 10};
        this.eyePaddingL   = {x: 30, y: 10};
        this.pupilSize     = {width:5, height:5};
        this.pupilPadding  = {x: 2.5, y: 5};
    }
}

class Platform {
    constructor(x, y, width, height){
        this.x = x; this.y = y; this.width = width; this.height = height;
    }
}

class JumpPad {
    constructor(x, y, strength = 25){
        this.x = x; this.y = y;
        this.width = 50; this.height = 10;
        this.strength = strength;
        this.animate = false;
        this.stickHeight = 20;
        this.stickTargetHeight = 30;
        this.targetY = y - 10;
        this.speed = 0.9;
    }
}

class PlatformParticle {
    constructor(classifier){
        this.x = player.x + (Math.random()*(player.height + 15) - 7.5);
        this.y = player.y + player.height;
        this.size = Math.random()*5+5;
        this.direction = (this.x > player.x + player.width/2) ? 1 : -1;
        this.classifier = classifier;
        this.lifeSpan = Math.random()*300 + 200;
        this.dead = false;
    }
}

class BoostParticle {
    constructor(classifier){
        this.x = player.x + player.width + (Math.random()*10)-5;
        this.y = player.y + player.height + (Math.random()*10)-5;
        this.size = Math.random() * 5 + 5;
        this.speed = Math.random() *2 + 1;
        this.direction = Math.sign(player.velocity.x);
        this.classifier = classifier;
        this.lifeSpan = Math.random()*1500+500;
        this.dead = false;
        this.rising = true;
    }
}

class JumpParticle {
    constructor(classifier){
        this.x = player.x + Math.random()*player.width;
        this.y = player.y + player.height;
        this.size = Math.random()* 5 + 5;
        this.velocity = {x: Math.random()*3, y: (Math.random()*-7.5) - 12.5};
        this.gravity = 0.5;
        this.direction = (this.x > player.x + player.width/2) ? 1 : -1;
        this.classifier = classifier;
        this.lifeSpan = Math.random()*900 + 500;
        this.dead = false;
    }
}

// ── Game variables ─────────────────────────────────────
let startPos  = null;
let player    = null;
let platforms = [];
let jumpPads  = [];
let currentLevelOrder = null;

let gravity       = 0.5;
const gravityMult = 1.065;
const gravityFloor = 5;

let speed          = 5;
const jumpStrength = 15;
const maxVelocity  = {x: 10, y: 30};
const friction     = 0.85;

let grounded    = false;
let wasGrounded = [false, false, false, false];
let clampLeft   = false;
let clampRight  = false;
let ceiling     = false;
let jumped      = false;

const world      = {width:5000, height:5000};
const camera     = {x:0, y:0, width:canvas.width, height:canvas.height};
const cameraSpeed = 0.075;

let platformParticles       = [];
const platformParticleCount = 50;
let boostParticles          = [];
const boostParticleCount    = 50;
let boosting                = false;
const boostResetTime        = 500;
let boostReady              = true;
let doBoostParticle         = false;
let jumpParticles           = [];
const jumpParticleCount     = 20;
let jumpHit                 = false;
let classifiersInUse        = { platform: [], boost: [], jump: [] };

// ── Progress / Auth ────────────────────────────────────
let authToken        = localStorage.getItem('rg_token') || null;
let isAdmin          = false;
let completedOrders  = [];
let allLevels        = [];

async function loadLevels() {
    try {
        const r = await fetch('/api/ollie/levels');
        allLevels = await r.json();
    } catch { allLevels = []; }
}

async function loadProgress() {
    if (!authToken) { completedOrders = []; return; }
    try {
        const r = await fetch('/api/ollie/progress', { headers: { Authorization: `Bearer ${authToken}` } });
        const d = await r.json();
        completedOrders = d.completedOrders || [];
    } catch { completedOrders = []; }
}

async function markLevelComplete(order) {
    if (!authToken) return;
    completedOrders.push(order);
    try {
        await fetch(`/api/ollie/progress/${order}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${authToken}` }
        });
    } catch {}
}

async function checkAdmin() {
    if (!authToken) return;
    try {
        const r = await fetch('/api/ollie/admin-check', { headers: { Authorization: `Bearer ${authToken}` } });
        const d = await r.json();
        isAdmin = d.isAdmin === true;
        if (isAdmin) document.getElementById('editorBtn').classList.remove('hidden');
    } catch {}
}

// ── Game loop ──────────────────────────────────────────
function gameLoop(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    movePlayer();
    moveCamera();

    wasGrounded[3] = wasGrounded[2];
    wasGrounded[2] = wasGrounded[1];
    wasGrounded[1] = wasGrounded[0];
    wasGrounded[0] = grounded;

    checkJumpPad();
    checkCollision();
    updateStretch();
    updateEyePos();

    if(grounded){ resetGravity(); jumped = false; }
    if(ceiling){ player.velocity.y = 0; }

    drawBackground();
    handleParticles();
    drawPlayer();
    drawPlatforms();
    drawJumpPads();

    animFrameId = requestAnimationFrame(gameLoop);
}

// ── Input ──────────────────────────────────────────────
let keys = [];
document.addEventListener("keydown", e => { if(!keys.includes(e.key)) keys.push(e.key); });
document.addEventListener("keyup",   e => { keys = keys.filter(k => k !== e.key); });

// ── Movement ───────────────────────────────────────────
function movePlayer(){
    GORIGHT: if(keys.includes("ArrowRight") || keys.includes("d")){
        player.pupilPadding.x = 5;
        player.eyePaddingR.x  = 15;
        player.eyePaddingL.x  = 35;
        if(clampRight) break GORIGHT;
        player.velocity.x += speed;
    }
    GOLEFT: if(keys.includes("ArrowLeft") || keys.includes("a")){
        player.pupilPadding.x = 0;
        player.eyePaddingR.x  = 5;
        player.eyePaddingL.x  = 25;
        if(clampLeft) break GOLEFT;
        player.velocity.x -= speed;
    }

    if((keys.includes("ArrowUp") || keys.includes("w")) && (grounded || wasGrounded.includes(true))){
        player.velocity.y = -jumpStrength;
        jumped = true;
    } else if(!keys.includes("ArrowUp") && !keys.includes("w") && !grounded && player.velocity.y < 0 && jumped){
        player.velocity.y *= 0.9;
    }

    if(!grounded){
        player.velocity.y += gravity;
        if(gravity < gravityFloor){ gravity *= gravityMult; } else { gravity = gravityFloor; }
    }

    if(player.velocity.y > maxVelocity.y)  player.velocity.y = maxVelocity.y;
    if(player.velocity.x > maxVelocity.x)  player.velocity.x = maxVelocity.x;
    if(player.velocity.x < -maxVelocity.x) player.velocity.x = -maxVelocity.x;

    if(!boosting) player.velocity.x *= friction;

    if(keys.includes(" ") && (keys.includes("ArrowRight") || keys.includes("d") || keys.includes("ArrowLeft") || keys.includes("a")) && !boosting && boostReady){
        if(clampRight && (keys.includes("ArrowRight") || keys.includes("d"))) return;
        if(clampLeft  && (keys.includes("ArrowLeft")  || keys.includes("a"))) return;
        maxVelocity.x = 30;
        player.velocity.x *= 1.75;
        boosting = true;
        boostReady = false;
        doBoostParticle = true;
        setTimeout(() => {
            maxVelocity.x = 10;
            boosting = false;
            setTimeout(() => { boostReady = true; }, boostResetTime);
        }, 150);
    }

    player.x += player.velocity.x;
    player.y += player.velocity.y;

    if(player.y > world.height + 500){
        player.x = startPos.x;
        player.y = startPos.y;
        player.velocity = {x:0, y:0};
        gravity = 0.5;
        speed   = 5;
    }
}

// ── Camera ─────────────────────────────────────────────
function moveCamera(){
    const cx = player.x + player.width  / 2;
    const cy = player.y + player.height / 2;
    const tx = cx - camera.width  / 2;
    const ty = Math.max(0, Math.min(world.height - camera.height, cy - camera.height / 2));
    camera.x += (tx - camera.x) * cameraSpeed;
    camera.y += (ty - camera.y) * cameraSpeed;
}

// ── Collision ──────────────────────────────────────────
function checkCollision(){
    grounded = false; clampLeft = false; clampRight = false; ceiling = false;

    for(let platform of platforms){
        if(player.x + player.width <= platform.x || player.x >= platform.x + platform.width) continue;
        if(player.y + player.height <= platform.y || player.y >= platform.y + platform.height) continue;

        const overlapX = Math.min(player.x + player.width - platform.x, platform.x + platform.width - player.x);
        const overlapY = Math.min(player.y + player.height - platform.y, platform.y + platform.height - player.y);

        if(overlapX > overlapY){
            if(player.y + player.height/2 < platform.y + platform.height/2){
                player.y -= overlapY; grounded = true;
            } else {
                player.y += overlapY; ceiling = true;
            }
        } else {
            if(player.x + player.width/2 < platform.x + platform.width/2){
                player.x -= overlapX; clampRight = true;
            } else {
                player.x += overlapX; clampLeft = true;
            }
        }
    }
}

function checkJumpPad(){
    for(let pad of jumpPads){
        if(player.y + player.height >= pad.y && player.y < pad.y + pad.height){
            if(player.x + player.width > pad.x && player.x < pad.x + pad.width){
                resetGravity();
                jumped = false;
                pad.animate = true;
                player.velocity.y = -pad.strength;
                player.y = pad.y - player.height;
                jumpHit = true;
                return true;
            }
        }
    }
    return false;
}

// ── Drawing ────────────────────────────────────────────
const backgroundRects = [];
function createBackground(){
    backgroundRects.length = 0;
    for(let i = 0; i < 50; i++){
        let size = Math.random() * 300 + 200;
        backgroundRects.push({ x: Math.random()*world.width, y: Math.random()*world.height, width: size, height: size });
    }
}

function drawBackground(){
    ctx.fillStyle = "rgb(130, 230, 130)";
    ctx.globalAlpha = 0.4;
    for(let rect of backgroundRects){
        let sx = rect.x - camera.x*0.5;
        let sy = rect.y - camera.y*0.5;
        ctx.save();
        ctx.translate(sx + rect.width/2, sy + rect.height/2);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-rect.width/2, -rect.height/2, rect.width, rect.height);
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}

function drawPlayer(){
    ctx.fillStyle  = "blue";
    ctx.strokeStyle = "rgb(50, 50, 200)";
    ctx.lineWidth  = 1;
    ctx.fillRect(player.x-camera.x, player.y-camera.y, player.width, player.height);
    ctx.strokeRect(player.x-camera.x, player.y-camera.y, player.width, player.height);
    ctx.fillStyle = "white";
    ctx.fillRect(player.x+player.eyePaddingR.x-camera.x, player.y+player.eyePaddingR.y-camera.y, player.eyeSize.width, player.eyeSize.height);
    ctx.fillRect(player.x+player.eyePaddingL.x-camera.x, player.y+player.eyePaddingL.y-camera.y, player.eyeSize.width, player.eyeSize.height);
    ctx.fillStyle = "black";
    ctx.fillRect(player.x+player.eyePaddingR.x+player.pupilPadding.x-camera.x, player.y+player.eyePaddingR.y+player.pupilPadding.y-camera.y, player.pupilSize.width, player.pupilSize.height);
    ctx.fillRect(player.x+player.eyePaddingL.x+player.pupilPadding.x-camera.x, player.y+player.eyePaddingL.y+player.pupilPadding.y-camera.y, player.pupilSize.width, player.pupilSize.height);
}

function updateStretch(){
    if(!grounded && !wasGrounded[0] && !wasGrounded[1]){
        player.width  += (player.stretchTarget.width  - player.width)  * player.stretchSpeed;
        player.height += (player.stretchTarget.height - player.height) * player.stretchSpeed;
    } else {
        const bottom = player.y + player.height;
        player.width  += (50 - player.width)  * player.stretchSpeed;
        player.height += (50 - player.height) * player.stretchSpeed;
        player.y = bottom - player.height;
        if(Math.abs(player.width  - 50) < 1) player.width  = 50;
        if(Math.abs(player.height - 50) < 1) player.height = 50;
    }
}

function updateEyePos(){
    let target = player.velocity.y > 0 ? 10 : player.velocity.y < 0 ? 0 : 5;
    player.pupilPadding.y += (target - player.pupilPadding.y) * 0.1;
}

function drawPlatforms(){
    ctx.fillStyle  = "gray";
    ctx.strokeStyle = "gray";
    ctx.lineWidth  = 2;
    for(let p of platforms){
        ctx.strokeRect(p.x-camera.x, p.y-camera.y, p.width, p.height);
        ctx.fillRect(p.x-camera.x,   p.y-camera.y, p.width, p.height);
    }
}

function drawJumpPads(){
    ctx.fillStyle  = "rgb(255, 246, 113)";
    ctx.strokeStyle = "rgb(57, 57, 57)";
    ctx.lineWidth  = 2;
    for(let pad of jumpPads){
        if(pad.animate){
            pad.y += (pad.targetY - pad.y) * pad.speed;
            pad.stickHeight += (pad.stickTargetHeight - pad.stickHeight) * pad.speed;
            if(Math.abs(pad.y - pad.targetY) < 1){ pad.animate = false; pad.y = pad.targetY; pad.stickHeight = pad.stickTargetHeight; }
        } else {
            pad.speed = 0.5;
            pad.y += ((pad.targetY + 10) - pad.y) * pad.speed;
            pad.stickHeight += (20 - pad.stickHeight) * pad.speed;
            if(Math.abs(pad.y - pad.targetY) < 1){ pad.y = pad.targetY + 10; pad.stickHeight = 20; pad.speed = 0.9; }
        }
        ctx.beginPath(); ctx.roundRect(pad.x-camera.x, pad.y-camera.y, pad.width, pad.height, [10]); ctx.stroke();
        ctx.strokeRect(pad.x+20-camera.x, pad.y-camera.y, 10, pad.stickHeight);
        ctx.beginPath(); ctx.roundRect(pad.x-camera.x, pad.y-camera.y, pad.width, pad.height, [10]); ctx.fill();
        ctx.fillRect(pad.x+20-camera.x, pad.y-camera.y, 10, pad.stickHeight);
    }
}

// ── Particles ──────────────────────────────────────────
function handleParticles(){
    if(!wasGrounded.includes(true) && grounded)
        makeParticles(classifiersInUse.platform, platformParticles, PlatformParticle, platformParticleCount);
    if(doBoostParticle){ makeParticles(classifiersInUse.boost, boostParticles, BoostParticle, boostParticleCount); doBoostParticle = false; }
    if(jumpHit){ makeParticles(classifiersInUse.jump, jumpParticles, JumpParticle, jumpParticleCount); jumpHit = false; }

    platformParticles = platformParticles.filter(p => !p.dead);
    boostParticles    = boostParticles.filter(p => !p.dead);
    jumpParticles     = jumpParticles.filter(p => !p.dead);

    for(let p of platformParticles){ p.x += (Math.random()*1)*p.direction; p.y -= Math.random()*0.2 + 0.1; }
    for(let p of boostParticles){ p.x -= p.speed * p.direction; p.y += p.rising ? -Math.random()*0.8 : Math.random()*0.25; }
    for(let p of jumpParticles){ p.velocity.y += p.gravity; p.x += p.velocity.x * p.direction; p.y += p.velocity.y; }

    ctx.fillStyle = 'gray'; ctx.strokeStyle = 'darkgray'; ctx.lineWidth = 1;
    for(let p of platformParticles){ ctx.strokeRect(p.x-camera.x, p.y-camera.y, p.size, p.size); ctx.fillRect(p.x-camera.x, p.y-camera.y, p.size, p.size); }

    ctx.strokeStyle = "rgb(210,210,210)"; ctx.fillStyle = "rgb(245,245,245)"; ctx.lineWidth = 2;
    for(let p of boostParticles){ ctx.strokeRect(p.x-camera.x, p.y-camera.y, p.size, p.size); ctx.fillRect(p.x-camera.x, p.y-camera.y, p.size, p.size); }

    ctx.fillStyle = 'rgb(230,221,88)';
    for(let p of jumpParticles){ ctx.fillRect(p.x-camera.x, p.y-camera.y, p.size, p.size); }
}

function makeParticles(classifierID, typeList, type, count){
    let classifier = 1;
    while(classifierID.includes(classifier)) classifier++;
    classifierID.push(classifier);
    for(let i = 0; i < count; i++) typeList.push(new type(classifier));
    let newParticles = typeList.filter(p => p.classifier === classifier);
    for(let p of newParticles){
        setTimeout(() => {
            if(type === BoostParticle) p.rising = false;
            setTimeout(() => { p.dead = true; }, p.lifeSpan/2);
        }, p.lifeSpan/2);
    }
    setTimeout(() => { classifierID.splice(classifierID.indexOf(classifier), 1); }, 5000);
}

// ── Helpers ────────────────────────────────────────────
function resetGravity(){ gravity = 0.5; player.velocity.y = 0; }

function startLevel(levelData){
    currentLevelOrder = levelData.order;
    startPos  = levelData.startPos;
    player    = new Player(levelData.startPos.x, levelData.startPos.y);
    platforms = levelData.platforms.map(p => new Platform(p.x, p.y, p.width, p.height));
    jumpPads  = (levelData.jumpPads || []).map(j => new JumpPad(j.x, j.y, j.strength));
    platformParticles = []; boostParticles = []; jumpParticles = [];
    classifiersInUse  = { platform: [], boost: [], jump: [] };
    grounded = false; wasGrounded = [false,false,false,false];
    createBackground();
    if(!gameStarted){ gameStarted = true; }
    gameLoop();
}

// ── Level select UI ────────────────────────────────────
function buildLevelGrid(){
    const grid = document.getElementById('levelGrid');
    grid.innerHTML = '';
    if(allLevels.length === 0){
        grid.innerHTML = '<span id="noLevelsMsg" style="color:#555;font-size:0.9rem;">No levels yet.</span>';
        return;
    }
    const maxUnlocked = completedOrders.length === 0 ? 1 : Math.max(...completedOrders) + 1;
    for(const lvl of allLevels){
        const btn = document.createElement('button');
        btn.className = 'level-btn';
        const done    = completedOrders.includes(lvl.order);
        const unlocked = lvl.order <= maxUnlocked;
        if(done)      btn.classList.add('completed');
        if(!unlocked) btn.classList.add('locked');
        btn.innerHTML = `<span class="level-num">${lvl.order}</span>${lvl.name || ''}${done ? '<span class="level-check">✓</span>' : ''}`;
        if(unlocked){
            btn.addEventListener('click', () => {
                document.getElementById('levelSelect').classList.add('hidden');
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
                gameStarted = false;
                startLevel(lvl);
            });
        }
        grid.appendChild(btn);
    }
}

// ── Menu wiring ────────────────────────────────────────
let animFrameId = null;
let gameStarted = false;

const menu            = document.getElementById('menu');
const levelSelect     = document.getElementById('levelSelect');
const controlsOverlay = document.getElementById('controlsOverlay');
const editorOverlay   = document.getElementById('editorOverlay');

document.getElementById('playBtn').addEventListener('click', async () => {
    menu.classList.add('hidden');
    await loadLevels();
    await loadProgress();
    buildLevelGrid();
    levelSelect.classList.remove('hidden');
});

document.getElementById('backFromSelect').addEventListener('click', () => {
    levelSelect.classList.add('hidden');
    menu.classList.remove('hidden');
});

document.getElementById('controlsBtn').addEventListener('click', () => controlsOverlay.classList.remove('hidden'));
document.getElementById('closeControlsBtn').addEventListener('click', () => controlsOverlay.classList.add('hidden'));
document.getElementById('quitBtn').addEventListener('click', () => { window.location.href = '/'; });
document.getElementById('editorBtn').addEventListener('click', () => { menu.classList.add('hidden'); openEditor(); });

document.addEventListener('keydown', e => {
    if(e.key === 'Escape'){
        if(!editorOverlay.classList.contains('hidden')) return; // editor handles its own esc
        if(gameStarted){
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
            menu.classList.remove('hidden');
        }
    }
});

// ── Level completion detection ─────────────────────────
// Call this from game logic when player reaches end of level (placeholder — wire to your goal object)
function onLevelComplete(){
    if(currentLevelOrder !== null && !completedOrders.includes(currentLevelOrder)){
        markLevelComplete(currentLevelOrder);
    }
}

// ══════════════════════════════════════════════════════
// ── LEVEL EDITOR ──────────────────────────────────────
// ══════════════════════════════════════════════════════

const edCanvas  = document.getElementById('editorCanvas');
const edCtx     = edCanvas.getContext('2d');

let edTool      = 'select';
let edPanX      = 0;
let edPanY      = 0;
let edZoom      = 0.15;
let edPanning   = false;
let edSpaceHeld = false;
let edPanStart  = {x:0, y:0};
let edPanOrigin = {x:0, y:0};

let edPlatforms = [];
let edJumpPads  = [];
let edSpawn     = {x: 250, y: 4500};

let edSelected    = null; // {type, index}
let edDragging    = false;
let edDragHandle  = null; // 'move' | 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'
let edDragStart   = {wx:0, wy:0};
let edDragOriginal = null;

let edDrawing   = false;
let edDrawStart = {wx:0, wy:0};
let edGhostRect = null;

let edCurrentId  = null; // MongoDB _id of level being edited
const SNAP = 25;

function snapV(v){ return Math.round(v / SNAP) * SNAP; }

function screenToWorld(sx, sy){
    return { x: (sx - edPanX) / edZoom, y: (sy - edPanY) / edZoom };
}
function worldToScreen(wx, wy){
    return { x: wx * edZoom + edPanX, y: wy * edZoom + edPanY };
}

function resizeEdCanvas(){
    edCanvas.width  = edCanvas.offsetWidth;
    edCanvas.height = edCanvas.offsetHeight;
}

function openEditor(){
    editorOverlay.classList.remove('hidden'); // show first so layout is calculated
    requestAnimationFrame(() => {             // measure after browser lays out
        resizeEdCanvas();
        edPanX = edCanvas.width  / 2 - (world.width  / 2) * edZoom;
        edPanY = edCanvas.height / 2 - (world.height / 2) * edZoom;
    });
    populateEdLevelDropdown();
    editorRaf = requestAnimationFrame(editorLoop);
}

function closeEditor(){
    cancelAnimationFrame(editorRaf);
    editorOverlay.classList.add('hidden');
    menu.classList.remove('hidden');
}

let editorRaf = null;

function editorLoop(){
    edDraw();
    editorRaf = requestAnimationFrame(editorLoop);
}

function edDraw(){
    const w = edCanvas.width, h = edCanvas.height;
    edCtx.fillStyle = '#0d0d0d';
    edCtx.fillRect(0, 0, w, h);

    // World border
    const wTL = worldToScreen(0, 0);
    const wBR = worldToScreen(world.width, world.height);
    edCtx.strokeStyle = '#2a2a2a';
    edCtx.lineWidth   = 2;
    edCtx.strokeRect(wTL.x, wTL.y, wBR.x - wTL.x, wBR.y - wTL.y);

    // Grid
    const gridStep = SNAP * edZoom;
    if(gridStep > 6){
        edCtx.strokeStyle = '#1a1a1a';
        edCtx.lineWidth   = 0.5;
        const startX = ((0 - edPanX) / edZoom);
        const startY = ((0 - edPanY) / edZoom);
        const snappedX = Math.floor(startX / SNAP) * SNAP;
        const snappedY = Math.floor(startY / SNAP) * SNAP;
        for(let gx = snappedX; gx < startX + w / edZoom; gx += SNAP){
            const sx = worldToScreen(gx, 0).x;
            edCtx.beginPath(); edCtx.moveTo(sx, 0); edCtx.lineTo(sx, h); edCtx.stroke();
        }
        for(let gy = snappedY; gy < startY + h / edZoom; gy += SNAP){
            const sy = worldToScreen(0, gy).y;
            edCtx.beginPath(); edCtx.moveTo(0, sy); edCtx.lineTo(w, sy); edCtx.stroke();
        }
    }

    // Platforms
    for(let i = 0; i < edPlatforms.length; i++){
        const p   = edPlatforms[i];
        const sel = edSelected?.type === 'platform' && edSelected.index === i;
        const tl  = worldToScreen(p.x, p.y);
        const sw  = p.width  * edZoom;
        const sh  = p.height * edZoom;
        edCtx.fillStyle   = sel ? '#6a6aaa' : '#666';
        edCtx.strokeStyle = sel ? '#aaaaff' : '#888';
        edCtx.lineWidth   = sel ? 2 : 1;
        edCtx.fillRect(tl.x, tl.y, sw, sh);
        edCtx.strokeRect(tl.x, tl.y, sw, sh);
        if(sel) drawHandles(p.x, p.y, p.width, p.height);
    }

    // Jump pads
    for(let i = 0; i < edJumpPads.length; i++){
        const j   = edJumpPads[i];
        const sel = edSelected?.type === 'jumppad' && edSelected.index === i;
        const tl  = worldToScreen(j.x, j.y);
        edCtx.fillStyle   = sel ? '#ffee55' : 'rgb(255,246,113)';
        edCtx.strokeStyle = sel ? '#fff' : '#aaa';
        edCtx.lineWidth   = sel ? 2 : 1;
        edCtx.fillRect(tl.x, tl.y, 50*edZoom, 10*edZoom);
        edCtx.strokeRect(tl.x, tl.y, 50*edZoom, 10*edZoom);
        if(sel) drawHandles(j.x, j.y, 50, 10);
    }

    // Spawn
    const sp = worldToScreen(edSpawn.x, edSpawn.y);
    edCtx.strokeStyle = '#4caf50';
    edCtx.lineWidth   = 2;
    edCtx.strokeRect(sp.x, sp.y, 50*edZoom, 50*edZoom);
    edCtx.fillStyle = 'rgba(76,175,80,0.15)';
    edCtx.fillRect(sp.x, sp.y, 50*edZoom, 50*edZoom);
    edCtx.fillStyle = '#4caf50';
    edCtx.font = `${Math.max(8, 11*edZoom)}px monospace`;
    edCtx.fillText('SPAWN', sp.x + 2, sp.y - 4);

    // Ghost preview while drawing platform
    if(edGhostRect){
        const tl = worldToScreen(edGhostRect.x, edGhostRect.y);
        edCtx.fillStyle   = 'rgba(100,100,200,0.3)';
        edCtx.strokeStyle = 'rgba(150,150,255,0.8)';
        edCtx.lineWidth   = 1;
        edCtx.fillRect(tl.x, tl.y, edGhostRect.width*edZoom, edGhostRect.height*edZoom);
        edCtx.strokeRect(tl.x, tl.y, edGhostRect.width*edZoom, edGhostRect.height*edZoom);
    }
}

const HANDLE_SIZE = 8;
function drawHandles(wx, wy, ww, wh){
    const handles = getHandleRects(wx, wy, ww, wh);
    edCtx.fillStyle = '#fff';
    edCtx.strokeStyle = '#444';
    edCtx.lineWidth = 1;
    for(const h of Object.values(handles)){
        edCtx.fillRect(h.x, h.y, HANDLE_SIZE, HANDLE_SIZE);
        edCtx.strokeRect(h.x, h.y, HANDLE_SIZE, HANDLE_SIZE);
    }
}

function getHandleRects(wx, wy, ww, wh){
    const tl = worldToScreen(wx, wy);
    const br = worldToScreen(wx+ww, wy+wh);
    const mx = (tl.x+br.x)/2, my = (tl.y+br.y)/2;
    const hs = HANDLE_SIZE;
    return {
        nw: {x:tl.x-hs/2, y:tl.y-hs/2}, n:  {x:mx-hs/2, y:tl.y-hs/2}, ne: {x:br.x-hs/2, y:tl.y-hs/2},
        w:  {x:tl.x-hs/2, y:my-hs/2  },                                 e:  {x:br.x-hs/2, y:my-hs/2  },
        sw: {x:tl.x-hs/2, y:br.y-hs/2}, s:  {x:mx-hs/2, y:br.y-hs/2}, se: {x:br.x-hs/2, y:br.y-hs/2},
    };
}

function hitTestHandle(sx, sy, wx, wy, ww, wh){
    const handles = getHandleRects(wx, wy, ww, wh);
    const hs = HANDLE_SIZE;
    for(const [name, h] of Object.entries(handles)){
        if(sx >= h.x && sx <= h.x+hs && sy >= h.y && sy <= h.y+hs) return name;
    }
    return null;
}

function hitTestElements(sx, sy){
    const {x:wx, y:wy} = screenToWorld(sx, sy);
    // Check platforms reverse (top-drawn = last = front)
    for(let i = edPlatforms.length-1; i >= 0; i--){
        const p = edPlatforms[i];
        if(wx >= p.x && wx <= p.x+p.width && wy >= p.y && wy <= p.y+p.height)
            return {type:'platform', index:i};
    }
    for(let i = edJumpPads.length-1; i >= 0; i--){
        const j = edJumpPads[i];
        if(wx >= j.x && wx <= j.x+50 && wy >= j.y && wy <= j.y+10)
            return {type:'jumppad', index:i};
    }
    return null;
}

function getSelectedObj(){
    if(!edSelected) return null;
    if(edSelected.type === 'platform') return edPlatforms[edSelected.index];
    if(edSelected.type === 'jumppad')  return edJumpPads[edSelected.index];
    return null;
}

// Editor mouse events
edCanvas.addEventListener('mousedown', e => {
    const sx = e.offsetX, sy = e.offsetY;

    if(edSpaceHeld){ // pan
        edPanning   = true;
        edPanStart  = {x:e.clientX, y:e.clientY};
        edPanOrigin = {x:edPanX, y:edPanY};
        return;
    }

    if(edTool === 'select'){
        // Check handles first if something is selected
        if(edSelected){
            const obj = getSelectedObj();
            if(obj){
                const ww = edSelected.type === 'jumppad' ? 50 : obj.width;
                const wh = edSelected.type === 'jumppad' ? 10  : obj.height;
                const handle = hitTestHandle(sx, sy, obj.x, obj.y, ww, wh);
                if(handle){
                    edDragging   = true;
                    edDragHandle = handle;
                    const wp = screenToWorld(sx, sy);
                    edDragStart   = {wx: wp.x, wy: wp.y};
                    edDragOriginal = {x: obj.x, y: obj.y, width: ww, height: wh};
                    return;
                }
            }
        }
        const hit = hitTestElements(sx, sy);
        edSelected = hit;
        if(hit){
            edDragging   = true;
            edDragHandle = 'move';
            const wp = screenToWorld(sx, sy);
            edDragStart   = {wx: wp.x, wy: wp.y};
            const obj = getSelectedObj();
            edDragOriginal = {x: obj.x, y: obj.y};
        }
        updateEdInfo();
    }

    if(edTool === 'platform'){
        const wp = screenToWorld(sx, sy);
        edDrawing   = true;
        edDrawStart = {wx: snapV(wp.x), wy: snapV(wp.y)};
        edGhostRect = {x: edDrawStart.wx, y: edDrawStart.wy, width: SNAP, height: SNAP};
    }

    if(edTool === 'jumppad'){
        const wp = screenToWorld(sx, sy);
        edJumpPads.push({x: snapV(wp.x), y: snapV(wp.y), strength: 25});
        edSelected = {type:'jumppad', index: edJumpPads.length-1};
        updateEdInfo();
    }

    if(edTool === 'spawn'){
        const wp = screenToWorld(sx, sy);
        edSpawn = {x: snapV(wp.x), y: snapV(wp.y)};
    }

    if(edTool === 'delete'){
        const hit = hitTestElements(sx, sy);
        if(hit){
            if(hit.type === 'platform') edPlatforms.splice(hit.index, 1);
            if(hit.type === 'jumppad')  edJumpPads.splice(hit.index, 1);
            edSelected = null;
            updateEdInfo();
        }
    }
});

edCanvas.addEventListener('mousemove', e => {
    const sx = e.offsetX, sy = e.offsetY;
    const wp = screenToWorld(sx, sy);

    // Update coord display
    document.getElementById('edCoordsInfo').textContent = `x:${Math.round(wp.x)}  y:${Math.round(wp.y)}`;

    if(edPanning){
        edPanX = edPanOrigin.x + (e.clientX - edPanStart.x);
        edPanY = edPanOrigin.y + (e.clientY - edPanStart.y);
        return;
    }

    if(edDrawing && edTool === 'platform'){
        const wx = snapV(wp.x), wy = snapV(wp.y);
        const x = Math.min(wx, edDrawStart.wx);
        const y = Math.min(wy, edDrawStart.wy);
        const w = Math.max(SNAP, Math.abs(wx - edDrawStart.wx));
        const h = Math.max(SNAP, Math.abs(wy - edDrawStart.wy));
        edGhostRect = {x, y, width:w, height:h};
    }

    if(edDragging && edSelected){
        const obj = getSelectedObj();
        if(!obj) return;
        const dx = wp.x - edDragStart.wx, dy = wp.y - edDragStart.wy;

        if(edDragHandle === 'move'){
            obj.x = snapV(edDragOriginal.x + dx);
            obj.y = snapV(edDragOriginal.y + dy);
        } else if(edSelected.type === 'platform'){
            const orig = edDragOriginal;
            let nx = orig.x, ny = orig.y, nw = orig.width, nh = orig.height;
            if(edDragHandle.includes('e')){ nw = snapV(Math.max(SNAP, orig.width  + dx)); }
            if(edDragHandle.includes('s')){ nh = snapV(Math.max(SNAP, orig.height + dy)); }
            if(edDragHandle.includes('w')){ const d = snapV(dx); nx = orig.x + d; nw = Math.max(SNAP, orig.width - d); }
            if(edDragHandle.includes('n')){ const d = snapV(dy); ny = orig.y + d; nh = Math.max(SNAP, orig.height - d); }
            obj.x = nx; obj.y = ny; obj.width = nw; obj.height = nh;
        }
        updateEdInfo();
    }
});

edCanvas.addEventListener('mouseup', e => {
    if(edPanning){ edPanning = false; return; }

    if(edDrawing && edGhostRect && edTool === 'platform'){
        if(edGhostRect.width >= SNAP && edGhostRect.height >= SNAP){
            edPlatforms.push({x: edGhostRect.x, y: edGhostRect.y, width: edGhostRect.width, height: edGhostRect.height});
            edSelected = {type:'platform', index: edPlatforms.length-1};
            updateEdInfo();
        }
        edGhostRect = null;
        edDrawing   = false;
    }

    if(edDragging){ edDragging = false; edDragHandle = null; edDragOriginal = null; }
});

edCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const sx = e.offsetX, sy = e.offsetY;
    edPanX = sx - (sx - edPanX) * factor;
    edPanY = sy - (sy - edPanY) * factor;
    edZoom = Math.max(0.05, Math.min(3, edZoom * factor));
}, {passive: false});

document.addEventListener('keydown', e => {
    if(e.code === 'Space' && !editorOverlay.classList.contains('hidden')){ e.preventDefault(); edSpaceHeld = true; edCanvas.style.cursor = 'grab'; }
    if(e.key === 'Delete' && edSelected && !editorOverlay.classList.contains('hidden')){
        if(edSelected.type === 'platform') edPlatforms.splice(edSelected.index, 1);
        if(edSelected.type === 'jumppad')  edJumpPads.splice(edSelected.index, 1);
        edSelected = null; updateEdInfo();
    }
});
document.addEventListener('keyup', e => {
    if(e.code === 'Space'){ edSpaceHeld = false; edCanvas.style.cursor = 'crosshair'; }
});

// Tool buttons
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        edTool = btn.dataset.tool;
        edSelected = null;
        edGhostRect = null;
        updateEdInfo();
    });
});

function updateEdInfo(){
    const obj = getSelectedObj();
    const info = document.getElementById('edSelectedInfo');
    if(!obj){ info.textContent = ''; return; }
    if(edSelected.type === 'platform'){
        info.textContent = `x:${obj.x}  y:${obj.y}\nw:${obj.width}  h:${obj.height}`;
    } else if(edSelected.type === 'jumppad'){
        info.textContent = `x:${obj.x}  y:${obj.y}\nstr:${obj.strength}`;
    }
}

// JumpPad strength input via prompt on double-click
edCanvas.addEventListener('dblclick', e => {
    if(edTool !== 'select' || !edSelected || edSelected.type !== 'jumppad') return;
    const j = edJumpPads[edSelected.index];
    const val = prompt('Jump pad strength (default 25):', j.strength);
    if(val !== null && !isNaN(Number(val))) j.strength = Number(val);
    updateEdInfo();
});

// ── Editor level management ────────────────────────────
async function populateEdLevelDropdown(){
    await loadLevels();
    const sel = document.getElementById('edLevelSelect');
    sel.innerHTML = '<option value="">— New Level —</option>';
    for(const lvl of allLevels){
        const opt = document.createElement('option');
        opt.value = lvl._id;
        opt.textContent = `${lvl.order}. ${lvl.name || 'Untitled'}`;
        sel.appendChild(opt);
    }
}

document.getElementById('edLevelSelect').addEventListener('change', async e => {
    const id = e.target.value;
    if(!id){ edClearCanvas(); edCurrentId = null; document.getElementById('edDeleteBtn').style.display = 'none'; return; }
    const lvl = allLevels.find(l => l._id === id || l._id?.toString() === id);
    if(!lvl) return;
    edCurrentId = id;
    document.getElementById('edLevelName').value  = lvl.name  || '';
    document.getElementById('edLevelOrder').value = lvl.order || 1;
    edSpawn     = lvl.startPos ? {...lvl.startPos} : {x:250, y:4500};
    edPlatforms = (lvl.platforms || []).map(p => ({...p}));
    edJumpPads  = (lvl.jumpPads  || []).map(j => ({...j}));
    edSelected  = null;
    document.getElementById('edDeleteBtn').style.display = 'inline-block';
    // Center view on spawn
    edPanX = edCanvas.width/2  - edSpawn.x * edZoom;
    edPanY = edCanvas.height/2 - edSpawn.y * edZoom;
    setEdStatus('Level loaded.');
});

function edClearCanvas(){
    edPlatforms = []; edJumpPads = []; edSpawn = {x:250, y:4500};
    edSelected  = null;
    document.getElementById('edLevelName').value  = '';
    document.getElementById('edLevelOrder').value = (allLevels.length + 1) || 1;
    document.getElementById('edDeleteBtn').style.display = 'none';
}

document.getElementById('edClearBtn').addEventListener('click', () => {
    if(!confirm('Clear the canvas? This won\'t delete the saved level.')) return;
    edClearCanvas(); edCurrentId = null;
    document.getElementById('edLevelSelect').value = '';
});

document.getElementById('edSaveBtn').addEventListener('click', async () => {
    const name  = document.getElementById('edLevelName').value.trim() || 'Untitled';
    const order = parseInt(document.getElementById('edLevelOrder').value) || 1;
    if(edPlatforms.length === 0) return setEdStatus('Add at least one platform.');

    const body = { name, order, startPos: edSpawn, platforms: edPlatforms, jumpPads: edJumpPads };
    const isNew = !edCurrentId;
    const url    = isNew ? '/api/ollie/levels' : `/api/ollie/levels/${edCurrentId}`;
    const method = isNew ? 'POST' : 'PUT';

    try {
        const r = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify(body)
        });
        if(!r.ok) throw new Error(await r.text());
        if(isNew){
            const d = await r.json();
            edCurrentId = d._id;
            document.getElementById('edDeleteBtn').style.display = 'inline-block';
        }
        await populateEdLevelDropdown();
        document.getElementById('edLevelSelect').value = edCurrentId;
        setEdStatus('Saved!');
    } catch(err){ setEdStatus('Error: ' + err.message); }
});

document.getElementById('edDeleteBtn').addEventListener('click', async () => {
    if(!edCurrentId || !confirm('Delete this level permanently?')) return;
    try {
        await fetch(`/api/ollie/levels/${edCurrentId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${authToken}` }
        });
        edClearCanvas(); edCurrentId = null;
        document.getElementById('edLevelSelect').value = '';
        await populateEdLevelDropdown();
        setEdStatus('Level deleted.');
    } catch(err){ setEdStatus('Error: ' + err.message); }
});

document.getElementById('edQuitBtn').addEventListener('click', closeEditor);

function setEdStatus(msg){ const el = document.getElementById('edStatus'); el.textContent = msg; setTimeout(() => { if(el.textContent === msg) el.textContent = ''; }, 3000); }

// ── Init ───────────────────────────────────────────────
checkAdmin();
