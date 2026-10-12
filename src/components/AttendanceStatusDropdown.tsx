'use client';

import React from 'react';

import { Dropdown, Option } from '@/lib/fluent';
import { STATUS_CHOICES, statusLabel } from './StatusBadge';
import type { AttendanceStatus } from '@/lib/types';

/**
 * ATTENDANCE STATUS DROP-DOWN
 * ==================================================================
 * The status column of the attendance register, as a WinUI drop-down.
 *
 * A teacher who can see the room does not need to open a second screen to say
 * what the register should read, so the register itself carries the control.
 * Choosing a different status does not write anything by itself — it raises the
 * change, and the page that owns the row collects a reason before anything is
 * stored. That split is what keeps a stray click from silently rewriting a
 * register: the engine refuses a change with no reason, and this control never
 * calls it without one.
 *
 * The control is live on every row, including the ones the reader has nothing
 * for. A student whose card would not read, or who came in past the terminal, is
 * exactly the case a teacher needs to be able to settle — and "Not recorded" is
 * a value like any other here, not a dead cell. What that writes is the page's
 * decision, not this control's: it reports the choice and nothing more.
 */

export function AttendanceStatusDropdown({
  status,
  onChange,
}: {
  /** the recorded status, or null when the register has no row for this student */
  status: AttendanceStatus | null;
  onChange: (next: AttendanceStatus) => void;
}) {
  const current = statusLabel(status);
  const recorded = status !== null;

  return (
    <Dropdown
      size="small"
      className="ncas-status-dd"
      value={current}
      selectedOptions={status ? [status] : []}
      title={
        recorded
          ? `Recorded as ${current} — choose a status to change it`
          : 'Nothing recorded yet — choose a status to set it by hand'
      }
      aria-label={
        recorded
          ? `Attendance status ${current}. Choose a status to change it.`
          : 'No attendance recorded. Choose a status to set it by hand.'
      }
      onOptionSelect={(_, data) => {
        const next = data.optionValue as AttendanceStatus | undefined;
        // Re-picking the status that is already recorded is not a change. With
        // no record there is nothing to re-pick, so every choice is one.
        if (!next || next === status) return;
        onChange(next);
      }}
    >
      {STATUS_CHOICES.map((choice) => (
        <Option key={choice.value} value={choice.value}>
          {choice.label}
        </Option>
      ))}
    </Dropdown>
  );
}
