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
  const [groupFilter, setGroupFilter] = useState<number | 'all'>('all');
  const [levelFilter, setLevelFilter] = useState<number | 'all'>('all');

  const groupOptions = useMemo(() => {
    const groups = new Map<number, { id: number; label: string }>();
    interns.forEach(intern => {
      intern.groups.forEach(group => {
        if (!groups.has(group.id)) {
          groups.set(group.id, { id: group.id, label: group.label });
        }
      });
    });
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label, 'cs'));
  }, [interns]);

  const levelOptions = useMemo(() => {
    const levels = new Map<number, { id: number; label: string }>();
    interns.forEach(intern => {
      if (!levels.has(intern.levelId)) {
        levels.set(intern.levelId, { id: intern.levelId, label: intern.levelLabel });
      }
    });
    return Array.from(levels.values()).sort((a, b) => a.label.localeCompare(b.label, 'cs'));
  }, [interns]);

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
    return interns.filter(intern => {
      if (groupFilter !== 'all' && !intern.groups.some(group => group.id === groupFilter)) {
        return false;
      }
      if (levelFilter !== 'all' && intern.levelId !== levelFilter) {
        return false;
      }
      if (!query) return true;
      const fullName = `${intern.firstName} ${intern.lastName}`.toLowerCase();
      return fullName.includes(query) || intern.username.toLowerCase().includes(query);
    });
  }, [groupFilter, interns, levelFilter, search]);

  const visibleInterns = filteredInterns;
  const isFiltered = Boolean(search.trim()) || groupFilter !== 'all' || levelFilter !== 'all';

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
          Nenalezen žádný stážista odpovídající zadanému filtrování.
          {search && (
            <>
              {' '}
              (dotaz <strong>{search}</strong>)
            </>
          )}
        </p>
      </div>
    );
  } else {
    content = (
      <>
        <header className="internsOverview__summary">
          <div>
            <p>
              Celkem evidováno <strong>{interns.length}</strong> stážistů, kteří dohromady vykázali{' '}
              <strong>{formatHours(totalTrackedHours)}</strong>.
            </p>
            <p>
              {isFiltered ? (
                <>
                  Zobrazuje se <strong>{visibleInterns.length}</strong> z <strong>{interns.length}</strong> stážistů odpovídajících
                  filtru.
                </>
              ) : (
                <>
                  Zobrazuje se <strong>{visibleInterns.length}</strong> stážistů.
                </>
              )}
            </p>
          </div>
          <div className="internsOverview__controls">
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
            <div className="internsOverview__filters">
              <label className="internsOverview__filter">
                <span className="internsOverview__filterLabel">Filtrovat podle skupiny</span>
                <select
                  value={groupFilter === 'all' ? 'all' : String(groupFilter)}
                  onChange={event =>
                    setGroupFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
                  }
                  className="internsOverview__filterSelect"
                >
                  <option value="all">Všechny skupiny</option>
                  {groupOptions.map(group => (
                    <option key={group.id} value={group.id}>
                      {group.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="internsOverview__filter">
                <span className="internsOverview__filterLabel">Filtrovat podle úrovně</span>
                <select
                  value={levelFilter === 'all' ? 'all' : String(levelFilter)}
                  onChange={event =>
                    setLevelFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
                  }
                  className="internsOverview__filterSelect"
                >
                  <option value="all">Všechny úrovně</option>
                  {levelOptions.map(level => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </header>
        <div className="internsOverview__grid" role="list">
          {visibleInterns.map(intern => (
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
                      <th>Započítat náklady</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.projects.map(project => (
                      <tr key={project.projectId}>
                        <td>{project.projectName}</td>
                        <td>{formatHours(project.workloadHours)}</td>
                        <td>{project.includeInReportedCost ? 'Ano' : 'Ne'}</td>
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
