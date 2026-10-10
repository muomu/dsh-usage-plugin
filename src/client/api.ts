/**
 * Browser-side access to the host usage route.
 *
 * A plain `fetch` against the plugin's own loopback route is enough here: the
 * host recomputes the scope from the ledger on every request, so there is no
 * cache to invalidate and no push channel to maintain. The slice size is derived
 * from the range (`grainForRange`), so the caller only ever names two dates.
 *
 * The one piece of history in here is `fromLegacy`: a rebuilt client bundle is
 * picked up by the running Web shell immediately, while the host half only
 * changes when DSH restarts. For that window the old route is still the only one
 * answering, so a 404 falls back to it and the modal degrades to the flat
 * today-only view instead of showing an error.
 */
import {
  cacheHitRate,
  grainForRange,
  parseTimeKey,
  totalTokens,
  type BackfillProgress,
  type BreakdownRow,
  type TimeBucket,
  type UsagePayload,
  type UsageTotals,
} from '../config.ts';

export type { BreakdownRow, Grain, TimeBucket, UsagePayload, UsageScope, UsageTotals } from '../config.ts';

/** Owner props the sidebar passes to a `sidebar.footer.action` occupant. */
export interface FooterActionProps {
  /** Whether the sidebar renders wide content (false = 56px icon rail). */
  wide: boolean;
}

/** One requested scope: two inclusive local dates, e.g. `2026-09-29`. */
export interface UsageRange {
  from: string;
  to: string;
}

/** Route the host publishes. */
export const USAGE_URL = '/api/dsh-usage-tokens/usage';

/** Route the host published before ranged queries existed. */
export const LEGACY_URL = '/api/dsh-usage-tokens/summary';

/** Outcome of one request, as a value rather than a throw. */
export type UsageResult = { ok: true; data: UsagePayload } | { ok: false; error: string };

/** Abort errors are expected control flow, not failures to report. */
function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

/** Fetch options shared by both routes. */
function requestInit(signal: AbortSignal | undefined): RequestInit {
  return {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
    ...(signal === undefined ? {} : { signal }),
  };
}

/**
 * Load one range. Never throws: a failure is reported as an error message so
 * the button can keep rendering its last good value.
 * @param range - Range to read; omitted means "today", the button's figure.
 * @param signal - Cancellation for the in-flight request.
 * @returns The payload, or an error string.
 */
export async function fetchUsage(range: UsageRange | undefined, signal?: AbortSignal): Promise<UsageResult> {
  const params = new URLSearchParams();
  if (range !== undefined) {
    params.set('from', range.from);
    params.set('to', range.to);
    params.set('grain', grainForRange(range.from, range.to));
  }
  const suffix = params.toString();
  try {
    const response = await fetch(`${USAGE_URL}${suffix.length === 0 ? '' : `?${suffix}`}`, requestInit(signal));
    // A host that has not been restarted yet does not know this route: the Web
    // server answers an unregistered `/api/*` path with 401, because its auth
    // gate runs before route matching, and with 404 when nothing claims the
    // path at all. Either way the legacy route is still there.
    if (response.status === 404 || response.status === 401) return await fetchLegacy(signal);
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const data = (await response.json()) as UsagePayload;
    if (data === null || typeof data !== 'object' || data.ok !== true || typeof data.today !== 'object') {
      return { ok: false, error: 'malformed response' };
    }
    if (data.scope === undefined || !Array.isArray(data.scope.buckets) || !Array.isArray(data.scope.rows)) {
      return { ok: false, error: 'malformed response' };
    }
    return { ok: true, data };
  } catch (error) {
    if (isAbort(error)) return { ok: false, error: 'aborted' };
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Read the pre-drill-down route and reshape it into the current payload.
 * @param signal - Cancellation for the in-flight request.
 * @returns The degraded payload, or an error string.
 */
async function fetchLegacy(signal: AbortSignal | undefined): Promise<UsageResult> {
  try {
    const response = await fetch(`${LEGACY_URL}?days=7`, requestInit(signal));
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const data = fromLegacy(await response.json());
    if (data === null) return { ok: false, error: 'malformed response' };
    return { ok: true, data };
  } catch (error) {
    if (isAbort(error)) return { ok: false, error: 'aborted' };
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The shape the older host answered with. */
interface LegacyPayload {
  date?: unknown;
  today?: unknown;
  trend?: unknown;
  rows?: unknown;
  recordCount?: unknown;
  backfilled?: unknown;
  generatedAt?: unknown;
  scanning?: unknown;
}

/** Read a finite number out of an untrusted payload. */
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Read the scan progress out of an untrusted payload. */
function progressOf(value: unknown): BackfillProgress {
  const source = (value ?? {}) as Record<string, unknown>;
  return {
    running: source['running'] === true,
    sessions: num(source['sessions']),
    files: num(source['files']),
    records: num(source['records']),
    errors: num(source['errors']),
  };
}

/** Copy the five buckets plus the call count out of an untrusted object. */
function totalsOf(value: unknown): UsageTotals {
  const source = (value ?? {}) as Record<string, unknown>;
  const totals: UsageTotals = {
    calls: num(source['calls']),
    inputTokens: num(source['inputTokens']),
    outputTokens: num(source['outputTokens']),
    cacheReadTokens: num(source['cacheReadTokens']),
    cacheWriteTokens: num(source['cacheWriteTokens']),
    reasoningTokens: num(source['reasoningTokens']),
    totalTokens: 0,
  };
  totals.totalTokens = totalTokens(totals);
  return totals;
}

/**
 * Reshape a legacy summary into the current payload.
 *
 * The day buckets survive as a time series, so the timeline still renders; only
 * the arbitrary range is missing, which is what `legacy` tells the modal to say
 * out loud.
 * @param raw - Parsed legacy response.
 * @returns The equivalent payload, or null when it is unusable.
 */
export function fromLegacy(raw: unknown): UsagePayload | null {
  if (raw === null || typeof raw !== 'object') return null;
  const source = raw as LegacyPayload;
  if (typeof source.date !== 'string' || typeof source.today !== 'object' || source.today === null) return null;

  const series = Array.isArray(source.trend) ? source.trend : [];
  const totals: UsageTotals = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
  // The legacy series ran oldest first; every table in the modal is newest first.
  const buckets: TimeBucket[] = [];
  for (const entry of series) {
    const day = (entry ?? {}) as Record<string, unknown>;
    if (typeof day['date'] !== 'string') continue;
    const slice = totalsOf(day);
    const start = parseTimeKey(day['date'])?.start ?? 0;
    buckets.push({ key: day['date'], start, end: start + 86_400_000, ...slice });
    totals.calls += slice.calls;
    totals.inputTokens += slice.inputTokens;
    totals.outputTokens += slice.outputTokens;
    totals.cacheReadTokens += slice.cacheReadTokens;
    totals.cacheWriteTokens += slice.cacheWriteTokens;
    totals.reasoningTokens = (totals.reasoningTokens ?? 0) + (slice.reasoningTokens ?? 0);
  }
  totals.totalTokens = totalTokens(totals);
  buckets.reverse();

  const rows: BreakdownRow[] = (Array.isArray(source.rows) ? source.rows : []).map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    const slice = totalsOf(row);
    const provider = typeof row['provider'] === 'string' ? row['provider'] : 'unknown';
    const model = typeof row['model'] === 'string' ? row['model'] : 'unknown';
    return { key: typeof row['key'] === 'string' ? row['key'] : `${provider}:${model}`, provider, model, ...slice };
  });

  const newest = buckets[0];
  const oldest = buckets[buckets.length - 1];
  return {
    today: { date: source.date, ...totalsOf(source.today) },
    scope: {
      from: oldest?.key ?? source.date,
      to: newest?.key ?? source.date,
      grain: 'day',
      fromMs: oldest?.start ?? 0,
      toMs: newest?.end ?? 0,
      buckets,
      rows,
      totals,
      hitRate: cacheHitRate(totals),
    },
    recordCount: num(source.recordCount),
    backfilled: source.backfilled === true,
    generatedAt: num(source.generatedAt),
    scanning: progressOf(source.scanning),
    legacy: true,
  };
}
