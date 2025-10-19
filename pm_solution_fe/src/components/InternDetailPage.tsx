import { useEffect, useMemo, useState } from 'react';
import './InternDetailPage.css';
import {
  getInternOverviewDetail,
  getInternPerformance,
  getInternStatusHistory,
  getProjectReportInternDetail,
  type ErrorResponse,
  type InternDetail,
  type InternPerformanceResponse,
  type InternStatusHistoryEntry,
  type ProjectReportInternDetailIssue,
} from '../api';
import Badge from './Badge';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function formatHours(hours: number | null): string {
  if (hours === null || Number.isNaN(hours)) {
    return 'N/A';
  }
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

function resolveStatusModifier(severity: number): string {
  if (severity >= 30) return 'internDetail__statusBadge--critical';
  if (severity >= 20) return 'internDetail__statusBadge--warning';
  return 'internDetail__statusBadge--ok';
}

function formatDateCz(value: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('cs-CZ');
    return formatter.format(new Date(value));
  } catch {
    return value;
  }
}

function formatHistoryRange(entry: InternStatusHistoryEntry): string {
  const from = formatDateCz(entry.validFrom);
  const to = entry.validTo ? formatDateCz(entry.validTo) : 'dosud';
  return `${from} – ${to}`;
}

function formatHoursFromSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0 h';
  }
  const hours = seconds / 3600;
  return `${hours.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
}

function formatIssueDueDate(value: string | null): string {
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

function getPriorityLabel(labels: readonly string[] | null | undefined): string | null {
  return getLabelValue(labels, 'priorita') ?? getLabelValue(labels, 'priority');
}

type InternDetailPageProps = {
  internId: number;
  onBack: () => void;
};

type ChartDatum = {
  bucket: string;
  total: number;
  [key: `project${string}`]: number;
};

type ProjectIssuesState = {
  projectId: number;
  projectName: string;
  issues: ProjectReportInternDetailIssue[];
  loading: boolean;
  error: string | null;
};

const PROJECT_COLORS = [
  '#2563eb',
  '#ea580c',
  '#16a34a',
  '#7c3aed',
  '#ef4444',
  '#0ea5e9',
  '#f59e0b',
  '#14b8a6',
  '#d946ef',
  '#65a30d',
  '#f97316',
  '#8b5cf6',
];

export default function InternDetailPage({ internId, onBack }: InternDetailPageProps) {
  const [detail, setDetail] = useState<InternDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<InternStatusHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<'week' | 'month'>('week');
  const [chartPeriods, setChartPeriods] = useState(4);
  const [performance, setPerformance] = useState<InternPerformanceResponse | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [projectIssues, setProjectIssues] = useState<ProjectIssuesState[]>([]);
  const [projectIssuesLoading, setProjectIssuesLoading] = useState(false);
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2, minimumFractionDigits: 0 }),
    [],
  );

  const statusSummary = useMemo(() => {
    return history.reduce<
      { label: string; count: number; severity: number }[]
    >((acc, entry) => {
      const existing = acc.find(item => item.label === entry.statusLabel);
      if (existing) {
        existing.count += 1;
        existing.severity = Math.max(existing.severity, entry.statusSeverity);
      } else {
        acc.push({ label: entry.statusLabel, count: 1, severity: entry.statusSeverity });
      }
      return acc;
    }, []);
  }, [history]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    getInternOverviewDetail(internId)
      .then(data => {
        if (!ignore) {
          setDetail(data);
        }
      })
      .catch(err => {
        if (!ignore) {
          setError(extractErrorMessage(err));
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [internId]);

  useEffect(() => {
    let ignore = false;
    setHistoryLoading(true);
    setHistoryError(null);
    setHistory([]);
    getInternStatusHistory(internId)
      .then(entries => {
        if (!ignore) {
          setHistory(entries);
        }
      })
      .catch(err => {
        if (!ignore) {
          setHistoryError(extractErrorMessage(err));
        }
      })
      .finally(() => {
        if (!ignore) {
          setHistoryLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [internId]);

  useEffect(() => {
    let ignore = false;
    setPerformanceLoading(true);
    setPerformanceError(null);
    setPerformance(null);
    getInternPerformance({
      period: chartPeriod,
      periods: chartPeriods,
      internIds: [internId],
    })
      .then(response => {
        if (!ignore) {
          setPerformance(response);
        }
      })
      .catch(err => {
        if (!ignore) {
          setPerformanceError(extractErrorMessage(err));
        }
      })
      .finally(() => {
        if (!ignore) {
          setPerformanceLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [internId, chartPeriod, chartPeriods]);

  useEffect(() => {
    if (!detail) {
      setProjectIssues([]);
      setProjectIssuesLoading(false);
      return;
    }

    const uniqueProjects = detail.projects.reduce<{
      projectId: number;
      projectName: string;
    }[]>((acc, project) => {
      if (acc.some(item => item.projectId === project.projectId)) {
        return acc;
      }
      acc.push({ projectId: project.projectId, projectName: project.projectName });
      return acc;
    }, []);

    if (uniqueProjects.length === 0) {
      setProjectIssues([]);
      setProjectIssuesLoading(false);
      return;
    }

    let ignore = false;
    setProjectIssuesLoading(true);
    setProjectIssues(
      uniqueProjects.map(project => ({
        projectId: project.projectId,
        projectName: resolveProjectName(project.projectName),
        issues: [],
        loading: true,
        error: null,
      })),
    );

    const internUsername = detail.username;

    async function loadIssues() {
      const results = await Promise.all(
        uniqueProjects.map(async project => {
          try {
            const response = await getProjectReportInternDetail(project.projectId, internUsername);
            return {
              projectId: project.projectId,
              issues: response.issues,
              error: null as string | null,
            };
          } catch (err) {
            return {
              projectId: project.projectId,
              issues: [],
              error: extractErrorMessage(err),
            };
          }
        }),
      );

      if (ignore) {
        return;
      }

      setProjectIssues(
        uniqueProjects.map(project => {
          const result = results.find(item => item.projectId === project.projectId);
          return {
            projectId: project.projectId,
            projectName: resolveProjectName(project.projectName),
            issues: result?.issues ?? [],
            loading: false,
            error: result?.error ?? null,
          };
        }),
      );
      setProjectIssuesLoading(false);
    }

    loadIssues().catch(err => {
      if (ignore) {
        return;
      }
      setProjectIssues(
        uniqueProjects.map(project => ({
          projectId: project.projectId,
          projectName: resolveProjectName(project.projectName),
          issues: [],
          loading: false,
          error: extractErrorMessage(err),
        })),
      );
      setProjectIssuesLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [detail]);

  const groups = detail?.groups.map(group => group.label).join(', ') || 'Bez skupiny';

  const chartProjects = useMemo(() => {
    if (!performance || performance.interns.length === 0) return [];
    const [intern] = performance.interns;
    const descriptors: { key: string; label: string; color: string }[] = [];
    const used = new Map<string, number>();
    intern.projects.forEach(project => {
      const key = buildProjectKey(project.projectId);
      if (used.has(key)) return;
      used.set(key, descriptors.length);
      descriptors.push({
        key,
        label: resolveProjectName(project.projectName),
        color: PROJECT_COLORS[descriptors.length % PROJECT_COLORS.length],
      });
    });
    if (descriptors.length === 0) {
      descriptors.push({
        key: buildProjectKey(null),
        label: resolveProjectName(null),
        color: PROJECT_COLORS[0],
      });
    }
    return descriptors;
  }, [performance]);

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!performance || performance.interns.length === 0) return [];
    const [intern] = performance.interns;
    const hoursByProject = new Map<string, number[]>();
    intern.projects.forEach(project => {
      hoursByProject.set(buildProjectKey(project.projectId), project.hours);
    });
    const fallbackKey = buildProjectKey(null);
    return performance.buckets.map((bucket, bucketIndex) => {
      const entry: ChartDatum = {
        bucket: bucket.label,
        total: 0,
      };
      let total = 0;
      chartProjects.forEach(project => {
        const source = hoursByProject.get(project.key) ?? (project.key === fallbackKey ? intern.hours : undefined);
        const value = source && source[bucketIndex] != null ? source[bucketIndex] : 0;
        entry[`project${project.key}`] = value;
        total += value;
      });
      if (total === 0) {
        total = intern.hours[bucketIndex] ?? 0;
      }
      entry.total = total;
      return entry;
    });
  }, [performance, chartProjects]);

  const hasAnyHours = useMemo(() => {
    if (!performance || performance.interns.length === 0) return false;
    return performance.interns[0].hours.some(value => value > 0);
  }, [performance]);

  const periodLabel = chartPeriod === 'week' ? 'týdny' : 'měsíce';

  function handlePeriodChange(value: 'week' | 'month') {
    setChartPeriod(value);
  }

  function handlePeriodsChange(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(Math.round(parsed), 2), 5);
    setChartPeriods(clamped);
  }

  return (
    <section className="internDetail" aria-label="Detail stážisty">
      <div className="internDetail__toolbar">
        <button type="button" className="internDetail__backButton" onClick={onBack}>
          ← Zpět na přehled stážistů
        </button>
      </div>

      {loading ? (
        <p className="internDetail__status">Načítám detail stážisty…</p>
      ) : error ? (
        <div className="internDetail__error" role="alert">
          <h2>Detail stážisty se nepodařilo načíst.</h2>
          <p>{error}</p>
        </div>
      ) : detail ? (
        <>
          <header className="internDetail__header internDetail__card">
            <div className="internDetail__headline">
              <h2>
                {detail.firstName} {detail.lastName}
              </h2>
              <p className="internDetail__username">@{detail.username}</p>
            </div>
            <div className="internDetail__status">
              <span
                className={`internDetail__badge internDetail__statusBadge ${resolveStatusModifier(detail.statusSeverity)}`}
              >
                {detail.statusLabel}
              </span>
            </div>
          </header>

          <div className="internDetail__sections">
            <section className="internDetail__section internDetail__card" aria-label="Základní informace">
              <h3>Profil stážisty</h3>
              <dl className="internDetail__metaGrid">
                <div>
                  <dt>Úroveň</dt>
                  <dd>{detail.levelLabel}</dd>
                </div>
                <div>
                  <dt>Skupiny</dt>
                  <dd>{groups}</dd>
                </div>
                <div>
                  <dt>Celkem vykázané hodiny</dt>
                  <dd className="internDetail__metaStrong">{formatHours(detail.totalHours)}</dd>
                </div>
              </dl>
            </section>

            <section className="internDetail__section internDetail__card" aria-label="Přiřazení na projekty">
              <div className="internDetail__sectionHeader">
                <h3>Přiřazení na projekty</h3>
                <p>Souhrn plánované alokace stážisty napříč projekty.</p>
              </div>
              {detail.projects.length === 0 ? (
                <p className="internDetail__status">Stážista zatím není přiřazen k žádnému projektu.</p>
              ) : (
                <div className="internDetail__tableWrapper">
                  <table className="internDetail__table">
                    <thead>
                      <tr>
                        <th scope="col">Projekt</th>
                        <th scope="col" className="internDetail__columnNumeric">Plánovaná alokace</th>
                        <th scope="col" className="internDetail__columnBoolean">Započítat do nákladů</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.projects.map(project => (
                        <tr key={project.projectId}>
                          <th scope="row">{project.projectName}</th>
                          <td className="internDetail__columnNumeric">{formatHours(project.workloadHours)}</td>
                          <td className="internDetail__columnBoolean">
                            {project.includeInReportedCost ? 'Ano' : 'Ne'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section
              className="internDetail__section internDetail__section--history internDetail__card"
              aria-label="Historie statusů stážisty"
            >
              <div className="internDetail__sectionHeader internDetail__sectionHeader--history">
                <div className="internDetail__sectionHeaderContent">
                  <h3>Historie statusů</h3>
                  <p>Poskytuje kontext k tomu, kdy a proč se měnila dostupnost stážisty.</p>
                </div>
                {statusSummary.length > 0 ? (
                  <ul className="internDetail__historySummary" aria-label="Souhrn statusů">
                    {statusSummary.map(item => (
                      <li key={item.label}>
                        <span
                          className={`internDetail__badge internDetail__historyBadge ${resolveStatusModifier(item.severity)}`}
                        >
                          {item.label}
                          <span className="internDetail__historySummaryCount">{item.count}×</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {historyLoading ? (
                <p className="internDetail__status">Načítám historii statusů…</p>
              ) : historyError ? (
                <div className="internDetail__historyError" role="alert">
                  <p>{historyError}</p>
                </div>
              ) : history.length === 0 ? (
                <p className="internDetail__status">Pro stážistu zatím není evidována historie statusů.</p>
              ) : (
                <ul className="internDetail__historyList">
                  {history.map(entry => (
                    <li key={entry.id} className="internDetail__historyItem">
                      <span
                        className={`internDetail__badge internDetail__historyBadge ${resolveStatusModifier(entry.statusSeverity)}`}
                      >
                        {entry.statusLabel}
                      </span>
                      <div className="internDetail__historyMeta">
                        <span className="internDetail__historyCode">{entry.statusCode}</span>
                        <span className="internDetail__historyRange">{formatHistoryRange(entry)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section
            className="internDetail__card internDetail__chartSection internDetail__chartSection--wide"
            aria-label="Vývoj vykázaných hodin"
          >
            <div className="internDetail__sectionHeader">
              <div>
                <h3>Vývoj vykázaných hodin</h3>
                <p>Rozložení odpracovaných hodin v čase podle projektů.</p>
              </div>
              <div className="internDetail__chartControls" aria-label="Nastavení grafu">
                <div className="internDetail__chartToggle" role="group" aria-label="Typ období">
                  <button
                    type="button"
                    className={`internDetail__chartToggleButton${chartPeriod === 'week' ? ' is-active' : ''}`}
                    onClick={() => handlePeriodChange('week')}
                  >
                    Týdny
                  </button>
                  <button
                    type="button"
                    className={`internDetail__chartToggleButton${chartPeriod === 'month' ? ' is-active' : ''}`}
                    onClick={() => handlePeriodChange('month')}
                  >
                    Měsíce
                  </button>
                </div>
                <label className="internDetail__chartPeriods">
                  <span>Počet období</span>
                  <input
                    type="number"
                    min={2}
                    max={5}
                    value={chartPeriods}
                    onChange={event => handlePeriodsChange(event.target.value)}
                  />
                </label>
              </div>
            </div>
            {performanceLoading ? (
              <p className="internDetail__status">Načítám data…</p>
            ) : performanceError ? (
              <div className="internDetail__error" role="alert">
                <h4>Data pro graf se nepodařilo načíst.</h4>
                <p>{performanceError}</p>
              </div>
            ) : !performance || chartData.length === 0 ? (
              <p className="internDetail__status">Žádná data pro zobrazení.</p>
            ) : hasAnyHours ? (
              <>
                <div className="internDetail__chartWrapper">
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={chartData} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      <XAxis dataKey="bucket" interval={0} />
                      <YAxis tickFormatter={value => numberFormatter.format(value as number)} />
                      <Tooltip
                        formatter={(value, _name, payload) => {
                          const numeric = typeof value === 'number' ? value : Number(value);
                          const project = chartProjects.find(item => `project${item.key}` === payload?.dataKey);
                          const label = project?.label ?? resolveProjectName(null);
                          return [formatHours(Number.isNaN(numeric) ? 0 : numeric), label];
                        }}
                        labelFormatter={label => label as string}
                      />
                      {chartProjects.map((project, index) => (
                        <Bar
                          key={project.key}
                          dataKey={`project${project.key}`}
                          name={project.label}
                          stackId="hours"
                          fill={project.color}
                          radius={index === chartProjects.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                        >
                          {index === chartProjects.length - 1 ? (
                            <LabelList
                              dataKey="total"
                              position="top"
                              formatter={(value: number | string) => {
                                const numeric = typeof value === 'number' ? value : Number(value);
                                if (!Number.isFinite(numeric) || numeric <= 0) return '';
                                return formatHours(numeric);
                              }}
                            />
                          ) : null}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ul className="internDetail__chartLegend">
                  {chartProjects.map(project => (
                    <li key={project.key}>
                      <span className="internDetail__chartLegendSwatch" style={{ backgroundColor: project.color }} />
                      <span>{project.label}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="internDetail__status">
                Stážista nemá v posledních {chartPeriods} {periodLabel} vykázané žádné hodiny.
              </p>
            )}
          </section>

          <section
            className="internDetail__card internDetail__issuesSection"
            aria-label="Přiřazená issues podle projektů"
          >
            <div className="internDetail__sectionHeader">
              <div>
                <h3>Otevřená issues podle projektů</h3>
                <p>Seznam aktuálně přiřazených issues rozdělených podle jednotlivých projektů.</p>
              </div>
            </div>

            {detail.projects.length === 0 ? (
              <p className="internDetail__status">Stážista zatím není přiřazen k žádnému projektu.</p>
            ) : projectIssuesLoading && projectIssues.length === 0 ? (
              <p className="internDetail__status">Načítám otevřená issues…</p>
            ) : projectIssues.length === 0 ? (
              <p className="internDetail__status">Žádná data pro zobrazení.</p>
            ) : (
              <div className="internDetail__issuesList">
                {projectIssues.map(project => (
                  <article key={project.projectId} className="internDetail__issuesProject">
                    <header className="internDetail__issuesProjectHeader">
                      <h4>{project.projectName}</h4>
                      <span className="internDetail__issuesCount">
                        {project.loading
                          ? 'Načítám…'
                          : `${numberFormatter.format(project.issues.length)} otevřených issues`}
                      </span>
                    </header>

                    {project.loading ? (
                      <p className="internDetail__status">Načítám issues pro tento projekt…</p>
                    ) : project.error ? (
                      <div className="internDetail__issuesError" role="alert">
                        <p>Nepodařilo se načíst issues projektu.</p>
                        <p>{project.error}</p>
                      </div>
                    ) : project.issues.length === 0 ? (
                      <p className="internDetail__status">
                        Tento projekt aktuálně nemá žádná otevřená issues přiřazená stážistovi.
                      </p>
                    ) : (
                      <div className="internDetail__issuesTableWrapper">
                        <table className="internDetail__issuesTable">
                          <thead>
                            <tr>
                              <th scope="col">Issue</th>
                              <th scope="col">Priorita</th>
                              <th scope="col" className="internDetail__issuesColumnHours">Celkem vykázáno</th>
                              <th scope="col">Termín</th>
                              <th scope="col" className="internDetail__issuesColumnNumeric">Stáří (dny)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {project.issues.map(issue => {
                              const meta: string[] = [];
                              if (issue.issueIid != null) {
                                meta.push(`#${issue.issueIid}`);
                              }
                              if (issue.repositoryName) {
                                meta.push(issue.repositoryName);
                              }
                              const issueContent = (
                                <div className="internDetail__issuesIssueInfo">
                                  <span className="internDetail__issuesIssueTitle">{issue.issueTitle}</span>
                                  {meta.length > 0 ? (
                                    <span className="internDetail__issuesIssueMeta">{meta.join(' • ')}</span>
                                  ) : null}
                                </div>
                              );
                              const key = `${issue.repositoryId}:${issue.issueId ?? issue.issueIid ?? issue.issueTitle}`;
                              return (
                                <tr key={key}>
                                  <th scope="row">
                                    {issue.issueWebUrl ? (
                                      <a
                                        href={issue.issueWebUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="internDetail__issuesIssueLink"
                                      >
                                        {issueContent}
                                      </a>
                                    ) : (
                                      issueContent
                                    )}
                                  </th>
                                  <td className="internDetail__issuesCellBadge">
                                    <Badge kind="priority" value={getPriorityLabel(issue.labels)} />
                                  </td>
                                  <td className="internDetail__issuesColumnHours">
                                    {formatHoursFromSeconds(issue.totalTimeSpentSeconds)}
                                  </td>
                                  <td>{formatIssueDueDate(issue.dueDate)}</td>
                                  <td className="internDetail__issuesColumnNumeric">
                                    {formatIssueAge(issue.ageDays, issue.createdAt)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}

function buildProjectKey(projectId: number | null): string {
  return projectId == null ? 'none' : String(projectId);
}

function resolveProjectName(projectName: string | null | undefined): string {
  const trimmed = projectName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Nezařazený projekt';
}
