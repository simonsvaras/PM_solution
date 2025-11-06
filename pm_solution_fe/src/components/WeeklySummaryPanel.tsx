import './WeeklySummaryPanel.css';
import type { ErrorResponse, WeeklySummary } from '../api';

type WeeklySummaryPanelProps = {
  summary: WeeklySummary | null;
  isLoading?: boolean;
  error?: ErrorResponse | null;
  onRetry?: () => void;
};

const percentageFormatter = new Intl.NumberFormat('cs-CZ', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const integerFormatter = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
const hoursFormatter = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

function formatPercentage(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return `${percentageFormatter.format(value)} %`;
}

function formatCount(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return integerFormatter.format(value);
}

function formatHours(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return `${hoursFormatter.format(value)} h`;
}

export default function WeeklySummaryPanel({ summary, isLoading, error, onRetry }: WeeklySummaryPanelProps) {
  if (isLoading) {
    return (
      <section className="weeklySummary" aria-busy="true" aria-live="polite">
        <div className="weeklySummary__header">
          <h3 className="weeklySummary__title">Souhrn týdne</h3>
          <div className="weeklySummary__total weeklySummary__total--loading" />
        </div>
        <div className="weeklySummary__metrics" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="weeklySummary__metric weeklySummary__metric--loading">
              <div className="weeklySummary__metricLabel" />
              <div className="weeklySummary__metricValue" />
              <div className="weeklySummary__metricHint" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="weeklySummary" role="alert">
        <div className="weeklySummary__header">
          <h3 className="weeklySummary__title">Souhrn týdne</h3>
        </div>
        <p className="weeklySummary__errorMessage">Souhrn týdne se nepodařilo načíst. {error.error.message}</p>
        {onRetry && (
          <button type="button" className="weeklySummary__retryButton" onClick={onRetry}>
            Zkusit znovu
          </button>
        )}
      </section>
    );
  }

  const summaryMetrics = summary?.metrics;
  const totalTasks = summaryMetrics?.totalTasks ?? summary?.taskCount ?? null;
  const totalHours = summary ? formatHours(summary.totalHours) : '—';
  const completedTasks = summaryMetrics?.completedTasks ?? null;
  const completedTotal = summaryMetrics?.totalTasks ?? null;
  const carriedOverTasks = summaryMetrics?.carriedOverTasks ?? null;

  const metrics = [
    {
      key: 'completed',
      label: 'Splněno',
      value: formatPercentage(summaryMetrics?.completedPercentage ?? null),
      hint:
        completedTasks !== null && completedTotal !== null
          ? `${formatCount(completedTasks)} z ${formatCount(completedTotal)}`
          : completedTasks !== null
          ? `${formatCount(completedTasks)} úkolů`
          : '—',
    },
    {
      key: 'carried',
      label: 'Přenesené',
      value: formatPercentage(summaryMetrics?.carriedOverPercentage ?? null),
      hint: carriedOverTasks !== null ? `${formatCount(carriedOverTasks)} úkolů` : '—',
    },
    {
      key: 'new',
      label: 'Nově přidané',
      value: formatCount(summaryMetrics?.newTasks ?? null),
      hint: 'V tomto týdnu',
    },
    {
      key: 'open',
      label: 'Rozpracované',
      value: formatCount(summaryMetrics?.inProgressTasks ?? null),
      hint: 'Zůstává otevřených',
    },
  ];

  return (
    <section className="weeklySummary" aria-labelledby="weekly-summary-title">
      <div className="weeklySummary__header">
        <h3 id="weekly-summary-title" className="weeklySummary__title">
          Souhrn týdne
        </h3>
        <div className="weeklySummary__total" aria-live="polite">
          <span>{totalTasks !== null ? `${formatCount(totalTasks)} úkolů` : '— úkolů'}</span>
          <span aria-hidden="true">•</span>
          <span>{totalHours}</span>
        </div>
      </div>
      <div className="weeklySummary__metrics">
        {metrics.map(metric => (
          <article key={metric.key} className="weeklySummary__metric">
            <h4 className="weeklySummary__metricLabel">{metric.label}</h4>
            <p className="weeklySummary__metricValue">{metric.value}</p>
            <p className="weeklySummary__metricHint">{metric.hint}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
