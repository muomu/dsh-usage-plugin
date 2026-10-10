/**
 * Terminal view of the real ledger.
 *
 * Prints exactly what the modal shows for one range: the time buckets newest
 * first, then the model and provider breakdowns. The slice size follows the same
 * rule the UI uses — one day is read hour by hour, anything wider day by day —
 * and `--hour` / `--day` override it for a look at the other cut.
 *
 * Handy for checking a figure against the DeepSeek console without opening the
 * GUI, and for seeing the host's arithmetic on real rows.
 *
 * Usage:
 *   node scripts/usage-report.mjs                        # today, hour by hour
 *   node scripts/usage-report.mjs 2026-09-23 2026-09-29  # a week, day by day
 *   node scripts/usage-report.mjs 2026-09-23 2026-09-29 --hour
 *
 * Not part of the plugin runtime.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Ledger } from '../src/ledger.ts';
import { buildUsage, byProvider } from '../src/aggregate.ts';
import { dayKey, grainForRange, resolveRange, totalTokens } from '../src/config.ts';
import { compactNumber, exactNumber } from '../src/client/format.ts';

const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
// `.mjs` gets no type stripping, so keep this plain.
const forced = process.argv.includes('--hour') ? 'hour' : process.argv.includes('--day') ? 'day' : undefined;
const ledgerPath = join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'storages', 'dsh-usage-tokens', 'ledger.json');

/** One table row, padded into columns. */
function printRow(label, totals, width = 30) {
  console.log(
    `  ${label.padEnd(width)}${exactNumber(totals.calls).padStart(7)}` +
    `${compactNumber(totals.inputTokens).padStart(10)}` +
    `${compactNumber(totals.cacheReadTokens + totals.cacheWriteTokens).padStart(10)}` +
    `${compactNumber(totals.outputTokens).padStart(10)}` +
    `${compactNumber(totalTokens(totals)).padStart(12)}`,
  );
}

/** Column headings, matching `printRow`. */
function printHead(title, label = '时间', width = 30) {
  console.log(`\n${title}`);
  console.log(
    `  ${label.padEnd(width)}${'调用'.padStart(7)}${'输入'.padStart(10)}` +
    `${'缓存'.padStart(10)}${'输出'.padStart(10)}${'总计'.padStart(12)}`,
  );
}

const ledger = await Ledger.open(ledgerPath);
const now = Date.now();
const today = dayKey(now);
const from = args[0] ?? today;
const to = args[1] ?? today;
const grain = forced ?? grainForRange(from, to);
const usage = buildUsage(ledger.records, resolveRange({ from, to, grain }, now), today);

console.log(`ledger   ${ledger.records.length.toLocaleString()} rows · ${ledgerPath}`);
console.log(`scope    ${usage.scope.from} .. ${usage.scope.to} (${usage.scope.grain}) · ${usage.recordCount.toLocaleString()} rows in range`);
console.log(`today    ${today} · ${exactNumber(usage.today.calls)} calls · ${compactNumber(totalTokens(usage.today))} tokens`);

printHead(`by ${usage.scope.grain} (only periods with usage)`);
for (const bucket of usage.scope.buckets) printRow(bucket.key, bucket);
printRow('合计', usage.scope.totals);

printHead('by model', '模型', 42);
for (const row of usage.scope.rows) printRow(row.key, row, 42);

printHead('by provider', '供应商', 24);
for (const row of byProvider(usage.scope.rows)) printRow(row.provider, row, 24);

// The bucket totals must add up to the scope total, or the table's own 合计 row
// would disagree with the rows above it.
const summed = usage.scope.buckets.reduce((sum, bucket) => sum + bucket.totalTokens, 0);
console.log(`\n  对账：分桶合计 ${summed.toLocaleString()} · 范围合计 ${usage.scope.totals.totalTokens.toLocaleString()} · 一致 ${summed === usage.scope.totals.totalTokens}`);

await ledger.close().catch(() => {});
