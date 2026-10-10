/**
 * Host half of `dsh-usage-tokens`.
 *
 * Responsibilities: open the ledger, capture live usage from the `llm/stream`
 * waterfall, run the one-time historical scan in the background, and publish a
 * read-only summary route for the browser half. The Client half is discovered
 * separately through the `dsh.client` manifest and owns all rendering.
 *
 * Ordering matters: the route and the capture listener are attached as soon as
 * the ledger file is open, so the button answers immediately with a partial
 * figure while the historical scan streams rows in behind it. Nothing waits for
 * the scan.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LEDGER_RELATIVE_PATH } from './config.ts';
import { createStreamCapture } from './collect.ts';
import { Ledger } from './ledger.ts';
import { scanSessions, type BackfillProgress } from './backfill.ts';
import { USAGE_PATH, createUsageHandler } from './route.ts';

/** Cordis services this plugin waits for. */
export const inject = ['webServer', 'sessions'];

/** HTTP route shape accepted by the web server service. */
interface WebRoute {
  kind: 'exact' | 'prefix';
  path: string;
  handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void | Promise<void>;
}

/** The slice of the host context this plugin touches. */
interface HostContext {
  webServer: { register(route: WebRoute): () => void };
  on(event: string, listener: (...args: never[]) => unknown, options?: { global?: boolean }): () => void;
  effect(callback: () => (() => void) | void, label?: string): () => void;
}

/**
 * Resolve the DeepSeek Harness home.
 *
 * Implemented locally rather than imported from `@deepseek-ai/dsh-home-paths`.
 * A profile-installed plugin is normally reached through a symlink, and Node
 * resolves a module's imports from its REAL path, so a package that only exists
 * inside the dsh installation is not resolvable from a `link:`-installed
 * plugin. Importing it made the whole plugin fail to load. Precedence matches
 * the official helper: `$DSH_HOME`, then `~/.dsh`.
 * @returns Absolute path of the harness home.
 */
function resolveDshHome(): string {
  const fromEnv = process.env.DSH_HOME;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv.trim();
  return join(homedir(), '.dsh');
}

/** Absolute path of the ledger file. */
function ledgerPath(): string {
  return join(resolveDshHome(), ...LEDGER_RELATIVE_PATH);
}

/** Absolute path of the durable session log root. */
function sessionsRoot(): string {
  return join(resolveDshHome(), 'sessions');
}

/**
 * Mount the host half.
 * @param ctx - Host context carrying `webServer` and `sessions`.
 */
export function apply(ctx: HostContext): void {
  const progress: BackfillProgress = { running: false, sessions: 0, files: 0, records: 0, errors: 0 };

  const opening = Ledger.open(ledgerPath());

  // The route is registered in the same synchronous turn as `apply`, so it is
  // reachable the moment the plugin loads; it awaits the ledger internally.
  ctx.effect(() => {
    const unregister = ctx.webServer.register({
      kind: 'exact',
      path: USAGE_PATH,
      handler: createUsageHandler({ ledger: opening, progress }) as unknown as WebRoute['handler'],
    });
    return () => { unregister(); };
  }, 'dsh-usage-tokens: usage route');

  const started = opening.then(async (ledger) => {
    // Attach capture before the scan starts, so a call that happens during the
    // scan is recorded live rather than being missed. `global: true` is what
    // makes the listener see the agent's own model calls instead of only this
    // plugin's context.
    ctx.effect(() => {
      const listener = createStreamCapture(ledger) as unknown as (...args: never[]) => unknown;
      ctx.on('llm/stream', listener, { global: true });
      return () => {};
    }, 'dsh-usage-tokens: live capture');

    // Flush and release on unload.
    ctx.effect(() => () => {
      void ledger.close().catch(() => {});
    }, 'dsh-usage-tokens: shutdown flush');

    if (ledger.backfilled) {
      progress.running = false;
      return ledger;
    }
    progress.running = true;
    await runBackfill(ledger, progress);
    return ledger;
  });

  void started.catch((error: unknown) => {
    console.warn(`[dsh-usage-tokens] host init failed: ${String(error)}`);
  });
}

/**
 * Stream the historical scan into the ledger, then mark it done.
 * @param ledger - Open ledger.
 * @param progress - Mutated in place for the route's progress report.
 */
async function runBackfill(ledger: Ledger, progress: BackfillProgress): Promise<void> {
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
    await ledger.flush().catch(() => {});
  }
}
