window.__ModuleLoader__.load({
  id: "dsh-usage-tokens",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  UsageModal: () => UsageModal,
  apply: () => apply,
  dictionaries: () => dictionaries,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react3 = require("react");

// src/client/styles.ts
var import_react = require("react");
var P = "dsut";
var css = `
/* Shared sidebar.footer.action row: the row is a plain non-wrapping flex line
   the host renders for every occupant (us, Seeker, cordis). In the expanded
   sidebar each occupant takes its own full-width line, native-settings-row
   style; the wrap declaration below is what allows that \u2014 without it the row
   forces siblings side by side. The dsut-rows-hook element is our mount
   hook: its parent is the host row, so the sibling selector retargets the row
   itself. Collapsed rail rows keep icons side by side (rail renders no hook). */
.dsut-rows-hook{display:none}
:has(> .dsut-rows-hook){display:flex !important;flex-wrap:wrap;row-gap:2px}
.${P}-btn{display:flex;align-items:center;gap:8px;width:100%;min-width:0;flex:0 1 100%;height:36px;padding:0 8px;
  border:0;background:transparent;cursor:pointer;border-radius:var(--dsw-radius-sm,8px);
  color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1;text-align:left;
  transition:background var(--ds-transition-duration,.15s)}
.${P}-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.${P}-btn[data-rail="true"]{width:36px;flex:0 0 auto;padding:0;justify-content:center}
.${P}-btnIcon{display:inline-flex;flex:none;color:currentColor}
.${P}-btnLabel{min-width:0;flex:0 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${P}-btnValue{margin-left:auto;flex:none;font-variant-numeric:tabular-nums;font-weight:500;
  color:var(--dsw-alias-label-primary);white-space:nowrap}
.${P}-btnValue[data-rail="true"]{display:none}

.${P}-root{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;
  padding:max(24px,var(--dsh-frame-top-clearance,24px)) 24px;pointer-events:auto}
.${P}-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1);
  backdrop-filter:var(--dsw-mask-blur)}
.${P}-dialog{position:relative;z-index:1;display:flex;flex-direction:column;gap:16px;
  width:min(760px,100%);max-height:100%;overflow:hidden;padding:20px;
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-panel,12px);
  box-shadow:var(--dsw-elevation-prominent);font-size:14px}
.${P}-head{display:flex;align-items:flex-start;gap:12px}
.${P}-title{margin:0;font-size:16px;font-weight:600;line-height:1.4}
.${P}-subtitle{margin:2px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.${P}-close{margin-left:auto;flex:none;width:28px;height:28px;display:inline-flex;align-items:center;
  justify-content:center;border:0;background:transparent;cursor:pointer;border-radius:var(--dsw-radius-sm,6px);
  color:var(--dsw-alias-label-secondary);font-size:16px;line-height:1}
.${P}-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.${P}-body{overflow:auto;display:flex;flex-direction:column;gap:18px;padding-right:2px}

.${P}-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px}
.${P}-card{padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);
  border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2)}
.${P}-card[data-emphasis="true"]{border-color:var(--dsw-alias-brand-primary)}
.${P}-cardLabel{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.${P}-cardValue{margin-top:4px;font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;
  line-height:1.25}
.${P}-cardHint{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-caption)}

.${P}-section{display:flex;flex-direction:column;gap:8px}
.${P}-sectionHead{display:flex;align-items:center;gap:8px}
.${P}-sectionTitle{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.${P}-toggle{margin-left:auto;display:inline-flex;gap:2px;padding:2px;border-radius:var(--dsw-radius-sm,6px);
  background:var(--dsw-alias-bg-layer-2)}
.${P}-toggleBtn{border:0;background:transparent;cursor:pointer;padding:3px 10px;font-size:12px;
  border-radius:var(--dsw-radius-xs,4px);color:var(--dsw-alias-label-secondary)}
.${P}-toggleBtn[data-active="true"]{background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary);font-weight:500}
.${P}-toggleBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.${P}-toggleBtn[disabled]{opacity:.45;cursor:not-allowed}

.${P}-tableWrap{overflow-x:auto;border:1px solid var(--dsw-alias-border-l2);
  border-radius:var(--dsw-radius-md,8px)}
table.${P}-table{width:100%;border-collapse:collapse;font-size:12.5px}
.${P}-table th,.${P}-table td{padding:7px 10px;text-align:right;white-space:nowrap;
  border-bottom:1px solid var(--dsw-alias-border-l1)}
.${P}-table th{color:var(--dsw-alias-label-tertiary);font-weight:500;font-size:12px;
  background:var(--dsw-alias-bg-layer-2);position:sticky;top:0}
.${P}-table th:first-child,.${P}-table td:first-child{text-align:left}
.${P}-table tr:last-child td{border-bottom:0}
.${P}-table td{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.${P}-table tr[data-total="true"] td{font-weight:600;background:var(--dsw-alias-bg-layer-2)}
.${P}-model{color:var(--dsw-alias-label-primary)}
.${P}-provider{color:var(--dsw-alias-label-tertiary);font-size:11.5px}

/* Range picker: presets, a granularity switch and the custom date inputs. */
.${P}-range{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.${P}-rangeGap{margin-left:auto}
.${P}-input{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:12px;padding:3px 6px;color-scheme:light dark}
.${P}-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.${P}-dash{color:var(--dsw-alias-label-caption);font-size:12px}

/* One timeline row: its label above a bar proportional to the table's peak. */
.${P}-rowLabel{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1 1 auto}
.${P}-rowBar{height:3px;border-radius:2px;background:var(--dsw-alias-border-l1);overflow:hidden;
  max-width:160px}
.${P}-rowBarFill{display:block;height:100%;border-radius:2px;background:var(--dsw-alias-brand-primary);
  opacity:.75}
.${P}-muted{color:var(--dsw-alias-label-tertiary);font-size:11.5px}

.${P}-status{display:flex;align-items:center;gap:6px;font-size:12px;
  color:var(--dsw-alias-label-tertiary)}
.${P}-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);flex:none}
.${P}-dot[data-idle="true"]{background:var(--dsw-alias-state-success-primary)}
.${P}-foot{display:flex;align-items:center;gap:10px;font-size:11.5px;
  color:var(--dsw-alias-label-caption)}
.${P}-empty{padding:22px 10px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px}
@media (max-width:640px){
  .${P}-dialog{width:100%;padding:14px;gap:12px}
  .${P}-cards{grid-template-columns:repeat(auto-fit,minmax(104px,1fr))}
  .${P}-cardValue{font-size:16px}
  .${P}-table th:nth-child(4),.${P}-table td:nth-child(4),
  .${P}-table th:nth-child(5),.${P}-table td:nth-child(5){display:none}
  .${P}-rowBar{max-width:80px}
}
@media (prefers-reduced-motion:reduce){
  .${P}-btn{transition:none}
}
`;
var STYLE_ID = "dsh-usage-tokens/styles";
function StyleSheet() {
  return (0, import_react.createElement)("style", { "data-plugin": "dsh-usage-tokens", id: STYLE_ID }, css);
}
function cls(...names) {
  return names.map((name) => `${P}-${name}`).join(" ");
}

// src/config.ts
function zeroBuckets() {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 };
}
function zeroTotals() {
  return { calls: 0, ...zeroBuckets(), totalTokens: 0 };
}
function addInto(target, row) {
  target.inputTokens += row.inputTokens || 0;
  target.outputTokens += row.outputTokens || 0;
  target.cacheReadTokens += row.cacheReadTokens || 0;
  target.cacheWriteTokens += row.cacheWriteTokens || 0;
  target.reasoningTokens = (target.reasoningTokens ?? 0) + (row.reasoningTokens ?? 0);
}
function billedInputTokens(b) {
  return (b.inputTokens || 0) + (b.cacheReadTokens || 0) + (b.cacheWriteTokens || 0);
}
function totalTokens(b) {
  return billedInputTokens(b) + (b.outputTokens || 0);
}
function cacheHitRate(b) {
  const billed = billedInputTokens(b);
  if (billed <= 0) return null;
  return (b.cacheReadTokens || 0) / billed;
}
function dayKey(timeMs) {
  const d = new Date(timeMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function hourKey(timeMs) {
  const h = String(new Date(timeMs).getHours()).padStart(2, "0");
  return `${dayKey(timeMs)}T${h}`;
}
function parseTimeKey(key) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (day !== null) {
    const ms = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])).getTime();
    return dayKey(ms) === key ? { grain: "day", start: ms } : null;
  }
  const hour = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(key);
  if (hour !== null) {
    const ms = new Date(Number(hour[1]), Number(hour[2]) - 1, Number(hour[3]), Number(hour[4])).getTime();
    return hourKey(ms) === key ? { grain: "hour", start: ms } : null;
  }
  return null;
}
function trailingDays(endDate, days) {
  const [y, m, d] = endDate.split("-").map(Number);
  const end = new Date(y, (m ?? 1) - 1, d ?? 1);
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const cur = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
    out.push(dayKey(cur.getTime()));
  }
  return out;
}
function grainForRange(from, to) {
  const start = parseTimeKey(from);
  const end = parseTimeKey(to);
  if (start === null || end === null) return "day";
  return dayKey(start.start) === dayKey(end.start) ? "hour" : "day";
}

// src/client/api.ts
var USAGE_URL = "/api/dsh-usage-tokens/usage";
var LEGACY_URL = "/api/dsh-usage-tokens/summary";
function isAbort(error) {
  return error?.name === "AbortError";
}
function requestInit(signal) {
  return {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
    ...signal === void 0 ? {} : { signal }
  };
}
async function fetchUsage(range, signal) {
  const params = new URLSearchParams();
  if (range !== void 0) {
    params.set("from", range.from);
    params.set("to", range.to);
    params.set("grain", grainForRange(range.from, range.to));
  }
  const suffix = params.toString();
  try {
    const response = await fetch(`${USAGE_URL}${suffix.length === 0 ? "" : `?${suffix}`}`, requestInit(signal));
    if (response.status === 404 || response.status === 401) return await fetchLegacy(signal);
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const data = await response.json();
    if (data === null || typeof data !== "object" || data.ok !== true || typeof data.today !== "object") {
      return { ok: false, error: "malformed response" };
    }
    if (data.scope === void 0 || !Array.isArray(data.scope.buckets) || !Array.isArray(data.scope.rows)) {
      return { ok: false, error: "malformed response" };
    }
    return { ok: true, data };
  } catch (error) {
    if (isAbort(error)) return { ok: false, error: "aborted" };
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
async function fetchLegacy(signal) {
  try {
    const response = await fetch(`${LEGACY_URL}?days=7`, requestInit(signal));
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const data = fromLegacy(await response.json());
    if (data === null) return { ok: false, error: "malformed response" };
    return { ok: true, data };
  } catch (error) {
    if (isAbort(error)) return { ok: false, error: "aborted" };
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function progressOf(value) {
  const source = value ?? {};
  return {
    running: source["running"] === true,
    sessions: num(source["sessions"]),
    files: num(source["files"]),
    records: num(source["records"]),
    errors: num(source["errors"])
  };
}
function totalsOf(value) {
  const source = value ?? {};
  const totals = {
    calls: num(source["calls"]),
    inputTokens: num(source["inputTokens"]),
    outputTokens: num(source["outputTokens"]),
    cacheReadTokens: num(source["cacheReadTokens"]),
    cacheWriteTokens: num(source["cacheWriteTokens"]),
    reasoningTokens: num(source["reasoningTokens"]),
    totalTokens: 0
  };
  totals.totalTokens = totalTokens(totals);
  return totals;
}
function fromLegacy(raw) {
  if (raw === null || typeof raw !== "object") return null;
  const source = raw;
  if (typeof source.date !== "string" || typeof source.today !== "object" || source.today === null) return null;
  const series = Array.isArray(source.trend) ? source.trend : [];
  const totals = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0
  };
  const buckets = [];
  for (const entry of series) {
    const day = entry ?? {};
    if (typeof day["date"] !== "string") continue;
    const slice = totalsOf(day);
    const start = parseTimeKey(day["date"])?.start ?? 0;
    buckets.push({ key: day["date"], start, end: start + 864e5, ...slice });
    totals.calls += slice.calls;
    totals.inputTokens += slice.inputTokens;
    totals.outputTokens += slice.outputTokens;
    totals.cacheReadTokens += slice.cacheReadTokens;
    totals.cacheWriteTokens += slice.cacheWriteTokens;
    totals.reasoningTokens = (totals.reasoningTokens ?? 0) + (slice.reasoningTokens ?? 0);
  }
  totals.totalTokens = totalTokens(totals);
  buckets.reverse();
  const rows = (Array.isArray(source.rows) ? source.rows : []).map((entry) => {
    const row = entry ?? {};
    const slice = totalsOf(row);
    const provider = typeof row["provider"] === "string" ? row["provider"] : "unknown";
    const model = typeof row["model"] === "string" ? row["model"] : "unknown";
    return { key: typeof row["key"] === "string" ? row["key"] : `${provider}:${model}`, provider, model, ...slice };
  });
  const newest = buckets[0];
  const oldest = buckets[buckets.length - 1];
  return {
    today: { date: source.date, ...totalsOf(source.today) },
    scope: {
      from: oldest?.key ?? source.date,
      to: newest?.key ?? source.date,
      grain: "day",
      fromMs: oldest?.start ?? 0,
      toMs: newest?.end ?? 0,
      buckets,
      rows,
      totals,
      hitRate: cacheHitRate(totals)
    },
    recordCount: num(source.recordCount),
    backfilled: source.backfilled === true,
    generatedAt: num(source.generatedAt),
    scanning: progressOf(source.scanning),
    legacy: true
  };
}

// src/client/Modal.tsx
var import_react2 = require("react");
var import_react_dom = require("react-dom");

// src/client/format.ts
var UNITS = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "k"]
];
function compactNumber(n) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  for (const [scale, suffix] of UNITS) {
    if (n >= scale) {
      const value = n / scale;
      const text = value >= 100 ? value.toFixed(0) : value.toFixed(1);
      return `${text.replace(/\.0$/, "")}${suffix}`;
    }
  }
  return String(Math.round(n));
}
function exactNumber(n) {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
}
function percent(value) {
  if (value === null || !Number.isFinite(value)) return "\u2014";
  return `${(value * 100).toFixed(1)}%`;
}
function shortDay(key) {
  const parts = key.split("-");
  if (parts.length !== 3) return key;
  return `${Number(parts[1])}-${Number(parts[2])}`;
}
function shortHour(key) {
  const at = key.indexOf("T");
  if (at < 0) return key;
  const hour = Number(key.slice(at + 1));
  return Number.isFinite(hour) ? `${String(hour).padStart(2, "0")}:00` : key;
}
function dayParts(key) {
  const parts = key.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return [parts[0], parts[1], parts[2]];
}
function longDate(key) {
  const parts = dayParts(key);
  if (parts === null) return key;
  const [y, m, d] = parts;
  try {
    return new Date(y, m - 1, d).toLocaleDateString(void 0, {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    });
  } catch {
    return key;
  }
}
function mediumDate(key, withYear) {
  const parts = dayParts(key);
  if (parts === null) return key;
  const [y, m, d] = parts;
  try {
    return new Date(y, m - 1, d).toLocaleDateString(
      void 0,
      withYear ? { year: "numeric", month: "short", day: "numeric" } : { month: "short", day: "numeric" }
    );
  } catch {
    return key;
  }
}
function weekdayName(key) {
  const parts = dayParts(key);
  if (parts === null) return "";
  const [y, m, d] = parts;
  try {
    return new Date(y, m - 1, d).toLocaleDateString(void 0, { weekday: "short" });
  } catch {
    return "";
  }
}
function bucketLabel(key, withDate) {
  if (!key.includes("T")) {
    const weekday = weekdayName(key);
    return weekday.length === 0 ? shortDay(key) : `${shortDay(key)} ${weekday}`;
  }
  return withDate ? `${shortDay(key.slice(0, 10))} ${shortHour(key)}` : shortHour(key);
}
function rangeLabel(from, to) {
  const fromHour = from.includes("T");
  const toHour = to.includes("T");
  if (!fromHour && !toHour) {
    if (from === to) return longDate(from);
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return `${mediumDate(from, !sameYear)} \u2013 ${mediumDate(to, !sameYear)}`;
  }
  const fromText = bucketLabel(from, true);
  if (from === to) {
    const endHour = shortHour(`${from.slice(0, 10)}T${String(Number(from.slice(-2)) + 1).padStart(2, "0")}`);
    return `${mediumDate(from.slice(0, 10), true)} ${shortHour(from)}\u2013${endHour}`;
  }
  return `${fromText} \u2013 ${bucketLabel(to, true)}`;
}
function clockTime(ms) {
  if (!Number.isFinite(ms)) return "\u2014";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// src/aggregate.ts
function byProvider(rows) {
  const grouped = /* @__PURE__ */ new Map();
  for (const row of rows) {
    let acc = grouped.get(row.provider);
    if (acc === void 0) {
      acc = { key: row.provider, provider: row.provider, model: "", ...zeroTotals() };
      grouped.set(row.provider, acc);
    }
    addInto(acc, row);
    acc.calls += row.calls;
    acc.totalTokens = totalTokens(acc);
  }
  const out = [...grouped.values()];
  out.sort((a, b) => b.totalTokens - a.totalTokens || a.provider.localeCompare(b.provider));
  return out;
}

// src/client/Modal.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var FOCUSABLE = 'button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
function Card(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cls("card"), "data-emphasis": props.emphasis === true ? "true" : "false", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("cardLabel"), children: props.label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("cardValue"), children: props.value }),
    props.hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("cardHint"), children: props.hint })
  ] });
}
function peakOf(rows) {
  return rows.reduce((max, row) => Math.max(max, row.totalTokens), 0);
}
function TotalCells(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: exactNumber(props.totals.calls) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: compactNumber(props.totals.inputTokens) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: compactNumber(props.totals.cacheReadTokens + props.totals.cacheWriteTokens) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: compactNumber(props.totals.outputTokens) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: compactNumber(totalTokens(props.totals)) })
  ] });
}
function TimeTable(props) {
  const scope = props.payload.scope;
  const buckets = scope.buckets.filter((bucket) => bucket.calls > 0);
  const peak = peakOf(buckets);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: cls("section"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cls("sectionHead"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: cls("sectionTitle"), children: props.t("section.time") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: cls("muted"), children: [
        props.t(scope.grain === "hour" ? "grain.hour" : "grain.day"),
        ` \xB7 ${props.t("status.activeOnly")}`
      ] })
    ] }),
    buckets.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("empty"), children: props.t("empty.scope") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("tableWrap"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: cls("table"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: props.t("col.time") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: props.t("col.calls") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: props.t("col.input") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: props.t("col.cacheRead") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: props.t("col.output") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: props.t("col.total") })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { children: [
        buckets.map((bucket) => {
          const share = peak > 0 ? Math.max(2, Math.round(totalTokens(bucket) / peak * 100)) : 0;
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("rowLabel"), children: bucketLabel(bucket.key, false) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("rowBar"), "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cls("rowBarFill"), style: { width: `${share}%` } }) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TotalCells, { totals: bucket })
          ] }, bucket.key);
        }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { "data-total": "true", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: props.t("row.total") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TotalCells, { totals: scope.totals })
        ] })
      ] })
    ] }) })
  ] });
}
function Breakdown(props) {
  const [mode, setMode] = (0, import_react2.useState)("model");
  const rows = (0, import_react2.useMemo)(
    () => mode === "model" ? [...props.rows] : byProvider(props.rows),
    [mode, props.rows]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: cls("section"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cls("sectionHead"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: cls("sectionTitle"), children: props.t("section.breakdown") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("toggle"), role: "group", "aria-label": props.t("section.breakdown"), children: ["model", "provider"].map((value) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: cls("toggleBtn"),
          "data-active": mode === value ? "true" : "false",
          "aria-pressed": mode === value,
          onClick: () => {
            setMode(value);
          },
          children: props.t(value === "model" ? "toggle.model" : "toggle.provider")
        },
        value
      )) })
    ] }),
    rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("empty"), children: props.t("empty.scope") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("tableWrap"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: cls("table"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: props.t(mode === "model" ? "col.model" : "col.provider") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: props.t("col.calls") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: props.t("col.input") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: props.t("col.cacheRead") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: props.t("col.output") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: props.t("col.total") })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { children: [
        rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: mode === "model" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("model"), children: row.model }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("provider"), children: row.provider })
          ] }) : row.provider }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TotalCells, { totals: row })
        ] }, row.key)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { "data-total": "true", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: props.t("row.total") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TotalCells, { totals: props.totals })
        ] })
      ] })
    ] }) })
  ] });
}
function presetsFor(t, today) {
  const week = trailingDays(today, 7);
  const month = trailingDays(today, 30);
  const yesterday = trailingDays(today, 2)[0] ?? today;
  return [
    { id: "today", label: t("range.today"), from: today, to: today },
    { id: "yesterday", label: t("range.yesterday"), from: yesterday, to: yesterday },
    { id: "week", label: t("range.days", { count: 7 }), from: week[0] ?? today, to: today },
    { id: "month", label: t("range.days", { count: 30 }), from: month[0] ?? today, to: today }
  ];
}
function RangePicker(props) {
  const { range, t } = props;
  const presets = presetsFor(t, props.today);
  const active = presets.find((preset) => preset.from === range.from && preset.to === range.to)?.id ?? "custom";
  const fromRef = (0, import_react2.useRef)(null);
  const setRange = (left, right) => {
    props.onChange(left <= right ? { from: left, to: right } : { from: right, to: left });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", { className: cls("section"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cls("range"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cls("toggle"), role: "group", "aria-label": t("range.label"), children: [
      presets.map((preset) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: cls("toggleBtn"),
          "data-active": active === preset.id ? "true" : "false",
          "aria-pressed": active === preset.id,
          disabled: props.disabled === true,
          onClick: () => {
            setRange(preset.from, preset.to);
          },
          children: preset.label
        },
        preset.id
      )),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: cls("toggleBtn"),
          "data-active": active === "custom" ? "true" : "false",
          "aria-pressed": active === "custom",
          disabled: props.disabled === true,
          onClick: () => {
            fromRef.current?.focus();
          },
          children: t("range.custom")
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("rangeGap") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        ref: fromRef,
        type: "date",
        className: cls("input"),
        value: range.from.slice(0, 10),
        max: props.today,
        disabled: props.disabled === true,
        "aria-label": t("range.from"),
        title: t("range.from"),
        onChange: (event) => {
          if (event.target.value.length > 0) setRange(event.target.value, range.to.slice(0, 10));
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cls("dash"), "aria-hidden": "true", children: "\u2013" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        type: "date",
        className: cls("input"),
        value: range.to.slice(0, 10),
        max: props.today,
        disabled: props.disabled === true,
        "aria-label": t("range.to"),
        title: t("range.to"),
        onChange: (event) => {
          if (event.target.value.length > 0) setRange(range.from.slice(0, 10), event.target.value);
        }
      }
    )
  ] }) });
}
function UsageModal(props) {
  const { open, onClose } = props;
  const cardRef = (0, import_react2.useRef)(null);
  const closeRef = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
    if (!open) return void 0;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const card = cardRef.current;
      if (card === null) return;
      const focusable = [...card.querySelectorAll(FOCUSABLE)].filter((node) => node.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !card.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onClose]);
  (0, import_react2.useEffect)(() => {
    if (!open) return void 0;
    const previous = document.activeElement;
    const target = cardRef.current?.querySelector("[data-modal-autofocus]") ?? closeRef.current;
    target?.focus();
    return () => {
      previous?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  const payload = props.data;
  const scope = payload?.scope;
  const todayKey = payload?.today.date ?? props.range.to.slice(0, 10);
  const body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cls("root"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("mask"), "aria-hidden": "true", onClick: onClose }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        ref: cardRef,
        className: cls("dialog"),
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "dsut-title",
        tabIndex: -1,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cls("head"), children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: cls("title"), id: "dsut-title", children: props.t("dialog.title") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: cls("subtitle"), children: rangeLabel(scope?.from ?? props.range.from, scope?.to ?? props.range.to) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                ref: closeRef,
                type: "button",
                className: cls("close"),
                onClick: onClose,
                "aria-label": props.t("dialog.close"),
                title: props.t("dialog.close"),
                children: "\u2715"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cls("body"), children: [
            props.error !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cls("status"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cls("dot") }),
              props.t("status.error", { message: props.error })
            ] }) : null,
            payload?.scanning.running === true ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cls("status"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cls("dot") }),
              props.t("status.scanning", {
                files: exactNumber(payload.scanning.files),
                records: exactNumber(payload.scanning.records)
              })
            ] }) : null,
            payload?.legacy === true ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cls("status"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cls("dot") }),
              props.t("status.legacy")
            ] }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              RangePicker,
              {
                range: props.range,
                today: todayKey,
                t: props.t,
                disabled: payload?.legacy === true,
                onChange: props.onRangeChange
              }
            ),
            scope === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("empty"), children: props.t("dialog.loading") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cls("cards"), children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  Card,
                  {
                    label: props.t("card.total"),
                    value: compactNumber(totalTokens(scope.totals)),
                    hint: exactNumber(totalTokens(scope.totals)),
                    emphasis: true
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  Card,
                  {
                    label: props.t("card.input"),
                    value: compactNumber(scope.totals.inputTokens),
                    hint: exactNumber(scope.totals.inputTokens)
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  Card,
                  {
                    label: props.t("card.cacheRead"),
                    value: compactNumber(scope.totals.cacheReadTokens),
                    hint: props.t("card.cacheWriteHint", { value: compactNumber(scope.totals.cacheWriteTokens) })
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  Card,
                  {
                    label: props.t("card.output"),
                    value: compactNumber(scope.totals.outputTokens),
                    hint: exactNumber(scope.totals.outputTokens)
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  Card,
                  {
                    label: props.t("card.reasoning"),
                    value: compactNumber(scope.totals.reasoningTokens ?? 0),
                    hint: props.t("card.reasoningHint")
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, { label: props.t("card.calls"), value: exactNumber(scope.totals.calls), hint: props.t("card.callsHint") })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cls("status"), children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cls("dot"), "data-idle": "true" }),
                props.t("status.cacheHit", { value: percent(scope.hitRate) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Breakdown, { rows: scope.rows, totals: scope.totals, t: props.t }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimeTable, { payload, t: props.t })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cls("foot"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: payload === void 0 ? props.t("foot.source") : props.t("foot.updated", { time: clockTime(payload.generatedAt) }) }) })
        ]
      }
    )
  ] });
  return (0, import_react_dom.createPortal)(body, document.body);
}

// src/client/index.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var inject = ["slots", "locale"];
var NS = "dshUsageTokens";
var SCAN_POLL_MS = 3e3;
var IDLE_POLL_MS = 6e4;
var zh = {
  "button.label": "\u4ECA\u65E5 Token \u7528\u91CF",
  "button.title": "\u4ECA\u65E5 {value} tokens",
  "dialog.title": "Token \u7528\u91CF",
  "dialog.close": "\u5173\u95ED",
  "dialog.loading": "\u6B63\u5728\u52A0\u8F7D\u2026",
  "range.label": "\u65F6\u95F4\u8303\u56F4",
  "range.today": "\u4ECA\u5929",
  "range.yesterday": "\u6628\u5929",
  "range.days": "\u8FD1 {count} \u5929",
  "range.custom": "\u81EA\u5B9A\u4E49",
  "range.from": "\u5F00\u59CB\u65E5\u671F",
  "range.to": "\u7ED3\u675F\u65E5\u671F",
  "grain.day": "\u6309\u5929",
  "grain.hour": "\u6309\u5C0F\u65F6",
  "card.total": "\u603B\u8BA1",
  "card.input": "\u8F93\u5165\uFF08\u672A\u547D\u4E2D\u7F13\u5B58\uFF09",
  "card.cacheRead": "\u7F13\u5B58\u547D\u4E2D\u8BFB\u53D6",
  "card.cacheWriteHint": "\u7F13\u5B58\u5199\u5165 {value}",
  "card.output": "\u8F93\u51FA",
  "card.reasoning": "\u5176\u4E2D\u601D\u8003",
  "card.reasoningHint": "\u5305\u542B\u5728\u8F93\u51FA\u5185\uFF0C\u4E0D\u91CD\u590D\u8BA1\u6570",
  "card.calls": "\u6A21\u578B\u8C03\u7528",
  "card.callsHint": "\u6B21\u8BF7\u6C42",
  "section.time": "\u65F6\u95F4\u5206\u5E03",
  "section.breakdown": "\u6309\u6A21\u578B / \u4F9B\u5E94\u5546\u62C6\u5206",
  "status.activeOnly": "\u4EC5\u663E\u793A\u6709\u7528\u91CF\u7684\u65F6\u6BB5",
  "toggle.model": "\u6309\u6A21\u578B",
  "toggle.provider": "\u6309\u4F9B\u5E94\u5546",
  "col.time": "\u65F6\u95F4",
  "col.model": "\u6A21\u578B",
  "col.provider": "\u4F9B\u5E94\u5546",
  "col.calls": "\u8C03\u7528",
  "col.input": "\u8F93\u5165",
  "col.cacheRead": "\u7F13\u5B58",
  "col.output": "\u8F93\u51FA",
  "col.total": "\u603B\u8BA1",
  "row.total": "\u5408\u8BA1",
  "status.cacheHit": "\u7F13\u5B58\u547D\u4E2D\u7387 {value}",
  "status.scanning": "\u6B63\u5728\u56DE\u586B\u5386\u53F2\u4F1A\u8BDD\uFF08\u5DF2\u8BFB {files} \u4E2A\u65E5\u5FD7\uFF0C{records} \u6761\u8BB0\u5F55\uFF09\u2026",
  "status.legacy": "\u5BBF\u4E3B\u63D2\u4EF6\u5C1A\u672A\u91CD\u8F7D\uFF0C\u6682\u65F6\u53EA\u80FD\u770B\u4ECA\u5929\uFF1A\u91CD\u542F DSH \u540E\u624D\u80FD\u6309\u65F6\u95F4\u8303\u56F4\u67E5\u8BE2\u3002",
  "status.error": "\u8BFB\u53D6\u7528\u91CF\u5931\u8D25\uFF1A{message}",
  "foot.updated": "\u66F4\u65B0\u4E8E {time} \xB7 \u6570\u636E\u6765\u81EA\u672C\u673A\u9010\u6B21\u8C03\u7528\u8BB0\u5F55",
  "foot.source": "\u6570\u636E\u6765\u81EA\u672C\u673A\u9010\u6B21\u8C03\u7528\u8BB0\u5F55",
  "empty.scope": "\u8BE5\u65F6\u95F4\u6BB5\u5185\u6CA1\u6709\u6A21\u578B\u8C03\u7528\u8BB0\u5F55\u3002"
};
var en = {
  "button.label": "Today's token usage",
  "button.title": "Today: {value} tokens",
  "dialog.title": "Token usage",
  "dialog.close": "Close",
  "dialog.loading": "Loading\u2026",
  "range.label": "Time range",
  "range.today": "Today",
  "range.yesterday": "Yesterday",
  "range.days": "Last {count} days",
  "range.custom": "Custom",
  "range.from": "Start date",
  "range.to": "End date",
  "grain.day": "By day",
  "grain.hour": "By hour",
  "card.total": "Total",
  "card.input": "Input (cache miss)",
  "card.cacheRead": "Cache read",
  "card.cacheWriteHint": "cache write {value}",
  "card.output": "Output",
  "card.reasoning": "of which reasoning",
  "card.reasoningHint": "already included in output, not added again",
  "card.calls": "Model calls",
  "card.callsHint": "requests",
  "section.time": "Time breakdown",
  "section.breakdown": "By model / provider",
  "status.activeOnly": "only periods with usage are listed",
  "toggle.model": "By model",
  "toggle.provider": "By provider",
  "col.time": "Time",
  "col.model": "Model",
  "col.provider": "Provider",
  "col.calls": "Calls",
  "col.input": "Input",
  "col.cacheRead": "Cache",
  "col.output": "Output",
  "col.total": "Total",
  "row.total": "Total",
  "status.cacheHit": "Cache hit rate {value}",
  "status.scanning": "Backfilling session history ({files} logs read, {records} records)\u2026",
  "status.legacy": "The host half has not reloaded yet, so only today is available: restart DSH for ranged queries.",
  "status.error": "Could not read usage: {message}",
  "foot.updated": "Updated {time} \xB7 from local per-call records",
  "foot.source": "From local per-call records",
  "empty.scope": "No model calls recorded in this range."
};
function Icon() {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { viewBox: "0 0 16 16", width: "16", height: "16", "aria-hidden": "true", focusable: "false", fill: "currentColor", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: "2", y: "9", width: "2.6", height: "5", rx: "0.6" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: "6.7", y: "5.5", width: "2.6", height: "8.5", rx: "0.6" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: "11.4", y: "2.5", width: "2.6", height: "11.5", rx: "0.6" })
  ] });
}
function todayRange() {
  const today = dayKey(Date.now());
  return { from: today, to: today };
}
function useUsage(range, active) {
  const [data, setData] = (0, import_react3.useState)(void 0);
  const [error, setError] = (0, import_react3.useState)(void 0);
  const [loading, setLoading] = (0, import_react3.useState)(true);
  const [nonce, setNonce] = (0, import_react3.useState)(0);
  const reload = (0, import_react3.useCallback)(() => {
    setNonce((n) => n + 1);
  }, []);
  (0, import_react3.useEffect)(() => {
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      const result = await fetchUsage(range, controller.signal);
      if (cancelled) return;
      if (result.ok) {
        setData(result.data);
        setError(void 0);
      } else if (result.error !== "aborted") {
        setError(result.error);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [range?.from, range?.to, nonce]);
  const scanning = data?.scanning.running === true;
  (0, import_react3.useEffect)(() => {
    const period = scanning ? SCAN_POLL_MS : active ? SCAN_POLL_MS * 2 : IDLE_POLL_MS;
    const timer = setInterval(reload, period);
    return () => {
      clearInterval(timer);
    };
  }, [active, scanning, reload]);
  return { data, error, loading };
}
function UsageButton(props) {
  const [open, setOpen] = (0, import_react3.useState)(false);
  const [range, setRange] = (0, import_react3.useState)(todayRange);
  const { data, error, loading } = useUsage(open ? range : void 0, open);
  const total = data === void 0 ? 0 : totalTokens(data.today);
  const value = compactNumber(total);
  const label = props.t("button.label");
  const title = props.t("button.title", { value });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(StyleSheet, {}),
    props.wide ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsut-rows-hook" }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "button",
      {
        type: "button",
        className: cls("btn"),
        "data-rail": props.wide ? "false" : "true",
        "aria-label": label,
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        title,
        onClick: () => {
          setOpen((current) => !current);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cls("btnIcon"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, {}) }),
          props.wide ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cls("btnLabel"), children: label }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cls("btnValue"), "data-rail": props.wide ? "false" : "true", children: loading && data === void 0 ? "\u2026" : value })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      UsageModal,
      {
        open,
        onClose: () => {
          setOpen(false);
        },
        t: props.t,
        data,
        error,
        range,
        onRangeChange: setRange
      }
    )
  ] });
}
function apply(ctx) {
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    "dsh-usage-tokens: dictionaries"
  );
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: "dsh-usage-tokens",
    // Low in the shared list row and ahead of later occupants (Seeker sits at
    // 20): equal orders leave sibling order to registration timing.
    order: 10,
    locale: NS
  }, UsageButton));
}
var dictionaries = { zh, en };
    return module.exports;
  },
});
