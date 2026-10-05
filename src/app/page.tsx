'use client';

import React from 'react';

import { useApp } from '@/lib/store/store';
import { formatTime, toMinutes } from '@/lib/time';
import { findStudentByCard } from '@/lib/engine/attendance-engine';
import type { Student, TerminalState } from '@/lib/types';
import {
  Badge,
  Body1,
  Body2,
  Button,
  Caption1,
  Checkbox,
  Divider,
  Field,
  Select,
  Subtitle2,
  Text,
  Title2,
} from '@/lib/fluent';
import { Board20Regular, Scan24Regular } from '@fluentui/react-icons';

/**
 * SCREEN 1 — STUDENT RFID READER
 * ==================================================================
 * The reader station. This is the hardware that stands at the door of B420, and
 * the screen is built around it: a physical scanner the student pushes a card
 * against, a card that can actually be dragged to it, and a large panel that
 * stays empty until something real has happened.
 *
 * The station runs a four-step physical sequence —
 *
 *   IDLE -> CARD DETECTED -> IDENTITY CAPTURE -> RESULT
 *
 * — and only the step at the end of it asks the attendance engine anything. The
 * sequence is the hardware; the decision is still `resolveScan()` in
 * `lib/engine/attendance-engine.ts`, which is what keeps the rules extractable
 * for the coursework even though the interface around them has become physical.
 */

/* ------------------------------------------------------------------ */
/* Timing and geometry                                                 */
/* ------------------------------------------------------------------ */

/** How close the card's centre must come to the scanning zone's centre, in px. */
const DETECT_RADIUS = 116;
/** "Reading RFID…" — the reader's own dwell time. */
const READ_MS = 780;
/** "Capturing image…" — the identity check. */
const CAPTURE_MS = 1000;
/** How long the result stays up before the station goes back to idle. */
const HOLD_MS = 2800;

type Phase = 'IDLE' | 'DETECTED' | 'CAPTURING' | 'RESULT';

/* ------------------------------------------------------------------ */
/* The cards that can be pushed at the reader                          */
/* ------------------------------------------------------------------ */

interface DemoCard {
  cardId: string;
  holder: string;
  studentId: string;
  note: string;
}

/**
 * Every state the station can be made to demonstrate, each reachable by choosing
 * a card and dragging it. The card ids are the real ones from the register, so
 * the reader is doing exactly what it would do at the door. The list is a short
 * cut; the rest of the register is offered underneath it.
 */
const DEMO_CARDS: DemoCard[] = [
  { cardId: '04A1B6C8', holder: 'Aisha Rahman', studentId: '10A023', note: 'not recorded yet' },
  { cardId: '04A1C1F6', holder: 'Ethan Wong', studentId: '10A044', note: 'not recorded yet' },
  { cardId: '04A1C6E3', holder: 'Ryan Tan', studentId: '10A067', note: 'already held for review' },
  { cardId: '04A1C3B9', holder: 'Mei Ling', studentId: '10A052', note: 'recorded — take a break' },
  { cardId: '04A1B8F7', holder: 'Daniel Lim', studentId: '10A031', note: 'recorded — late' },
  { cardId: '04A1C7D8', holder: 'Iqbal Rahman', studentId: '10A072', note: 'approved leave' },
  { cardId: '04B2A1F3', holder: 'Grace Teoh', studentId: '10B014', note: 'a different class' },
  { cardId: '04FFFFFF', holder: 'Unregistered card', studentId: '—', note: 'not on the register' },
];

const CURATED_CARDS = new Set(DEMO_CARDS.map((c) => c.cardId));

/** The moments worth being able to jump to while demonstrating the timings. */
const CLOCK_PRESETS = [
  { value: '07:52', label: '07:52 — before the bell' },
  { value: '08:00', label: '08:00 — the bell' },
  { value: '08:03', label: '08:03 — inside the on-time window (PRESENT)' },
  { value: '08:07', label: '08:07 — past the window (LATE, 7 min)' },
  { value: '08:20', label: '08:20 — break window open' },
  { value: '08:24', label: '08:24 — four minutes later' },
  { value: '08:28', label: '08:28 — four minutes again' },
  { value: '08:45', label: '08:45 — mid-lesson' },
  { value: '09:00', label: '09:00 — the end of the lesson' },
];

/* ------------------------------------------------------------------ */
/* What the device shows                                               */
/* ------------------------------------------------------------------ */

type Tone = 'idle' | 'accent' | 'success' | 'caution' | 'critical' | 'attention';

interface Display {
  tone: Tone;
  headline: string;
  sub: string;
  /** the two or three figures the result is made of */
  lines: { label: string; value: string }[];
  note: string;
}

function fromTerminal(terminal: TerminalState, room: string): Display {
  switch (terminal.kind) {
    case 'PRESENT':
      return {
        tone: 'success',
        headline: 'Attendance recorded',
        sub: terminal.student.name,
        lines: [
          { label: 'Status', value: 'PRESENT' },
          { label: 'Time', value: formatTime(terminal.time) },
          { label: 'Room', value: room },
        ],
        note: 'In the room at or before the start of the lesson.',
      };

    case 'LATE':
      return {
        tone: 'caution',
        headline: 'Attendance recorded',
        sub: terminal.student.name,
        lines: [
          { label: 'Status', value: 'LATE' },
          { label: 'Time', value: formatTime(terminal.time) },
          { label: 'Late by', value: `${terminal.lateMinutes} min` },
        ],
        note: 'Arrived after the on-time window, so the minutes late have been calculated and added.',
      };

    case 'DUPLICATE':
      return {
        tone: 'caution',
        headline: 'Duplicate tap',
        sub: 'Ignored',
        lines: [
          { label: 'Student', value: terminal.student.name },
          { label: 'First recorded', value: formatTime(terminal.entryTime) },
        ],
        note: 'Attendance for this lesson is already recorded, so this tap was not counted again.',
      };

    case 'INVALID_CARD':
      return {
        tone: 'critical',
        headline: 'Card not recognised',
        sub: 'Not on the register',
        lines: [{ label: 'Card read', value: terminal.cardId }],
        note: 'No student matches this card number, so no attendance record has been created.',
      };

    case 'NOT_IN_CLASS':
      return {
        tone: 'critical',
        headline: 'Not enrolled in this class',
        sub: terminal.student.name,
        lines: [
          { label: 'Status', value: 'NOT IN CLASS' },
          { label: 'Registered to', value: terminal.student.classId.replace('-CS', '') },
        ],
        note: 'The card is valid, but this student is not expected in this room for this lesson.',
      };

    case 'BREAK_START':
      return {
        tone: 'accent',
        headline: 'Class break started',
        sub: terminal.student.name,
        lines: [
          { label: 'Status', value: 'ON BREAK' },
          { label: 'Started', value: formatTime(terminal.time) },
        ],
        note: 'Tap again on the way back in and the length of the break is worked out automatically.',
      };

    case 'BREAK_END':
      return {
        tone: 'success',
        headline: 'Welcome back',
        sub: terminal.student.name,
        lines: [
          { label: 'Status', value: 'PRESENT' },
          { label: 'Returned', value: formatTime(terminal.time) },
          { label: 'Break', value: `${terminal.breakMinutes} min` },
        ],
        note: 'The break has been added to the running total for this lesson.',
      };

    case 'APPROVED_LEAVE':
      return {
        tone: 'attention',
        headline: 'Approved leave confirmed',
        sub: terminal.student.name,
        lines: [
          { label: 'Status', value: 'APPROVED LEAVE' },
          // An event on the Special Events page names its own reason, and the
          // reader shows it so the student can see why they were not recorded.
          ...(terminal.reason ? [{ label: 'Reason', value: terminal.reason }] : []),
          { label: 'Attendance', value: 'Not required' },
        ],
        note: terminal.reason
          ? `Excused for this lesson — ${terminal.reason}. No attendance has been recorded.`
          : 'Approved leave today, so no attendance is expected and none has been recorded.',
      };

    default:
      return { tone: 'idle', headline: 'Ready', sub: '', lines: [], note: '' };
  }
}

function display(phase: Phase, terminal: TerminalState, room: string): Display {
  if (phase === 'DETECTED') {
    return {
      tone: 'accent',
      headline: 'Card detected',
      sub: 'Reading RFID…',
      lines: [],
      note: 'The reader has the card. Keep it against the scanner while the identity check runs.',
    };
  }
  if (phase === 'CAPTURING') {
    return {
      tone: 'attention',
      headline: 'Identity verification',
      sub: 'Capturing image…',
      lines: [],
      note: 'RFID has identified the card; the camera is now confirming the student holding it.',
    };
  }
  if (phase === 'RESULT') return fromTerminal(terminal, room);
  return {
    tone: 'idle',
    headline: 'Ready',
    sub: '',
    lines: [],
    note: '',
  };
}

/* ------------------------------------------------------------------ */
/* Hardware feedback                                                   */
/* ------------------------------------------------------------------ */

type Lamp = 'off' | 'green' | 'blue' | 'amber' | 'red' | 'white';

function lamps(phase: Phase, terminal: TerminalState): { rfid: Lamp; camera: Lamp } {
  switch (phase) {
    case 'DETECTED':
      return { rfid: 'blue', camera: 'off' };
    case 'CAPTURING':
      return { rfid: 'blue', camera: 'white' };
    case 'RESULT':
      switch (terminal.kind) {
        case 'PRESENT':
        case 'LATE':
        case 'BREAK_END':
          return { rfid: 'green', camera: 'off' };
        case 'DUPLICATE':
          return { rfid: 'amber', camera: 'off' };
        case 'BREAK_START':
        case 'APPROVED_LEAVE':
          return { rfid: 'blue', camera: 'off' };
        case 'INVALID_CARD':
        case 'NOT_IN_CLASS':
          return { rfid: 'red', camera: 'off' };
        default:
          return { rfid: 'off', camera: 'off' };
      }
    default:
      return { rfid: 'off', camera: 'off' };
  }
}

/* ------------------------------------------------------------------ */
/* The state catalogue in the right-hand panel                         */
/* ------------------------------------------------------------------ */

const STATE_PREVIEW: { label: string; detail: string; rfid: Lamp; camera: Lamp }[] = [
  { label: 'Attendance recorded — PRESENT', detail: 'inside the on-time window', rfid: 'green', camera: 'off' },
  { label: 'Attendance recorded — LATE', detail: 'minutes calculated from the bell', rfid: 'green', camera: 'off' },
  { label: 'Card not recognised', detail: 'no record created', rfid: 'red', camera: 'off' },
  { label: 'Duplicate tap detected', detail: 'ignored, first tap kept', rfid: 'amber', camera: 'off' },
  { label: 'Class break started', detail: 'return tap expected', rfid: 'blue', camera: 'off' },
  { label: 'Welcome back — break end', detail: 'break duration added up', rfid: 'green', camera: 'off' },
  { label: 'Approved leave confirmed', detail: 'no attendance required', rfid: 'blue', camera: 'off' },
];

/* ------------------------------------------------------------------ */

export default function ReaderStationPage() {
  const { state, session, tap, setClock, clearTerminal, reset, setIdentityMatched, demoCards } =
    useApp();

  const [phase, setPhase] = React.useState<Phase>('IDLE');
  const [selectedCard, setSelectedCard] = React.useState(DEMO_CARDS[0].cardId);
  const [identityOk, setIdentityOk] = React.useState(state.identityMatched);
  const [dragging, setDragging] = React.useState(false);

  const arenaRef = React.useRef<HTMLDivElement>(null);
  const zoneRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const posRef = React.useRef({ x: 28, y: 300 });
  const grabRef = React.useRef({ x: 0, y: 0 });
  const phaseRef = React.useRef<Phase>('IDLE');
  phaseRef.current = phase;

  const curated = DEMO_CARDS.find((c) => c.cardId === selectedCard);
  const holder = findStudentByCard(demoCards, selectedCard) as Student | null;
  /** What the card in hand actually says. A card from the rest of the register
   *  carries its own holder; only the unregistered one has no student behind it. */
  const card: DemoCard = {
    cardId: selectedCard,
    holder: holder?.name ?? curated?.holder ?? 'Unknown card',
    studentId: holder?.studentId ?? curated?.studentId ?? '—',
    note: curated?.note ?? (holder ? `registered to ${holder.classId.replace('-CS', '')}` : 'not on the register'),
  };
  /** The rest of the register, so any student's card can be pushed at the reader. */
  const otherCards = demoCards.filter((s) => !CURATED_CARDS.has(s.rfidCardId));

  /* ---- positioning ------------------------------------------------- */
  /**
   * Move the card.
   *
   * `glide` is false while the student is dragging and true when the station
   * moves the card itself. That distinction is load-bearing rather than
   * cosmetic: with a transform transition running, `getBoundingClientRect()`
   * reports where the card is *on its way to*, not where the pointer has put
   * it, and the proximity test would then be reading a position the card has
   * already left.
   */
  const place = React.useCallback((x: number, y: number, glide = false) => {
    posRef.current = { x, y };
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = glide
      ? 'transform 0.34s cubic-bezier(0.1, 0.9, 0.2, 1), box-shadow 0.18s ease'
      : 'box-shadow 0.18s ease';
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  /** Resting place: bottom-left of the arena, clear of the scanner. */
  const goHome = React.useCallback(() => {
    const arena = arenaRef.current;
    const el = cardRef.current;
    if (!arena || !el) return;
    const a = arena.getBoundingClientRect();
    const c = el.getBoundingClientRect();
    // 26px rather than 10: the card's own "drag to the reader" caption hangs
    // below it, and the arena clips whatever falls outside.
    place(28, Math.max(8, a.height - c.height - 26), true);
  }, [place]);

  /**
   * Where a card ends up once it has been presented: leant against the scanning
   * zone with its top edge just above it, so the card covers the reader's scan
   * area — which is what a card on a reader does — without covering the display
   * or the three indicators above it.
   */
  const dockCard = React.useCallback(() => {
    const arena = arenaRef.current;
    const zone = zoneRef.current;
    const el = cardRef.current;
    if (!arena || !zone || !el) return;
    const a = arena.getBoundingClientRect();
    const z = zone.getBoundingClientRect();
    const c = el.getBoundingClientRect();
    place(z.left - a.left + z.width / 2 - c.width / 2, z.top - a.top - 14, true);
  }, [place]);

  React.useEffect(() => {
    goHome();
    const onResize = () => {
      if (phaseRef.current === 'IDLE' && !dragging) goHome();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [goHome, dragging]);

  /* Reset the card when a different one is chosen from the picker. */
  React.useEffect(() => {
    if (phase === 'IDLE' && !dragging) goHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCard]);

  /* ---- proximity --------------------------------------------------- */
  const insideZone = React.useCallback(() => {
    const c = cardRef.current;
    const z = zoneRef.current;
    if (!c || !z) return false;
    const cb = c.getBoundingClientRect();
    const zb = z.getBoundingClientRect();
    const dx = cb.left + cb.width / 2 - (zb.left + zb.width / 2);
    const dy = cb.top + cb.height / 2 - (zb.top + zb.height / 2);
    return Math.hypot(dx, dy) < DETECT_RADIUS;
  }, []);

  /* ---- the sequence ------------------------------------------------ */
  const beginScan = React.useCallback(() => {
    setPhase((p) => (p === 'IDLE' ? 'DETECTED' : p));
  }, []);

  const abandonScan = React.useCallback(() => {
    setPhase((p) => (p === 'DETECTED' ? 'IDLE' : p));
  }, []);

  /* Step 1 -> 2: the reader has the card. An unknown card never reaches the
     camera, because there is nobody to photograph. */
  React.useEffect(() => {
    if (phase !== 'DETECTED') return;
    const known = findStudentByCard(demoCards, selectedCard) !== null;
    const id = window.setTimeout(() => {
      if (known) {
        setPhase('CAPTURING');
      } else {
        tap(selectedCard);
        setPhase('RESULT');
      }
    }, READ_MS);
    return () => window.clearTimeout(id);
  }, [phase, selectedCard, demoCards, tap]);

  /* Step 2 -> 3: the camera has the image. Only now does the attendance
     engine get asked what the tap means. */
  React.useEffect(() => {
    if (phase !== 'CAPTURING') return;
    const id = window.setTimeout(() => {
      tap(selectedCard);
      setPhase('RESULT');
    }, CAPTURE_MS);
    return () => window.clearTimeout(id);
  }, [phase, selectedCard, tap]);

  /* Step 3 -> idle: the station clears itself for the next student. */
  React.useEffect(() => {
    if (phase !== 'RESULT') return;
    const id = window.setTimeout(() => {
      setPhase('IDLE');
      clearTerminal();
      goHome();
    }, HOLD_MS);
    return () => window.clearTimeout(id);
  }, [phase, clearTerminal, goHome]);

  /* ---- pointer dragging -------------------------------------------- */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phase === 'CAPTURING') return;
    const el = cardRef.current;
    const arena = arenaRef.current;
    if (!el || !arena) return;
    el.setPointerCapture(e.pointerId);
    const ab = arena.getBoundingClientRect();
    grabRef.current = {
      x: e.clientX - ab.left - posRef.current.x,
      y: e.clientY - ab.top - posRef.current.y,
    };
    setDragging(true);
    // Picking the card up abandons a read that has not finished.
    abandonScan();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const arena = arenaRef.current;
    if (!arena) return;
    const ab = arena.getBoundingClientRect();
    place(e.clientX - ab.left - grabRef.current.x, e.clientY - ab.top - grabRef.current.y);
    if (phaseRef.current === 'IDLE' && insideZone()) {
      beginScan();
    } else if (phaseRef.current === 'DETECTED' && !insideZone()) {
      abandonScan();
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    setDragging(false);
    if (insideZone()) {
      dockCard();
      if (phaseRef.current === 'IDLE') beginScan();
    } else if (phaseRef.current === 'IDLE') {
      goHome();
    }
  };

  /* Keyboard path: focus the card and press Enter, and the card is placed on
     the reader for anyone who cannot drag it. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (phase !== 'IDLE') return;
    dockCard();
    beginScan();
  };

  React.useEffect(() => setIdentityOk(state.identityMatched), [state.identityMatched]);

  /* ---- render ------------------------------------------------------ */
  const view = display(phase, state.terminal, session.room);
  const lamp = lamps(phase, state.terminal);
  const cameraOn = lamp.camera !== 'off';
  const currentClock = formatTime(state.clock);
  const clockOptions = [
    { value: currentClock, label: `${currentClock} — current reading` },
    ...CLOCK_PRESETS.filter((p) => p.value !== currentClock),
  ];

  return (
    <div className="ncas-kiosk">
      {/* ---- station header ------------------------------------------ */}
      <header className="ncas-header">
        <div className="ncas-header__titles">
          <div className="ncas-row" style={{ gap: 12 }}>
            <span className="ncas-brand__mark" aria-hidden>
              nC
            </span>
            <div>
              <Title2 as="h1" style={{ margin: 0 }}>
                n-CAS
              </Title2>
              <Caption1 className="ncas-muted">Student Classroom Attendance System</Caption1>
            </div>
          </div>
        </div>
        <div className="ncas-header__actions">
          {/* The station itself is a kiosk with no navigation — a student must
              not be able to wander out of it. Staff need one way in to the rest
              of the application, and this is it. */}
          <Button
            appearance="secondary"
            icon={<Board20Regular />}
            as="a"
            href="/dashboard"
          >
            Teacher workspace
          </Button>
          <div className="ncas-field" style={{ alignItems: 'flex-end' }}>
            <span className="ncas-field__label">Reader T-01</span>
            <span className="ncas-field__value">
              {session.room} · {session.subject}
            </span>
          </div>
          <span className="ncas-live" aria-label="Reader online">
            <span className="ncas-live__dot" aria-hidden />
            Reader online
          </span>
        </div>
      </header>

      <div className="ncas-kiosk__body">
        {/* ---- the hardware and the result --------------------------- */}
        <div className="ncas-stack">
          <div className="ncas-arena" ref={arenaRef}>
            {/* The device ------------------------------------------- */}
            <div className="ncas-device" data-phase={phase} data-tone={view.tone}>
              <div className="ncas-device__top">
                <div className="ncas-device__camera" data-on={cameraOn}>
                  <span className="ncas-device__lens" aria-hidden />
                  <span className="ncas-device__camera-led" aria-hidden />
                  <span className="ncas-device__camera-ring" aria-hidden />
                </div>
                <span className="ncas-device__sku">MODEL NC-1</span>
              </div>

              {/* display */}
              <div className="ncas-device__display" data-tone={view.tone} aria-live="polite">
                <span className="ncas-device__display-head">{view.headline}</span>
                {view.sub ? (
                  <span className="ncas-device__display-student">{view.sub}</span>
                ) : (
                  <span className="ncas-device__display-hint">Waiting for a card</span>
                )}
              </div>

              {/* the three hardware indicators — kept above the scanning zone,
                  because a card held on the reader would cover anything below it */}
              <div className="ncas-device__leds">
                <span className="ncas-led2" data-lamp="green">
                  <span className="ncas-led2__lamp" aria-hidden />
                  Power
                </span>
                <span className="ncas-led2" data-lamp={lamp.rfid}>
                  <span className="ncas-led2__lamp" aria-hidden />
                  RFID
                </span>
                <span className="ncas-led2" data-lamp={lamp.camera}>
                  <span className="ncas-led2__lamp" aria-hidden />
                  Camera
                </span>
              </div>

              {/* the RFID scanning zone */}
              <div className="ncas-zone" ref={zoneRef} data-active={phase !== 'IDLE'}>
                <span className="ncas-zone__wave ncas-zone__wave--a" aria-hidden />
                <span className="ncas-zone__wave ncas-zone__wave--b" aria-hidden />
                <span className="ncas-zone__wave ncas-zone__wave--c" aria-hidden />
                <Scan24Regular className="ncas-zone__glyph" />
                <span className="ncas-zone__caption">RFID scanning zone</span>
              </div>

              {/* speaker / buzzer */}
              <div className="ncas-device__grille" aria-hidden />

              {/* branding */}
              <div className="ncas-device__brand">
                <span className="ncas-device__brand-name">n-CAS</span>
                <span className="ncas-device__brand-sub">RFID / IDENTITY READER</span>
              </div>
            </div>

              {/* The student card ------------------------------------- */}
              <div
                ref={cardRef}
                className="ncas-scard"
                data-dragging={dragging}
                data-near={phase === 'DETECTED' || phase === 'CAPTURING'}
                role="button"
                tabIndex={0}
                aria-label={`Student card for ${card.holder}, ${card.studentId}. Drag it to the reader or press Enter to place it.`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onKeyDown={onKeyDown}
              >
                <span className="ncas-scard__band" aria-hidden />

                <div className="ncas-scard__head">
                  <span className="ncas-scard__mark" aria-hidden>
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path
                        d="M12 3C7 6 3.5 9.5 3.5 14.5A8.5 8.5 0 0 0 12 23a8.5 8.5 0 0 0 8.5-8.5C20.5 9.5 17 6 12 3Z"
                        fill="#c8202e"
                      />
                      <path
                        d="M12 6.5c-3.4 2-5.8 4.4-5.8 8a5.8 5.8 0 0 0 5.8 5.8 5.8 5.8 0 0 0 5.8-5.8c0-3.6-2.4-6-5.8-8Z"
                        fill="#ef7d1e"
                        opacity="0.92"
                      />
                      <path
                        d="M12 9.5c-2.2 1.4-3.6 2.9-3.6 5a3.6 3.6 0 0 0 3.6 3.6 3.6 3.6 0 0 0 3.6-3.6c0-2.1-1.4-3.6-3.6-5Z"
                        fill="#f3c433"
                      />
                    </svg>
                  </span>

                  <span className="ncas-scard__schoolblock">
                    <span className="ncas-scard__school">Taylor&rsquo;s</span>
                    <span className="ncas-scard__school2">International School</span>
                    <span className="ncas-scard__city">Kuala Lumpur</span>
                  </span>

                  <span className="ncas-scard__kind">Student</span>
                </div>

                <div className="ncas-scard__photo" aria-hidden>
                  <span className="ncas-scard__initials">
                    {card.holder
                      .split(' ')
                      .slice(0, 2)
                      .map((p) => p[0]?.toUpperCase() ?? '')
                      .join('')}
                  </span>
                </div>

                <div className="ncas-scard__identity">
                  <span className="ncas-scard__id">{card.studentId}</span>
                  <span className="ncas-scard__name">{card.holder}</span>
                  <span className="ncas-scard__parent">{holder?.parentId ?? '—'}</span>
                </div>

                <span className="ncas-scard__grab" aria-hidden>
                  drag to the reader
                </span>
              </div>
          </div>

          {/* ---- the result panel ------------------------------------ */}
          <section
            className={`ncas-result ncas-result--${view.tone === 'idle' ? 'accent' : view.tone}`}
            aria-live="polite"
          >
            {phase === 'IDLE' ? (
              <>
                <span className="ncas-result__headline">Ready for card</span>
                <Body2>Tap or drag a student card to the reader.</Body2>
                <Caption1 className="ncas-muted">
                  Nothing is recorded until the reader has read the card and the camera has confirmed
                  the student holding it.
                </Caption1>
              </>
            ) : (
              <>
                <span className="ncas-result__headline">{view.headline}</span>
                {view.sub ? <span className="ncas-result__name">{view.sub}</span> : null}
                <div className="ncas-row" style={{ gap: 16, flexWrap: 'wrap' }}>
                  {view.lines.map((line) => (
                    <span key={line.label} className="ncas-row" style={{ gap: 6 }}>
                      <Caption1 className="ncas-muted">{line.label}</Caption1>
                      <Body2 className="ncas-tabular" style={{ fontWeight: 600 }}>
                        {line.value}
                      </Body2>
                    </span>
                  ))}
                </div>
                {view.note ? <Caption1 className="ncas-muted">{view.note}</Caption1> : null}
              </>
            )}
          </section>
        </div>

        {/* ---- right column ------------------------------------------ */}
        <aside className="ncas-stack">
          {/* state catalogue (requirement: reader state preview) */}
          <div className="ncas-panel">
            <div className="ncas-panel__head">
              <div>
                <Subtitle2 as="h2" style={{ margin: 0 }}>
                  Reader state preview
                </Subtitle2>
                <Caption1 className="ncas-muted">
                  The states this station can be made to show
                </Caption1>
              </div>
            </div>
            <div className="ncas-panel__body ncas-stack" style={{ gap: 8 }}>
              <Caption1 className="ncas-muted">Lamps: power · RFID · camera</Caption1>
              {STATE_PREVIEW.map((s) => (
                <div key={s.label} className="ncas-preview" title={s.detail}>
                  <span className="ncas-preview__lamps" aria-hidden>
                    <i className="ncas-led2__lamp" data-lamp="green" />
                    <i className="ncas-led2__lamp" data-lamp={s.rfid} />
                    <i className="ncas-led2__lamp" data-lamp={s.camera} />
                  </span>
                  <Body2 style={{ fontWeight: 600 }}>{s.label}</Body2>
                </div>
              ))}
              <Caption1 className="ncas-muted">
                States of the system, not attendance records — none of them has happened until a card
                is actually read.
              </Caption1>
            </div>
          </div>

          {/* demonstration controls */}
          <div className="ncas-panel">
            <div className="ncas-panel__head">
              <Subtitle2 as="h2" style={{ margin: 0 }}>
                Reader setup
              </Subtitle2>
              <Badge appearance="tint" color="informative">
                Demonstration
              </Badge>
            </div>
            <div className="ncas-panel__body ncas-stack">
              <Field label="Card in hand">
                <Select value={selectedCard} onChange={(_, data) => setSelectedCard(data.value)}>
                  <optgroup label="Demonstration cards">
                    {DEMO_CARDS.map((c) => (
                      <option key={c.cardId} value={c.cardId}>
                        {c.holder} · {c.studentId} — {c.note}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Rest of the register">
                    {otherCards.map((s) => (
                      <option key={s.rfidCardId} value={s.rfidCardId}>
                        {s.name} · {s.studentId} — {s.classId.replace('-CS', '')}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </Field>

              <Field
                label="Lesson clock"
                hint={`On time to ${formatTime(session.startTime + session.onTimeWindowMinutes)}.`}
              >
                <Select
                  value={currentClock}
                  onChange={(_, data) => {
                    // Guarded: a value the option list does not contain would
                    // otherwise set the lesson clock to NaN.
                    const minutes = toMinutes(data.value);
                    if (Number.isFinite(minutes)) setClock(minutes);
                  }}
                >
                  {clockOptions.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Checkbox
                checked={!identityOk}
                label="Make the camera check inconclusive"
                onChange={(_, data) => {
                  const ok = !data.checked;
                  setIdentityOk(ok);
                  setIdentityMatched(ok);
                }}
              />

              <Divider />

              <div className="ncas-row ncas-row--between">
                <Text weight="semibold">{holder ? holder.name : 'Unregistered card'}</Text>
                <Button appearance="subtle" size="small" onClick={reset}>
                  Reset for next class
                </Button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
