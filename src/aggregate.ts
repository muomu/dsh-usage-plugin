/**
 * Pure aggregation from ledger rows to the browser payload.
 *
 * No cordis, no filesystem, no clock of its own: every input arrives as an
 * argument so the rollups can be unit-tested against fixed data. This is the
 * only place token arithmetic happens, so the sidebar figure, the scope cards,
 * the timeline table, the model table and the sidebar button can never disagree.
 *
 * One pass over the ledger feeds all of them: a scope's totals, its time
 * buckets, its model rows and today's button figure. That keeps a 200k-row
 * ledger answerable in a few milliseconds even though every request re-reads it.
 */
import {
  addInto,
  addTotals,
  cacheHitRate,
  dayKey,
  modelKey,
  timeKey,
  totalTokens,
  zeroTotals,
  type BreakdownRow,
  type ResolvedRange,
  type TimeBucket,
  type UsageRecord,
  type UsageSnapshot,
  type UsageTotals,
} from './config.ts';

/** Mutable accumulator for one `provider:model`, before it is frozen. */
type RowAccumulator = UsageTotals & { key: string; provider: string; model: string };

/** Split a `provider:model` key back into its parts. */
function splitKey(key: string): { provider: string; model: string } {
  const at = key.indexOf(':');
  return at < 0 ? { provider: key, model: 'unknown' } : { provider: key.slice(0, at), model: key.slice(at + 1) };
}

/** Freeze model accumulators into sorted rows, largest total first. */
function freezeRows(rows: Map<string, RowAccumulator>): BreakdownRow[] {
  const out: BreakdownRow[] = [];
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
      totalTokens: totalTokens(row),
    });
  }
  out.sort((a, b) => b.totalTokens - a.totalTokens || a.key.localeCompare(b.key));
  return out;
}

/**
 * Fold ledger rows into the payload the modal renders.
 *
 * A row belongs to a bucket when its start instant produces that bucket's key.
 * Testing membership in the pre-built key set rather than comparing timestamps
 * is what keeps hour grain exact: the bucket keys were laid out on the local
 * clock, so a DST day is 23 or 25 buckets long and no row can fall between two
 * of them.
 *
 * @param records - Every ledger row; rows outside the range are ignored.
 * @param range - Resolved buckets, from `resolveRange`.
 * @param todayKey - Local date whose totals the sidebar button shows.
 * @returns Today's totals, the scope (quiet buckets omitted), and how many rows
 *   the scope used.
 */
export function buildUsage(records: readonly UsageRecord[], range: ResolvedRange, todayKey: string): UsageSnapshot {
  const buckets = new Map<string, UsageTotals>();
  for (const bound of range.buckets) buckets.set(bound.key, zeroTotals());

  const scopeTotals = zeroTotals();
  const todayTotals = zeroTotals();
  const rows = new Map<string, RowAccumulator>();
  let recordCount = 0;

  for (const row of records) {
    const time = row.time;
    if (!Number.isFinite(time)) continue;

    if (dayKey(time) === todayKey) addTotals(todayTotals, row);

    const bucket = buckets.get(timeKey(time, range.grain));
    if (bucket === undefined) continue;

    addTotals(bucket, row);
    addTotals(scopeTotals, row);
    recordCount += 1;

    const key = modelKey(row.provider, row.model);
    let slice = rows.get(key);
    if (slice === undefined) {
      slice = { key, ...splitKey(key), ...zeroTotals() };
      rows.set(key, slice);
    }
    addTotals(slice, row);
  }

  // Only periods something happened in are published: the table is dense by
  // design, and a quiet hour or day carries no information the totals row does
  // not already state. It also keeps a year-long range's payload small.
  const outBuckets: TimeBucket[] = [];
  for (let i = range.buckets.length - 1; i >= 0; i -= 1) {
    const bound = range.buckets[i];
    if (bound === undefined) continue;
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
      hitRate: cacheHitRate(scopeTotals),
    },
    recordCount,
  };
}

/**
 * Aggregate a flat set of rows by provider, summing across models.
 * @param rows - Rows from one scope's breakdown.
 * @returns One aggregate row per provider, largest total first.
 */
export function byProvider(rows: readonly BreakdownRow[]): BreakdownRow[] {
  const grouped = new Map<string, BreakdownRow>();
  for (const row of rows) {
    let acc = grouped.get(row.provider);
    if (acc === undefined) {
      acc = { key: row.provider, provider: row.provider, model: '', ...zeroTotals() };
      grouped.set(row.provider, acc);
    }
    addInto(acc, row);
    acc.calls += row.calls;
    acc.totalTokens = totalTokens(acc);
  }
  const out = [...grouped.values()];
  out.sort((a, b) => b.totalTokens - a.totalTokens || a.provider.localeCompare(b.provider));
  return out;
}
