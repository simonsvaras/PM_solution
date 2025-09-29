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
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const pageSize = 4;

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

  const filteredInterns = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return interns;
    return interns.filter(intern => {
      const fullName = `${intern.firstName} ${intern.lastName}`.toLowerCase();
      return fullName.includes(query) || intern.username.toLowerCase().includes(query);
    });
  }, [interns, search]);

  const totalPages = Math.max(1, Math.ceil(filteredInterns.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const paginatedInterns = filteredInterns.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  useEffect(() => {
    setPage(0);
  }, [search, interns.length]);

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
  } else if (filteredInterns.length === 0) {
    content = (
      <div className="internsOverview__empty" role="status">
        <p>
          Nenalezen žádný stážista odpovídající dotazu <strong>{search}</strong>.
        </p>
      </div>
    );
  } else {
    content = (
      <>
        <header className="internsOverview__summary">
          <div>
            <h2>Souhrn stážistů</h2>
            <p>
              Celkem evidováno <strong>{interns.length}</strong> stážistů, kteří dohromady vykázali{' '}
              <strong>{formatHours(totalTrackedHours)}</strong>.
            </p>
            {search ? (
              <p>
                Zobrazuje se <strong>{paginatedInterns.length}</strong> z{' '}
                <strong>{filteredInterns.length}</strong> vyfiltrovaných stážistů.
              </p>
            ) : (
              <p>
                Zobrazuje se <strong>{paginatedInterns.length}</strong> z <strong>{interns.length}</strong> stážistů na této stránce.
              </p>
            )}
          </div>
          <label className="internsOverview__searchLabel">
            <span className="internsOverview__searchLabelText">Vyhledat podle jména nebo username</span>
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Např. jana nebo jan.novak"
              className="internsOverview__searchInput"
            />
          </label>
        </header>
        <div className="internsOverview__grid" role="list">
          {paginatedInterns.map(intern => (
            <div key={intern.id} role="listitem">
              <InternCard intern={intern} onOpenDetail={openDetail} />
            </div>
          ))}
        </div>
        {totalPages > 1 ? (
          <nav className="internsOverview__pagination" aria-label="Stránkování stážistů">
            <button
              type="button"
              className="internsOverview__paginationButton"
              onClick={() => setPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
            >
              Předchozí
            </button>
            <p>
              Stránka <strong>{currentPage + 1}</strong> z <strong>{totalPages}</strong>
            </p>
            <button
              type="button"
              className="internsOverview__paginationButton"
              onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage >= totalPages - 1}
            >
              Další
            </button>
          </nav>
        ) : null}
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
