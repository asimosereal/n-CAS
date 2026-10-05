'use client';

import React from 'react';

import {
  Button,
  Caption1,
  Combobox,
  Field,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Text,
} from '@/lib/fluent';
import {
  CalendarLtr20Regular,
  ChevronLeft20Regular,
  ChevronRight20Regular,
} from '@fluentui/react-icons';

/**
 * Date and time fields
 * ==================================================================
 * Fluent UI React v9 does not ship a date or time picker: `DatePicker` and
 * `TimePicker` live in `@fluentui/react-datepicker-compat`, which still pins
 * React to `<20` and so cannot be installed here. These two fields build the
 * same interaction out of the Fluent primitives that are present — a Button
 * that opens a surface, a month of Buttons, a Combobox of times — which means
 * they inherit the WinUI layer's styling exactly as every other control does,
 * and add no dependency.
 *
 * Both are deliberately the shape Windows uses: the date field opens a calendar
 * grid, the time field opens a list of times.
 */

/* ------------------------------------------------------------------ */
/* Date helpers — local time, never UTC, so a day cannot slip a date    */
/* ------------------------------------------------------------------ */

export function toIso(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function fromIso(value: string): Date | null {
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Six weeks of days, starting on the Monday on or before the first of the month. */
function monthMatrix(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  return Array.from(
    { length: 42 },
    (_, i) => new Date(year, month, 1 - offset + i),
  );
}

export function formatLongDate(iso: string): string {
  const date = fromIso(iso);
  if (!date) return '—';
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** The same date without the weekday, for a table column that has no room for it. */
export function formatTableDate(iso: string): string {
  const date = fromIso(iso);
  if (!date) return '—';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function DateField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  hint?: string;
}) {
  const selected = fromIso(value);
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState(() => {
    const base = selected ?? new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const step = (delta: number) => {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const days = monthMatrix(view.year, view.month);
  const todayIso = toIso(new Date());

  return (
    <Field label={label} hint={hint}>
      <Popover
        open={open}
        onOpenChange={(_, data) => {
          setOpen(data.open);
          if (data.open && selected) {
            setView({ year: selected.getFullYear(), month: selected.getMonth() });
          }
        }}
      >
        <PopoverTrigger disableButtonEnhancement>
          <Button
            appearance="secondary"
            icon={<CalendarLtr20Regular />}
            iconPosition="after"
            style={{ width: '100%', justifyContent: 'space-between' }}
          >
            {formatLongDate(value)}
          </Button>
        </PopoverTrigger>

        <PopoverSurface style={{ padding: 12 }}>
          <div className="ncas-cal">
            <div className="ncas-cal__head">
              <Button
                appearance="subtle"
                size="small"
                icon={<ChevronLeft20Regular />}
                aria-label="Previous month"
                onClick={() => step(-1)}
              />
              <Text weight="semibold">
                {MONTHS[view.month]} {view.year}
              </Text>
              <Button
                appearance="subtle"
                size="small"
                icon={<ChevronRight20Regular />}
                aria-label="Next month"
                onClick={() => step(1)}
              />
            </div>

            <div className="ncas-cal__grid" role="grid" aria-label="Calendar">
              {WEEKDAYS.map((w, i) => (
                <span key={`${w}-${i}`} className="ncas-cal__weekday" aria-hidden>
                  {w}
                </span>
              ))}
              {days.map((day) => {
                const iso = toIso(day);
                const outside = day.getMonth() !== view.month;
                const isSelected = iso === value;
                return (
                  <Button
                    key={iso}
                    appearance={isSelected ? 'primary' : 'subtle'}
                    size="small"
                    className="ncas-cal__day"
                    data-outside={outside}
                    data-today={iso === todayIso}
                    aria-label={formatLongDate(iso)}
                    aria-pressed={isSelected}
                    onClick={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                  >
                    {day.getDate()}
                  </Button>
                );
              })}
            </div>

            <div className="ncas-cal__foot">
              <Caption1 className="ncas-muted">Shown as {formatLongDate(value)}</Caption1>
              <Button
                appearance="subtle"
                size="small"
                onClick={() => {
                  const now = new Date();
                  onChange(toIso(now));
                  setView({ year: now.getFullYear(), month: now.getMonth() });
                  setOpen(false);
                }}
              >
                Today
              </Button>
            </div>
          </div>
        </PopoverSurface>
      </Popover>
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* Time                                                                */
/* ------------------------------------------------------------------ */

/** Every five minutes across the school day. */
const TIMES: string[] = (() => {
  const out: string[] = [];
  for (let m = 7 * 60; m <= 17 * 60; m += 5) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
})();

/** "9:5" and "09:05" both mean 09:05; anything else is rejected. */
export function normaliseTime(raw: string): string | null {
  const m = /^(\d{1,2}):?(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function TimeField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (time: string) => void;
  hint?: string;
}) {
  const [text, setText] = React.useState(value);

  React.useEffect(() => setText(value), [value]);

  return (
    <Field label={label} hint={hint}>
      <Combobox
        freeform
        value={text}
        selectedOptions={value ? [value] : []}
        placeholder="Select a time"
        onOptionSelect={(_, data) => {
          if (data.optionValue) {
            setText(data.optionValue);
            onChange(data.optionValue);
          }
        }}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          const parsed = normaliseTime(raw);
          // Only a time the school day contains is allowed through, so a typo
          // cannot leave the form holding something the engine cannot compare.
          if (parsed && TIMES.includes(parsed)) onChange(parsed);
        }}
      >
        {TIMES.map((t) => (
          <Option key={t} value={t}>
            {t}
          </Option>
        ))}
      </Combobox>
    </Field>
  );
}

/** The times the time field offers, for a caller that needs to dress a value. */
export const TIME_OPTIONS = TIMES;
