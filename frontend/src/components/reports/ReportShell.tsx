'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { getMonthRange, getYearRange } from '@/lib/report-dates';

export default function ReportShell({
  title,
  hint,
  startDate,
  endDate,
  maxDate,
  onStartDate,
  onEndDate,
  extra,
  loading,
  children,
  startLabel,
  endLabel,
}: {
  title: string;
  hint?: string;
  startDate?: string;
  endDate?: string;
  maxDate?: string;
  onStartDate?: (value: string) => void;
  onEndDate?: (value: string) => void;
  extra?: ReactNode;
  loading: boolean;
  children: ReactNode;
  startLabel?: string;
  endLabel?: string;
}) {
  const t = useTranslations('reports');
  const canPreset = Boolean(onStartDate && onEndDate && startDate && endDate && maxDate);
  const monthStart = maxDate ? getMonthRange(maxDate.slice(0, 7)).startDate : '';
  const yearStart = maxDate ? getYearRange(maxDate.slice(0, 4)).startDate : '';
  const applyRange = (nextStart: string, nextEnd: string) => {
    onStartDate?.(nextStart);
    onEndDate?.(nextEnd);
  };
  const presetActive = (nextStart: string) => startDate === nextStart && endDate === maxDate;

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPreset && maxDate ? (
            <div className="flex h-9 rounded-lg border border-border bg-card p-1" role="group" aria-label={t('periodPresets')}>
              {([
                { id: 'day', start: maxDate, label: t('periodDay') },
                { id: 'month', start: monthStart, label: t('periodMonth') },
                { id: 'year', start: yearStart, label: t('periodYear') },
              ] as const).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyRange(preset.start, maxDate)}
                  className={`min-w-16 rounded-md px-3 text-sm font-medium transition-colors ${presetActive(preset.start) ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}
                  aria-pressed={presetActive(preset.start)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}
          {onStartDate && startDate ? (
            <input
              type="date"
              value={startDate}
              max={maxDate || endDate}
              onChange={(event) => event.target.value && onStartDate(event.target.value)}
              className="h-9 px-3 text-sm border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
              aria-label={startLabel}
            />
          ) : null}
          {onEndDate && endDate ? (
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={maxDate}
              onChange={(event) => event.target.value && onEndDate(event.target.value)}
              className="h-9 px-3 text-sm border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
              aria-label={endLabel}
            />
          ) : null}
          {extra}
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
