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
  const [selectedInternStatusCode, setSelectedInternStatusCode] = useState<string | null>(null);
  const projectModalTitleId = useId();
  const projectModalDescriptionId = useId();
  const internModalTitleId = useId();
  const internModalDescriptionId = useId();

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

  useEffect(() => {
    if (selectedInternStatusCode == null) {
      return;
    }
    const hasInternsForStatus = internStatuses.some(
      status => status.code === selectedInternStatusCode && Boolean(status.interns?.length),
    );
    if (!hasInternsForStatus) {
      setSelectedInternStatusCode(null);
    }
  }, [internStatuses, selectedInternStatusCode]);

  const selectedProjectStatus =
    selectedProjectStatusCode != null
      ? projectStatuses.find(status => status.code === selectedProjectStatusCode) ?? null
      : null;

  const selectedInternStatus =
    selectedInternStatusCode != null
      ? internStatuses.find(status => status.code === selectedInternStatusCode) ?? null
      : null;

  const closeProjectModal = () => {
    setSelectedProjectStatusCode(null);
  };

  const closeInternModal = () => {
    setSelectedInternStatusCode(null);
  };

  useEffect(() => {
    if (!selectedProjectStatus && !selectedInternStatus) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (selectedProjectStatus) {
          closeProjectModal();
        }
        if (selectedInternStatus) {
          closeInternModal();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedProjectStatus, selectedInternStatus]);

  const handleProjectStatusClick = (status: CapacitySummaryStatus) => {
    if (!status.projects || status.projects.length === 0) {
      return;
    }
    setSelectedProjectStatusCode(status.code);
    setSelectedInternStatusCode(null);
  };

  const handleInternStatusClick = (status: CapacitySummaryStatus) => {
    if (!status.interns || status.interns.length === 0) {
      return;
    }
    setSelectedInternStatusCode(status.code);
    setSelectedProjectStatusCode(null);
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
          onStatusClick={handleInternStatusClick}
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
          onClick={closeProjectModal}
        >
          <div
            className="planningCurrentCapacity__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={projectModalTitleId}
            onClick={event => event.stopPropagation()}
            aria-describedby={projectModalDescriptionId}
          >
            <header className="planningCurrentCapacity__modalHeader">
              <h3 id={projectModalTitleId} className="planningCurrentCapacity__modalTitle">
                {selectedProjectStatus.label}
              </h3>
              <button
                type="button"
                className="planningCurrentCapacity__modalClose"
                onClick={closeProjectModal}
                aria-label="Zavřít dialog se seznamem projektů"
              >
                ×
              </button>
            </header>
            <p
              id={projectModalDescriptionId}
              className="planningCurrentCapacity__modalDescription"
            >
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
      {selectedInternStatus && (
        <div
          className="planningCurrentCapacity__modalOverlay"
          role="presentation"
          onClick={closeInternModal}
        >
          <div
            className="planningCurrentCapacity__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={internModalTitleId}
            onClick={event => event.stopPropagation()}
            aria-describedby={internModalDescriptionId}
          >
            <header className="planningCurrentCapacity__modalHeader">
              <h3 id={internModalTitleId} className="planningCurrentCapacity__modalTitle">
                {selectedInternStatus.label}
              </h3>
              <button
                type="button"
                className="planningCurrentCapacity__modalClose"
                onClick={closeInternModal}
                aria-label="Zavřít dialog se seznamem stážistů"
              >
                ×
              </button>
            </header>
            <p id={internModalDescriptionId} className="planningCurrentCapacity__modalDescription">
              Počet stážistů v tomto stavu: {selectedInternStatus.count}.
            </p>
            <ul className="planningCurrentCapacity__modalList">
              {selectedInternStatus.interns?.map(intern => {
                const groups = intern.groups?.filter(group => group.trim().length > 0) ?? [];
                const metaParts: string[] = [];
                const level = intern.level?.trim();
                if (level) {
                  metaParts.push(level);
                }
                if (groups.length > 0) {
                  metaParts.push(groups.join(', '));
                }

                return (
                  <li key={intern.id} className="planningCurrentCapacity__modalListItem">
                    <span className="planningCurrentCapacity__modalItemName">{intern.name}</span>
                    {metaParts.length > 0 && (
                      <span className="planningCurrentCapacity__modalItemMeta">{metaParts.join(' • ')}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

