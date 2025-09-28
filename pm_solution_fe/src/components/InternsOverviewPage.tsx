import { useEffect, useMemo, useState, type ReactNode } from 'react';
import './InternsOverviewPage.css';
import InternCard from './InternCard';
import Modal from './Modal';
import {
  getInternOverviewDetail,
  listInternOverview,
  type ErrorResponse,
  type InternDetail,
  type InternOverview,
} from '../api';

function formatHours(hours: number | null): string {
  if (hours === null || Number.isNaN(hours)) return 'N/A';
  return `${hours.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
}

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'error' in err) {
    const apiError = err as ErrorResponse;
    return apiError.error?.message ?? 'Nepodařilo se načíst data.';
  }
  if (err instanceof Error) return err.message;
  return 'Nepodařilo se načíst data.';
}

export default function InternsOverviewPage() {
  const [interns, setInterns] = useState<InternOverview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<InternOverview | null>(null);
  const [detail, setDetail] = useState<InternDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listInternOverview()
      .then(data => setInterns(data))
      .catch(err => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const totalTrackedHours = useMemo(
    () => interns.reduce((acc, intern) => acc + (Number.isFinite(intern.totalHours) ? intern.totalHours : 0), 0),
    [interns],
  );

  function openDetail(intern: InternOverview) {
    setSelected(intern);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    getInternOverviewDetail(intern.id)
      .then(data => setDetail(data))
      .catch(err => setDetailError(extractErrorMessage(err)))
      .finally(() => setDetailLoading(false));
  }

  function closeModal() {
    if (detailLoading) return;
    setSelected(null);
    setDetail(null);
    setDetailError(null);
  }

  let content: ReactNode = null;
  if (loading) {
    content = <p className="internsOverview__status">Načítám stážisty…</p>;
  } else if (error) {
    content = (
      <div className="internsOverview__error" role="alert">
        <h2>Stážisty se nepodařilo načíst.</h2>
        <p>{error}</p>
      </div>
    );
  } else if (interns.length === 0) {
    content = <p className="internsOverview__status">Zatím nejsou založení žádní stážisti.</p>;
  } else {
    content = (
      <>
        <header className="internsOverview__summary">
          <h2>Přehled stážistů</h2>
          <p>
            Celkem evidováno <strong>{interns.length}</strong> stážistů, kteří dohromady vykázali{' '}
            <strong>{formatHours(totalTrackedHours)}</strong>.
          </p>
        </header>
        <div className="internsOverview__grid" role="list">
          {interns.map(intern => (
            <div key={intern.id} role="listitem">
              <InternCard intern={intern} onOpenDetail={openDetail} />
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <section className="internsOverview" aria-label="Přehled stážistů">
      {content}
      <Modal isOpen={selected !== null} title={selected ? `${selected.firstName} ${selected.lastName}` : ''} onClose={closeModal}>
        {detailLoading && <p>Načítám detail stážisty…</p>}
        {detailError && (
          <div className="internsOverview__modalError" role="alert">
            <h3>Detail se nepodařilo načíst.</h3>
            <p>{detailError}</p>
          </div>
        )}
        {detail && (
          <div className="internsOverview__modalContent">
            <dl>
              <div>
                <dt>Username</dt>
                <dd>@{detail.username}</dd>
              </div>
              <div>
                <dt>Úroveň</dt>
                <dd>{detail.levelLabel}</dd>
              </div>
              <div>
                <dt>Skupiny</dt>
                <dd>{detail.groups.map(group => group.label).join(', ') || 'Bez skupiny'}</dd>
              </div>
              <div>
                <dt>Celkem vykázané hodiny</dt>
                <dd>{formatHours(detail.totalHours)}</dd>
              </div>
            </dl>
            <section aria-label="Přidělené projekty">
              <h3>Projekty a úvazky</h3>
              {detail.projects.length === 0 ? (
                <p>Stážista zatím není přiřazen k žádnému projektu.</p>
              ) : (
                <table className="internsOverview__projects">
                  <thead>
                    <tr>
                      <th>Projekt</th>
                      <th>Úvazek</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.projects.map(project => (
                      <tr key={project.projectId}>
                        <td>{project.projectName}</td>
                        <td>{formatHours(project.workloadHours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}
      </Modal>
    </section>
  );
}
