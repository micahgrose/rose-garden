const c   = document.getElementById('c');
const ctx = c.getContext('2d');
c.width   = window.innerWidth;
c.height  = window.innerHeight;
window.addEventListener('resize', () => { c.width = window.innerWidth; c.height = window.innerHeight; });

let mouseX = c.width / 2, mouseY = c.height / 2;
document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

const WORLD_W   = 4000;
const WORLD_H   = 4000;
const BASE_SIZE = 10;

let camScale       = 1;
let time           = 0;
let lastInput      = 0;
let lastFrameTime  = performance.now();

// ── Server state ──────────────────────────────────────
let youId   = null;
let food    = [];
let bots    = [];
let players = [];
let myLocal = null;

// ── Socket ────────────────────────────────────────────
const socket = io('/amoeba', { auth: { token: localStorage.getItem('rg_token') } });

socket.on('init', data => {
    youId   = data.youId;
    food    = data.food;
    bots    = data.bots;
    players = data.players;
    const me = players.find(p => p.id === youId);
    if (me) myLocal = { ...me };
});

socket.on('tick', data => {
    for (const id of data.foodRemoved) {
        const i = food.findIndex(f => f.id === id);
        if (i !== -1) food.splice(i, 1);
    }
    for (const f of data.foodAdded) food.push(f);

    bots    = data.bots;
    players = data.players;

    const serverMe = players.find(p => p.id === youId);
    if (serverMe && myLocal) {
        const d = Math.hypot(serverMe.x - myLocal.x, serverMe.y - myLocal.y);
        if (d > 200) {
            // Hard snap — respawn or large desync
            myLocal.x = serverMe.x;
            myLocal.y = serverMe.y;
        } else if (d > 40) {
            // Soft correction only when meaningfully off
            myLocal.x += (serverMe.x - myLocal.x) * 0.25;
            myLocal.y += (serverMe.y - myLocal.y) * 0.25;
        }
        // Ignore < 40px drift — normal prediction ahead of server tick
        myLocal.size     = serverMe.size;
        myLocal.username = serverMe.username;
    } else if (serverMe) {
        myLocal = { ...serverMe };
    }
});

socket.on('died', ({ killedBy }) => {
    document.getElementById('killerName').textContent = killedBy || 'something';
    const screen = document.getElementById('killScreen');
    screen.classList.add('active');
    setTimeout(() => screen.classList.remove('active'), 2500);
    if (myLocal) myLocal.size = BASE_SIZE;
});

// ── Game logic ────────────────────────────────────────
function calcSpeed(size) { return Math.pow(BASE_SIZE / size, 0.45) * 3; }

function loop() {
    const now = performance.now();
    const dtScale = Math.min((now - lastFrameTime) / 50, 3); // clamp so tab-hidden spikes don't teleport
    lastFrameTime = now;
    time++;

    if (myLocal) {
        const dx   = mouseX - c.width  / 2;
        const dy   = mouseY - c.height / 2;
        const dist = Math.hypot(dx, dy);

        if (dist > 1) {
            const spd = calcSpeed(myLocal.size);
            myLocal.velX = (dx / dist) * spd * dtScale;
            myLocal.velY = (dy / dist) * spd * dtScale;
            myLocal.x = Math.max(0, Math.min(WORLD_W, myLocal.x + myLocal.velX));
            myLocal.y = Math.max(0, Math.min(WORLD_H, myLocal.y + myLocal.velY));
        } else {
            myLocal.velX = myLocal.velY = 0;
        }

        // Send input at 20Hz — sending every frame wastes bandwidth
        if (now - lastInput >= 50) {
            lastInput = now;
            socket.emit('input', dist > 1
                ? { dirX: dx / dist, dirY: dy / dist }
                : { dirX: 0, dirY: 0 });
        }

        const target = Math.max(0.15, Math.min(1, Math.pow(BASE_SIZE / myLocal.size, 0.5)));
        camScale += (target - camScale) * 0.05;

        document.getElementById('sizeText').textContent   = `Size: ${Math.floor(myLocal.size)}`;
        document.getElementById('playerText').textContent = `Players: ${players.length}`;
    }

    draw();
    requestAnimationFrame(loop);
}

// ── Drawing ───────────────────────────────────────────
function drawAmoeba(x, y, radius, color, velX, velY, phase) {
    // Fewer points for small/distant cells — no visual difference at small screen size
    const screenR = radius * camScale;
    const N       = screenR < 15 ? 12 : 24;
    const speed     = Math.hypot(velX, velY);
    const moveAngle = speed > 0.01 ? Math.atan2(velY, velX) : 0;
    const t         = time * 0.012;

    const pts = [];
    for (let i = 0; i < N; i++) {
        let a = (i / N) * Math.PI * 2;
        let r = radius;

        r += Math.sin(a * 2 + t       + phase)        * radius * 0.10;
        r += Math.sin(a * 3 + t * 1.3 + phase * 0.7)  * radius * 0.08;
        r += Math.sin(a * 5 + t * 0.7 + phase * 1.5)  * radius * 0.05;

        r += Math.pow(Math.max(0, Math.sin(a * 2 + t * 0.6  + phase)),        5) * radius * 0.65;
        r += Math.pow(Math.max(0, Math.sin(a * 2 + t * 0.45 + phase + 2.1)),  5) * radius * 0.55;
        r += Math.pow(Math.max(0, Math.sin(a * 2 + t * 0.35 + phase + 4.3)),  5) * radius * 0.45;

        if (speed > 0.1) {
            const align = Math.cos(a - moveAngle);
            r += Math.max(0, align) * Math.min(speed / 3, 1) * radius * 0.3;
        }

        pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
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
    ctx.fillStyle    = 'white';
    ctx.font         = `bold ${fontSize}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
}

function draw() {
    ctx.clearRect(0, 0, c.width, c.height);

    if (!myLocal) {
        ctx.fillStyle    = '#555';
        ctx.font         = '22px sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Connecting...', c.width / 2, c.height / 2);
        return;
    }

    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    ctx.scale(camScale, camScale);
    ctx.translate(-myLocal.x, -myLocal.y);

    // Viewport bounds in world space (with margin so things don't pop in)
    const hw    = (c.width  / 2) / camScale + 100;
    const hh    = (c.height / 2) / camScale + 100;
    const vMinX = myLocal.x - hw;
    const vMaxX = myLocal.x + hw;
    const vMinY = myLocal.y - hh;
    const vMaxY = myLocal.y + hh;

    // Grid — batch all lines into one path (80 → 1 stroke call)
    const gx0 = Math.max(0,       Math.floor(vMinX / 100) * 100);
    const gx1 = Math.min(WORLD_W, Math.ceil(vMaxX  / 100) * 100);
    const gy0 = Math.max(0,       Math.floor(vMinY / 100) * 100);
    const gy1 = Math.min(WORLD_H, Math.ceil(vMaxY  / 100) * 100);

    ctx.strokeStyle = '#111';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    for (let x = gx0; x <= gx1; x += 100) { ctx.moveTo(x, gy0); ctx.lineTo(x, gy1); }
    for (let y = gy0; y <= gy1; y += 100) { ctx.moveTo(gx0, y); ctx.lineTo(gx1, y); }
    ctx.stroke();

    // Border
    ctx.strokeStyle = '#c0394b';
    ctx.lineWidth   = 30;
    ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

    // Food — skip anything outside the viewport
    for (const f of food) {
        if (f.x < vMinX || f.x > vMaxX || f.y < vMinY || f.y > vMaxY) continue;
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
        ctx.fill();
    }

    // Others — sorted by size (bigger behind), viewport-culled
    const maxR  = 200; // generous max amoeba radius for culling
    const others = [
        ...players.filter(p => p.id !== youId).map(p => ({ ...p, label: p.username })),
        ...bots.map(b => ({ ...b, label: b.name }))
    ].sort((a, b) => b.size - a.size);

    for (const e of others) {
        if (e.x + maxR < vMinX || e.x - maxR > vMaxX ||
            e.y + maxR < vMinY || e.y - maxR > vMaxY) continue;
        drawAmoeba(e.x, e.y, e.size, e.color, e.velX, e.velY, e.phase);
        drawLabel(e.x, e.y, e.size, e.label);
    }

    // Local player always on top
    drawAmoeba(myLocal.x, myLocal.y, myLocal.size, myLocal.color, myLocal.velX || 0, myLocal.velY || 0, myLocal.phase);
    drawLabel(myLocal.x, myLocal.y, myLocal.size, myLocal.username || '(you)');

    ctx.restore();
}

requestAnimationFrame(loop);
