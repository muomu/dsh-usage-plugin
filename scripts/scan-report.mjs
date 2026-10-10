/**
 * Offline validation of the historical scan against the real session logs.
 *
 * Runs the same extraction and aggregation the plugin uses, then prints today's
 * total and the per-model breakdown so the figure the sidebar will show can be
 * checked against an independent count. Not part of the plugin runtime.
 *
 * Usage: node scripts/scan-report.mjs [days]
 */
import { scanSessions } from '../src/backfill.ts';
import { buildUsage } from '../src/aggregate.ts';
import { dayKey, resolveRange, trailingDays } from '../src/config.ts';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Standalone script: resolve the harness home the same way the plugin's
// dependency does, without needing it installed here.
const sessionsRoot = join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'sessions');

const days = Number(process.argv[2] ?? '7');
const progress = { running: true, sessions: 0, files: 0, records: 0, errors: 0 };
const started = Date.now();

const byId = new Map();
for await (const batch of scanSessions(sessionsRoot, progress)) {
  for (const row of batch) byId.set(row.id, row);
}
const records = [...byId.values()];
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

console.log(`scan: ${progress.files} logs from ${progress.sessions} session dirs in ${elapsed}s (${progress.errors} errors)`);
console.log(`rows: ${records.length} (${progress.records} before de-duplication)`);

const today = dayKey(Date.now());
const window = trailingDays(today, Math.max(1, Math.trunc(days)));
const usage = buildUsage(
  records,
  resolveRange({ from: window[0], to: today, grain: 'day' }, Date.now()),
  today,
);

const totals = usage.today;
console.log(`\ntoday ${totals.date}`);
console.log(`  calls        ${totals.calls}`);
console.log(`  input        ${totals.inputTokens.toLocaleString()}`);
console.log(`  cacheRead    ${totals.cacheReadTokens.toLocaleString()}`);
console.log(`  cacheWrite   ${totals.cacheWriteTokens.toLocaleString()}`);
console.log(`  output       ${totals.outputTokens.toLocaleString()}`);
console.log(`  reasoning    ${(totals.reasoningTokens ?? 0).toLocaleString()}`);
console.log(`  TOTAL        ${totals.totalTokens.toLocaleString()}`);

console.log('\nby model');
for (const row of usage.scope.rows) {
  console.log(`  ${row.key.padEnd(42)} calls=${String(row.calls).padStart(5)} total=${row.totalTokens.toLocaleString()}`);
}

console.log('\nby day');
for (const day of usage.scope.buckets) {
  console.log(`  ${day.key}  calls=${String(day.calls).padStart(5)}  total=${day.totalTokens.toLocaleString()}`);
}
