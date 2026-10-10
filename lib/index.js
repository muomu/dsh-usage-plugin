// src/index.ts
import { homedir } from "node:os";
import { join as join3 } from "node:path";

// src/config.ts
function zeroBuckets() {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 };
}
function zeroTotals() {
  return { calls: 0, ...zeroBuckets(), totalTokens: 0 };
}
function addInto(target, row) {
  target.inputTokens += row.inputTokens || 0;
  target.outputTokens += row.outputTokens || 0;
  target.cacheReadTokens += row.cacheReadTokens || 0;
  target.cacheWriteTokens += row.cacheWriteTokens || 0;
  target.reasoningTokens = (target.reasoningTokens ?? 0) + (row.reasoningTokens ?? 0);
}
function addTotals(target, row) {
  addInto(target, row);
  target.calls += 1;
  target.totalTokens = totalTokens(target);
}
function billedInputTokens(b) {
  return (b.inputTokens || 0) + (b.cacheReadTokens || 0) + (b.cacheWriteTokens || 0);
}
function totalTokens(b) {
  return billedInputTokens(b) + (b.outputTokens || 0);
}
function cacheHitRate(b) {
  const billed = billedInputTokens(b);
  if (billed <= 0) return null;
  return (b.cacheReadTokens || 0) / billed;
}
function dayKey(timeMs) {
  const d = new Date(timeMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function hourKey(timeMs) {
  const h = String(new Date(timeMs).getHours()).padStart(2, "0");
  return `${dayKey(timeMs)}T${h}`;
}
function timeKey(timeMs, grain) {
  return grain === "hour" ? hourKey(timeMs) : dayKey(timeMs);
}
function parseTimeKey(key) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (day !== null) {
    const ms = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])).getTime();
    return dayKey(ms) === key ? { grain: "day", start: ms } : null;
  }
  const hour = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(key);
  if (hour !== null) {
    const ms = new Date(Number(hour[1]), Number(hour[2]) - 1, Number(hour[3]), Number(hour[4])).getTime();
    return hourKey(ms) === key ? { grain: "hour", start: ms } : null;
  }
  return null;
}
function startOfLocalDay(timeMs) {
  const d = new Date(timeMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function floorToGrain(timeMs, grain) {
  const d = new Date(timeMs);
  if (grain === "hour") d.setMinutes(0, 0, 0);
  else d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function nextBucketStart(start, grain) {
  const d = new Date(start);
  if (grain === "hour") {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  } else {
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
  }
  return d.getTime();
}
function modelKey(provider, model) {
  return `${provider || "unknown"}:${model || "unknown"}`;
}
function daySpan(fromMs, toMs) {
  const a = new Date(fromMs);
  const b = new Date(toMs);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 864e5) + 1;
}
function resolveRange(request, nowMs) {
  const todayStart = startOfLocalDay(nowMs);
  const parsedFrom = parseTimeKey(request.from ?? "");
  const parsedTo = parseTimeKey(request.to ?? "");
  let fromStart = parsedFrom?.start ?? todayStart;
  const toStart = parsedTo?.start ?? todayStart;
  if (fromStart > toStart) fromStart = toStart;
  const oldest = new Date(toStart);
  oldest.setDate(oldest.getDate() - (MAX_RANGE_DAYS - 1));
  oldest.setHours(0, 0, 0, 0);
  if (fromStart < oldest.getTime()) fromStart = oldest.getTime();
  let grain = request.grain === "hour" ? "hour" : "day";
  let coarsened = false;
  if (grain === "hour" && daySpan(fromStart, toStart) > MAX_HOUR_RANGE_DAYS) {
    grain = "day";
    coarsened = true;
  }
  let lastStart = floorToGrain(toStart, grain);
  if (grain === "hour" && parsedTo?.grain === "day") {
    const end = new Date(toStart);
    end.setHours(23, 0, 0, 0);
    lastStart = end.getTime();
  }
  const buckets = [];
  let cursor = floorToGrain(fromStart, grain);
  const limit = MAX_RANGE_DAYS * 24;
  while (cursor <= lastStart && buckets.length < limit) {
    const end = nextBucketStart(cursor, grain);
    if (end <= cursor) break;
    buckets.push({ key: timeKey(cursor, grain), start: cursor, end });
    cursor = end;
  }
  if (buckets.length === 0) {
    buckets.push({ key: timeKey(lastStart, grain), start: lastStart, end: nextBucketStart(lastStart, grain) });
  }
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  return {
    from: first.key,
    to: last.key,
    grain,
    fromMs: first.start,
    toMs: last.end,
    buckets,
    coarsened
  };
}
var ROUTE_PREFIX = "/api/dsh-usage-tokens";
var MAX_RANGE_DAYS = 366;
var MAX_HOUR_RANGE_DAYS = 31;
var LEDGER_RELATIVE_PATH = ["storages", "dsh-usage-tokens", "ledger.json"];
var MAX_RECORDS = 2e5;

// src/collect.ts
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
var streamDepth = new AsyncLocalStorage();
var DEDUPE_WINDOW_MS = 1e4;
function num(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
function bucketsOf(usage) {
  const out = {
    inputTokens: num(usage.inputTokens),
    outputTokens: num(usage.outputTokens),
    cacheReadTokens: num(usage.cacheReadTokens),
    cacheWriteTokens: num(usage.cacheWriteTokens)
  };
  const reasoning = num(usage.reasoningTokens);
  if (reasoning > 0) out.reasoningTokens = reasoning;
  return out;
}
function isEmpty(b) {
  return b.inputTokens === 0 && b.outputTokens === 0 && b.cacheReadTokens === 0 && b.cacheWriteTokens === 0;
}
function createStreamCapture(sink, options = {}) {
  const now = options.now ?? Date.now;
  const newId = options.id ?? randomUUID;
  const recent = /* @__PURE__ */ new Map();
  return function captureStream(opts, next) {
    const downstream = next();
    if (streamDepth.getStore() !== void 0) return downstream;
    const startedAtMs = now();
    const provider = typeof opts?.provider === "string" && opts.provider.length > 0 ? opts.provider : "unknown";
    const model = typeof opts?.model === "string" && opts.model.length > 0 ? opts.model : "unknown";
    const sessionId = typeof opts?.sessionId === "string" ? opts.sessionId : "";
    return (async function* measured() {
      let usage;
      const iterator = downstream[Symbol.asyncIterator]();
      let completed = false;
      try {
        for (; ; ) {
          const result = await streamDepth.run(1, () => iterator.next());
          if (result.done === true) break;
          const chunk = result.value;
          if (chunk !== null && typeof chunk === "object" && chunk.type === "usage" && chunk.usage != null) {
            usage = bucketsOf(chunk.usage);
          }
          yield chunk;
        }
        completed = true;
      } finally {
        if (!completed) {
          try {
            await iterator.return?.();
          } catch {
          }
        }
        if (usage !== void 0 && !isEmpty(usage)) {
          const fingerprint = [
            provider,
            model,
            usage.inputTokens,
            usage.outputTokens,
            usage.cacheReadTokens,
            usage.cacheWriteTokens
          ].join("|");
          const last = recent.get(fingerprint);
          const duplicate = last !== void 0 && startedAtMs - last < DEDUPE_WINDOW_MS;
          if (!duplicate) {
            recent.set(fingerprint, startedAtMs);
            if (recent.size > 256) {
              for (const [key, at] of recent) {
                if (startedAtMs - at >= DEDUPE_WINDOW_MS) recent.delete(key);
              }
            }
            sink.append({
              id: `live:${newId()}`,
              time: startedAtMs,
              provider,
              model,
              sessionId,
              ...typeof opts?.purpose === "string" && opts.purpose.length > 0 ? { purpose: opts.purpose } : {},
              ...usage,
              src: "live"
            });
          }
        }
      }
    })();
  };
}

// src/ledger.ts
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
function emptyLedger() {
  return { version: 1, backfill: { done: false }, records: [] };
}
function isRecord(value) {
  if (value === null || typeof value !== "object") return false;
  const row = value;
  return typeof row.id === "string" && typeof row.time === "number" && Number.isFinite(row.time) && typeof row.inputTokens === "number" && typeof row.outputTokens === "number";
}
function coerce(raw) {
  if (raw === null || typeof raw !== "object") return emptyLedger();
  const file = raw;
  const records = Array.isArray(file.records) ? file.records.filter(isRecord) : [];
  const backfill = file.backfill ?? { done: false };
  return {
    version: 1,
    backfill: {
      done: backfill.done === true,
      ...typeof backfill.at === "number" ? { at: backfill.at } : {},
      ...typeof backfill.scanned === "number" ? { scanned: backfill.scanned } : {},
      ...typeof backfill.records === "number" ? { records: backfill.records } : {}
    },
    ...typeof file.updatedAt === "number" ? { updatedAt: file.updatedAt } : {},
    records
  };
}
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
var Ledger = class _Ledger {
  path;
  lockDir;
  file;
  /** Rows captured by this process and not yet durably merged. */
  pending = [];
  /** Ids already present, so a repeated capture is dropped without a write. */
  seen = /* @__PURE__ */ new Set();
  timer;
  writing;
  closed = false;
  constructor(path, file) {
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
  static async open(path) {
    let file = emptyLedger();
    try {
      file = coerce(JSON.parse(await readFile(path, "utf8")));
    } catch (error) {
      const code = error.code;
      if (code !== "ENOENT") {
        console.warn(`[dsh-usage-tokens] ledger unreadable, starting empty: ${String(error)}`);
      }
    }
    return new _Ledger(path, file);
  }
  /** Every durable row plus everything captured in this process. */
  get records() {
    return this.pending.length === 0 ? this.file.records : [...this.file.records, ...this.pending];
  }
  /** Whether the historical scan has completed. */
  get backfilled() {
    return this.file.backfill.done;
  }
  /** Number of durable rows. */
  get size() {
    return this.file.records.length + this.pending.length;
  }
  /** True when this id was already captured, live or by backfill. */
  has(id) {
    return this.seen.has(id);
  }
  /**
   * Record one model call. Duplicate ids are dropped silently, which is what
   * keeps the live capture and the historical scan from double counting the
   * same call across restarts.
   * @param row - The call to append.
   * @returns True when the row was new.
   */
  append(row) {
    if (this.closed || this.seen.has(row.id)) return false;
    this.seen.add(row.id);
    this.pending.push(row);
    this.schedule();
    return true;
  }
  /** Append many rows at once, writing once. */
  appendAll(rows) {
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
  async markBackfilled(stats) {
    await this.flush();
    this.file.backfill = { done: true, at: Date.now(), scanned: stats.scanned, records: stats.records };
    await this.flush();
  }
  /** Debounced write. */
  schedule() {
    if (this.timer !== void 0 || this.closed) return;
    this.timer = setTimeout(() => {
      this.timer = void 0;
      void this.flush();
    }, 1500);
    this.timer.unref?.();
  }
  /**
   * Merge pending rows into the file and write atomically.
   *
   * Re-reads the file first so a concurrent process's rows survive, then
   * dedupes by id and trims to the retention cap.
   */
  async flush() {
    if (this.writing !== void 0) {
      await this.writing;
      if (this.pending.length === 0) return;
    }
    this.writing = this.writeOnce();
    try {
      await this.writing;
    } finally {
      this.writing = void 0;
    }
  }
  /** One serialized write cycle. */
  async writeOnce() {
    const batch = this.pending;
    this.pending = [];
    const backfillChanged = this.file.backfill.done;
    if (batch.length === 0 && !backfillChanged) return;
    const release = await this.acquireLock();
    try {
      let base = this.file;
      try {
        base = coerce(JSON.parse(await readFile(this.path, "utf8")));
      } catch {
      }
      const merged = /* @__PURE__ */ new Map();
      for (const row of base.records) merged.set(row.id, row);
      for (const row of this.file.records) merged.set(row.id, row);
      for (const row of batch) merged.set(row.id, row);
      let records = [...merged.values()];
      records.sort((a, b) => a.time - b.time);
      if (records.length > MAX_RECORDS) records = records.slice(records.length - MAX_RECORDS);
      const next = {
        version: 1,
        backfill: this.file.backfill.done ? this.file.backfill : base.backfill,
        updatedAt: Date.now(),
        records
      };
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.${process.pid}-${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(next), { encoding: "utf8", flag: "wx" });
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
  async acquireLock() {
    const owner = join(this.lockDir, "owner");
    await mkdir(dirname(this.lockDir), { recursive: true });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        await mkdir(this.lockDir);
        await writeFile(owner, JSON.stringify({ pid: process.pid, at: Date.now() }), "utf8");
        return async () => {
          await rm(this.lockDir, { recursive: true, force: true });
        };
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        try {
          const held = JSON.parse(await readFile(owner, "utf8"));
          const stale = typeof held.pid === "number" && !pidAlive(held.pid) || typeof held.at === "number" && Date.now() - held.at > 3e4;
          if (stale) {
            await rm(this.lockDir, { recursive: true, force: true });
            continue;
          }
        } catch {
        }
        await delay(50);
      }
    }
    throw new Error(`[dsh-usage-tokens] could not acquire ledger lock at ${this.lockDir}`);
  }
  /** Flush and stop debouncing. Safe to call twice. */
  async close() {
    if (this.closed) return;
    if (this.timer !== void 0) {
      clearTimeout(this.timer);
      this.timer = void 0;
    }
    await this.flush();
    this.closed = true;
  }
};

// src/backfill.ts
import { readdir, readFile as readFile2, stat } from "node:fs/promises";
import { join as join2 } from "node:path";
import { zstdDecompressSync } from "node:zlib";
var SESSION_FILE = /^session(?:\.v(\d+))?\.jsonl(\.zstd)?$/;
var MAX_FRAMES = 2e5;
var MAX_FILE_BYTES = 96 * 1024 * 1024;
function decodeZstdFrames(buffer) {
  const parts = [];
  let rest = buffer;
  for (let frame = 0; frame < MAX_FRAMES && rest.length > 0; frame += 1) {
    let decoded;
    let consumed = 0;
    try {
      const result = zstdDecompressSync(rest, { info: true });
      decoded = result.buffer;
      consumed = result.engine?.bytesWritten ?? 0;
    } catch {
      break;
    }
    parts.push(decoded);
    if (!(consumed > 0) || consumed >= rest.length) break;
    rest = rest.subarray(consumed);
  }
  return Buffer.concat(parts).toString("utf8");
}
async function readSessionLog(path, compressed) {
  const buffer = await readFile2(path);
  return compressed ? decodeZstdFrames(buffer) : buffer.toString("utf8");
}
async function pickSessionFile(dir) {
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return void 0;
  }
  let best;
  for (const name of names) {
    const match = SESSION_FILE.exec(name);
    if (match === null) continue;
    const version = match[1] === void 0 ? 0 : Number(match[1]);
    const compressed = match[2] === ".zstd";
    const better = best === void 0 || version > best.version || version === best.version && compressed && !best.compressed;
    if (better) best = { path: join2(dir, name), compressed, version };
  }
  return best === void 0 ? void 0 : { path: best.path, compressed: best.compressed };
}
function num2(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
function rowFromEvent(event, sessionId, fallback) {
  if (event.type !== "assistant/message") return void 0;
  const data = event.data;
  if (data === null || typeof data !== "object") return void 0;
  const usage = data.usage;
  if (usage === null || typeof usage !== "object") return void 0;
  const buckets = {
    inputTokens: num2(usage.inputTokens),
    outputTokens: num2(usage.outputTokens),
    cacheReadTokens: num2(usage.cacheReadTokens),
    cacheWriteTokens: num2(usage.cacheWriteTokens)
  };
  const reasoning = num2(usage.reasoningTokens);
  if (reasoning > 0) buckets.reasoningTokens = reasoning;
  if (buckets.inputTokens === 0 && buckets.outputTokens === 0 && buckets.cacheReadTokens === 0 && buckets.cacheWriteTokens === 0) return void 0;
  const message = data.message;
  const source = message?.source;
  const provider = typeof source?.provider === "string" && source.provider.length > 0 ? source.provider : fallback.provider;
  const model = typeof source?.model === "string" && source.model.length > 0 ? source.model : fallback.model;
  const time = typeof event.time === "number" && Number.isFinite(event.time) ? event.time : Number.NaN;
  const seq = typeof event.seq === "number" && Number.isFinite(event.seq) ? event.seq : -1;
  return {
    row: { time, provider, model, sessionId, ...seq >= 0 ? { seq } : {}, ...buckets, src: "backfill" },
    seq
  };
}
function extractRows(text, pathSessionId) {
  const lines = text.split("\n");
  let sessionId = pathSessionId;
  const rows = [];
  const fallback = { provider: "unknown", model: "unknown" };
  const seqSeen = /* @__PURE__ */ new Map();
  for (const line of lines) {
    if (line.length === 0) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "session") {
      if (typeof event.id === "string" && event.id.length > 0) sessionId = event.id;
      continue;
    }
    if (event.type === "request/header") {
      const data = event.data;
      const header = data?.header;
      const config = header?.config;
      if (typeof config?.provider === "string" && config.provider.length > 0) fallback.provider = config.provider;
      if (typeof config?.model === "string" && config.model.length > 0) fallback.model = config.model;
      continue;
    }
    const found = rowFromEvent(event, sessionId, fallback);
    if (found === void 0) continue;
    if (!Number.isFinite(found.row.time)) continue;
    const repeat = seqSeen.get(found.seq) ?? 0;
    seqSeen.set(found.seq, repeat + 1);
    const id = `backfill:${sessionId}:${found.seq}${repeat === 0 ? "" : `#${repeat}`}`;
    rows.push({ id, ...found.row });
  }
  return { rows, sessionId };
}
async function listSessionDirs(sessionsRoot2) {
  const dirs = [];
  let workspaces;
  try {
    workspaces = await readdir(sessionsRoot2);
  } catch {
    return dirs;
  }
  for (const workspace of workspaces) {
    const workspacePath = join2(sessionsRoot2, workspace);
    let entries;
    try {
      entries = await readdir(workspacePath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      dirs.push(join2(workspacePath, entry));
    }
  }
  return dirs;
}
async function* scanSessions(sessionsRoot2, progress) {
  const dirs = await listSessionDirs(sessionsRoot2);
  progress.sessions = dirs.length;
  for (const dir of dirs) {
    const file = await pickSessionFile(dir);
    if (file === void 0) continue;
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
      const { rows } = extractRows(text, dir.slice(dir.lastIndexOf("/") + 1));
      if (rows.length > 0) {
        progress.records += rows.length;
        yield rows;
      }
    } catch (error) {
      progress.errors += 1;
      console.warn(`[dsh-usage-tokens] session scan failed for ${dir}: ${String(error)}`);
    }
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
}

// src/aggregate.ts
function splitKey(key) {
  const at = key.indexOf(":");
  return at < 0 ? { provider: key, model: "unknown" } : { provider: key.slice(0, at), model: key.slice(at + 1) };
}
function freezeRows(rows) {
  const out = [];
  for (const row of rows.values()) {
    out.push({
      key: row.key,
      provider: row.provider,
      model: row.model,
      calls: row.calls,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheWriteTokens: row.cacheWriteTokens,
      reasoningTokens: row.reasoningTokens,
      totalTokens: totalTokens(row)
    });
  }
  out.sort((a, b) => b.totalTokens - a.totalTokens || a.key.localeCompare(b.key));
  return out;
}
function buildUsage(records, range, todayKey) {
  const buckets = /* @__PURE__ */ new Map();
  for (const bound of range.buckets) buckets.set(bound.key, zeroTotals());
  const scopeTotals = zeroTotals();
  const todayTotals = zeroTotals();
  const rows = /* @__PURE__ */ new Map();
  let recordCount = 0;
  for (const row of records) {
    const time = row.time;
    if (!Number.isFinite(time)) continue;
    if (dayKey(time) === todayKey) addTotals(todayTotals, row);
    const bucket = buckets.get(timeKey(time, range.grain));
    if (bucket === void 0) continue;
    addTotals(bucket, row);
    addTotals(scopeTotals, row);
    recordCount += 1;
    const key = modelKey(row.provider, row.model);
    let slice = rows.get(key);
    if (slice === void 0) {
      slice = { key, ...splitKey(key), ...zeroTotals() };
      rows.set(key, slice);
    }
    addTotals(slice, row);
  }
  const outBuckets = [];
  for (let i = range.buckets.length - 1; i >= 0; i -= 1) {
    const bound = range.buckets[i];
    if (bound === void 0) continue;
    const totals = buckets.get(bound.key) ?? zeroTotals();
    if (totals.calls === 0) continue;
    outBuckets.push({ key: bound.key, start: bound.start, end: bound.end, ...totals });
  }
  return {
    today: { date: todayKey, ...todayTotals },
    scope: {
      from: range.from,
      to: range.to,
      grain: range.grain,
      fromMs: range.fromMs,
      toMs: range.toMs,
      buckets: outBuckets,
      rows: freezeRows(rows),
      totals: { ...scopeTotals },
      hitRate: cacheHitRate(scopeTotals)
    },
    recordCount
  };
}

// src/route.ts
var LOCAL_HOSTNAMES = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function isLoopback(address) {
  if (typeof address !== "string" || address.length === 0) return false;
  const bare = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  return bare === "::1" || bare === "localhost" || bare.startsWith("127.");
}
function isLocalAuthority(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  const authority = value.includes("://") ? value.slice(value.indexOf("://") + 3) : value;
  const [hostname] = authority.split("/");
  if (hostname === void 0 || hostname.length === 0) return false;
  const name = hostname.startsWith("[") ? hostname.slice(0, hostname.indexOf("]") + 1) : hostname.split(":")[0] ?? "";
  return LOCAL_HOSTNAMES.has(name);
}
function rejectForeignCaller(req, res) {
  if (!isLoopback(req.socket?.remoteAddress)) {
    res.writeHead(403, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: false, error: "forbidden", message: "loopback callers only" }));
    return true;
  }
  const host = req.headers.host;
  if (!isLocalAuthority(Array.isArray(host) ? host[0] : host)) {
    res.writeHead(403, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: false, error: "forbidden", message: "unexpected Host header" }));
    return true;
  }
  const origin = req.headers.origin;
  const originValue = Array.isArray(origin) ? origin[0] : origin;
  if (originValue !== void 0 && !isLocalAuthority(originValue)) {
    res.writeHead(403, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: false, error: "forbidden", message: "unexpected Origin" }));
    return true;
  }
  return false;
}
function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(text)
  });
  res.end(text);
}
function parseRangeQuery(url) {
  const source = typeof url === "string" ? url : "";
  const query = source.indexOf("?");
  const params = new URLSearchParams(query < 0 ? "" : source.slice(query + 1));
  const from = params.get("from");
  const to = params.get("to");
  return {
    ...from === null || from.length === 0 ? {} : { from },
    ...to === null || to.length === 0 ? {} : { to },
    // Anything that is not exactly `hour` means day: the query string is
    // user-editable, and day grain is always answerable.
    grain: params.get("grain") === "hour" ? "hour" : "day"
  };
}
function createUsageHandler(deps) {
  const now = deps.now ?? Date.now;
  return (req, res) => {
    if (rejectForeignCaller(req, res)) return;
    if (req.method !== "GET" && req.method !== "HEAD") {
      json(res, 405, { ok: false, error: "method-not-allowed" });
      return;
    }
    void (async () => {
      try {
        const ledger = await deps.ledger;
        const at = now();
        const range = resolveRange(parseRangeQuery(req.url), at);
        const payload = {
          ok: true,
          ...buildUsage(ledger.records, range, dayKey(at)),
          // The client keeps polling while this is running, so a slow first scan
          // shows growing numbers instead of a stale zero.
          scanning: deps.progress,
          backfilled: ledger.backfilled,
          generatedAt: at
        };
        json(res, 200, payload);
      } catch (error) {
        console.warn(`[dsh-usage-tokens] usage failed: ${String(error)}`);
        json(res, 500, { ok: false, error: "internal", message: error instanceof Error ? error.message : String(error) });
      }
    })();
  };
}
var USAGE_PATH = `${ROUTE_PREFIX}/usage`;

// src/index.ts
var inject = ["webServer", "sessions"];
function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) return fromEnv.trim();
  return join3(homedir(), ".dsh");
}
function ledgerPath() {
  return join3(resolveDshHome(), ...LEDGER_RELATIVE_PATH);
}
function sessionsRoot() {
  return join3(resolveDshHome(), "sessions");
}
function apply(ctx) {
  const progress = { running: false, sessions: 0, files: 0, records: 0, errors: 0 };
  const opening = Ledger.open(ledgerPath());
  ctx.effect(() => {
    const unregister = ctx.webServer.register({
      kind: "exact",
      path: USAGE_PATH,
      handler: createUsageHandler({ ledger: opening, progress })
    });
    return () => {
      unregister();
    };
  }, "dsh-usage-tokens: usage route");
  const started = opening.then(async (ledger) => {
    ctx.effect(() => {
      const listener = createStreamCapture(ledger);
      ctx.on("llm/stream", listener, { global: true });
      return () => {
      };
    }, "dsh-usage-tokens: live capture");
    ctx.effect(() => () => {
      void ledger.close().catch(() => {
      });
    }, "dsh-usage-tokens: shutdown flush");
    if (ledger.backfilled) {
      progress.running = false;
      return ledger;
    }
    progress.running = true;
    await runBackfill(ledger, progress);
    return ledger;
  });
  void started.catch((error) => {
    console.warn(`[dsh-usage-tokens] host init failed: ${String(error)}`);
  });
}
async function runBackfill(ledger, progress) {
  let scanned = 0;
  let captured = 0;
  try {
    for await (const batch of scanSessions(sessionsRoot(), progress)) {
      captured += ledger.appendAll(batch);
      scanned += 1;
      if (scanned % 100 === 0) await ledger.flush();
    }
    await ledger.markBackfilled({ scanned, records: captured });
    console.info(`[dsh-usage-tokens] backfill done: ${captured} rows from ${scanned} logs`);
  } catch (error) {
    console.warn(`[dsh-usage-tokens] backfill failed: ${String(error)}`);
  } finally {
    progress.running = false;
    progress.finishedAt = Date.now();
    await ledger.flush().catch(() => {
    });
  }
}
export {
  apply,
  inject
};
