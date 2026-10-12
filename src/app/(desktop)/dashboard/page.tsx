'use client';

import React from 'react';
import Link from 'next/link';

import { useApp } from '@/lib/store/store';
import { formatLongDate, formatTime, formatTimeOrDash } from '@/lib/time';
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  ProgressBar,
  Subtitle2,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Textarea,
} from '@/lib/fluent';
import { ArrowClockwise20Regular, Save20Regular, ShieldTask20Regular } from '@fluentui/react-icons';
import { HeaderField, LiveIndicator, PageHeader } from '@/components/PageHeader';
import { Metric } from '@/components/Metric';
import { AttendanceStatusDropdown } from '@/components/AttendanceStatusDropdown';
import {
  BreakBadge,
  ReviewBadge,
  needsAttention,
  rowAccent,
  statusLabel,
} from '@/components/StatusBadge';
import type { AttendanceStatus } from '@/lib/types';

/**
 * SCREEN 2 — TEACHER ATTENDANCE DASHBOARD
 * ==================================================================
 * The screen a teacher leaves open during the lesson. It answers three
 * questions and nothing else: which class is running, who is accounted for, and
 * which records need me.
 *
 * The register on this screen is not read-only, and it is not read-only only
 * where the reader has already been. A teacher looking at the room is the person
 * best placed to say a record is wrong — and equally the person who knows a
 * student came in when the card did not read at all. So the status column
 * carries a drop-down on every row, and choosing a different status raises the
 * change rather than committing it: the correction is not written until a
 * reason has been given, because the engine refuses a change without one, and
 * because that reason is what the review history shows beside the teacher's
 * name.
 */

/** A change the teacher has asked for but not yet justified. */
interface PendingChange {
  studentId: string;
  name: string;
  from: AttendanceStatus | null;
  to: AttendanceStatus;
  /** false when the reader has nothing for this student — the row is written by hand */
  hadRecord: boolean;
}

export default function AttendanceDashboardPage() {
  const { state, session, summary, roster, setStatus } = useApp();
  const [refreshedAt, setRefreshedAt] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [pending, setPending] = React.useState<PendingChange | null>(null);
  const [reason, setReason] = React.useState('');
  const [reasonMissing, setReasonMissing] = React.useState(false);
  /** What the last correction did, so the teacher sees it land. */
  const [lastChange, setLastChange] = React.useState<string | null>(null);

  const expected = roster.length - summary.approvedLeave;
  const accounted = summary.totalRecords;
  /** Students the register has no row for yet — the ones still to walk in. */
  const notRecorded = roster.filter((r) => !r.record && !r.student.approvedLeave).length;
  const needingReview = roster.filter((row) => needsAttention(row.record));

  const refresh = () => {
    setRefreshing(true);
    window.setTimeout(() => {
      setRefreshedAt(formatTime(state.clock));
      setRefreshing(false);
    }, 320);
  };

  const closeChange = () => {
    setPending(null);
    setReason('');
    setReasonMissing(false);
  };

  const saveChange = () => {
    if (!pending) return;
    if (reason.trim().length === 0) {
      setReasonMissing(true);
      return;
    }
    setStatus(pending.studentId, pending.to, reason.trim());
    setLastChange(
      pending.hadRecord
        ? `${pending.name} (${pending.studentId}) changed from ${statusLabel(
            pending.from,
          )} to ${statusLabel(pending.to)} — recorded in the review history.`
        : `${pending.name} (${pending.studentId}) set to ${statusLabel(
            pending.to,
          )} by hand, with no card read — recorded in the review history.`,
    );
    closeChange();
  };

  return (
    <>
      <PageHeader
        title="Attendance dashboard"
        subtitle={`${session.className} · ${session.teacherName}`}
        meta={
          <>
            <HeaderField label="Current class" value={session.className} />
            <HeaderField label="Room" value={session.room} />
            <HeaderField label="Current time" value={formatTime(state.clock)} />
            <LiveIndicator>Attendance active</LiveIndicator>
          </>
        }
        actions={
          <>
            <Button
              appearance="secondary"
              icon={<ArrowClockwise20Regular />}
              onClick={refresh}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button
              appearance="primary"
              icon={<ShieldTask20Regular />}
              as="a"
              href="/review"
            >
              Open review
            </Button>
          </>
        }
      />

      <div className="ncas-body ncas-stack">
        {lastChange ? (
          <MessageBar intent="success">
            <MessageBarBody>
              <MessageBarTitle>Attendance corrected</MessageBarTitle>
              {lastChange}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {/* ---- class summary ------------------------------------------ */}
        <section aria-label="Class summary">
          <div className="ncas-metrics">
            <Metric value={summary.present} label="Present" tone="success" />
            <Metric value={summary.late} label="Late" tone="caution" />
            <Metric value={notRecorded} label="Not recorded" tone="neutral" />
            <Metric value={summary.absent} label="Absent" tone="critical" />
            <Metric value={summary.reviewRequired} label="Review required" tone="attention" />
          </div>
        </section>

        <section className="ncas-panel" aria-label="Attendance progress">
          <div className="ncas-panel__body ncas-stack">
            <div className="ncas-row ncas-row--between">
              <Subtitle2 as="h2" style={{ margin: 0 }}>
                Attendance progress
              </Subtitle2>
              <Text weight="semibold" className="ncas-tabular">
                {accounted} of {expected} expected students accounted for
              </Text>
            </div>
            <ProgressBar
              value={expected === 0 ? 0 : accounted / expected}
              max={1}
              thickness="large"
              aria-label="Attendance progress"
            />
            <Caption1 className="ncas-muted">
              {summary.present + summary.late} present or late · {notRecorded} still to tap at the
              reader · {summary.reviewRequired} awaiting a teacher decision
              {summary.approvedLeave > 0
                ? ` · ${summary.approvedLeave} student on approved leave, who correctly attracts no record`
                : ''}
              {refreshedAt ? ` · Last refreshed ${refreshedAt}` : ''}
            </Caption1>
          </div>
        </section>

        {/* ---- the register ------------------------------------------- */}
        <section className="ncas-panel" aria-label="Attendance register">
          <div className="ncas-panel__head">
            <div>
              <Subtitle2 as="h2" style={{ margin: 0 }}>
                Attendance register
              </Subtitle2>
              <Caption1 className="ncas-muted">
                {formatLongDate(session.date)} · {formatTime(session.startTime)}–
                {formatTime(session.endTime)} · on time to{' '}
                {formatTime(session.startTime + session.onTimeWindowMinutes)}, late after ·
                duplicate taps within {session.duplicateTapWindow} minutes ignored
              </Caption1>
            </div>
            {needingReview.length > 0 ? (
              <Button
                appearance="secondary"
                size="small"
                icon={<ShieldTask20Regular />}
                as="a"
                href="/review"
              >
                {needingReview.length} to review
              </Button>
            ) : null}
          </div>

          <div className="ncas-table-wrap">
            <Table size="small" aria-label={`Attendance for ${session.className}`}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Student name</TableHeaderCell>
                  <TableHeaderCell>Student ID</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Attendance time</TableHeaderCell>
                  <TableHeaderCell>Late minutes</TableHeaderCell>
                  <TableHeaderCell>Break status</TableHeaderCell>
                  <TableHeaderCell>Review status</TableHeaderCell>
                </TableRow>
              </TableHeader>

              <TableBody>
                {roster.map(({ student, record, breakMinutes, breakStatus }) => (
                  <TableRow key={student.studentId} style={rowAccent(record)}>
                    <TableCell>
                      <TableCellLayout>
                        <Text weight={needsAttention(record) ? 'semibold' : 'regular'}>
                          {student.name}
                        </Text>
                      </TableCellLayout>
                    </TableCell>

                    <TableCell>
                      <span className="ncas-num">{student.studentId}</span>
                    </TableCell>

                    <TableCell>
                      {student.approvedLeave ? (
                        <Badge appearance="tint" color="important">
                          Approved leave
                        </Badge>
                      ) : (
                        <AttendanceStatusDropdown
                          status={record?.status ?? null}
                          onChange={(next) => {
                            setPending({
                              studentId: student.studentId,
                              name: student.name,
                              from: record?.status ?? null,
                              to: next,
                              hadRecord: Boolean(record),
                            });
                            setReason('');
                            setReasonMissing(false);
                          }}
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      <span className="ncas-num">
                        {formatTimeOrDash(record?.entryTime ?? null)}
                      </span>
                    </TableCell>

                    <TableCell>
                      {record && record.lateMinutes > 0 ? (
                        <span className="ncas-num">{record.lateMinutes} min</span>
                      ) : (
                        <span className="ncas-muted">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <BreakBadge status={breakStatus} minutes={breakMinutes} />
                    </TableCell>

                    <TableCell>
                      {student.approvedLeave ? (
                        <Caption1 className="ncas-muted">Approved leave</Caption1>
                      ) : (
                        <ReviewBadge record={record} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="ncas-panel__body">
            <Body1 as="p" className="ncas-muted" style={{ margin: 0 }}>
              A row marked with the orange accent is held for a teacher decision. The status column
              is a drop-down on every row: choose a different status and you will be asked for a
              reason before the change is written, which is what puts it in the{' '}
              <Link href="/review">review history</Link>. A student the reader has nothing for can
              be set by hand as well — that row carries no arrival time, so a tap at the reader
              later replaces it rather than being ignored as a duplicate. Records are written to
              permanent storage from the <Link href="/summary">class summary</Link> once the lesson
              has ended.
            </Body1>
          </div>
        </section>
      </div>

      {/* ---- one correction, justified before it is written ---------- */}
      <Dialog
        open={pending !== null}
        onOpenChange={(_, data) => {
          if (!data.open) closeChange();
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Change attendance status</DialogTitle>
            <DialogContent>
              {pending ? (
                <div className="ncas-stack" style={{ gap: 14 }}>
                  <div className="ncas-row" style={{ gap: 28, flexWrap: 'wrap' }}>
                    <HeaderField label="Student" value={`${pending.name} · ${pending.studentId}`} />
                    <HeaderField label="Recorded as" value={statusLabel(pending.from)} />
                    <HeaderField
                      label="Change to"
                      value={statusLabel(pending.to)}
                    />
                  </div>

                  {pending.hadRecord ? (
                    <MessageBar intent="warning">
                      <MessageBarBody>
                        The register is changed only when this is saved, and the reason below is kept
                        in the review history beside your name. Until then nothing has moved.
                      </MessageBarBody>
                    </MessageBar>
                  ) : (
                    <MessageBar intent="info">
                      <MessageBarBody>
                        <MessageBarTitle>Nothing recorded yet</MessageBarTitle>
                        {pending.name} has no record for this lesson, so saving writes one by hand
                        and marks it as having no card read behind it. If the card is tapped later
                        the reader&apos;s own reading takes its place — the reason below stays in the
                        review history either way.
                      </MessageBarBody>
                    </MessageBar>
                  )}

                  <Field
                    label="Reason for the correction"
                    required
                    validationMessage={
                      reasonMissing ? 'A reason is required for every change.' : undefined
                    }
                    validationState={reasonMissing ? 'error' : 'none'}
                    hint="What a teacher looking at this record next week would need to know."
                  >
                    <Textarea
                      value={reason}
                      onChange={(_, data) => {
                        setReason(data.value);
                        if (data.value.trim().length > 0) setReasonMissing(false);
                      }}
                      placeholder="e.g. Student was in the room but the card did not read."
                      resize="vertical"
                      rows={2}
                    />
                  </Field>

                  <Caption1 className="ncas-muted">
                    {pending.hadRecord
                      ? 'Saving clears the review flag for this record, if it had one, and marks the method as a manual override.'
                      : 'Saving writes the record with no arrival time and marks the method as a manual entry, so a later tap is not mistaken for a duplicate.'}
                  </Caption1>
                </div>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeChange}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                icon={<Save20Regular />}
                disabled={reason.trim().length === 0}
                onClick={saveChange}
              >
                Save correction
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
