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
 * A teacher who can see the room does not need to open a second screen to
 * correct a single row, so the register itself carries the control. Choosing a
 * different status does not write anything by itself — it raises the change,
 * and the page that owns the record collects a reason before anything is
 * stored. That split is what keeps a stray click from silently rewriting a
 * register: the engine refuses an override with no reason, and this control
 * never calls it without one.
 *
 * Rows the register has nothing for yet are disabled rather than hidden. The
 * student has not tapped, so there is no record to correct — and a drop-down
 * that says "Not recorded" and cannot be opened says that more clearly than an
 * empty cell would.
 */

export function AttendanceStatusDropdown({
  status,
  disabled,
  disabledReason,
  onChange,
}: {
  status: AttendanceStatus | null;
  disabled?: boolean;
  disabledReason?: string;
  onChange: (next: AttendanceStatus) => void;
}) {
  const current = statusLabel(status);

  return (
    <Dropdown
      size="small"
      className="ncas-status-dd"
      value={current}
      selectedOptions={status ? [status] : []}
      disabled={disabled}
      title={disabled ? disabledReason : `Recorded as ${current}`}
      aria-label={
        disabled
          ? `Attendance status ${current}. ${disabledReason ?? ''}`
          : `Attendance status ${current}. Choose a status to change it.`
      }
      onOptionSelect={(_, data) => {
        const next = data.optionValue as AttendanceStatus | undefined;
        // Re-picking the status that is already recorded is not a change.
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
