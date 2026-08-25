const assert = require('assert');
const {
  assertReadOnlyDocument,
  mergeWorkspacesWithBoardReferences,
  mondayQuery,
  isRetryableHttpStatus,
  isDailyLimitError
} = require('../services/mondayReadOnlyClient');

function mockResponse({ status = 200, body = '{}', headers = {} } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        const wanted = String(name).toLowerCase();
        const key = Object.keys(headers).find(candidate => candidate.toLowerCase() === wanted);
        return key ? headers[key] : null;
      }
    },
    async text() {
      return body;
    }
  };
}

async function main() {
  assert.doesNotThrow(() => assertReadOnlyDocument('query { boards(limit: 1) { id name } }'));
  assert.throws(
    () => assertReadOnlyDocument('mutation { create_board(board_name: "NEVER", board_kind: private) { id } }'),
    /mutations are forbidden/i
  );
  assert.throws(() => assertReadOnlyDocument(''), /query document is required/i);

  const merged = mergeWorkspacesWithBoardReferences(
    [{ id: '1', name: 'FILM', description: 'main', kind: 'open' }],
    [
      { id: '10', workspace: { id: '1', name: 'FILM' } },
      { id: '11', workspace: { id: '2', name: '_SHOOTING' } },
      { id: '12', workspace: { id: '2', name: '_SHOOTING' } }
    ]
  );

  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged[0].id, '1');
  assert.strictEqual(merged[0].discoveredFromBoardReference, false);
  assert.strictEqual(merged[1].id, '2');
  assert.strictEqual(merged[1].name, '_SHOOTING');
  assert.strictEqual(merged[1].discoveredFromBoardReference, true);

  assert.strictEqual(isRetryableHttpStatus(429), true);
  assert.strictEqual(isRetryableHttpStatus(502), true);
  assert.strictEqual(isRetryableHttpStatus(401), false);
  assert.strictEqual(isDailyLimitError({ errors: [{ extensions: { code: 'DAILY_LIMIT_EXCEEDED' } }] }), true);

  // A transient HTML/CDN response must never abort a long read-only import on the first occurrence.
  let htmlCalls = 0;
  const htmlSleeps = [];
  const htmlResult = await mondayQuery('query { me { id } }', {}, {
    token: 'test-token',
    maxAttempts: 3,
    baseDelayMs: 1,
    maxDelayMs: 10,
    sleepImpl: async ms => htmlSleeps.push(ms),
    fetchImpl: async () => {
      htmlCalls += 1;
      if (htmlCalls === 1) {
        return mockResponse({ status: 502, body: '<!doctype html><title>temporary gateway</title>' });
      }
      return mockResponse({ status: 200, body: JSON.stringify({ data: { me: { id: '1' } } }) });
    }
  });
  assert.deepStrictEqual(htmlResult, { me: { id: '1' } });
  assert.strictEqual(htmlCalls, 2);
  assert.deepStrictEqual(htmlSleeps, [1]);

  // Retry a short API rate-limit response using monday's retry hint.
  let rateCalls = 0;
  const rateSleeps = [];
  const rateResult = await mondayQuery('query { me { id } }', {}, {
    token: 'test-token',
    maxAttempts: 3,
    baseDelayMs: 1,
    maxDelayMs: 100,
    sleepImpl: async ms => rateSleeps.push(ms),
    fetchImpl: async () => {
      rateCalls += 1;
      if (rateCalls === 1) {
        return mockResponse({
          status: 429,
          body: JSON.stringify({
            errors: [{
              message: 'Rate limit exceeded',
              extensions: { code: 'RATE_LIMIT_EXCEEDED', retry_in_seconds: 0.005 }
            }]
          })
        });
      }
      return mockResponse({ status: 200, body: JSON.stringify({ data: { me: { id: '2' } } }) });
    }
  });
  assert.deepStrictEqual(rateResult, { me: { id: '2' } });
  assert.strictEqual(rateCalls, 2);
  assert.deepStrictEqual(rateSleeps, [5]);

  // A daily-account limit is not a short transient failure; fail clearly instead of looping for hours.
  let dailyCalls = 0;
  await assert.rejects(
    () => mondayQuery('query { me { id } }', {}, {
      token: 'test-token',
      maxAttempts: 5,
      baseDelayMs: 1,
      maxDelayMs: 10,
      sleepImpl: async () => {},
      fetchImpl: async () => {
        dailyCalls += 1;
        return mockResponse({
          status: 429,
          body: JSON.stringify({
            errors: [{
              message: 'Daily limit exceeded',
              extensions: { code: 'DAILY_LIMIT_EXCEEDED', retry_in_seconds: 3600 }
            }]
          })
        });
      }
    }),
    /DAILY_LIMIT_EXCEEDED/i
  );
  assert.strictEqual(dailyCalls, 1);

  // Network failures also retry, while the mutation guard remains in front of fetch.
  let networkCalls = 0;
  const networkResult = await mondayQuery('query { me { id } }', {}, {
    token: 'test-token',
    maxAttempts: 3,
    baseDelayMs: 1,
    maxDelayMs: 10,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      networkCalls += 1;
      if (networkCalls === 1) throw new TypeError('temporary network failure');
      return mockResponse({ status: 200, body: JSON.stringify({ data: { me: { id: '3' } } }) });
    }
  });
  assert.deepStrictEqual(networkResult, { me: { id: '3' } });
  assert.strictEqual(networkCalls, 2);

  console.log('mondayReadOnlyClient tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
