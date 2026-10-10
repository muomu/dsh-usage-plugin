/**
 * Shared vocabulary for both halves of the plugin.
 *
 * The field names deliberately mirror the DSH session log's `TokenUsage`
 * wire shape (`inputTokens` / `outputTokens` / `cacheReadTokens` /
 * `cacheWriteTokens` / `reasoningTokens`) so one naming scheme holds from the
 * durable log, through the live `llm/stream` chunk, into the ledger and out to
 * the browser. The buckets are DISJOINT: `inputTokens` is uncached input only,
 * and cached input is reported separately. `reasoningTokens` is already
 * included in `outputTokens` and must never be added again.
 *
 * Nothing here imports anything, so the module is safe to bundle into the
 * browser half as well: the client and the host must derive `2026-09-29T14`
 * from one instant the same way, or the requested slice size would disagree with
 * the buckets the host actually produced.
 */

/** One model call's token counts, in the provider's own disjoint buckets. */
export interface Buckets {
  /** Uncached (cache-miss) prompt tokens. */
  inputTokens: number;
  /** Generated tokens, reasoning included. */
  outputTokens: number;
  /** Prompt tokens served from the provider's cache. */
  cacheReadTokens: number;
  /** Prompt tokens written into the provider's cache. */
  cacheWriteTokens: number;
  /**
   * Reasoning subset of `outputTokens`. Reported separately for display but
   * never summed into any total. Undefined when the provider omitted it.
   */
  reasoningTokens?: number;
}

/** Provenance of a ledger row, so live capture and backfill stay separable. */
export type RecordSource = 'live' | 'backfill';

/** One persisted model call. */
export interface UsageRecord extends Buckets {
  /** Stable identity: `live:<uuid>` or `backfill:<sessionId>:<seq>`. */
  id: string;
  /** Request-start wall clock, epoch ms. The day bucket is derived from this. */
  time: number;
  /** Provider route id, e.g. `deepseek-official`, `litellm`, `ark-agent-plan`. */
  provider: string;
  model: string;
  sessionId: string;
  /** Sequence number of the originating session event, when known. */
  seq?: number;
  /** Why the call was made, when the invocation declared a purpose. */
  purpose?: string;
  src: RecordSource;
}

/** Time bucket size: whole days, or whole hours for a single-day range. */
export type Grain = 'day' | 'hour';

/** A set of token counts with the two derived figures every table shows. */
export interface UsageTotals extends Buckets {
  /** Number of model calls in this bucket. */
  calls: number;
  /** Grand total, the figure the sidebar button shows. */
  totalTokens: number;
}

/** One time bucket of a scope: a calendar day, or a wall-clock hour. */
export interface TimeBucket extends UsageTotals {
  /** `YYYY-MM-DD` for day grain, `YYYY-MM-DDTHH` for hour grain. */
  key: string;
  /** First instant inside the bucket, epoch ms. */
  start: number;
  /** First instant after the bucket (exclusive), epoch ms. */
  end: number;
}

/** One flattened `provider:model` row. */
export interface BreakdownRow extends UsageTotals {
  key: string;
  provider: string;
  model: string;
}

/**
 * Everything the modal renders for one selected time range.
 *
 * `from`/`to` are inclusive bucket keys, echoed back after clamping so the
 * client can label what the host actually answered.
 */
export interface UsageScope {
  from: string;
  to: string;
  grain: Grain;
  /** First instant inside the scope, epoch ms. */
  fromMs: number;
  /** Exclusive end of the scope, epoch ms. */
  toMs: number;
  /** Time buckets, NEWEST FIRST — the order the timeline table lists them. */
  buckets: TimeBucket[];
  /** Model breakdown for the whole scope, largest total first. */
  rows: BreakdownRow[];
  totals: UsageTotals;
  /** Cache-hit share of the scope's billed input, or null when there is none. */
  hitRate: number | null;
}

/** Everything the modal renders, before the route adds its envelope fields. */
export interface UsageSnapshot {
  /** Today's totals, independent of the requested scope: the button's figure. */
  today: UsageTotals & { date: string };
  scope: UsageScope;
  /** Ledger rows that fell inside the scope. */
  recordCount: number;
}

/** Live progress of the one-time historical scan, reported to the browser. */
export interface BackfillProgress {
  running: boolean;
  sessions: number;
  files: number;
  records: number;
  errors: number;
  finishedAt?: number;
}

/** Payload of `GET /api/dsh-usage-tokens/usage`. */
export interface UsagePayload extends UsageSnapshot {
  /** False while the one-time history backfill is still running. */
  backfilled: boolean;
  /** Epoch ms when this payload was produced. */
  generatedAt: number;
  /** Scan progress; the client polls faster while `running` is true. */
  scanning: BackfillProgress;
  /**
   * Set by the client when the host answered over the pre-drill-down route,
   * which happens for exactly as long as a rebuilt client runs against a host
   * half that has not been restarted. Never set by this version of the host.
   */
  legacy?: boolean;
}

/** Fresh, all-zero bucket set. */
export function zeroBuckets(): Buckets {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 };
}

/** Fresh, all-zero totals for one table row. */
export function zeroTotals(): UsageTotals {
  return { calls: 0, ...zeroBuckets(), totalTokens: 0 };
}

/** Add one usage row into an accumulator, in place. */
export function addInto(target: Buckets, row: Buckets): void {
  target.inputTokens += row.inputTokens || 0;
  target.outputTokens += row.outputTokens || 0;
  target.cacheReadTokens += row.cacheReadTokens || 0;
  target.cacheWriteTokens += row.cacheWriteTokens || 0;
  // Optional and display-only: accumulate for the reasoning line, but the sum
  // stays a subset of outputTokens.
  target.reasoningTokens = (target.reasoningTokens ?? 0) + (row.reasoningTokens ?? 0);
}

/** Add one row into a totals accumulator, call count included. */
export function addTotals(target: UsageTotals, row: Buckets): void {
  addInto(target, row);
  target.calls += 1;
  target.totalTokens = totalTokens(target);
}

/** Billed prompt tokens: uncached input plus both cache directions. */
export function billedInputTokens(b: Buckets): number {
  return (b.inputTokens || 0) + (b.cacheReadTokens || 0) + (b.cacheWriteTokens || 0);
}

/**
 * Grand total shown on the button. Matches the DeepSeek platform usage page's
 * "total tokens" reading: every token the request touched, in any direction.
 */
export function totalTokens(b: Buckets): number {
  return billedInputTokens(b) + (b.outputTokens || 0);
}

/** Cache-hit share of billed input, or null when the call billed no input. */
export function cacheHitRate(b: Buckets): number | null {
  const billed = billedInputTokens(b);
  if (billed <= 0) return null;
  return (b.cacheReadTokens || 0) / billed;
}

/**
 * Local-timezone calendar day for one instant.
 *
 * Deliberately local, not UTC: the day boundary the user perceives is their own
 * midnight. Built from local getters rather than `toISOString()` so no UTC
 * shift can move a late-evening call into the next day.
 * @param timeMs - Epoch milliseconds.
 * @returns `YYYY-MM-DD` in the host's local timezone.
 */
export function dayKey(timeMs: number): string {
  const d = new Date(timeMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Local wall-clock hour key for one instant.
 * @param timeMs - Epoch milliseconds.
 * @returns `YYYY-MM-DDTHH`, truncated (not rounded) to the hour.
 */
export function hourKey(timeMs: number): string {
  const h = String(new Date(timeMs).getHours()).padStart(2, '0');
  return `${dayKey(timeMs)}T${h}`;
}

/** Bucket key for one instant at the requested granularity. */
export function timeKey(timeMs: number, grain: Grain): string {
  return grain === 'hour' ? hourKey(timeMs) : dayKey(timeMs);
}

/**
 * Parse a bucket key back into the local instant that starts it.
 *
 * Round-tripping through `timeKey` rejects impossible keys such as
 * `2026-02-31` (which `Date` would silently roll into March) instead of
 * answering a range the caller never asked for.
 * @param key - `YYYY-MM-DD` or `YYYY-MM-DDTHH`.
 * @returns The grain and start instant, or null when the key is malformed.
 */
export function parseTimeKey(key: string): { grain: Grain; start: number } | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (day !== null) {
    const ms = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])).getTime();
    return dayKey(ms) === key ? { grain: 'day', start: ms } : null;
  }
  const hour = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(key);
  if (hour !== null) {
    const ms = new Date(Number(hour[1]), Number(hour[2]) - 1, Number(hour[3]), Number(hour[4])).getTime();
    return hourKey(ms) === key ? { grain: 'hour', start: ms } : null;
  }
  return null;
}

/** Epoch ms at local midnight starting the day that contains `timeMs`. */
export function startOfLocalDay(timeMs: number): number {
  const d = new Date(timeMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * First instant of the bucket that contains `timeMs`.
 * @param timeMs - Epoch milliseconds.
 * @param grain - Bucket size to floor to.
 * @returns Epoch ms of the bucket start.
 */
export function floorToGrain(timeMs: number, grain: Grain): number {
  const d = new Date(timeMs);
  if (grain === 'hour') d.setMinutes(0, 0, 0);
  else d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * First instant after the bucket that starts at `start`.
 *
 * Local setter arithmetic rather than `+ 3600_000`, so a DST jump cannot make
 * two buckets share a key or skip one.
 * @param start - Epoch ms of a bucket start.
 * @param grain - Bucket size to advance by.
 * @returns Epoch ms of the next bucket start.
 */
export function nextBucketStart(start: number, grain: Grain): number {
  const d = new Date(start);
  if (grain === 'hour') {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  } else {
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
  }
  return d.getTime();
}

/** `provider:model` key used for every breakdown. */
export function modelKey(provider: string, model: string): string {
  return `${provider || 'unknown'}:${model || 'unknown'}`;
}

/**
 * The `days` local dates ending at `endDate`, oldest first.
 * @param endDate - Inclusive last date, `YYYY-MM-DD`.
 * @param days - Window length; must be >= 1.
 * @returns Date keys in ascending order.
 */
export function trailingDays(endDate: string, days: number): string[] {
  const [y, m, d] = endDate.split('-').map(Number);
  const end = new Date(y, (m ?? 1) - 1, d ?? 1);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const cur = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
    out.push(dayKey(cur.getTime()));
  }
  return out;
}

/** Anything the client may put in the `from` / `to` / `grain` query string. */
export interface RangeRequest {
  from?: string;
  to?: string;
  grain?: Grain;
}

/** One bucket boundary: its key and the half-open instant range it covers. */
export interface BucketBound {
  key: string;
  start: number;
  end: number;
}

/** A range request after validation, clamping and granularity resolution. */
export interface ResolvedRange {
  /** First bucket key, at the resolved grain. */
  from: string;
  /** Last bucket key, at the resolved grain. */
  to: string;
  grain: Grain;
  fromMs: number;
  toMs: number;
  /** Every bucket in the range, oldest first. */
  buckets: BucketBound[];
  /** True when an hour request was too long and was answered by day. */
  coarsened: boolean;
}

/** Inclusive day count between two instants, ignoring the time of day. */
function daySpan(fromMs: number, toMs: number): number {
  const a = new Date(fromMs);
  const b = new Date(toMs);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86_400_000) + 1;
}

/**
 * Slice size the UI shows for a range: one local day is broken into hours,
 * every wider range into days.
 *
 * One rule, no switch to get wrong: "今天" and "昨天" are single days and want
 * to be read hour by hour, while a week or a month is a column of days.
 * @param from - First bucket key, `YYYY-MM-DD` or `YYYY-MM-DDTHH`.
 * @param to - Last bucket key.
 * @returns `hour` when both keys fall on the same local day, otherwise `day`.
 */
export function grainForRange(from: string, to: string): Grain {
  const start = parseTimeKey(from);
  const end = parseTimeKey(to);
  if (start === null || end === null) return 'day';
  return dayKey(start.start) === dayKey(end.start) ? 'hour' : 'day';
}

/**
 * Turn a request into concrete bucket boundaries.
 *
 * Every fallback is forgiving on purpose: this route is driven by a URL a user
 * can edit, and an unparseable `from` should show today rather than an error.
 * A `from` after `to` collapses to `to`, a range longer than a year keeps its
 * last year, and hour grain over more than `MAX_HOUR_RANGE_DAYS` degrades to
 * day grain instead of returning a 700-row table. The client only ever asks for
 * hour grain on a single day (`grainForRange`), so that last rule is the safety
 * net for a hand-written URL rather than something the UI can reach.
 * @param request - Raw `from` / `to` / `grain` values.
 * @param nowMs - Clock injection for tests; decides the default day.
 * @returns The resolved range, including every bucket in order.
 */
export function resolveRange(request: RangeRequest, nowMs: number): ResolvedRange {
  const todayStart = startOfLocalDay(nowMs);
  const parsedFrom = parseTimeKey(request.from ?? '');
  const parsedTo = parseTimeKey(request.to ?? '');
  let fromStart = parsedFrom?.start ?? todayStart;
  const toStart = parsedTo?.start ?? todayStart;
  if (fromStart > toStart) fromStart = toStart;

  // Cap the window at a year, keeping the newest end of whatever was asked.
  const oldest = new Date(toStart);
  oldest.setDate(oldest.getDate() - (MAX_RANGE_DAYS - 1));
  oldest.setHours(0, 0, 0, 0);
  if (fromStart < oldest.getTime()) fromStart = oldest.getTime();

  let grain: Grain = request.grain === 'hour' ? 'hour' : 'day';
  let coarsened = false;
  if (grain === 'hour' && daySpan(fromStart, toStart) > MAX_HOUR_RANGE_DAYS) {
    grain = 'day';
    coarsened = true;
  }

  // A day key as the upper bound means "that whole day", which at hour grain is
  // 23:00 rather than midnight.
  let lastStart = floorToGrain(toStart, grain);
  if (grain === 'hour' && parsedTo?.grain === 'day') {
    const end = new Date(toStart);
    end.setHours(23, 0, 0, 0);
    lastStart = end.getTime();
  }

  const buckets: BucketBound[] = [];
  let cursor = floorToGrain(fromStart, grain);
  const limit = MAX_RANGE_DAYS * 24;
  while (cursor <= lastStart && buckets.length < limit) {
    const end = nextBucketStart(cursor, grain);
    // Defensive: a clock that fails to advance must not spin here.
    if (end <= cursor) break;
    buckets.push({ key: timeKey(cursor, grain), start: cursor, end });
    cursor = end;
  }
  if (buckets.length === 0) {
    buckets.push({ key: timeKey(lastStart, grain), start: lastStart, end: nextBucketStart(lastStart, grain) });
  }

  const first = buckets[0] as BucketBound;
  const last = buckets[buckets.length - 1] as BucketBound;
  return {
    from: first.key,
    to: last.key,
    grain,
    fromMs: first.start,
    toMs: last.end,
    buckets,
    coarsened,
  };
}

/** HTTP route prefix owned by this plugin. */
export const ROUTE_PREFIX = '/api/dsh-usage-tokens';

/** Longest span the usage route will answer, in days. */
export const MAX_RANGE_DAYS = 366;

/** Longest span that still offers hour buckets: 31 days is 744 rows. */
export const MAX_HOUR_RANGE_DAYS = 31;

/** Ledger path relative to the DSH home directory. */
export const LEDGER_RELATIVE_PATH = ['storages', 'dsh-usage-tokens', 'ledger.json'] as const;

/**
 * Retention cap on persisted rows. At the observed rate (about 1,000 calls per
 * day) this is many weeks of detail, and the UI only ever reads a year.
 */
export const MAX_RECORDS = 200_000;
