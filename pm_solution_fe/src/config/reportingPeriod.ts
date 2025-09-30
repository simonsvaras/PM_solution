const DEFAULT_START_DAY = Number.parseInt(
  import.meta.env.VITE_REPORTING_PERIOD_START_DAY ?? '18',
  10,
);
const DEFAULT_END_DAY = Number.parseInt(
  import.meta.env.VITE_REPORTING_PERIOD_END_DAY ?? '17',
  10,
);

function normalizeDay(value: number, fallback: number) {
  if (Number.isFinite(value) && value >= 1 && value <= 31) {
    return Math.trunc(value);
  }
  return fallback;
}

export const REPORTING_PERIOD_START_DAY = normalizeDay(DEFAULT_START_DAY, 18);
export const REPORTING_PERIOD_END_DAY = normalizeDay(DEFAULT_END_DAY, 17);

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

export function formatDateTimeLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export type ReportingPeriod = {
  from: string;
  to: string;
};

export function getDefaultReportingPeriod(referenceDate = new Date()): ReportingPeriod {
  const now = new Date(referenceDate.getTime());

  const start = new Date(now.getTime());
  start.setHours(0, 0, 0, 0);
  if (now.getDate() >= REPORTING_PERIOD_START_DAY) {
    start.setDate(REPORTING_PERIOD_START_DAY);
  } else {
    start.setMonth(start.getMonth() - 1);
    start.setDate(REPORTING_PERIOD_START_DAY);
  }

  const end = new Date(now.getTime());
  end.setHours(23, 59, 0, 0);
  if (now.getDate() >= REPORTING_PERIOD_START_DAY) {
    end.setMonth(end.getMonth() + 1);
    end.setDate(REPORTING_PERIOD_END_DAY);
  } else {
    end.setDate(REPORTING_PERIOD_END_DAY);
  }

  return {
    from: formatDateTimeLocal(start),
    to: formatDateTimeLocal(end),
  };
}

export function datetimeLocalToIso(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}
