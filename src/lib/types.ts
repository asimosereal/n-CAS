/**
 * n-CAS DOMAIN TYPES
 * ==================================================================
 * These types map one-to-one onto the tables named in the system analysis
 * (student, rfid_card, class_session, attendance_record, break_record,
 * audit_log). They are deliberately flat and small so that each one can be
 * carried straight into the design section of the coursework and then into
 * pseudocode.
 *
 * Nothing in this file, or in `lib/engine`, imports React. That separation is
 * what lets the attendance rules be lifted out of the interface and drawn as a
 * structure chart without rewriting them.
 */

import type { Minutes } from './time';

export type { Minutes };

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

/**
 * A student. `rfidCardId` is the number printed on the card the student taps.
 * `registeredImageRef` is a reference to the photograph taken at registration
 * time — it is held on the student record so the review screen can show what
 * the enrolled student looks like beside the image captured at the terminal.
 *
 * `parentId` is the parent's account number, printed on the physical card
 * beneath the student's name. It is carried on the record because the card
 * cannot be printed without it, and because the office searches by it when a
 * parent calls about an absence.
 */
export interface Student {
  studentId: string;
  name: string;
  yearGroup: string;
  /** the class the student is enrolled in — a card for another class must not be accepted */
  classId: string;
  rfidCardId: string;
  /** the parent account number printed on the card, e.g. tIS170206 */
  parentId: string;
  registeredImageRef: string;
  /**
   * Approved leave is the one thing that stops an automatic ABSENT mark. The
   * rule is required by the specification: a student with no attendance record
   * at class end is marked ABSENT "unless approved leave applies".
   */
  approvedLeave: boolean;
}

/**
 * One timetabled lesson. The duplicate-tap period is a property of the
 * session, not of the student, so it can be tuned per class.
 */
export interface ClassSession {
  classId: string;
  className: string;
  subject: string;
  teacherName: string;
  room: string;
  date: string;
  startTime: Minutes;
  endTime: Minutes;
  /**
   * The school's on-time window. A tap at or before the bell PLUS this window
   * still counts as PRESENT; only after it does the student become LATE, and
   * the late minutes are then measured from the bell itself rather than from
   * the end of the window.
   *
   * The window exists because the two rules the school actually operates are
   * not the same rule: "be in the room when the bell goes" and "we will not
   * mark you late for the first few minutes while the corridor clears". Five
   * minutes is what makes a tap at 08:03 on time while a tap at 08:07 is seven
   * minutes late.
   */
  onTimeWindowMinutes: Minutes;
  /** Taps inside this many minutes of the entry tap are ignored. */
  duplicateTapWindow: Minutes;
}

/* ------------------------------------------------------------------ */
/* Attendance                                                          */
/* ------------------------------------------------------------------ */

/**
 * PRESENT / LATE / ABSENT are the three attendance outcomes a tap or the
 * class-end rule can produce.
 *
 * "Review Required" is deliberately NOT a fourth outcome. It is carried by
 * `reviewStatus`, because a record held for review still has a provisional
 * attendance outcome — Ryan Tan's 08:02 tap really did make him PRESENT — it is
 * just not a confirmed one yet. Keeping the two axes separate is what stops a
 * held record being counted twice in the class summary.
 */
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT';

export type ReviewStatus = 'NONE' | 'PENDING' | 'CONFIRMED' | 'OVERRIDDEN';

/**
 * The break lifecycle. `UNRESOLVED` is the state at class end for a student
 * whose return tap never came; the specification requires that to be flagged
 * for teacher review rather than silently closed.
 */
export type BreakStatus = 'NONE' | 'ON_BREAK' | 'CLOSED' | 'UNRESOLVED';

/**
 * The secondary identity check that runs after a valid tap. RFID is the
 * primary identification; this is the confirmation step.
 */
export type IdentityCheck = 'MATCHED' | 'REVIEW_REQUIRED' | 'NOT_RUN';

export type VerificationMethod = 'RFID' | 'RFID_FACE' | 'MANUAL_OVERRIDE';

export interface AttendanceRecord {
  recordId: string;
  studentId: string;
  classId: string;
  /** first accepted tap of the lesson — null when the student never tapped */
  entryTime: Minutes | null;
  status: AttendanceStatus;
  lateMinutes: number;
  verificationMethod: VerificationMethod;
  identityCheck: IdentityCheck;
  reviewStatus: ReviewStatus;
  reviewReason: string | null;

  /* break tracking */
  breakStatus: BreakStatus;
  breakStartedAt: Minutes | null;
  /** total authorised break minutes inside the lesson */
  breakTotalMinutes: number;

  /** the mark a teacher set, kept beside the calculated one for the audit trail */
  overrideReason: string | null;
  /** true once the record has been written to permanent storage */
  saved: boolean;
}

/** One start/end pair produced by two taps. `endTime` is null while the
 *  student is still out of the room. */
export interface BreakRecord {
  breakId: string;
  studentId: string;
  classId: string;
  startTime: Minutes;
  endTime: Minutes | null;
  minutes: number;
  status: BreakStatus;
}

/** Every change to a record is written down; nothing is edited silently. */
export interface AuditEntry {
  auditId: string;
  timestamp: Minutes;
  actor: string;
  action: string;
  recordId: string;
  oldValue: string;
  newValue: string;
  reason: string;
}

/* ------------------------------------------------------------------ */
/* Terminal feedback                                                   */
/* ------------------------------------------------------------------ */

/**
 * The single state the reader station is in. The specification enumerates the
 * feedback the station must be able to give, and each one of them is a value
 * here rather than a set of flags, so the station can only ever show one
 * message at a time.
 */
export type TerminalState =
  | { kind: 'IDLE' }
  | { kind: 'INVALID_CARD'; cardId: string }
  | { kind: 'NOT_IN_CLASS'; student: Student }
  | { kind: 'DUPLICATE'; student: Student; entryTime: Minutes }
  | { kind: 'PRESENT'; student: Student; time: Minutes }
  | { kind: 'LATE'; student: Student; time: Minutes; lateMinutes: number }
  | { kind: 'BREAK_START'; student: Student; time: Minutes }
  | { kind: 'BREAK_END'; student: Student; time: Minutes; breakMinutes: number }
  | { kind: 'APPROVED_LEAVE'; student: Student; reason: string | null };

/* ------------------------------------------------------------------ */
/* Special events — approved leave inside a lesson                     */
/* ------------------------------------------------------------------ */

/**
 * The reasons the office accepts for taking a student out of a lesson. The
 * list is closed on purpose: an approved event is a recorded decision, and a
 * free-text reason would make the log unsearchable.
 */
export const EVENT_REASONS = [
  'Medical',
  'School Event',
  'Teacher Permission',
  'Office Permission',
  'Other',
] as const;

export type EventReason = (typeof EVENT_REASONS)[number];

/**
 * An event's status is never stored. It is worked out from the clock every time
 * it is read, so a list left open on a teacher's desk cannot go stale, and there
 * is no state to keep in step when the simulation clock moves.
 *
 *   SCHEDULED  the window has not opened yet
 *   ACTIVE     the clock is inside the window
 *   COMPLETED  the window has closed
 *   CANCELLED  withdrawn by a teacher, whatever the clock says
 */
export type EventStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

/**
 * One approved absence, for one or more students, over one time window.
 *
 * This is the record that tells the attendance system a student is excused:
 * while the window is open the reader will not record them, and a student whose
 * window overlaps the lesson is not marked ABSENT when the lesson ends.
 */
export interface SpecialEvent {
  eventId: string;
  /** one event can cover a whole group — a teacher does not file one per student */
  studentIds: string[];
  /** YYYY-MM-DD, the same date format the lesson carries */
  date: string;
  startTime: Minutes;
  endTime: Minutes;
  reason: EventReason;
  /** filled in only when reason is 'Other' */
  otherReason: string | null;
  notes: string | null;
  createdBy: string;
  cancelled: boolean;
}

/* ------------------------------------------------------------------ */
/* Derived helper types                                                */
/* ------------------------------------------------------------------ */

/** The four numbers the class summary reports. */
export interface ClassSummary {
  totalRecords: number;
  present: number;
  late: number;
  absent: number;
  reviewRequired: number;
  approvedLeave: number;
}
