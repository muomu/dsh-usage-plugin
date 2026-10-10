/**
 * Ledger persistence: one JSON file holding every captured model call.
 *
 * The write discipline mirrors the other DSH accounting plugins so two DSH
 * processes can share the file safely: an atomic `tmp` + `rename`, guarded by a
 * `mkdir` lock directory whose owner file names a pid, plus a debounce so a
 * burst of calls costs one write. Flushing re-reads the file and merges by
 * record id, so a row another process appended is never clobbered.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MAX_RECORDS, type UsageRecord } from './config.ts';

/** Persisted file shape. */
export interface LedgerFile {
  version: 1;
  /** Set once the historical session scan has completed. */
  backfill: { done: boolean; at?: number; scanned?: number; records?: number };
  /** Capture time of the newest row, for cheap freshness checks. */
  updatedAt?: number;
  records: UsageRecord[];
}

/** Empty ledger for first boot. */
function emptyLedger(): LedgerFile {
  return { version: 1, backfill: { done: false }, records: [] };
}

/** Runtime shape guard: accept only rows that carry the fields we aggregate. */
function isRecord(value: unknown): value is UsageRecord {
  if (value === null || typeof value !== 'object') return false;
  const row = value as Partial<UsageRecord>;
  return typeof row.id === 'string'
    && typeof row.time === 'number'
    && Number.isFinite(row.time)
    && typeof row.inputTokens === 'number'
    && typeof row.outputTokens === 'number';
}

/** Coerce a parsed file into a trustworthy ledger. */
function coerce(raw: unknown): LedgerFile {
  if (raw === null || typeof raw !== 'object') return emptyLedger();
  const file = raw as Partial<LedgerFile>;
  const records = Array.isArray(file.records) ? file.records.filter(isRecord) : [];
  const backfill = file.backfill ?? { done: false };
  return {
    version: 1,
    backfill: {
      done: backfill.done === true,
      ...(typeof backfill.at === 'number' ? { at: backfill.at } : {}),
      ...(typeof backfill.scanned === 'number' ? { scanned: backfill.scanned } : {}),
      ...(typeof backfill.records === 'number' ? { records: backfill.records } : {}),
    },
    ...(typeof file.updatedAt === 'number' ? { updatedAt: file.updatedAt } : {}),
    records,
  };
}

/** Sleep helper for the debounce and the lock retry loop. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, ms); });
}

/** True when a process with this pid is alive (signal 0 probes without killing). */
function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Owns the ledger file and the in-memory rows for this process.
 *
 * Rows are held in memory and written on a debounce; `flush()` forces the write
 * and is what shutdown and the one-time backfill call.
 */
export class Ledger {
  private readonly path: string;
  private readonly lockDir: string;
  private file: LedgerFile;
  /** Rows captured by this process and not yet durably merged. */
  private pending: UsageRecord[] = [];
  /** Ids already present, so a repeated capture is dropped without a write. */
  private readonly seen = new Set<string>();
  private timer: NodeJS.Timeout | undefined;
  private writing: Promise<void> | undefined;
  private closed = false;

  private constructor(path: string, file: LedgerFile) {
    this.path = path;
    this.lockDir = `${path}.lock`;
    this.file = file;
    for (const row of file.records) this.seen.add(row.id);
  }

  /**
   * Open the ledger, tolerating a missing or corrupt file.
   * @param path - Absolute path of `ledger.json`.
   * @returns The opened ledger.
   */
  static async open(path: string): Promise<Ledger> {
    let file = emptyLedger();
    try {
      file = coerce(JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        // A corrupt file must not take the plugin down; start clean and let
        // the next flush replace it.
        console.warn(`[dsh-usage-tokens] ledger unreadable, starting empty: ${String(error)}`);
      }
    }
    return new Ledger(path, file);
  }

  /** Every durable row plus everything captured in this process. */
  get records(): readonly UsageRecord[] {
    return this.pending.length === 0 ? this.file.records : [...this.file.records, ...this.pending];
  }

  /** Whether the historical scan has completed. */
  get backfilled(): boolean {
    return this.file.backfill.done;
  }

  /** Number of durable rows. */
  get size(): number {
    return this.file.records.length + this.pending.length;
  }

  /** True when this id was already captured, live or by backfill. */
  has(id: string): boolean {
    return this.seen.has(id);
  }

  /**
   * Record one model call. Duplicate ids are dropped silently, which is what
   * keeps the live capture and the historical scan from double counting the
   * same call across restarts.
   * @param row - The call to append.
   * @returns True when the row was new.
   */
  append(row: UsageRecord): boolean {
    if (this.closed || this.seen.has(row.id)) return false;
    this.seen.add(row.id);
    this.pending.push(row);
    this.schedule();
    return true;
  }

  /** Append many rows at once, writing once. */
  appendAll(rows: readonly UsageRecord[]): number {
    let added = 0;
    for (const row of rows) {
      if (this.closed || this.seen.has(row.id)) continue;
      this.seen.add(row.id);
      this.pending.push(row);
      added += 1;
    }
    if (added > 0) this.schedule();
    return added;
  }

  /** Mark the historical scan finished and persist that fact. */
  async markBackfilled(stats: { scanned: number; records: number }): Promise<void> {
    // The rows first, the flag second. `backfilled` is what tells the browser
    // its figures are final, and a flush clears `pending` before the new file
    // image lands, so flipping the flag first would advertise a complete ledger
    // in the moment the last batch is invisible — the integration test caught
    // exactly that as a one-in-five flake.
    await this.flush();
    this.file.backfill = { done: true, at: Date.now(), scanned: stats.scanned, records: stats.records };
    await this.flush();
  }

  /** Debounced write. */
  private schedule(): void {
    if (this.timer !== undefined || this.closed) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, 1_500);
    this.timer.unref?.();
  }

  /**
   * Merge pending rows into the file and write atomically.
   *
   * Re-reads the file first so a concurrent process's rows survive, then
   * dedupes by id and trims to the retention cap.
   */
  async flush(): Promise<void> {
    if (this.writing !== undefined) {
      await this.writing;
      if (this.pending.length === 0) return;
    }
    this.writing = this.writeOnce();
    try {
      await this.writing;
    } finally {
      this.writing = undefined;
    }
  }

  /** One serialized write cycle. */
  private async writeOnce(): Promise<void> {
    const batch = this.pending;
    this.pending = [];
    const backfillChanged = this.file.backfill.done;
    if (batch.length === 0 && !backfillChanged) return;

    const release = await this.acquireLock();
    try {
      let base = this.file;
      try {
        base = coerce(JSON.parse(await readFile(this.path, 'utf8')));
      } catch {
        // No file yet, or unreadable: our own in-memory state is the base.
      }
      const merged = new Map<string, UsageRecord>();
      for (const row of base.records) merged.set(row.id, row);
      for (const row of this.file.records) merged.set(row.id, row);
      for (const row of batch) merged.set(row.id, row);

      let records = [...merged.values()];
      records.sort((a, b) => a.time - b.time);
      if (records.length > MAX_RECORDS) records = records.slice(records.length - MAX_RECORDS);

      const next: LedgerFile = {
        version: 1,
        backfill: this.file.backfill.done ? this.file.backfill : base.backfill,
        updatedAt: Date.now(),
        records,
      };

      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.${process.pid}-${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(next), { encoding: 'utf8', flag: 'wx' });
      await rename(tmp, this.path);

      this.file = next;
      for (const row of records) this.seen.add(row.id);
    } finally {
      await release();
    }
  }

  /**
   * Take the cross-process lock, breaking one whose owner is gone.
   * @returns The release function.
   */
  private async acquireLock(): Promise<() => Promise<void>> {
    const owner = join(this.lockDir, 'owner');
    // Create the containing directory first: on a cold start the storage
    // directory does not exist yet, and a plain `mkdir` of the lock directory
    // would fail with ENOENT rather than EEXIST.
    await mkdir(dirname(this.lockDir), { recursive: true });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        await mkdir(this.lockDir);
        await writeFile(owner, JSON.stringify({ pid: process.pid, at: Date.now() }), 'utf8');
        return async () => { await rm(this.lockDir, { recursive: true, force: true }); };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        // Held: is the holder still alive?
        try {
          const held = JSON.parse(await readFile(owner, 'utf8')) as { pid?: number; at?: number };
          const stale = (typeof held.pid === 'number' && !pidAlive(held.pid))
            || (typeof held.at === 'number' && Date.now() - held.at > 30_000);
          if (stale) {
            await rm(this.lockDir, { recursive: true, force: true });
            continue;
          }
        } catch {
          // Lock dir exists without a readable owner: likely mid-creation.
        }
        await delay(50);
      }
    }
    // Give up waiting rather than blocking capture forever; the caller's rows
    // stay pending and the next flush retries.
    throw new Error(`[dsh-usage-tokens] could not acquire ledger lock at ${this.lockDir}`);
  }

  /** Flush and stop debouncing. Safe to call twice. */
  async close(): Promise<void> {
    if (this.closed) return;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    await this.flush();
    this.closed = true;
  }
}
