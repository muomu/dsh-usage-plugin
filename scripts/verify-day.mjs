/**
 * Independent verification of one day's token totals.
 *
 * Deliberately does not reuse `src/backfill.ts`: it walks the logs with its own
 * decoder and its own summation, so agreement with the plugin's number is real
 * evidence rather than the same bug counted twice. Prints a per-file breakdown
 * for the busiest files and every session whose records share a sequence
 * number, which is where a double count would hide.
 *
 * Usage: node scripts/verify-day.mjs [YYYY-MM-DD]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { zstdDecompressSync } from 'node:zlib';

const SESSION_FILE = /^session(?:\.v(\d+))?\.jsonl(\.zstd)?$/;
const day = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const root = join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'sessions');

/** Decode a concatenated-frame zstd buffer. */
function decode(buffer) {
  const parts = [];
  let rest = buffer;
  for (let i = 0; i < 200000 && rest.length > 0; i += 1) {
    let result;
    try {
      result = zstdDecompressSync(rest, { info: true });
    } catch {
      break;
    }
    parts.push(result.buffer);
    const used = result.engine?.bytesWritten ?? 0;
    if (!used || used >= rest.length) break;
    rest = rest.subarray(used);
  }
  return Buffer.concat(parts).toString('utf8');
}

/** Local-calendar day key, matching the plugin's rule. */
function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Best log inside one session directory. */
function pick(dir) {
  let best;
  for (const name of readdirSync(dir)) {
    const m = SESSION_FILE.exec(name);
    if (m === null) continue;
    const version = m[1] === undefined ? 0 : Number(m[1]);
    if (best === undefined || version > best.version) {
      best = { path: join(dir, name), version, compressed: m[2] === '.zstd' };
    }
  }
  return best;
}

const totals = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
const perFile = [];
const byVersion = new Map();
let scanned = 0;
const collisions = [];

for (const workspace of readdirSync(root)) {
  let entries;
  try {
    entries = readdirSync(join(root, workspace));
  } catch {
    continue;
  }
  for (const entry of entries) {
    const dir = join(root, workspace, entry);
    let picked;
    try {
      picked = pick(dir);
    } catch {
      continue;
    }
    if (picked === undefined) continue;
    const info = statSync(picked.path);
    if (info.size > 96 * 1024 * 1024) continue;
    let text;
    try {
      const raw = readFileSync(picked.path);
      text = picked.compressed ? decode(raw) : raw.toString('utf8');
    } catch {
      continue;
    }
    scanned += 1;
    byVersion.set(picked.version, (byVersion.get(picked.version) ?? 0) + 1);

    let headerId = entry;
    let fileCalls = 0;
    let fileTotal = 0;
    const seqSeen = new Set();
    const seqDup = new Set();
    for (const line of text.split('\n')) {
      if (line.length === 0) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === 'session') {
        if (typeof event.id === 'string') headerId = event.id;
        continue;
      }
      if (event.type !== 'assistant/message') continue;
      if (dayKey(event.time ?? 0) !== day) continue;
      const usage = event.data?.usage;
      if (usage === undefined || usage === null) continue;
      const input = usage.inputTokens ?? 0;
      const output = usage.outputTokens ?? 0;
      const cacheRead = usage.cacheReadTokens ?? 0;
      const cacheWrite = usage.cacheWriteTokens ?? 0;
      if (input + output + cacheRead + cacheWrite === 0) continue;
      if (seqSeen.has(event.seq)) seqDup.add(event.seq);
      seqSeen.add(event.seq);
      totals.calls += 1;
      totals.input += input;
      totals.output += output;
      totals.cacheRead += cacheRead;
      totals.cacheWrite += cacheWrite;
      totals.reasoning += usage.reasoningTokens ?? 0;
      fileCalls += 1;
      fileTotal += input + output + cacheRead + cacheWrite;
    }
    if (fileCalls > 0) perFile.push({ id: headerId, version: picked.version, calls: fileCalls, total: fileTotal });
    if (seqDup.size > 0) collisions.push({ id: headerId, dup: seqDup.size, calls: fileCalls });
  }
}

const grand = totals.input + totals.output + totals.cacheRead + totals.cacheWrite;
console.log(`day ${day}  logs scanned ${scanned}  (formats: ${[...byVersion].map(([v, n]) => `v${v}=${n}`).join(' ')})`);
console.log(`calls        ${totals.calls.toLocaleString()}`);
console.log(`input        ${totals.input.toLocaleString()}`);
console.log(`cacheRead    ${totals.cacheRead.toLocaleString()}`);
console.log(`cacheWrite   ${totals.cacheWrite.toLocaleString()}`);
console.log(`output       ${totals.output.toLocaleString()}`);
console.log(`reasoning    ${totals.reasoning.toLocaleString()}`);
console.log(`TOTAL        ${grand.toLocaleString()}`);

console.log(`\nfiles contributing: ${perFile.length}`);
perFile.sort((a, b) => b.total - a.total);
for (const file of perFile.slice(0, 12)) {
  console.log(`  ${file.id.slice(0, 44).padEnd(46)} v${file.version} calls=${String(file.calls).padStart(5)} total=${file.total.toLocaleString()}`);
}

console.log(`\nsessions with repeated seq among today's records: ${collisions.length}`);
for (const hit of collisions.slice(0, 12)) {
  console.log(`  ${hit.id.slice(0, 44).padEnd(46)} dupSeqs=${hit.dup} calls=${hit.calls}`);
}
