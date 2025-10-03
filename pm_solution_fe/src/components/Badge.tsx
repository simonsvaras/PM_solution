import './Badge.css';

type BadgeKind = 'priority' | 'team';

type BadgeProps = {
  kind: BadgeKind;
  value?: string | null;
};

const PRIORITY_CLASS_MAP: Record<string, string> = {
  high: 'badge--priority-high',
  medium: 'badge--priority-medium',
  low: 'badge--priority-low',
};

const TEAM_CLASS_MAP: Record<string, string> = {
  analyst: 'badge--team-analyst',
  backend: 'badge--team-backend',
  frontend: 'badge--team-frontend',
};

export default function Badge({ kind, value }: BadgeProps) {
  if (!value) {
    return <span className="badge badge--empty">—</span>;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return <span className="badge badge--empty">—</span>;
  }

  const normalized = trimmed.toLowerCase();
  let className = 'badge';

  if (kind === 'priority') {
    className += ` ${PRIORITY_CLASS_MAP[normalized] ?? 'badge--default'}`;
  } else {
    className += ` ${TEAM_CLASS_MAP[normalized] ?? 'badge--default'}`;
  }

  return <span className={className}>{trimmed}</span>;
}
