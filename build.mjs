/**
 * Build both halves of the plugin with esbuild.
 *
 * The host half is ordinary ESM that Node imports through the cordis Loader,
 * bundled into one self-contained file so it has no runtime dependencies.
 *
 * The browser half is not ESM: it must register itself into
 * `window.__ModuleLoader__.load({ id, factory })`, where `id` is the exact
 * package name and `factory(require)` returns the module namespace. esbuild
 * cannot emit that wrapper, so the client bundle is built as CommonJS — which
 * already writes `exports.apply = …` — and wrapped in the loader envelope, with
 * the React specifiers left for the browser module table to satisfy.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const packageName = pkg.name;

/** Shared compile options. */
const common = {
  bundle: true,
  sourcemap: false,
  logLevel: 'warning',
  target: ['node22'],
  legalComments: 'none',
};

/** Build the host entry as ESM, self-contained. */
async function buildHost() {
  await build({
    ...common,
    entryPoints: [join(root, 'src/index.ts')],
    outfile: join(root, 'lib/index.js'),
    format: 'esm',
    platform: 'node',
  });
  // A profile-installed plugin is reached through a `link:` symlink, and Node
  // resolves a module's imports from its REAL path — so a bare
  // `@deepseek-ai/*` import that exists only inside the dsh installation fails
  // at load time, leaving the plugin installed but never running. Fail the
  // build instead of shipping that.
  const built = await readFile(join(root, 'lib/index.js'), 'utf8');
  const leaked = [...new Set(
    [...built.matchAll(/^import[^;]*?from\s+"(@deepseek-ai\/[^"]+)"/gm)].map(match => match[1]),
  )];
  if (leaked.length > 0) {
    throw new Error(
      `host bundle must not import Harness packages (unresolvable from a link: install): ${leaked.join(', ')}`,
    );
  }
}

/**
 * Build the browser entry into the module-loader format.
 *
 * The bundle is emitted as CommonJS, not IIFE: the loader's contract is
 * `factory(require) => module namespace`, and CJS writes exactly that shape
 * (`exports.apply = …`) while turning every external import into a
 * `require("…")` the loader satisfies from the browser module table. An IIFE
 * build would instead evaluate immediately and expose nothing to return.
 *
 * `react`, `react/jsx-runtime` and `react-dom` are the only specifiers
 * required, and all three are seeded into that table by the web shell; anything
 * else would fail at runtime with "missed the module table", so the graph is
 * deliberately kept to React alone.
 */
async function buildClient() {
  const out = await build({
    ...common,
    entryPoints: [join(root, 'src/client/index.tsx')],
    format: 'cjs',
    platform: 'browser',
    target: ['es2022'],
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom'],
    write: false,
    banner: {
      js: `window.__ModuleLoader__.load({\n  id: ${JSON.stringify(packageName)},\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;`,
    },
    footer: { js: '    return module.exports;\n  },\n});' },
  });

  const file = out.outputFiles?.[0];
  if (file === undefined) throw new Error('esbuild produced no client output');
  const code = file.text;
  if (!code.includes('return module.exports;')) {
    throw new Error('client bundle wrapper is missing its return');
  }
  // Fail the build rather than ship a bundle that cannot resolve at runtime.
  const required = [...code.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1]);
  const allowed = new Set(['react', 'react/jsx-runtime', 'react-dom']);
  const unexpected = [...new Set(required)].filter(spec => !allowed.has(spec));
  if (unexpected.length > 0) {
    throw new Error(`client bundle requires undeclared modules: ${unexpected.join(', ')}`);
  }
  await writeFile(join(root, 'lib/client.js'), code, 'utf8');
}

/**
 * Evaluate the finished bundle the way the browser will.
 *
 * A stray backtick inside the embedded-CSS comment leaves the bundle
 * syntactically valid while turning the comment's tail into code, so no
 * compile-time check can catch it — the failure mode that shipped once as
 * "import failed: rows is not defined" at web boot. Only evaluation catches it.
 */
async function smokeTestClient() {
  const code = await readFile(join(root, 'lib/client.js'), 'utf8');
  const stubs = {
    'react': { createElement: (type) => ({ type }), Fragment: 'Fragment' },
    'react/jsx-runtime': { jsx: (type) => ({ type }), jsxs: (type) => ({ type }), Fragment: 'Fragment' },
    'react-dom': {},
  };
  let registered;
  const sandbox = {
    window: { __ModuleLoader__: { load: (definition) => { registered = definition; } } },
    require: (spec) => {
      if (spec in stubs) return stubs[spec];
      throw new Error(`client bundle required an unseeded module: ${spec}`);
    },
  };
  runInNewContext(code, sandbox);
  if (registered?.id !== packageName || typeof registered.factory !== 'function') {
    throw new Error('client bundle did not register itself with the module loader');
  }
  const clientExports = registered.factory(sandbox.require);
  if (typeof clientExports?.apply !== 'function') {
    throw new Error('client bundle factory did not return an apply function');
  }
}

await mkdir(join(root, 'lib'), { recursive: true });
await Promise.all([buildHost(), buildClient()]);
await smokeTestClient();
console.log(`built ${packageName}: lib/index.js, lib/client.js`);
