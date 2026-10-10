/**
 * Render tests for the browser half.
 *
 * `lib/client.js` is not importable by Node — it is a CommonJS bundle wrapped in
 * the Web shell's `window.__ModuleLoader__.load({ id, factory })` envelope, and
 * its source is JSX. These tests load it exactly the way the shell does, with the
 * real React (18.3.1, the version the shell bundles) and a jsdom document, then
 * drive the modal against a stubbed route.
 *
 * That is the only way to check the panel renders without restarting DSH, which
 * is why the assertions are about structure — which rows appear, in what order,
 * and what the picker reports — rather than about pixel output.
 *
 * Run `npm run build` first; without the bundle the suite skips itself.
 */
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { runInThisContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const root = join(import.meta.dirname, '..');
const bundlePath = join(root, 'lib/client.js');

/** Today's date, as the host would key it. */
const TODAY = '2026-09-29';
/** The first day of the seven-day range the day fixtures cover. */
const WEEK_FROM = '2026-09-23';

/** The five buckets plus the derived total, for one fabricated period. */
function totals(calls, inputTokens, outputTokens, cacheReadTokens) {
  return {
    calls,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: inputTokens + outputTokens + cacheReadTokens,
  };
}

/** All 24 hours of TODAY, with activity only at 09 and 14. */
function hourPayload() {
  const buckets = [];
  for (let hour = 23; hour >= 0; hour -= 1) {
    const key = `${TODAY}T${String(hour).padStart(2, '0')}`;
    const active = hour === 14 ? totals(1, 20, 7, 200) : hour === 9 ? totals(1, 10, 5, 100) : totals(0, 0, 0, 0);
    buckets.push({ key, start: 0, end: 0, ...active });
  }
  return {
    ok: true,
    today: { date: TODAY, ...totals(2, 30, 12, 300) },
    scope: {
      from: `${TODAY}T00`,
      to: `${TODAY}T23`,
      grain: 'hour',
      fromMs: 0,
      toMs: 0,
      buckets,
      rows: [
        { key: 'litellm:glm-5.3', provider: 'litellm', model: 'glm-5.3', ...totals(1, 20, 7, 200) },
        { key: 'deepseek-official:deepseek-flash', provider: 'deepseek-official', model: 'deepseek-flash', ...totals(1, 10, 5, 100) },
      ],
      totals: totals(2, 30, 12, 300),
      hitRate: 0.9,
      dense: false,
    },
    recordCount: 2,
    backfilled: true,
    generatedAt: 1_790_000_000_000,
    scanning: { running: false, sessions: 0, files: 0, records: 0, errors: 0 },
  };
}

/** Seven days ending TODAY, with one quiet day in the middle. */
function dayPayload() {
  const days = ['2026-09-29', '2026-09-28', '2026-09-27', '2026-09-26', '2026-09-25', '2026-09-24', '2026-09-23'];
  const buckets = days.map((key, index) => ({
    key,
    start: 0,
    end: 0,
    ...(index === 3 ? totals(0, 0, 0, 0) : totals(10 - index, index * 5, index, index * 100)),
  }));
  return {
    ok: true,
    today: { date: TODAY, ...totals(10, 30, 12, 300) },
    scope: {
      from: WEEK_FROM,
      to: TODAY,
      grain: 'day',
      fromMs: 0,
      toMs: 0,
      buckets,
      rows: [
        { key: 'litellm:glm-5.3', provider: 'litellm', model: 'glm-5.3', ...totals(1, 4, 4, 0) },
        { key: 'deepseek-official:deepseek-flash', provider: 'deepseek-official', model: 'deepseek-flash', ...totals(2, 31, 13, 300) },
      ],
      totals: totals(3, 35, 17, 300),
      hitRate: 0.9,
      dense: false,
    },
    recordCount: 3,
    backfilled: true,
    generatedAt: 1_790_000_000_000,
    scanning: { running: false, sessions: 0, files: 0, records: 0, errors: 0 },
  };
}

/** What the older host answered with, for the fallback path. */
function legacyBody() {
  return {
    ok: true,
    date: TODAY,
    today: { calls: 1, inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheWriteTokens: 0, totalTokens: 115 },
    trend: [{ date: TODAY, calls: 1, inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheWriteTokens: 0, totalTokens: 115 }],
    rows: [],
    recordCount: 1,
    backfilled: true,
    generatedAt: 1,
    scanning: { running: false, sessions: 0, files: 0, records: 0, errors: 0 },
  };
}

/**
 * A page with the plugin's bundle loaded into it, the way the Web shell does.
 * @returns Handles for rendering and inspecting the tree.
 */
function mountPage() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://127.0.0.1:3080/',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const define = (key, value) => { Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); };
  define('window', w);
  define('document', w.document);
  define('navigator', w.navigator);
  define('HTMLElement', w.HTMLElement);
  define('Node', w.Node);
  define('Event', w.Event);
  define('MouseEvent', w.MouseEvent);
  define('KeyboardEvent', w.KeyboardEvent);
  define('getComputedStyle', w.getComputedStyle.bind(w));
  define('requestAnimationFrame', w.requestAnimationFrame.bind(w));
  define('cancelAnimationFrame', w.cancelAnimationFrame.bind(w));
  define('IS_REACT_ACT_ENVIRONMENT', true);

  // React must be resolved only after `window`/`document` exist.
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const act = React.act;

  let definition;
  w.__ModuleLoader__ = { load: (value) => { definition = value; } };
  runInThisContext(readFileSync(bundlePath, 'utf8'), { filename: bundlePath });
  assert.equal(definition?.id, 'dsh-usage-tokens', 'the bundle must register under the package name');
  const client = definition.factory((spec) => require(spec));

  const container = w.document.createElement('div');
  w.document.body.appendChild(container);
  const tree = createRoot(container);

  return {
    window: w,
    document: w.document,
    client,
    React,
    /** Mount the modal and let its effects settle. */
    async render(element) {
      await act(async () => { tree.render(element); });
    },
    /** Run an interaction and let anything it triggers settle. */
    async act(fn) {
      await act(async () => { await fn(); });
    },
    /** Every URL the component asked the host for, in order. */
    urls: [],
    /** Take over `fetch`, answering per URL. */
    stubFetch(handler) {
      this.urls.length = 0;
      const previous = globalThis.fetch;
      globalThis.fetch = async (url) => {
        this.urls.push(String(url));
        const result = handler(String(url));
        if (result === undefined) throw new Error(`unexpected fetch: ${url}`);
        return { status: result.status ?? 200, ok: (result.status ?? 200) < 400, json: async () => result.body };
      };
      afterEach(() => { globalThis.fetch = previous; });
    },
  };
}

/**
 * Build the modal element.
 *
 * The component must be handed to React as an element — calling it directly
 * would run its hooks outside a render and read a null dispatcher.
 */
function modal(page, props) {
  return page.React.createElement(page.client.UsageModal, {
    open: true,
    onClose: () => {},
    error: undefined,
    onRangeChange: () => {},
    today: TODAY,
    ...props,
  });
}

/** The plugin's translator, over one dictionary, with `{name}` interpolation. */
function translator(dictionary) {
  return (key, params) => {
    const template = dictionary[key] ?? key;
    return params === undefined
      ? template
      : template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
  };
}

/**
 * Type into an input the way a user does.
 *
 * Assigning `input.value` directly would go through React's own value tracker,
 * which then reports "nothing changed" and swallows the event; going through the
 * prototype's native setter is what a real keystroke effectively does.
 */
function setInputValue(input, value) {
  const view = input.ownerDocument.defaultView;
  const descriptor = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value');
  descriptor.set.call(input, value);
  input.dispatchEvent(new view.Event('input', { bubbles: true }));
}

/** The timeline table, found by its heading rather than by position. */
function timelineTable(document) {
  return [...document.querySelectorAll('table')]
    .find(table => table.querySelector('thead th')?.textContent === '时间');
}

/** Every row label in the timeline table, in render order. */
function rowLabels(document) {
  const table = timelineTable(document);
  if (table === undefined) return [];
  return [...table.querySelectorAll('tbody tr td:first-child')]
    .map(cell => cell.textContent.trim());
}

const built = existsSync(bundlePath);
const skip = built ? false : 'run `npm run build` first';

test('a single day is sliced by the hour', { skip }, async () => {
  const page = mountPage();
  page.stubFetch(() => ({ body: hourPayload() }));
  const t = translator(page.client.dictionaries.zh);
  await page.render(modal(page, { t, data: hourPayload(), range: { from: TODAY, to: TODAY } }));

  const rows = rowLabels(page.document);
  // Only the two hours that saw calls, newest first, plus the total row.
  assert.deepEqual(rows, ['14:00', '09:00', '合计']);

  // The heading says which slice is on screen, and the range in the subtitle.
  const text = page.document.body.textContent;
  assert.match(text, /按小时/);
  assert.match(text, /时间分布/);
  assert.match(text, /仅显示有用量的时段/);
  // The panel holds no chart and nothing to expand.
  assert.equal(page.document.querySelector('.dsut-chart'), null);
  assert.equal(page.document.querySelector('.dsut-drill'), null);
  assert.equal(page.urls.length, 0, 'rendering a payload must not fetch anything');
});

test('a wider range is sliced by the day', { skip }, async () => {
  const page = mountPage();
  page.stubFetch(() => ({ body: dayPayload() }));
  const t = translator(page.client.dictionaries.zh);
  await page.render(modal(page, { t, data: dayPayload(), range: { from: WEEK_FROM, to: TODAY } }));

  const rows = rowLabels(page.document);
  // Six of the seven days saw calls, newest first, and the quiet 9-26 is gone.
  // Only the date part is compared: the weekday after it is locale-dependent.
  assert.deepEqual(rows.slice(0, 6).map(row => row.slice(0, 4)), ['9-29', '9-28', '9-27', '9-25', '9-24', '9-23']);
  assert.equal(rows[6], '合计');
  assert.match(page.document.body.textContent, /按天/);
  // A day row is a date, never a clock time.
  assert.equal(rows.some(row => /^\d{2}:00$/.test(row)), false, rows.join(' | '));
});

test('the range picker reports the dates it selected', { skip }, async () => {
  const page = mountPage();
  page.stubFetch(() => ({ body: dayPayload() }));
  const t = translator(page.client.dictionaries.zh);
  const changes = [];
  const render = (range) => page.render(page.React.createElement(page.client.UsageModal, {
    open: true,
    onClose: () => {},
    t,
    data: dayPayload(),
    error: undefined,
    range,
    onRangeChange: (next) => { changes.push(next); },
  }));

  await render({ from: TODAY, to: TODAY });

  // "Last 7 days" spans today and the six days before it.
  const seven = [...page.document.querySelectorAll('button.dsut-toggleBtn')].find(node => node.textContent === '近 7 天');
  assert.ok(seven !== undefined, 'missing the 7-day preset');
  await page.act(async () => { seven.click(); });
  assert.deepEqual(changes.at(-1), { from: WEEK_FROM, to: TODAY });

  // There is no granularity switch to get out of step with the dates.
  const labels = [...page.document.querySelectorAll('button.dsut-toggleBtn')].map(node => node.textContent);
  assert.equal(labels.includes('按小时'), false, labels.join(' | '));

  // A custom start date is reported as given.
  await render({ from: WEEK_FROM, to: TODAY });
  const dateInputs = [...page.document.querySelectorAll('input[type="date"]')];
  assert.equal(dateInputs.length, 2);
  await page.act(async () => { setInputValue(dateInputs[0], '2026-06-01'); });
  assert.deepEqual(changes.at(-1), { from: '2026-06-01', to: TODAY });

  // An inverted pair is swapped, so the host never sees from > to.
  await render({ from: TODAY, to: TODAY });
  const inverted = [...page.document.querySelectorAll('input[type="date"]')];
  await page.act(async () => { setInputValue(inverted[1], '2026-09-20'); });
  assert.deepEqual(changes.at(-1), { from: '2026-09-20', to: TODAY });
});

test('a host that has not reloaded shows the degraded view, not an error', { skip }, async () => {
  const page = mountPage();
  page.stubFetch((url) => {
    // What the running Web server actually answers an unregistered plugin
    // route with: 401 from the auth gate, before route matching.
    if (url.startsWith('/api/dsh-usage-tokens/usage')) return { status: 401, body: {} };
    return { body: legacyBody() };
  });

  // The modal reads its payload from props; the fallback lives in `fetchUsage`,
  // so this drives the same code path the button's poll uses.
  const { fetchUsage } = await import('../src/client/api.ts');
  const result = await fetchUsage({ from: TODAY, to: TODAY });
  assert.equal(result.ok, true);
  assert.equal(result.data.legacy, true);

  const t = translator(page.client.dictionaries.zh);
  await page.render(modal(page, { t, data: result.data, range: { from: TODAY, to: TODAY } }));
  const text = page.document.body.textContent;
  assert.match(text, /重启 DSH/);
  assert.match(text, /9-29/);

  // The picker is inert: the legacy route ignores the requested range, so a
  // date that looks selected would not be the range on screen.
  const controls = [...page.document.querySelectorAll('.dsut-range button, .dsut-range input')];
  assert.ok(controls.length >= 6, `expected the picker to render, got ${controls.length}`);
  assert.equal(controls.every(node => node.disabled), true, 'every picker control must be disabled');
});

test('the model breakdown sits above the timeline', { skip }, async () => {
  const page = mountPage();
  page.stubFetch(() => ({ body: hourPayload() }));
  const t = translator(page.client.dictionaries.zh);
  await page.render(modal(page, { t, data: hourPayload(), range: { from: TODAY, to: TODAY } }));

  const headings = [...page.document.querySelectorAll('table thead th:first-child')]
    .map(cell => cell.textContent);
  assert.deepEqual(headings, ['模型', '时间']);
});

test('both dictionaries carry the same keys', { skip }, () => {
  const page = mountPage();
  const { zh, en } = page.client.dictionaries;
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  // Every key the modal asks for must exist in both, or one locale shows raw keys.
  for (const key of Object.values(zh)) assert.equal(typeof key, 'string');
});
