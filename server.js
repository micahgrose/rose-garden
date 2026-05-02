require('dotenv').config();
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const dns        = require('dns');
const { MongoClient, ObjectId } = require('mongodb');
const path       = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Database setup ─────────────────────────────────────
let db;
MongoClient.connect(process.env.MONGODB_URI)
    .then(client => {
        db = client.db();
        db.collection('users').createIndex({ username: 1 }, { unique: true });
        db.collection('users').createIndex({ email: 1 },    { unique: true });
        console.log('Connected to MongoDB');
    })
    .catch(err => { console.error('MongoDB connection failed:', err); process.exit(1); });

// ── Email setup ────────────────────────────────────────
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    pool: true,
    maxConnections: 3,
    dnsLookup: (host, options, cb) => dns.lookup(host, { ...options, family: 4 }, cb),
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

transporter.verify().then(() => console.log('Mail ready')).catch(err => console.error('Mail error:', err));

async function sendEmail(to, subject, html) {
    await transporter.sendMail({
        from: `RoseGarden <${process.env.GMAIL_USER}>`,
        to, subject, html
    });
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

// ── Routes ─────────────────────────────────────────────

// Register
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
        return res.status(400).json({ error: 'All fields are required.' });
    if (username.length < 3 || username.length > 20)
        return res.status(400).json({ error: 'Username must be 3–20 characters.' });
    if (password.length < 6)
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const existing = await dbFind({ $or: [{ username }, { email }] });
    if (existing) return res.status(400).json({ error: 'Username or email already in use.' });

    const password_hash  = await bcrypt.hash(password, 12);
    const verify_code    = genCode(6);
    const verify_expires = Date.now() + 15 * 60 * 1000;

    let inserted;
    try {
        inserted = await dbInsert({
            username, email, password_hash,
            verify_code, verify_expires,
            verified: false,
            created_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('DB insert error:', err);
        return res.status(500).json({ error: 'Failed to create account. Try again.' });
    }

    try {
        await sendEmail(email, 'Verify your RoseGarden account', verifyEmailHtml(username, verify_code));
        res.json({ message: 'Account created! Enter the 6-digit code sent to your email.', email });
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
    if (!user)          return res.status(404).json({ error: 'No account found.' });
    if (user.verified)  return res.status(400).json({ error: 'Account already verified.' });
    if (Date.now() > user.verify_expires)
        return res.status(400).json({ error: 'Code expired. Please register again.' });
    if (user.verify_code !== code.trim())
        return res.status(400).json({ error: 'Incorrect code.' });

    await dbUpdate({ _id: user._id }, { $set: { verified: true, verify_code: null, verify_expires: null } });
    res.json({ message: 'Email verified! You can now log in.' });
});

// Resend verify code
app.post('/api/resend-verification', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await dbFind({ email });
    if (!user)         return res.status(404).json({ error: 'No account found.' });
    if (user.verified) return res.status(400).json({ error: 'Account already verified.' });

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

    if (!user.verified)
        return res.status(403).json({
            error: 'Please verify your email before logging in.',
            needsVerify: true,
            email: user.email
        });

    const token = jwt.sign({ id: user._id.toString(), username: user.username }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: user.username });
});

// Forgot password — step 1: send 8-digit code
app.post('/api/forgot-password', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required.' });

    const user = await dbFind({ username });
    if (!user) return res.status(404).json({ error: 'No account with that username.' });

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
    res.json({ username: user.username, email: user.email, created_at: user.created_at });
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

// ── Serve automata game ────────────────────────────────
app.get('/automata', (req, res) => res.redirect('/games/automata/'));

// ── Serve marble run game ─────────────────────────────
app.get('/marble-run', (req, res) => res.redirect('/games/marble-run/'));
app.get('/physics',    (req, res) => res.redirect('/marble-run'));

// ── Catch-all (SPA) ───────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`RoseGarden running at http://localhost:${PORT}`));
