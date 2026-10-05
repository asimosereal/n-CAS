'use client';

import React from 'react';

import { Body1, Title2 } from '@/lib/fluent';

/**
 * PageHeader
 * ------------------------------------------------------------------
 * The title band every desktop screen shares: the screen's name, a one-line
 * statement of what the screen is for, the facts a teacher needs while looking
 * at it (class, room, clock) and the screen's own commands on the right.
 *
 * Keeping this in one component is what makes screens 2-4 read as one
 * application rather than three mockups.
 */

export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
}: {
  title: string;
  subtitle?: string;
  /** the header's fact row — class, time, live indicator, and so on */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="ncas-header">
      <div className="ncas-header__titles">
        <Title2 as="h1" style={{ margin: 0 }}>
          {title}
        </Title2>
        {subtitle ? (
          <Body1 as="p" className="ncas-muted" style={{ margin: '4px 0 0' }}>
            {subtitle}
          </Body1>
        ) : null}
        {meta ? <div className="ncas-header__meta">{meta}</div> : null}
      </div>
      {actions ? <div className="ncas-header__actions">{actions}</div> : null}
    </header>
  );
}

/** One labelled fact in a header's meta row. */
export function HeaderField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="ncas-field">
      <span className="ncas-field__label">{label}</span>
      <span className="ncas-field__value ncas-tabular">{value}</span>
    </div>
  );
}

/** The attendance-active indicator required by the specification. */
export function LiveIndicator({ children }: { children: React.ReactNode }) {
  return (
    <span className="ncas-live">
      <span className="ncas-live__dot" aria-hidden />
      {children}
    </span>
  );
}
