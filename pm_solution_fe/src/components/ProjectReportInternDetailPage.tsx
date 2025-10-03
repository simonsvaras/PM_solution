import { useEffect, useMemo, useState } from 'react';
import './ProjectReportInternDetailPage.css';
import './ProjectReportDetailPage.css';
import InfoCard from './InfoCard';
import {
  getProjectReportInternDetail,
  type ErrorResponse,
  type ProjectOverviewDTO,
  type ProjectReportDetailIntern,
  type ProjectReportInternDetailIssue,
} from '../api';

function formatHoursFromSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0 h';
  }
  const hours = seconds / 3600;
  return `${hours.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Bez termínu';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Bez termínu';
  }
  return date.toLocaleDateString('cs-CZ');
}

function formatIssueAge(ageDays: number | null, createdAt: string | null): string {
  if (typeof ageDays === 'number' && Number.isFinite(ageDays)) {
    const safeAge = Math.max(0, Math.floor(ageDays));
    return safeAge.toLocaleString('cs-CZ');
  }

  if (!createdAt) {
    return '—';
  }
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return '—';
  }
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  if (diffMs <= 0) {
    return '0';
  }
  const diffDays = Math.floor(diffMs / dayMs);
  return diffDays.toLocaleString('cs-CZ');
}

function formatInternLabel(intern: ProjectReportDetailIntern): string {
  const name = `${intern.firstName ?? ''} ${intern.lastName ?? ''}`.trim();
  if (name && intern.username) {
    return `${name} (@${intern.username})`;
  }
  if (name) {
    return name;
  }
  return `@${intern.username}`;
}

type ProjectReportInternDetailPageProps = {
  project: ProjectOverviewDTO;
};

export default function ProjectReportInternDetailPage({ project }: ProjectReportInternDetailPageProps) {
  const [interns, setInterns] = useState<ProjectReportDetailIntern[]>([]);
  const [selectedInternUsername, setSelectedInternUsername] = useState<string | null>(null);
  const [issues, setIssues] = useState<ProjectReportInternDetailIssue[]>([]);
  const [loadingInterns, setLoadingInterns] = useState(false);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [internsError, setInternsError] = useState<ErrorResponse | null>(null);
  const [issuesError, setIssuesError] = useState<ErrorResponse | null>(null);
  const [hasInitializedSelection, setHasInitializedSelection] = useState(false);

  useEffect(() => {
    let ignore = false;
    setSelectedInternUsername(null);
    setHasInitializedSelection(false);
    setInterns([]);
    setIssues([]);
    setInternsError(null);
    setIssuesError(null);
    setLoadingInterns(true);

    getProjectReportInternDetail(project.id, null)
      .then(data => {
        if (ignore) {
          return;
        }
        setInterns(data.interns);
      })
      .catch(err => {
        if (ignore) {
          return;
        }
        setInternsError(err as ErrorResponse);
      })
      .finally(() => {
        if (!ignore) {
          setLoadingInterns(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [project.id]);

  useEffect(() => {
    if (interns.length === 0) {
      if (selectedInternUsername !== null) {
        setSelectedInternUsername(null);
      }
      return;
    }

    if (selectedInternUsername && !interns.some(intern => intern.username === selectedInternUsername)) {
      setSelectedInternUsername(interns[0].username);
      return;
    }

    if (!hasInitializedSelection) {
      setSelectedInternUsername(interns[0].username);
      setHasInitializedSelection(true);
    }
  }, [interns, selectedInternUsername, hasInitializedSelection]);

  useEffect(() => {
    if (!selectedInternUsername) {
      setIssues([]);
      setIssuesError(null);
      setLoadingIssues(false);
      return;
    }

    let ignore = false;
    setLoadingIssues(true);
    setIssuesError(null);

    getProjectReportInternDetail(project.id, selectedInternUsername)
      .then(data => {
        if (ignore) {
          return;
        }
        setInterns(data.interns);
        setIssues(data.issues);
      })
      .catch(err => {
        if (ignore) {
          return;
        }
        setIssuesError(err as ErrorResponse);
      })
      .finally(() => {
        if (!ignore) {
          setLoadingIssues(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [project.id, selectedInternUsername]);

  const selectedIntern = useMemo(() => {
    if (!selectedInternUsername) {
      return null;
    }
    return interns.find(intern => intern.username === selectedInternUsername) ?? null;
  }, [interns, selectedInternUsername]);

  const issueCountValue = selectedInternUsername
    ? issues.length.toLocaleString('cs-CZ')
    : '—';

  const issueCountDescription = selectedIntern
    ? `Aktuálně přiřazené issues stážisty ${formatInternLabel(selectedIntern)}`
    : 'Vyberte stážistu pro zobrazení detailu.';

  function handleInternFilterChange(username: string | null) {
    setSelectedInternUsername(prev => {
      const next = username === prev ? null : username;
      if (next === prev) {
        return prev;
      }
      return next;
    });
  }

  return (
    <section
      className="projectReportInternDetail"
      aria-label={`Detail stážisty projektu ${project.name}`}
    >
      <header className="projectReportInternDetail__header">
        <div className="projectReportInternDetail__headline">
          <h2>Detail stážisty</h2>
          <p>Vyberte stážistu a získejte přehled o jeho otevřených issues na projektu.</p>
        </div>

        {loadingInterns ? (
          <p className="projectReportInternDetail__status">Načítám stážisty…</p>
        ) : internsError ? (
          <div className="projectReportInternDetail__error" role="alert">
            <p>Nepodařilo se načíst seznam stážistů.</p>
            <p>{internsError.error.message}</p>
          </div>
        ) : interns.length === 0 ? (
          <p className="projectReportInternDetail__status">Pro projekt nejsou přiřazeni žádní stážisti.</p>
        ) : (
          <div className="projectReportDetail__internFiltersWrapper">
            <div
              className="projectReportDetail__internFilters"
              role="group"
              aria-label="Filtr stážistů"
            >
              <button
                type="button"
                className={`projectReportDetail__internButton${
                  selectedInternUsername === null ? ' projectReportDetail__internButton--active' : ''
                }`}
                onClick={() => handleInternFilterChange(null)}
                disabled={loadingIssues}
                aria-pressed={selectedInternUsername === null}
              >
                Všichni stážisté
              </button>
              {interns.map(intern => {
                const isActive = intern.username === selectedInternUsername;
                const fullName = `${intern.firstName ?? ''} ${intern.lastName ?? ''}`.trim();
                const displayName = fullName || `@${intern.username}`;
                return (
                  <button
                    type="button"
                    key={intern.id}
                    className={`projectReportDetail__internButton${
                      isActive ? ' projectReportDetail__internButton--active' : ''
                    }`}
                    onClick={() => handleInternFilterChange(intern.username)}
                    disabled={loadingIssues}
                    aria-pressed={isActive}
                  >
                    {displayName}
                    {fullName ? (
                      <span className="projectReportInternDetail__internUsername">@{intern.username}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <div className="projectReportInternDetail__content">
        <div className="projectReportInternDetail__infoCards">
          <InfoCard title="Počet otevřených issues" value={issueCountValue} description={issueCountDescription} />
        </div>

        {selectedInternUsername === null ? (
          <p className="projectReportInternDetail__status">Vyberte stážistu pro zobrazení detailu.</p>
        ) : loadingIssues ? (
          <p className="projectReportInternDetail__status">Načítám otevřená issues…</p>
        ) : issuesError ? (
          <div className="projectReportInternDetail__error" role="alert">
            <p>Nepodařilo se načíst otevřená issues stážisty.</p>
            <p>{issuesError.error.message}</p>
          </div>
        ) : issues.length === 0 ? (
          <p className="projectReportInternDetail__status">Vybraný stážista nemá žádná otevřená issues.</p>
        ) : (
          <div className="projectReportInternDetail__tableSection">
            <div className="projectReportInternDetail__tableWrapper">
              <table className="projectReportInternDetail__table">
                <thead>
                  <tr>
                    <th scope="col">Issue</th>
                    <th scope="col" className="projectReportInternDetail__columnNumeric">Celkem vykázáno</th>
                    <th scope="col">Termín</th>
                    <th scope="col" className="projectReportInternDetail__columnNumeric">Stáří (dny)</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map(issue => {
                    const meta: string[] = [];
                    if (issue.issueIid != null) {
                      meta.push(`#${issue.issueIid}`);
                    }
                    if (issue.repositoryName) {
                      meta.push(issue.repositoryName);
                    }
                    const issueContent = (
                      <div className="projectReportInternDetail__issueInfo">
                        <span className="projectReportInternDetail__issueTitle">{issue.issueTitle}</span>
                        {meta.length > 0 ? (
                          <span className="projectReportInternDetail__issueMeta">{meta.join(' • ')}</span>
                        ) : null}
                      </div>
                    );
                    return (
                      <tr key={`${issue.repositoryId}:${issue.issueId ?? issue.issueIid ?? issue.issueTitle}`}>
                        <th scope="row">
                          {issue.issueWebUrl ? (
                            <a
                              href={issue.issueWebUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="projectReportInternDetail__issueLink"
                            >
                              {issueContent}
                            </a>
                          ) : (
                            issueContent
                          )}
                        </th>
                        <td className="projectReportInternDetail__columnNumeric">
                          {formatHoursFromSeconds(issue.totalTimeSpentSeconds)}
                        </td>
                        <td>{formatDate(issue.dueDate)}</td>
                        <td className="projectReportInternDetail__columnNumeric">
                          {formatIssueAge(issue.ageDays, issue.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
