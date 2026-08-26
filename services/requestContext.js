const { AsyncLocalStorage } = require('async_hooks');

const requestContext = new AsyncLocalStorage();

function normalizeClientId(value) {
  const clientId = String(value || '').trim();
  if (!clientId || clientId.length > 96) return '';
  return /^[A-Za-z0-9._:-]+$/.test(clientId) ? clientId : '';
}

function requestContextMiddleware(req, res, next) {
  const clientId = normalizeClientId(
    req.get?.('x-new-monday-client-id') || req.headers?.['x-new-monday-client-id'] || ''
  );
  requestContext.run({ clientId }, next);
}

function currentRequestContext() {
  return requestContext.getStore() || {};
}

function currentClientId() {
  return normalizeClientId(currentRequestContext().clientId || '');
}

function runWithRequestContext(context, callback) {
  return requestContext.run({
    ...(context || {}),
    clientId: normalizeClientId(context?.clientId || '')
  }, callback);
}

module.exports = {
  currentClientId,
  currentRequestContext,
  normalizeClientId,
  requestContextMiddleware,
  runWithRequestContext
};
