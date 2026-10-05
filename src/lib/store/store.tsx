'use client';

/**
 * APPLICATION STORE
 * ==================================================================
 * One reducer holds the whole attendance session. It is deliberately plain:
 * every rule it applies is a call into `lib/engine`, so the store only decides
 * *when* a rule runs, never *what* the rule is.
 *
 * The store is also where the two "permanent" requirements live — a record is
 * only written to storage when a teacher saves it, and the whole session is
 * mirrored into localStorage so that a refresh does not lose a saved register.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import type {
  AttendanceRecord,
  AuditEntry,
  BreakRecord,
  ClassSummary,
  Minutes,
  SpecialEvent,
  Student,
  TerminalState,
} from '../types';
import {
  SESSION,
  SEED_ALL_RECORDS,
  SEED_BREAKS,
  SEED_EVENTS,
  STUDENTS,
  CLASS_ROSTER,
  OPENING_TIME,
} from '../data/seed';
import {
  applyManualOverride,
  createEntryRecord,
  finaliseClass,
  resolveScan,
  summariseClass,
} from '../engine/attendance-engine';
import { activeEventFor, eventReasonLabel, isExcusedFromAbsence } from '../engine/events-engine';

/** v2: a record id is now `<class>:<student>`, so an older saved session would
 *  carry two rows per student. The key bump retires it rather than migrating. */
const STORAGE_KEY = 'ncas.session.v2';

/* ------------------------------------------------------------------ */
/* Shape                                                               */
/* ------------------------------------------------------------------ */

export interface AppState {
  clock: Minutes;
  terminal: TerminalState;
  records: AttendanceRecord[];
  breaks: BreakRecord[];
  audit: AuditEntry[];
  /** the last card the reader saw, so the station can show what was tapped */
  lastCardId: string;
  /** true once the class-end rules have run for this session */
  finalised: boolean;
  /** true once a teacher has written the register to permanent storage */
  saved: boolean;
  /**
   * Simulation input standing in for the camera's secondary identity check.
   * When false the next tap is treated as a failed identity check and is held
   * for teacher review.
   */
  identityMatched: boolean;
  /** a one-line message for the message bar under the header */
  message: { intent: 'info' | 'success' | 'warning' | 'error'; text: string } | null;
  /**
   * Approved leave filed from the Special Events page. It lives here rather
   * than in a store of its own because the reader and the class-end rule both
   * have to read it, and because it is part of the same simulated day.
   */
  specialEvents: SpecialEvent[];
}

type Action =
  | { type: 'HYDRATE'; state: AppState }
  | { type: 'TAP'; cardId: string }
  | { type: 'SET_CLOCK'; clock: Minutes }
  | { type: 'CLEAR_TERMINAL' }
  | { type: 'FINALISE' }
  | { type: 'OVERRIDE'; recordId: string; newStatus: AttendanceRecord['status']; reason: string }
  | { type: 'CONFIRM_REVIEW'; recordId: string }
  | { type: 'SAVE' }
  | { type: 'RESET' }
  | { type: 'SET_IDENTITY'; matched: boolean }
  | { type: 'CREATE_EVENT'; event: SpecialEvent }
  | { type: 'UPDATE_EVENT'; event: SpecialEvent }
  | { type: 'CANCEL_EVENT'; eventId: string; reason: string };

/* ------------------------------------------------------------------ */
/* Initial state                                                       */
/* ------------------------------------------------------------------ */

function initialState(): AppState {
  return {
    clock: OPENING_TIME,
    terminal: { kind: 'IDLE' },
    records: SEED_ALL_RECORDS.map((r) => ({ ...r })),
    breaks: SEED_BREAKS.map((b) => ({ ...b })),
    audit: [],
    lastCardId: '',
    finalised: false,
    saved: false,
    identityMatched: true,
    message: null,
    specialEvents: SEED_EVENTS.map((e) => ({ ...e, studentIds: [...e.studentIds] })),
  };
}

let counters = { audit: 0, record: 0 };

function nextAuditId(): string {
  counters.audit += 1;
  return `AUD-${String(counters.audit).padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Reducer                                                             */
/* ------------------------------------------------------------------ */

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    /* A saved session coming back from storage. */
    case 'HYDRATE':
      return action.state;

    /* ---------------------------------------------------------------- */
    /* The RFID tap pipeline                                            */
    /* ---------------------------------------------------------------- */
    case 'TAP': {
      const decision = resolveScan({
        cardId: action.cardId,
        scanTime: state.clock,
        session: SESSION,
        students: STUDENTS,
        records: state.records,
        identityMatched: state.identityMatched,
        // Approved leave filed on the Special Events page, as of right now.
        approvedLeave: (studentId) => {
          const event = activeEventFor(
            state.specialEvents,
            studentId,
            state.clock,
            SESSION.date,
          );
          return event ? { reason: eventReasonLabel(event) } : null;
        },
      });

      switch (decision.kind) {
        case 'INVALID_CARD':
          return {
            ...state,
            lastCardId: action.cardId,
            terminal: { kind: 'INVALID_CARD', cardId: action.cardId },
            message: { intent: 'error', text: decision.message },
          };

        case 'NOT_IN_CLASS':
          return {
            ...state,
            lastCardId: action.cardId,
            terminal: { kind: 'NOT_IN_CLASS', student: decision.student },
            message: { intent: 'error', text: decision.message },
          };

        case 'APPROVED_LEAVE':
          return {
            ...state,
            lastCardId: action.cardId,
            terminal: {
              kind: 'APPROVED_LEAVE',
              student: decision.student,
              reason: decision.reason,
            },
            message: { intent: 'info', text: decision.message },
          };

        case 'DUPLICATE':
          return {
            ...state,
            lastCardId: action.cardId,
            terminal: {
              kind: 'DUPLICATE',
              student: decision.student,
              entryTime: decision.entryTime,
            },
            message: { intent: 'warning', text: decision.message },
          };

        /* First accepted tap — this is the record of attendance. */
        case 'ENTRY': {
          const record = createEntryRecord(
            decision.student,
            SESSION,
            state.clock,
            decision.status,
            decision.lateMinutes,
            decision.identityCheck,
          );

          const audit: AuditEntry = {
            auditId: nextAuditId(),
            timestamp: state.clock,
            actor: `Terminal ${SESSION.room}`,
            action: 'ATTENDANCE_RECORDED',
            recordId: record.recordId,
            oldValue: 'no record',
            newValue: decision.status,
            reason: 'First valid RFID tap',
          };

          /* A failed identity check opens a review immediately. */
          const reviewAudit: AuditEntry[] =
            decision.identityCheck === 'REVIEW_REQUIRED'
              ? [
                  {
                    auditId: nextAuditId(),
                    timestamp: state.clock,
                    actor: `Terminal ${SESSION.room}`,
                    action: 'REVIEW_FLAGGED',
                    recordId: record.recordId,
                    oldValue: 'confirmed',
                    newValue: 'pending review',
                    reason: 'Captured image needs teacher confirmation',
                  },
                ]
              : [];

          return {
            ...state,
            lastCardId: action.cardId,
            // Replace whatever this student already had for this lesson. Keyed
            // on the student and the class rather than on the record id, so an
            // automatically-marked ABSENT row is replaced rather than shadowed.
            records: [
              ...state.records.filter(
                (r) =>
                  !(r.studentId === record.studentId && r.classId === record.classId),
              ),
              record,
            ],
            audit: [reviewAudit[0], audit, ...state.audit].filter(Boolean) as AuditEntry[],
            terminal:
              decision.status === 'LATE'
                ? {
                    kind: 'LATE',
                    student: decision.student,
                    time: state.clock,
                    lateMinutes: decision.lateMinutes,
                  }
                : { kind: 'PRESENT', student: decision.student, time: state.clock },
            message: { intent: 'success', text: decision.message },
          };
        }

        /* A later tap with no break open starts one. */
        case 'BREAK_START': {
          const record = state.records.find(
            (r) => r.studentId === decision.student.studentId && r.classId === SESSION.classId,
          );
          if (!record) return state;

          const breakRecord: BreakRecord = {
            breakId: `BRK-${decision.student.studentId}-${state.breaks.length + 1}`,
            studentId: decision.student.studentId,
            classId: SESSION.classId,
            startTime: state.clock,
            endTime: null,
            minutes: 0,
            status: 'ON_BREAK',
          };

          return {
            ...state,
            lastCardId: action.cardId,
            records: state.records.map((r) =>
              r.recordId === record.recordId
                ? { ...r, breakStatus: 'ON_BREAK', breakStartedAt: state.clock }
                : r,
            ),
            breaks: [breakRecord, ...state.breaks],
            terminal: { kind: 'BREAK_START', student: decision.student, time: state.clock },
            message: { intent: 'info', text: decision.message },
          };
        }

        /* The returning tap closes the break and the duration is added up. */
        case 'BREAK_END': {
          const record = state.records.find(
            (r) => r.studentId === decision.student.studentId && r.classId === SESSION.classId,
          );
          if (!record) return state;

          const total = record.breakTotalMinutes + decision.breakMinutes;

          return {
            ...state,
            lastCardId: action.cardId,
            records: state.records.map((r) =>
              r.recordId === record.recordId
                ? {
                    ...r,
                    breakStatus: 'CLOSED',
                    breakStartedAt: null,
                    breakTotalMinutes: total,
                  }
                : r,
            ),
            breaks: state.breaks.map((b) =>
              b.studentId === decision.student.studentId && b.status === 'ON_BREAK'
                ? { ...b, endTime: state.clock, minutes: decision.breakMinutes, status: 'CLOSED' }
                : b,
            ),
            terminal: {
              kind: 'BREAK_END',
              student: decision.student,
              time: state.clock,
              breakMinutes: decision.breakMinutes,
            },
            message: { intent: 'info', text: decision.message },
          };
        }

        default:
          return state;
      }
    }

    case 'SET_CLOCK':
      return { ...state, clock: action.clock };

    case 'CLEAR_TERMINAL':
      return { ...state, terminal: { kind: 'IDLE' }, lastCardId: '' };

    /* ---------------------------------------------------------------- */
    /* Class end — the two automatic rules                              */
    /* ---------------------------------------------------------------- */
    case 'FINALISE': {
      const result = finaliseClass(
        CLASS_ROSTER,
        state.records,
        SESSION,
        state.clock,
        // A student excused for any part of this lesson is not marked absent for it.
        (studentId) => isExcusedFromAbsence(state.specialEvents, studentId, SESSION),
      );
      const notes: AuditEntry[] = [];

      for (const studentId of result.absentAdded) {
        const student = STUDENTS.find((s) => s.studentId === studentId);
        notes.push({
          auditId: nextAuditId(),
          timestamp: state.clock,
          actor: 'System',
          action: 'MARKED_ABSENT',
          recordId: `${SESSION.classId}:${studentId}`,
          oldValue: 'no record',
          newValue: 'ABSENT',
          reason: 'No attendance record at class end',
        });
        void student;
      }

      for (const studentId of result.reviewAdded) {
        notes.push({
          auditId: nextAuditId(),
          timestamp: state.clock,
          actor: 'System',
          action: 'REVIEW_FLAGGED',
          recordId: state.records.find((r) => r.studentId === studentId)?.recordId ?? studentId,
          oldValue: 'open break',
          newValue: 'pending review',
          reason: 'Break started but never ended before the lesson finished',
        });
      }

      return {
        ...state,
        clock: SESSION.endTime,
        finalised: true,
        records: result.records,
        breaks: state.breaks.map((b) =>
          b.status === 'ON_BREAK' ? { ...b, status: 'UNRESOLVED' as const } : b,
        ),
        audit: [...notes, ...state.audit],
        message: {
          intent: 'info',
          text: `Class ended — ${result.absentAdded.length} marked absent, ${result.reviewAdded.length} held for review`,
        },
      };
    }

    /* ---------------------------------------------------------------- */
    /* Manual override                                                  */
    /* ---------------------------------------------------------------- */
    case 'OVERRIDE': {
      const record = state.records.find((r) => r.recordId === action.recordId);
      if (!record) return state;

      const outcome = applyManualOverride(record, action.newStatus, action.reason);
      if (!outcome.ok || !outcome.updated) {
        return {
          ...state,
          message: { intent: 'error', text: outcome.error ?? 'Override failed' },
        };
      }

      const audit: AuditEntry = {
        auditId: nextAuditId(),
        timestamp: state.clock,
        actor: SESSION.teacherName,
        action: 'MANUAL_OVERRIDE',
        recordId: record.recordId,
        oldValue: outcome.audit.oldValue,
        newValue: outcome.audit.newValue,
        reason: outcome.audit.reason,
      };

      return {
        ...state,
        records: state.records.map((r) =>
          r.recordId === record.recordId ? outcome.updated! : r,
        ),
        audit: [audit, ...state.audit],
        message: {
          intent: 'success',
          text: `Override saved — ${record.studentId} set to ${action.newStatus}`,
        },
      };
    }

    /* Teacher accepts the record as it stands; the flag is cleared. */
    case 'CONFIRM_REVIEW': {
      const record = state.records.find((r) => r.recordId === action.recordId);
      if (!record) return state;

      const audit: AuditEntry = {
        auditId: nextAuditId(),
        timestamp: state.clock,
        actor: SESSION.teacherName,
        action: 'REVIEW_CONFIRMED',
        recordId: record.recordId,
        oldValue: `review ${record.reviewStatus}`,
        newValue: `review CONFIRMED`,
        reason: 'Identity confirmed by teacher',
      };

      return {
        ...state,
        records: state.records.map((r) =>
          r.recordId === record.recordId
            ? {
                ...r,
                reviewStatus: 'CONFIRMED',
                reviewReason: null,
                identityCheck: 'MATCHED',
                breakStatus: r.breakStatus === 'UNRESOLVED' ? 'CLOSED' : r.breakStatus,
              }
            : r,
        ),
        audit: [audit, ...state.audit],
        message: { intent: 'success', text: 'Review confirmed — record settled' },
      };
    }

    /* ---------------------------------------------------------------- */
    /* Permanent storage, then reset for the next class                 */
    /* ---------------------------------------------------------------- */
    case 'SAVE': {
      const records = state.records.map((r) => ({ ...r, saved: true }));
      const audit: AuditEntry = {
        auditId: nextAuditId(),
        timestamp: state.clock,
        actor: SESSION.teacherName,
        action: 'REGISTER_SAVED',
        recordId: SESSION.classId,
        oldValue: `${state.records.filter((r) => !r.saved).length} unsaved`,
        newValue: `${records.length} saved`,
        reason: 'Register written to permanent storage',
      };
      return {
        ...state,
        records,
        saved: true,
        audit: [audit, ...state.audit],
        message: { intent: 'success', text: 'Attendance records saved successfully' },
      };
    }

    case 'RESET': {
      return {
        ...initialState(),
        clock: SESSION.startTime,
        identityMatched: state.identityMatched,
        message: {
          intent: 'info',
          text: `System ready for the next class — ${SESSION.room} reader is live`,
        },
      };
    }

    case 'SET_IDENTITY':
      return { ...state, identityMatched: action.matched };

    /* ---------------------------------------------------------------- */
    /* Special events — approved leave inside a lesson                  */
    /* ---------------------------------------------------------------- */
    case 'CREATE_EVENT': {
      const audit: AuditEntry = {
        auditId: nextAuditId(),
        timestamp: state.clock,
        actor: action.event.createdBy,
        action: 'EVENT_CREATED',
        recordId: action.event.eventId,
        oldValue: 'no event',
        newValue: `${action.event.reason} for ${action.event.studentIds.length} student(s)`,
        reason: action.event.notes ?? 'Approved leave filed',
      };
      return {
        ...state,
        specialEvents: [action.event, ...state.specialEvents],
        audit: [audit, ...state.audit],
        message: {
          intent: 'success',
          text: `Special event created for ${action.event.studentIds.length} student${
            action.event.studentIds.length === 1 ? '' : 's'
          }.`,
        },
      };
    }

    case 'UPDATE_EVENT': {
      const previous = state.specialEvents.find((e) => e.eventId === action.event.eventId);
      const audit: AuditEntry = {
        auditId: nextAuditId(),
        timestamp: state.clock,
        actor: action.event.createdBy,
        action: 'EVENT_UPDATED',
        recordId: action.event.eventId,
        oldValue: previous
          ? `${previous.reason} · ${previous.studentIds.length} student(s)`
          : 'unknown',
        newValue: `${action.event.reason} · ${action.event.studentIds.length} student(s)`,
        reason: 'Event edited by a teacher',
      };
      return {
        ...state,
        specialEvents: state.specialEvents.map((e) =>
          e.eventId === action.event.eventId ? action.event : e,
        ),
        audit: [audit, ...state.audit],
        message: { intent: 'success', text: `${action.event.eventId} updated.` },
      };
    }

    case 'CANCEL_EVENT': {
      const target = state.specialEvents.find((e) => e.eventId === action.eventId);
      if (!target) return state;
      const audit: AuditEntry = {
        auditId: nextAuditId(),
        timestamp: state.clock,
        actor: SESSION.teacherName,
        action: 'EVENT_CANCELLED',
        recordId: action.eventId,
        oldValue: 'scheduled',
        newValue: 'cancelled',
        reason: action.reason,
      };
      return {
        ...state,
        specialEvents: state.specialEvents.map((e) =>
          e.eventId === action.eventId ? { ...e, cancelled: true } : e,
        ),
        audit: [audit, ...state.audit],
        message: { intent: 'warning', text: `${action.eventId} cancelled.` },
      };
    }

    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

export interface RosterRow {
  student: Student;
  record: AttendanceRecord | null;
  breakMinutes: number;
  breakStatus: AttendanceRecord['breakStatus'];
}

interface Ctx {
  state: AppState;
  session: typeof SESSION;
  summary: ClassSummary;
  roster: RosterRow[];
  tap: (cardId: string) => void;
  setClock: (clock: Minutes) => void;
  clearTerminal: () => void;
  finalise: () => void;
  override: (recordId: string, status: AttendanceRecord['status'], reason: string) => void;
  confirmReview: (recordId: string) => void;
  save: () => void;
  reset: () => void;
  setIdentityMatched: (matched: boolean) => void;
  /** students the reader can be pointed at without typing a card number */
  demoCards: Student[];
  /** approved leave filed from the Special Events page */
  specialEvents: SpecialEvent[];
  createEvent: (event: SpecialEvent) => void;
  updateEvent: (event: SpecialEvent) => void;
  cancelEvent: (eventId: string, reason: string) => void;
}

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [hydrated, setHydrated] = useState(false);

  /* restore a saved register so a refresh does not lose it */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        // The station always comes back at rest, whatever it was showing.
        dispatch({
          type: 'HYDRATE',
          state: { ...initialState(), ...parsed, terminal: { kind: 'IDLE' }, lastCardId: '', message: null },
        });
      }
    } catch {
      /* a corrupt entry is not worth failing the page over */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...state, terminal: { kind: 'IDLE' } }),
        );
      } catch {
        /* storage full — the prototype does not depend on it */
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [state, hydrated]);

  const summary = useMemo(
    () => summariseClass(STUDENTS, state.records, SESSION.classId),
    [state.records],
  );

  const roster = useMemo<RosterRow[]>(
    () =>
      CLASS_ROSTER.map((student) => {
        const record =
          state.records.find(
            (r) => r.studentId === student.studentId && r.classId === SESSION.classId,
          ) ?? null;
        return {
          student,
          record,
          breakMinutes: record?.breakTotalMinutes ?? 0,
          breakStatus: record?.breakStatus ?? 'NONE',
        };
      }),
    [state.records],
  );

  const value: Ctx = {
    state,
    session: SESSION,
    summary,
    roster,
    tap: useCallback((cardId: string) => dispatch({ type: 'TAP', cardId }), []),
    setClock: useCallback((clock: Minutes) => dispatch({ type: 'SET_CLOCK', clock }), []),
    clearTerminal: useCallback(() => dispatch({ type: 'CLEAR_TERMINAL' }), []),
    finalise: useCallback(() => dispatch({ type: 'FINALISE' }), []),
    override: useCallback(
      (recordId: string, status: AttendanceRecord['status'], reason: string) =>
        dispatch({ type: 'OVERRIDE', recordId, newStatus: status, reason }),
      [],
    ),
    confirmReview: useCallback((recordId: string) => dispatch({ type: 'CONFIRM_REVIEW', recordId }), []),
    save: useCallback(() => dispatch({ type: 'SAVE' }), []),
    reset: useCallback(() => dispatch({ type: 'RESET' }), []),
    setIdentityMatched: useCallback(
      (matched: boolean) => dispatch({ type: 'SET_IDENTITY', matched }),
      [],
    ),
    demoCards: STUDENTS,
    specialEvents: state.specialEvents,
    createEvent: useCallback((event: SpecialEvent) => dispatch({ type: 'CREATE_EVENT', event }), []),
    updateEvent: useCallback((event: SpecialEvent) => dispatch({ type: 'UPDATE_EVENT', event }), []),
    cancelEvent: useCallback(
      (eventId: string, reason: string) => dispatch({ type: 'CANCEL_EVENT', eventId, reason }),
      [],
    ),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
