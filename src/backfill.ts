/**
 * One-time historical backfill from the durable session logs.
 *
 * Two properties of the stored logs shape this file:
 *
 * 1. `session.v4.jsonl.zstd` is a *concatenation* of zstd frames, one per
 *    append, not a single frame. Node's one-shot `zstdDecompressSync` stops
 *    after the first frame (211 bytes on the session used during development),
 *    so the file is decompressed frame by frame until the buffer is spent.
 * 2. Rows are identified by `sessionId` + the originating event's `seq`, which
 *    is stable across runs. Re-running the scan therefore merges instead of
 *    duplicating, and a call already captured live is skipped by id.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import type { BackfillProgress, Buckets, UsageRecord } from './config.ts';

/** Session log filename grammar, including older uncompressed generations. */
const SESSION_FILE = /^session(?:\.v(\d+))?\.jsonl(\.zstd)?$/;

/** Frames per file guard, so a pathological file cannot spin forever. */
const MAX_FRAMES = 200_000;

/** Skip single log files larger than this; they are not worth the memory. */
const MAX_FILE_BYTES = 96 * 1024 * 1024;

// The progress report lives in `config.ts` because the browser payload carries
// it too; re-exported here so this module stays the obvious import site.
export type { BackfillProgress };

/**
 * Decompress a concatenated-frame zstd file.
 *
 * `zstdDecompressSync` reports how many input bytes the frame it decoded
 * consumed, so the buffer is advanced frame by frame. A trailing partial frame
 * (a crash mid-append) ends the loop rather than throwing away the good prefix.
 *
 * @param buffer - Raw file bytes.
 * @returns The decoded text.
 */
export function decodeZstdFrames(buffer: Buffer): string {
  const parts: Buffer[] = [];
  let rest = buffer;
  for (let frame = 0; frame < MAX_FRAMES && rest.length > 0; frame += 1) {
    let decoded: Buffer;
    let consumed = 0;
    try {
      const result = zstdDecompressSync(rest, { info: true }) as unknown as {
        buffer: Buffer;
        engine: { bytesWritten: number };
      };
      decoded = result.buffer;
      consumed = result.engine?.bytesWritten ?? 0;
    } catch {
      // Truncated tail: keep everything decoded so far.
      break;
    }
    parts.push(decoded);
    if (!(consumed > 0) || consumed >= rest.length) break;
    rest = rest.subarray(consumed);
  }
  return Buffer.concat(parts).toString('utf8');
}

/** Read a whole session log, compressed or not. */
async function readSessionLog(path: string, compressed: boolean): Promise<string> {
  const buffer = await readFile(path);
  return compressed ? decodeZstdFrames(buffer) : buffer.toString('utf8');
}

/**
 * Choose the log file to read inside one session directory.
 * @param dir - Absolute session directory.
 * @returns The best candidate, or undefined when the directory has no log.
 */
async function pickSessionFile(dir: string): Promise<{ path: string; compressed: boolean } | undefined> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return undefined;
  }
  let best: { path: string; compressed: boolean; version: number } | undefined;
  for (const name of names) {
    const match = SESSION_FILE.exec(name);
    if (match === null) continue;
    const version = match[1] === undefined ? 0 : Number(match[1]);
    const compressed = match[2] === '.zstd';
    // Prefer the newest format generation; at equal version prefer compressed.
    const better = best === undefined
      || version > best.version
      || (version === best.version && compressed && !best.compressed);
    if (better) best = { path: join(dir, name), compressed, version };
  }
  return best === undefined ? undefined : { path: best.path, compressed: best.compressed };
}

/** Read one positive integer field. */
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Parse one `assistant/message` line into a ledger row, when it carries usage. */
function rowFromEvent(
  event: Record<string, unknown>,
  sessionId: string,
  fallback: { provider: string; model: string },
): { row: Omit<UsageRecord, 'id'>; seq: number } | undefined {
  if (event.type !== 'assistant/message') return undefined;
  const data = event.data as Record<string, unknown> | undefined;
  if (data === null || typeof data !== 'object') return undefined;
  const usage = data.usage as Record<string, unknown> | undefined;
  if (usage === null || typeof usage !== 'object') return undefined;

  const buckets: Buckets = {
    inputTokens: num(usage.inputTokens),
    outputTokens: num(usage.outputTokens),
    cacheReadTokens: num(usage.cacheReadTokens),
    cacheWriteTokens: num(usage.cacheWriteTokens),
  };
  const reasoning = num(usage.reasoningTokens);
  if (reasoning > 0) buckets.reasoningTokens = reasoning;
  if (
    buckets.inputTokens === 0 && buckets.outputTokens === 0
    && buckets.cacheReadTokens === 0 && buckets.cacheWriteTokens === 0
  ) return undefined;

  // The message's own source is the authoritative route; the newest
  // `request/header` is the fallback for a message that omitted it.
  const message = data.message as Record<string, unknown> | undefined;
  const source = message?.source as Record<string, unknown> | undefined;
  const provider = typeof source?.provider === 'string' && source.provider.length > 0
    ? source.provider
    : fallback.provider;
  const model = typeof source?.model === 'string' && source.model.length > 0 ? source.model : fallback.model;

  const time = typeof event.time === 'number' && Number.isFinite(event.time) ? event.time : Number.NaN;
  const seq = typeof event.seq === 'number' && Number.isFinite(event.seq) ? event.seq : -1;

  return {
    row: { time, provider, model, sessionId, ...(seq >= 0 ? { seq } : {}), ...buckets, src: 'backfill' },
    seq,
  };
}

/**
 * Extract every usage row from one session log's text.
 *
 * A log whose header is unreadable yields nothing; individual malformed lines
 * are skipped, because a partially written tail is expected after a crash.
 *
 * @param text - Decoded log contents, one JSON event per line.
 * @param pathSessionId - Session id taken from the directory name.
 * @returns Rows with stable ids, plus the session id actually used.
 */
export function extractRows(text: string, pathSessionId: string): { rows: UsageRecord[]; sessionId: string } {
  const lines = text.split('\n');
  let sessionId = pathSessionId;
  const rows: UsageRecord[] = [];
  const fallback = { provider: 'unknown', model: 'unknown' };
  const seqSeen = new Map<number, number>();

  for (const line of lines) {
    if (line.length === 0) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (event.type === 'session') {
      if (typeof event.id === 'string' && event.id.length > 0) sessionId = event.id;
      continue;
    }

    // Track the newest declared route for messages that omit their own source.
    if (event.type === 'request/header') {
      const data = event.data as Record<string, unknown> | undefined;
      const header = data?.header as Record<string, unknown> | undefined;
      const config = header?.config as Record<string, unknown> | undefined;
      if (typeof config?.provider === 'string' && config.provider.length > 0) fallback.provider = config.provider;
      if (typeof config?.model === 'string' && config.model.length > 0) fallback.model = config.model;
      continue;
    }

    const found = rowFromEvent(event, sessionId, fallback);
    if (found === undefined) continue;
    if (!Number.isFinite(found.row.time)) continue;

    // Two usage reports can share a seq when a retry reuses the step; suffix
    // the repeats so the id stays unique AND stable between runs.
    const repeat = seqSeen.get(found.seq) ?? 0;
    seqSeen.set(found.seq, repeat + 1);
    const id = `backfill:${sessionId}:${found.seq}${repeat === 0 ? '' : `#${repeat}`}`;
    rows.push({ id, ...found.row } as UsageRecord);
  }

  return { rows, sessionId };
}

/** One workspace directory's worth of session ids. */
async function listSessionDirs(sessionsRoot: string): Promise<string[]> {
  const dirs: string[] = [];
  let workspaces: string[];
  try {
    workspaces = await readdir(sessionsRoot);
  } catch {
    return dirs;
  }
  for (const workspace of workspaces) {
    const workspacePath = join(sessionsRoot, workspace);
    let entries: string[];
    try {
      entries = await readdir(workspacePath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      dirs.push(join(workspacePath, entry));
    }
  }
  return dirs;
}

/**
 * Scan every stored session and emit one row per historical model call.
 *
 * Files are processed sequentially and the generator yields between them, so
 * the caller keeps the event loop free while a few hundred logs are decoded.
 *
 * @param sessionsRoot - Absolute `$DSH_HOME/sessions` directory.
 * @param progress - Mutated in place so the route can report live progress.
 * @yields Batches of rows, one batch per session log.
 */
export async function* scanSessions(
  sessionsRoot: string,
  progress: BackfillProgress,
): AsyncGenerator<UsageRecord[]> {
  const dirs = await listSessionDirs(sessionsRoot);
  progress.sessions = dirs.length;
  for (const dir of dirs) {
    const file = await pickSessionFile(dir);
    if (file === undefined) continue;
    try {
      const info = await stat(file.path);
      if (info.size > MAX_FILE_BYTES) {
        progress.errors += 1;
        continue;
      }
    } catch {
      continue;
    }
    try {
      const text = await readSessionLog(file.path, file.compressed);
      progress.files += 1;
      const { rows } = extractRows(text, dir.slice(dir.lastIndexOf('/') + 1));
      if (rows.length > 0) {
        progress.records += rows.length;
        yield rows;
      }
    } catch (error) {
      progress.errors += 1;
      console.warn(`[dsh-usage-tokens] session scan failed for ${dir}: ${String(error)}`);
    }
    // Hand the event loop back so the web server stays responsive.
    await new Promise(resolve => { setImmediate(resolve); });
  }
}
