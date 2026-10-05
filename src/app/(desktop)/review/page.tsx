'use client';

import React from 'react';

import { useApp } from '@/lib/store/store';
import { describeIdentityCheck, describeRecordHistory } from '@/lib/engine/review';
import { formatLongDate, formatTime, formatTimeOrDash } from '@/lib/time';
import type { AttendanceStatus, Student } from '@/lib/types';
import {
  Badge,
  Body1,
  Body2,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Field,
  MessageBar,
  MessageBarBody,
  Radio,
  RadioGroup,
  Subtitle2,
  Text,
  Textarea,
} from '@/lib/fluent';
import { Checkmark20Regular, Dismiss20Regular, Edit20Regular, ShieldTask20Regular } from '@fluentui/react-icons';
import { HeaderField, LiveIndicator, PageHeader } from '@/components/PageHeader';
import { AttendanceBadge, BreakBadge, ReviewBadge, needsAttention } from '@/components/StatusBadge';

/**
 * SCREEN 3 — ATTENDANCE REVIEW AND MANUAL OVERRIDE
 * ==================================================================
 * Everything a teacher needs to decide about one questionable record, on one
 * screen: what the register says, what the camera saw, what has happened to the
 * record so far, and the three ways to settle it.
 *
 * The Manual Override control is a WinUI ContentDialog rather than a bare
 * button, because changing a permanent attendance record is exactly the kind of
 * action that should be confirmed before it happens. It also gives the two
 * other controls the specification names — Save Correction and Cancel — a
 * natural home.
 */

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const STATUS_CHOICES: { value: AttendanceStatus; label: string }[] = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'LATE', label: 'Late' },
  { value: 'ABSENT', label: 'Absent' },
];

export default function ReviewPage() {
  const { state, session, roster, override, confirmReview } = useApp();

  const flagged = React.useMemo(
    () => roster.filter((row) => needsAttention(row.record)),
    [roster],
  );

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const activeId = selectedId ?? flagged[0]?.student.studentId ?? null;
  const active = roster.find((row) => row.student.studentId === activeId) ?? null;

  /* The draft a teacher is composing. Nothing reaches the register until the
     override is saved from the dialog. */
  const [draftStatus, setDraftStatus] = React.useState<AttendanceStatus>('PRESENT');
  const [draftReason, setDraftReason] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState<Student | null>(null);

  React.useEffect(() => {
    if (!active) return;
    setDraftStatus(active.record?.status ?? 'PRESENT');
    setDraftReason('');
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const record = active?.record ?? null;
  const student = active?.student ?? null;
  const unchanged = record?.status === draftStatus;
  const canOverride = Boolean(record) && !unchanged && draftReason.trim().length > 0;

  const dismissSelection = () => {
    if (!record) return;
    setDraftStatus(record.status);
    setDraftReason('');
  };

  return (
    <>
      <PageHeader
        title="Review and override"
        subtitle={`${session.className} · records a teacher needs to settle`}
        meta={
          <>
            <HeaderField label="Current class" value={session.className} />
            <HeaderField label="Room" value={session.room} />
            <HeaderField label="Current time" value={formatTime(state.clock)} />
            {flagged.length > 0 ? (
              <LiveIndicator>{flagged.length} awaiting review</LiveIndicator>
            ) : (
              <LiveIndicator>No records waiting</LiveIndicator>
            )}
          </>
        }
        actions={
          <Button
            appearance="secondary"
            icon={<ShieldTask20Regular />}
            as="a"
            href="/dashboard"
          >
            Back to dashboard
          </Button>
        }
      />

      <div className="ncas-body">
        {state.message ? (
          <MessageBar
            intent={
              state.message.intent === 'error'
                ? 'error'
                : state.message.intent === 'info'
                  ? 'info'
                  : state.message.intent
            }
            style={{ marginBottom: 16 }}
          >
            <MessageBarBody>{state.message.text}</MessageBarBody>
          </MessageBar>
        ) : null}

        <div className="ncas-columns">
          {/* ---- the record ------------------------------------------- */}
          <div className="ncas-stack">
            {!student || !record ? (
              <section className="ncas-panel">
                <div className="ncas-panel__body">
                  <Subtitle2 as="h2" style={{ margin: 0 }}>
                    Nothing to review
                  </Subtitle2>
                  <Body1 as="p" className="ncas-muted">
                    Every record in this lesson has been settled. Records arrive here when the
                    secondary image check cannot confirm a student, or when a class break is never
                    ended.
                  </Body1>
                </div>
              </section>
            ) : (
              <>
                <section className="ncas-panel">
                  <div className="ncas-panel__head">
                    <div>
                      <Subtitle2 as="h2" style={{ margin: 0 }}>
                        {student.name}
                      </Subtitle2>
                      <Caption1 className="ncas-muted">
                        Student ID {student.studentId} · card {student.rfidCardId}
                      </Caption1>
                    </div>
                    <div className="ncas-row">
                      <AttendanceBadge status={record.status} />
                      <ReviewBadge record={record} />
                    </div>
                  </div>

                  <div className="ncas-panel__body ncas-stack">
                    {/* the two images the check compares */}
                    <div className="ncas-columns" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <div className="ncas-stack" style={{ gap: 8 }}>
                        <Caption1 className="ncas-muted">Registered image</Caption1>
                        <div className="ncas-image">
                          <span className="ncas-image__initials">{initials(student.name)}</span>
                          <Caption1>{student.registeredImageRef}</Caption1>
                        </div>
                        <Caption1 className="ncas-muted">
                          Taken when the student was enrolled. Held on the student record.
                        </Caption1>
                      </div>

                      <div className="ncas-stack" style={{ gap: 8 }}>
                        <Caption1 className="ncas-muted">Captured image</Caption1>
                        <div className="ncas-image">
                          <span className="ncas-image__initials">{initials(student.name)}</span>
                          <Caption1>frame {formatTimeOrDash(record.entryTime)}</Caption1>
                        </div>
                        <Caption1 className="ncas-muted">
                          Captured at the terminal for this check. It is used for the comparison and
                          is not kept in the attendance record.
                        </Caption1>
                      </div>
                    </div>

                    <Divider />

                    <Field label="Identity check">
                      <Body2>{describeIdentityCheck(record, student)}</Body2>
                    </Field>

                    <div className="ncas-row" style={{ gap: 28, flexWrap: 'wrap' }}>
                      <HeaderField
                        label="Attendance time"
                        value={formatTimeOrDash(record.entryTime)}
                      />
                      <HeaderField
                        label="Late minutes"
                        value={record.lateMinutes > 0 ? `${record.lateMinutes} min` : 'None'}
                      />
                      <HeaderField
                        label="Break taken"
                        value={
                          record.breakTotalMinutes > 0
                            ? `${record.breakTotalMinutes} min`
                            : record.breakStatus === 'ON_BREAK'
                              ? 'In progress'
                              : 'None'
                        }
                      />
                      <div className="ncas-field">
                        <span className="ncas-field__label">Break status</span>
                        <span>
                          <BreakBadge
                            status={record.breakStatus}
                            minutes={record.breakTotalMinutes}
                          />
                        </span>
                      </div>
                      <HeaderField label="Recorded by" value={record.verificationMethod} />
                    </div>

                    {record.reviewReason ? (
                      <MessageBar intent="warning">
                        <MessageBarBody>{record.reviewReason}</MessageBarBody>
                      </MessageBar>
                    ) : null}
                  </div>
                </section>

                {/* ---- history ------------------------------------------ */}
                <section className="ncas-panel">
                  <div className="ncas-panel__head">
                    <Subtitle2 as="h2" style={{ margin: 0 }}>
                      Review history
                    </Subtitle2>
                    <Caption1 className="ncas-muted">
                      {formatLongDate(session.date)}
                    </Caption1>
                  </div>
                  <div className="ncas-panel__body">
                    <ul className="ncas-timeline">
                      {describeRecordHistory(record, state.breaks, session, student).map(
                        (event, index) => (
                          <li className="ncas-timeline__item" key={`${event.label}-${index}`}>
                            <span className="ncas-timeline__time">
                              {event.time === null ? '—' : formatTime(event.time)}
                            </span>
                            <span>
                              <Body2 style={{ display: 'block', fontWeight: 600 }}>
                                {event.label}
                              </Body2>
                              <Caption1 className="ncas-muted">{event.detail}</Caption1>
                            </span>
                          </li>
                        ),
                      )}
                    </ul>

                    {state.audit.filter((a) => a.recordId === record.recordId).length > 0 ? (
                      <>
                        <Divider style={{ margin: '12px 0' }} />
                        <Caption1 className="ncas-muted">Record changes</Caption1>
                        <ul className="ncas-timeline">
                          {state.audit
                            .filter((a) => a.recordId === record.recordId)
                            .map((entry) => (
                              <li className="ncas-timeline__item" key={entry.auditId}>
                                <span className="ncas-timeline__time">
                                  {formatTime(entry.timestamp)}
                                </span>
                                <span>
                                  <Body2 style={{ display: 'block', fontWeight: 600 }}>
                                    {entry.action.replace(/_/g, ' ')}
                                  </Body2>
                                  <Caption1 className="ncas-muted">
                                    {entry.oldValue} → {entry.newValue} · {entry.reason} ·{' '}
                                    {entry.actor}
                                  </Caption1>
                                </span>
                              </li>
                            ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                </section>
              </>
            )}
          </div>

          {/* ---- the decision ------------------------------------------ */}
          <div className="ncas-stack">
            <section className="ncas-panel">
              <div className="ncas-panel__head">
                <Subtitle2 as="h2" style={{ margin: 0 }}>
                  Manual override
                </Subtitle2>
              </div>
              <div className="ncas-panel__body ncas-stack">
                <Caption1 className="ncas-muted">
                  Choose the status this student should have. The change is written only when the
                  correction is saved, and a reason is required for every change.
                </Caption1>

                <Field label="Corrected status">
                  <RadioGroup
                    value={draftStatus}
                    onChange={(_, data) => setDraftStatus(data.value as AttendanceStatus)}
                  >
                    {STATUS_CHOICES.map((choice) => (
                      <Radio
                        key={choice.value}
                        value={choice.value}
                        label={choice.label}
                        disabled={!record}
                      />
                    ))}
                  </RadioGroup>
                </Field>

                <Field
                  label="Reason for the correction"
                  required
                  hint="Recorded in the audit trail beside your name."
                >
                  <Textarea
                    value={draftReason}
                    onChange={(_, data) => setDraftReason(data.value)}
                    placeholder="e.g. Student was present but the captured image was unclear."
                    resize="vertical"
                    disabled={!record}
                  />
                </Field>

                {record && !unchanged ? (
                  <MessageBar intent="info">
                    <MessageBarBody>
                      The record currently reads <Text weight="semibold">{record.status}</Text> and
                      will be changed to <Text weight="semibold">{draftStatus}</Text>.
                    </MessageBarBody>
                  </MessageBar>
                ) : null}

                <div className="ncas-row" style={{ flexWrap: 'wrap' }}>
                  <Button
                    appearance="primary"
                    icon={<Edit20Regular />}
                    disabled={!canOverride}
                    onClick={() => setDialogOpen(true)}
                  >
                    Manual override
                  </Button>
                  <Button
                    appearance="secondary"
                    icon={<Checkmark20Regular />}
                    disabled={!record || record.reviewStatus !== 'PENDING'}
                    onClick={() => student && setConfirming(student)}
                  >
                    Accept as recorded
                  </Button>
                  <Button
                    appearance="subtle"
                    icon={<Dismiss20Regular />}
                    disabled={!record}
                    onClick={dismissSelection}
                  >
                    Cancel
                  </Button>
                </div>

                {record && unchanged ? (
                  <Caption1 className="ncas-muted">
                    Pick a different status to enable the override.
                  </Caption1>
                ) : null}
                {record && unchanged === false && draftReason.trim().length === 0 ? (
                  <Caption1 className="ncas-muted">
                    A reason is required before the override can be saved.
                  </Caption1>
                ) : null}
              </div>
            </section>

            <section className="ncas-panel">
              <div className="ncas-panel__head">
                <Subtitle2 as="h2" style={{ margin: 0 }}>
                  Waiting for review
                </Subtitle2>
                <Badge appearance="tint" color="important">
                  {flagged.length}
                </Badge>
              </div>
              <div className="ncas-panel__body ncas-stack" style={{ gap: 8 }}>
                {flagged.length === 0 ? (
                  <Caption1 className="ncas-muted">Nothing is waiting.</Caption1>
                ) : (
                  flagged.map((row) => (
                    <Button
                      key={row.student.studentId}
                      appearance={row.student.studentId === activeId ? 'primary' : 'subtle'}
                      onClick={() => setSelectedId(row.student.studentId)}
                      style={{ justifyContent: 'flex-start' }}
                    >
                      {row.student.name} · {row.student.studentId}
                    </Button>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ---- the confirmation dialog --------------------------------- */}
      <Dialog open={dialogOpen} onOpenChange={(_, data) => setDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Manual override</DialogTitle>
            <DialogContent>
              {student && record ? (
                <div className="ncas-stack" style={{ gap: 12 }}>
                  <Body1 as="p" style={{ margin: 0 }}>
                    Change the attendance status for{' '}
                    <Text weight="semibold">{student.name}</Text> ({student.studentId}) in{' '}
                    {session.className}.
                  </Body1>

                  <div className="ncas-row" style={{ gap: 28 }}>
                    <HeaderField label="From" value={record.status} />
                    <HeaderField label="To" value={draftStatus} />
                    <HeaderField
                      label="Late minutes"
                      value={draftStatus === 'ABSENT' ? '0 min' : `${record.lateMinutes} min`}
                    />
                  </div>

                  <Field label="Reason recorded in the audit trail">
                    <Text weight="semibold">{draftReason.trim()}</Text>
                  </Field>

                  <Caption1 className="ncas-muted">
                    Saving the correction also settles the review flag and writes the change to
                    permanent storage with your name against it.
                  </Caption1>
                </div>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={() => {
                  if (record) {
                    override(record.recordId, draftStatus, draftReason);
                    setDialogOpen(false);
                    setDraftReason('');
                  }
                }}
              >
                Save correction
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* A second dialog confirms the accepted-as-recorded path, so both ways of
          settling a record are deliberate. */}
      <Dialog open={confirming !== null} onOpenChange={(_, data) => !data.open && setConfirming(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Accept as recorded</DialogTitle>
            <DialogContent>
              <Body1 as="p" style={{ margin: 0 }}>
                The record for <Text weight="semibold">{confirming?.name}</Text> will be accepted as
                it stands and the review flag cleared. No status change is written.
              </Body1>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={() => {
                  if (record) confirmReview(record.recordId);
                  setConfirming(null);
                }}
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
