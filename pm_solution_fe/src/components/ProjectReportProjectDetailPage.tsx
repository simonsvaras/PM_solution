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
import Badge from './Badge';

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
  const trimmedUsername = username?.trim();
  if (trimmedUsername) {
    return `@${trimmedUsername}`;
  }
  const trimmedName = name?.trim();
  if (trimmedName) {
    return trimmedName;
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

function normalizeSeconds(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Reads the value part of a GitLab label in a tolerant way (ignores whitespace around the colon).
 */
function getLabelValue(labels: readonly string[] | null | undefined, labelKey: string): string | null {
  if (!labels || labels.length === 0) {
    return null;
  }
  const normalizedKey = labelKey.trim().toLowerCase();
  for (const label of labels) {
    if (!label) {
      continue;
    }
    const [rawKey, ...rawValueParts] = label.split(':');
    if (!rawKey || rawValueParts.length === 0) {
      continue;
    }
    if (rawKey.trim().toLowerCase() === normalizedKey) {
      const value = rawValueParts.join(':').trim();
      if (value.length > 0) {
        return value;
      }
    }
  }
  return null;
}

/**
 * Builds a unique list of label options that can be used by radio filters.
 */
function buildLabelOptions(issues: ProjectMilestoneDetail['issues'], labelKey: string) {
  const seen = new Map<string, string>();
  issues.forEach(issue => {
    const value = getLabelValue(issue.labels, labelKey);
    if (!value) {
      return;
    }
    const normalizedValue = value.toLowerCase();
    if (!seen.has(normalizedValue)) {
      seen.set(normalizedValue, value);
    }
  });
  return Array.from(seen.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'cs', { sensitivity: 'base' }));
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
  /**
   * Stores selected label filters for priority and team. The "all" sentinel means no filtering.
   */
  const [issuePriorityFilter, setIssuePriorityFilter] = useState<string>('all');
  const [issueTeamFilter, setIssueTeamFilter] = useState<string>('all');
  const [issueStatusFilter, setIssueStatusFilter] = useState<string>('all');
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
    setIssuePriorityFilter('all');
    setIssueTeamFilter('all');
    setIssueStatusFilter('all');
    setSortConfig(null);
  }, [detail?.summary.milestoneId]);

  const selectedSummary = detail?.summary ?? null;

  const internContributions = useMemo(() => detail?.internContributions ?? [], [detail]);

  const maxContributionSeconds = useMemo(() => {
    return internContributions.reduce((max, contribution) => {
      const totalSeconds = normalizeSeconds(contribution.totalTimeSpentSeconds);
      return Math.max(max, totalSeconds);
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

  /**
   * Available label filter values derived from the loaded milestone issues.
   */
  const priorityOptions = useMemo(() => {
    if (!detail) {
      return [] as { value: string; label: string }[];
    }
    return buildLabelOptions(detail.issues, 'priority');
  }, [detail]);

  const teamOptions = useMemo(() => {
    if (!detail) {
      return [] as { value: string; label: string }[];
    }
    return buildLabelOptions(detail.issues, 'team');
  }, [detail]);

  const statusOptions = useMemo(() => {
    if (!detail) {
      return [] as { value: string; label: string }[];
    }
    return buildLabelOptions(detail.issues, 'status');
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

      if (issuePriorityFilter !== 'all') {
        const priorityValue = getLabelValue(issue.labels, 'priority');
        if (!priorityValue || priorityValue.toLowerCase() !== issuePriorityFilter) {
          return false;
        }
      }

      if (issueTeamFilter !== 'all') {
        const teamValue = getLabelValue(issue.labels, 'team');
        if (!teamValue || teamValue.toLowerCase() !== issueTeamFilter) {
          return false;
        }
      }

      if (issueStatusFilter !== 'all') {
        const statusValue = getLabelValue(issue.labels, 'status');
        if (!statusValue || statusValue.toLowerCase() !== issueStatusFilter) {
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
  }, [
    detail,
    issueSearch,
    issueAssignee,
    issueStateFilter,
    issuePriorityFilter,
    issueTeamFilter,
    issueStatusFilter,
    sortConfig,
  ]);

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
                    const totalSeconds = normalizeSeconds(contribution.totalTimeSpentSeconds);
                    const percentage = maxContributionSeconds > 0
                      ? (totalSeconds / maxContributionSeconds) * 100
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
                    const isTopContributor =
                      maxContributionSeconds > 0 &&
                      Math.abs(totalSeconds - maxContributionSeconds) < 1e-6;
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
                          {isTopContributor ? (
                            <span
                              className="projectReportProjectDetail__chartCrown"
                              role="img"
                              aria-label="Nejvíce odpracovaných hodin"
                            >
                              👑
                            </span>
                          ) : null}
                          <span className="projectReportProjectDetail__chartValue">
                            {formatShortHours(totalSeconds)}
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
                  <fieldset className="projectReportProjectDetail__filterControl projectReportProjectDetail__labelsFilter">
                    <legend>Priority</legend>
                    <label>
                      <input
                        type="radio"
                        name="issue-priority"
                        value="all"
                        checked={issuePriorityFilter === 'all'}
                        onChange={() => setIssuePriorityFilter('all')}
                      />
                      <span>Všechny</span>
                    </label>
                    {priorityOptions.map(option => (
                      <label key={option.value}>
                        <input
                          type="radio"
                          name="issue-priority"
                          value={option.value}
                          checked={issuePriorityFilter === option.value}
                          onChange={() => setIssuePriorityFilter(option.value)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="projectReportProjectDetail__filterControl projectReportProjectDetail__labelsFilter">
                    <legend>Tým</legend>
                    <label>
                      <input
                        type="radio"
                        name="issue-team"
                        value="all"
                        checked={issueTeamFilter === 'all'}
                        onChange={() => setIssueTeamFilter('all')}
                      />
                      <span>Všechny</span>
                    </label>
                    {teamOptions.map(option => (
                      <label key={option.value}>
                        <input
                          type="radio"
                          name="issue-team"
                          value={option.value}
                          checked={issueTeamFilter === option.value}
                          onChange={() => setIssueTeamFilter(option.value)}
                        />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </fieldset>
                <fieldset className="projectReportProjectDetail__filterControl projectReportProjectDetail__labelsFilter">
                  <legend>Status</legend>
                  <label>
                    <input
                      type="radio"
                      name="issue-status"
                      value="all"
                      checked={issueStatusFilter === 'all'}
                      onChange={() => setIssueStatusFilter('all')}
                    />
                    <span>Všechny</span>
                  </label>
                  {statusOptions.map(option => (
                    <label key={option.value}>
                      <input
                        type="radio"
                        name="issue-status"
                        value={option.value}
                        checked={issueStatusFilter === option.value}
                        onChange={() => setIssueStatusFilter(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
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
                          <th scope="col">Priorita</th>
                          <th scope="col">Tým</th>
                          <th scope="col">Status</th>
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
                              <td className="projectReportProjectDetail__cellBadge">
                                <Badge kind="priority" value={getLabelValue(issue.labels, 'priority')} />
                              </td>
                              <td className="projectReportProjectDetail__cellBadge">
                                <Badge kind="team" value={getLabelValue(issue.labels, 'team')} />
                              </td>
                              <td className="projectReportProjectDetail__cellBadge">
                                <Badge kind="status" value={getLabelValue(issue.labels, 'status')} />
                              </td>
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
