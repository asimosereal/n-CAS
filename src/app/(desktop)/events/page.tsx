'use client';

import React from 'react';

import { useApp } from '@/lib/store/store';
import { formatTime, toMinutes } from '@/lib/time';
import {
  emptyDraft,
  eventReasonLabel,
  eventStatus,
  eventWindow,
  describeEventStudents,
  validateEventDraft,
} from '@/lib/engine/events-engine';
import { EVENT_REASONS, type EventReason, type EventStatus, type SpecialEvent } from '@/lib/types';
import {
  Badge,
  Body1,
  Body2,
  Button,
  Caption1,
  Checkbox,
  Combobox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Field,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  SearchBox,
  Subtitle2,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Textarea,
} from '@/lib/fluent';
import {
  Add20Regular,
  CheckmarkCircle20Regular,
  Dismiss20Regular,
  Edit20Regular,
  MoreHorizontal20Regular,
  PeopleTeam20Regular,
  Warning20Regular,
} from '@fluentui/react-icons';
import { HeaderField, LiveIndicator, PageHeader } from '@/components/PageHeader';
import { DateField, TimeField, formatLongDate, formatTableDate } from '@/components/DateTimeFields';

/**
 * SPECIAL EVENTS
 * ==================================================================
 * Approved student events and temporary lesson leave.
 *
 * An event is not a calendar entry: it is an instruction to the attendance
 * system. While its window is open the reader refuses to record the students it
 * names — it shows "Approved leave confirmed" instead — and a student excused
 * for any part of a lesson is not marked absent when that lesson ends. Both of
 * those live in `lib/engine/events-engine.ts`, and both are stated on the form
 * itself so the connection is never a guess.
 *
 * The page is laid out so the whole form is on screen at once: the form runs
 * across the width in two columns, and the register it affects sits underneath.
 */

const STATUS_TONE: Record<EventStatus, 'informative' | 'success' | 'subtle' | 'danger'> = {
  SCHEDULED: 'informative',
  ACTIVE: 'success',
  COMPLETED: 'subtle',
  CANCELLED: 'danger',
};

const STATUS_LABEL: Record<EventStatus, string> = {
  SCHEDULED: 'Scheduled',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export default function SpecialEventsPage() {
  const { state, session, specialEvents, createEvent, updateEvent, cancelEvent, demoCards } = useApp();

  /* ---- the form ---------------------------------------------------- */
  const [studentIds, setStudentIds] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState('');
  const [date, setDate] = React.useState(session.date);
  const [start, setStart] = React.useState('10:15');
  const [end, setEnd] = React.useState('10:30');
  const [reason, setReason] = React.useState('');
  const [otherReason, setOtherReason] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const [problems, setProblems] = React.useState<string[]>([]);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = React.useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = React.useState<SpecialEvent | null>(null);
  const [cancelReason, setCancelReason] = React.useState('');

  const roster = demoCards.filter((s) => s.classId === session.classId);
  const filter = query.trim().toLowerCase();
  const visible = filter
    ? roster.filter(
        (s) =>
          s.name.toLowerCase().includes(filter) || s.studentId.toLowerCase().includes(filter),
      )
    : roster;

  const selectedEvent = specialEvents.find((e) => e.eventId === selectedEventId) ?? null;

  /* ---- the form's operations --------------------------------------- */
  const resetForm = () => {
    const draft = emptyDraft(session.date);
    setStudentIds(draft.studentIds);
    setDate(draft.date);
    setStart('10:15');
    setEnd('10:30');
    setReason('');
    setOtherReason('');
    setNotes('');
    setEditingId(null);
    setProblems([]);
    setQuery('');
  };

  const loadForEdit = (event: SpecialEvent) => {
    setStudentIds([...event.studentIds]);
    setDate(event.date);
    setStart(formatTime(event.startTime));
    setEnd(formatTime(event.endTime));
    setReason(event.reason);
    setOtherReason(event.otherReason ?? '');
    setNotes(event.notes ?? '');
    setEditingId(event.eventId);
    setProblems([]);
    setFeedback(null);
  };

  const submit = () => {
    const draft = {
      studentIds,
      date,
      startTime: start ? toMinutes(start) : null,
      endTime: end ? toMinutes(end) : null,
      reason,
      otherReason,
      notes,
    };

    const found = validateEventDraft(draft);
    setProblems(found);
    if (found.length > 0) {
      setFeedback(null);
      return;
    }

    const event: SpecialEvent = {
      eventId: editingId ?? `EVT-${String(specialEvents.length + 1).padStart(4, '0')}`,
      studentIds,
      date,
      startTime: toMinutes(start),
      endTime: toMinutes(end),
      reason: reason as EventReason,
      otherReason: reason === 'Other' ? otherReason.trim() : null,
      notes: notes.trim() || null,
      createdBy: session.teacherName,
      cancelled: false,
    };

    if (editingId) {
      updateEvent(event);
      setFeedback(`${event.eventId} updated.`);
      setSelectedEventId(event.eventId);
    } else {
      createEvent(event);
      setFeedback(
        `Special event created for ${studentIds.length} student${
          studentIds.length === 1 ? '' : 's'
        }.`,
      );
      setSelectedEventId(event.eventId);
    }
    resetForm();
  };

  const confirmCancel = () => {
    if (!pendingCancel) return;
    cancelEvent(pendingCancel.eventId, cancelReason.trim() || 'Cancelled by a teacher');
    setFeedback(`${pendingCancel.eventId} cancelled — those students are no longer excused.`);
    setPendingCancel(null);
    setCancelReason('');
  };

  const toggleStudent = (studentId: string, checked: boolean) => {
    setStudentIds((prev) =>
      checked ? [...prev, studentId] : prev.filter((id) => id !== studentId),
    );
  };

  /* ---- table ordering: soonest first, cancelled last --------------- */
  const ordered = React.useMemo(() => {
    const rank = (e: SpecialEvent) => {
      const status = eventStatus(e, state.clock, session.date);
      return status === 'CANCELLED' ? 3 : status === 'ACTIVE' ? 0 : status === 'SCHEDULED' ? 1 : 2;
    };
    return [...specialEvents].sort((a, b) => rank(a) - rank(b) || a.startTime - b.startTime);
  }, [specialEvents, state.clock, session.date]);

  const draftValid =
    studentIds.length > 0 && date !== '' && start !== '' && end !== '' && reason !== '';

  return (
    <>
      <PageHeader
        title="Special Events"
        subtitle="Manage approved student events and temporary lesson leave."
        meta={
          <>
            <HeaderField label="Current class" value={session.className} />
            <HeaderField label="Current date" value={formatLongDate(session.date)} />
            <HeaderField label="Current time" value={formatTime(state.clock)} />
            <LiveIndicator>
              {ordered.filter((e) => eventStatus(e, state.clock, session.date) === 'ACTIVE').length}{' '}
              running now
            </LiveIndicator>
          </>
        }
        actions={
          <Button appearance="primary" icon={<Add20Regular />} onClick={resetForm}>
            New event
          </Button>
        }
      />

      <div className="ncas-body ncas-stack">
        {feedback ? (
          <MessageBar intent="success">
            <MessageBarBody>
              <MessageBarTitle>{feedback}</MessageBarTitle>
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {problems.length > 0 ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>
                {problems.length === 1
                  ? 'The event cannot be created yet'
                  : `${problems.length} things need attention`}
              </MessageBarTitle>
              <ul className="ncas-problems">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {/* ---- create / edit ---------------------------------------- */}
        <section className="ncas-panel" aria-label="Create special event">
          <div className="ncas-panel__head">
            <div>
              <Subtitle2 as="h2" style={{ margin: 0 }}>
                {editingId ? `Edit ${editingId}` : 'Create Special Event'}
              </Subtitle2>
              <Caption1 className="ncas-muted">
                {editingId
                  ? 'Changing an event changes what the register honours'
                  : 'Approved leave for one or more students — one event covers the whole group'}
              </Caption1>
            </div>
            {editingId ? (
              <Button appearance="subtle" size="small" onClick={resetForm}>
                Stop editing
              </Button>
            ) : null}
          </div>

          <div className="ncas-panel__body">
            <div className="ncas-form">
              {/* left: who */}
              <div className="ncas-stack">
                <Field label="Students" required>
                  <SearchBox
                    value={query}
                    onChange={(_, data) => setQuery(data.value)}
                    placeholder="Search by name or student ID"
                  />
                </Field>

                <div className="ncas-picker" role="group" aria-label="Students">
                  {visible.length === 0 ? (
                    <Caption1 className="ncas-muted">No student matches that search.</Caption1>
                  ) : (
                    visible.map((student) => (
                      <Checkbox
                        key={student.studentId}
                        checked={studentIds.includes(student.studentId)}
                        label={`${student.name} — ${student.studentId}`}
                        onChange={(_, data) =>
                          toggleStudent(student.studentId, Boolean(data.checked))
                        }
                      />
                    ))
                  )}
                </div>

                <div className="ncas-row ncas-row--between">
                  <Text weight="semibold" className="ncas-tabular">
                    {studentIds.length} student{studentIds.length === 1 ? '' : 's'} selected
                  </Text>
                  <Button
                    appearance="subtle"
                    size="small"
                    disabled={studentIds.length === 0}
                    onClick={() => setStudentIds([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {/* right: when, why, and what it does */}
              <div className="ncas-stack">
                <div className="ncas-grid-3">
                  <DateField label="Date" value={date} onChange={setDate} />
                  <TimeField label="Start time" value={start} onChange={setStart} />
                  <TimeField label="End time" value={end} onChange={setEnd} />
                </div>

                <Field label="Reason" required hint="Recorded against every student in the event.">
                  <Combobox
                    value={reason}
                    selectedOptions={reason ? [reason] : []}
                    placeholder="Choose a reason"
                    onOptionSelect={(_, data) => {
                      const next = data.optionValue ?? '';
                      setReason(next);
                      if (next !== 'Other') setOtherReason('');
                    }}
                  >
                    {EVENT_REASONS.map((r) => (
                      <Option key={r} value={r}>
                        {r}
                      </Option>
                    ))}
                  </Combobox>
                </Field>

                {reason === 'Other' ? (
                  <Field label="Describe the reason" required>
                    <Textarea
                      value={otherReason}
                      onChange={(_, data) => setOtherReason(data.value)}
                      placeholder="What is the event, in a few words?"
                      resize="vertical"
                      rows={1}
                    />
                  </Field>
                ) : null}

                <Field
                  label="Additional notes"
                  hint="Optional. Kept out of the way because most events do not need one."
                >
                  <Textarea
                    value={notes}
                    onChange={(_, data) => setNotes(data.value)}
                    placeholder="Anything the office should know"
                    resize="vertical"
                    rows={1}
                  />
                </Field>

                <div className="ncas-row">
                  <Button appearance="primary" icon={<CheckmarkCircle20Regular />} onClick={submit}>
                    {editingId ? 'Save changes' : 'Create Event'}
                  </Button>
                  <Button appearance="secondary" icon={<Dismiss20Regular />} onClick={resetForm}>
                    Cancel
                  </Button>
                </div>

                <MessageBar intent={draftValid ? 'info' : 'warning'}>
                  <MessageBarBody>
                    {draftValid ? (
                      <>
                        {studentIds.length} student{studentIds.length === 1 ? '' : 's'} excused from{' '}
                        {start} to {end} — the reader will not record them, and they will not be
                        marked absent.
                      </>
                    ) : (
                      <>
                        Fill in the students, the date, both times and a reason. Cancelling later
                        removes both effects at once.
                      </>
                    )}
                  </MessageBarBody>
                </MessageBar>
              </div>
            </div>
          </div>
        </section>

        {/* ---- what the register is currently honouring --------------- */}
        <div className="ncas-columns ncas-columns--events">
          <section className="ncas-panel" aria-label="Scheduled events">
            <div className="ncas-panel__head">
              <div>
                <Subtitle2 as="h2" style={{ margin: 0 }}>
                  Scheduled Events
                </Subtitle2>
                <Caption1 className="ncas-muted">
                  Approved leave the attendance system is currently honouring
                </Caption1>
              </div>
              <Badge appearance="tint" color="informative">
                {specialEvents.length}
              </Badge>
            </div>

            <div className="ncas-table-wrap" style={{ maxHeight: 300 }}>
              <Table
                size="small"
                className="ncas-table--events"
                style={{ tableLayout: 'fixed' }}
                aria-label="Scheduled events"
              >
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Student(s)</TableHeaderCell>
                    <TableHeaderCell style={{ width: 86 }}>Date</TableHeaderCell>
                    <TableHeaderCell style={{ width: 54 }}>Start</TableHeaderCell>
                    <TableHeaderCell style={{ width: 54 }}>End</TableHeaderCell>
                    <TableHeaderCell style={{ width: 126 }}>Reason</TableHeaderCell>
                    <TableHeaderCell style={{ width: 90 }}>Status</TableHeaderCell>
                    <TableHeaderCell style={{ width: 56 }}>Actions</TableHeaderCell>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {ordered.map((event) => {
                    const status = eventStatus(event, state.clock, session.date);
                    const who = describeEventStudents(event, roster);
                    return (
                      <TableRow
                        key={event.eventId}
                        data-selected={event.eventId === selectedEventId}
                        style={
                          status === 'ACTIVE'
                            ? { boxShadow: 'inset 3px 0 0 0 var(--winui-system-fill-success)' }
                            : undefined
                        }
                      >
                        <TableCell>
                          <button
                            type="button"
                            className="ncas-linkish"
                            onClick={() => setSelectedEventId(event.eventId)}
                          >
                            {who.label}
                          </button>
                        </TableCell>
                        <TableCell>
                          <span className="ncas-num">{formatTableDate(event.date)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="ncas-num">{formatTime(event.startTime)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="ncas-num">{formatTime(event.endTime)}</span>
                        </TableCell>
                        <TableCell>{eventReasonLabel(event)}</TableCell>
                        <TableCell>
                          <Badge appearance="tint" color={STATUS_TONE[status]}>
                            {STATUS_LABEL[status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Menu>
                            <MenuTrigger disableButtonEnhancement>
                              <MenuButton
                                appearance="subtle"
                                size="small"
                                icon={<MoreHorizontal20Regular />}
                                aria-label={`Actions for ${event.eventId}`}
                              />
                            </MenuTrigger>
                            <MenuPopover>
                              <MenuList>
                                <MenuItem
                                  icon={<PeopleTeam20Regular />}
                                  onClick={() => setSelectedEventId(event.eventId)}
                                >
                                  View details
                                </MenuItem>
                                <MenuItem
                                  icon={<Edit20Regular />}
                                  disabled={event.cancelled}
                                  onClick={() => loadForEdit(event)}
                                >
                                  Edit event
                                </MenuItem>
                                <MenuItem
                                  icon={<Dismiss20Regular />}
                                  disabled={event.cancelled}
                                  onClick={() => {
                                    setPendingCancel(event);
                                    setCancelReason('');
                                  }}
                                >
                                  Cancel event
                                </MenuItem>
                              </MenuList>
                            </MenuPopover>
                          </Menu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="ncas-panel__body">
              <Caption1 className="ncas-muted">
                A row with a green edge is running now. Select a row for the whole event, or use its
                Actions menu to change it.
              </Caption1>
            </div>
          </section>

          {/* ---- the selected event's details ------------------------- */}
          {selectedEvent ? (
            <section className="ncas-panel" aria-label="Event details">
              <div className="ncas-panel__head">
                <div>
                  <Subtitle2 as="h2" style={{ margin: 0 }}>
                    {selectedEvent.eventId}
                  </Subtitle2>
                  <Caption1 className="ncas-muted">
                    {eventWindow(selectedEvent)} · {formatLongDate(selectedEvent.date)}
                  </Caption1>
                </div>
                <Badge
                  appearance="tint"
                  color={STATUS_TONE[eventStatus(selectedEvent, state.clock, session.date)]}
                >
                  {STATUS_LABEL[eventStatus(selectedEvent, state.clock, session.date)]}
                </Badge>
              </div>

              <div className="ncas-panel__body ncas-stack">
                <div className="ncas-row" style={{ gap: 22, flexWrap: 'wrap' }}>
                  <HeaderField label="Event ID" value={selectedEvent.eventId} />
                  <HeaderField label="Date" value={formatLongDate(selectedEvent.date)} />
                  <HeaderField label="Start time" value={formatTime(selectedEvent.startTime)} />
                  <HeaderField label="End time" value={formatTime(selectedEvent.endTime)} />
                  <HeaderField label="Reason" value={eventReasonLabel(selectedEvent)} />
                  <HeaderField label="Created by" value={selectedEvent.createdBy} />
                </div>

                <Divider />

                <div className="ncas-stack" style={{ gap: 6 }}>
                  <Caption1 className="ncas-muted">
                    Students excused ({selectedEvent.studentIds.length})
                  </Caption1>
                  <div className="ncas-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {selectedEvent.studentIds.map((id) => {
                      const student = roster.find((s) => s.studentId === id);
                      return (
                        <Badge key={id} appearance="tint" color="informative">
                          {student ? `${student.name} · ${student.studentId}` : id}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {selectedEvent.notes ? (
                  <Field label="Notes">
                    <Body2>{selectedEvent.notes}</Body2>
                  </Field>
                ) : null}

                <div className="ncas-row">
                  <Button
                    appearance="secondary"
                    icon={<Edit20Regular />}
                    disabled={selectedEvent.cancelled}
                    onClick={() => loadForEdit(selectedEvent)}
                  >
                    Edit
                  </Button>
                  <Button
                    appearance="secondary"
                    icon={<Warning20Regular />}
                    disabled={selectedEvent.cancelled}
                    onClick={() => {
                      setPendingCancel(selectedEvent);
                      setCancelReason('');
                    }}
                  >
                    Cancel Event
                  </Button>
                </div>
              </div>
            </section>
          ) : (
            <section className="ncas-panel" aria-label="Event details">
              <div className="ncas-panel__head">
                <Subtitle2 as="h2" style={{ margin: 0 }}>
                  Event details
                </Subtitle2>
              </div>
              <div className="ncas-panel__body">
                <Body1 as="p" style={{ margin: 0 }} className="ncas-muted">
                  Select an event in the list to see its students, its window, its reason and who
                  filed it.
                </Body1>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ---- confirmation for a destructive action ------------------- */}
      <Dialog
        open={pendingCancel !== null}
        onOpenChange={(_, data) => {
          if (!data.open) setPendingCancel(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Cancel this special event?</DialogTitle>
            <DialogContent>
              {pendingCancel ? (
                <div className="ncas-stack" style={{ gap: 12 }}>
                  <Body1 as="p" style={{ margin: 0 }}>
                    <Text weight="semibold">{pendingCancel.eventId}</Text> covers{' '}
                    {describeEventStudents(pendingCancel, roster).label} from{' '}
                    {formatTime(pendingCancel.startTime)} to {formatTime(pendingCancel.endTime)}.
                  </Body1>
                  <MessageBar intent="warning">
                    <MessageBarBody>
                      Those students stop being excused immediately. Any who have not tapped will be
                      marked absent when the lesson ends, and any who tap will be recorded normally.
                    </MessageBarBody>
                  </MessageBar>
                  <Field label="Reason for cancelling" hint="Kept in the audit trail.">
                    <Textarea
                      value={cancelReason}
                      onChange={(_, data) => setCancelReason(data.value)}
                      placeholder="e.g. The appointment was moved to after school"
                      resize="vertical"
                      rows={2}
                    />
                  </Field>
                </div>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setPendingCancel(null)}>
                Keep event
              </Button>
              <Button appearance="primary" icon={<Dismiss20Regular />} onClick={confirmCancel}>
                Cancel event
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
