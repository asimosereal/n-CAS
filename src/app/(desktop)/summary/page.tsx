'use client';

import React from 'react';

import { useApp } from '@/lib/store/store';
import { formatLongDate, formatTime, formatTimeOrDash } from '@/lib/time';
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Divider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Subtitle2,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@/lib/fluent';
import {
  ArrowSync20Regular,
  Clock20Regular,
  Save20Regular,
} from '@fluentui/react-icons';
import { HeaderField, LiveIndicator, PageHeader } from '@/components/PageHeader';
import { Metric } from '@/components/Metric';
import { AttendanceBadge, BreakBadge, ReviewBadge, needsAttention, rowAccent } from '@/components/StatusBadge';

/**
 * SCREEN 4 — CLASS ATTENDANCE SUMMARY
 * ==================================================================
 * What is left after the lesson: the four numbers, the register behind them,
 * the breaks taken, and the two things the specification asks the system to say
 * out loud — that the records are saved, and that it is ready for the next
 * class.
 */

export default function ClassSummaryPage() {
  const { state, session, summary, roster, finalise, save, reset } = useApp();

  const allStudents = roster;
  const studentName = (studentId: string) =>
    allStudents.find((row) => row.student.studentId === studentId)?.student.name ?? studentId;

  const breakRows = state.breaks
    .filter((b) => b.classId === session.classId)
    .sort((a, b) => a.startTime - b.startTime);

  const savedCount = state.records.filter((r) => r.saved).length;

  return (
    <>
      <PageHeader
        title="Class summary"
        subtitle={`${session.className} · ${session.teacherName}`}
        meta={
          <>
            <HeaderField label="Class" value={session.className} />
            <HeaderField label="Date" value={formatLongDate(session.date)} />
            <HeaderField
              label="Class completion time"
              value={state.finalised ? formatTime(session.endTime) : 'Lesson still running'}
            />
            <LiveIndicator>{state.finalised ? 'Class complete' : 'Attendance active'}</LiveIndicator>
          </>
        }
        actions={
          <>
            <Button
              appearance="secondary"
              icon={<Clock20Regular />}
              onClick={finalise}
              disabled={state.finalised}
            >
              End class
            </Button>
            <Button
              appearance="primary"
              icon={<Save20Regular />}
              onClick={save}
              disabled={state.saved}
            >
              Save records
            </Button>
          </>
        }
      />

      <div className="ncas-body ncas-stack">
        {/* ---- the four numbers -------------------------------------- */}
        <section aria-label="Class totals">
          <div className="ncas-metrics">
            <Metric
              value={summary.totalRecords}
              label={`Attendance records ${state.saved ? 'saved' : 'recorded'}`}
              tone="accent"
            />
            <Metric value={summary.present} label="Present" tone="success" />
            <Metric value={summary.late} label="Late" tone="caution" />
            <Metric value={summary.absent} label="Absent" tone="critical" />
            <Metric value={summary.reviewRequired} label="Review required" tone="attention" />
          </div>
        </section>

        <section className="ncas-panel" aria-label="Attendance totals in words">
          <div className="ncas-panel__body ncas-stack">
            <Subtitle2 as="h2" style={{ margin: 0 }}>
              {summary.totalRecords} attendance records {state.saved ? 'saved' : 'recorded'}
            </Subtitle2>
            <Body1 as="p" style={{ margin: 0 }}>
              {summary.present} present · {summary.late} late · {summary.absent} absent ·{' '}
              {summary.reviewRequired} review required
            </Body1>
            <Caption1 className="ncas-muted">
              A record held for review is reported under Review required rather than counted as a
              confirmed attendance, so the four figures add up to the {summary.totalRecords} records
              the lesson produced.
              {summary.approvedLeave > 0
                ? ` One further student is on approved leave and correctly attracts no record.`
                : ''}
            </Caption1>
          </div>
        </section>

        <div className="ncas-columns">
          {/* ---- attendance details ------------------------------------ */}
          <section className="ncas-panel" aria-label="Attendance details">
            <div className="ncas-panel__head">
              <div>
                <Subtitle2 as="h2" style={{ margin: 0 }}>
                  Attendance details
                </Subtitle2>
                <Caption1 className="ncas-muted">
                  {formatTime(session.startTime)}–{formatTime(session.endTime)} · {session.room}
                </Caption1>
              </div>
              <Badge appearance="tint" color={state.saved ? 'success' : 'informative'}>
                {state.saved ? 'Written to storage' : 'Not yet saved'}
              </Badge>
            </div>

            <div className="ncas-table-wrap" style={{ maxHeight: 420 }}>
              {/* Fixed layout with explicit widths, so the review badge always
                  gets the column it needs instead of being squeezed by the
                  student names beside it. */}
              <Table size="small" style={{ tableLayout: 'fixed' }} aria-label="Attendance details">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Student name</TableHeaderCell>
                    <TableHeaderCell style={{ width: 86 }}>Student ID</TableHeaderCell>
                    <TableHeaderCell style={{ width: 78 }}>Status</TableHeaderCell>
                    <TableHeaderCell style={{ width: 58 }}>Time</TableHeaderCell>
                    <TableHeaderCell style={{ width: 56 }}>Late</TableHeaderCell>
                    <TableHeaderCell style={{ width: 126 }}>Review</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map(({ student, record }) => (
                    <TableRow key={student.studentId} style={rowAccent(record)}>
                      <TableCell>
                        <TableCellLayout>{student.name}</TableCellLayout>
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
                          <AttendanceBadge status={record?.status ?? null} />
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="ncas-num">{formatTimeOrDash(record?.entryTime ?? null)}</span>
                      </TableCell>
                      <TableCell>
                        {record && record.lateMinutes > 0 ? (
                          <span className="ncas-num">{record.lateMinutes} min</span>
                        ) : (
                          <span className="ncas-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {student.approvedLeave ? (
                          <span className="ncas-muted">—</span>
                        ) : (
                          <ReviewBadge record={record} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* ---- break records ----------------------------------------- */}
          <div className="ncas-stack">
            <section className="ncas-panel" aria-label="Class break records">
              <div className="ncas-panel__head">
                <div>
                  <Subtitle2 as="h2" style={{ margin: 0 }}>
                    Class break records
                  </Subtitle2>
                  <Caption1 className="ncas-muted">
                    Started at the reader, ended by the return tap
                  </Caption1>
                </div>
                <Badge appearance="tint" color="informative">
                  {breakRows.length}
                </Badge>
              </div>
              <div className="ncas-panel__body ncas-stack" style={{ gap: 12 }}>
                {breakRows.length === 0 ? (
                  <Caption1 className="ncas-muted">No breaks were taken in this lesson.</Caption1>
                ) : (
                  breakRows.map((b) => (
                    <div key={b.breakId} className="ncas-stack" style={{ gap: 4 }}>
                      <div className="ncas-row ncas-row--between">
                        <Text weight="semibold">{studentName(b.studentId)}</Text>
                        {b.status === 'CLOSED' ? (
                          <span className="ncas-tabular">{b.minutes} min</span>
                        ) : (
                          <BreakBadge status={b.status} minutes={b.minutes} />
                        )}
                      </div>
                      <Caption1 className="ncas-muted ncas-tabular">
                        {formatTime(b.startTime)} –{' '}
                        {b.endTime === null ? 'no return tap' : formatTime(b.endTime)} ·{' '}
                        {b.status === 'CLOSED'
                          ? 'added to the attendance record'
                          : b.status === 'UNRESOLVED'
                            ? 'unresolved at class end, sent for review'
                            : 'still open'}
                      </Caption1>
                      <Divider />
                    </div>
                  ))
                )}
                <Caption1 className="ncas-muted">
                  A break that is never ended cannot be guessed at, so it is flagged for a teacher
                  instead of being closed automatically.
                </Caption1>
              </div>
            </section>

            <section className="ncas-panel" aria-label="Records needing attention">
              <div className="ncas-panel__head">
                <Subtitle2 as="h2" style={{ margin: 0 }}>
                  Still needing attention
                </Subtitle2>
              </div>
              <div className="ncas-panel__body ncas-stack" style={{ gap: 8 }}>
                {roster.filter((row) => needsAttention(row.record)).length === 0 ? (
                  <Caption1 className="ncas-muted">Every record has been settled.</Caption1>
                ) : (
                  roster
                    .filter((row) => needsAttention(row.record))
                    .map((row) => (
                      <div key={row.student.studentId} className="ncas-row ncas-row--between">
                        <Text>{row.student.name}</Text>
                        <ReviewBadge record={row.record} />
                      </div>
                    ))
                )}
                <Button
                  appearance="secondary"
                  size="small"
                  as="a"
                  href="/review"
                  style={{ alignSelf: 'flex-start' }}
                >
                  Open review
                </Button>
              </div>
            </section>
          </div>
        </div>

        {/* ---- the two closing statements ----------------------------- */}
        <section aria-label="Class closedown" className="ncas-stack">
          <MessageBar intent={state.saved ? 'success' : state.finalised ? 'warning' : 'info'}>
            <MessageBarBody>
              <MessageBarTitle>
                {state.saved
                  ? 'Attendance records saved successfully'
                  : state.finalised
                    ? 'Records are not yet saved'
                    : 'The lesson is still running'}
              </MessageBarTitle>
              {state.saved
                ? `${savedCount} records written to permanent storage. System ready for the next class.`
                : state.finalised
                  ? `Ending the class marked the missing students absent and flagged the unresolved break. Save the register to write it to permanent storage.`
                  : `End the class to apply the class-end rules: students with no record are marked absent, and a break that was never ended is flagged for review.`}
            </MessageBarBody>
          </MessageBar>

          <div className="ncas-row" style={{ justifyContent: 'flex-end' }}>
            {state.saved ? (
              <Button appearance="primary" icon={<ArrowSync20Regular />} onClick={reset}>
                Reset for next class
              </Button>
            ) : state.finalised ? (
              <Button appearance="primary" icon={<Save20Regular />} onClick={save}>
                Save records
              </Button>
            ) : (
              <Button appearance="primary" icon={<Clock20Regular />} onClick={finalise}>
                End class
              </Button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
