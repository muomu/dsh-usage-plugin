/**
 * The usage modal: one time range, one slice size.
 *
 * The shape follows the DeepSeek platform usage page — pick a range, read the
 * totals, read the timeline — but the slice is derived rather than chosen: a
 * single day (今天 / 昨天, or a custom range that lands on one date) is broken
 * into hours, anything wider into days. That is `grainForRange`, and the host
 * echoes the result back in `scope.grain`, which is what the table label shows.
 *
 * Hand-rolled rather than imported from `dsh-client-ui-primitives`, because the
 * plugin-authoring rules forbid a plugin from loading Harness Client packages
 * as modules: a plugin must match the host's own markup instead. This mirrors
 * the host's dialog contract — `createPortal` to `document.body`, a
 * `role="dialog"` + `aria-modal="true"` card behind a mask, `data-modal-autofocus`
 * on the initial focus target, Escape and mask-click to close, and a focus trap
 * that keeps Tab inside the card.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { cls } from './styles.ts';
import { bucketLabel, clockTime, compactNumber, exactNumber, percent, rangeLabel } from './format.ts';
import { byProvider } from '../aggregate.ts';
import {
  type BreakdownRow,
  type UsagePayload,
  type UsageRange,
  type UsageTotals,
} from './api.ts';
import { totalTokens, trailingDays } from '../config.ts';

/** Locale lookup supplied by the slot registration. */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

export interface UsageModalProps {
  open: boolean;
  onClose: () => void;
  t: Translate;
  data: UsagePayload | undefined;
  error: string | undefined;
  /** The range the picker shows and the host is asked for. */
  range: UsageRange;
  onRangeChange: (range: UsageRange) => void;
}

/** Selector for focusable descendants, used by the focus trap. */
const FOCUSABLE = 'button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

/** One stat card. */
function Card(props: { label: string; value: string; hint?: string; emphasis?: boolean }): ReactElement {
  return (
    <div className={cls('card')} data-emphasis={props.emphasis === true ? 'true' : 'false'}>
      <div className={cls('cardLabel')}>{props.label}</div>
      <div className={cls('cardValue')}>{props.value}</div>
      {props.hint === undefined ? null : <div className={cls('cardHint')}>{props.hint}</div>}
    </div>
  );
}

/** Widest total in a set of rows, for scaling the inline share bars. */
function peakOf(rows: readonly { totalTokens: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, row.totalTokens), 0);
}

/** The four billed figures plus the total, as one table row's cells. */
function TotalCells(props: { totals: UsageTotals }): ReactElement {
  return (
    <>
      <td>{exactNumber(props.totals.calls)}</td>
      <td>{compactNumber(props.totals.inputTokens)}</td>
      <td>{compactNumber(props.totals.cacheReadTokens + props.totals.cacheWriteTokens)}</td>
      <td>{compactNumber(props.totals.outputTokens)}</td>
      <td>{compactNumber(totalTokens(props.totals))}</td>
    </>
  );
}

/**
 * The timeline: the range's buckets, newest first, each with a share bar.
 *
 * Dense on purpose — only periods with usage are listed, because a quiet hour or
 * day carries nothing the totals row does not already say — and newest first,
 * because the question it answers is almost always "what has been happening
 * lately". Hours appear only for a single-day range.
 *
 * The filter is repeated here rather than trusted from the host: a host half that
 * has not been restarted yet still sends the quiet buckets.
 */
function TimeTable(props: { payload: UsagePayload; t: Translate }): ReactElement {
  const scope = props.payload.scope;
  const buckets = scope.buckets.filter(bucket => bucket.calls > 0);
  const peak = peakOf(buckets);

  return (
    <section className={cls('section')}>
      <div className={cls('sectionHead')}>
        <h3 className={cls('sectionTitle')}>{props.t('section.time')}</h3>
        <span className={cls('muted')}>
          {props.t(scope.grain === 'hour' ? 'grain.hour' : 'grain.day')}
          {` · ${props.t('status.activeOnly')}`}
        </span>
      </div>
      {buckets.length === 0 ? (
        <div className={cls('empty')}>{props.t('empty.scope')}</div>
      ) : (
        <div className={cls('tableWrap')}>
          <table className={cls('table')}>
            <thead>
              <tr>
                <th scope="col">{props.t('col.time')}</th>
                <th scope="col">{props.t('col.calls')}</th>
                <th scope="col">{props.t('col.input')}</th>
                <th scope="col">{props.t('col.cacheRead')}</th>
                <th scope="col">{props.t('col.output')}</th>
                <th scope="col">{props.t('col.total')}</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket) => {
                const share = peak > 0 ? Math.max(2, Math.round((totalTokens(bucket) / peak) * 100)) : 0;
                return (
                  <tr key={bucket.key}>
                    <td>
                      {/* An hour bucket sits inside one day, which the heading
                          already names, so it only needs its clock time. */}
                      <div className={cls('rowLabel')}>{bucketLabel(bucket.key, false)}</div>
                      <div className={cls('rowBar')} aria-hidden="true">
                        <span className={cls('rowBarFill')} style={{ width: `${share}%` }} />
                      </div>
                    </td>
                    <TotalCells totals={bucket} />
                  </tr>
                );
              })}
              <tr data-total="true">
                <td>{props.t('row.total')}</td>
                <TotalCells totals={scope.totals} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** The model/provider breakdown of the whole range. */
function Breakdown(props: { rows: readonly BreakdownRow[]; totals: UsageTotals; t: Translate }): ReactElement {
  const [mode, setMode] = useState<'model' | 'provider'>('model');
  const rows = useMemo(
    () => (mode === 'model' ? [...props.rows] : byProvider(props.rows)),
    [mode, props.rows],
  );

  return (
    <section className={cls('section')}>
      <div className={cls('sectionHead')}>
        <h3 className={cls('sectionTitle')}>{props.t('section.breakdown')}</h3>
        <div className={cls('toggle')} role="group" aria-label={props.t('section.breakdown')}>
          {(['model', 'provider'] as const).map(value => (
            <button
              key={value}
              type="button"
              className={cls('toggleBtn')}
              data-active={mode === value ? 'true' : 'false'}
              aria-pressed={mode === value}
              onClick={() => { setMode(value); }}
            >
              {props.t(value === 'model' ? 'toggle.model' : 'toggle.provider')}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className={cls('empty')}>{props.t('empty.scope')}</div>
      ) : (
        <div className={cls('tableWrap')}>
          <table className={cls('table')}>
            <thead>
              <tr>
                <th scope="col">{props.t(mode === 'model' ? 'col.model' : 'col.provider')}</th>
                <th scope="col">{props.t('col.calls')}</th>
                <th scope="col">{props.t('col.input')}</th>
                <th scope="col">{props.t('col.cacheRead')}</th>
                <th scope="col">{props.t('col.output')}</th>
                <th scope="col">{props.t('col.total')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.key}>
                  <td>
                    {mode === 'model' ? (
                      <>
                        <div className={cls('model')}>{row.model}</div>
                        <div className={cls('provider')}>{row.provider}</div>
                      </>
                    ) : row.provider}
                  </td>
                  <TotalCells totals={row} />
                </tr>
              ))}
              <tr data-total="true">
                <td>{props.t('row.total')}</td>
                <TotalCells totals={props.totals} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** One quick range: the button's label plus the two dates it selects. */
interface Preset {
  id: string;
  label: string;
  from: string;
  to: string;
}

/** The preset buttons, computed from the host's idea of today. */
function presetsFor(t: Translate, today: string): Preset[] {
  const week = trailingDays(today, 7);
  const month = trailingDays(today, 30);
  const yesterday = trailingDays(today, 2)[0] ?? today;
  return [
    { id: 'today', label: t('range.today'), from: today, to: today },
    { id: 'yesterday', label: t('range.yesterday'), from: yesterday, to: yesterday },
    { id: 'week', label: t('range.days', { count: 7 }), from: week[0] ?? today, to: today },
    { id: 'month', label: t('range.days', { count: 30 }), from: month[0] ?? today, to: today },
  ];
}

/**
 * Range controls: four presets and two date fields.
 *
 * There is no granularity switch — `grainForRange` derives that from the dates —
 * so the only thing this can get wrong is an inverted pair, which it swaps.
 */
function RangePicker(props: {
  range: UsageRange;
  today: string;
  t: Translate;
  /** True while the host half predates ranges and can only answer today. */
  disabled?: boolean;
  onChange: (range: UsageRange) => void;
}): ReactElement {
  const { range, t } = props;
  const presets = presetsFor(t, props.today);
  const active = presets.find(preset => preset.from === range.from && preset.to === range.to)?.id ?? 'custom';
  const fromRef = useRef<HTMLInputElement | null>(null);

  const setRange = (left: string, right: string): void => {
    props.onChange(left <= right ? { from: left, to: right } : { from: right, to: left });
  };

  return (
    <section className={cls('section')}>
      <div className={cls('range')}>
        <div className={cls('toggle')} role="group" aria-label={t('range.label')}>
          {presets.map(preset => (
            <button
              key={preset.id}
              type="button"
              className={cls('toggleBtn')}
              data-active={active === preset.id ? 'true' : 'false'}
              aria-pressed={active === preset.id}
              disabled={props.disabled === true}
              onClick={() => { setRange(preset.from, preset.to); }}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            className={cls('toggleBtn')}
            data-active={active === 'custom' ? 'true' : 'false'}
            aria-pressed={active === 'custom'}
            disabled={props.disabled === true}
            // The two date fields are the actual control; this button only
            // reports that they, and not a preset, drive the tables, and puts
            // the caret in the first of them.
            onClick={() => { fromRef.current?.focus(); }}
          >
            {t('range.custom')}
          </button>
        </div>
        <div className={cls('rangeGap')} />
        <input
          ref={fromRef}
          type="date"
          className={cls('input')}
          value={range.from.slice(0, 10)}
          max={props.today}
          disabled={props.disabled === true}
          aria-label={t('range.from')}
          title={t('range.from')}
          onChange={(event) => { if (event.target.value.length > 0) setRange(event.target.value, range.to.slice(0, 10)); }}
        />
        <span className={cls('dash')} aria-hidden="true">–</span>
        <input
          type="date"
          className={cls('input')}
          value={range.to.slice(0, 10)}
          max={props.today}
          disabled={props.disabled === true}
          aria-label={t('range.to')}
          title={t('range.to')}
          onChange={(event) => { if (event.target.value.length > 0) setRange(range.from.slice(0, 10), event.target.value); }}
        />
      </div>
    </section>
  );
}

/**
 * The modal itself. Renders nothing when closed, so no listeners are attached
 * while the button is idle.
 * @param props - Open state, data and locale lookup.
 * @returns The dialog portal, or null.
 */
export function UsageModal(props: UsageModalProps): ReactElement | null {
  const { open, onClose } = props;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes; Tab stays inside the card.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const card = cardRef.current;
      if (card === null) return;
      const focusable = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter(node => node.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !card.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => { document.removeEventListener('keydown', onKeyDown, true); };
  }, [open, onClose]);

  // Move focus into the dialog on open, and restore it on close.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    const target = cardRef.current?.querySelector<HTMLElement>('[data-modal-autofocus]') ?? closeRef.current;
    target?.focus();
    return () => { previous?.focus?.(); };
  }, [open]);

  if (!open) return null;

  const payload = props.data;
  const scope = payload?.scope;
  const todayKey = payload?.today.date ?? props.range.to.slice(0, 10);

  const body = (
    <div className={cls('root')}>
      <div className={cls('mask')} aria-hidden="true" onClick={onClose} />
      <div
        ref={cardRef}
        className={cls('dialog')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dsut-title"
        tabIndex={-1}
      >
        <div className={cls('head')}>
          <div>
            <h2 className={cls('title')} id="dsut-title">
              {props.t('dialog.title')}
            </h2>
            <p className={cls('subtitle')}>
              {/* The echoed scope, not the picker: the label must describe the
                  numbers on screen even while a newer request is in flight. */}
              {rangeLabel(scope?.from ?? props.range.from, scope?.to ?? props.range.to)}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={cls('close')}
            onClick={onClose}
            aria-label={props.t('dialog.close')}
            title={props.t('dialog.close')}
          >
            ✕
          </button>
        </div>

        <div className={cls('body')}>
          {props.error !== undefined ? (
            <div className={cls('status')}>
              <span className={cls('dot')} />
              {props.t('status.error', { message: props.error })}
            </div>
          ) : null}

          {payload?.scanning.running === true ? (
            <div className={cls('status')}>
              <span className={cls('dot')} />
              {props.t('status.scanning', {
                files: exactNumber(payload.scanning.files),
                records: exactNumber(payload.scanning.records),
              })}
            </div>
          ) : null}

          {payload?.legacy === true ? (
            <div className={cls('status')}>
              <span className={cls('dot')} />
              {props.t('status.legacy')}
            </div>
          ) : null}

          <RangePicker
            range={props.range}
            today={todayKey}
            t={props.t}
            disabled={payload?.legacy === true}
            onChange={props.onRangeChange}
          />

          {scope === undefined ? (
            <div className={cls('empty')}>{props.t('dialog.loading')}</div>
          ) : (
            <>
              <div className={cls('cards')}>
                <Card
                  label={props.t('card.total')}
                  value={compactNumber(totalTokens(scope.totals))}
                  hint={exactNumber(totalTokens(scope.totals))}
                  emphasis
                />
                <Card
                  label={props.t('card.input')}
                  value={compactNumber(scope.totals.inputTokens)}
                  hint={exactNumber(scope.totals.inputTokens)}
                />
                <Card
                  label={props.t('card.cacheRead')}
                  value={compactNumber(scope.totals.cacheReadTokens)}
                  hint={props.t('card.cacheWriteHint', { value: compactNumber(scope.totals.cacheWriteTokens) })}
                />
                <Card
                  label={props.t('card.output')}
                  value={compactNumber(scope.totals.outputTokens)}
                  hint={exactNumber(scope.totals.outputTokens)}
                />
                <Card
                  label={props.t('card.reasoning')}
                  value={compactNumber(scope.totals.reasoningTokens ?? 0)}
                  hint={props.t('card.reasoningHint')}
                />
                <Card label={props.t('card.calls')} value={exactNumber(scope.totals.calls)} hint={props.t('card.callsHint')} />
              </div>

              <div className={cls('status')}>
                <span className={cls('dot')} data-idle="true" />
                {props.t('status.cacheHit', { value: percent(scope.hitRate) })}
              </div>

              <Breakdown rows={scope.rows} totals={scope.totals} t={props.t} />
              <TimeTable payload={payload} t={props.t} />
            </>
          )}
        </div>

        <div className={cls('foot')}>
          <span>
            {payload === undefined
              ? props.t('foot.source')
              : props.t('foot.updated', { time: clockTime(payload.generatedAt) })}
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
