/**
 * Client half of `dsh-usage-tokens`.
 *
 * Registers one button into `sidebar.footer.action` — the only left-sidebar seat
 * whose occupant owns the whole button and receives nothing but the `wide`
 * flag — and opens the detail modal from it. All data arrives over the plugin's
 * own loopback route; this half never touches the ledger.
 *
 * The button and the modal share one request. While the modal is closed that
 * request names no range, so the host answers with today's totals alone and the
 * poll stays tiny; opening the modal adds the selected dates and re-fetches.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { ClientContext, SlotRegistration } from './context.ts';
import { StyleSheet, cls } from './styles.ts';
import { fetchUsage, type UsagePayload, type UsageRange } from './api.ts';
import { UsageModal, type Translate } from './Modal.tsx';
import { compactNumber } from './format.ts';
import { dayKey, totalTokens } from '../config.ts';

/** Cordis services this browser half waits for. */
export const inject = ['slots', 'locale'];

/** Locale namespace owned by this plugin. */
const NS = 'dshUsageTokens';

/** Poll cadence while the historical scan is running, ms. */
const SCAN_POLL_MS = 3_000;

/** Poll cadence once everything is settled, ms. */
const IDLE_POLL_MS = 60_000;

const zh = {
  'button.label': '今日 Token 用量',
  'button.title': '今日 {value} tokens',
  'dialog.title': 'Token 用量',
  'dialog.close': '关闭',
  'dialog.loading': '正在加载…',
  'range.label': '时间范围',
  'range.today': '今天',
  'range.yesterday': '昨天',
  'range.days': '近 {count} 天',
  'range.custom': '自定义',
  'range.from': '开始日期',
  'range.to': '结束日期',
  'grain.day': '按天',
  'grain.hour': '按小时',
  'card.total': '总计',
  'card.input': '输入（未命中缓存）',
  'card.cacheRead': '缓存命中读取',
  'card.cacheWriteHint': '缓存写入 {value}',
  'card.output': '输出',
  'card.reasoning': '其中思考',
  'card.reasoningHint': '包含在输出内，不重复计数',
  'card.calls': '模型调用',
  'card.callsHint': '次请求',
  'section.time': '时间分布',
  'section.breakdown': '按模型 / 供应商拆分',
  'status.activeOnly': '仅显示有用量的时段',
  'toggle.model': '按模型',
  'toggle.provider': '按供应商',
  'col.time': '时间',
  'col.model': '模型',
  'col.provider': '供应商',
  'col.calls': '调用',
  'col.input': '输入',
  'col.cacheRead': '缓存',
  'col.output': '输出',
  'col.total': '总计',
  'row.total': '合计',
  'status.cacheHit': '缓存命中率 {value}',
  'status.scanning': '正在回填历史会话（已读 {files} 个日志，{records} 条记录）…',
  'status.legacy': '宿主插件尚未重载，暂时只能看今天：重启 DSH 后才能按时间范围查询。',
  'status.error': '读取用量失败：{message}',
  'foot.updated': '更新于 {time} · 数据来自本机逐次调用记录',
  'foot.source': '数据来自本机逐次调用记录',
  'empty.scope': '该时间段内没有模型调用记录。',
};

const en: typeof zh = {
  'button.label': "Today's token usage",
  'button.title': 'Today: {value} tokens',
  'dialog.title': 'Token usage',
  'dialog.close': 'Close',
  'dialog.loading': 'Loading…',
  'range.label': 'Time range',
  'range.today': 'Today',
  'range.yesterday': 'Yesterday',
  'range.days': 'Last {count} days',
  'range.custom': 'Custom',
  'range.from': 'Start date',
  'range.to': 'End date',
  'grain.day': 'By day',
  'grain.hour': 'By hour',
  'card.total': 'Total',
  'card.input': 'Input (cache miss)',
  'card.cacheRead': 'Cache read',
  'card.cacheWriteHint': 'cache write {value}',
  'card.output': 'Output',
  'card.reasoning': 'of which reasoning',
  'card.reasoningHint': 'already included in output, not added again',
  'card.calls': 'Model calls',
  'card.callsHint': 'requests',
  'section.time': 'Time breakdown',
  'section.breakdown': 'By model / provider',
  'status.activeOnly': 'only periods with usage are listed',
  'toggle.model': 'By model',
  'toggle.provider': 'By provider',
  'col.time': 'Time',
  'col.model': 'Model',
  'col.provider': 'Provider',
  'col.calls': 'Calls',
  'col.input': 'Input',
  'col.cacheRead': 'Cache',
  'col.output': 'Output',
  'col.total': 'Total',
  'row.total': 'Total',
  'status.cacheHit': 'Cache hit rate {value}',
  'status.scanning': 'Backfilling session history ({files} logs read, {records} records)…',
  'status.legacy': 'The host half has not reloaded yet, so only today is available: restart DSH for ranged queries.',
  'status.error': 'Could not read usage: {message}',
  'foot.updated': 'Updated {time} · from local per-call records',
  'foot.source': 'From local per-call records',
  'empty.scope': 'No model calls recorded in this range.',
};

/** Small bar-chart glyph; the host exposes no icon set to a plugin. */
function Icon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor">
      <rect x="2" y="9" width="2.6" height="5" rx="0.6" />
      <rect x="6.7" y="5.5" width="2.6" height="8.5" rx="0.6" />
      <rect x="11.4" y="2.5" width="2.6" height="11.5" rx="0.6" />
    </svg>
  );
}

/** Props the sidebar hands the footer action, plus the injected translator. */
interface ButtonProps {
  wide: boolean;
  t: Translate;
}

/** Today's range: the scope the button itself reports on. */
function todayRange(): UsageRange {
  const today = dayKey(Date.now());
  return { from: today, to: today };
}

/**
 * Load the selected scope and keep it fresh.
 *
 * While the modal is closed the request carries no scope, so the host answers
 * with today's totals only and the poll costs a few hundred bytes. Opening the
 * modal switches the same hook to the picked range; the last good payload stays
 * on screen if a refresh fails.
 *
 * @param range - Range to read, or undefined for "today" (closed modal).
 * @param active - Whether the modal is open.
 * @returns Current data, error and loading flag.
 */
function useUsage(range: UsageRange | undefined, active: boolean): {
  data: UsagePayload | undefined;
  error: string | undefined;
  loading: boolean;
} {
  const [data, setData] = useState<UsagePayload | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => { setNonce(n => n + 1); }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      const result = await fetchUsage(range, controller.signal);
      if (cancelled) return;
      if (result.ok) {
        setData(result.data);
        setError(undefined);
      } else if (result.error !== 'aborted') {
        // The last good payload stays on screen; only the message changes.
        setError(result.error);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; controller.abort(); };
    // The two dates are the whole request: the host derives the slice size.
  }, [range?.from, range?.to, nonce]);

  const scanning = data?.scanning.running === true;
  useEffect(() => {
    const period = scanning ? SCAN_POLL_MS : active ? SCAN_POLL_MS * 2 : IDLE_POLL_MS;
    const timer = setInterval(reload, period);
    return () => { clearInterval(timer); };
  }, [active, scanning, reload]);

  return { data, error, loading };
}

/** The sidebar button and the modal it opens. */
function UsageButton(props: ButtonProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<UsageRange>(todayRange);
  // Closed: no range in the request, so the poll stays as small as possible.
  const { data, error, loading } = useUsage(open ? range : undefined, open);

  const total = data === undefined ? 0 : totalTokens(data.today);
  const value = compactNumber(total);
  const label = props.t('button.label');
  // The tooltip carries the number, so the figure is readable without opening
  // the modal and without the button reflowing.
  const title = props.t('button.title', { value });

  return (
    <>
      <StyleSheet />
      {/* The shared footer row is a plain flex line; in the expanded sidebar we
          need one line per occupant, so this hook (flex-wrap on the row) rides
          along with us. Mounted before the button, disposed with the tree. */}
      {props.wide ? <span className="dsut-rows-hook" /> : null}
      <button
        type="button"
        className={cls('btn')}
        data-rail={props.wide ? 'false' : 'true'}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
        onClick={() => { setOpen(current => !current); }}
      >
        <span className={cls('btnIcon')}><Icon /></span>
        {props.wide ? <span className={cls('btnLabel')}>{label}</span> : null}
        <span className={cls('btnValue')} data-rail={props.wide ? 'false' : 'true'}>
          {loading && data === undefined ? '…' : value}
        </span>
      </button>
      <UsageModal
        open={open}
        onClose={() => { setOpen(false); }}
        t={props.t}
        data={data}
        error={error}
        range={range}
        onRangeChange={setRange}
      />
    </>
  );
}

/**
 * Mount the browser half: dictionaries, then the sidebar contribution.
 * @param ctx - Browser context carrying the slot registry and locale service.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    'dsh-usage-tokens: dictionaries',
  );

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'dsh-usage-tokens',
    // Low in the shared list row and ahead of later occupants (Seeker sits at
    // 20): equal orders leave sibling order to registration timing.
    order: 10,
    locale: NS,
  } as unknown as SlotRegistration, UsageButton as unknown as (props: unknown) => ReactElement));
}

/**
 * Exported for the render tests in `test/modal.test.mjs`, which mount the modal
 * in jsdom against a stubbed route. The Web shell only ever calls `apply`.
 */
export { UsageModal };
export const dictionaries = { zh, en };
