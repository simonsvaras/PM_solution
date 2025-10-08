import './CapacitySummaryCard.css';

const numberFormatter = new Intl.NumberFormat('cs-CZ');

export type CapacitySummaryStatusEntity = {
  id: number;
  name: string;
};

export type CapacitySummaryStatus = {
  code: string;
  label: string;
  severity: number;
  count: number;
  projects?: CapacitySummaryStatusEntity[];
  interns?: CapacitySummaryStatusEntity[];
};

type CapacitySummaryCardProps = {
  title: string;
  totalLabel: string;
  totalValue: number;
  statuses: CapacitySummaryStatus[];
  emptyMessage?: string;
  onStatusClick?: (status: CapacitySummaryStatus) => void;
};

function getSeverityTone(severity: number): 'neutral' | 'warning' | 'critical' {
  if (severity >= 80) return 'critical';
  if (severity >= 40) return 'warning';
  return 'neutral';
}

export default function CapacitySummaryCard({
  title,
  totalLabel,
  totalValue,
  statuses,
  emptyMessage = 'Zatím nejsou k dispozici žádná data.',
  onStatusClick,
}: CapacitySummaryCardProps) {
  return (
    <article className="capacitySummaryCard" aria-label={title}>
      <header className="capacitySummaryCard__header">
        <h2 className="capacitySummaryCard__title">{title}</h2>
        <p className="capacitySummaryCard__total">
          <span>{totalLabel}</span>
          <strong>{numberFormatter.format(totalValue)}</strong>
        </p>
      </header>
      {statuses.length > 0 ? (
        <ul className="capacitySummaryCard__list">
          {statuses.map(status => {
            const tone = getSeverityTone(status.severity);
            const projects = status.projects ?? [];
            const interns = status.interns ?? [];
            const relatedEntities = projects.length > 0 ? projects : interns;
            const isClickable = Boolean(onStatusClick && relatedEntities.length > 0);
            const className = `capacitySummaryCard__item capacitySummaryCard__item--${tone}`;
            const content = (
              <>
                <span className="capacitySummaryCard__itemLabel">{status.label}</span>
                <span className="capacitySummaryCard__itemValue">{numberFormatter.format(status.count)}</span>
              </>
            );

            return (
              <li key={status.code}>
                {isClickable ? (
                  <button
                    type="button"
                    className={className}
                    onClick={() => onStatusClick?.(status)}
                    aria-haspopup="dialog"
                  >
                    {content}
                  </button>
                ) : (
                  <div className={className}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="capacitySummaryCard__empty">{emptyMessage}</p>
      )}
    </article>
  );
}

