try { require('dotenv').config(); } catch (e) {}
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not configured. API requests that need data will fail.');
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('MongoDB connection error:', err.message));
}

const workspacesRouter = require('./routes/workspaces');
const boardsRouter = require('./routes/boards');
const itemsRouter = require('./routes/items');
const crewRouter = require('./routes/crew');
const seedRouter = require('./routes/seed');

app.use('/api/workspaces', workspacesRouter);
app.use('/api/boards', boardsRouter);
app.use('/api/items', itemsRouter);
app.use('/api/crew', crewRouter);
app.use('/api/seed', seedRouter);

app.get('/api/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const readyState = mongoose.connection.readyState;
  res.status(readyState === 1 ? 200 : 503).json({
    ok: readyState === 1,
    database: states[readyState] || 'unknown'
  });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`New Monday running on port ${PORT}`);
});
