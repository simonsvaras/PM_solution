import { useEffect, useMemo, useState } from 'react';
import './ProjectReportProjectDetailPage.css';
import {
  getProjectActiveMilestones,
  getProjectMilestoneIssueCosts,
  type ErrorResponse,
  type ProjectMilestoneIssueCost,
  type ProjectMilestoneSummary,
  type ProjectOverviewDTO,
} from '../api';

function formatDuration(seconds?: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) {
    return '—';
  }
  const hours = seconds / 3600;
  return `${hours.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
}

function formatCost(value?: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' });
}

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString('cs-CZ');
}

type ProjectReportProjectDetailPageProps = {
  project: ProjectOverviewDTO;
  onBack: () => void;
  onCloseDetail: () => void;
};

export default function ProjectReportProjectDetailPage({
  project,
  onBack,
  onCloseDetail,
}: ProjectReportProjectDetailPageProps) {
  const [milestones, setMilestones] = useState<ProjectMilestoneSummary[]>([]);
  const [loadingMilestones, setLoadingMilestones] = useState(false);
  const [milestoneError, setMilestoneError] = useState<ErrorResponse | null>(null);
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<number[]>([]);
  const [issues, setIssues] = useState<ProjectMilestoneIssueCost[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [issuesError, setIssuesError] = useState<ErrorResponse | null>(null);

  useEffect(() => {
    let ignore = false;
    setLoadingMilestones(true);
    setMilestoneError(null);
    getProjectActiveMilestones(project.id)
      .then(data => {
        if (!ignore) {
          setMilestones(data);
        }
      })
      .catch(err => {
        if (!ignore) {
          setMilestoneError(err as ErrorResponse);
          setMilestones([]);
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoadingMilestones(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [project.id]);

  useEffect(() => {
    setSelectedMilestoneIds(prev => {
      const availableIds = new Set(milestones.map(milestone => milestone.milestoneId));
      const filtered = prev.filter(id => availableIds.has(id));
      if (filtered.length > 0) {
        if (filtered.length === prev.length && filtered.every((id, index) => id === prev[index])) {
          return prev;
        }
        return filtered;
      }
      if (milestones.length > 0) {
        return [milestones[0].milestoneId];
      }
      return [];
    });
  }, [milestones]);

  useEffect(() => {
    if (selectedMilestoneIds.length === 0) {
      setIssues([]);
      setIssuesError(null);
      setLoadingIssues(false);
      return;
    }

    let ignore = false;
    setLoadingIssues(true);
    setIssuesError(null);
    getProjectMilestoneIssueCosts(project.id, selectedMilestoneIds)
      .then(data => {
        if (!ignore) {
          setIssues(data);
        }
      })
      .catch(err => {
        if (!ignore) {
          setIssuesError(err as ErrorResponse);
          setIssues([]);
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoadingIssues(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [project.id, selectedMilestoneIds]);

  const milestoneOrder = useMemo(() => {
    const order = new Map<number, number>();
    milestones.forEach((milestone, index) => {
      order.set(milestone.milestoneId, index);
    });
    return order;
  }, [milestones]);

  const selectedMilestones = useMemo(
    () => milestones.filter(milestone => selectedMilestoneIds.includes(milestone.milestoneId)),
    [milestones, selectedMilestoneIds],
  );

  const issuesToDisplay = useMemo(() => {
    if (selectedMilestoneIds.length === 0) {
      return [] as ProjectMilestoneIssueCost[];
    }
    const preferredOrder = new Map<number, number>();
    selectedMilestoneIds.forEach((id, index) => {
      preferredOrder.set(id, index);
    });
    return issues
      .filter(issue => preferredOrder.has(issue.milestoneId))
      .slice()
      .sort((a, b) => {
        const orderA = preferredOrder.get(a.milestoneId) ?? Number.MAX_SAFE_INTEGER;
        const orderB = preferredOrder.get(b.milestoneId) ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.issueTitle.localeCompare(b.issueTitle, 'cs');
      });
  }, [issues, selectedMilestoneIds]);

  const milestoneTitleMap = useMemo(() => {
    const map = new Map<number, string>();
    milestones.forEach(milestone => {
      map.set(milestone.milestoneId, milestone.title);
    });
    return map;
  }, [milestones]);

  const totalSelectedSeconds = useMemo(
    () =>
      selectedMilestones.reduce((sum, milestone) => {
        const value = Number.isFinite(milestone.totalTimeSpentSeconds)
          ? milestone.totalTimeSpentSeconds
          : 0;
        return sum + value;
      }, 0),
    [selectedMilestones],
  );

  function toggleMilestoneSelection(milestoneId: number) {
    setSelectedMilestoneIds(prev => {
      const exists = prev.includes(milestoneId);
      let next: number[];
      if (exists) {
        next = prev.filter(id => id !== milestoneId);
      } else {
        next = [...prev, milestoneId];
      }
      if (next.length === 0) {
        return [];
      }
      return next
        .slice()
        .sort((a, b) => (milestoneOrder.get(a) ?? 0) - (milestoneOrder.get(b) ?? 0));
    });
  }

  return (
    <section className="projectReportProjectDetail" aria-label={`Milníky projektu ${project.name}`}>
      <header className="projectReportProjectDetail__header">
        <div className="projectReportProjectDetail__nav">
          <button type="button" className="projectReport__backButton" onClick={onBack}>
            ← Zpět na projekty
          </button>
          <button type="button" className="projectReportProjectDetail__link" onClick={onCloseDetail}>
            ← Zpět na souhrn
          </button>
        </div>
        <div className="projectReportProjectDetail__headline">
          <h1>Detail projektu</h1>
          <p>Práce na projektu {project.name} seskupené podle aktivních milníků.</p>
        </div>
      </header>

      <div className="projectReportProjectDetail__panels">
        <div className="panel projectReportProjectDetail__panel" aria-label="Výběr milníků">
          <div className="panel__body">
            <div className="projectReportProjectDetail__panelHeader">
              <h2>Aktivní milníky</h2>
              <p>Vyberte milníky pro zobrazení souhrnů a nákladů.</p>
            </div>
            {loadingMilestones ? (
              <p className="projectReportProjectDetail__status">Načítám milníky…</p>
            ) : milestoneError ? (
              <div className="projectReportProjectDetail__error" role="alert">
                <p>Nepodařilo se načíst milníky.</p>
                <p>{milestoneError.error.message}</p>
              </div>
            ) : milestones.length === 0 ? (
              <p className="projectReportProjectDetail__status">Pro projekt nejsou dostupné žádné aktivní milníky.</p>
            ) : (
              <div className="projectReportProjectDetail__tableWrapper">
                <table className="projectReportProjectDetail__table">
                  <thead>
                    <tr>
                      <th scope="col" className="projectReportProjectDetail__colToggle">
                        Výběr
                      </th>
                      <th scope="col">Milník</th>
                      <th scope="col">Uzávěrka</th>
                      <th scope="col">Čas strávený</th>
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.map(milestone => {
                      const selected = selectedMilestoneIds.includes(milestone.milestoneId);
                      return (
                        <tr key={milestone.milestoneId} className={selected ? 'is-selected' : undefined}>
                          <td className="projectReportProjectDetail__colToggle">
                            <label className="projectReportProjectDetail__checkbox">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleMilestoneSelection(milestone.milestoneId)}
                              />
                              <span className="sr-only">{milestone.title}</span>
                            </label>
                          </td>
                          <td>
                            <div className="projectReportProjectDetail__milestoneTitle">
                              <span className="projectReportProjectDetail__milestoneName">{milestone.title}</span>
                              <span className="projectReportProjectDetail__milestoneMeta">IID {milestone.milestoneIid}</span>
                            </div>
                          </td>
                          <td>{formatDate(milestone.dueDate)}</td>
                          <td>{formatDuration(milestone.totalTimeSpentSeconds)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="panel projectReportProjectDetail__panel" aria-label="Souhrn vybraných milníků">
          <div className="panel__body">
            <div className="projectReportProjectDetail__panelHeader">
              <h2>Souhrn vybraných milníků</h2>
              <p>Součet času vykázaného v issues přiřazených k vybraným milníkům.</p>
            </div>
            {selectedMilestones.length === 0 ? (
              <p className="projectReportProjectDetail__status">Vyberte alespoň jeden milník.</p>
            ) : (
              <div className="projectReportProjectDetail__tableWrapper">
                <table className="projectReportProjectDetail__table">
                  <thead>
                    <tr>
                      <th scope="col">Milník</th>
                      <th scope="col">Čas strávený</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedMilestones.map(milestone => (
                      <tr key={milestone.milestoneId}>
                        <td>{milestone.title}</td>
                        <td>{formatDuration(milestone.totalTimeSpentSeconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Celkem</th>
                      <td>{formatDuration(totalSelectedSeconds)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel" aria-label="Issues dle milníků">
        <div className="panel__body">
          <div className="projectReportProjectDetail__panelHeader">
            <h2>Issues v milnících</h2>
            <p>Celkové náklady vycházejí ze všech výkazů přiřazených k issue v rámci vybraných milníků.</p>
          </div>
          {selectedMilestoneIds.length === 0 ? (
            <p className="projectReportProjectDetail__status">Vyberte milník pro zobrazení nákladů na issues.</p>
          ) : loadingIssues ? (
            <p className="projectReportProjectDetail__status">Načítám data…</p>
          ) : issuesError ? (
            <div className="projectReportProjectDetail__error" role="alert">
              <p>Nepodařilo se načíst náklady na issues.</p>
              <p>{issuesError.error.message}</p>
            </div>
          ) : issuesToDisplay.length === 0 ? (
            <p className="projectReportProjectDetail__status">
              Ve vybraných milnících nejsou žádné issues s vykázanými náklady.
            </p>
          ) : (
            <div className="projectReportProjectDetail__tableWrapper">
              <table className="projectReportProjectDetail__table">
                <thead>
                  <tr>
                    <th scope="col">Issue</th>
                    <th scope="col">Celkové náklady</th>
                  </tr>
                </thead>
                <tbody>
                  {issuesToDisplay.map(issue => {
                    const milestoneTitle = milestoneTitleMap.get(issue.milestoneId);
                    const metadata: string[] = [];
                    if (milestoneTitle) {
                      metadata.push(`Milník: ${milestoneTitle}`);
                    }
                    if (issue.issueIid != null) {
                      metadata.push(`#${issue.issueIid}`);
                    }
                    return (
                      <tr key={`${issue.milestoneId}-${issue.issueId ?? issue.issueIid ?? issue.issueTitle}`}>
                        <td>
                          <div className="projectReportProjectDetail__issueInfo">
                            <span className="projectReportProjectDetail__issueTitle">{issue.issueTitle}</span>
                            {metadata.length > 0 ? (
                              <span className="projectReportProjectDetail__issueMeta">{metadata.join(' • ')}</span>
                            ) : null}
                          </div>
                        </td>
                        <td>{formatCost(issue.totalCost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
