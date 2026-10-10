/**
 * Live token capture.
 *
 * The `llm/stream` waterfall is the only place a real request's provider-
 * reported usage is observable, and the usage chunk arrives *before* the
 * finish chunk. Two consequences shape this file:
 *
 * 1. The timestamp must be taken at request start, not when usage shows up, or
 *    a long streaming call would be filed under the wrong calendar day.
 * 2. A wrapper router (litellm, ark plans) can sit in front of the real call
 *    and re-enter the same waterfall. An `AsyncLocalStorage` depth marker makes
 *    only the outermost frame accountable, so one logical call bills once.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Buckets, UsageRecord } from './config.ts';

/** Usage chunk shape reported by the LLM adapters. */
interface UsageChunk {
  type?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
  };
}

/** Options object carried by the `llm/stream` waterfall. */
export interface LlmStreamOptions {
  provider?: string;
  model?: string;
  sessionId?: string;
  purpose?: string;
}

/** Minimal emit surface, so this module never imports cordis. */
export interface CaptureSink {
  append(row: UsageRecord): boolean;
}

/** Marks stream frames that re-entered the waterfall through a wrapper route. */
const streamDepth = new AsyncLocalStorage<number>();

/** Window in which an identical usage report counts as the same call. */
const DEDUPE_WINDOW_MS = 10_000;

/** Read one number from a possibly-absent field. */
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Pull the disjoint buckets out of a usage chunk.
 * @param usage - Provider-reported usage.
 * @returns Normalized buckets, reasoning kept separate because it is a subset
 * of `outputTokens` and must not be counted twice.
 */
function bucketsOf(usage: NonNullable<UsageChunk['usage']>): Buckets {
  const out: Buckets = {
    inputTokens: num(usage.inputTokens),
    outputTokens: num(usage.outputTokens),
    cacheReadTokens: num(usage.cacheReadTokens),
    cacheWriteTokens: num(usage.cacheWriteTokens),
  };
  const reasoning = num(usage.reasoningTokens);
  if (reasoning > 0) out.reasoningTokens = reasoning;
  return out;
}

/** True when a usage report carries nothing worth a ledger row. */
function isEmpty(b: Buckets): boolean {
  return b.inputTokens === 0 && b.outputTokens === 0 && b.cacheReadTokens === 0 && b.cacheWriteTokens === 0;
}

/**
 * Build the `llm/stream` listener.
 *
 * Register it with `ctx.on('llm/stream', handler, { global: true })`: without
 * the global flag the listener only sees this plugin's own context, not the
 * agent's calls.
 *
 * @param sink - Receives one row per completed model call.
 * @param options - Clock and id injection for tests.
 * @returns The waterfall listener.
 */
export function createStreamCapture(
  sink: CaptureSink,
  options: { now?: () => number; id?: () => string } = {},
): (opts: LlmStreamOptions, next: () => AsyncIterable<UsageChunk>) => AsyncIterable<UsageChunk> {
  const now = options.now ?? Date.now;
  const newId = options.id ?? randomUUID;
  /** fingerprint -> capture time, for the short-window duplicate guard. */
  const recent = new Map<string, number>();

  return function captureStream(opts, next) {
    const downstream = next();
    // A nested frame means a wrapper route forwarded the call; the outermost
    // frame already owns accounting for it.
    if (streamDepth.getStore() !== undefined) return downstream;

    const startedAtMs = now();
    const provider = typeof opts?.provider === 'string' && opts.provider.length > 0 ? opts.provider : 'unknown';
    const model = typeof opts?.model === 'string' && opts.model.length > 0 ? opts.model : 'unknown';
    const sessionId = typeof opts?.sessionId === 'string' ? opts.sessionId : '';

    return (async function* measured(): AsyncGenerator<UsageChunk> {
      let usage: Buckets | undefined;
      const iterator = downstream[Symbol.asyncIterator]();
      let completed = false;
      try {
        for (;;) {
          const result = await streamDepth.run(1, () => iterator.next());
          if (result.done === true) break;
          const chunk = result.value;
          if (chunk !== null && typeof chunk === 'object' && chunk.type === 'usage' && chunk.usage != null) {
            usage = bucketsOf(chunk.usage);
          }
          yield chunk;
        }
        completed = true;
      } finally {
        // An aborted stream still consumed tokens, but the harness reports none
        // for it; only close the upstream iterator and account what we saw.
        if (!completed) {
          try {
            await iterator.return?.();
          } catch {
            // Best effort: a failing cancel must not mask the original error.
          }
        }
        if (usage !== undefined && !isEmpty(usage)) {
          const fingerprint = [
            provider, model,
            usage.inputTokens, usage.outputTokens,
            usage.cacheReadTokens, usage.cacheWriteTokens,
          ].join('|');
          const last = recent.get(fingerprint);
          const duplicate = last !== undefined && startedAtMs - last < DEDUPE_WINDOW_MS;
          if (!duplicate) {
            recent.set(fingerprint, startedAtMs);
            // Bound the map without a timer: entries older than the window can
            // never suppress anything again.
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
              ...(typeof opts?.purpose === 'string' && opts.purpose.length > 0 ? { purpose: opts.purpose } : {}),
              ...usage,
              src: 'live',
            });
          }
        }
      }
    })();
  };
}
