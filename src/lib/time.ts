/**
 * TIME UTILITIES
 * ------------------------------------------------------------------
 * Every moment in n-CAS is stored as "minutes since midnight" rather than a
 * Date object. Two reasons:
 *
 *   1. The attendance rules are all subtractions — late minutes, break
 *      duration, break total — and integers keep those exact.
 *   2. A Date carries a time zone, which would let the same tap resolve to
 *      two different lesson states depending on where the machine sits. The
 *      coursework specification has no time-zone requirement, so the simplest
 *      correct model is the one that cannot get it wrong.
 */

/** Minutes since midnight, e.g. 08:03 becomes 483. */
export type Minutes = number;

/** "08:03" -> 483 */
export function toMinutes(hhmm: string): Minutes {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/** 483 -> "08:03" */
export function formatTime(value: Minutes): string {
  const h = Math.floor(value / 60);
  const m = value % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 4 -> "04 min" */
export function formatDuration(value: Minutes): string {
  return `${String(value).padStart(2, '0')} min`;
}

/** "08:03" for a nullable moment, or a placeholder when nothing was recorded. */
export function formatTimeOrDash(value: Minutes | null): string {
  return value === null ? '—' : formatTime(value);
}

/** "2026-10-05" -> "Monday 5 October 2026" */
export function formatLongDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
