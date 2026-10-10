/**
 * Backfill tests.
 *
 * The first test is the load-bearing one: session logs are a concatenation of
 * zstd frames, and Node's one-shot `zstdDecompressSync` returns only the first
 * frame. If that regression ever comes back, every historical call except the
 * session header silently disappears, so the decoder is checked against a real
 * log on disk whenever one is present.
 */
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { zstdDecompressSync } from 'node:zlib';
import { decodeZstdFrames, extractRows } from '../src/backfill.ts';

/** One real session log to test against, or undefined on a clean machine. */
function findRealSessionLog() {
  const root = join(process.env.HOME ?? '', '.dsh', 'sessions');
  if (!existsSync(root)) return undefined;
  const candidates = [];
  for (const workspace of readdirSync(root)) {
    const workspacePath = join(root, workspace);
    let entries;
    try {
      entries = readdirSync(workspacePath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = join(workspacePath, entry, 'session.v4.jsonl.zstd');
      try {
        const size = statSync(file).size;
        if (size > 4096) candidates.push({ file, size });
      } catch {
        // Not a session directory.
      }
    }
  }
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0]?.file;
}

const realLog = findRealSessionLog();

test('decodeZstdFrames reads every frame, not just the first', { skip: realLog === undefined ? 'no session log on disk' : false }, () => {
  const buffer = readFileSync(realLog);
  const decoded = decodeZstdFrames(buffer);
  const lines = decoded.split('\n').filter(line => line.length > 0);

  // The one-shot API is the trap this decoder exists to avoid.
  const naive = zstdDecompressSync(buffer).toString('utf8').split('\n').filter(Boolean).length;
  assert.equal(naive, 1, 'expected the one-shot decode to stop after the session header');

  assert.ok(lines.length > 10, `expected many events, decoded ${lines.length}`);
  // Cross-check the frame count against the reference implementation.
  const viaCli = execFileSync('/bin/sh', ['-c', `zstd -dc ${JSON.stringify(realLog)} | wc -l`], { encoding: 'utf8' });
  assert.equal(lines.length, Number(viaCli.trim()), 'frame loop disagrees with zstd -dc');
});

test('every decoded line of a real log is valid JSON', { skip: realLog === undefined ? 'no session log on disk' : false }, () => {
  const lines = decodeZstdFrames(readFileSync(realLog)).split('\n').filter(Boolean);
  for (const line of lines) {
    assert.doesNotThrow(() => { JSON.parse(line); }, `unparseable line: ${line.slice(0, 120)}`);
  }
});

test('extractRows pulls usage off assistant/message and gives stable ids', () => {
  const log = [
    JSON.stringify({ type: 'session', version: 4, id: 'session-abc', createdAt: 1, cwd: '/tmp' }),
    JSON.stringify({ type: 'request/header', seq: 1, data: { header: { config: { provider: 'litellm', model: 'glm-5.3' } } } }),
    // No source on the message: the request/header route must be used.
    JSON.stringify({ type: 'assistant/message', seq: 2, time: 1790647365013, data: { usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 100 } } }),
    // Own source wins over the fallback.
    JSON.stringify({
      type: 'assistant/message',
      seq: 3,
      time: 1790647375013,
      data: {
        message: { role: 'assistant', source: { provider: 'deepseek-official', model: 'deepseek-flash' } },
        usage: { inputTokens: 20, outputTokens: 8, cacheReadTokens: 200, reasoningTokens: 3 },
      },
    }),
    // No usage at all: nothing to record.
    JSON.stringify({ type: 'assistant/message', seq: 4, time: 1790647385013, data: { message: { role: 'assistant' } } }),
    // Truncated tail, as after a crash.
    '{"type":"assistant/message","seq":5,"time":1790647',
  ].join('\n');

  const { rows, sessionId } = extractRows(log, 'dir-name');
  assert.equal(sessionId, 'session-abc');
  assert.equal(rows.length, 2);

  assert.equal(rows[0].id, 'backfill:session-abc:2');
  assert.equal(rows[0].provider, 'litellm');
  assert.equal(rows[0].model, 'glm-5.3');
  assert.equal(rows[0].time, 1790647365013);
  assert.equal(rows[0].src, 'backfill');
  assert.equal(rows[1].id, 'backfill:session-abc:3');
  assert.equal(rows[1].provider, 'deepseek-official');
  assert.equal(rows[1].reasoningTokens, 3);
});

test('extractRows is deterministic, so a re-run merges instead of duplicating', () => {
  const log = [
    JSON.stringify({ type: 'session', id: 'session-x' }),
    JSON.stringify({ type: 'assistant/message', seq: 7, time: 1000, data: { usage: { inputTokens: 1, outputTokens: 1 } } }),
  ].join('\n');
  const first = extractRows(log, 'dir').rows.map(row => row.id);
  const second = extractRows(log, 'dir').rows.map(row => row.id);
  assert.deepEqual(first, second);
});

test('extractRows keeps repeated seq values unique', () => {
  // A retry inside one step can report usage twice under the same seq.
  const log = [
    JSON.stringify({ type: 'session', id: 'session-y' }),
    JSON.stringify({ type: 'assistant/message', seq: 9, time: 1000, data: { usage: { inputTokens: 1, outputTokens: 1 } } }),
    JSON.stringify({ type: 'assistant/message', seq: 9, time: 2000, data: { usage: { inputTokens: 2, outputTokens: 2 } } }),
  ].join('\n');
  const rows = extractRows(log, 'dir').rows;
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].id, rows[1].id);
});

test('extractRows drops a usage event with all-zero buckets', () => {
  const log = [
    JSON.stringify({ type: 'session', id: 'session-z' }),
    JSON.stringify({ type: 'assistant/message', seq: 1, time: 1000, data: { usage: { inputTokens: 0, outputTokens: 0 } } }),
  ].join('\n');
  assert.equal(extractRows(log, 'dir').rows.length, 0);
});

test('extractRows falls back to the directory name when the header is missing', () => {
  const log = JSON.stringify({ type: 'assistant/message', seq: 1, time: 1000, data: { usage: { inputTokens: 5, outputTokens: 5 } } });
  const { rows, sessionId } = extractRows(log, 'session-from-dir');
  assert.equal(sessionId, 'session-from-dir');
  assert.equal(rows[0].id, 'backfill:session-from-dir:1');
  // With no declared route at all, the row is still recorded rather than lost.
  assert.equal(rows[0].provider, 'unknown');
});

test('decodeZstdFrames tolerates a truncated buffer', () => {
  const full = readFileSync(realLog ?? '');
  if (realLog === undefined || full.length < 10) return;
  // Half a file must yield the frames that did complete, not throw.
  const half = full.subarray(0, Math.floor(full.length / 2));
  assert.doesNotThrow(() => { decodeZstdFrames(half); });
});
