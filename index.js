const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security middleware ────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiter untuk login (anti brute force) ─────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' }
});

// ── Session ──────────────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'rzaastr-secret-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// ── DB files ─────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'database.json');
const BOTS_PATH = path.join(__dirname, 'bots.json');
const LOGS_PATH = path.join(__dirname, 'logs.json');

// Load / init DB
function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const defaultDB = {
      users: [{
        id: uuidv4(),
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        createdAt: new Date().toISOString()
      }]
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDB, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH));
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function loadBots() {
  if (!fs.existsSync(BOTS_PATH)) {
    fs.writeFileSync(BOTS_PATH, JSON.stringify({ bots: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(BOTS_PATH));
}

function saveBots(data) {
  fs.writeFileSync(BOTS_PATH, JSON.stringify(data, null, 2));
}

function loadLogs() {
  if (!fs.existsSync(LOGS_PATH)) {
    fs.writeFileSync(LOGS_PATH, JSON.stringify({ logs: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(LOGS_PATH));
}

function addLog(action, user, detail) {
  const logs = loadLogs();
  logs.logs.unshift({ id: uuidv4(), action, user, detail, timestamp: new Date().toISOString() });
  if (logs.logs.length > 500) logs.logs = logs.logs.slice(0, 500);
  fs.writeFileSync(LOGS_PATH, JSON.stringify(logs, null, 2));
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  res.status(403).json({ success: false, message: 'Forbidden' });
}

// ── Routes: Pages ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session.userId) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// ── API: Auth ──────────────────────────────────────────────────────────────────
app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.json({ success: false, message: 'Username atau password salah' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  addLog('LOGIN', user.username, 'Login berhasil');
  res.json({ success: true, message: 'Login berhasil', role: user.role });
});

app.post('/api/logout', (req, res) => {
  const username = req.session.username;
  req.session.destroy();
  addLog('LOGOUT', username, 'Logout');
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ success: true, username: req.session.username, role: req.session.role });
});

// ── API: Bot Manager ──────────────────────────────────────────────────────────
// Get all bots
app.get('/api/bots', requireAuth, (req, res) => {
  const data = loadBots();
  res.json({ success: true, bots: data.bots });
});

// Add bot
app.post('/api/bots', requireAuth, (req, res) => {
  const { name, number, token, prefix, autoReply } = req.body;
  if (!name || !number) return res.json({ success: false, message: 'Nama dan nomor wajib diisi' });
  const data = loadBots();
  const bot = {
    id: uuidv4(),
    name,
    number,
    token: token || '',
    prefix: prefix || '!',
    autoReply: autoReply || false,
    status: 'offline',
    messages: 0,
    uptime: 0,
    createdAt: new Date().toISOString(),
    createdBy: req.session.username
  };
  data.bots.push(bot);
  saveBots(data);
  addLog('BOT_ADD', req.session.username, `Tambah bot: ${name} (${number})`);
  res.json({ success: true, bot });
});

// Update bot status
app.put('/api/bots/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  const data = loadBots();
  const bot = data.bots.find(b => b.id === req.params.id);
  if (!bot) return res.json({ success: false, message: 'Bot tidak ditemukan' });
  bot.status = status;
  if (status === 'online') bot.uptime = Date.now();
  saveBots(data);
  addLog('BOT_STATUS', req.session.username, `Bot ${bot.name} -> ${status}`);
  res.json({ success: true });
});

// Update bot config
app.put('/api/bots/:id', requireAuth, (req, res) => {
  const { name, prefix, autoReply, token } = req.body;
  const data = loadBots();
  const bot = data.bots.find(b => b.id === req.params.id);
  if (!bot) return res.json({ success: false, message: 'Bot tidak ditemukan' });
  if (name) bot.name = name;
  if (prefix) bot.prefix = prefix;
  if (typeof autoReply !== 'undefined') bot.autoReply = autoReply;
  if (token) bot.token = token;
  saveBots(data);
  addLog('BOT_EDIT', req.session.username, `Edit bot: ${bot.name}`);
  res.json({ success: true, bot });
});

// Delete bot
app.delete('/api/bots/:id', requireAuth, (req, res) => {
  const data = loadBots();
  const idx = data.bots.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.json({ success: false, message: 'Bot tidak ditemukan' });
  const name = data.bots[idx].name;
  data.bots.splice(idx, 1);
  saveBots(data);
  addLog('BOT_DELETE', req.session.username, `Hapus bot: ${name}`);
  res.json({ success: true });
});

// Bot stats
app.get('/api/bots/stats', requireAuth, (req, res) => {
  const data = loadBots();
  const total = data.bots.length;
  const online = data.bots.filter(b => b.status === 'online').length;
  const offline = total - online;
  const totalMessages = data.bots.reduce((a, b) => a + (b.messages || 0), 0);
  res.json({ success: true, total, online, offline, totalMessages });
});

// ── API: User Manager (admin only) ───────────────────────────────────────────
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  const db = loadDB();
  const users = db.users.map(u => ({ ...u, password: undefined }));
  res.json({ success: true, users });
});

app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.json({ success: false, message: 'Username dan password wajib' });
  const db = loadDB();
  if (db.users.find(u => u.username === username)) {
    return res.json({ success: false, message: 'Username sudah ada' });
  }
  const user = {
    id: uuidv4(),
    username,
    password: bcrypt.hashSync(password, 10),
    role: role || 'user',
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  saveDB(db);
  addLog('USER_ADD', req.session.username, `Tambah user: ${username}`);
  res.json({ success: true });
});

app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  const db = loadDB();
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.json({ success: false, message: 'User tidak ditemukan' });
  if (db.users[idx].username === 'admin') return res.json({ success: false, message: 'Tidak bisa hapus admin utama' });
  const username = db.users[idx].username;
  db.users.splice(idx, 1);
  saveDB(db);
  addLog('USER_DELETE', req.session.username, `Hapus user: ${username}`);
  res.json({ success: true });
});

// ── API: Logs ─────────────────────────────────────────────────────────────────
app.get('/api/logs', requireAuth, (req, res) => {
  const data = loadLogs();
  res.json({ success: true, logs: data.logs.slice(0, 100) });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[RZAASTR] Server running on port ${PORT}`);
  loadDB(); // init default admin
});
