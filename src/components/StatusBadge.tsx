'use client';

import React from 'react';

import { Badge } from '@/lib/fluent';
import type { AttendanceRecord, BreakStatus } from '@/lib/types';

/**
 * Status badges
 * ------------------------------------------------------------------
 * One place decides how every state is coloured, so the dashboard, the review
 * screen and the summary cannot drift apart. Labels are sentence case, which is
 * what both WinUI and the Fluent 2 typography rules use for a badge — the
 * colour carries the emphasis, not capital letters.
 */

export function AttendanceBadge({ status }: { status: AttendanceRecord['status'] | null }) {
  if (!status) {
    return (
      <Badge appearance="tint" color="informative">
        Not recorded
      </Badge>
    );
  }
  if (status === 'PRESENT') {
    return (
      <Badge appearance="tint" color="success">
        Present
      </Badge>
    );
  }
  if (status === 'LATE') {
    return (
      <Badge appearance="tint" color="warning">
        Late
      </Badge>
    );
  }
  return (
    <Badge appearance="tint" color="danger">
      Absent
    </Badge>
  );
}

export function ReviewBadge({ record }: { record: AttendanceRecord | null }) {
  if (!record || record.reviewStatus === 'NONE') {
    return <span className="ncas-muted">—</span>;
  }
  if (record.reviewStatus === 'PENDING') {
    return (
      <Badge appearance="tint" color="important">
        Review required
      </Badge>
    );
  }
  if (record.reviewStatus === 'CONFIRMED') {
    return (
      <Badge appearance="tint" color="success">
        Confirmed
      </Badge>
    );
  }
  return (
    <Badge appearance="tint" color="informative">
      Overridden
    </Badge>
  );
}

export function BreakBadge({
  status,
  minutes,
}: {
  status: BreakStatus;
  minutes: number;
}) {
  if (status === 'NONE') return <span className="ncas-muted">—</span>;
  if (status === 'CLOSED') {
    return (
      <Badge appearance="tint" color="informative">
        {String(minutes).padStart(2, '0')} min
      </Badge>
    );
  }
  if (status === 'ON_BREAK') {
    return (
      <Badge appearance="tint" color="warning">
        On break
      </Badge>
    );
  }
  return (
    <Badge appearance="tint" color="important">
      Pending review
    </Badge>
  );
}

/** A row that needs a teacher is marked on every screen with the same accent. */
export function needsAttention(record: AttendanceRecord | null): boolean {
  if (!record) return false;
  return record.reviewStatus === 'PENDING' || record.breakStatus === 'UNRESOLVED';
}

/** The inline style that marks such a row, applied to the first cell so the
 *  accent sits against the panel edge rather than inside the row. */
export function rowAccent(record: AttendanceRecord | null): React.CSSProperties {
  return needsAttention(record)
    ? { boxShadow: 'inset 3px 0 0 0 var(--winui-system-fill-attention)' }
    : {};
}
