import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import './ProjectReportLongTermPage.css';
import type {
  ErrorResponse,
  ProjectLongTermReportMeta,
  ProjectLongTermReportMonth,
  ProjectLongTermReportResponse,
  ProjectMilestoneCostSummary,
  ProjectMilestoneSummary,
  ProjectOverviewDTO,
} from '../api';
import {
  getProjectActiveMilestones,
  getProjectLongTermReport,
  getProjectMilestoneCostSummary,
} from '../api';

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

type SelectedMilestoneTableRow = {
  id: number;
  title: string;
  description: string;
  cost: number;
  dueDate: string | null;
};

type MilestoneTableSort = {
  column: 'title' | 'cost';
  direction: 'asc' | 'desc';
};

// Formats a Date instance to the YYYY-MM string used in API calls and chart ranges.
function formatMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Builds an ISO date string from individual parts when querying a specific year span.
function formatYearDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Normalizes arbitrary strings into YYYY-MM keys while guarding against invalid input.
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

// Converts the YYYY-MM key into a short Czech label for axis annotations.
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

// Human friendly formatting for hour totals shown in the chart.
function formatHours(value: number): string {
  return value.toLocaleString('cs-CZ', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

// Consistent currency formatting for cost figures across the UI.
function formatCurrency(value: number): string {
  return value.toLocaleString('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// Formats percentage values used in the burnout axis/tooltips.
function formatPercent(value: number): string {
  return value.toLocaleString('cs-CZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Creates a stable label for the milestone multi-select that combines IID with a sanitized title
 * so that users can quickly orient themselves even when titles are missing.
 */
function formatMilestoneOptionLabel(milestone: ProjectMilestoneCostSummary): string {
  const title = resolveMilestoneTitle(milestone.title);
  return `#${milestone.milestoneIid} — ${title}`;
}

function resolveMilestoneTitle(title?: string | null): string {
  const trimmedTitle = title?.trim();
  return trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : 'Bez názvu';
}

function formatMilestoneDescription(description?: string | null): string {
  if (typeof description !== 'string') {
    return '—';
  }
  const trimmed = description.trim();
  return trimmed.length > 0 ? trimmed : '—';
}

// Friendly fallback-heavy formatter for milestone deadlines.
function formatMilestoneDueDate(value?: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('cs-CZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// Normalises API cost payloads that may arrive as numbers or strings.
function resolveMilestoneCost(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

/**
 * Normalises a month string received from the backend to the YYYY-MM format used within chart
 * calculations. Handles both ISO timestamps and already normalised keys.
 */
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

/**
 * Combines the long-term monthly report view with milestone cost comparisons for a single project.
 * The component orchestrates data loading and renders SVG visualisations without external chart
 * dependencies to keep the bundle size small.
 */
export default function ProjectReportLongTermPage({ project }: ProjectReportLongTermPageProps) {
  // Cache the sliding window of selectable years so the dropdown stays deterministic.
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const availableYears = useMemo(() => {
    const years: number[] = [];
    for (let offset = 0; offset < 5; offset += 1) {
      years.push(currentYear - offset);
    }
    return years;
  }, [currentYear]);
  const [selectedYear, setSelectedYear] = useState<number>(availableYears[0]);
  // Pre-compute the ISO range parameters for the currently selected year.
  const fromValue = useMemo(() => formatYearDate(selectedYear, 1, 1), [selectedYear]);
  const toValue = useMemo(() => formatYearDate(selectedYear, 12, 31), [selectedYear]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [reportMonths, setReportMonths] = useState<ProjectLongTermReportMonth[]>([]);
  const [reportMeta, setReportMeta] = useState<ProjectLongTermReportMeta | null>(null);
  const [totalHours, setTotalHours] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [milestoneCosts, setMilestoneCosts] = useState<ProjectMilestoneCostSummary[]>([]);
  const [loadingMilestoneCosts, setLoadingMilestoneCosts] = useState(false);
  const [milestoneCostError, setMilestoneCostError] = useState<ErrorResponse | null>(null);
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<number[]>([]);
  const [milestoneMetadata, setMilestoneMetadata] = useState<Map<number, ProjectMilestoneSummary>>(new Map());
  const [milestoneTableSort, setMilestoneTableSort] = useState<MilestoneTableSort>({
    column: 'title',
    direction: 'asc',
  });
  const chartTitleId = useId();
  const chartDescId = `${chartTitleId}-desc`;
  const milestoneChartTitleId = useId();
  const milestoneChartDescId = `${milestoneChartTitleId}-desc`;
  const milestoneSelectLabelId = useId();
  const milestoneChecklistId = useId();
  const milestoneSelectHintId = useId();
  const projectId = project.id;

  // Reset the local state whenever the project changes so that the date range and derived caches
  // always reflect the newly selected project without carrying over previous data.
  useEffect(() => {
    setSelectedYear(availableYears[0]);
    setReportMonths([]);
    setReportMeta(null);
    setTotalHours(0);
    setTotalCost(0);
    setError(null);
    setMilestoneCosts([]);
    setSelectedMilestoneIds([]);
    setMilestoneCostError(null);
    setMilestoneMetadata(new Map());
    setMilestoneTableSort({ column: 'title', direction: 'asc' });
  }, [project.id, availableYears]);

  // Fetch the long-term project report for the currently selected year.
  useEffect(() => {
    setLoading(true);
    setError(null);
    setReportMonths([]);
    setReportMeta(null);
    setTotalHours(0);
    setTotalCost(0);

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
            message: 'Nepoda?ilo se na??st dlouhodob? report.',
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

  // Keep the milestone cost dataset in sync with the project selection and preserve any previously
  // selected milestone IDs when they are still present in the refreshed payload.
  useEffect(() => {
    let ignore = false;
    setLoadingMilestoneCosts(true);
    setMilestoneCostError(null);
    getProjectMilestoneCostSummary(projectId)
      .then(response => {
        if (ignore) {
          return;
        }
        const normalized = Array.isArray(response) ? response : [];
        setMilestoneCosts(normalized);
        setSelectedMilestoneIds(prev => {
          if (prev.length > 0) {
            const preserved = normalized
              .map(item => item.milestoneId)
              .filter(id => prev.includes(id));
            if (preserved.length > 0) {
              return preserved;
            }
          }
          return [];
        });
        setLoadingMilestoneCosts(false);
      })
      .catch(err => {
        if (ignore) {
          return;
        }
        if (err && typeof err === 'object' && 'error' in err) {
          setMilestoneCostError(err as ErrorResponse);
        } else {
          setMilestoneCostError({
            error: {
              code: 'unknown',
              message: 'Nepodařilo se načíst náklady milníků.',
              httpStatus: 0,
            },
          });
        }
        setMilestoneCosts([]);
        setSelectedMilestoneIds([]);
        setLoadingMilestoneCosts(false);
      });
    return () => {
      ignore = true;
    };
  }, [projectId]);

  // Load supplementary metadata (title, due date) to enrich the milestone table.
  useEffect(() => {
    let ignore = false;
    getProjectActiveMilestones(projectId, true)
      .then(response => {
        if (ignore) {
          return;
        }
        const map = new Map<number, ProjectMilestoneSummary>();
        response.forEach(item => map.set(item.milestoneId, item));
        setMilestoneMetadata(map);
      })
      .catch(() => {
        if (!ignore) {
          setMilestoneMetadata(new Map());
        }
      });
    return () => {
      ignore = true;
    };
  }, [projectId]);

  const monthRange = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) =>
      formatMonthKey(new Date(Date.UTC(selectedYear, index, 1))),
    );
  }, [selectedYear]);

  // Read a usable numeric budget from the optional metadata payload.
  const resolvedBudget = useMemo(() => {
    const metaBudget = reportMeta?.budget;
    if (typeof metaBudget === 'number' && Number.isFinite(metaBudget) && metaBudget > 0) {
      return metaBudget;
    }
    return null;
  }, [reportMeta?.budget]);

  // Merge the backend months with the generated month range to fill gaps and compute cumulative metrics.
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

  // Budget-aware helpers that drive whether the burnout visuals are rendered.
  const hasBudget = typeof resolvedBudget === 'number' && Number.isFinite(resolvedBudget) && resolvedBudget > 0;
  const burnoutPercentTotal = hasBudget && resolvedBudget
    ? Math.min((totalCost / resolvedBudget) * 100, 999)
    : null;

  const hasHoursData = chartPoints.some(point => point.hours > 0);
  const hasBurnoutData = chartPoints.some(point =>
    point.burnoutPercent !== null && Number.isFinite(point.burnoutPercent) && point.burnoutPercent > 0,
  );
  const hasChartData = (hasHoursData || hasBurnoutData) && chartPoints.length > 0;

  // Surface loading/error states for the primary annual report request.
  const statusMessage: StatusMessage | null = error
    ? { tone: 'error', text: error.error?.message ?? 'Nepodařilo se načíst dlouhodobý report.' }
    : loading
    ? { tone: 'muted', text: 'Načítám data…' }
    : null;

  // Derived dimensions for the main annual chart.
  const chartHeight = 360;
  const paddingX = 56;
  const paddingTop = 80;
  const paddingBottom = 56;
  const plotHeight = chartHeight - paddingTop - paddingBottom;
  const plotWidth = Math.max(chartPoints.length * 72, 320);
  const chartWidth = plotWidth + paddingX * 2;
  const barWidth =
    chartPoints.length > 1 ? Math.min(36, (plotWidth / chartPoints.length) * 0.6) : Math.min(60, plotWidth * 0.4);
  const usableWidth = chartPoints.length > 1 ? Math.max(plotWidth - barWidth, 1) : 0;

  const getPointX = (index: number) => {
    if (chartPoints.length === 1) {
      return paddingX + plotWidth / 2;
    }
    return paddingX + barWidth / 2 + (usableWidth * index) / (chartPoints.length - 1);
  };

  // Resolve axis scales from the current dataset so labels stay proportional.
  const maxHours = chartPoints.reduce((max, point) => Math.max(max, point.hours), 0);
  const hoursScaleMax = maxHours > 0 ? maxHours * 1.1 : 1;
  const maxBurnout = chartPoints.reduce((max, point) => {
    if (point.burnoutPercent === null || Number.isNaN(point.burnoutPercent)) {
      return max;
    }
    return Math.max(max, point.burnoutPercent);
  }, 0);
  const burnoutScaleMax = hasBudget
    ? Math.max(100, Math.ceil(maxBurnout / 10) * 10 || 100)
    : 0;

  // Build evenly spaced labels for the burnout axis so the grid scales with the data.
  const percentAxisTicks = useMemo(() => {
    if (!hasBudget || burnoutScaleMax <= 0) {
      return [] as number[];
    }
    const steps = 4;
    const stepValue = burnoutScaleMax / steps;
    return Array.from({ length: steps + 1 }, (_, index) => Number((stepValue * index).toFixed(1)));
  }, [hasBudget, burnoutScaleMax]);

  const burnoutPath = hasBudget && hasChartData
    ? chartPoints
        .map((point, index) => {
          const percent = point.burnoutPercent ?? 0;
          const boundedPercent = Math.max(0, Math.min(percent, burnoutScaleMax));
          const x = getPointX(index);
          const y = paddingTop + (plotHeight - (boundedPercent / burnoutScaleMax) * plotHeight);
          const command = index === 0 ? 'M' : 'L';
          return `${command}${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(' ')
    : '';

  // Toggle legend entries based on the presence of a project budget.
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

  // Resolve the currently selected milestone summaries so downstream calculations can work with the
  // denormalised objects rather than repeating set lookups.
  const selectedMilestoneSummaries = useMemo(() => {
    if (milestoneCosts.length === 0 || selectedMilestoneIds.length === 0) {
      return [] as ProjectMilestoneCostSummary[];
    }
    const allowed = new Set(selectedMilestoneIds);
    return milestoneCosts.filter(item => allowed.has(item.milestoneId));
  }, [milestoneCosts, selectedMilestoneIds]);

  // Flatten the selected milestone summaries into lightweight rows for the comparison table.
  const selectedMilestoneTableRows = useMemo<SelectedMilestoneTableRow[]>(() => {
    if (selectedMilestoneSummaries.length === 0) {
      return [];
    }
    return selectedMilestoneSummaries.map(summary => {
      const metadata = milestoneMetadata.get(summary.milestoneId);
      return {
        id: summary.milestoneId,
        title: resolveMilestoneTitle(metadata?.title ?? summary.title),
        description: formatMilestoneDescription(metadata?.description),
        cost: Math.max(0, resolveMilestoneCost(summary.totalCost)),
        dueDate: metadata?.dueDate ?? summary.dueDate ?? null,
      };
    });
  }, [selectedMilestoneSummaries, milestoneMetadata]);

  // Apply the current table sort configuration without mutating the memorised rows.
  const sortedMilestoneTableRows = useMemo(() => {
    if (selectedMilestoneTableRows.length <= 1) {
      return selectedMilestoneTableRows;
    }
    const sorted = [...selectedMilestoneTableRows];
    const direction = milestoneTableSort.direction === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      let comparison = 0;
      if (milestoneTableSort.column === 'title') {
        comparison = a.title.localeCompare(b.title, 'cs');
      } else {
        comparison = a.cost - b.cost;
      }
      if (comparison === 0) {
        comparison = a.id - b.id;
      }
      return comparison * direction;
    });
    return sorted;
  }, [selectedMilestoneTableRows, milestoneTableSort]);

  // Aggregate the currently visible milestone costs for the footer summary.
  const selectedMilestoneCostTotal = useMemo(
    () => selectedMilestoneTableRows.reduce((sum, row) => sum + row.cost, 0),
    [selectedMilestoneTableRows],
  );

  // Handles both toggling direction and switching the active sort column.
  const handleMilestoneTableSort = useCallback((column: 'title' | 'cost') => {
    setMilestoneTableSort(prev => {
      if (prev.column === column) {
        return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { column, direction: column === 'title' ? 'asc' : 'desc' };
    });
  }, []);

  // Update the year picker and trigger the useEffect data refresh cycle.
  const handleYearChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const parsed = Number(event.target.value);
    if (Number.isFinite(parsed)) {
      setSelectedYear(parsed);
    }
  };

  // Calculate the maximum cost to scale the comparison bars even when the API returns numeric
  // strings (e.g. from JSON serialisation of decimals).
  const maxMilestoneCost = selectedMilestoneSummaries.reduce(
    (max, item) => Math.max(max, Math.max(0, resolveMilestoneCost(item.totalCost))),
    0,
  );

  // Determine whether any of the selected milestones contain a meaningful cost so we can toggle the
  // empty state versus the SVG rendering.
  const hasMilestoneCostData = selectedMilestoneSummaries.some(item => resolveMilestoneCost(item.totalCost) > 0);

  // Layout presets for the milestone comparison chart.
  const milestoneChartHeight = 320;
  const milestonePaddingX = 56;
  const milestonePaddingY = 48;
  const milestonePlotHeight = milestoneChartHeight - milestonePaddingY * 2;
  const milestoneNominalWidth = Math.max(selectedMilestoneSummaries.length * 140, 320);
  const milestoneChartWidth = milestoneNominalWidth + milestonePaddingX * 2;
  const milestoneStep =
    selectedMilestoneSummaries.length > 0 ? milestoneNominalWidth / selectedMilestoneSummaries.length : 0;
  const getMilestoneX = (index: number) =>
    selectedMilestoneSummaries.length === 1
      ? milestonePaddingX + milestoneNominalWidth / 2
      : milestonePaddingX + index * milestoneStep + milestoneStep / 2;
  const milestoneBarWidth =
    selectedMilestoneSummaries.length > 0
      ? Math.min(80, (milestoneStep || milestoneNominalWidth) * 0.6)
      : Math.min(80, milestoneNominalWidth * 0.6);

  // Status banner tied to the milestone cost dataset.
  const milestoneStatusMessage: StatusMessage | null = milestoneCostError
    ? { tone: 'error', text: milestoneCostError.error?.message ?? 'Nepodařilo se načíst náklady milníků.' }
    : loadingMilestoneCosts
    ? { tone: 'muted', text: 'Načítám milníky…' }
    : milestoneCosts.length === 0
    ? { tone: 'muted', text: 'Žádné milníky nejsou k dispozici.' }
    : null;

  const milestoneStatusClassName = milestoneStatusMessage
    ? [
        'projectLongTerm__status',
        milestoneStatusMessage.tone === 'error' ? 'projectLongTerm__status--error' : null,
        milestoneStatusMessage.tone === 'muted' ? 'projectLongTerm__status--muted' : null,
      ]
        .filter(isNonNull)
        .join(' ')
    : '';

  const milestoneStatusId = milestoneStatusMessage ? `${milestoneChecklistId}-status` : undefined;
  // Maintain accessible descriptions for the milestone checklist container.
  const milestoneSelectDescribedBy = [milestoneSelectHintId, milestoneStatusId]
    .filter(Boolean)
    .join(' ') || undefined;
  // Derived flags that keep the milestone UI responsive to async states.
  const milestoneChecklistDisabled = loadingMilestoneCosts || milestoneCosts.length === 0;
  const milestoneSelectionEmpty = !loadingMilestoneCosts && milestoneCosts.length > 0 && selectedMilestoneIds.length === 0;
  const milestoneChartHasData = selectedMilestoneSummaries.length > 0 && hasMilestoneCostData;
  const milestoneChartEmptyState =
    !loadingMilestoneCosts && selectedMilestoneSummaries.length > 0 && !hasMilestoneCostData;

  /**
   * Toggles a milestone ID inside the comparison selection list while preserving the ordering from
   * the API response to keep the comparison chart predictable.
   */
  const handleMilestoneToggle = useCallback(
    (milestoneId: number) => {
      setSelectedMilestoneIds(prev => {
        if (prev.includes(milestoneId)) {
          return prev.filter(id => id !== milestoneId);
        }
        const next = [...prev, milestoneId];
        if (milestoneCosts.length === 0) {
          return next;
        }
        const orderMap = new Map<number, number>();
        milestoneCosts.forEach((item, index) => {
          orderMap.set(item.milestoneId, index);
        });
        return next.sort((first, second) => {
          const firstIndex = orderMap.get(first) ?? Number.POSITIVE_INFINITY;
          const secondIndex = orderMap.get(second) ?? Number.POSITIVE_INFINITY;
          return firstIndex - secondIndex;
        });
      });
    },
    [milestoneCosts],
  );

  // Quickly reset the selection to an empty state.
  const handleClearMilestoneSelection = useCallback(() => {
    setSelectedMilestoneIds([]);
  }, []);

  // Helper for the "select all" bulk action in the comparison section.
  const handleSelectAllMilestones = useCallback(() => {
    if (milestoneCosts.length === 0) {
      return;
    }
    setSelectedMilestoneIds(milestoneCosts.map(item => item.milestoneId));
  }, [milestoneCosts]);

  // Enables a friendly empty state whenever the year has data but nothing chartable.
  const emptyState = !loading && !error && !hasChartData && chartPoints.length > 0;

  // Compose CSS modifier classes for the top-level status banner.
  const statusClassName = statusMessage
    ? [
        'projectLongTerm__status',
        statusMessage.tone === 'error' ? 'projectLongTerm__status--error' : null,
        statusMessage.tone === 'muted' ? 'projectLongTerm__status--muted' : null,
      ]
        .filter(isNonNull)
        .join(' ')
    : '';

  // Render the full long-term report layout including filters, charts, and milestone comparison.
  return (
    <div className="projectLongTerm" data-testid="project-long-term-page">
      <section className="projectLongTerm__controls" aria-label="Filtry dlouhodobého reportu">
        <div className="projectLongTerm__filters">
          <label className="projectLongTerm__yearSelect">
            <span>Rok</span>
            <select value={selectedYear} onChange={handleYearChange}>
              {availableYears.map(year => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
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
                Sloupce zobrazují měsíční součty hodin za rok {selectedYear}, linie vyjadřuje kumulativní vyčerpání rozpočtu.
              </desc>
              <line
                x1={paddingX}
                x2={chartWidth - paddingX}
                y1={chartHeight - paddingBottom}
                y2={chartHeight - paddingBottom}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              {Array.from({ length: 4 }, (_, index) => {
                const fraction = (index + 1) / 4;
                const y = paddingTop + plotHeight * (1 - fraction);
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
                const heightRatio = hoursScaleMax > 0 ? point.hours / hoursScaleMax : 0;
                const barHeight = heightRatio * plotHeight;
                const y = paddingTop + (plotHeight - barHeight);
                const hoursLabelMinY = paddingTop + 24;
                const costLabelMinY = paddingTop + 8;
                const hoursLabelY = Math.max(hoursLabelMinY, y - 8);
                const costLabelY = Math.max(costLabelMinY, hoursLabelY - 16);
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
                      y={costLabelY}
                      textAnchor="middle"
                      className="projectLongTerm__chartValue projectLongTerm__chartValue--cost"
                    >
                      {formatCurrency(point.cost)}
                    </text>
                    <text
                      x={xCenter}
                      y={hoursLabelY}
                      textAnchor="middle"
                      className="projectLongTerm__chartValue"
                    >
                      {`${formatHours(point.hours)} h`}
                    </text>
                    <text
                      x={xCenter}
                      y={chartHeight - paddingBottom + 24}
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
                  <line
                    x1={chartWidth - paddingX}
                    x2={chartWidth - paddingX}
                    y1={paddingTop}
                    y2={chartHeight - paddingBottom}
                    stroke="rgba(15, 23, 42, 0.16)"
                    strokeWidth={1}
                  />
                  {percentAxisTicks.map(tickValue => {
                    const y =
                      paddingTop + (plotHeight - (Math.min(tickValue, burnoutScaleMax) / burnoutScaleMax) * plotHeight);
                    return (
                      <g key={`axis-tick-${tickValue}`}>
                        <line
                          x1={chartWidth - paddingX}
                          x2={chartWidth - paddingX + 6}
                          y1={y}
                          y2={y}
                          stroke="rgba(15, 23, 42, 0.24)"
                          strokeWidth={1}
                        />
                        <text
                          x={chartWidth - paddingX + 10}
                          y={y + 4}
                          textAnchor="start"
                          className="projectLongTerm__axisLabel"
                        >
                          {`${formatPercent(tickValue)} %`}
                        </text>
                      </g>
                    );
                  })}
                  {chartPoints.map((point, index) => {
                    const percent = point.burnoutPercent ?? 0;
                    const boundedPercent = Math.max(0, Math.min(percent, burnoutScaleMax));
                    const x = getPointX(index);
                    const y = paddingTop + (plotHeight - (boundedPercent / burnoutScaleMax) * plotHeight);
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
                ? `Za rok ${selectedYear} nejsou dostupná data.`
                : 'Žádná data k zobrazení.'}
            </p>
          )}
        </div>
        <ul className="projectLongTerm__legend projectLongTerm__legend--below" aria-label="Legenda grafu">
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
        {!hasBudget ? (
          <p className="projectLongTerm__status" role="status">
            Rozpočet projektu není nastaven, průběh vyčerpání proto není k dispozici.
          </p>
        ) : null}
      </section>

      <section className="projectLongTerm__chartCard projectLongTerm__comparisonCard">
        <header className="projectLongTerm__chartHeader projectLongTerm__comparisonHeader">
          <h2>Srovnání milestones</h2>
        </header>
        <div className="projectLongTerm__comparisonControls">
          <div className="projectLongTerm__milestoneSelectGroup">
            <div className="projectLongTerm__milestoneSelectColumn">
              <p id={milestoneSelectLabelId} className="projectLongTerm__milestoneSelectLabel">
                Vyberte milníky
              </p>
              <div
                id={milestoneChecklistId}
                className="projectLongTerm__milestoneChecklist"
                role="group"
                aria-labelledby={milestoneSelectLabelId}
                aria-describedby={milestoneSelectDescribedBy}
                aria-disabled={milestoneChecklistDisabled}
                data-disabled={milestoneChecklistDisabled ? 'true' : undefined}
              >
                {milestoneCosts.map(milestone => {
                  const optionLabel = formatMilestoneOptionLabel(milestone);
                  const checked = selectedMilestoneIds.includes(milestone.milestoneId);
                  return (
                    <label
                      key={milestone.milestoneId}
                      className="projectLongTerm__milestoneOption"
                      title={optionLabel}
                    >
                      <input
                        type="checkbox"
                        value={milestone.milestoneId}
                        checked={checked}
                        onChange={() => handleMilestoneToggle(milestone.milestoneId)}
                        disabled={milestoneChecklistDisabled}
                      />
                      <span>{optionLabel}</span>
                    </label>
                  );
                })}
              </div>
              <p id={milestoneSelectHintId} className="projectLongTerm__milestoneSelectHint">
                Zaškrtněte milníky, které chcete porovnat.
              </p>
              <div className="projectLongTerm__milestoneActions">
                <button
                  type="button"
                  className="projectLongTerm__milestoneActionButton"
                  onClick={handleClearMilestoneSelection}
                  disabled={selectedMilestoneIds.length === 0 || milestoneChecklistDisabled}
                >
                  Zrušit výběr
                </button>
                <button
                  type="button"
                  className="projectLongTerm__milestoneActionButton"
                  onClick={handleSelectAllMilestones}
                  disabled={milestoneCosts.length === 0 || milestoneChecklistDisabled}
                >
                  Vybrat vše
                </button>
              </div>
            </div>
            <div
              className="projectLongTerm__selectedMilestoneTableWrapper"
              data-empty={selectedMilestoneTableRows.length === 0 ? 'true' : undefined}
            >
              {selectedMilestoneTableRows.length === 0 ? (
                <p className="projectLongTerm__selectedMilestoneTablePlaceholder">
                  Vyberte alespoň jeden milník pro zobrazení detailů.
                </p>
              ) : (
                <div className="projectLongTerm__selectedMilestoneTableScroller">
                  <table className="projectLongTerm__milestoneTable">
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          aria-sort={
                            milestoneTableSort.column === 'title'
                              ? milestoneTableSort.direction === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          <button
                            type="button"
                            className="projectLongTerm__milestoneSortButton"
                            onClick={() => handleMilestoneTableSort('title')}
                            title="Seřadit podle názvu"
                          >
                            Milestone Title
                            {milestoneTableSort.column === 'title' ? (
                              <span
                                className="projectLongTerm__milestoneSortIcon"
                                aria-hidden="true"
                              >
                                {milestoneTableSort.direction === 'asc' ? 'A-Z' : 'Z-A'}
                              </span>
                            ) : null}
                          </button>
                        </th>
                        <th scope="col">Popis</th>
                        <th
                          scope="col"
                          aria-sort={
                            milestoneTableSort.column === 'cost'
                              ? milestoneTableSort.direction === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          <button
                            type="button"
                            className="projectLongTerm__milestoneSortButton"
                            onClick={() => handleMilestoneTableSort('cost')}
                            title="Seřadit podle nákladů"
                          >
                            Celkové náklady
                            {milestoneTableSort.column === 'cost' ? (
                              <span
                                className="projectLongTerm__milestoneSortIcon"
                                aria-hidden="true"
                              >
                                {milestoneTableSort.direction === 'asc' ? '0-9' : '9-0'}
                              </span>
                            ) : null}
                          </button>
                        </th>
                        <th scope="col">Deadline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMilestoneTableRows.map(row => (
                        <tr key={row.id} className="projectLongTerm__milestoneTableRow">
                          <td>{row.title}</td>
                          <td>{row.description}</td>
                          <td className="projectLongTerm__milestoneTableCost">{formatCurrency(row.cost)}</td>
                          <td>{formatMilestoneDueDate(row.dueDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="projectLongTerm__milestoneTableTotalLabel" colSpan={2}>
                          Náklady celkem
                        </td>
                        <td className="projectLongTerm__milestoneTableCost">
                          {formatCurrency(selectedMilestoneCostTotal)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
          {milestoneStatusMessage ? (
            <p
              id={milestoneStatusId}
              className={milestoneStatusClassName}
              role={milestoneStatusMessage.tone === 'error' ? 'alert' : 'status'}
            >
              {milestoneStatusMessage.text}
            </p>
          ) : null}
        </div>
        <div className="projectLongTerm__chartWrapper">
          {milestoneSelectionEmpty ? (
            <p className="projectLongTerm__empty" role="status">
              Vyberte alespoň jeden milník pro zobrazení srovnání.
            </p>
          ) : milestoneChartHasData ? (
            <svg
              className="projectLongTerm__chartSvg"
              role="img"
              width={milestoneChartWidth}
              height={milestoneChartHeight}
              viewBox={`0 0 ${milestoneChartWidth} ${milestoneChartHeight}`}
              preserveAspectRatio="none"
              style={{ width: milestoneChartWidth, maxWidth: '100%', height: 'auto' }}
              aria-labelledby={`${milestoneChartTitleId} ${milestoneChartDescId}`}
            >
              <title id={milestoneChartTitleId}>{`Srovnání nákladů milníků projektu ${project.name}`}</title>
              <desc id={milestoneChartDescId}>Sloupce zobrazují kumulované náklady vybraných milníků.</desc>
              <line
                x1={milestonePaddingX}
                x2={milestoneChartWidth - milestonePaddingX}
                y1={milestoneChartHeight - milestonePaddingY}
                y2={milestoneChartHeight - milestonePaddingY}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              {Array.from({ length: 4 }, (_, index) => {
                const fraction = (index + 1) / 4;
                const y = milestonePaddingY + milestonePlotHeight * (1 - fraction);
                return (
                  <line
                    key={`milestone-grid-${index}`}
                    x1={milestonePaddingX}
                    x2={milestoneChartWidth - milestonePaddingX}
                    y1={y}
                    y2={y}
                    stroke="rgba(15, 23, 42, 0.08)"
                    strokeWidth={1}
                  />
                );
              })}
              {selectedMilestoneSummaries.map((milestone, index) => {
                const costValue = Math.max(0, resolveMilestoneCost(milestone.totalCost));
                const heightRatio = maxMilestoneCost > 0 ? costValue / maxMilestoneCost : 0;
                const barHeight = heightRatio * milestonePlotHeight;
                const xCenter = getMilestoneX(index);
                const y = milestonePaddingY + (milestonePlotHeight - barHeight);
                const labelY = Math.max(milestonePaddingY + 12, y - 8);
                const optionLabel = formatMilestoneOptionLabel(milestone);
                const chartLabel = optionLabel.length > 28 ? `${optionLabel.slice(0, 27)}…` : optionLabel;
                return (
                  <g key={`milestone-bar-${milestone.milestoneId}`}>
                    <rect
                      x={xCenter - milestoneBarWidth / 2}
                      y={y}
                      width={milestoneBarWidth}
                      height={barHeight}
                      rx={8}
                      ry={8}
                      fill="var(--color-accent-strong)"
                    >
                      <title>{`${optionLabel}: ${formatCurrency(costValue)}`}</title>
                    </rect>
                    <text x={xCenter} y={labelY} textAnchor="middle" className="projectLongTerm__chartValue">
                      {formatCurrency(costValue)}
                    </text>
                    <text
                      x={xCenter}
                      y={milestoneChartHeight - milestonePaddingY + 24}
                      textAnchor="middle"
                      className="projectLongTerm__chartLabel"
                    >
                      <title>{optionLabel}</title>
                      {chartLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : milestoneChartEmptyState ? (
            <p className="projectLongTerm__empty" role="status">
              Pro vybrané milníky nejsou dostupné náklady.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
