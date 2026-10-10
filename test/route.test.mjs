/**
 * Route guard, query parsing and payload tests.
 *
 * `ctx.webServer` routes carry no authentication, so the guard assertions are
 * the only thing standing between the ledger and any page in the user's browser.
 * The rest pins the query contract the drill-down relies on: whatever the URL
 * says, the answer is a scope with buckets in it — never an error a user cannot
 * act on.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { USAGE_PATH, createUsageHandler, parseRangeQuery, rejectForeignCaller } from '../src/route.ts';

/** Minimal response double that records what was written. */
function fakeResponse() {
  const state = { status: 0, headers: {}, body: '', ended: false };
  return {
    state,
    writeHead(status, headers) {
      state.status = status;
      Object.assign(state.headers, headers ?? {});
      return this;
    },
    end(chunk) {
      if (chunk !== undefined) state.body += String(chunk);
      state.ended = true;
      return this;
    },
  };
}

/** Minimal request double. */
function fakeRequest({ remoteAddress = '127.0.0.1', host = '127.0.0.1:3080', origin, method = 'GET', url = '/' } = {}) {
  return { socket: { remoteAddress }, headers: { host, ...(origin === undefined ? {} : { origin }) }, method, url };
}

/** Epoch ms at a local wall-clock time in September 2026. */
function at(day, hour, minute = 0) {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

/** A ledger row with only the fields the handler reads. */
function row(overrides) {
  return {
    id: overrides.id ?? 'live:1',
    time: overrides.time,
    provider: overrides.provider ?? 'deepseek-official',
    model: overrides.model ?? 'deepseek-flash',
    sessionId: 's1',
    inputTokens: overrides.inputTokens ?? 0,
    outputTokens: overrides.outputTokens ?? 0,
    cacheReadTokens: overrides.cacheReadTokens ?? 0,
    cacheWriteTokens: 0,
    src: 'live',
  };
}

/** Build a handler around one ledger, with a fixed clock at 2026-09-29 15:00. */
function handlerFor(records, overrides = {}) {
  const now = overrides.now ?? at(29, 15);
  return {
    now,
    handler: createUsageHandler({
      ledger: overrides.ledger ?? Promise.resolve({ records, backfilled: true }),
      progress: overrides.progress ?? { running: false, sessions: 0, files: 0, records: 0, errors: 0 },
      now: () => now,
    }),
  };
}

/** Run one request through a handler and return the decoded body. */
async function ask(handler, url) {
  const res = fakeResponse();
  handler(fakeRequest({ url }), res);
  // The handler resolves the ledger promise asynchronously.
  await new Promise(resolve => { setImmediate(resolve); });
  await new Promise(resolve => { setImmediate(resolve); });
  return { res, body: res.state.body.length === 0 ? undefined : JSON.parse(res.state.body) };
}

test('rejects a non-loopback peer', () => {
  const res = fakeResponse();
  assert.equal(rejectForeignCaller(fakeRequest({ remoteAddress: '192.168.1.20' }), res), true);
  assert.equal(res.state.status, 403);
});

test('rejects a foreign Host header even from loopback (DNS rebinding)', () => {
  const res = fakeResponse();
  assert.equal(rejectForeignCaller(fakeRequest({ host: 'evil.example.com' }), res), true);
  assert.equal(res.state.status, 403);
});

test('rejects a foreign Origin', () => {
  const res = fakeResponse();
  assert.equal(rejectForeignCaller(fakeRequest({ origin: 'https://evil.example.com' }), res), true);
  assert.equal(res.state.status, 403);
});

test('accepts loopback peers with local Host and Origin', () => {
  for (const host of ['127.0.0.1:3080', 'localhost:3080', '[::1]:3080']) {
    const res = fakeResponse();
    assert.equal(rejectForeignCaller(fakeRequest({ host, origin: 'http://localhost:3080' }), res), false, host);
  }
  // IPv4-mapped IPv6 loopback, as Node reports on a dual-stack socket.
  const res = fakeResponse();
  assert.equal(rejectForeignCaller(fakeRequest({ remoteAddress: '::ffff:127.0.0.1' }), res), false);
  // A same-origin fetch from the GUI sends no Origin at all.
  const noOrigin = fakeResponse();
  assert.equal(rejectForeignCaller(fakeRequest({}), noOrigin), false);
});

test('the route path is the one the client fetches', () => {
  assert.equal(USAGE_PATH, '/api/dsh-usage-tokens/usage');
});

test('rejects a non-GET method on the usage route', async () => {
  const { handler } = handlerFor([]);
  const res = fakeResponse();
  handler(fakeRequest({ method: 'POST' }), res);
  assert.equal(res.state.status, 405);
});

test('parseRangeQuery reads from, to and grain, and defaults to day', () => {
  assert.deepEqual(parseRangeQuery('/api/dsh-usage-tokens/usage'), { grain: 'day' });
  assert.deepEqual(parseRangeQuery('/api/dsh-usage-tokens/usage?from=2026-09-01&to=2026-09-29'), {
    from: '2026-09-01',
    to: '2026-09-29',
    grain: 'day',
  });
  assert.equal(parseRangeQuery('/x?grain=hour').grain, 'hour');
  // Anything that is not exactly `hour` is day; the query string is user-editable.
  assert.equal(parseRangeQuery('/x?grain=HOUR').grain, 'day');
  assert.equal(parseRangeQuery('/x?grain=').grain, 'day');
  // Empty values are treated as absent rather than as an unparseable range.
  assert.deepEqual(parseRangeQuery('/x?from=&to='), { grain: 'day' });
});

test('serves a day scope to a loopback GET', async () => {
  const records = [
    row({ time: at(29, 14), inputTokens: 10, outputTokens: 5, cacheReadTokens: 100 }),
    row({ time: at(28, 14), inputTokens: 1, outputTokens: 1 }),
  ];
  const { handler, now } = handlerFor(records);
  const { res, body } = await ask(handler, '/api/dsh-usage-tokens/usage?from=2026-09-28&to=2026-09-29&grain=day');

  assert.equal(res.state.status, 200);
  assert.equal(res.state.headers['cache-control'], 'no-store');
  assert.equal(body.ok, true);
  assert.equal(body.generatedAt, now);
  assert.equal(body.scope.grain, 'day');
  assert.deepEqual(body.scope.buckets.map(b => b.key), ['2026-09-29', '2026-09-28']);
  assert.equal(body.scope.buckets[0].totalTokens, 115);
  assert.equal(body.scope.totals.totalTokens, 117);
  assert.equal(body.recordCount, 2);
  assert.equal(body.scope.rows.length, 1);
  assert.equal(body.backfilled, true);
  assert.equal(body.today.date, '2026-09-29');
  assert.equal(body.today.totalTokens, 115);
});

test('defaults a scope-less request to today, which is what the button polls', async () => {
  const records = [row({ time: at(29, 14), inputTokens: 10, outputTokens: 5 }), row({ time: at(28, 14), inputTokens: 99 })];
  const { handler } = handlerFor(records);
  const { body } = await ask(handler, '/api/dsh-usage-tokens/usage');
  assert.deepEqual(body.scope.buckets.map(b => b.key), ['2026-09-29']);
  assert.equal(body.scope.totals.totalTokens, 15);
  assert.equal(body.today.totalTokens, 15);
});

test('slices one day by hour, listing only the hours that saw calls', async () => {
  const records = [
    row({ time: at(29, 9, 30), inputTokens: 3 }),
    row({ time: at(29, 9, 45), inputTokens: 4, model: 'glm-5.3', provider: 'litellm' }),
    row({ time: at(29, 21, 5), inputTokens: 5 }),
    row({ time: at(28, 21, 5), inputTokens: 500 }),
  ];
  const { handler } = handlerFor(records);
  const { body } = await ask(handler, '/api/dsh-usage-tokens/usage?from=2026-09-29&to=2026-09-29&grain=hour');

  assert.equal(body.scope.grain, 'hour');
  // Two of the 24 hours saw traffic; the quiet ones are not in the payload.
  assert.deepEqual(body.scope.buckets.map(b => b.key), ['2026-09-29T21', '2026-09-29T09']);
  const hours = new Map(body.scope.buckets.map(bucket => [bucket.key, bucket]));
  assert.equal(hours.get('2026-09-29T09').inputTokens, 7);
  assert.equal(hours.get('2026-09-29T09').calls, 2);
  assert.equal(hours.get('2026-09-29T21').inputTokens, 5);
  // The previous day is outside a one-day hour scope.
  assert.equal(body.scope.totals.inputTokens, 12);
  // Model rows describe the whole scope, not one bucket.
  assert.deepEqual(body.scope.rows.map(r => r.key).sort(), ['deepseek-official:deepseek-flash', 'litellm:glm-5.3']);
});

test('coarsens an over-long hour request to day grain instead of a 60-row table', async () => {
  const { handler } = handlerFor([row({ time: at(29, 14), inputTokens: 7 })]);
  const { body } = await ask(handler, '/api/dsh-usage-tokens/usage?from=2026-08-01&to=2026-09-29&grain=hour');
  assert.equal(body.scope.grain, 'day');
  assert.deepEqual(body.scope.buckets.map(b => b.key), ['2026-09-29']);
  assert.equal(body.scope.totals.inputTokens, 7);
});

test('a garbage range answers with today rather than an error', async () => {
  const { handler } = handlerFor([row({ time: at(29, 14), inputTokens: 7 })]);
  for (const [url, expected] of [
    // Both keys unreadable: the scope falls back to today, which has the call.
    ['/api/dsh-usage-tokens/usage?from=2026-13-45&to=later', 7],
    ['/api/dsh-usage-tokens/usage?from=nonsense', 7],
    // An inverted range collapses to its end date, which had no calls here —
    // an empty bucket list is a valid answer, not a failure.
    ['/api/dsh-usage-tokens/usage?from=2026-09-29&to=2026-09-20', 0],
  ]) {
    const { res, body } = await ask(handler, url);
    assert.equal(res.state.status, 200, url);
    assert.equal(body.ok, true, url);
    assert.equal(Array.isArray(body.scope.buckets), true, url);
    assert.equal(body.scope.totals.totalTokens, expected, url);
    assert.equal(body.today.totalTokens, 7, url);
  }
});

test('reports a rejected caller before touching the ledger', () => {
  let touched = false;
  const { handler } = handlerFor([], {
    ledger: Promise.resolve({ get records() { touched = true; return []; }, backfilled: false }),
  });
  const res = fakeResponse();
  handler(fakeRequest({ remoteAddress: '10.0.0.5' }), res);
  assert.equal(res.state.status, 403);
  assert.equal(touched, false);
});

test('surfaces a ledger that failed to open as a 500 rather than crashing', async () => {
  const { handler } = handlerFor([], { ledger: Promise.reject(new Error('disk gone')) });
  const res = fakeResponse();
  handler(fakeRequest({}), res);
  await new Promise(resolve => { setImmediate(resolve); });
  await new Promise(resolve => { setImmediate(resolve); });
  assert.equal(res.state.status, 500);
  assert.equal(JSON.parse(res.state.body).ok, false);
});

test('the payload carries scan progress the client polls on', async () => {
  const progress = { running: true, sessions: 3, files: 4, records: 5, errors: 0 };
  const { handler } = handlerFor([], { progress, ledger: Promise.resolve({ records: [], backfilled: false }) });
  const { body } = await ask(handler, '/api/dsh-usage-tokens/usage');
  assert.deepEqual(body.scanning, progress);
  assert.equal(body.backfilled, false);
});
