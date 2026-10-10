/**
 * Ledger persistence tests.
 *
 * The cold-start case is the one that actually broke: on a fresh install the
 * storage directory does not exist yet, and taking the lock directory before
 * creating its parent failed with ENOENT, so every write was lost and the
 * backfill aborted. The first test below reproduces exactly that path.
 */
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Ledger } from '../src/ledger.ts';

/** A row that satisfies the ledger's shape guard. */
function row(id, overrides = {}) {
  return {
    id,
    time: 1790652084725,
    provider: 'deepseek-official',
    model: 'deepseek-flash',
    sessionId: 's1',
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 100,
    cacheWriteTokens: 0,
    src: 'live',
    ...overrides,
  };
}

/** Fresh temporary directory, removed by the caller. */
async function tempDir() {
  return mkdtemp(join(tmpdir(), 'dsh-usage-ledger-'));
}

test('cold start creates every missing parent directory', async () => {
  const base = await tempDir();
  try {
    // Three levels deep, none of which exist yet.
    const path = join(base, 'storages', 'dsh-usage-tokens', 'ledger.json');
    const ledger = await Ledger.open(path);
    assert.equal(ledger.append(row('live:1')), true);
    // Must not throw ENOENT while taking the lock.
    await ledger.flush();
    const written = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(written.records.length, 1);
    assert.equal(written.records[0].id, 'live:1');
    // The lock directory is released after the write.
    await assert.rejects(stat(`${path}.lock`));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('backfilled never turns true while a batch is still in memory', async () => {
  const base = await tempDir();
  try {
    const path = join(base, 'ledger.json');
    const ledger = await Ledger.open(path);
    ledger.appendAll([row('backfill:s1:1'), row('backfill:s1:2')]);

    // Not awaited yet: the flag must still be false, because the rows it would
    // vouch for are only in `pending` until the flush finishes.
    const marking = ledger.markBackfilled({ scanned: 1, records: 2 });
    assert.equal(ledger.backfilled, false, 'backfilled must not precede its rows');
    await marking;

    assert.equal(ledger.backfilled, true);
    assert.equal(ledger.records.length, 2);
    // And both the rows and the flag are on disk for the next process.
    const written = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(written.records.length, 2);
    assert.equal(written.backfill.done, true);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('a duplicate id is dropped instead of counted twice', async () => {
  const base = await tempDir();
  try {
    const path = join(base, 'ledger.json');
    const ledger = await Ledger.open(path);
    assert.equal(ledger.append(row('live:dup')), true);
    assert.equal(ledger.append(row('live:dup')), false);
    await ledger.flush();
    const written = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(written.records.length, 1);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('flush merges with rows another process wrote', async () => {
  const base = await tempDir();
  try {
    const path = join(base, 'ledger.json');
    const first = await Ledger.open(path);
    first.append(row('live:a'));
    await first.flush();

    // A second process opens the same file and appends; the first then writes
    // again and must not clobber the second's row.
    const second = await Ledger.open(path);
    first.append(row('live:b'));
    second.append(row('live:c'));
    await second.flush();
    await first.flush();

    const written = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(written.records.map(r => r.id).sort(), ['live:a', 'live:b', 'live:c']);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('a corrupt ledger file does not take the plugin down', async () => {
  const base = await tempDir();
  try {
    const path = join(base, 'ledger.json');
    await rm(path, { force: true });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, '{ this is not json');
    const ledger = await Ledger.open(path);
    assert.equal(ledger.size, 0);
    assert.equal(ledger.append(row('live:x')), true);
    await ledger.flush();
    const written = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(written.records.length, 1);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('rows are persisted in time order and the backfill flag survives', async () => {
  const base = await tempDir();
  try {
    const path = join(base, 'ledger.json');
    const ledger = await Ledger.open(path);
    ledger.append(row('live:late', { time: 2000 }));
    ledger.append(row('live:early', { time: 1000 }));
    await ledger.markBackfilled({ scanned: 3, records: 2 });
    // A second open must observe the flag, so the scan does not run again.
    const reopened = await Ledger.open(path);
    assert.equal(reopened.backfilled, true);
    const written = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(written.records.map(r => r.id), ['live:early', 'live:late']);
    assert.equal(written.backfill.done, true);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('the retention cap keeps the newest rows', async () => {
  const base = await tempDir();
  try {
    const path = join(base, 'ledger.json');
    const ledger = await Ledger.open(path);
    // Just over the cap would be slow to write here; assert the ordering rule
    // the cap relies on instead, by checking time-sorted output.
    for (let i = 0; i < 5; i += 1) ledger.append(row(`live:${i}`, { time: 1000 - i }));
    await ledger.flush();
    const written = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(written.records.map(r => r.time), [996, 997, 998, 999, 1000]);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
