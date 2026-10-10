/**
 * The browser-facing read route.
 *
 * `ctx.webServer.register` handlers carry no authentication at all, so the
 * guard here is the only access control: the peer must be loopback and the
 * `Host`/`Origin` headers must name a local address. The Host check is what
 * stops a DNS-rebinding page from reaching the ledger through a browser that
 * resolves some attacker domain to 127.0.0.1.
 *
 * The route answers one question — "what did this time range cost" — at either
 * day or hour granularity. One range is one request and one payload, so there is
 * nothing to keep consistent between the tables the modal draws.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ROUTE_PREFIX,
  dayKey,
  resolveRange,
  type RangeRequest,
  type UsagePayload,
} from './config.ts';
import { buildUsage } from './aggregate.ts';
import type { Ledger } from './ledger.ts';
import type { BackfillProgress } from './backfill.ts';

/** Hostnames a local request may legitimately use. */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** True for any loopback peer address, including IPv4-mapped IPv6. */
function isLoopback(address: string | undefined): boolean {
  if (typeof address !== 'string' || address.length === 0) return false;
  const bare = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
  return bare === '::1' || bare === 'localhost' || bare.startsWith('127.');
}

/** Validate a `Host`/`Origin` authority against the local allowlist. */
function isLocalAuthority(value: string | undefined): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  // An Origin carries a scheme; a Host does not.
  const authority = value.includes('://') ? value.slice(value.indexOf('://') + 3) : value;
  const [hostname] = authority.split('/');
  if (hostname === undefined || hostname.length === 0) return false;
  // Strip the port, keeping IPv6 brackets intact.
  const name = hostname.startsWith('[')
    ? hostname.slice(0, hostname.indexOf(']') + 1)
    : (hostname.split(':')[0] ?? '');
  return LOCAL_HOSTNAMES.has(name);
}

/**
 * Reject a request that is not a same-machine browser fetch.
 * @param req - Incoming request.
 * @param res - Response, ended with 403 when rejected.
 * @returns True when the caller was rejected and the response is finished.
 */
export function rejectForeignCaller(req: IncomingMessage, res: ServerResponse): boolean {
  if (!isLoopback(req.socket?.remoteAddress)) {
    res.writeHead(403, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: 'forbidden', message: 'loopback callers only' }));
    return true;
  }
  const host = req.headers.host;
  if (!isLocalAuthority(Array.isArray(host) ? host[0] : host)) {
    res.writeHead(403, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: 'forbidden', message: 'unexpected Host header' }));
    return true;
  }
  const origin = req.headers.origin;
  const originValue = Array.isArray(origin) ? origin[0] : origin;
  if (originValue !== undefined && !isLocalAuthority(originValue)) {
    res.writeHead(403, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: 'forbidden', message: 'unexpected Origin' }));
    return true;
  }
  return false;
}

/** Write a JSON response with no caching. */
function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

/**
 * Read `from`, `to` and `grain` out of the request line.
 *
 * Nothing here validates the keys: `resolveRange` owns that, and its fallbacks
 * are total. An unparseable range shows today rather than an error page.
 * @param url - The raw request URL.
 * @returns Whatever the caller supplied, ready for `resolveRange`.
 */
export function parseRangeQuery(url: string | undefined): RangeRequest {
  const source = typeof url === 'string' ? url : '';
  const query = source.indexOf('?');
  const params = new URLSearchParams(query < 0 ? '' : source.slice(query + 1));
  const from = params.get('from');
  const to = params.get('to');
  return {
    ...(from === null || from.length === 0 ? {} : { from }),
    ...(to === null || to.length === 0 ? {} : { to }),
    // Anything that is not exactly `hour` means day: the query string is
    // user-editable, and day grain is always answerable.
    grain: params.get('grain') === 'hour' ? 'hour' : 'day',
  };
}

/** Everything the usage route needs from the running plugin. */
export interface RouteDeps {
  /**
   * The ledger, or a promise for it. Registering the route before the file is
   * open keeps the button responsive during a cold start; the handler simply
   * waits for the read.
   */
  ledger: Ledger | Promise<Ledger>;
  progress: BackfillProgress;
  /** Clock injection for tests. */
  now?: () => number;
}

/**
 * Build the usage handler.
 * @param deps - Ledger (or its opening promise), scan progress and clock.
 * @returns A node:http handler.
 */
export function createUsageHandler(deps: RouteDeps): (req: IncomingMessage, res: ServerResponse) => void {
  const now = deps.now ?? Date.now;
  return (req, res) => {
    if (rejectForeignCaller(req, res)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      json(res, 405, { ok: false, error: 'method-not-allowed' });
      return;
    }
    void (async () => {
      try {
        const ledger = await deps.ledger;
        const at = now();
        const range = resolveRange(parseRangeQuery(req.url), at);
        const payload: UsagePayload & { ok: true; scanning: BackfillProgress } = {
          ok: true,
          ...buildUsage(ledger.records, range, dayKey(at)),
          // The client keeps polling while this is running, so a slow first scan
          // shows growing numbers instead of a stale zero.
          scanning: deps.progress,
          backfilled: ledger.backfilled,
          generatedAt: at,
        };
        json(res, 200, payload);
      } catch (error) {
        console.warn(`[dsh-usage-tokens] usage failed: ${String(error)}`);
        json(res, 500, { ok: false, error: 'internal', message: error instanceof Error ? error.message : String(error) });
      }
    })();
  };
}

/** Route path of the usage endpoint. */
export const USAGE_PATH = `${ROUTE_PREFIX}/usage`;
