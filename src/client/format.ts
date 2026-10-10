/**
 * Number and date formatting shared by the button, the cards and the chart.
 *
 * Kept free of imports so the module graph stays flat, and deliberately
 * deterministic: the same number must render identically on the sidebar button
 * and inside the modal, or the two would appear to disagree.
 */
import type { Buckets } from '../config.ts';

/** Compact unit table, largest first. */
const UNITS: ReadonlyArray<readonly [number, string]> = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'k'],
];

/**
 * Compact token count for tight spaces, e.g. `162.4M`, `814k`, `957`.
 *
 * Three significant digits at most, so the sidebar button never reflows: the
 * width of the string is stable as the count grows.
 * @param n - Token count.
 * @returns A short human string.
 */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  for (const [scale, suffix] of UNITS) {
    if (n >= scale) {
      const value = n / scale;
      // 1 decimal below 100, none above, to keep at most 4 characters.
      const text = value >= 100 ? value.toFixed(0) : value.toFixed(1);
      return `${text.replace(/\.0$/, '')}${suffix}`;
    }
  }
  return String(Math.round(n));
}

/**
 * Exact count with locale-aware grouping, for the detail cards where the full
 * number is the point.
 * @param n - Token count.
 * @returns A grouped decimal string.
 */
export function exactNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString();
}

/** Percentage with one decimal, or an em dash when there is no denominator. */
export function percent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

/** Cache-hit share of billed input, matching the host's definition. */
export function cacheHitRate(b: Buckets): number | null {
  const billed = (b.inputTokens || 0) + (b.cacheReadTokens || 0) + (b.cacheWriteTokens || 0);
  if (billed <= 0) return null;
  return (b.cacheReadTokens || 0) / billed;
}

/**
 * `9-29` style day label for a table row, derived from the `YYYY-MM-DD` key
 * without constructing a Date, so no timezone shift can move the label.
 * @param key - `YYYY-MM-DD`.
 * @returns A short axis label.
 */
export function shortDay(key: string): string {
  const parts = key.split('-');
  if (parts.length !== 3) return key;
  return `${Number(parts[1])}-${Number(parts[2])}`;
}

/**
 * `14:00` for an hour key.
 * @param key - `YYYY-MM-DDTHH`.
 * @returns The wall-clock hour, or the key unchanged when malformed.
 */
export function shortHour(key: string): string {
  const at = key.indexOf('T');
  if (at < 0) return key;
  const hour = Number(key.slice(at + 1));
  return Number.isFinite(hour) ? `${String(hour).padStart(2, '0')}:00` : key;
}

/** Split a `YYYY-MM-DD` key into numbers, or null when it is malformed. */
function dayParts(key: string): [number, number, number] | null {
  const parts = key.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
  return [parts[0] as number, parts[1] as number, parts[2] as number];
}

/** Full localized date for the modal heading. */
export function longDate(key: string): string {
  const parts = dayParts(key);
  if (parts === null) return key;
  const [y, m, d] = parts;
  try {
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    });
  } catch {
    return key;
  }
}

/** `9月23日` / `Sep 23`, with the year only when it is needed to disambiguate. */
function mediumDate(key: string, withYear: boolean): string {
  const parts = dayParts(key);
  if (parts === null) return key;
  const [y, m, d] = parts;
  try {
    return new Date(y, m - 1, d).toLocaleDateString(
      undefined,
      withYear ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' },
    );
  } catch {
    return key;
  }
}

/** Localized short weekday (`周三` / `Wed`) for a day key. */
export function weekdayName(key: string): string {
  const parts = dayParts(key);
  if (parts === null) return '';
  const [y, m, d] = parts;
  try {
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' });
  } catch {
    return '';
  }
}

/**
 * First column of a timeline row.
 *
 * A day bucket carries its weekday; an hour bucket is just a clock time unless
 * the caller needs the date too (a range label, which has no heading above it to
 * say which day it is).
 * @param key - Bucket key, `YYYY-MM-DD` or `YYYY-MM-DDTHH`.
 * @param withDate - Prepend the date to an hour label.
 * @returns The row label.
 */
export function bucketLabel(key: string, withDate: boolean): string {
  if (!key.includes('T')) {
    const weekday = weekdayName(key);
    return weekday.length === 0 ? shortDay(key) : `${shortDay(key)} ${weekday}`;
  }
  return withDate ? `${shortDay(key.slice(0, 10))} ${shortHour(key)}` : shortHour(key);
}

/**
 * Human description of a scope, for the modal subtitle.
 * @param from - First inclusive bucket key.
 * @param to - Last inclusive bucket key.
 * @returns e.g. `2026年9月29日 周二`, `9月23日 – 9月29日`, `9月29日 14:00–15:00`.
 */
export function rangeLabel(from: string, to: string): string {
  const fromHour = from.includes('T');
  const toHour = to.includes('T');
  if (!fromHour && !toHour) {
    if (from === to) return longDate(from);
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return `${mediumDate(from, !sameYear)} – ${mediumDate(to, !sameYear)}`;
  }
  const fromText = bucketLabel(from, true);
  if (from === to) {
    // One hour: name it as a half-open interval so 14:00 is not read as a point.
    const endHour = shortHour(`${from.slice(0, 10)}T${String(Number(from.slice(-2)) + 1).padStart(2, '0')}`);
    return `${mediumDate(from.slice(0, 10), true)} ${shortHour(from)}–${endHour}`;
  }
  return `${fromText} – ${bucketLabel(to, true)}`;
}

/** Local clock time `HH:MM` for the "updated at" line. */
export function clockTime(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
