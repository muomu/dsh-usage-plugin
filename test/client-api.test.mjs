/**
 * Tests for the browser half's route access.
 *
 * `fetchUsage` is the only place the client talks to the host, so these tests
 * pin its two contracts: the URL it builds for a range — the slice size is
 * derived, never passed in — and what it does when the host half is older than
 * the client — a rebuilt client bundle is picked up immediately while the host only
 * changes on a DSH restart, so for that window a 404 must degrade to the legacy
 * route rather than show an error.
 *
 * No DOM is needed: `src/client/api.ts` has no JSX, so Node runs it directly.
 */
import { strict as assert } from 'node:assert';
import { afterEach, test } from 'node:test';
import { LEGACY_URL, USAGE_URL, fetchUsage, fromLegacy } from '../src/client/api.ts';

/** Replace `global.fetch` for one test and record the URLs it was asked for. */
function stubFetch(handler) {
  const urls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    urls.push({ url: String(url), init });
    const result = handler(String(url));
    if (result === undefined) throw new Error(`unexpected fetch: ${url}`);
    return {
      status: result.status ?? 200,
      ok: (result.status ?? 200) < 400,
      json: async () => result.body,
    };
  };
  afterEach(() => { globalThis.fetch = previous; });
  return urls;
}

/** Minimal valid payload, so the shape checks are the only thing under test. */
function payload(overrides = {}) {
  return {
    ok: true,
    today: { date: '2026-09-29', calls: 1, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 2 },
    scope: {
      from: '2026-09-29',
      to: '2026-09-29',
      grain: 'day',
      fromMs: 0,
      toMs: 0,
      buckets: [],
      rows: [],
      totals: { calls: 1, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 2 },
      hitRate: 0,
      dense: false,
    },
    recordCount: 1,
    backfilled: true,
    generatedAt: 1,
    scanning: { running: false, sessions: 0, files: 0, records: 0, errors: 0 },
    ...overrides,
  };
}

test('a range request names the two dates and the slice size it implies', async () => {
  const urls = stubFetch(() => ({ body: payload() }));
  const result = await fetchUsage({ from: '2026-09-23', to: '2026-09-29' });
  assert.equal(result.ok, true);
  assert.equal(urls.length, 1);
  // A week is a column of days.
  assert.equal(urls[0].url, `${USAGE_URL}?from=2026-09-23&to=2026-09-29&grain=day`);
  // The host recomputes everything per request, so the browser must not cache.
  assert.equal(urls[0].init.cache, 'no-store');
});

test('a single-day range asks for hour buckets', async () => {
  const urls = stubFetch(() => ({ body: payload() }));
  // Today and yesterday are the two single-day presets; both are read by hour.
  await fetchUsage({ from: '2026-09-29', to: '2026-09-29' });
  assert.equal(urls[0].url, `${USAGE_URL}?from=2026-09-29&to=2026-09-29&grain=hour`);
  await fetchUsage({ from: '2026-09-28', to: '2026-09-28' });
  assert.equal(urls[1].url, `${USAGE_URL}?from=2026-09-28&to=2026-09-28&grain=hour`);
  // Two days is already a day-grain range.
  await fetchUsage({ from: '2026-09-28', to: '2026-09-29' });
  assert.equal(urls[2].url, `${USAGE_URL}?from=2026-09-28&to=2026-09-29&grain=day`);
});

test('a range-less request is the button poll and carries no query', async () => {
  const urls = stubFetch(() => ({ body: payload() }));
  const result = await fetchUsage(undefined);
  assert.equal(result.ok, true);
  assert.equal(urls[0].url, USAGE_URL);
});

test('a malformed payload is an error, not a crash', async () => {
  stubFetch(() => ({ body: { ok: true, today: {} } }));
  const result = await fetchUsage(undefined);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'malformed response');
});

test('a real failure is reported with its status', async () => {
  const urls = stubFetch(() => ({ status: 500, body: {} }));
  const result = await fetchUsage(undefined);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'HTTP 500');
  // Only a missing route falls back to the legacy one.
  assert.equal(urls.length, 1);
});

test('a missing route falls back to the pre-drill-down route and marks the payload', async () => {
  // The Web server answers an unregistered `/api/*` path with 401 before route
  // matching, and with 404 when nothing claims the path; both mean "this host
  // has not been restarted yet".
  for (const status of [404, 401]) {
  const urls = stubFetch(url => (url.startsWith(USAGE_URL)
    ? { status, body: {} }
    : {
      body: {
        ok: true,
        date: '2026-09-29',
        today: { calls: 2, inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheWriteTokens: 0, totalTokens: 115 },
        trend: [
          { date: '2026-09-28', calls: 1, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 2 },
          { date: '2026-09-29', calls: 2, inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheWriteTokens: 0, totalTokens: 115 },
        ],
        rows: [{ key: 'litellm:glm-5.3', provider: 'litellm', model: 'glm-5.3', calls: 1, inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 10 }],
        recordCount: 3,
        backfilled: true,
        generatedAt: 42,
        scanning: { running: false, sessions: 1, files: 1, records: 3, errors: 0 },
      },
    }));

  const result = await fetchUsage({ from: '2026-09-23', to: '2026-09-29' });
  assert.equal(urls[1].url.startsWith(LEGACY_URL), true);

  assert.equal(result.ok, true);
  const data = result.data;
  assert.equal(data.legacy, true);
  assert.equal(data.scope.grain, 'day');
  // The legacy series arrived oldest first and is republished newest first,
  // which is the order every table in the modal renders.
  assert.deepEqual(data.scope.buckets.map(b => b.key), ['2026-09-29', '2026-09-28']);
  assert.equal(data.scope.from, '2026-09-28');
  assert.equal(data.scope.to, '2026-09-29');
  assert.equal(data.scope.totals.totalTokens, 117);
  assert.equal(data.scope.rows.length, 1);
  assert.equal(data.today.date, '2026-09-29');
  assert.equal(data.today.totalTokens, 115);
  assert.equal(data.scanning.running, false);
  assert.equal(data.generatedAt, 42);
  }
});

test('a legacy route that also fails is reported as an error', async () => {
  const urls = stubFetch(() => ({ status: 404, body: {} }));
  const result = await fetchUsage(undefined);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'HTTP 404');
  assert.equal(urls.length, 2);
});

test('fromLegacy refuses payloads it cannot render', () => {
  assert.equal(fromLegacy(null), null);
  assert.equal(fromLegacy('nope'), null);
  assert.equal(fromLegacy({ today: {} }), null);
  // A payload with no series at all still renders as an empty scope.
  const empty = fromLegacy({ date: '2026-09-29', today: { totalTokens: 0 } });
  assert.deepEqual(empty.scope.buckets, []);
  assert.equal(empty.scope.from, '2026-09-29');
  assert.equal(empty.recordCount, 0);
  assert.equal(empty.scope.hitRate, null);
});

test('an aborted request is reported as an abort, not a failure', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  };
  afterEach(() => { globalThis.fetch = previous; });
  const result = await fetchUsage(undefined, new AbortController().signal);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'aborted');
});
