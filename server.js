try { require('dotenv').config(); } catch(e) {}
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

const boardsRouter = require('./routes/boards');
const itemsRouter = require('./routes/items');
const crewRouter = require('./routes/crew');
const seedRouter = require('./routes/seed');

app.use('/api/boards', boardsRouter);
app.use('/api/items', itemsRouter);
app.use('/api/crew', crewRouter);
app.use('/api/seed', seedRouter);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`New Monday running on port ${PORT}`);
});
