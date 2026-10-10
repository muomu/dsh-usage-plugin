/**
 * Aggregation, range and bucket-key tests.
 *
 * These cover the arithmetic and the time arithmetic the user actually reads:
 * the button figure, the drill-down buckets and the per-model rows. The traps
 * they guard are a UTC leak moving a call across the day boundary,
 * `reasoningTokens` being counted twice, and a drilled-into hour landing in the
 * wrong bucket because the client and the host disagree about what `14` means.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  cacheHitRate,
  dayKey,
  hourKey,
  grainForRange,
  modelKey,
  parseTimeKey,
  resolveRange,
  startOfLocalDay,
  timeKey,
  totalTokens,
  trailingDays,
  zeroBuckets,
} from '../src/config.ts';
import { buildUsage, byProvider } from '../src/aggregate.ts';

/** Build a ledger row with only the fields a test cares about. */
function row(overrides) {
  return {
    id: overrides.id ?? `r${Math.random()}`,
    time: overrides.time,
    provider: overrides.provider ?? 'deepseek-official',
    model: overrides.model ?? 'deepseek-flash',
    sessionId: overrides.sessionId ?? 's1',
    inputTokens: overrides.inputTokens ?? 0,
    outputTokens: overrides.outputTokens ?? 0,
    cacheReadTokens: overrides.cacheReadTokens ?? 0,
    cacheWriteTokens: overrides.cacheWriteTokens ?? 0,
    ...(overrides.reasoningTokens === undefined ? {} : { reasoningTokens: overrides.reasoningTokens }),
    src: overrides.src ?? 'live',
  };
}

/** Epoch ms at a local wall-clock time in September 2026. */
function at(day, hour, minute = 0) {
  return new Date(2026, 8, day, hour, minute, 0, 0).getTime();
}

/** Fold a set of rows into a scope, the way the route does. */
function usage(records, request, nowMs = at(29, 23)) {
  const range = resolveRange(request, nowMs);
  return buildUsage(records, range, dayKey(nowMs));
}

test('totalTokens sums every direction but never double counts reasoning', () => {
  const buckets = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 1000, cacheWriteTokens: 7, reasoningTokens: 40 };
  // 40 reasoning tokens are a subset of the 50 output tokens, so the total is
  // 100 + 1000 + 7 + 50 and not one token more.
  assert.equal(totalTokens(buckets), 1157);
});

test('cacheHitRate is the cached share of billed input', () => {
  assert.equal(cacheHitRate({ inputTokens: 100, cacheReadTokens: 900, cacheWriteTokens: 0, outputTokens: 1 }), 0.9);
  // No billed input at all: undefined rate rather than a division by zero.
  assert.equal(cacheHitRate({ inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 5 }), null);
});

test('dayKey buckets by the local calendar day, not UTC', () => {
  const localLateEvening = new Date(2026, 8, 29, 23, 30, 0).getTime();
  assert.equal(dayKey(localLateEvening), '2026-09-29');
  const localEarlyMorning = new Date(2026, 8, 29, 0, 15, 0).getTime();
  assert.equal(dayKey(localEarlyMorning), '2026-09-29');
  // The two are different days in UTC for a UTC+8 host; both must stay on 9-29.
  assert.equal(dayKey(startOfLocalDay(localEarlyMorning)), '2026-09-29');
});

test('trailingDays ends on the requested date and is inclusive', () => {
  assert.deepEqual(trailingDays('2026-09-29', 3), ['2026-09-27', '2026-09-28', '2026-09-29']);
  // Crossing a month boundary backwards.
  assert.deepEqual(trailingDays('2026-10-02', 4), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  assert.equal(trailingDays('2026-09-29', 30).length, 30);
});

test('hour keys name the wall-clock hour that contains the instant', () => {
  assert.equal(hourKey(at(29, 14)), '2026-09-29T14');
  assert.equal(hourKey(at(29, 14, 59)), '2026-09-29T14');
  assert.equal(hourKey(at(29, 0, 0)), '2026-09-29T00');
  assert.equal(timeKey(at(29, 14), 'day'), '2026-09-29');
});

test('parseTimeKey round-trips and rejects impossible keys', () => {
  assert.equal(parseTimeKey('2026-09-29').grain, 'day');
  assert.equal(parseTimeKey('2026-09-29').start, at(29, 0));
  assert.equal(parseTimeKey('2026-09-29T14').grain, 'hour');
  assert.equal(parseTimeKey('2026-09-29T14').start, at(29, 14));
  // February never has 31 days; Date would silently roll this into March.
  assert.equal(parseTimeKey('2026-02-31'), null);
  assert.equal(parseTimeKey('2026-09-29T24'), null);
  assert.equal(parseTimeKey('nonsense'), null);
  assert.equal(parseTimeKey(''), null);
});

test('grainForRange slices a single day by hour and everything wider by day', () => {
  // The two single-day presets.
  assert.equal(grainForRange('2026-09-29', '2026-09-29'), 'hour');
  assert.equal(grainForRange('2026-09-28', '2026-09-28'), 'hour');
  // A range that merely starts and ends inside one day is still one day.
  assert.equal(grainForRange('2026-09-29T00', '2026-09-29T23'), 'hour');
  // Two days, or a range crossing midnight, is a column of days.
  assert.equal(grainForRange('2026-09-28', '2026-09-29'), 'day');
  assert.equal(grainForRange('2026-09-23', '2026-09-29'), 'day');
  assert.equal(grainForRange('2026-09-23T22', '2026-09-24T01'), 'day');
  // Anything unreadable falls back to the slice that is always answerable.
  assert.equal(grainForRange('nonsense', '2026-09-29'), 'day');
});

test('resolveRange defaults to today and lists one bucket', () => {
  const range = resolveRange({}, at(29, 15));
  assert.equal(range.from, '2026-09-29');
  assert.equal(range.to, '2026-09-29');
  assert.equal(range.grain, 'day');
  assert.equal(range.buckets.length, 1);
  assert.equal(range.fromMs, at(29, 0));
  assert.equal(range.toMs, at(30, 0));
});

test('resolveRange enumerates days oldest first and falls back on garbage', () => {
  const range = resolveRange({ from: '2026-09-27', to: '2026-09-29', grain: 'day' }, at(29, 15));
  assert.deepEqual(range.buckets.map(b => b.key), ['2026-09-27', '2026-09-28', '2026-09-29']);
  // Each bucket ends where the next begins, so no instant can fall between two.
  assert.equal(range.buckets[0].end, range.buckets[1].start);
  assert.equal(range.coarsened, false);

  // An unreadable range shows today instead of failing the request.
  const garbage = resolveRange({ from: 'yesterday', to: '2026-02-31' }, at(29, 15));
  assert.deepEqual(garbage.buckets.map(b => b.key), ['2026-09-29']);
});

test('resolveRange collapses an inverted range and caps a year', () => {
  const inverted = resolveRange({ from: '2026-09-29', to: '2026-09-20' }, at(29, 15));
  assert.deepEqual(inverted.buckets.map(b => b.key), ['2026-09-20']);

  const capped = resolveRange({ from: '2000-01-01', to: '2026-09-29' }, at(29, 15));
  assert.equal(capped.buckets.length, 366);
  assert.equal(capped.buckets[capped.buckets.length - 1].key, '2026-09-29');
});

test('resolveRange answers hour grain with 24 buckets and degrades when too long', () => {
  const day = resolveRange({ from: '2026-09-28', to: '2026-09-28', grain: 'hour' }, at(29, 15));
  assert.equal(day.grain, 'hour');
  assert.equal(day.buckets.length, 24);
  assert.equal(day.buckets[0].key, '2026-09-28T00');
  assert.equal(day.buckets[23].key, '2026-09-28T23');
  assert.equal(day.toMs, at(29, 0));

  // A single hour is one bucket, and its end is the next hour's start.
  const hour = resolveRange({ from: '2026-09-29T14', to: '2026-09-29T14', grain: 'hour' }, at(29, 15));
  assert.deepEqual(hour.buckets.map(b => b.key), ['2026-09-29T14']);
  assert.equal(hour.fromMs, at(29, 14));
  assert.equal(hour.toMs, at(29, 15));

  // Past the limit the host answers by day rather than with 744 hour rows.
  const tooLong = resolveRange({ from: '2026-08-01', to: '2026-09-29', grain: 'hour' }, at(29, 15));
  assert.equal(tooLong.grain, 'day');
  assert.equal(tooLong.coarsened, true);
  assert.equal(tooLong.buckets.length, 60);
});

test('buildUsage folds only the range and drops its quiet days', () => {
  const records = [
    row({ time: at(29, 10), inputTokens: 10, outputTokens: 5, cacheReadTokens: 100 }),
    row({ time: at(29, 11), inputTokens: 20, outputTokens: 7, cacheReadTokens: 200, model: 'glm-5.3', provider: 'litellm' }),
    row({ time: at(28, 9), inputTokens: 1, outputTokens: 1 }),
    // Outside the window: must not contribute anywhere.
    row({ time: at(1, 9), inputTokens: 999, outputTokens: 999 }),
  ];

  const summary = usage(records, { from: '2026-09-23', to: '2026-09-29', grain: 'day' });
  // Newest first, and only the two days that saw a call are listed.
  assert.deepEqual(summary.scope.buckets.map(b => b.key), ['2026-09-29', '2026-09-28']);
  const today = summary.scope.buckets[0];
  assert.equal(today.calls, 2);
  assert.equal(today.inputTokens, 30);
  assert.equal(today.outputTokens, 12);
  assert.equal(today.cacheReadTokens, 300);
  assert.equal(today.totalTokens, 342);
  assert.equal(summary.scope.buckets[1].inputTokens, 1);
  assert.equal(summary.recordCount, 3);

  // The scope totals equal the sum of the buckets, or the table's total row
  // would disagree with the rows above it.
  const summed = summary.scope.buckets.reduce((sum, bucket) => sum + bucket.totalTokens, 0);
  assert.equal(summed, summary.scope.totals.totalTokens);
  assert.equal(summary.scope.hitRate, cacheHitRate(summary.scope.totals));
});

test('buildUsage reports today independently of the selected scope', () => {
  const records = [
    row({ time: at(29, 10), inputTokens: 5, outputTokens: 5 }),
    row({ time: at(20, 10), inputTokens: 500, outputTokens: 500 }),
  ];
  // A scope that ended a week ago still fills the button's figure for today.
  const old = usage(records, { from: '2026-09-13', to: '2026-09-20', grain: 'day' });
  assert.equal(old.scope.totals.totalTokens, 1000);
  assert.equal(old.today.date, '2026-09-29');
  assert.equal(old.today.totalTokens, 10);
  assert.equal(old.today.calls, 1);
});

test('buildUsage splits hour grain on the local clock', () => {
  const records = [
    row({ time: at(29, 13, 59), inputTokens: 1, outputTokens: 0 }),
    row({ time: at(29, 14, 0), inputTokens: 2, outputTokens: 0 }),
    row({ time: at(29, 14, 59), inputTokens: 4, outputTokens: 0 }),
    // 00:30 the same day belongs to the first bucket, not the last.
    row({ time: at(29, 0, 30), inputTokens: 8, outputTokens: 0 }),
  ];
  const hours = usage(records, { from: '2026-09-29', to: '2026-09-29', grain: 'hour' });

  assert.equal(hours.scope.grain, 'hour');
  // Only the three hours with calls are published, newest first.
  assert.deepEqual(hours.scope.buckets.map(b => b.key), [
    '2026-09-29T14', '2026-09-29T13', '2026-09-29T00',
  ]);
  const byKey = new Map(hours.scope.buckets.map(bucket => [bucket.key, bucket]));
  assert.equal(byKey.get('2026-09-29T14').inputTokens, 6);
  assert.equal(byKey.get('2026-09-29T13').inputTokens, 1);
  assert.equal(byKey.get('2026-09-29T00').inputTokens, 8);
});

test('hour grain covers the whole day it slices, edges included', () => {
  const records = [
    row({ time: at(29, 0, 5), inputTokens: 1, outputTokens: 1 }),
    row({ time: at(29, 23, 55), inputTokens: 2, outputTokens: 2 }),
    row({ time: at(28, 12, 0), inputTokens: 100, outputTokens: 100 }),
  ];
  const day = usage(records, { from: '2026-09-29', to: '2026-09-29', grain: 'day' });
  const hour = usage(records, { from: day.scope.from, to: day.scope.to, grain: 'hour' });

  // The drilled-in scope must cover the whole day, or late calls would vanish.
  assert.equal(hour.scope.totals.totalTokens, day.scope.totals.totalTokens);
  const byKey = new Map(hour.scope.buckets.map(bucket => [bucket.key, bucket]));
  assert.equal(byKey.get('2026-09-29T00').calls, 1);
  assert.equal(byKey.get('2026-09-29T23').calls, 1);
});

test('buildUsage publishes only the buckets that saw a call', () => {
  const records = [row({ time: at(29, 10), inputTokens: 3 })];

  // A short range drops its quiet days just like a long one: the table is dense.
  const small = usage(records, { from: '2026-09-24', to: '2026-09-29', grain: 'day' });
  assert.deepEqual(small.scope.buckets.map(b => b.key), ['2026-09-29']);

  // Every published bucket therefore has at least one call, and the published
  // rows still add up to the scope total.
  const big = usage(records, { from: '2026-06-01', to: '2026-09-29', grain: 'day' });
  assert.equal(big.scope.buckets.length, 1);
  assert.equal(big.scope.buckets[0].key, '2026-09-29');
  assert.equal(big.scope.totals.inputTokens, 3);
  assert.equal(big.scope.buckets.every(bucket => bucket.calls > 0), true);
});

test('buildUsage rows sum to the scope total, largest first', () => {
  const records = [
    row({ time: at(29, 12), inputTokens: 1, outputTokens: 1 }),
    row({ time: at(29, 12), inputTokens: 500, outputTokens: 500, model: 'glm-5.3', provider: 'litellm' }),
    row({ time: at(29, 13), inputTokens: 2, outputTokens: 2, model: 'glm-5.3', provider: 'litellm' }),
  ];
  const summary = usage(records, { from: '2026-09-29', to: '2026-09-29', grain: 'day' });

  assert.deepEqual(summary.scope.rows.map(r => r.key), [
    modelKey('litellm', 'glm-5.3'),
    modelKey('deepseek-official', 'deepseek-flash'),
  ]);
  assert.equal(summary.scope.rows[0].calls, 2);
  assert.equal(summary.scope.rows[0].totalTokens, 1004);
  const summed = summary.scope.rows.reduce((sum, entry) => sum + entry.totalTokens, 0);
  assert.equal(summed, summary.scope.totals.totalTokens);
});

test('byProvider folds model rows into provider rows', () => {
  const records = [
    row({ time: at(29, 12), inputTokens: 1, outputTokens: 1 }),
    row({ time: at(29, 12), inputTokens: 2, outputTokens: 2, model: 'deepseek-v4-flash' }),
    row({ time: at(29, 12), inputTokens: 4, outputTokens: 4, model: 'glm-5.3', provider: 'litellm' }),
  ];
  const summary = usage(records, { from: '2026-09-29', to: '2026-09-29', grain: 'day' });
  const providers = byProvider(summary.scope.rows);

  assert.deepEqual(providers.map(p => p.provider), ['litellm', 'deepseek-official']);
  assert.equal(providers[0].calls, 1);
  assert.equal(providers[0].totalTokens, 8);
  assert.equal(providers[1].totalTokens, 6);
  // Nothing is lost in the fold.
  assert.equal(providers.reduce((sum, p) => sum + p.totalTokens, 0), summary.scope.totals.totalTokens);
});

test('a row with a non-finite timestamp is ignored everywhere', () => {
  const summary = usage([row({ time: Number.NaN, inputTokens: 999 })], { from: '2026-09-29', to: '2026-09-29' });
  assert.equal(summary.scope.totals.calls, 0);
  assert.equal(summary.today.totalTokens, 0);
  assert.equal(summary.recordCount, 0);
  // Nothing to list: a bucket only exists once a call lands in it.
  assert.deepEqual(summary.scope.buckets, []);
  assert.deepEqual(summary.scope.rows, []);
});

test('an empty ledger answers with no buckets at all, and zeroed totals', () => {
  const summary = usage([], { from: '2026-09-27', to: '2026-09-29', grain: 'day' });
  assert.deepEqual(summary.scope.buckets, []);
  assert.deepEqual(summary.scope.rows, []);
  assert.equal(summary.scope.totals.totalTokens, 0);
  assert.equal(summary.scope.totals.calls, 0);
  assert.equal(summary.scope.hitRate, null);
  assert.equal(summary.recordCount, 0);
  // A bucket that is published keeps the same field set every time.
  const one = usage([row({ time: at(29, 10), inputTokens: 1 })], { from: '2026-09-29', to: '2026-09-29' });
  assert.deepEqual(Object.keys(one.scope.buckets[0]).sort(), [
    'cacheReadTokens', 'cacheWriteTokens', 'calls', 'end', 'inputTokens',
    'key', 'outputTokens', 'reasoningTokens', 'start', 'totalTokens',
  ]);
  assert.equal(zeroBuckets().reasoningTokens, 0);
});
