require('dotenv').config();
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const http       = require('http');
const { Server: IOServer } = require('socket.io');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const { MongoClient, ObjectId } = require('mongodb');
const path       = require('path');

const app        = express();
const httpServer = http.createServer(app);
const io         = new IOServer(httpServer);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Database setup ─────────────────────────────────────
let db;
MongoClient.connect(process.env.MONGODB_URI)
    .then(async client => {
        db = client.db('rosegarden');
        await db.collection('users').createIndex({ username: 1 }, { unique: true });
        // Drop any existing email index by key (name may vary) then recreate as sparse
        try {
            const idxs = await db.collection('users').listIndexes().toArray();
            for (const idx of idxs) {
                if (idx.key && 'email' in idx.key) {
                    await db.collection('users').dropIndex(idx.name);
                }
            }
        } catch (e) { console.warn('email index drop:', e.message); }
        await db.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
        console.log('Connected to MongoDB');

        // Migration: backfill last_active and created_at for existing users missing them
        const migrationDate = new Date('2026-05-10T00:00:00.000Z');
        await db.collection('users').updateMany(
            { last_active: { $exists: false } },
            { $set: { last_active: migrationDate } }
        );
        await db.collection('users').updateMany(
            { created_at: { $exists: false } },
            { $set: { created_at: migrationDate.toISOString() } }
        );

        // Migration: add admin field — true only for Mr.Rose, false for everyone else
        await db.collection('users').updateOne(
            { username: 'Mr.Rose' },
            { $set: { admin: true } }
        );
        await db.collection('users').updateMany(
            { admin: { $exists: false } },
            { $set: { admin: false } }
        );

        // Daily cleanup & warning job
        setInterval(async () => {
            const now = Date.now();
            const thirtyDays  = new Date(now - 30 * 24 * 60 * 60 * 1000);
            const fiveYears   = new Date(now - 5 * 365 * 24 * 60 * 60 * 1000);
            const fourYears   = new Date(now - 4 * 365 * 24 * 60 * 60 * 1000);
            const thisMonth   = new Date(now); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);

            try {
                // Delete no-email accounts inactive 30+ days
                const staleNoEmail = await db.collection('users').find({
                    email: null,
                    last_active: { $lt: thirtyDays }
                }).toArray();
                if (staleNoEmail.length > 0) {
                    const ids = staleNoEmail.map(u => u._id);
                    await db.collection('users').deleteMany({ _id: { $in: ids } });
                    await db.collection('saves').deleteMany({ userId: { $in: ids } });
                    await db.collection('labyrinth_stats').deleteMany({ userId: { $in: ids } });
                    console.log(`Cleanup: removed ${staleNoEmail.length} inactive no-email account(s).`);
                }

                // Delete email accounts inactive 5+ years
                const staleEmail = await db.collection('users').find({
                    email: { $ne: null },
                    last_active: { $lt: fiveYears }
                }).toArray();
                if (staleEmail.length > 0) {
                    const ids = staleEmail.map(u => u._id);
                    await db.collection('users').deleteMany({ _id: { $in: ids } });
                    await db.collection('saves').deleteMany({ userId: { $in: ids } });
                    await db.collection('labyrinth_stats').deleteMany({ userId: { $in: ids } });
                    console.log(`Cleanup: removed ${staleEmail.length} inactive email account(s).`);
                }

                // Monthly warning emails for accounts inactive 4–5 years
                const warnCandidates = await db.collection('users').find({
                    email: { $ne: null },
                    email_verified: true,
                    last_active: { $lt: fourYears, $gte: fiveYears },
                    $or: [
                        { last_warning_sent: { $exists: false } },
                        { last_warning_sent: { $lt: thisMonth } }
                    ]
                }).toArray();
                for (const u of warnCandidates) {
                    const deleteDate = new Date(u.last_active.getTime() + 5 * 365 * 24 * 60 * 60 * 1000);
                    const deleteDateStr = deleteDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                    try {
                        await sendEmail(u.email, 'Your RoseGarden account will be deleted due to inactivity',
                            `<div style="font-family:sans-serif;max-width:480px;margin:auto;">
                                <h2 style="color:#c0394b;">Inactivity Warning</h2>
                                <p>Hi <strong>${u.username}</strong>,</p>
                                <p>Your RoseGarden account has been inactive for over 4 years. If you do not log in before <strong>${deleteDateStr}</strong>, your account will be permanently deleted.</p>
                                <p>Simply log in at <a href="https://rosegarden.onrender.com">rosegarden.onrender.com</a> to keep your account active.</p>
                                <p style="color:#888;font-size:0.85rem;">— The RoseGarden Team</p>
                            </div>`
                        );
                        await db.collection('users').updateOne({ _id: u._id }, { $set: { last_warning_sent: new Date() } });
                    } catch (err) {
                        console.error(`Warning email failed for ${u.username}:`, err);
                    }
                }
            } catch (err) {
                console.error('Cleanup job error:', err);
            }
        }, 86400000);
    })
    .catch(err => { console.error('MongoDB connection failed:', err); process.exit(1); });

// ── Email setup ────────────────────────────────────────
async function sendEmail(to, subject, html) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': process.env.BREVO_API_KEY,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender:      { name: 'RoseGarden', email: 'rosegarden.noreply@gmail.com' },
            to:          [{ email: to }],
            subject,
            htmlContent: html
        })
    });
    if (!res.ok) throw new Error(`Brevo: ${await res.text()}`);
}

function verifyEmailHtml(username, code) {
    return `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;">
            <h2 style="color:#c0394b;">Welcome to RoseGarden, ${username}!</h2>
            <p>Your 6-digit verification code is:</p>
            <div style="font-size:2.5rem;font-weight:bold;letter-spacing:10px;color:#c0394b;margin:20px 0;padding:16px;background:#111;border-radius:8px;">${code}</div>
            <p style="color:#888;font-size:0.85rem;">This code expires in 15 minutes. If you didn't create an account, ignore this email.</p>
        </div>`;
}

function resetCodeHtml(username, code) {
    return `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;">
            <h2 style="color:#c0394b;">RoseGarden Password Reset</h2>
            <p>Hi ${username}, your 8-digit reset code is:</p>
            <div style="font-size:2rem;font-weight:bold;letter-spacing:8px;color:#c0394b;margin:20px 0;padding:16px;background:#111;border-radius:8px;">${code}</div>
            <p style="color:#888;font-size:0.85rem;">This code expires in 15 minutes. If you didn't request a reset, ignore this email.</p>
        </div>`;
}

function newPasswordHtml(username, password) {
    return `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;">
            <h2 style="color:#c0394b;">RoseGarden — Your New Password</h2>
            <p>Hi ${username}, your new temporary password is:</p>
            <div style="font-size:1.4rem;font-weight:bold;letter-spacing:4px;color:#c0394b;background:#111;padding:14px 20px;border-radius:8px;margin:16px 0;">${password}</div>
            <p style="color:#888;font-size:0.85rem;">Log in and change your password as soon as possible.</p>
        </div>`;
}

// ── Auth middleware ────────────────────────────────────
function requireAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Not logged in.' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
}

// ── Helpers ────────────────────────────────────────────
function uid(id) { return new ObjectId(id); }

const dbFind   = q           => db.collection('users').findOne(q);
const dbInsert = doc         => db.collection('users').insertOne(doc).then(r => ({ ...doc, _id: r.insertedId }));
const dbUpdate = (q, u)      => db.collection('users').updateOne(q, u);
const dbRemove = q           => db.collection('users').deleteMany(q);

const svFind      = q        => db.collection('saves').find(q).toArray();
const svFindOne   = q        => db.collection('saves').findOne(q);
const svInsert    = doc      => db.collection('saves').insertOne(doc).then(r => ({ ...doc, _id: r.insertedId }));
const svRemove    = q        => db.collection('saves').deleteOne(q);
const svRemoveAll = q        => db.collection('saves').deleteMany(q);

function genCode(digits) {
    return String(Math.floor(Math.random() * Math.pow(10, digits))).padStart(digits, '0');
}

function genPassword() {
    const words = ['rose','garden','bloom','petal','thorn','ember','stone','river','cloud','storm','flame','cedar'];
    const w1 = words[Math.floor(Math.random() * words.length)];
    const w2 = words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(Math.random() * 900) + 100;
    return w1 + w2 + num;
}

// ── Amoeba Multiplayer ────────────────────────────────
// Player: { id, username, color, dirX, dirY, cells: [cell…] }
// Cell:   { id, x, y, size, speed, velX, velY, phase }

const AG = {
    WORLD_W:   7500,
    WORLD_H:   7500,
    BASE_SIZE: 10,
    MAX_SIZE:  1000,
    MAX_FOOD:  10000,
    FOOD_SPAWN_AMOUNT: 15,
    FOOD_SPAWN_RATE: 500,
    BOT_SPAWN_RATE: 100,
    MAX_TOTAL: 55,
    TICK_MS:   50,
    EAT_RATIO: 1.2,
    BOT_NAMES: [
        'Globulus','Blobsworth','Oozebert','Slimon','Gloopus',
	    'Muckling','Vacuole','Cytoplasm','Nucleon','Flagellum',
	    'Amoebius','Rhizopod','Plasmodex','Goobert','Dribbles',
	    'Gelatrix','Sploobus','Mirello','Gunkle','Slorbin',
    	'Viscora','Blorple','Oozington','Glumple','Squishard',
	    'Dribblen','Mucor','Slatherby','Globulex','Glimbus',
    	'Snotrix','Puddlox','Glarbo','Slimeon','Blobrick','Oozle', 
        'Gorpheus','Sludgik','Plorp','Drizzleth','Gloobus','Squorp', 
        'Mirex','Blobbington','Gunkus','Glooberon','Slurpax',
        'Mucilix','Blobion','Oozimus','Glorpheus','Maximus',
        'Sludgerton','Viscogrin','Dribblor','Gunkarian',
        'Plasmozoid','Oobleckus','Squelchor','Glomulus','Mirelisk',
        'Blubberix','Slorpington','Gleech','Oozatrix','Squishon',
        'Grimucus','Glarion','Splatheus','Gunkleberry','Slithrax',
        'Blobnard','Oozwick','Dribblix','Slarmus','Glorpington',
        'Muckzor','Splort','Viscatrix','Sludgemire','Blorpheus',
        'Glimor','Squelbus','Plorbius','Oozendore','Glarbington',
        'Snotlax','Count Gunkess','Slupor','Snotwaggle','Bogger',
        'Boggington','Your Mother','Gunkleton','Boogerworm',
        'Snotterson','Oozleberry','Globmax','Gooberella',
        'Slurpton','Amoebella','Amoebax','Amoebius Prime',
        'Amoebzilla','Amoebot','Amoebula','Amoebro','Squishy',
        'Sir Amoebius Lot'
    ]
};

function agSpeed(size)  { return Math.pow(AG.BASE_SIZE / size, 0.45) * 9; }
function agColor()      { return `hsl(${Math.floor(Math.random() * 360)},70%,55%)`; }
function agBotName()    { return AG.BOT_NAMES[Math.floor(Math.random() * AG.BOT_NAMES.length)]; }
function agId()         { return Math.random().toString(36).slice(2, 9); }

const AG_START = Date.now();

// Blob radius at a given angle — mirrors the drawAmoeba formula on the client.
// t = (Date.now() - AG_START) / 1000 * 0.72  (same rate as client's time * 0.012 at 60fps)
function agBlobRadius(angle, baseR, t, phase) {
    let r = baseR;
    r += Math.sin(angle * 2 + t         + phase)       * baseR * 0.10;
    r += Math.sin(angle * 3 + t * 1.3   + phase * 0.7) * baseR * 0.08;
    r += Math.sin(angle * 5 + t * 0.7   + phase * 1.5) * baseR * 0.05;
    r += Math.pow(Math.max(0, Math.sin(angle * 2 + t * 0.6  + phase)),       5) * baseR * 0.65;
    r += Math.pow(Math.max(0, Math.sin(angle * 2 + t * 0.45 + phase + 2.1)), 5) * baseR * 0.55;
    r += Math.pow(Math.max(0, Math.sin(angle * 2 + t * 0.35 + phase + 4.3)), 5) * baseR * 0.45;
    return r;
}

function agNewFood() {
    return {
        id:    agId(),
        x:     Math.random() * AG.WORLD_W,
        y:     Math.random() * AG.WORLD_H,
        size:  Math.random() * 3 + 1,
        color: `rgb(${Math.floor(Math.random()*101)+155},${Math.floor(Math.random()*101)+155},${Math.floor(Math.random()*101)+155})`
    };
}

function agNewCell(x, y, size) {
    return {
        id: agId(), x, y, size, speed: agSpeed(size),
        velX: 0, velY: 0,
        phase: Math.random() * Math.PI * 2
    };
}

function agNewBot() {
    return {
        id:    agId(),
        name:  agBotName(),
        size:  AG.BASE_SIZE,
        speed: agSpeed(AG.BASE_SIZE),
        x:     Math.random() * AG.WORLD_W,
        y:     Math.random() * AG.WORLD_H,
        goalX: Math.random() * AG.WORLD_W,
        goalY: Math.random() * AG.WORLD_H,
        color: agColor(),
        velX: 0, velY: 0,
        phase: Math.random() * Math.PI * 2
    };
}

const agFood    = [];
const agBots    = [];
const agPlayers = new Map();

let agFoodAdded   = [];
let agFoodRemoved = new Set();

for (let i = 0; i < AG.MAX_FOOD*(1/4); i++) agFood.push(agNewFood());
for (let i = 0; i < 5;   i++) agBots.push(agNewBot());

let agFoodFrames = 0, agBotFrames = 0, agTickCount = 0;

function agUpdateBotGoal(b) {
    let fleeX = 0, fleeY = 0, flee = false;
    for (const [, p] of agPlayers) {
        for (const cell of p.cells) {
            const dx = cell.x - b.x, dy = cell.y - b.y;
            if (cell.size >= b.size * AG.EAT_RATIO && dx*dx + dy*dy < 90000) { fleeX -= dx; fleeY -= dy; flee = true; }
        }
    }
    for (const o of agBots) {
        if (o === b) continue;
        const dx = o.x - b.x, dy = o.y - b.y;
        if (o.size >= b.size * AG.EAT_RATIO && dx*dx + dy*dy < 90000) { fleeX -= dx; fleeY -= dy; flee = true; }
    }
    if (flee) {
        const mag = Math.hypot(fleeX, fleeY) || 1;
        b.goalX = Math.max(0, Math.min(AG.WORLD_W, b.x + (fleeX / mag) * 300));
        b.goalY = Math.max(0, Math.min(AG.WORLD_H, b.y + (fleeY / mag) * 300));
        return;
    }
    let best = -Infinity, bestX = b.goalX, bestY = b.goalY;
    for (const f of agFood) {
        const dx = f.x - b.x, dy = f.y - b.y;
        if (dx > 800 || dx < -800 || dy > 800 || dy < -800) continue;
        const s = f.size / (Math.sqrt(dx*dx + dy*dy) + 1);
        if (s > best) { best = s; bestX = f.x; bestY = f.y; }
    }
    for (const o of agBots) {
        if (o === b || b.size < o.size * AG.EAT_RATIO) continue;
        const dx = o.x - b.x, dy = o.y - b.y;
        const dist2 = dx*dx + dy*dy;
        const diff = b.size - o.size;
        const lazy = diff > 100 && dist2 > 150*150 ? Math.max(0.1, 1 - (diff - 100) / 400) : 1;
        const s = o.size / (Math.sqrt(dist2) + 1) * 3 * lazy;
        if (s > best) { best = s; bestX = o.x; bestY = o.y; }
    }
    for (const [, p] of agPlayers) {
        for (const cell of p.cells) {
            if (b.size < cell.size * AG.EAT_RATIO) continue;
            const dx = cell.x - b.x, dy = cell.y - b.y;
            const dist2 = dx*dx + dy*dy;
            const diff = b.size - cell.size;
            const lazy = diff > 100 && dist2 > 150*150 ? Math.max(0.1, 1 - (diff - 100) / 400) : 1;
            const s = cell.size / (Math.sqrt(dist2) + 1) * 3 * lazy;
            if (s > best) { best = s; bestX = cell.x; bestY = cell.y; }
        }
    }
    b.goalX = bestX; b.goalY = bestY;
}

function agMoveBots(updateGoals) {
    for (const b of agBots) {
        if (updateGoals) agUpdateBotGoal(b);
        const dx = b.goalX - b.x, dy = b.goalY - b.y;
        const dsq = dx*dx + dy*dy;
        let tvx = 0, tvy = 0;
        if (dsq > b.speed * b.speed) {
            const inv = b.speed / Math.sqrt(dsq);
            tvx = dx * inv; tvy = dy * inv;
        } else {
            b.goalX = Math.random() * AG.WORLD_W;
            b.goalY = Math.random() * AG.WORLD_H;
        }
        // Lerp velocity toward target so direction changes are smooth
        b.velX += (tvx - b.velX) * 0.2;
        b.velY += (tvy - b.velY) * 0.2;
        b.x = Math.max(0, Math.min(AG.WORLD_W, b.x + b.velX));
        b.y = Math.max(0, Math.min(AG.WORLD_H, b.y + b.velY));
    }
}

function agMovePlayers() {
    for (const [, p] of agPlayers) {
        const mag = Math.hypot(p.dirX, p.dirY);
        for (const cell of p.cells) {
            let ux, uy;
            if (mag >= 0.1) {
                ux = p.dirX / mag; uy = p.dirY / mag;
            } else {
                const fdx = p.mouseX - cell.x, fdy = p.mouseY - cell.y;
                const fm = Math.hypot(fdx, fdy);
                if (fm < 1) { cell.velX = cell.velY = 0; continue; }
                ux = fdx / fm; uy = fdy / fm;
            }
            const spd = cell.speed;
            cell.velX = ux * spd;
            cell.velY = uy * spd;
            cell.x = Math.max(0, Math.min(AG.WORLD_W, cell.x + cell.velX));
            cell.y = Math.max(0, Math.min(AG.WORLD_H, cell.y + cell.velY));
        }
        // Push overlapping own cells apart so they collide/conform visually
        for (let i = 0; i < p.cells.length; i++) {
            for (let j = i + 1; j < p.cells.length; j++) {
                const a = p.cells[i], b = p.cells[j];
                const dx = b.x - a.x, dy = b.y - a.y;
                const dist = Math.hypot(dx, dy) || 0.01;
                const minD = a.size + b.size;
                if (dist < minD) {
                    const push = (minD - dist) * 0.5;
                    const nx = dx / dist, ny = dy / dist;
                    a.x = Math.max(0, Math.min(AG.WORLD_W, a.x - nx * push));
                    a.y = Math.max(0, Math.min(AG.WORLD_H, a.y - ny * push));
                    b.x = Math.max(0, Math.min(AG.WORLD_W, b.x + nx * push));
                    b.y = Math.max(0, Math.min(AG.WORLD_H, b.y + ny * push));
                }
            }
        }
        // Soft leash: spring-pull cells back when they stray beyond leashRadius
        if (p.cells.length > 1) {
            let sumX = 0, sumY = 0, totalSize = 0;
            for (const c of p.cells) { sumX += c.x; sumY += c.y; totalSize += c.size; }
            const centX = sumX / p.cells.length, centY = sumY / p.cells.length;
            const leashR = Math.max(280, totalSize * 2.2);
            for (const c of p.cells) {
                const dx = c.x - centX, dy = c.y - centY;
                const dist = Math.hypot(dx, dy);
                if (dist > leashR) {
                    const excess = dist - leashR;
                    const pull   = excess * 0.25; // gentle spring: 25% of excess per tick
                    c.x -= (dx / dist) * pull;
                    c.y -= (dy / dist) * pull;
                }
            }
        }
    }
}

function agEatFood() {
    const t = (Date.now() - AG_START) / 1000 * 0.72;
    for (let i = agFood.length - 1; i >= 0; i--) {
        const f = agFood[i];
        let eaten = false;
        outer: for (const [, p] of agPlayers) {
            for (const cell of p.cells) {
                const dx = f.x - cell.x, dy = f.y - cell.y;
                const angle = Math.atan2(dy, dx);
                const thresh = agBlobRadius(angle, cell.size, t, cell.phase) + f.size;
                if (dx*dx + dy*dy <= thresh*thresh) {
                    cell.size = Math.min(AG.MAX_SIZE, cell.size + 1); cell.speed = agSpeed(cell.size);
                    agFoodRemoved.add(f.id); agFood.splice(i, 1); eaten = true; break outer;
                }
            }
        }
        if (eaten) continue;
        for (const b of agBots) {
            const dx = f.x - b.x, dy = f.y - b.y;
            const angle = Math.atan2(dy, dx);
            const thresh = agBlobRadius(angle, b.size, t, b.phase) + f.size;
            if (dx*dx + dy*dy <= thresh*thresh) {
                b.size = Math.min(AG.MAX_SIZE, b.size + 1); b.speed = agSpeed(b.size);
                agFoodRemoved.add(f.id); agFood.splice(i, 1); break;
            }
        }
    }
}

function agRespawn(p) {
    p.dirX = p.dirY = 0; p.mouseX = AG.WORLD_W / 2; p.mouseY = AG.WORLD_H / 2;
    p.cells = [agNewCell(Math.random() * AG.WORLD_W, Math.random() * AG.WORLD_H, AG.BASE_SIZE)];
}

function agEatBots() {
    const t = (Date.now() - AG_START) / 1000 * 0.72;
    for (let i = agBots.length - 1; i >= 0; i--) {
        const b = agBots[i]; let dead = false;
        for (const [sid, p] of agPlayers) {
            for (let ci = p.cells.length - 1; ci >= 0; ci--) {
                const cell = p.cells[ci];
                const dx = b.x - cell.x, dy = b.y - cell.y, dsq = dx*dx + dy*dy;
                // dx/dy points from cell toward bot; angle from cell toward bot:
                const angleCellToBot = Math.atan2(dy, dx);
                const cellEdgeR = agBlobRadius(angleCellToBot, cell.size, t, cell.phase);
                const botEdgeR  = agBlobRadius(angleCellToBot + Math.PI, b.size, t, b.phase);
                if (cell.size >= b.size * AG.EAT_RATIO && dsq < cellEdgeR * cellEdgeR) {
                    cell.size = Math.min(AG.MAX_SIZE, cell.size + b.size * 0.5); cell.speed = agSpeed(cell.size);
                    agBots.splice(i, 1); dead = true; break;
                } else if (b.size >= cell.size * AG.EAT_RATIO && dsq < botEdgeR * botEdgeR) {
                    b.size = Math.min(AG.MAX_SIZE, b.size + cell.size * 0.5); b.speed = agSpeed(b.size);
                    p.cells.splice(ci, 1);
                    if (p.cells.length === 0) {
                        agRespawn(p);
                        io.of('/amoeba').to(sid).emit('died', { killedBy: b.name });
                    }
                    break;
                }
            }
            if (dead) break;
        }
        if (dead) continue;
        for (let j = i - 1; j >= 0; j--) {
            // dx/dy points from a toward b
            const a = agBots[j]; const dx = b.x - a.x, dy = b.y - a.y, dsq = dx*dx + dy*dy;
            const angleAtoB = Math.atan2(dy, dx);
            const bEdgeR = agBlobRadius(angleAtoB + Math.PI, b.size, t, b.phase); // b faces a
            const aEdgeR = agBlobRadius(angleAtoB,           a.size, t, a.phase); // a faces b
            if (b.size >= a.size * AG.EAT_RATIO && dsq < bEdgeR * bEdgeR) {
                b.size = Math.min(AG.MAX_SIZE, b.size + a.size * 0.5); b.speed = agSpeed(b.size);
                agBots.splice(j, 1); i--;
            } else if (a.size >= b.size * AG.EAT_RATIO && dsq < aEdgeR * aEdgeR) {
                a.size = Math.min(AG.MAX_SIZE, a.size + b.size * 0.5); a.speed = agSpeed(a.size);
                agBots.splice(i, 1); dead = true; break;
            }
        }
    }
}

function agEatPlayers() {
    const t = (Date.now() - AG_START) / 1000 * 0.72;
    const list = [...agPlayers.entries()];
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const [sidA, a] = list[i], [sidB, b] = list[j];
            for (let ci = a.cells.length - 1; ci >= 0; ci--) {
                if (!a.cells[ci]) continue;
                for (let cj = b.cells.length - 1; cj >= 0; cj--) {
                    if (!b.cells[cj]) continue;
                    const ca = a.cells[ci], cb = b.cells[cj];
                    // dx/dy points from cb toward ca
                    const dx = ca.x - cb.x, dy = ca.y - cb.y, dsq = dx*dx + dy*dy;
                    const angleCbToCa = Math.atan2(dy, dx);
                    const caEdgeR = agBlobRadius(angleCbToCa + Math.PI, ca.size, t, ca.phase); // ca faces cb
                    const cbEdgeR = agBlobRadius(angleCbToCa,           cb.size, t, cb.phase); // cb faces ca
                    if (ca.size >= cb.size * AG.EAT_RATIO && dsq < caEdgeR * caEdgeR) {
                        ca.size = Math.min(AG.MAX_SIZE, ca.size + cb.size * 0.5); ca.speed = agSpeed(ca.size);
                        b.cells.splice(cj, 1);
                        if (b.cells.length === 0) {
                            agRespawn(b);
                            io.of('/amoeba').to(sidB).emit('died', { killedBy: a.username });
                        }
                    } else if (cb.size >= ca.size * AG.EAT_RATIO && dsq < cbEdgeR * cbEdgeR) {
                        cb.size = Math.min(AG.MAX_SIZE, cb.size + ca.size * 0.5); cb.speed = agSpeed(cb.size);
                        a.cells.splice(ci, 1);
                        if (a.cells.length === 0) {
                            agRespawn(a);
                            io.of('/amoeba').to(sidA).emit('died', { killedBy: b.username });
                        }
                        break;
                    }
                }
            }
        }
    }
}

setInterval(() => {
    agFoodFrames++; agBotFrames++; agTickCount++;

    if (agFoodFrames >= AG.FOOD_SPAWN_RATE && agFood.length < AG.MAX_FOOD*((AG.FOOD_SPAWN_AMOUNT-1)/AG.FOOD_SPAWN_AMOUNT)) {
        agFoodFrames = 0;
        for(let i = 0; i < Math.floor(AG.MAX_FOOD / AG.FOOD_SPAWN_AMOUNT); i++){
            const f = agNewFood(); agFood.push(f); agFoodAdded.push(f);
        }
    }

    const maxBots = Math.max(0, AG.MAX_TOTAL - agPlayers.size);
    if (agBotFrames >= AG.BOT_SPAWN_RATE && agBots.length < maxBots) {
        agBots.push(agNewBot()); agBotFrames = 0;
    }

    agMoveBots(agTickCount % 6 === 0);
    agMovePlayers();
    agEatFood();
    agEatBots();
    agEatPlayers();

    const mapPlayer = p => ({
        id: p.id, username: p.username, color: p.color,
        cells: p.cells.map(c => ({
            id: c.id, x: c.x, y: c.y, size: c.size,
            velX: c.velX, velY: c.velY, phase: c.phase
        }))
    });

    io.of('/amoeba').emit('tick', {
        players:     [...agPlayers.values()].map(mapPlayer),
        bots:        agBots.map(b => ({
            id: b.id, x: b.x, y: b.y, size: b.size, color: b.color,
            velX: b.velX, velY: b.velY, phase: b.phase, name: b.name
        })),
        foodAdded:   agFoodAdded.splice(0),
        foodRemoved: [...agFoodRemoved]
    });
    agFoodRemoved.clear();
}, AG.TICK_MS);

io.of('/amoeba').on('connection', socket => {
    let username = `Guest_${socket.id.slice(0, 4)}`;
    const token  = socket.handshake.auth?.token;
    if (token) {
        try { username = jwt.verify(token, process.env.JWT_SECRET).username; } catch {}
    }

    const player = {
        id: socket.id, username, color: agColor(),
        dirX: 0, dirY: 0, mouseX: AG.WORLD_W / 2, mouseY: AG.WORLD_H / 2,
        cells: [agNewCell(
            AG.WORLD_W / 2 + (Math.random() - 0.5) * 500,
            AG.WORLD_H / 2 + (Math.random() - 0.5) * 500,
            AG.BASE_SIZE
        )]
    };
    agPlayers.set(socket.id, player);

    const mapPlayer = p => ({
        id: p.id, username: p.username, color: p.color,
        cells: p.cells.map(c => ({
            id: c.id, x: c.x, y: c.y, size: c.size,
            velX: c.velX, velY: c.velY, phase: c.phase
        }))
    });

    socket.emit('init', {
        youId:   socket.id,
        worldW:  AG.WORLD_W,
        worldH:  AG.WORLD_H,
        agStart: AG_START,
        food:    agFood,
        bots:    agBots.map(b => ({
            id: b.id, x: b.x, y: b.y, size: b.size, color: b.color,
            velX: b.velX, velY: b.velY, phase: b.phase, name: b.name
        })),
        players: [...agPlayers.values()].map(mapPlayer)
    });

    socket.on('input', ({ dirX, dirY, mouseX, mouseY }) => {
        const p = agPlayers.get(socket.id);
        if (!p) return;
        p.dirX = dirX || 0; p.dirY = dirY || 0;
        if (mouseX != null) { p.mouseX = mouseX; p.mouseY = mouseY; }
    });

    socket.on('disconnect', () => agPlayers.delete(socket.id));
});

// ── Routes ─────────────────────────────────────

// Register
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !password)
        return res.status(400).json({ error: 'Username and password are required.' });
    if (username.length < 3 || username.length > 20)
        return res.status(400).json({ error: 'Username must be 3–20 characters.' });
    if (password.length < 6)
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    // Check username uniqueness
    const existingUser = await dbFind({ username });
    if (existingUser) return res.status(400).json({ error: 'Username already in use.' });

    const password_hash = await bcrypt.hash(password, 12);

    if (!email) {
        // No email: create account immediately and issue token
        let inserted;
        try {
            inserted = await dbInsert({
                username, password_hash,
                email_verified: false,
                last_active: new Date(),
                created_at: new Date().toISOString()
            });
        } catch (err) {
            console.error('DB insert error:', err);
            return res.status(500).json({ error: 'Failed to create account. Try again.' });
        }
        const token = jwt.sign(
            { id: inserted._id.toString(), username, admin: false },
            process.env.JWT_SECRET,
            { expiresIn: '10d' }
        );
        return res.json({ token, username, emailRequired: false });
    }

    // Email provided: validate format and uniqueness
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'Invalid email address.' });

    const existingEmail = await dbFind({ email });
    if (existingEmail) return res.status(400).json({ error: 'Email already in use.' });

    const verify_code    = genCode(6);
    const verify_expires = Date.now() + 15 * 60 * 1000;

    let inserted;
    try {
        inserted = await dbInsert({
            username, email, password_hash,
            email_verified: false,
            verify_code, verify_expires,
            last_active: new Date(),
            created_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('DB insert error:', err);
        return res.status(500).json({ error: 'Failed to create account. Try again.' });
    }

    try {
        await sendEmail(email, 'Verify your RoseGarden account', verifyEmailHtml(username, verify_code));
        res.json({ pendingEmail: email });
    } catch (err) {
        console.error('Email error:', err);
        await dbRemove({ _id: inserted._id });
        res.status(500).json({ error: 'Could not send verification email. Try again.' });
    }
});

// Verify 6-digit code
app.post('/api/verify-code', async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code required.' });

    const user = await dbFind({ email });
    if (!user) return res.status(404).json({ error: 'No account found.' });
    if (user.email_verified && user.email === email && !user.pending_email)
        return res.status(400).json({ error: 'Account already verified.' });
    if (Date.now() > user.verify_expires)
        return res.status(400).json({ error: 'Code expired. Please register again.' });
    if (user.verify_code !== code.trim())
        return res.status(400).json({ error: 'Incorrect code.' });

    // If verifying a pending linked email
    if (user.pending_email && user.pending_email === email) {
        await dbUpdate({ _id: user._id }, {
            $set: {
                email: user.pending_email,
                email_verified: true,
                pending_email: null,
                verify_code: null,
                verify_expires: null
            }
        });
    } else {
        // Initial registration verification
        await dbUpdate({ _id: user._id }, {
            $set: { email_verified: true, verify_code: null, verify_expires: null }
        });
    }
    res.json({ message: 'Email verified! You can now log in.' });
});

// Resend verify code
app.post('/api/resend-verification', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await dbFind({ email });
    if (!user)                return res.status(404).json({ error: 'No account found.' });
    if (user.email_verified)  return res.status(400).json({ error: 'Account already verified.' });

    const verify_code    = genCode(6);
    const verify_expires = Date.now() + 15 * 60 * 1000;
    await dbUpdate({ _id: user._id }, { $set: { verify_code, verify_expires } });

    try {
        await sendEmail(email, 'Verify your RoseGarden account', verifyEmailHtml(user.username, verify_code));
        res.json({ message: 'Code resent! Check your email.' });
    } catch (err) {
        console.error('Email error (resend-verification):', err);
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ error: 'Username and password are required.' });

    const user = await dbFind({ username });
    if (!user) return res.status(401).json({ error: 'Invalid username or password.' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid username or password.' });

    // If user has an email but hasn't verified it, block login
    if (user.email && !user.email_verified)
        return res.status(403).json({
            error: 'Please verify your email.',
            needsVerify: true,
            email: user.email
        });

    await dbUpdate({ _id: user._id }, { $set: { last_active: new Date() } });
    const token = jwt.sign({ id: user._id.toString(), username: user.username, admin: user.admin === true }, process.env.JWT_SECRET, { expiresIn: '10d' });
    res.json({ token, username: user.username, noEmailWarning: !user.email });
});

// Forgot password — step 1: send 8-digit code
app.post('/api/forgot-password', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required.' });

    const user = await dbFind({ username });
    if (!user) return res.status(404).json({ error: 'No account with that username.' });
    if (!user.email) return res.status(400).json({ error: 'No email linked to this account. Password reset is unavailable.' });

    const reset_code    = genCode(8);
    const reset_expires = Date.now() + 15 * 60 * 1000;
    await dbUpdate({ _id: user._id }, { $set: { reset_code, reset_expires } });

    try {
        await sendEmail(user.email, 'RoseGarden Password Reset', resetCodeHtml(user.username, reset_code));
        res.json({ message: 'Reset code sent to your email.' });
    } catch (err) {
        console.error('Email error (forgot-password):', err);
        res.status(500).json({ error: 'Failed to send email.' });
    }
});

// Forgot password — step 2: verify code, send new password
app.post('/api/reset-password', async (req, res) => {
    const { username, code } = req.body;
    if (!username || !code) return res.status(400).json({ error: 'Username and code required.' });

    const user = await dbFind({ username });
    if (!user)              return res.status(404).json({ error: 'No account found.' });
    if (!user.email)        return res.status(400).json({ error: 'No email linked to this account.' });
    if (!user.reset_code)   return res.status(400).json({ error: 'No reset request found.' });
    if (Date.now() > user.reset_expires)
        return res.status(400).json({ error: 'Code expired. Request a new one.' });
    if (user.reset_code !== code.trim())
        return res.status(400).json({ error: 'Incorrect code.' });

    const newPassword   = genPassword();
    const password_hash = await bcrypt.hash(newPassword, 12);
    await dbUpdate({ _id: user._id }, { $set: { password_hash, reset_code: null, reset_expires: null } });

    try {
        await sendEmail(user.email, 'Your new RoseGarden password', newPasswordHtml(user.username, newPassword));
        res.json({ message: 'New password sent to your email!' });
    } catch (err) {
        console.error('Email error (reset-password):', err);
        res.status(500).json({ error: 'Failed to send email.' });
    }
});

// Get current user
app.get('/api/me', requireAuth, async (req, res) => {
    const user = await dbFind({ _id: uid(req.user.id) });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ username: user.username, email: user.email ?? null, email_verified: user.email_verified ?? false, created_at: user.created_at });
});

// Link email to no-email account — step 1: send code
app.post('/api/account/link-email', requireAuth, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'Invalid email address.' });

    const existing = await dbFind({ email });
    if (existing) return res.status(400).json({ error: 'Email already in use.' });

    const verify_code    = genCode(6);
    const verify_expires = Date.now() + 15 * 60 * 1000;

    const user = await dbFind({ _id: uid(req.user.id) });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await dbUpdate({ _id: user._id }, {
        $set: { pending_email: email, verify_code, verify_expires }
    });

    try {
        await sendEmail(email, 'Verify your RoseGarden email', verifyEmailHtml(user.username, verify_code));
        res.json({ ok: true });
    } catch (err) {
        console.error('Email error (link-email):', err);
        res.status(500).json({ error: 'Failed to send verification email.' });
    }
});

// Link email to no-email account — step 2: verify code
app.post('/api/account/verify-link-email', requireAuth, async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required.' });

    const user = await dbFind({ _id: uid(req.user.id) });
    if (!user)             return res.status(404).json({ error: 'User not found.' });
    if (!user.pending_email) return res.status(400).json({ error: 'No pending email to verify.' });
    if (!user.verify_code) return res.status(400).json({ error: 'No verification in progress.' });
    if (Date.now() > user.verify_expires)
        return res.status(400).json({ error: 'Code expired. Please request a new one.' });
    if (user.verify_code !== code.trim())
        return res.status(400).json({ error: 'Incorrect code.' });

    await dbUpdate({ _id: user._id }, {
        $set: {
            email: user.pending_email,
            email_verified: true,
            pending_email: null,
            verify_code: null,
            verify_expires: null
        }
    });
    res.json({ ok: true });
});

// Change password
app.put('/api/account/password', requireAuth, async (req, res) => {
    const { current, newPassword } = req.body;
    if (!current || !newPassword)
        return res.status(400).json({ error: 'Both fields are required.' });
    if (newPassword.length < 6)
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });

    const user = await dbFind({ _id: uid(req.user.id) });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const match = await bcrypt.compare(current, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    const password_hash = await bcrypt.hash(newPassword, 12);
    await dbUpdate({ _id: user._id }, { $set: { password_hash } });
    res.json({ message: 'Password changed.' });
});

// Delete account
app.delete('/api/account', requireAuth, async (req, res) => {
    const { password } = req.body;
    const user = await dbFind({ _id: uid(req.user.id) });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect password.' });

    await dbRemove({ _id: user._id });
    await svRemoveAll({ userId: user._id });
    await db.collection('labyrinth_stats').deleteOne({ userId: user._id });
    res.json({ message: 'Account deleted.' });
});

// ── AUTOMATA saves ─────────────────────────────────────

app.get('/api/automata/saves', requireAuth, async (req, res) => {
    const list = await svFind({ userId: uid(req.user.id) });
    res.json(list.map(s => ({ id: s._id, name: s.name, created_at: s.created_at })));
});

app.post('/api/automata/saves', requireAuth, async (req, res) => {
    const { name, cells } = req.body;
    if (!name || !cells) return res.status(400).json({ error: 'Name and cells required.' });
    const doc = await svInsert({
        userId: uid(req.user.id),
        name,
        cells,
        created_at: new Date().toISOString()
    });
    res.json({ id: doc._id, name: doc.name });
});

app.get('/api/automata/saves/:id', requireAuth, async (req, res) => {
    try {
        const save = await svFindOne({ _id: uid(req.params.id), userId: uid(req.user.id) });
        if (!save) return res.status(404).json({ error: 'Save not found.' });
        res.json(save);
    } catch {
        res.status(400).json({ error: 'Invalid save ID.' });
    }
});

app.delete('/api/automata/saves/:id', requireAuth, async (req, res) => {
    try {
        await svRemove({ _id: uid(req.params.id), userId: uid(req.user.id) });
        res.json({ message: 'Deleted.' });
    } catch {
        res.status(400).json({ error: 'Invalid save ID.' });
    }
});

// ── Labyrinth Run stats ────────────────────────────────

app.get('/api/stats/labyrinth', requireAuth, async (req, res) => {
    const { mode = 'speed', diff = 'easy' } = req.query;
    const doc = await db.collection('labyrinth_stats').findOne({ userId: new ObjectId(req.user.id) });
    const modeStats = doc?.[mode]?.[diff] || {};
    const defaults = mode === 'speed'
        ? { total_runs: 0, best_total_time: null, fastest_per_lab: [null, null, null] }
        : { total_runs: 0, best_labs_cleared: 0, best_total_time: null };
    res.json({ ...defaults, ...modeStats, total_playtime: doc?.total_playtime || 0 });
});

app.post('/api/stats/labyrinth', requireAuth, async (req, res) => {
    const { completed, mode = 'speed', diff = 'easy', lap_times, total_time, labs_cleared } = req.body;
    if (typeof total_time !== 'number')
        return res.status(400).json({ error: 'total_time required.' });

    const userId = new ObjectId(req.user.id);
    const prefix = `${mode}.${diff}`;
    const existing = await db.collection('labyrinth_stats').findOne({ userId });

    const $inc = { total_playtime: total_time || 0 };
    const $set = {};

    if (mode === 'speed') {
        if (completed) $inc[`${prefix}.total_runs`] = 1;
        if (completed) {
            const curBest = existing?.[mode]?.[diff]?.best_total_time;
            if (curBest == null || total_time < curBest) $set[`${prefix}.best_total_time`] = total_time;
        }
        if (completed && Array.isArray(lap_times)) {
            const curFastest = existing?.[mode]?.[diff]?.fastest_per_lab || [null, null, null];
            const newFastest = [...curFastest];
            for (let i = 0; i < lap_times.length; i++) {
                if (typeof lap_times[i] === 'number' && (newFastest[i] == null || lap_times[i] < newFastest[i]))
                    newFastest[i] = lap_times[i];
            }
            $set[`${prefix}.fastest_per_lab`] = newFastest;
        }
    } else if (mode === 'level') {
        $inc[`${prefix}.total_runs`] = 1;
        if (typeof labs_cleared === 'number') {
            const curBest = existing?.[mode]?.[diff]?.best_labs_cleared || 0;
            if (labs_cleared > curBest) {
                $set[`${prefix}.best_labs_cleared`] = labs_cleared;
                $set[`${prefix}.best_total_time`]   = total_time;
            }
        }
    }

    const update = { $inc };
    if (Object.keys($set).length > 0) update.$set = $set;

    await db.collection('labyrinth_stats').updateOne({ userId }, update, { upsert: true });
    res.json({ ok: true });
});

// ── Ollie ──────────────────────────────────────────────

function requireAdmin(req, res, next) {
    if (!req.user?.admin) return res.status(403).json({ error: 'Forbidden.' });
    next();
}

app.get('/api/ollie/admin-check', requireAuth, (req, res) => {
    res.json({ isAdmin: req.user.admin === true });
});

app.get('/api/ollie/levels', async (req, res) => {
    const levels = await db.collection('ollie_levels').find({}).sort({ order: 1 }).toArray();
    res.json(levels);
});

app.post('/api/ollie/levels', requireAuth, requireAdmin, async (req, res) => {
    const { name, order, startPos, platforms, jumpPads } = req.body;
    if (!startPos || !platforms) return res.status(400).json({ error: 'startPos and platforms required.' });
    const doc = { name: name || `Level ${order}`, order: order ?? 1, startPos, platforms, jumpPads: jumpPads || [], created_at: new Date().toISOString() };
    const result = await db.collection('ollie_levels').insertOne(doc);
    res.json({ ...doc, _id: result.insertedId });
});

app.put('/api/ollie/levels/:id', requireAuth, requireAdmin, async (req, res) => {
    const { name, order, startPos, platforms, jumpPads } = req.body;
    try {
        await db.collection('ollie_levels').updateOne(
            { _id: uid(req.params.id) },
            { $set: { name, order, startPos, platforms, jumpPads: jumpPads || [] } }
        );
        res.json({ ok: true });
    } catch { res.status(400).json({ error: 'Invalid ID.' }); }
});

app.delete('/api/ollie/levels/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await db.collection('ollie_levels').deleteOne({ _id: uid(req.params.id) });
        res.json({ ok: true });
    } catch { res.status(400).json({ error: 'Invalid ID.' }); }
});

app.get('/api/ollie/progress', requireAuth, async (req, res) => {
    const doc = await db.collection('ollie_progress').findOne({ userId: uid(req.user.id) });
    res.json({ completedOrders: doc?.completedOrders || [] });
});

app.post('/api/ollie/progress/:order', requireAuth, async (req, res) => {
    const order = parseInt(req.params.order);
    if (isNaN(order)) return res.status(400).json({ error: 'Invalid order.' });
    await db.collection('ollie_progress').updateOne(
        { userId: uid(req.user.id) },
        { $addToSet: { completedOrders: order } },
        { upsert: true }
    );
    res.json({ ok: true });
});

// ── Serve games ────────────────────────────────────────
app.get('/automata',   (req, res) => res.redirect('/games/automata/'));
app.get('/marble-run', (req, res) => res.redirect('/games/marble-run/'));
app.get('/physics',    (req, res) => res.redirect('/marble-run'));
app.get('/amoeba',     (req, res) => res.redirect('/games/amoeba/'));

// ── Catch-all (SPA) ───────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`RoseGarden running at http://localhost:${PORT}`));