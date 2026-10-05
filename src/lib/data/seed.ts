/**
 * SEED DATA
 * ==================================================================
 * The register and the class the application opens on. This is the data a real
 * deployment would read from the `student`, `rfid_card` and `class_session`
 * tables; here it is a plain module so the prototype runs with no database.
 *
 * The lesson is deliberately PART-WAY THROUGH when the application opens.
 * Fifteen of the thirty-one students have already tapped, fifteen have not, and
 * one is on approved leave. That mixture is the point: the reader station exists
 * to create the remaining records through interaction, and a class that arrives
 * already complete has nothing left to demonstrate.
 *
 * The seeded fifteen are there so that the two screens a teacher reads — the
 * review and the summary — have something real to show on first open. The
 * remaining fifteen, including Aisha Rahman's card, are created by dragging a
 * card at the reader.
 *
 * Nothing here is marked ABSENT. Absence is not an input to this system — it is
 * what the class-end rule produces, and it is produced when the teacher ends the
 * class on the summary screen.
 */

import type {
  AttendanceRecord,
  BreakRecord,
  ClassSession,
  SpecialEvent,
  Student,
} from '../types';
import { toMinutes } from '../time';
import { createEntryRecord } from '../engine/attendance-engine';

/* ------------------------------------------------------------------ */
/* The class                                                           */
/* ------------------------------------------------------------------ */

export const SESSION: ClassSession = {
  classId: '10A-CS',
  className: 'IGCSE Computer Science — 10A',
  subject: 'Computer Science',
  teacherName: 'Ms L. Fernandez',
  room: 'B420',
  date: '2026-10-05',
  startTime: toMinutes('08:00'),
  endTime: toMinutes('09:00'),
  // On time up to 08:05; late from 08:06, counted from the 08:00 bell.
  onTimeWindowMinutes: 5,
  duplicateTapWindow: 10,
};

/** The two students left unrecorded on purpose, so the class-end rule has work to do. */
export const LEFT_UNRECORDED = ['10A044', '10A070']; // Ethan Wong, Hana Yusof

/* ------------------------------------------------------------------ */
/* The RFID register                                                   */
/* ------------------------------------------------------------------ */

const year10A = '10A-CS';
const year10B = '10B-CS';

type StudentRow = [studentId: string, name: string, cardId: string];

/** Students of 10A — the class this session belongs to. */
const CLASS_10A: StudentRow[] = [
  ['10A002', 'Nurul Izzah binti Kamal', '04A1B2C3'],
  ['10A005', 'Tan Wei Sheng', '04A1B2D9'],
  ['10A007', 'Priya Ramesh', '04A1B3A4'],
  ['10A009', 'Muhammad Hafiz', '04A1B3F1'],
  ['10A012', 'Chloe Ng', '04A1B4C7'],
  ['10A015', 'Arjun Nair', '04A1B4D2'],
  ['10A018', 'Sofea Ibrahim', '04A1B5E8'],
  ['10A019', 'Lee Jia Hui', '04A1B5F5'],
  ['10A021', 'Amelia Chua', '04A1B6A1'],
  ['10A023', 'Aisha Rahman', '04A1B6C8'],
  ['10A025', 'Harith Zulkifli', '04A1B7D4'],
  ['10A027', 'Nathan Yap', '04A1B7E0'],
  ['10A029', 'Kavya Suresh', '04A1B8B2'],
  ['10A031', 'Daniel Lim', '04A1B8F7'],
  ['10A033', 'Ong Zhi Xuan', '04A1B9C5'],
  ['10A035', 'Farah Adilah', '04A1B9D1'],
  ['10A038', 'Wong Kai Le', '04A1C0A6'],
  ['10A040', 'Rajesh Kumar', '04A1C0B3'],
  ['10A042', 'Nur Aina', '04A1C1E9'],
  ['10A044', 'Ethan Wong', '04A1C1F6'],
  ['10A046', 'Chong Min Yi', '04A1C2D8'],
  ['10A049', 'Isabelle Tan', '04A1C2E4'],
  ['10A052', 'Mei Ling', '04A1C3B9'],
  ['10A055', 'Muhammad Danish', '04A1C3C6'],
  ['10A058', 'Goh Rui En', '04A1C4F2'],
  ['10A061', 'Sarah Lim', '04A1C5A8'],
  ['10A064', 'Ahmad Faiz', '04A1C5B5'],
  ['10A066', 'Natalie Koh', '04A1C6D7'],
  ['10A067', 'Ryan Tan', '04A1C6E3'],
  ['10A070', 'Hana Yusof', '04A1C7C1'],
  ['10A072', 'Iqbal Rahman', '04A1C7D8'],
];

/** A card from another class. It is on the register, but not in this lesson. */
const OTHER_CLASS: StudentRow[] = [
  ['10B014', 'Grace Teoh', '04B2A1F3'],
  ['10B026', 'Lim Xin Yi', '04B2A2C9'],
];

/** The single student on approved leave: no attendance is required today. */
const APPROVED_LEAVE_ID = '10A072';

/**
 * parentIdFor()
 * ------------------------------------------------------------------
 * The parent account number printed on the physical card beneath the student's
 * name. Derived from the student number so it is stable between runs, and given
 * the same `tIS` prefix and six digits the real cards carry.
 */
function parentIdFor(studentId: string): string {
  let hash = 0;
  for (const ch of studentId) hash = (hash * 31 + ch.charCodeAt(0)) % 100000;
  return `tIS${String(170000 + hash).padStart(6, '0')}`;
}

function toStudent([studentId, name, rfidCardId]: StudentRow, classId: string): Student {
  return {
    studentId,
    name,
    yearGroup: classId.slice(0, 3),
    classId,
    rfidCardId,
    parentId: parentIdFor(studentId),
    // A reference, not the photograph itself — the reader station and the review
    // screen show an initial-based placeholder where the enrolment photo sits.
    registeredImageRef: `enrolment/${studentId}.jpg`,
    approvedLeave: classId === year10A && studentId === APPROVED_LEAVE_ID,
  };
}

export const STUDENTS: Student[] = [
  ...CLASS_10A.map((row) => toStudent(row, year10A)),
  ...OTHER_CLASS.map((row) => toStudent(row, year10B)),
];

/** Just the students who belong to the class being taught. */
export const CLASS_ROSTER: Student[] = STUDENTS.filter((s) => s.classId === year10A);

/* ------------------------------------------------------------------ */
/* The records the class has produced so far                           */
/* ------------------------------------------------------------------ */

/**
 * [studentId, tap time, break minutes, review reason, open break at]
 *
 * Storing the taps rather than the finished records keeps this file honest:
 * every status and every late-minute figure below is produced by
 * calculateAttendanceStatus() and calculateLateMinutes(), so the seed data
 * cannot disagree with the engine.
 *
 * Fifteen students appear here. The other fifteen are absent from this array on
 * purpose.
 */
type TapRow = [
  studentId: string,
  tapTime: string,
  breakMinutes?: number,
  reviewReason?: string,
  openBreakAt?: string,
];

const TAPS: TapRow[] = [
  // ---- in the room before the bell (on time) -------------------------
  ['10A002', '07:48'],
  ['10A005', '07:49'],
  ['10A007', '07:50'],
  ['10A009', '07:51'],
  ['10A012', '07:52'],
  ['10A015', '07:53'],
  ['10A019', '07:54'],
  ['10A021', '07:55'],
  ['10A025', '07:56'],
  ['10A029', '07:57'],
  ['10A052', '08:02', 4], // Mei Ling — inside the on-time window, 4 minute break
  // ---- after the on-time window (late, counted from 08:00) -----------
  ['10A031', '08:07'], // Daniel Lim — 7 minutes late
  ['10A058', '08:06'], // 6 minutes
  ['10A061', '08:07'], // 7 minutes
  // ---- held for review ------------------------------------------------
  // Ryan Tan tapped in on time, but the captured image could not confirm him,
  // and he then left at 08:14 without tapping back in. He is the record the
  // review screen is built around.
  ['10A067', '08:02', undefined, 'Captured image needs teacher confirmation', '08:14'],
];

/**
 * The fifteen who have not tapped yet. Aisha Rahman heads the list because hers
 * is the card the reader station starts with: dragging it is how the next record
 * gets made.
 */
export const NOT_YET_RECORDED = [
  '10A023', // Aisha Rahman — the card the station starts with
  '10A018',
  '10A027',
  '10A033',
  '10A035',
  '10A038',
  '10A040',
  '10A042',
  '10A044', // Ethan Wong — left out on purpose
  '10A046',
  '10A049',
  '10A055',
  '10A064',
  '10A066',
  '10A070', // Hana Yusof — left out on purpose
];

function buildRecord(row: TapRow): AttendanceRecord | null {
  const [studentId, tapTime, breakMinutes, reviewReason, openBreakAt] = row;
  const student = STUDENTS.find((s) => s.studentId === studentId);
  if (!student) return null;

  const tap = toMinutes(tapTime);
  const status = tap <= SESSION.startTime + SESSION.onTimeWindowMinutes ? 'PRESENT' : 'LATE';
  const late = status === 'LATE' ? tap - SESSION.startTime : 0;

  const base = createEntryRecord(
    student,
    SESSION,
    tap,
    status,
    late,
    reviewReason ? 'REVIEW_REQUIRED' : 'MATCHED',
  );

  const closed = breakMinutes !== undefined && breakMinutes > 0;
  const open = openBreakAt !== undefined;

  return {
    ...base,
    breakStatus: open ? 'ON_BREAK' : closed ? 'CLOSED' : 'NONE',
    breakStartedAt: open ? toMinutes(openBreakAt) : null,
    breakTotalMinutes: breakMinutes ?? 0,
    reviewReason: reviewReason ?? null,
  };
}

/** The fifteen records the lesson has produced so far. */
export const SEED_ALL_RECORDS: AttendanceRecord[] = TAPS.map(buildRecord).filter(
  (r): r is AttendanceRecord => r !== null,
);

/* ------------------------------------------------------------------ */
/* Break history                                                       */
/* ------------------------------------------------------------------ */

/**
 * Two breaks, both long enough after their own entry tap to be legal: a tap
 * within ten minutes of the entry is a duplicate, so neither could have started
 * before 08:13.
 */
export const SEED_BREAKS: BreakRecord[] = [
  {
    breakId: 'BRK-10A052-1',
    studentId: '10A052',
    classId: SESSION.classId,
    startTime: toMinutes('08:13'),
    endTime: toMinutes('08:17'),
    minutes: 4,
    status: 'CLOSED',
  },
  {
    // Ryan Tan left at 08:14 and never tapped back in. The class-end rule turns
    // this into "Pending review" on the summary screen.
    breakId: 'BRK-10A067-1',
    studentId: '10A067',
    classId: SESSION.classId,
    startTime: toMinutes('08:14'),
    endTime: null,
    minutes: 0,
    status: 'ON_BREAK',
  },
];

/**
 * The moment the lesson clock is set to when the application opens.
 *
 * 08:20 — after the latest seeded event (Mei Ling's break ending at 08:17), so
 * that nothing in the register describes something that has not happened yet.
 */
export const OPENING_TIME = toMinutes('08:20');

/* ------------------------------------------------------------------ */
/* Special events                                                      */
/* ------------------------------------------------------------------ */

/**
 * Four approved events, one in each state the page can show, so the list has
 * something real in it the first time it is opened.
 *
 * They are chosen not to disturb the register. The active one covers two
 * students who had already tapped in before it began — they were in the room
 * for the bell and then went to the clinic, which is exactly what an event like
 * this is for — and the cancelled one covers the two students who are meant to
 * end the lesson absent, so cancelling it is what makes them absent.
 */
export const SEED_EVENTS: SpecialEvent[] = [
  {
    eventId: 'EVT-0001',
    studentIds: ['10A002', '10A005'], // Nurul Izzah, Tan Wei Sheng
    date: SESSION.date,
    startTime: toMinutes('08:10'),
    endTime: toMinutes('08:45'),
    reason: 'Medical',
    otherReason: null,
    notes: 'Dental appointment at the school clinic.',
    createdBy: SESSION.teacherName,
    cancelled: false,
  },
  {
    eventId: 'EVT-0002',
    studentIds: ['10A031'], // Daniel Lim
    date: SESSION.date,
    startTime: toMinutes('08:45'),
    endTime: toMinutes('09:00'),
    reason: 'School Event',
    otherReason: null,
    notes: 'Rehearsal for the Science Council assembly.',
    createdBy: SESSION.teacherName,
    cancelled: false,
  },
  {
    eventId: 'EVT-0003',
    studentIds: ['10A067'], // Ryan Tan
    date: SESSION.date,
    startTime: toMinutes('07:45'),
    endTime: toMinutes('08:05'),
    reason: 'Teacher Permission',
    otherReason: null,
    notes: 'Collected a delivery from the school office.',
    createdBy: SESSION.teacherName,
    cancelled: false,
  },
  {
    eventId: 'EVT-0004',
    studentIds: ['10A044', '10A070'], // Ethan Wong, Hana Yusof
    date: SESSION.date,
    startTime: toMinutes('08:20'),
    endTime: toMinutes('08:35'),
    reason: 'Office Permission',
    otherReason: null,
    notes: 'Withdrawn — the office appointment was moved to after school.',
    createdBy: SESSION.teacherName,
    cancelled: true,
  },
];
