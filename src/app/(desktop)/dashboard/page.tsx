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
} from '@/lib/fluent';
import { ArrowClockwise20Regular, ShieldTask20Regular } from '@fluentui/react-icons';
import { HeaderField, LiveIndicator, PageHeader } from '@/components/PageHeader';
import { Metric } from '@/components/Metric';
import { AttendanceBadge, BreakBadge, ReviewBadge, needsAttention, rowAccent } from '@/components/StatusBadge';

/**
 * SCREEN 2 — TEACHER ATTENDANCE DASHBOARD
 * ==================================================================
 * The screen a teacher leaves open during the lesson. It answers three
 * questions and nothing else: which class is running, who is accounted for, and
 * which records need me.
 */

export default function AttendanceDashboardPage() {
  const { state, session, summary, roster } = useApp();
  const [refreshedAt, setRefreshedAt] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

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
                        <AttendanceBadge status={record?.status ?? null} />
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
              A row marked with the orange accent is held for a teacher decision. Records are written
              to permanent storage from the{' '}
              <Link href="/summary">class summary</Link> once the lesson has ended.
            </Body1>
          </div>
        </section>
      </div>
    </>
  );
}
