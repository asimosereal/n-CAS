/**
 * REVIEW HISTORY
 * ==================================================================
 * The review screen has to show a teacher what happened, in order, without the
 * teacher having to reconstruct it. Rather than keeping a second copy of the
 * timeline in storage, the history is *derived* from the record and its break
 * rows, so it can never disagree with the register.
 */

import type { AttendanceRecord, BreakRecord, ClassSession, Minutes, Student } from '../types';
import { formatTime } from '../time';

export interface ReviewEvent {
  time: Minutes | null;
  label: string;
  detail: string;
}

export function describeRecordHistory(
  record: AttendanceRecord,
  breaks: BreakRecord[],
  session: ClassSession,
  student: Student,
): ReviewEvent[] {
  const events: ReviewEvent[] = [];

  if (record.entryTime !== null) {
    events.push({
      time: record.entryTime,
      label:
        record.status === 'LATE'
          ? `Tap accepted — LATE by ${record.lateMinutes} min`
          : 'Tap accepted — PRESENT',
      detail: `Card ${student.rfidCardId} matched ${student.name} in the RFID register`,
    });
  } else {
    events.push({
      time: session.endTime,
      label: 'No tap recorded',
      detail: 'No valid RFID tap was received before the lesson ended',
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

  if (record.overrideReason) {
    events.push({
      time: null,
      label: 'Manual override applied',
      detail: `${record.overrideReason} — record now ${record.status}, method ${record.verificationMethod}`,
    });
  } else if (record.reviewStatus === 'CONFIRMED') {
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

  return events.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
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
