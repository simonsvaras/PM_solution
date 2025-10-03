import { useEffect, useId, useMemo, useState } from 'react';
import './ProjectReportLongTermPage.css';
import type {
  ErrorResponse,
  ProjectLongTermReportMeta,
  ProjectLongTermReportMonth,
  ProjectLongTermReportResponse,
  ProjectOverviewDTO,
} from '../api';
import { getProjectLongTermReport } from '../api';

type ProjectReportLongTermPageProps = {
  project: ProjectOverviewDTO;
};

type ChartPoint = {
  monthKey: string;
  monthLabel: string;
  hours: number;
  cost: number;
  cumulativeCost: number;
  burnoutPercent: number | null;
};

type StatusMessage = {
  tone: 'error' | 'muted';
  text: string;
};

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentYearRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear(), 11, 31);
  return {
    from: formatDateInput(start),
    to: formatDateInput(end),
  };
}

function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeMonthKey(value: string): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const [yearStr, monthStr] = trimmed.split('-', 2);
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }
  if (month < 1 || month > 12) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-', 2);
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return monthKey;
  }
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString('cs-CZ', {
    month: 'short',
    year: 'numeric',
  });
}

function formatHours(value: number): string {
  return value.toLocaleString('cs-CZ', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatCurrency(value: number): string {
  return value.toLocaleString('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatPercent(value: number): string {
  return value.toLocaleString('cs-CZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function getMonthKeyFromMonthStart(value: string): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return formatMonthKey(date);
  }
  return normalizeMonthKey(value);
}

export default function ProjectReportLongTermPage({ project }: ProjectReportLongTermPageProps) {
  const defaultRange = useMemo(() => getCurrentYearRange(), []);
  const [fromValue, setFromValue] = useState(defaultRange.from);
  const [toValue, setToValue] = useState(defaultRange.to);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [reportMonths, setReportMonths] = useState<ProjectLongTermReportMonth[]>([]);
  const [reportMeta, setReportMeta] = useState<ProjectLongTermReportMeta | null>(null);
  const [totalHours, setTotalHours] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const chartTitleId = useId();
  const chartDescId = `${chartTitleId}-desc`;
  const projectId = project.id;

  useEffect(() => {
    setFromValue(defaultRange.from);
    setToValue(defaultRange.to);
    setReportMonths([]);
    setReportMeta(null);
    setTotalHours(0);
    setTotalCost(0);
    setValidationError(null);
    setError(null);
  }, [project.id, defaultRange.from, defaultRange.to]);

  useEffect(() => {
    const parsedFrom = parseDateInput(fromValue);
    const parsedTo = parseDateInput(toValue);

    if (!fromValue || !toValue) {
      setValidationError('Zadejte období od a do.');
      setError(null);
      setLoading(false);
      setReportMonths([]);
      setReportMeta(null);
      setTotalHours(0);
      setTotalCost(0);
      return;
    }

    if (!parsedFrom || !parsedTo) {
      setValidationError('Datum musí být ve formátu RRRR-MM-DD.');
      setError(null);
      setLoading(false);
      setReportMonths([]);
      setReportMeta(null);
      setTotalHours(0);
      setTotalCost(0);
      return;
    }

    if (parsedFrom > parsedTo) {
      setValidationError('Datum "Od" nesmí být později než datum "Do".');
      setError(null);
      setLoading(false);
      setReportMonths([]);
      setReportMeta(null);
      setTotalHours(0);
      setTotalCost(0);
      return;
    }

    setValidationError(null);
    setLoading(true);
    setError(null);

    let ignore = false;
    getProjectLongTermReport(projectId, { from: fromValue, to: toValue })
      .then((response: ProjectLongTermReportResponse) => {
        if (ignore) {
          return;
        }
        setReportMeta(response.meta ?? null);
        setReportMonths(Array.isArray(response.months) ? response.months : []);
        setTotalHours(typeof response.totalHours === 'number' ? response.totalHours : 0);
        setTotalCost(typeof response.totalCost === 'number' ? response.totalCost : 0);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ignore) {
          return;
        }
        const fallbackError: ErrorResponse = {
          error: {
            code: 'unknown',
            message: 'Nepodařilo se načíst dlouhodobý report.',
            httpStatus: 0,
          },
        };
        if (err && typeof err === 'object' && 'error' in err) {
          setError(err as ErrorResponse);
        } else {
          setError(fallbackError);
        }
        setReportMonths([]);
        setReportMeta(null);
        setTotalHours(0);
        setTotalCost(0);
        setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [projectId, fromValue, toValue]);

  const monthRange = useMemo(() => {
    const start = parseDateInput(fromValue);
    const end = parseDateInput(toValue);
    if (!start || !end) {
      return [];
    }
    const months: string[] = [];
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const lastMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    while (cursor <= lastMonth) {
      months.push(formatMonthKey(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return months;
  }, [fromValue, toValue]);

  const resolvedBudget = useMemo(() => {
    const metaBudget = reportMeta?.budget;
    if (typeof metaBudget === 'number' && Number.isFinite(metaBudget) && metaBudget > 0) {
      return metaBudget;
    }
    const projectBudget = project?.budget;
    if (typeof projectBudget === 'number' && Number.isFinite(projectBudget) && projectBudget > 0) {
      return projectBudget;
    }
    return null;
  }, [reportMeta?.budget, project?.budget]);

  const chartPoints = useMemo<ChartPoint[]>(() => {
    if (monthRange.length === 0) {
      return [];
    }
    const normalizedMonths = new Map<string, ProjectLongTermReportMonth>();
    for (const month of reportMonths) {
      const key = getMonthKeyFromMonthStart(month.monthStart);
      if (!key) {
        continue;
      }
      normalizedMonths.set(key, month);
    }
    let previousCumulativeCost = 0;
    let previousBurnRatio: number | null = null;
    return monthRange.map(monthKey => {
      const entry = normalizedMonths.get(monthKey);
      const hours = entry?.hours ?? 0;
      const cost = entry?.cost ?? 0;
      const cumulativeCost = entry ? entry.cumulativeCost : previousCumulativeCost;
      const burnRatio = entry ? entry.burnRatio : previousBurnRatio;
      previousCumulativeCost = cumulativeCost;
      previousBurnRatio = burnRatio;
      const burnoutPercent =
        resolvedBudget && resolvedBudget > 0
          ? burnRatio !== null && Number.isFinite(burnRatio)
            ? burnRatio * 100
            : (cumulativeCost / resolvedBudget) * 100
          : null;
      return {
        monthKey,
        monthLabel: formatMonthLabel(monthKey),
        hours,
        cost,
        cumulativeCost,
        burnoutPercent: resolvedBudget ? burnoutPercent : null,
      };
    });
  }, [monthRange, reportMonths, resolvedBudget]);

  const hasBudget = typeof resolvedBudget === 'number' && Number.isFinite(resolvedBudget) && resolvedBudget > 0;
  const burnoutPercentTotal = hasBudget && resolvedBudget
    ? Math.min((totalCost / resolvedBudget) * 100, 999)
    : null;

  const hasHoursData = chartPoints.some(point => point.hours > 0);
  const hasBurnoutData = chartPoints.some(point =>
    point.burnoutPercent !== null && Number.isFinite(point.burnoutPercent) && point.burnoutPercent > 0,
  );
  const hasChartData = (hasHoursData || hasBurnoutData) && chartPoints.length > 0;

  const statusMessage: StatusMessage | null = validationError
    ? { tone: 'error', text: validationError }
    : error
    ? { tone: 'error', text: error.error?.message ?? 'Nepodařilo se načíst dlouhodobý report.' }
    : loading
    ? { tone: 'muted', text: 'Načítám data…' }
    : null;

  const chartHeight = 320;
  const paddingX = 56;
  const paddingY = 40;
  const plotHeight = chartHeight - paddingY * 2;
  const nominalPlotWidth = Math.max(chartPoints.length * 72, 320);
  const chartWidth = nominalPlotWidth + paddingX * 2;
  const step = chartPoints.length > 1 ? nominalPlotWidth / (chartPoints.length - 1) : 0;

  const getPointX = (index: number) =>
    chartPoints.length === 1 ? paddingX + nominalPlotWidth / 2 : paddingX + step * index;
  const barWidth = chartPoints.length > 1 ? Math.min(36, step * 0.6) : Math.min(60, nominalPlotWidth * 0.4);

  const maxHours = chartPoints.reduce((max, point) => Math.max(max, point.hours), 0);
  const maxBurnout = chartPoints.reduce((max, point) => {
    if (point.burnoutPercent === null || Number.isNaN(point.burnoutPercent)) {
      return max;
    }
    return Math.max(max, point.burnoutPercent);
  }, 0);
  const burnoutScaleMax = hasBudget
    ? Math.max(100, Math.ceil(maxBurnout / 10) * 10 || 100)
    : 0;

  const burnoutPath = hasBudget && hasChartData
    ? chartPoints
        .map((point, index) => {
          const percent = point.burnoutPercent ?? 0;
          const boundedPercent = Math.max(0, Math.min(percent, burnoutScaleMax));
          const x = getPointX(index);
          const y = paddingY + (plotHeight - (boundedPercent / burnoutScaleMax) * plotHeight);
          const command = index === 0 ? 'M' : 'L';
          return `${command}${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(' ')
    : '';

  const legendItems = useMemo(
    () =>
      hasBudget
        ? (
            [
              { key: 'hours' as const, label: 'Měsíční odpracované hodiny' },
              { key: 'burnout' as const, label: 'Kumulativní vyčerpání rozpočtu' },
            ]
          )
        : ([{ key: 'hours' as const, label: 'Měsíční odpracované hodiny' }] as const),
    [hasBudget],
  );

  const emptyState = !loading && !error && !validationError && !hasChartData && chartPoints.length > 0;

  const statusClassName = statusMessage
    ? [
        'projectLongTerm__status',
        statusMessage.tone === 'error' ? 'projectLongTerm__status--error' : null,
        statusMessage.tone === 'muted' ? 'projectLongTerm__status--muted' : null,
      ]
        .filter(isNonNull)
        .join(' ')
    : '';

  return (
    <div className="projectLongTerm" data-testid="project-long-term-page">
      <section className="projectLongTerm__controls" aria-label="Filtry dlouhodobého reportu">
        <div className="projectLongTerm__filters">
          <label>
            <span>Období od</span>
            <input
              type="date"
              value={fromValue}
              max={toValue || undefined}
              onChange={event => setFromValue(event.target.value)}
            />
          </label>
          <label>
            <span>Období do</span>
            <input
              type="date"
              value={toValue}
              min={fromValue || undefined}
              onChange={event => setToValue(event.target.value)}
            />
          </label>
        </div>
        <div className="projectLongTerm__summary" aria-live="polite">
          <div className="projectLongTerm__summaryItem">
            <span className="projectLongTerm__summaryLabel">Celkem hodin</span>
            <strong className="projectLongTerm__summaryValue">{formatHours(totalHours)}</strong>
          </div>
          <div className="projectLongTerm__summaryItem">
            <span className="projectLongTerm__summaryLabel">Celkem náklady</span>
            <strong className="projectLongTerm__summaryValue">{formatCurrency(totalCost)}</strong>
          </div>
          <div className="projectLongTerm__summaryItem">
            <span className="projectLongTerm__summaryLabel">Vyčerpání rozpočtu</span>
            <strong className="projectLongTerm__summaryValue">
              {hasBudget && burnoutPercentTotal !== null
                ? `${formatPercent(Math.min(burnoutPercentTotal, 999))} %`
                : '—'}
            </strong>
          </div>
        </div>
      </section>

      {statusMessage ? (
        <p className={statusClassName} role={statusMessage.tone === 'error' ? 'alert' : 'status'}>
          {statusMessage.text}
        </p>
      ) : null}

      <section className="projectLongTerm__chartCard">
        <header className="projectLongTerm__chartHeader">
          <h2>Dlouhodobý vývoj</h2>
          <ul className="projectLongTerm__legend" aria-label="Legenda grafu">
            {legendItems.map(item => (
              <li key={item.key} className="projectLongTerm__legendItem">
                <span
                  className={`projectLongTerm__legendSwatch projectLongTerm__legendSwatch--${item.key}`}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </header>
        <div className="projectLongTerm__chartWrapper">
          {hasChartData ? (
            <svg
              className="projectLongTerm__chartSvg"
              role="img"
              width={chartWidth}
              height={chartHeight}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="none"
              style={{ width: chartWidth, maxWidth: '100%', height: 'auto' }}
              aria-labelledby={`${chartTitleId} ${chartDescId}`}
            >
              <title id={chartTitleId}>{`Dlouhodobý report projektu ${project.name}`}</title>
              <desc id={chartDescId}>
                Sloupce zobrazují měsíční součty hodin, linie vyjadřuje kumulativní vyčerpání rozpočtu.
              </desc>
              <line
                x1={paddingX}
                x2={chartWidth - paddingX}
                y1={chartHeight - paddingY}
                y2={chartHeight - paddingY}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              {Array.from({ length: 4 }, (_, index) => {
                const fraction = (index + 1) / 4;
                const y = paddingY + plotHeight * (1 - fraction);
                return (
                  <line
                    key={`grid-${index}`}
                    x1={paddingX}
                    x2={chartWidth - paddingX}
                    y1={y}
                    y2={y}
                    stroke="rgba(15, 23, 42, 0.08)"
                    strokeWidth={1}
                  />
                );
              })}
              {chartPoints.map((point, index) => {
                const xCenter = getPointX(index);
                const heightRatio = maxHours > 0 ? point.hours / maxHours : 0;
                const barHeight = heightRatio * plotHeight;
                const y = paddingY + (plotHeight - barHeight);
                return (
                  <g key={`bar-${point.monthKey}`}>
                    <rect
                      x={xCenter - barWidth / 2}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      rx={6}
                      ry={6}
                      fill="var(--color-accent-strong)"
                    >
                      <title>{`${point.monthLabel}: ${formatHours(point.hours)} hodin`}</title>
                    </rect>
                    <text
                      x={xCenter}
                      y={chartHeight - paddingY + 24}
                      textAnchor="middle"
                      className="projectLongTerm__chartLabel"
                    >
                      {point.monthLabel}
                    </text>
                  </g>
                );
              })}
              {hasBudget && burnoutPath ? (
                <>
                  <path
                    d={burnoutPath}
                    fill="none"
                    stroke="var(--project-long-term-burnout)"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {chartPoints.map((point, index) => {
                    const percent = point.burnoutPercent ?? 0;
                    const boundedPercent = Math.max(0, Math.min(percent, burnoutScaleMax));
                    const x = getPointX(index);
                    const y = paddingY + (plotHeight - (boundedPercent / burnoutScaleMax) * plotHeight);
                    return (
                      <g key={`burnout-${point.monthKey}`}>
                        <circle cx={x} cy={y} r={4} fill="var(--project-long-term-burnout)" />
                        <title>
                          {`${point.monthLabel}: ${formatPercent(Math.max(0, Math.min(percent, 999)))} % rozpočtu`}
                        </title>
                      </g>
                    );
                  })}
                </>
              ) : null}
            </svg>
          ) : (
            <p className="projectLongTerm__empty" role="status">
              {emptyState
                ? 'Za zvolené období nejsou dostupná data.'
                : 'Žádná data k zobrazení.'}
            </p>
          )}
        </div>
        {!hasBudget ? (
          <p className="projectLongTerm__status" role="status">
            Rozpočet projektu není nastaven, průběh vyčerpání proto není k dispozici.
          </p>
        ) : null}
      </section>
    </div>
  );
}
