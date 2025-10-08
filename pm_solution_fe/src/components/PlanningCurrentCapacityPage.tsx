import { useEffect, useId, useState, type JSX } from 'react';
import './PlanningCurrentCapacityPage.css';
import CapacitySummaryCard, { type CapacitySummaryStatus } from './CapacitySummaryCard';
import { getPlanningCurrentCapacity, type PlanningCurrentCapacityResponse } from '../api';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

export default function PlanningCurrentCapacityPage() {
  const [state, setState] = useState<LoadState>('idle');
  const [data, setData] = useState<PlanningCurrentCapacityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectStatusCode, setSelectedProjectStatusCode] = useState<string | null>(null);
  const modalTitleId = useId();
  const modalDescriptionId = useId();

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

  useEffect(() => {
    if (selectedProjectStatusCode == null) {
      return;
    }
    const hasProjectsForStatus = projectStatuses.some(
      status => status.code === selectedProjectStatusCode && Boolean(status.projects?.length),
    );
    if (!hasProjectsForStatus) {
      setSelectedProjectStatusCode(null);
    }
  }, [projectStatuses, selectedProjectStatusCode]);

  const selectedProjectStatus =
    selectedProjectStatusCode != null
      ? projectStatuses.find(status => status.code === selectedProjectStatusCode) ?? null
      : null;

  const closeModal = () => {
    setSelectedProjectStatusCode(null);
  };

  useEffect(() => {
    if (!selectedProjectStatus) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedProjectStatus]);

  const handleProjectStatusClick = (status: CapacitySummaryStatus) => {
    if (!status.projects || status.projects.length === 0) {
      return;
    }
    setSelectedProjectStatusCode(status.code);
  };

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
          onStatusClick={handleProjectStatusClick}
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
      {selectedProjectStatus && (
        <div
          className="planningCurrentCapacity__modalOverlay"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="planningCurrentCapacity__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            onClick={event => event.stopPropagation()}
            aria-describedby={modalDescriptionId}
          >
            <header className="planningCurrentCapacity__modalHeader">
              <h3 id={modalTitleId} className="planningCurrentCapacity__modalTitle">
                {selectedProjectStatus.label}
              </h3>
              <button
                type="button"
                className="planningCurrentCapacity__modalClose"
                onClick={closeModal}
                aria-label="Zavřít dialog se seznamem projektů"
              >
                ×
              </button>
            </header>
            <p id={modalDescriptionId} className="planningCurrentCapacity__modalDescription">
              Počet projektů v tomto stavu: {selectedProjectStatus.count}.
            </p>
            <ul className="planningCurrentCapacity__modalList">
              {selectedProjectStatus.projects?.map(project => (
                <li key={project.id} className="planningCurrentCapacity__modalListItem">
                  {project.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

