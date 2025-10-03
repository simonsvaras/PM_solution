import { useEffect, useMemo, useState } from 'react';
import './ProjectReportProjectDetailPage.css';
import {
  getProjectActiveMilestones,
  getProjectMilestoneDetail,
  type ErrorResponse,
  type ProjectMilestoneDetail,
  type ProjectMilestoneSummary,
  type ProjectOverviewDTO,
} from '../api';
import InfoCard from './InfoCard';

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
    return 'Bez termínu';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Bez termínu';
  }
  return date.toLocaleDateString('cs-CZ');
}

function formatIssueState(value?: string | null): string {
  if (!value) {
    return '—';
  }
  const lower = value.toLowerCase();
  if (lower === 'opened') {
    return 'Otevřeno';
  }
  if (lower === 'closed') {
    return 'Uzavřeno';
  }
  return value;
}

function formatAssignee(name?: string | null, username?: string | null): string {
  const trimmedName = name?.trim();
  const trimmedUsername = username?.trim();
  if (trimmedName && trimmedUsername) {
    return `${trimmedName} (@${trimmedUsername})`;
  }
  if (trimmedName) {
    return trimmedName;
  }
  if (trimmedUsername) {
    return `@${trimmedUsername}`;
  }
  return '—';
}

function calculateDaysToDeadline(dueDate: string | null): { value: string; description: string } {
  if (!dueDate) {
    return { value: '—', description: 'Bez termínu' };
  }
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return { value: '—', description: 'Bez termínu' };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const diffDaysRaw = (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  const diffDays = diffDaysRaw >= 0 ? Math.ceil(diffDaysRaw) : Math.floor(diffDaysRaw);
  const absDays = Math.abs(diffDays);
  const unit = absDays === 1 ? 'den' : absDays >= 2 && absDays <= 4 ? 'dny' : 'dní';
  const formattedNumber = diffDays.toLocaleString('cs-CZ');
  return { value: `${formattedNumber} ${unit}`, description: dueDay.toLocaleDateString('cs-CZ') };
}

function formatShortHours(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '0 h';
  }
  const hours = seconds / 3600;
  return `${hours.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} h`;
}

type ProjectReportProjectDetailPageProps = {
  project: ProjectOverviewDTO;
};

export default function ProjectReportProjectDetailPage({ project }: ProjectReportProjectDetailPageProps) {
  const [milestones, setMilestones] = useState<ProjectMilestoneSummary[]>([]);
  const [loadingMilestones, setLoadingMilestones] = useState(false);
  const [milestoneError, setMilestoneError] = useState<ErrorResponse | null>(null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProjectMilestoneDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<ErrorResponse | null>(null);
  const [issueSearch, setIssueSearch] = useState('');
  const [issueAssignee, setIssueAssignee] = useState('all');
  const [issueStateFilter, setIssueStateFilter] = useState<'all' | 'opened' | 'closed' | 'other'>('all');
  const [sortConfig, setSortConfig] = useState<{
    key: 'time' | 'cost';
    direction: 'asc' | 'desc';
  } | null>(null);

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
    if (milestones.length === 0) {
      setSelectedMilestoneId(null);
      return;
    }
    setSelectedMilestoneId(prev => {
      if (prev != null && milestones.some(milestone => milestone.milestoneId === prev)) {
        return prev;
      }
      return milestones[0].milestoneId;
    });
  }, [milestones]);

  useEffect(() => {
    if (selectedMilestoneId == null) {
      setDetail(null);
      setDetailError(null);
      setLoadingDetail(false);
      return;
    }

    let ignore = false;
    setLoadingDetail(true);
    setDetailError(null);
    getProjectMilestoneDetail(project.id, selectedMilestoneId)
      .then(data => {
        if (!ignore) {
          setDetail(data);
        }
      })
      .catch(err => {
        if (!ignore) {
          setDetailError(err as ErrorResponse);
          setDetail(null);
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoadingDetail(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [project.id, selectedMilestoneId]);

  useEffect(() => {
    setIssueSearch('');
    setIssueAssignee('all');
    setIssueStateFilter('all');
    setSortConfig(null);
  }, [detail?.summary.milestoneId]);

  const selectedSummary = detail?.summary ?? null;

  const internContributions = useMemo(() => detail?.internContributions ?? [], [detail]);

  const maxContributionSeconds = useMemo(() => {
    return internContributions.reduce((max, contribution) => {
      return Math.max(max, contribution.totalTimeSpentSeconds);
    }, 0);
  }, [internContributions]);

  const progressInfo = useMemo(() => {
    if (!selectedSummary || selectedSummary.totalIssues === 0) {
      return { value: '—', description: 'Žádné issues' };
    }
    const ratio = selectedSummary.closedIssues / selectedSummary.totalIssues;
    const percent = ratio * 100;
    return {
      value: `${percent.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} %`,
      description: `${selectedSummary.closedIssues.toLocaleString('cs-CZ')} / ${selectedSummary.totalIssues.toLocaleString('cs-CZ')}`,
    };
  }, [selectedSummary]);

  const deadlineInfo = useMemo(() => {
    if (!selectedSummary) {
      return { value: '—', description: 'Bez termínu' };
    }
    return calculateDaysToDeadline(selectedSummary.dueDate);
  }, [selectedSummary]);

  const costInfo = useMemo(() => {
    if (!selectedSummary) {
      return { value: '—', description: 'Součet všech výkazů' };
    }
    return { value: formatCost(selectedSummary.totalCost), description: 'Součet všech výkazů' };
  }, [selectedSummary]);

  const assigneeOptions = useMemo(() => {
    if (!detail) {
      return [] as { value: string; label: string }[];
    }
    const map = new Map<string, string>();
    detail.issues.forEach(issue => {
      const username = issue.assigneeUsername?.trim();
      const name = issue.assigneeName?.trim();
      const key = username ? `username:${username}` : name ? `name:${name}` : 'unassigned';
      if (!map.has(key)) {
        const label = key === 'unassigned' ? 'Nepřiřazeno' : formatAssignee(issue.assigneeName, issue.assigneeUsername);
        map.set(key, label);
      }
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'cs', { sensitivity: 'base' }));
  }, [detail]);

  const filteredIssues = useMemo(() => {
    if (!detail) {
      return [] as ProjectMilestoneDetail['issues'];
    }
    const normalizedSearch = issueSearch.trim().toLowerCase();
    const filtered = detail.issues.filter(issue => {
      if (normalizedSearch && !issue.issueTitle.toLowerCase().includes(normalizedSearch)) {
        return false;
      }

      if (issueAssignee !== 'all') {
        const username = issue.assigneeUsername?.trim();
        const name = issue.assigneeName?.trim();
        const key = username ? `username:${username}` : name ? `name:${name}` : 'unassigned';
        if (key !== issueAssignee) {
          return false;
        }
      }

      if (issueStateFilter !== 'all') {
        const normalizedState = issue.state?.toLowerCase();
        if (issueStateFilter === 'other') {
          if (!normalizedState || normalizedState === 'opened' || normalizedState === 'closed') {
            return false;
          }
        } else if (normalizedState !== issueStateFilter) {
          return false;
        }
      }

      return true;
    });

    if (!sortConfig) {
      return filtered;
    }

    const { key, direction } = sortConfig;
    const multiplier = direction === 'asc' ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const first = key === 'time' ? a.totalTimeSpentSeconds : a.totalCost;
      const second = key === 'time' ? b.totalTimeSpentSeconds : b.totalCost;
      const safeFirst = first ?? -Infinity;
      const safeSecond = second ?? -Infinity;
      if (safeFirst === safeSecond) {
        return (a.issueTitle || '').localeCompare(b.issueTitle || '', 'cs', { sensitivity: 'base' });
      }
      return safeFirst > safeSecond ? multiplier : -multiplier;
    });

    return sorted;
  }, [detail, issueSearch, issueAssignee, issueStateFilter, sortConfig]);

  const handleSortChange = (key: 'time' | 'cost') => {
    setSortConfig(prev => {
      if (!prev || prev.key !== key) {
        return { key, direction: 'desc' };
      }
      return { key, direction: prev.direction === 'desc' ? 'asc' : 'desc' };
    });
  };

  return (
    <section className="projectReportProjectDetail" aria-label={`Milníky projektu ${project.name}`}>
      <header className="projectReportProjectDetail__header">
        <div className="projectReportProjectDetail__headline">
          <h2>Aktivní milníky</h2>
          <p>Vyberte aktivní milník pro zobrazení jeho detailního přehledu.</p>
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
          <div className="projectReportDetail__internFiltersWrapper">
            <div
              className="projectReportDetail__internFilters projectReportProjectDetail__filters"
              role="radiogroup"
              aria-label="Aktivní milníky"
            >
              {milestones.map(milestone => {
                const isActive = milestone.milestoneId === selectedMilestoneId;
                const description = milestone.description?.trim();
                return (
                  <button
                    type="button"
                    key={milestone.milestoneId}
                    className={`projectReportDetail__internButton${
                      isActive ? ' projectReportDetail__internButton--active' : ''
                    }`}
                    onClick={() => setSelectedMilestoneId(milestone.milestoneId)}
                    disabled={loadingDetail}
                    aria-pressed={isActive}
                    title={description || undefined}
                  >
                    {milestone.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {selectedMilestoneId == null ? null : loadingDetail ? (
        <p className="projectReportProjectDetail__status">Načítám detail milníku…</p>
      ) : detailError ? (
        <div className="projectReportProjectDetail__error" role="alert">
          <p>Nepodařilo se načíst detail milníku.</p>
          <p>{detailError.error.message}</p>
        </div>
      ) : detail ? (
        <>
          <div className="projectReportProjectDetail__infoCards">
            <InfoCard title="Progres práce" value={progressInfo.value} description={progressInfo.description} />
            <InfoCard title="Časový průběh" value={deadlineInfo.value} description={deadlineInfo.description} />
            <InfoCard title="Náklady" value={costInfo.value} description={costInfo.description} />
          </div>

          <div className="projectReportProjectDetail__summarySection">
            <article className="projectReportProjectDetail__milestoneCard">
              <p className="projectReportProjectDetail__milestoneDescription">
                {detail.summary.description?.trim() || 'Milník nemá žádný popis.'}
              </p>
            </article>

            <div
              className="projectReportProjectDetail__chart"
              role="img"
              aria-label={`Rozložení hodin stážistů na milníku ${detail.summary.title}`}
            >
              <div className="projectReportProjectDetail__chartHeader">
                <h3>Rozložení hodin podle stážistů</h3>
                <span>Hodiny</span>
              </div>
              {internContributions.length === 0 ? (
                <p className="projectReportProjectDetail__status">
                  Pro milník zatím nejsou vykázané žádné hodiny.
                </p>
              ) : (
                <div className="projectReportProjectDetail__chartBars">
                  {internContributions.map(contribution => {
                    const percentage = maxContributionSeconds > 0
                      ? Math.max((contribution.totalTimeSpentSeconds / maxContributionSeconds) * 100, 6)
                      : 0;
                    const labelParts: string[] = [];
                    if (contribution.internFirstName || contribution.internLastName) {
                      labelParts.push(
                        `${contribution.internFirstName ?? ''}${
                          contribution.internFirstName && contribution.internLastName ? ' ' : ''
                        }${contribution.internLastName ?? ''}`.trim(),
                      );
                    }
                    const usernameLabel = contribution.internUsername ? `@${contribution.internUsername}` : '';
                    if (labelParts.length === 0 && usernameLabel) {
                      labelParts.push(usernameLabel);
                    } else if (labelParts.length > 0 && usernameLabel) {
                      labelParts.push(usernameLabel);
                    }
                    const displayLabel = labelParts.join(' ');
                    return (
                      <div
                        key={contribution.internId ?? contribution.internUsername}
                        className="projectReportProjectDetail__chartBar"
                      >
                        <div
                          className="projectReportProjectDetail__chartColumn"
                          style={{ height: `${percentage}%` }}
                          aria-hidden="true"
                        >
                          <span className="projectReportProjectDetail__chartValue">
                            {formatShortHours(contribution.totalTimeSpentSeconds)}
                          </span>
                        </div>
                        <span className="projectReportProjectDetail__chartLabel">{displayLabel}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="projectReportProjectDetail__issuesSection">
            <div className="projectReportProjectDetail__panelHeader">
              <h3>Issues milníku</h3>
              <p>Seznam všech issues vybraného milníku.</p>
            </div>
            {detail.issues.length === 0 ? (
              <p className="projectReportProjectDetail__status">Milník zatím neobsahuje žádné issues.</p>
            ) : (
              <>
                <div className="projectReportProjectDetail__issuesControls">
                  <label className="projectReportProjectDetail__filterControl">
                    <span>Issue</span>
                    <input
                      type="text"
                      value={issueSearch}
                      onChange={event => setIssueSearch(event.target.value)}
                      placeholder="Hledat podle názvu"
                    />
                  </label>
                  <label className="projectReportProjectDetail__filterControl">
                    <span>Assignee</span>
                    <select value={issueAssignee} onChange={event => setIssueAssignee(event.target.value)}>
                      <option value="all">Všichni</option>
                      {assigneeOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="projectReportProjectDetail__filterControl projectReportProjectDetail__stateFilter">
                    <legend>Stav</legend>
                    <label>
                      <input
                        type="radio"
                        name="issue-state"
                        value="all"
                        checked={issueStateFilter === 'all'}
                        onChange={() => setIssueStateFilter('all')}
                      />
                      <span>Všechny</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="issue-state"
                        value="opened"
                        checked={issueStateFilter === 'opened'}
                        onChange={() => setIssueStateFilter('opened')}
                      />
                      <span>Otevřené</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="issue-state"
                        value="closed"
                        checked={issueStateFilter === 'closed'}
                        onChange={() => setIssueStateFilter('closed')}
                      />
                      <span>Uzavřené</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="issue-state"
                        value="other"
                        checked={issueStateFilter === 'other'}
                        onChange={() => setIssueStateFilter('other')}
                      />
                      <span>Ostatní</span>
                    </label>
                  </fieldset>
                </div>

                {filteredIssues.length === 0 ? (
                  <p className="projectReportProjectDetail__status">
                    Žádné issues neodpovídají zadaným filtrům.
                  </p>
                ) : (
                  <div className="projectReportProjectDetail__tableWrapper">
                    <table className="projectReportProjectDetail__table">
                      <thead>
                        <tr>
                          <th scope="col">Issue</th>
                          <th scope="col">Assignee</th>
                          <th scope="col">Stav</th>
                          <th scope="col">Termín</th>
                          <th scope="col" className="projectReportProjectDetail__columnNumeric">
                            <button
                              type="button"
                              className="projectReportProjectDetail__sortButton"
                              onClick={() => handleSortChange('time')}
                              aria-label={`Seřadit podle celkově vykázáno (${sortConfig?.key === 'time' ? (sortConfig.direction === 'desc' ? 'sestupně' : 'vzestupně') : 'sestupně'})`}
                            >
                              Celkově vykázáno
                              <span aria-hidden="true">
                                {sortConfig?.key === 'time'
                                  ? sortConfig.direction === 'desc'
                                    ? ' ↓'
                                    : ' ↑'
                                  : ' ↕'}
                              </span>
                            </button>
                          </th>
                          <th scope="col" className="projectReportProjectDetail__columnNumeric">
                            <button
                              type="button"
                              className="projectReportProjectDetail__sortButton"
                              onClick={() => handleSortChange('cost')}
                              aria-label={`Seřadit podle celkových nákladů (${sortConfig?.key === 'cost' ? (sortConfig.direction === 'desc' ? 'sestupně' : 'vzestupně') : 'sestupně'})`}
                            >
                              Celkové náklady
                              <span aria-hidden="true">
                                {sortConfig?.key === 'cost'
                                  ? sortConfig.direction === 'desc'
                                    ? ' ↓'
                                    : ' ↑'
                                  : ' ↕'}
                              </span>
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredIssues.map(issue => {
                          const key = issue.issueId ?? issue.issueIid ?? issue.issueTitle;
                          const meta: string[] = [];
                          if (issue.issueIid != null) {
                            meta.push(`#${issue.issueIid}`);
                          }
                          const issueContent = (
                            <div className="projectReportProjectDetail__issueInfo">
                              <span className="projectReportProjectDetail__issueTitle">{issue.issueTitle}</span>
                              {meta.length > 0 ? (
                                <span className="projectReportProjectDetail__issueMeta">{meta.join(' • ')}</span>
                              ) : null}
                            </div>
                          );
                          return (
                            <tr key={key}>
                              <td>
                                {issue.issueWebUrl ? (
                                  <a
                                    href={issue.issueWebUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="projectReportProjectDetail__issueLink"
                                  >
                                    {issueContent}
                                  </a>
                                ) : (
                                  issueContent
                                )}
                              </td>
                              <td>{formatAssignee(issue.assigneeName, issue.assigneeUsername)}</td>
                              <td>{formatIssueState(issue.state)}</td>
                              <td>{formatDate(issue.dueDate)}</td>
                              <td className="projectReportProjectDetail__cellNumber">
                                {formatDuration(issue.totalTimeSpentSeconds)}
                              </td>
                              <td className="projectReportProjectDetail__cellNumber">
                                {formatCost(issue.totalCost)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
