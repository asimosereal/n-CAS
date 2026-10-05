/**
 * SPECIAL EVENTS ENGINE
 * ==================================================================
 * An approved event is leave. That single sentence is the whole of this file:
 * everything here exists to answer two questions the attendance system asks.
 *
 *   1. May this student be at the reader right now?      isOnApprovedLeave()
 *   2. Should the class-end rule leave them alone?        isExcusedFromAbsence()
 *
 * The two questions are not the same one. A student excused for ten minutes in
 * the middle of a lesson is out of the room at 10:20 but was in the room when
 * the bell went, so the first answer is yes and the second is no. Keeping them
 * apart is what stops an event swallowing a whole lesson's register.
 *
 * Like the attendance engine, nothing here imports React.
 */

import type {
  EventStatus,
  Minutes,
  SpecialEvent,
  Student,
  ClassSession,
} from '../types';
import { formatTime } from '../time';

/* ------------------------------------------------------------------ */
/* Status — derived, never stored                                      */
/* ------------------------------------------------------------------ */

/**
 * eventStatus()
 * ------------------------------------------------------------------
 * Worked out from the clock rather than kept in a field, so a list left open on
 * a desk cannot go stale. Cancellation wins over everything: a withdrawn event
 * is withdrawn whatever the time says.
 */
export function eventStatus(event: SpecialEvent, now: Minutes, today: string): EventStatus {
  if (event.cancelled) return 'CANCELLED';
  // ISO dates compare correctly as strings, which is why they are stored that way.
  if (event.date > today) return 'SCHEDULED';
  if (event.date < today) return 'COMPLETED';
  if (now < event.startTime) return 'SCHEDULED';
  if (now < event.endTime) return 'ACTIVE';
  return 'COMPLETED';
}

/** The reason as a teacher reads it: the picklist entry, or what they typed. */
export function eventReasonLabel(event: SpecialEvent): string {
  return event.reason === 'Other' ? (event.otherReason ?? 'Other') : event.reason;
}

/* ------------------------------------------------------------------ */
/* Question 1 — may this student be at the reader?                     */
/* ------------------------------------------------------------------ */

/**
 * covers()
 * Is the clock inside this event's window, on this event's date, for this
 * student? Cancelled events cover nothing.
 */
export function covers(
  event: SpecialEvent,
  studentId: string,
  now: Minutes,
  today: string,
): boolean {
  if (event.cancelled) return false;
  if (event.date !== today) return false;
  if (!event.studentIds.includes(studentId)) return false;
  return now >= event.startTime && now < event.endTime;
}

/**
 * isOnApprovedLeave()
 * The predicate the reader is given. True when any live event covers this
 * student at this moment.
 */
export function isOnApprovedLeave(
  events: SpecialEvent[],
  studentId: string,
  now: Minutes,
  today: string,
): boolean {
  return events.some((event) => covers(event, studentId, now, today));
}

/** The event that excuses a student right now, so the reader can name the reason. */
export function activeEventFor(
  events: SpecialEvent[],
  studentId: string,
  now: Minutes,
  today: string,
): SpecialEvent | null {
  return events.find((event) => covers(event, studentId, now, today)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Question 2 — should the class-end rule leave them alone?            */
/* ------------------------------------------------------------------ */

/**
 * overlapsLesson()
 * Does this event touch the lesson at all? A student who was signed out for
 * any part of the lesson should not be marked absent for it, even if they were
 * back in the room before the bell.
 */
export function overlapsLesson(event: SpecialEvent, session: ClassSession): boolean {
  if (event.cancelled) return false;
  if (event.date !== session.date) return false;
  return event.startTime < session.endTime && event.endTime > session.startTime;
}

/**
 * isExcusedFromAbsence()
 * Used by finaliseClass() before it writes an ABSENT row.
 */
export function isExcusedFromAbsence(
  events: SpecialEvent[],
  studentId: string,
  session: ClassSession,
): boolean {
  return events.some(
    (event) => event.studentIds.includes(studentId) && overlapsLesson(event, session),
  );
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export interface EventDraft {
  studentIds: string[];
  date: string;
  /** null until the teacher picks one */
  startTime: Minutes | null;
  endTime: Minutes | null;
  reason: string;
  otherReason: string;
  notes: string;
}

export function emptyDraft(date: string): EventDraft {
  return {
    studentIds: [],
    date,
    startTime: null,
    endTime: null,
    reason: '',
    otherReason: '',
    notes: '',
  };
}

/**
 * validateEventDraft()
 * ------------------------------------------------------------------
 * Returns every problem at once rather than the first, so a teacher fixes the
 * form in one pass. An empty list means the event can be created.
 */
export function validateEventDraft(draft: EventDraft): string[] {
  const problems: string[] = [];

  if (draft.studentIds.length === 0) {
    problems.push('Select at least one student.');
  }
  if (!draft.date) {
    problems.push('Choose the date the event applies to.');
  }
  if (draft.startTime === null) {
    problems.push('Choose a start time.');
  }
  if (draft.endTime === null) {
    problems.push('Choose an end time.');
  }
  if (
    draft.startTime !== null &&
    draft.endTime !== null &&
    draft.endTime <= draft.startTime
  ) {
    problems.push('The end time must be after the start time.');
  }
  if (!draft.reason) {
    problems.push('Choose a reason.');
  }
  if (draft.reason === 'Other' && draft.otherReason.trim().length === 0) {
    problems.push('Describe the reason for choosing Other.');
  }

  return problems;
}

/* ------------------------------------------------------------------ */
/* Reading an event back                                               */
/* ------------------------------------------------------------------ */

export interface EventStudents {
  /** the students the event names, in register order */
  students: Student[];
  /** "Aisha Rahman, Mei Ling" when short, "3 students" when long */
  label: string;
  /** true when the label is a count rather than the names */
  isCount: boolean;
}

/**
 * describeEventStudents()
 * One event usually covers one student; a group cover names two or three before
 * it stops being readable in a table cell.
 */
export function describeEventStudents(event: SpecialEvent, students: Student[]): EventStudents {
  const named = event.studentIds
    .map((id) => students.find((s) => s.studentId === id))
    .filter((s): s is Student => s !== undefined);

  if (named.length <= 2) {
    return {
      students: named,
      label: named.map((s) => s.name).join(', ') || '—',
      isCount: false,
    };
  }
  return {
    students: named,
    label: `${named.length} students`,
    isCount: true,
  };
}

/** "08:10 – 08:45" */
export function eventWindow(event: SpecialEvent): string {
  return `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`;
}
