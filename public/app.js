// ── State ─────────────────────────────────────────────
let authToken   = localStorage.getItem('rg_token') || null;
let currentUser = null;
let pendingVerifyEmail = null; // email awaiting code after registration

// ── DOM ───────────────────────────────────────────────
const authModal      = document.getElementById('authModal');
const loginForm      = document.getElementById('loginForm');
const registerForm   = document.getElementById('registerForm');
const forgotForm     = document.getElementById('forgotForm');
const userHeader     = document.getElementById('userHeader');
const accountModal   = document.getElementById('accountModal');
const verifiedBanner = document.getElementById('verifiedBanner');

// ── Init ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    if (authToken) loadUser();
});

function showBanner(msg, cls) {
    verifiedBanner.textContent = msg;
    verifiedBanner.className = `banner ${cls}`;
    setTimeout(() => { verifiedBanner.className = 'banner hidden'; }, 5000);
}

// ── Auth modal open/close ─────────────────────────────
document.getElementById('showLoginBtn').addEventListener('click', () => {
    showLogin();
    authModal.classList.remove('hidden');
});
document.getElementById('showRegisterBtn').addEventListener('click', () => {
    showRegister();
    authModal.classList.remove('hidden');
});
document.getElementById('closeModal').addEventListener('click', () => {
    authModal.classList.add('hidden');
});

document.getElementById('switchToRegister').addEventListener('click', showRegister);
document.getElementById('switchToLogin').addEventListener('click', showLogin);
document.getElementById('forgotPasswordLink').addEventListener('click', showForgot);
document.getElementById('backToLogin').addEventListener('click', showLogin);

function showLogin() {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    forgotForm.classList.add('hidden');
    document.getElementById('loginError').textContent = '';
}

function showRegister() {
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    forgotForm.classList.add('hidden');
    document.getElementById('registerError').textContent  = '';
    document.getElementById('registerSuccess').textContent = '';
    document.getElementById('registerInputs').classList.remove('hidden');
    document.getElementById('verifySection').classList.add('hidden');
}

function showForgot() {
    forgotForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    registerForm.classList.add('hidden');
    document.getElementById('forgotError').textContent   = '';
    document.getElementById('forgotSuccess').textContent = '';
    document.getElementById('forgotCodeSection').classList.add('hidden');
}

// ── Register ──────────────────────────────────────────
document.getElementById('registerBtn').addEventListener('click', async () => {
    const username = document.getElementById('regUsername').value.trim();
    const email    = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const errEl    = document.getElementById('registerError');
    const okEl     = document.getElementById('registerSuccess');

    errEl.textContent = '';
    okEl.textContent  = '';

    try {
        const res  = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }

        pendingVerifyEmail = email;
        okEl.textContent   = data.message;

        // Show code entry, hide inputs
        document.getElementById('registerInputs').classList.add('hidden');
        document.getElementById('verifySection').classList.remove('hidden');
        document.getElementById('verifyCode').focus();
    } catch {
        errEl.textContent = 'Something went wrong. Try again.';
    }
});

// ── Verify code ───────────────────────────────────────
document.getElementById('verifyBtn').addEventListener('click', () => submitVerifyCode());
document.getElementById('verifyCode').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitVerifyCode();
});

async function submitVerifyCode() {
    const code    = document.getElementById('verifyCode').value.trim();
    const errEl   = document.getElementById('verifyError');
    const okEl    = document.getElementById('verifySuccess');
    errEl.textContent = '';
    okEl.textContent  = '';

    if (!pendingVerifyEmail) { errEl.textContent = 'Session lost — please register again.'; return; }

    try {
        const res  = await fetch('/api/verify-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingVerifyEmail, code })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }

        okEl.textContent = data.message;
        pendingVerifyEmail = null;
        setTimeout(() => { authModal.classList.add('hidden'); showLogin(); }, 1800);
    } catch {
        errEl.textContent = 'Something went wrong. Try again.';
    }
}

document.getElementById('resendCodeLink').addEventListener('click', async () => {
    if (!pendingVerifyEmail) return;
    const errEl = document.getElementById('verifyError');
    const okEl  = document.getElementById('verifySuccess');
    errEl.textContent = '';
    okEl.textContent  = '';
    try {
        const res  = await fetch('/api/resend-verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingVerifyEmail })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }
        okEl.textContent = data.message;
    } catch {
        errEl.textContent = 'Failed to resend. Try again.';
    }
});

// ── Login ─────────────────────────────────────────────
document.getElementById('loginBtn').addEventListener('click', () => submitLogin());
document.getElementById('loginPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitLogin();
});

async function submitLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl    = document.getElementById('loginError');
    errEl.textContent = '';

    try {
        const res  = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) {
            if (data.needsVerify) {
                pendingVerifyEmail = data.email;
                showRegister();
                document.getElementById('registerInputs').classList.add('hidden');
                document.getElementById('verifySection').classList.remove('hidden');
                document.getElementById('registerSuccess').textContent = 'Enter the verification code from your email.';
            } else {
                errEl.textContent = data.error;
            }
            return;
        }
        authToken = data.token;
        localStorage.setItem('rg_token', authToken);
        authModal.classList.add('hidden');
        await loadUser();
    } catch {
        errEl.textContent = 'Something went wrong. Try again.';
    }
}

// ── Forgot password ───────────────────────────────────
document.getElementById('forgotSendBtn').addEventListener('click', async () => {
    const username = document.getElementById('forgotUsername').value.trim();
    const errEl    = document.getElementById('forgotError');
    const okEl     = document.getElementById('forgotSuccess');
    errEl.textContent = '';
    okEl.textContent  = '';

    if (!username) { errEl.textContent = 'Enter your username.'; return; }

    try {
        const res  = await fetch('/api/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }

        okEl.textContent = data.message;
        document.getElementById('forgotCodeSection').classList.remove('hidden');
        document.getElementById('forgotCode').focus();
    } catch {
        errEl.textContent = 'Something went wrong. Try again.';
    }
});

document.getElementById('resetSubmitBtn').addEventListener('click', () => submitResetCode());
document.getElementById('forgotCode').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitResetCode();
});

async function submitResetCode() {
    const username = document.getElementById('forgotUsername').value.trim();
    const code     = document.getElementById('forgotCode').value.trim();
    const errEl    = document.getElementById('resetError');
    errEl.textContent = '';

    try {
        const res  = await fetch('/api/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, code })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }

        document.getElementById('forgotSuccess').textContent = data.message + ' Check your email.';
        document.getElementById('forgotCodeSection').classList.add('hidden');
        setTimeout(() => { showLogin(); }, 3000);
    } catch {
        errEl.textContent = 'Something went wrong. Try again.';
    }
}

// ── Load user ─────────────────────────────────────────
async function loadUser() {
    try {
        const res = await fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) { logout(); return; }
        currentUser = await res.json();
        showUserHeader();
    } catch {
        logout();
    }
}

function showUserHeader() {
    document.getElementById('userGreeting').textContent = `Hi, ${currentUser.username}!`;
    userHeader.classList.remove('hidden');
    document.getElementById('gamesSection').classList.remove('hidden');
    document.getElementById('heroBtns').classList.add('hidden');
}

// ── Logout ────────────────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', logout);

function logout() {
    authToken   = null;
    currentUser = null;
    localStorage.removeItem('rg_token');
    userHeader.classList.add('hidden');
    document.getElementById('gamesSection').classList.add('hidden');
    document.getElementById('heroBtns').classList.remove('hidden');
}

// ── Account panel ─────────────────────────────────────
document.getElementById('accountBtn').addEventListener('click', () => {
    if (!currentUser) return;
    document.getElementById('accountUsername').textContent = `Username: ${currentUser.username}`;
    document.getElementById('accountEmail').textContent    = `Email: ${currentUser.email}`;
    const date = new Date(currentUser.created_at).toLocaleDateString();
    document.getElementById('accountCreated').textContent  = `Member since: ${date}`;
    document.getElementById('deleteError').textContent     = '';
    document.getElementById('deletePassword').value        = '';
    accountModal.classList.remove('hidden');
});

document.getElementById('closeAccount').addEventListener('click', () => {
    accountModal.classList.add('hidden');
});

// ── Delete account ────────────────────────────────────
document.getElementById('deleteBtn').addEventListener('click', async () => {
    const password = document.getElementById('deletePassword').value;
    const errEl    = document.getElementById('deleteError');
    errEl.textContent = '';

    if (!password) { errEl.textContent = 'Enter your password to confirm.'; return; }
    if (!confirm('Are you sure? This cannot be undone.')) return;

    try {
        const res  = await fetch('/api/account', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }

        accountModal.classList.add('hidden');
        logout();
        showBanner('Your account has been deleted.', 'success-banner');
    } catch {
        errEl.textContent = 'Something went wrong. Try again.';
    }
});

// ── AUTOMATA game card ────────────────────────────────
document.getElementById('automataCard').addEventListener('click', () => {
    window.location.href = '/automata';
});
