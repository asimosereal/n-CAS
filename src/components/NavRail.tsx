'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Caption1, Text } from '@/lib/fluent';
import {
  Board20Regular,
  CalendarLtr20Regular,
  DocumentTable20Regular,
  Scan20Regular,
  ShieldTask20Regular,
} from '@fluentui/react-icons';

/**
 * NavRail
 * ------------------------------------------------------------------
 * The window's only navigation. Four destinations, grouped the way the register
 * is actually worked through during a lesson: the reader records, the dashboard
 * watches, the review screen corrects, the summary closes the class.
 */

const GROUPS: { heading: string; items: { href: string; label: string; icon: React.ReactElement }[] }[] = [
  {
    heading: 'Attendance',
    items: [
      { href: '/', label: 'Reader station', icon: <Scan20Regular /> },
      { href: '/dashboard', label: 'Attendance dashboard', icon: <Board20Regular /> },
    ],
  },
  {
    heading: 'Records',
    items: [
      { href: '/review', label: 'Review and override', icon: <ShieldTask20Regular /> },
      { href: '/summary', label: 'Class summary', icon: <DocumentTable20Regular /> },
      { href: '/events', label: 'Special Events', icon: <CalendarLtr20Regular /> },
    ],
  },
];

export function NavRail() {
  const pathname = usePathname();

  return (
    <nav className="ncas-nav" aria-label="Main">
      <div className="ncas-brand">
        <span className="ncas-brand__mark" aria-hidden>
          nC
        </span>
        <span>
          <span className="ncas-brand__name">n-CAS</span>
          <br />
          <Caption1 className="ncas-muted">Attendance system</Caption1>
        </span>
      </div>

      {GROUPS.map((group) => (
        <React.Fragment key={group.heading}>
          <Text className="ncas-nav__group" as="h2">
            {group.heading}
          </Text>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="ncas-nav__item"
              aria-current={pathname === item.href ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </React.Fragment>
      ))}

      <div className="ncas-nav__spacer" />

      <div className="ncas-brand" style={{ paddingBottom: 0 }}>
        <Caption1 className="ncas-muted">
          Room B420 · Reader T-01
          <br />
          Software v1.0
        </Caption1>
      </div>
    </nav>
  );
}
