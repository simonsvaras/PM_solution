import type {
  WeeklyPlannerIssueOption,
  WeeklyTaskAssignee,
  WeeklyTaskIssue,
  WeeklyTaskStatus,
} from '../api';

export type WeeklyTaskStatusOption = { value: WeeklyTaskStatus; label: string };

export type WeeklyTaskIssueOption = WeeklyPlannerIssueOption | WeeklyTaskIssue;

export type WeeklyTaskAssigneeOption = Pick<WeeklyTaskAssignee, 'id' | 'name' | 'username'>;

const COMPLETED_STATUS_VALUES = ['done', 'closed', 'resolved', 'completed', 'finished'];

const STATUS_LABEL_OVERRIDES: Record<string, string> = {
  opened: 'Otevřeno',
  open: 'Otevřeno',
  todo: 'Naplánováno',
  backlog: 'Backlog',
  pending: 'Čeká',
  in_progress: 'Rozpracováno',
  inprogress: 'Rozpracováno',
  blocked: 'Blokováno',
  review: 'Kontrola',
  verifying: 'Ověření',
  testing: 'Testování',
  ready: 'Připraveno',
  done: 'Hotovo',
  closed: 'Uzavřeno',
  resolved: 'Vyřešeno',
};

export function normalizeTaskStatus(value: WeeklyTaskStatus | string | null | undefined): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

export function isTaskCompletedStatus(value: WeeklyTaskStatus | string | null | undefined): boolean {
  const normalized = normalizeTaskStatus(value);
  return COMPLETED_STATUS_VALUES.includes(normalized);
}

export function getTaskStatusLabel(
  status: WeeklyTaskStatus | string | null | undefined,
  options: WeeklyTaskStatusOption[],
): string {
  const normalized = normalizeTaskStatus(status);
  if (normalized.length === 0) {
    return 'Bez statusu';
  }
  const match = options.find(option => normalizeTaskStatus(option.value) === normalized);
  if (match) {
    return match.label;
  }
  if (STATUS_LABEL_OVERRIDES[normalized]) {
    return STATUS_LABEL_OVERRIDES[normalized];
  }
  const spaced = normalized.replace(/[-_]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function mergeStatusOptions(
  base: WeeklyTaskStatusOption[],
  tasks: { status: WeeklyTaskStatus | string }[],
): WeeklyTaskStatusOption[] {
  const byKey = new Map<string, WeeklyTaskStatusOption>();
  base.forEach(option => {
    byKey.set(normalizeTaskStatus(option.value), option);
  });
  tasks.forEach(task => {
    const normalized = normalizeTaskStatus(task.status);
    if (normalized.length === 0 || byKey.has(normalized)) {
      return;
    }
    const label = getTaskStatusLabel(task.status, base);
    byKey.set(normalized, { value: task.status, label });
  });
  return Array.from(byKey.values());
}

export function formatAssigneeLabel(option: WeeklyTaskAssigneeOption | null | undefined): string {
  if (!option) {
    return 'Nepřiřazeno';
  }
  const username = option.username && option.username.trim().length > 0 ? option.username.trim() : null;
  if (username && option.name && option.name.toLowerCase().includes(username.toLowerCase())) {
    return option.name.trim();
  }
  if (option.name && option.name.trim().length > 0) {
    return username ? `${option.name.trim()} (${username})` : option.name.trim();
  }
  return username ?? 'Nepřiřazeno';
}

export function formatIssueLabel(option: WeeklyTaskIssueOption | null | undefined): string {
  if (!option) {
    return 'Bez issue';
  }
  const rawTitle = 'title' in option ? option.title : null;
  const title = rawTitle && rawTitle.trim().length > 0 ? rawTitle.trim() : `#${option.id}`;
  const reference = 'reference' in option ? option.reference ?? null : null;
  if (reference && reference.trim().length > 0) {
    return `${reference.trim()} · ${title}`;
  }
  return title;
}
