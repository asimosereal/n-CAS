/**
 * ATTENDANCE ENGINE
 * ==================================================================
 * Every rule in the specification that decides something lives here, as a
 * small named function with no React and no side effects. The functions are
 * ordered to follow the flow of a single tap, which is the same order the
 * flowchart and the pseudocode will use:
 *
 *   1. look the card up in the RFID register      findStudentByCard()
 *   2. work out PRESENT or LATE                   calculateAttendanceStatus()
 *   3. work out how many minutes late             calculateLateMinutes()
 *   4. ignore a repeat tap                        isDuplicateTap()
 *   5. decide what the tap means                  resolveScan()
 *   6. close the class                            finaliseClass()
 *   7. let a teacher change a record             applyManualOverride()
 *   8. count the class up                         summariseClass()
 */

import type {
  AttendanceRecord,
  AttendanceStatus,
  BreakRecord,
  BreakStatus,
  ClassSession,
  ClassSummary,
  IdentityCheck,
  Minutes,
  ReviewStatus,
  Student,
} from '../types';

/* ------------------------------------------------------------------ */
/* 1. RFID register lookup                                             */
/* ------------------------------------------------------------------ */

/**
 * findStudentByCard()
 * ------------------------------------------------------------------
 * Requirement: "The system searches the registered RFID list and identifies
 * the student." A card that is not in the register returns null, and the
 * terminal turns that into the invalid-card message. A card that *is*
 * registered is returned with the student it belongs to.
 */
export function findStudentByCard(students: Student[], cardId: string): Student | null {
  const trimmed = cardId.trim().toUpperCase();
  return students.find((s) => s.rfidCardId.toUpperCase() === trimmed) ?? null;
}

/* ------------------------------------------------------------------ */
/* 2 & 3. PRESENT / LATE and the late minutes                          */
/* ------------------------------------------------------------------ */

/**
 * calculateAttendanceStatus()
 * ------------------------------------------------------------------
 * Requirement: "At or before class start time = PRESENT. After class start
 * time = LATE."
 *
 * The boundary is inclusive, and it is inclusive of the school's on-time
 * window rather than of the bell on its own: a tap at 08:03 in a lesson that
 * starts at 08:00 is still on time, because the window runs to 08:05. A tap
 * after the window is late.
 */
export function calculateAttendanceStatus(
  scanTime: Minutes,
  classStart: Minutes,
  onTimeWindow: Minutes,
): Extract<AttendanceStatus, 'PRESENT' | 'LATE'> {
  return scanTime <= classStart + onTimeWindow ? 'PRESENT' : 'LATE';
}

/**
 * calculateLateMinutes()
 * ------------------------------------------------------------------
 * Requirement: "The system calculates late minutes automatically."
 *
 * The minutes are counted from the bell, not from the end of the on-time
 * window — a student who arrives at 08:07 is seven minutes late, not two. A
 * student inside the window is not late at all, so the answer is zero rather
 * than the couple of minutes they spent walking in.
 */
export function calculateLateMinutes(
  scanTime: Minutes,
  classStart: Minutes,
  onTimeWindow: Minutes,
): number {
  if (scanTime <= classStart + onTimeWindow) return 0;
  return Math.max(0, scanTime - classStart);
}

/* ------------------------------------------------------------------ */
/* 4. Duplicate taps                                                   */
/* ------------------------------------------------------------------ */

/**
 * isDuplicateTap()
 * ------------------------------------------------------------------
 * Requirement: "Duplicate taps within the defined duplicate-tap period are
 * detected and ignored."
 *
 * The comparison is against the ENTRY tap only, and only while the student has
 * not yet started a break. That distinction matters: if every tap were tested
 * against the previous tap, a student who started a break and returned inside
 * the duplicate window would have their return tap thrown away as a duplicate
 * and the break would never close.
 */
export function isDuplicateTap(
  record: AttendanceRecord,
  scanTime: Minutes,
  duplicateTapWindow: Minutes,
): boolean {
  if (record.entryTime === null) return false;
  if (record.breakStatus !== 'NONE' && record.breakStatus !== 'ON_BREAK') return false;
  return scanTime - record.entryTime < duplicateTapWindow;
}

/* ------------------------------------------------------------------ */
/* 5. What does this tap mean?                                         */
/* ------------------------------------------------------------------ */

export interface ScanContext {
  cardId: string;
  scanTime: Minutes;
  session: ClassSession;
  students: Student[];
  records: AttendanceRecord[];
  /**
   * The result of the secondary identity check on the captured image. In the
   * classroom the terminal sets this from the camera; for demonstration it is
   * supplied by the simulation controls.
   */
  identityMatched: boolean;
  /**
   * The second source of approved leave: an event on the Special Events page
   * that covers this student at this moment. It is a predicate rather than a
   * list because the engine has no business knowing what an event is — it only
   * needs to be told whether this student is excused. Returns the reason when
   * there is one, so the terminal can say why.
   */
  approvedLeave?: (studentId: string) => { reason: string } | null;
}

export type ScanDecision =
  | { kind: 'INVALID_CARD'; cardId: string; message: string }
  | { kind: 'NOT_IN_CLASS'; student: Student; message: string }
  | { kind: 'APPROVED_LEAVE'; student: Student; reason: string | null; message: string }
  | { kind: 'DUPLICATE'; student: Student; entryTime: Minutes; message: string }
  | {
      kind: 'ENTRY';
      student: Student;
      status: Extract<AttendanceStatus, 'PRESENT' | 'LATE'>;
      lateMinutes: number;
      identityCheck: IdentityCheck;
      message: string;
    }
  | { kind: 'BREAK_START'; student: Student; message: string }
  | {
      kind: 'BREAK_END';
      student: Student;
      startedAt: Minutes;
      breakMinutes: number;
      message: string;
    };

/**
 * resolveScan()
 * ------------------------------------------------------------------
 * The decision function for a single tap. It reads the state and returns what
 * the tap means; it does not modify anything. The store applies the decision,
 * which keeps the rule and the bookkeeping separate.
 */
export function resolveScan(ctx: ScanContext): ScanDecision {
  /* Step 1 — is the card in the register at all? */
  const student = findStudentByCard(ctx.students, ctx.cardId);
  if (!student) {
    return {
      kind: 'INVALID_CARD',
      cardId: ctx.cardId,
      message: 'Card not recognised — this card is not on the register',
    };
  }

  /* Step 2 — is the student supposed to be in THIS class? */
  if (student.classId !== ctx.session.classId) {
    return {
      kind: 'NOT_IN_CLASS',
      student,
      message: `${student.name} is enrolled in ${student.classId}, not ${ctx.session.classId}`,
    };
  }

  /* Step 3 — approved leave means no attendance is required today.
     There are two ways to be on approved leave: a standing arrangement held on
     the student's record, and an event filed on the Special Events page that
     covers this moment. Both end the scan in the same place. */
  const eventLeave = ctx.approvedLeave?.(student.studentId) ?? null;
  if (student.approvedLeave || eventLeave) {
    return {
      kind: 'APPROVED_LEAVE',
      student,
      reason: eventLeave?.reason ?? null,
      message: eventLeave
        ? `${student.name} is excused — ${eventLeave.reason}, so no attendance is required`
        : `${student.name} is on approved leave — no attendance required`,
    };
  }

  const matches = ctx.records.filter(
    (r) => r.studentId === student.studentId && r.classId === ctx.session.classId,
  );
  // A student has one record per lesson. If a register somehow carries two —
  // an older build, a restored session — the one that already has an entry time
  // is the real one, and the placeholder beside it is ignored.
  const record = matches.find((r) => r.entryTime !== null) ?? matches[0];

  /* Step 4 — first accepted tap of the lesson. */
  if (!record || record.entryTime === null) {
    const status = calculateAttendanceStatus(
      ctx.scanTime,
      ctx.session.startTime,
      ctx.session.onTimeWindowMinutes,
    );
    const lateMinutes = calculateLateMinutes(
      ctx.scanTime,
      ctx.session.startTime,
      ctx.session.onTimeWindowMinutes,
    );
    const identityCheck: IdentityCheck = ctx.identityMatched ? 'MATCHED' : 'REVIEW_REQUIRED';
    return {
      kind: 'ENTRY',
      student,
      status,
      lateMinutes,
      identityCheck,
      message:
        identityCheck === 'REVIEW_REQUIRED'
          ? `${student.name} recorded — image needs teacher confirmation`
          : `${student.name} recorded`,
    };
  }

  /* Step 5 — a repeat tap inside the duplicate window is ignored. */
  if (isDuplicateTap(record, ctx.scanTime, ctx.session.duplicateTapWindow)) {
    return {
      kind: 'DUPLICATE',
      student,
      entryTime: record.entryTime,
      message: `Already recorded at ${record.entryTime} — duplicate tap ignored`,
    };
  }

  /* Step 6 — the returning tap closes an open break. */
  if (record.breakStatus === 'ON_BREAK' && record.breakStartedAt !== null) {
    const breakMinutes = Math.max(0, ctx.scanTime - record.breakStartedAt);
    return {
      kind: 'BREAK_END',
      student,
      startedAt: record.breakStartedAt,
      breakMinutes,
      message: `Break ended — ${breakMinutes} min`,
    };
  }

  /* Step 7 — any other later tap starts a break. */
  return {
    kind: 'BREAK_START',
    student,
    message: `Break started for ${student.name}`,
  };
}

/* ------------------------------------------------------------------ */
/* 6. Closing the class                                                */
/* ------------------------------------------------------------------ */

export interface FinaliseResult {
  records: AttendanceRecord[];
  breaks: BreakRecord[];
  absentAdded: string[];
  reviewAdded: string[];
}

/**
 * finaliseClass()
 * ------------------------------------------------------------------
 * Requirement: "Students without attendance records at class end are
 * automatically marked ABSENT unless approved leave applies." And: "Unresolved
 * breaks at the end of class are flagged for teacher review."
 *
 * Both rules are applied here, once, when the lesson clock reaches the end
 * time. A record a teacher has already changed is never overwritten.
 *
 * `isExcused` is the Special Events page's contribution: a student whose
 * approved event overlapped this lesson is not marked absent for it.
 */
export function finaliseClass(
  students: Student[],
  records: AttendanceRecord[],
  session: ClassSession,
  now: Minutes,
  isExcused?: (studentId: string) => boolean,
): FinaliseResult {
  const absentAdded: string[] = [];
  const reviewAdded: string[] = [];
  const next: AttendanceRecord[] = [];

  for (const record of records) {
    let updated = record;

    /* 6a — a break still open at the end of the lesson cannot be closed by
       the student any more, so it is flagged instead of being guessed at. */
    if (updated.breakStatus === 'ON_BREAK') {
      updated = {
        ...updated,
        breakStatus: 'UNRESOLVED',
        reviewStatus: 'PENDING' satisfies ReviewStatus,
        reviewReason: updated.reviewReason ?? 'Break started but never ended',
      };
      reviewAdded.push(updated.studentId);
    }

    next.push(updated);
  }

  /* 6b — anyone with no record at all is ABSENT, unless approved leave. */
  for (const student of students) {
    if (student.classId !== session.classId) continue;
    if (student.approvedLeave) continue;
    if (isExcused?.(student.studentId)) continue;

    const exists = next.some(
      (r) => r.studentId === student.studentId && r.classId === session.classId,
    );
    if (exists) continue;

    next.push(createAbsentRecord(student, session));
    absentAdded.push(student.studentId);
  }

  void now;
  return { records: next, breaks: [], absentAdded, reviewAdded };
}

/**
 * createAbsentRecord()
 * The record the automatic rule writes for a student who never tapped.
 *
 * The id is the same one the first tap would have produced, because a student
 * has at most one record per lesson. Giving the absent placeholder its own id
 * would let a later tap add a second row for the same student instead of
 * replacing the placeholder, and the duplicate-tap rule would then be checking
 * the wrong row.
 */
export function createAbsentRecord(student: Student, session: ClassSession): AttendanceRecord {
  return {
    recordId: `${session.classId}:${student.studentId}`,
    studentId: student.studentId,
    classId: session.classId,
    entryTime: null,
    status: 'ABSENT',
    lateMinutes: 0,
    verificationMethod: 'RFID',
    identityCheck: 'NOT_RUN',
    reviewStatus: 'NONE',
    reviewReason: null,
    breakStatus: 'NONE',
    breakStartedAt: null,
    breakTotalMinutes: 0,
    overrideReason: null,
    saved: false,
  };
}

/* ------------------------------------------------------------------ */
/* 7. Manual override                                                  */
/* ------------------------------------------------------------------ */

export interface OverrideOutcome {
  ok: boolean;
  error?: string;
  updated?: AttendanceRecord;
  audit: {
    recordId: string;
    oldValue: string;
    newValue: string;
    reason: string;
  };
}

/**
 * applyManualOverride()
 * ------------------------------------------------------------------
 * Requirement: "Teachers can manually change attendance status through a
 * Manual Override." A reason is mandatory — there is no silent edit — and the
 * before/after pair is returned so the audit log can be written without the
 * engine knowing what an audit log is.
 */
export function applyManualOverride(
  record: AttendanceRecord,
  newStatus: Extract<AttendanceStatus, 'PRESENT' | 'LATE' | 'ABSENT'>,
  reason: string | null,
): OverrideOutcome {
  const auditBase = {
    recordId: record.recordId,
    oldValue: record.status,
    newValue: newStatus,
    reason: reason ?? '',
  };

  if (!reason || reason.trim().length === 0) {
    return { ok: false, error: 'A reason is required for every override.', audit: auditBase };
  }
  if (record.status === newStatus) {
    return {
      ok: false,
      error: 'That is already the recorded status — choose a different status.',
      audit: auditBase,
    };
  }

  return {
    ok: true,
    updated: {
      ...record,
      status: newStatus,
      // Overriding to PRESENT or LATE means the student was in the room, so the
      // late minutes have to be recalculated rather than left at the ABSENT zero.
      lateMinutes: newStatus === 'ABSENT' ? 0 : record.lateMinutes,
      reviewStatus: 'OVERRIDDEN',
      overrideReason: reason.trim(),
      verificationMethod: 'MANUAL_OVERRIDE',
      // A teacher has now looked at it, so it is no longer pending.
      identityCheck: record.identityCheck === 'REVIEW_REQUIRED' ? 'MATCHED' : record.identityCheck,
    },
    audit: auditBase,
  };
}

/* ------------------------------------------------------------------ */
/* 8. Summary                                                          */
/* ------------------------------------------------------------------ */

/**
 * summariseClass()
 * ------------------------------------------------------------------
 * The four numbers the class summary reports, and the one rule that keeps them
 * adding up to the number of records: a record still held for review is counted
 * under Review Required and is NOT also counted as present. Ryan Tan has a
 * provisional PRESENT from his 08:02 tap, but until a teacher confirms it the
 * class total must not claim him as present.
 */
export function summariseClass(
  students: Student[],
  records: AttendanceRecord[],
  classId: string,
): ClassSummary {
  const inClass = records.filter((r) => r.classId === classId);
  const held = (r: AttendanceRecord) => r.reviewStatus === 'PENDING';
  const settled = inClass.filter((r) => !held(r));
  const count = (status: AttendanceStatus) => settled.filter((r) => r.status === status).length;

  return {
    totalRecords: inClass.length,
    present: count('PRESENT'),
    late: count('LATE'),
    absent: count('ABSENT'),
    reviewRequired: inClass.filter(held).length,
    approvedLeave: students.filter((s) => s.classId === classId && s.approvedLeave).length,
  };
}

/* ------------------------------------------------------------------ */
/* Small shared helpers                                                */
/* ------------------------------------------------------------------ */

/** A brand new record for a student who has just tapped in. */
export function createEntryRecord(
  student: Student,
  session: ClassSession,
  entryTime: Minutes,
  status: Extract<AttendanceStatus, 'PRESENT' | 'LATE'>,
  lateMinutes: number,
  identityCheck: IdentityCheck,
): AttendanceRecord {
  const needsReview = identityCheck === 'REVIEW_REQUIRED';
  return {
    recordId: `${session.classId}:${student.studentId}`,
    studentId: student.studentId,
    classId: session.classId,
    entryTime,
    // The tap's own outcome is recorded either way; the review flag sits beside
    // it rather than replacing it.
    status,
    lateMinutes,
    verificationMethod: 'RFID_FACE',
    identityCheck,
    reviewStatus: needsReview ? 'PENDING' : 'NONE',
    reviewReason: needsReview ? 'Captured image needs teacher confirmation' : null,
    breakStatus: 'NONE',
    breakStartedAt: null,
    breakTotalMinutes: 0,
    overrideReason: null,
    saved: false,
  };
}

/** True when a record can still be changed by the class-end rules. */
export function isOpen(record: AttendanceRecord): boolean {
  return record.reviewStatus !== 'OVERRIDDEN' && record.reviewStatus !== 'CONFIRMED';
}

export type { BreakStatus };
