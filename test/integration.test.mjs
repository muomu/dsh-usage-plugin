/**
 * End-to-end integration test for the host half.
 *
 * This is the check that was missing when the plugin first failed: it drives the
 * real built bundle through `apply` with a stub context and a redirected
 * `DSH_HOME`, then exercises the real HTTP handler against real data written to
 * a real ledger file. It covers the whole host chain — session log → frame
 * decoder → extraction → ledger write → aggregation → route guard → JSON — so a
 * failure in any link surfaces here instead of silently in the running GUI.
 *
 * `DSH_HOME` is redirected before the module is imported, so nothing touches the
 * live store.
 */
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { zstdCompressSync } from 'node:zlib';

const root = join(import.meta.dirname, '..');

/** Local calendar date for an epoch ms, matching the plugin's rule. */
function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Build a synthetic session log as several concatenated zstd frames, which is
 * how the real logs are stored. Two frames prove the decoder reads past the
 * first one.
 * @param sessionId - Session id for the header.
 * @param events - Event objects to encode, split across two frames.
 * @returns Compressed bytes.
 */
function fixtureLog(sessionId, events) {
  const lines = [JSON.stringify({ type: 'session', version: 4, id: sessionId, createdAt: Date.now(), cwd: '/tmp' })];
  for (const event of events) lines.push(JSON.stringify(event));
  const half = Math.ceil(lines.length / 2);
  const first = zstdCompressSync(Buffer.from(`${lines.slice(0, half).join('\n')}\n`, 'utf8'));
  const second = zstdCompressSync(Buffer.from(`${lines.slice(half).join('\n')}\n`, 'utf8'));
  return Buffer.concat([first, second]);
}

/** A response double that resolves once the handler finishes writing. */
function responseDouble() {
  let settle;
  const done = new Promise(resolve => { settle = resolve; });
  const state = { status: 0, headers: {}, body: '', done };
  return {
    state,
    writeHead(status, headers) {
      state.status = status;
      Object.assign(state.headers, headers ?? {});
      return this;
    },
    end(chunk) {
      if (chunk !== undefined) state.body += String(chunk);
      settle();
      return this;
    },
  };
}

/** A loopback GET request double. */
function requestDouble(url) {
  return {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3080' },
    method: 'GET',
    url,
  };
}

test('host half answers a real request with real ledger data end to end', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-usage-e2e-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = base;
  t.after(async () => {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    await rm(base, { recursive: true, force: true });
  });

  // One session log holding two usage events today and one yesterday, so the
  // trend has a second day to show.
  const today = dayKey(Date.now());
  const now = Date.now();
  // Anchor "yesterday" at local noon the previous day. Subtracting a fixed 24h
  // would land in the SAME local day for any run before 24:00 minus that offset,
  // which is exactly the bug this fixture had first.
  const noon = new Date(now);
  noon.setHours(12, 0, 0, 0);
  const yesterday = noon.getTime() - 24 * 60 * 60 * 1000;
  assert.notEqual(dayKey(yesterday), today, 'fixture must place this event on another day');
  const sessionDir = join(base, 'sessions', '--tmp-fixture--', 'session-fixture');
  await mkdir(sessionDir, { recursive: true });
  await writeFile(join(sessionDir, 'session.v4.jsonl.zstd'), fixtureLog('session-fixture', [
    {
      type: 'assistant/message',
      seq: 1,
      time: now,
      data: {
        message: { role: 'assistant', source: { provider: 'deepseek-official', model: 'deepseek-flash' } },
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 1000, cacheWriteTokens: 0, reasoningTokens: 20 },
      },
    },
    {
      type: 'assistant/message',
      seq: 2,
      time: now,
      data: {
        message: { role: 'assistant', source: { provider: 'litellm', model: 'glm-5.3' } },
        usage: { inputTokens: 7, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    },
    {
      type: 'assistant/message',
      seq: 3,
      time: yesterday,
      data: {
        message: { role: 'assistant', source: { provider: 'deepseek-official', model: 'deepseek-flash' } },
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    },
  ]));

  // Import after DSH_HOME is redirected.
  const { apply } = await import(pathToFileURL(join(root, 'lib/index.js')).href);
  const registered = [];
  const ctx = {
    webServer: { register(route) { registered.push(route); return () => {}; } },
    on() { return () => {}; },
    effect(callback) { const cleanup = callback(); return typeof cleanup === 'function' ? cleanup : () => {}; },
  };

  apply(ctx);
  assert.equal(registered.length, 1, 'the route must be registered synchronously');

  // The route resolves as soon as the ledger FILE is open; the historical scan
  // streams in afterwards. That is deliberate — the button must answer during a
  // cold start — and it is why the browser polls until `backfilled` is true.
  // This loop asserts the same contract the client relies on.
  const ask = async (url = '/api/dsh-usage-tokens/usage?from=' + today + '&to=' + today + '&grain=day') => {
    const res = responseDouble();
    registered[0].handler(requestDouble(url), res);
    await res.state.done;
    return res;
  };

  let res = await ask();
  assert.equal(res.state.status, 200);
  assert.equal(res.state.headers['cache-control'], 'no-store');
  for (let attempt = 0; attempt < 200 && JSON.parse(res.state.body).backfilled !== true; attempt += 1) {
    await new Promise(resolve => { setTimeout(resolve, 10); });
    res = await ask();
  }

  const payload = JSON.parse(res.state.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.today.date, today);
  assert.equal(payload.scope.from, today);
  assert.equal(payload.scope.to, today);
  assert.equal(payload.scope.grain, 'day');
  // The scan must converge, or the button would sit on a partial figure.
  assert.equal(payload.backfilled, true, 'the historical scan never reported completion');

  // Today holds two calls: (100 + 50 + 1000 + 0) and (7 + 3 + 0 + 0).
  // The third fixture event is deliberately on the previous day.
  assert.equal(payload.today.totalTokens, 1160);
  assert.equal(payload.today.calls, 2);
  assert.equal(payload.today.inputTokens, 107);
  assert.equal(payload.today.cacheReadTokens, 1000);
  assert.equal(payload.today.outputTokens, 53);
  // Reasoning is a subset of output and must not be added to the total.
  assert.equal(payload.today.reasoningTokens, 20);

  // The one-day scope carries the same figures as the button.
  assert.equal(payload.scope.buckets.length, 1);
  assert.equal(payload.scope.buckets[0].key, today);
  assert.equal(payload.scope.totals.totalTokens, 1160);
  assert.equal(payload.recordCount, 2);

  // Both routes appear in the breakdown, largest first.
  assert.deepEqual(payload.scope.rows.map(r => r.key), ['deepseek-official:deepseek-flash', 'litellm:glm-5.3']);
  assert.equal(payload.scope.rows[0].totalTokens, 1150);
  assert.equal(payload.scope.rows[1].totalTokens, 10);
  // The per-model rows must add up to the day total, or the modal would show
  // a breakdown that disagrees with the button.
  assert.equal(payload.scope.rows.reduce((sum, r) => sum + r.totalTokens, 0), payload.scope.totals.totalTokens);

  // Asking for that day at hour grain answers with its 24 hours, and the two
  // calls land in the hour they happened in.
  const hourKey = `${today}T${String(new Date(now).getHours()).padStart(2, '0')}`;
  const drilled = JSON.parse((await ask(
    '/api/dsh-usage-tokens/usage?from=' + today + '&to=' + today + '&grain=hour',
  )).state.body);
  assert.equal(drilled.scope.grain, 'hour');
  // Both fixture calls happened in the same hour, so exactly one bucket is
  // published — the quiet hours are not listed.
  assert.equal(drilled.scope.buckets.length, 1);
  const hour = drilled.scope.buckets.find(bucket => bucket.key === hourKey);
  assert.ok(hour !== undefined, `no bucket for ${hourKey}`);
  assert.equal(hour.totalTokens, 1160);
  assert.equal(drilled.scope.totals.totalTokens, 1160);

  // A seven-day window ending today still has yesterday's single call in it.
  const sixDaysAgo = new Date(now);
  sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
  const weekly = JSON.parse((await ask(
    '/api/dsh-usage-tokens/usage?from=' + dayKey(sixDaysAgo.getTime()) + '&to=' + today + '&grain=day',
  )).state.body);
  // Two of the seven days saw calls; the five quiet ones are not listed.
  assert.deepEqual(weekly.scope.buckets.map(bucket => bucket.key), [today, dayKey(yesterday)]);
  assert.equal(weekly.scope.buckets[1].totalTokens, 2, 'yesterday\'s single call must be present');

  // The scan completed, so the client stops polling fast.
  assert.equal(payload.backfilled, true);
  assert.equal(payload.scanning.running, false);

  // And the ledger really is on disk under the redirected home.
  const ledger = JSON.parse(await readFile(join(base, 'storages', 'dsh-usage-tokens', 'ledger.json'), 'utf8'));
  assert.equal(ledger.records.length, 3);
  assert.equal(ledger.backfill.done, true);
  assert.ok(ledger.records.every(row => row.src === 'backfill'));

  // Same-request repeat must not double count: nothing changed on disk.
  const again = await ask();
  assert.equal(JSON.parse(again.state.body).today.totalTokens, 1160);
});
