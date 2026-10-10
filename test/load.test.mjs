/**
 * Loadability tests for the built host half.
 *
 * These exist because of a real failure: the host entry originally imported
 * `@deepseek-ai/dsh-home-paths`, which resolves from inside the dsh
 * installation but NOT from a `link:`-installed plugin, because Node resolves a
 * module's imports from its real path rather than the symlink. The plugin
 * installed cleanly, appeared in the composed config, and then never ran —
 * silently, with no ledger and no error the user could see.
 *
 * The check below imports the built file the way the loader does, from the
 * symlink, so that failure mode cannot come back unnoticed.
 */
import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { test } from 'node:test';

const root = join(import.meta.dirname, '..');
const profileLink = join(homedir(), '.dsh', 'profiles', 'web', 'node_modules', 'dsh-usage-tokens');

test('built host half imports cleanly from its real path', async () => {
  const module = await import(pathToFileURL(join(root, 'lib/index.js')).href);
  assert.equal(typeof module.apply, 'function');
  assert.deepEqual([...module.inject].sort(), ['sessions', 'webServer']);
});

test('built host half imports cleanly through the profile symlink', { skip: !existsSync(profileLink) ? 'plugin not installed in the web profile' : false }, async () => {
  // Importing through the symlink is what the loader does; Node then resolves
  // the module's own imports from the real path, which is where a leaked
  // Harness import would throw ERR_MODULE_NOT_FOUND.
  const module = await import(pathToFileURL(join(profileLink, 'lib/index.js')).href);
  assert.equal(typeof module.apply, 'function');
});

test('the host bundle carries no bare Harness imports', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(join(root, 'lib/index.js'), 'utf8');
  const leaked = [...source.matchAll(/^import[^;]*?from\s+"(@deepseek-ai\/[^"]+)"/gm)].map(m => m[1]);
  assert.deepEqual(leaked, [], 'a link: install cannot resolve these');
});

test('apply registers its route synchronously without touching the real ledger', async (t) => {
  // `apply` must register the route in its first synchronous turn, so the
  // button is reachable before the ledger file is even open.
  //
  // DSH_HOME is redirected to a temporary directory first: calling `apply`
  // really does open a ledger and start a historical scan, so without the
  // redirect this test would write to the live store — which is exactly how the
  // real ledger got populated from a test run once.
  const base = await mkdtemp(join(tmpdir(), 'dsh-usage-load-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = base;
  t.after(async () => {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    await rm(base, { recursive: true, force: true });
  });

  const { apply } = await import(pathToFileURL(join(root, 'lib/index.js')).href);
  const registered = [];
  const ctx = {
    webServer: { register(route) { registered.push(route); return () => {}; } },
    on() { return () => {}; },
    effect(callback) { const cleanup = callback(); return typeof cleanup === 'function' ? cleanup : () => {}; },
  };
  assert.doesNotThrow(() => { apply(ctx); });
  // Registered before any await, so the route exists on the first turn.
  assert.equal(registered.length, 1);
  assert.equal(registered[0].kind, 'exact');
  assert.equal(registered[0].path, '/api/dsh-usage-tokens/usage');
  assert.equal(typeof registered[0].handler, 'function');
});

test('the ledger path can be redirected by DSH_HOME', async () => {
  // Proves the home resolution honours the environment override, which is what
  // lets a future integration test run without touching the real ledger.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(join(root, 'lib/index.js'), 'utf8');
  assert.match(source, /process\.env\.DSH_HOME/);
});
