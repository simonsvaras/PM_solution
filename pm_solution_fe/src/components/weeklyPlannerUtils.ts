export const dayNames = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];

const dateFormatter = new Intl.DateTimeFormat('cs-CZ', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});

const hoursFormatter = new Intl.NumberFormat('cs-CZ', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start || !end) {
    return '—';
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return '—';
  }
  return `${dateFormatter.format(startDate)} – ${dateFormatter.format(endDate)}`;
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return dateFormatter.format(parsed);
}

export function formatPlannedHours(hours: number | null): string {
  if (hours === null || Number.isNaN(hours)) {
    return 'Neplánováno';
  }
  return `${hoursFormatter.format(hours)} h`;
}
