import { useEffect, useState, type JSX } from 'react';
import './PlanningCurrentCapacityPage.css';
import CapacitySummaryCard, { type CapacitySummaryStatus } from './CapacitySummaryCard';
import { getPlanningCurrentCapacity, type PlanningCurrentCapacityResponse } from '../api';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

export default function PlanningCurrentCapacityPage() {
  const [state, setState] = useState<LoadState>('idle');
  const [data, setData] = useState<PlanningCurrentCapacityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setState('loading');
    getPlanningCurrentCapacity()
      .then(response => {
        if (ignore) return;
        setData(response);
        setError(null);
        setState('loaded');
      })
      .catch(err => {
        if (ignore) return;
        console.error('Nepodařilo se načíst aktuální kapacity', err);
        const apiError = err && typeof err === 'object' && 'error' in err ? err.error : null;
        setError(
          apiError?.message ?? 'Nepodařilo se načíst aktuální přehled kapacit. Zkuste to prosím znovu později.',
        );
        setState('error');
      });
    return () => {
      ignore = true;
    };
  }, []);

  const projectStatuses: CapacitySummaryStatus[] =
    data?.projects.statuses
      .slice()
      .sort((a, b) => (b.severity - a.severity) || a.label.localeCompare(b.label)) ?? [];

  const internStatuses: CapacitySummaryStatus[] =
    data?.interns.statuses
      .slice()
      .sort((a, b) => (b.severity - a.severity) || a.label.localeCompare(b.label)) ?? [];

  let content: JSX.Element;
  if (state === 'loading' || state === 'idle') {
    content = <p className="planningCurrentCapacity__status">Načítám aktuální kapacity…</p>;
  } else if (state === 'error') {
    content = (
      <p className="planningCurrentCapacity__error" role="alert">
        {error ?? 'Nepodařilo se načíst aktuální přehled kapacit.'}
      </p>
    );
  } else {
    content = (
      <div className="planningCurrentCapacity__grid">
        <CapacitySummaryCard
          title="Aktuální stav projektů"
          totalLabel="Celkem projektů"
          totalValue={data?.projects.total ?? 0}
          statuses={projectStatuses}
          emptyMessage="Zatím nebyly nahlášeny žádné stavy projektů."
        />
        <CapacitySummaryCard
          title="Aktuální stav stážistů"
          totalLabel="Celkem stážistů"
          totalValue={data?.interns.total ?? 0}
          statuses={internStatuses}
          emptyMessage="Zatím není dostupný žádný stav stážistů."
        />
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="panel__body planningCurrentCapacity" aria-live="polite">
        {content}
      </div>
    </section>
  );
}

