try { require('dotenv').config(); } catch (e) {}
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const {
  authRequired,
  assertAuthConfiguration,
  safeEqual,
  createSessionToken,
  serializeSessionCookie,
  clearSessionCookie,
  requestUsesHttps,
  accessMiddleware,
  createLoginAttemptLimiter,
  securityHeadersMiddleware
} = require('./services/accessControl');
const { router: cutoverRouter } = require('./routes/cutover');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const loginAttempts = createLoginAttemptLimiter();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(securityHeadersMiddleware());
app.use(express.json({ limit: '1mb' }));

try {
  assertAuthConfiguration(process.env);
} catch (error) {
  console.error(`Access-control configuration error: ${error.message}`);
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not configured. API requests that need data will fail.');
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('MongoDB connection error:', err.message));
}

app.get('/api/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const readyState = mongoose.connection.readyState;
  res.setHeader('Cache-Control', 'no-store');
  res.status(readyState === 1 ? 200 : 503).json({
    ok: readyState === 1,
    database: states[readyState] || 'unknown',
    authenticationRequired: authRequired(process.env)
  });
});

// One-time publication cutover endpoint. It is intentionally mounted before the
// normal session gate so GitHub Actions can call it without exposing the UI
// password. The router itself is disabled by default and requires possession of
// the existing Monday read token; that token is never persisted in plaintext.
app.use('/api/cutover', cutoverRouter);

app.get('/login', (req, res) => {
  if (!authRequired(process.env)) return res.redirect('/');
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// The login page must be able to load its own JavaScript before a session exists.
// Keep this one static asset public; the rest of the application remains behind
// accessMiddleware below.
app.get('/js/login.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(path.join(__dirname, 'public', 'js', 'login.js'));
});

app.post('/auth/login', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!authRequired(process.env)) return res.json({ ok: true, authenticationRequired: false });

  const attemptKey = req.ip || req.socket?.remoteAddress || 'unknown';
  const gate = loginAttempts.check(attemptKey);
  if (!gate.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(gate.retryAfterMs / 1000)));
    return res.status(429).json({ error: 'Demasiados intentos. Inténtalo de nuevo más tarde.' });
  }

  const expected = String(process.env.NEW_MONDAY_ACCESS_PASSWORD || '');
  const supplied = String(req.body?.password || '');
  if (!safeEqual(supplied, expected)) {
    loginAttempts.failure(attemptKey);
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  loginAttempts.success(attemptKey);
  const token = createSessionToken(String(process.env.NEW_MONDAY_SESSION_SECRET));
  res.setHeader('Set-Cookie', serializeSessionCookie(token, { secure: requestUsesHttps(req) }));
  return res.json({ ok: true, authenticationRequired: true });
});

app.post('/auth/logout', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', clearSessionCookie({ secure: requestUsesHttps(req) }));
  res.json({ ok: true });
});

app.use(accessMiddleware(process.env));
app.use(express.static(path.join(__dirname, 'public')));

const workspacesRouter = require('./routes/workspaces');
const viewsRouter = require('./routes/views');
const boardsRouter = require('./routes/boards');
const subitemSchemaRouter = require('./routes/subitemSchema');
const bulkItemsRouter = require('./routes/bulkItems');
const itemsRouter = require('./routes/items');
const itemOrderingRouter = require('./routes/itemOrdering');
const crewRouter = require('./routes/crew');
const seedRouter = require('./routes/seed');
const mondayImportRouter = require('./routes/mondayImport');
const backupsRouter = require('./routes/backups');
const updatesRouter = require('./routes/updates');
const activityRouter = require('./routes/activity');
const filesRouter = require('./routes/files');

function destructiveSeedGuard(req, res, next) {
  if (req.method === 'POST' && String(process.env.ALLOW_DESTRUCTIVE_SEED || '').toLowerCase() !== 'true') {
    return res.status(403).json({ error: 'Destructive seed is disabled in this environment' });
  }
  return next();
}

function mondayCutoverGuard(req, res, next) {
  if (req.method === 'POST' && String(process.env.ALLOW_MONDAY_IMPORT_CUTOVER || '').toLowerCase() !== 'true') {
    return res.status(403).json({ error: 'Monday cutover writes are disabled in this environment', mondayReadOnly: true });
  }
  return next();
}

app.use('/api/workspaces', workspacesRouter);
app.use('/api/boards', subitemSchemaRouter);
app.use('/api/boards', viewsRouter);
app.use('/api/boards', boardsRouter);
app.use('/api/items', bulkItemsRouter);
app.use('/api/items', itemsRouter);
app.use('/api/item-ordering', itemOrderingRouter);
app.use('/api/crew', crewRouter);
app.use('/api/seed', destructiveSeedGuard, seedRouter);
app.use('/api/import/monday', mondayCutoverGuard, mondayImportRouter);
app.use('/api/backups', backupsRouter);
app.use('/api/updates', updatesRouter);
app.use('/api/activity', activityRouter);
app.use('/api/files', filesRouter);

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`New Monday running on port ${PORT}`);
});
