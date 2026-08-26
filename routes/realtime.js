const express = require('express');
const { addRealtimeClient, realtimeClientCount } = require('../services/realtimeHub');

const router = express.Router();

router.get('/stream', (req, res) => {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(`retry: 2500\nevent: ready\ndata: ${JSON.stringify({ ok: true, clients: realtimeClientCount() + 1, at: new Date().toISOString() })}\n\n`);

  const remove = addRealtimeClient(res);
  const heartbeat = setInterval(() => {
    try { res.write(`: heartbeat ${Date.now()}\n\n`); }
    catch { clearInterval(heartbeat); remove(); }
  }, 25000);
  heartbeat.unref?.();

  req.on('close', () => {
    clearInterval(heartbeat);
    remove();
  });
});

module.exports = router;
