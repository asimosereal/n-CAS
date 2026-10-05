'use client';

import React from 'react';

import { Caption1 } from '@/lib/fluent';

/**
 * Metric
 * ------------------------------------------------------------------
 * One number from the class summary. Kept as its own component so the dashboard
 * and the summary screen report the same figures in the same shape — the four
 * counters are the same four counters on both.
 */

export type MetricTone = 'success' | 'caution' | 'critical' | 'attention' | 'accent' | 'neutral';

export function Metric({
  value,
  label,
  tone = 'neutral',
}: {
  value: React.ReactNode;
  label: string;
  tone?: MetricTone;
}) {
  return (
    <div className={`ncas-metric${tone === 'neutral' ? '' : ` ncas-metric--${tone}`}`}>
      <span className="ncas-metric__value ncas-tabular">{value}</span>
      <Caption1 className="ncas-metric__label">{label}</Caption1>
    </div>
  );
}
