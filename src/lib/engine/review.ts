/**
 * REVIEW HISTORY
 * ==================================================================
 * The review screen has to show a teacher what happened, in order, without the
 * teacher having to reconstruct it. Rather than keeping a second copy of the
 * timeline in storage, the history is *derived* from the record and its break
 * rows, so it can never disagree with the register.
 */

import type {
  AttendanceRecord,
  AuditEntry,
  BreakRecord,
  ClassSession,
  Minutes,
  Student,
} from '../types';
import { formatTime } from '../time';
import { calculateAttendanceStatus, calculateLateMinutes } from './attendance-engine';

export interface ReviewEvent {
  time: Minutes | null;
  label: string;
  detail: string;
}

/**
 * describeRecordHistory()
 * ------------------------------------------------------------------
 * The narrative of one student's record: what they did, what the terminal did
 * about it, and what a teacher decided.
 *
 * The teacher's own changes are written from the audit trail rather than from
 * the record, when the audit has them. A record only remembers the *last*
 * override, so reading the record would lose every earlier correction; the
 * audit is append-only and keeps them all. A record that carries an override
 * but no audit — a register restored without its log — still gets its timing
 * line, from `overrideReason`, so nothing is ever silently missing.
 */
export function describeRecordHistory(
  record: AttendanceRecord,
  breaks: BreakRecord[],
  session: ClassSession,
  student: Student,
  audit: AuditEntry[] = [],
): ReviewEvent[] {
  const events: ReviewEvent[] = [];
  const logged = audit.filter((entry) => entry.recordId === record.recordId);
  const hasAudit = (action: string) => logged.some((entry) => entry.action === action);

  if (record.entryTime !== null) {
    /*
     * What the tap produced is worked out from when it happened, not read from
     * the record. A record only holds the current status, and a teacher may
     * since have changed it — reading the record would make the timeline claim
     * a student who arrived on time had been late all along, which is the one
     * thing a history must not do.
     */
    const tapStatus = calculateAttendanceStatus(
      record.entryTime,
      session.startTime,
      session.onTimeWindowMinutes,
    );
    const tapLate = calculateLateMinutes(
      record.entryTime,
      session.startTime,
      session.onTimeWindowMinutes,
    );
    events.push({
      time: record.entryTime,
      label:
        tapStatus === 'LATE' ? `Tap accepted — LATE by ${tapLate} min` : 'Tap accepted — PRESENT',
      detail: `Card ${student.rfidCardId} matched ${student.name} in the RFID register`,
    });
  } else {
    /*
     * No tap. Two different things can look like this: the class-end rule
     * writing an automatic ABSENT for someone who never turned up, and a
     * teacher setting the status by hand for someone the reader missed. The
     * first is stamped with the end of the lesson, because that is when the
     * rule fired; the second has no clock time of its own and says so, because
     * claiming the end of the lesson for it would invent an event.
     */
    const handwritten = record.verificationMethod !== 'RFID';
    events.push({
      time: handwritten ? null : session.endTime,
      label: 'No tap recorded',
      detail: handwritten
        ? 'The student never tapped at the reader; the status on this record was set by a teacher'
        : 'No valid RFID tap was received before the lesson ended',
    });
  }

  /* The secondary check sits immediately after the tap that triggered it. */
  if (record.identityCheck === 'NOT_RUN') {
    events.push({
      time: record.entryTime,
      label: 'Secondary identity check not run',
      detail: 'No image was captured because no tap was recorded',
    });
  } else if (record.identityCheck === 'REVIEW_REQUIRED') {
    events.push({
      time: record.entryTime,
      label: 'Identity check inconclusive',
      detail: 'RFID matched; captured image needs teacher confirmation',
    });
  }

  for (const b of breaks.filter((x) => x.studentId === record.studentId)) {
    events.push({
      time: b.startTime,
      label: 'Break started',
      detail: 'Return tap expected at the reader',
    });
    if (b.endTime !== null) {
      events.push({
        time: b.endTime,
        label: `Break ended — ${b.minutes} min`,
        detail: `Added to a running total of ${record.breakTotalMinutes} min`,
      });
    } else if (b.status === 'ON_BREAK' || b.status === 'UNRESOLVED') {
      events.push({
        time: session.endTime,
        label: 'Break left unresolved',
        detail: 'No return tap before the end of the lesson — flagged for review',
      });
    }
  }

  /* A teacher's change is a change, not a tap, so it is listed under the
     record's changes rather than here whenever the audit trail has it. The
     fallback keeps a restored register honest — and it has to look for both
     actions, because a record a teacher wrote by hand is logged as MANUAL_ENTRY
     and would otherwise have its reason printed twice. */
  if (
    record.overrideReason &&
    !hasAudit('MANUAL_OVERRIDE') &&
    !hasAudit('MANUAL_ENTRY')
  ) {
    events.push({
      time: null,
      label: 'Manual override applied',
      detail: `${record.overrideReason} — record now ${record.status}, method ${record.verificationMethod}`,
    });
  } else if (record.reviewStatus === 'CONFIRMED' && !hasAudit('REVIEW_CONFIRMED')) {
    events.push({
      time: null,
      label: 'Review confirmed by teacher',
      detail: 'The record was accepted as it stood',
    });
  } else if (record.reviewStatus === 'PENDING') {
    events.push({
      time: record.entryTime,
      label: 'Held for teacher review',
      detail: record.reviewReason ?? 'Record needs a teacher decision',
    });
  }

  /**
   * Order by when each thing happened. A teacher's change carries no clock time
   * of its own, and it can only have happened after everything the student did,
   * so it sorts last rather than first — which is what treating a missing time
   * as zero would do.
   */
  return events.sort((a, b) => when(a) - when(b));
}

function when(event: ReviewEvent): number {
  return event.time === null ? Number.MAX_SAFE_INTEGER : event.time;
}

/** One-line description of where the identity check stands, for the review screen. */
export function describeIdentityCheck(record: AttendanceRecord, student: Student): string {
  switch (record.identityCheck) {
    case 'MATCHED':
      return `RFID matched ${student.name}; the captured image confirmed the same student.`;
    case 'REVIEW_REQUIRED':
      return 'RFID matched; image requires teacher confirmation.';
    default:
      return 'No identity check was run for this record.';
  }
}

/** "08:02" for a moment, or the class end time when a rule fired late. */
export function stamp(time: Minutes): string {
  return formatTime(time);
}
