import { useEffect, useMemo, useState } from 'react';
import './ProjectReportDetailPage.css';
import InfoCard from './InfoCard';
import type {
  ErrorResponse,
  ProjectOverviewDTO,
  ProjectReportDetailIntern,
  ProjectReportDetailResponse,
} from '../api';
import { getProjectInterns, getProjectReportDetail } from '../api';

type ProjectReportDetailPageProps = {
  project: ProjectOverviewDTO;
  onBack: () => void;
  onCloseDetail: () => void;
};

function toIsoOrUndefined(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function formatHours(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCost(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' });
}

function sortInterns(list: ProjectReportDetailIntern[]): ProjectReportDetailIntern[] {
  return [...list].sort((a, b) => {
    const lastName = a.lastName.localeCompare(b.lastName, 'cs');
    if (lastName !== 0) return lastName;
    const firstName = a.firstName.localeCompare(b.firstName, 'cs');
    if (firstName !== 0) return firstName;
    return a.username.localeCompare(b.username, 'cs');
  });
}

function mergeInternLists(
  first: ProjectReportDetailIntern[],
  second: ProjectReportDetailIntern[],
): ProjectReportDetailIntern[] {
  const map = new Map<number, ProjectReportDetailIntern>();
  for (const intern of [...first, ...second]) {
    map.set(intern.id, intern);
  }
  return sortInterns(Array.from(map.values()));
}

type StoredReportState = {
  fromValue: string;
  toValue: string;
  selectedInternUsername: string | null;
  report: ProjectReportDetailResponse | null;
};

export default function ProjectReportDetailPage({ project, onBack, onCloseDetail }: ProjectReportDetailPageProps) {
  const [fromValue, setFromValue] = useState('');
  const [toValue, setToValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [report, setReport] = useState<ProjectReportDetailResponse | null>(null);
  const [availableInterns, setAvailableInterns] = useState<ProjectReportDetailIntern[]>([]);
  const [internsError, setInternsError] = useState<string | null>(null);
  const [selectedInternUsername, setSelectedInternUsername] = useState<string | null>(null);
  const storageKey = useMemo(() => `project-report-detail:${project.id}`, [project.id]);

  useEffect(() => {
    setFromValue('');
    setToValue('');
    setSelectedInternUsername(null);
    setReport(null);
    setAvailableInterns([]);
    setValidationError(null);
    setError(null);
    setInternsError(null);
    setLoading(false);

    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return;
      }
      const stored = JSON.parse(raw) as StoredReportState;
      if (typeof stored.fromValue === 'string') setFromValue(stored.fromValue);
      if (typeof stored.toValue === 'string') setToValue(stored.toValue);
      setSelectedInternUsername(stored.selectedInternUsername ?? null);
      if (stored.report) {
        const storedReport = stored.report;
        setReport(storedReport);
        if (Array.isArray(storedReport.interns)) {
          setAvailableInterns(prev => mergeInternLists(prev, storedReport.interns));
        }
      }
    } catch (err) {
      console.warn('Nepodařilo se obnovit uložený stav detailu reportu', err);
    }
  }, [storageKey]);

  useEffect(() => {
    let ignore = false;
    setInternsError(null);
    getProjectInterns(project.id)
      .then(interns => {
        if (ignore) return;
        const assigned = interns.filter(intern => intern.assigned);
        const mapped = assigned.map(intern => ({
          id: intern.id,
          username: intern.username,
          firstName: intern.firstName,
          lastName: intern.lastName,
        }));
        setAvailableInterns(prev => mergeInternLists(prev, mapped));
      })
      .catch(() => {
        if (!ignore) {
          setInternsError('Nepodařilo se načíst seznam stážistů.');
        }
      });
    return () => {
      ignore = true;
    };
  }, [project.id]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored: StoredReportState = {
      fromValue,
      toValue,
      selectedInternUsername,
      report,
    };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch (err) {
      console.warn('Nepodařilo se uložit stav detailu reportu', err);
    }
  }, [storageKey, fromValue, toValue, selectedInternUsername, report]);

  const totals = useMemo(() => {
    if (!report) {
      return {
        perInternHours: new Map<number, number>(),
        perInternCost: new Map<number, number>(),
        overallHours: 0,
        overallCost: 0,
      };
    }
    const perInternHours = new Map<number, number>();
    const perInternCost = new Map<number, number>();
    let overallHours = 0;
    let overallCost = 0;
    for (const issue of report.issues) {
      for (const cell of issue.internHours) {
        const hoursValue = cell.hours ?? 0;
        const costValue = cell.cost ?? 0;
        perInternHours.set(cell.internId, (perInternHours.get(cell.internId) ?? 0) + hoursValue);
        perInternCost.set(cell.internId, (perInternCost.get(cell.internId) ?? 0) + costValue);
        overallHours += hoursValue;
        overallCost += costValue;
      }
    }
    return { perInternHours, perInternCost, overallHours, overallCost };
  }, [report]);

  function validateRange(): boolean {
    if (fromValue && toValue) {
      const fromDate = new Date(fromValue);
      const toDate = new Date(toValue);
      if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime()) && toDate < fromDate) {
        setValidationError('Datum "Do" nesmí být dříve než datum "Od".');
        return false;
      }
    }
    setValidationError(null);
    return true;
  }

  async function loadReport(nextInternUsername: string | null) {
    if (!validateRange()) {
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const params = {
        from: toIsoOrUndefined(fromValue),
        to: toIsoOrUndefined(toValue),
        internUsername: nextInternUsername ?? undefined,
      };
      const data = await getProjectReportDetail(project.id, params);
      setReport(data);
      setAvailableInterns(prev => mergeInternLists(prev, data.interns));
      if (nextInternUsername && !data.interns.some(intern => intern.username === nextInternUsername)) {
        setSelectedInternUsername(null);
      }
    } catch (err) {
      setError(err as ErrorResponse);
    } finally {
      setLoading(false);
    }
  }

  function handleLoad() {
    void loadReport(selectedInternUsername);
  }

  function handleInternFilterChange(username: string | null) {
    const next = username === selectedInternUsername ? null : username;
    if (next === selectedInternUsername) {
      return;
    }
    setSelectedInternUsername(next);
    if (report) {
      void loadReport(next);
    }
  }

  const interns = report?.interns ?? [];
  const issues = report?.issues ?? [];
  const visibleInterns = selectedInternUsername
    ? interns.filter(intern => intern.username === selectedInternUsername)
    : interns;

  const overallHoursDisplay = report
    ? (() => {
        const formatted = formatHours(totals.overallHours);
        return formatted === '—' ? formatted : `${formatted} h`;
      })()
    : '—';

  const overallCostDisplay = report ? formatCost(totals.overallCost) : '—';

  function renderCell(hours?: number | null, cost?: number | null) {
    const formattedHours = formatHours(hours);
    const formattedCost = formatCost(cost);
    const displayHours = formattedHours === '—' ? formattedHours : `${formattedHours} h`;
    return (
      <div className="projectReportDetail__cell">
        <span className="projectReportDetail__cellValue projectReportDetail__cellValue--hours">{displayHours}</span>
        <span className="projectReportDetail__cellValue projectReportDetail__cellValue--cost">{formattedCost}</span>
      </div>
    );
  }

  return (
    <section className="projectReportDetail" aria-label={`Detailní report projektu ${project.name}`}>
      <header className="projectReportDetail__header" role="banner">
        <div className="projectReportDetail__nav">
          <button type="button" className="projectReport__backButton" onClick={onBack}>
            ← Zpět na projekty
          </button>
          <button type="button" className="projectReportDetail__link" onClick={onCloseDetail}>
            ← Zpět na souhrn
          </button>
        </div>
        <div className="projectReportDetail__controls">
          <div className="projectReportDetail__filters">
            <label>
              <span>Od</span>
              <input type="datetime-local" value={fromValue} onChange={event => setFromValue(event.target.value)} />
            </label>
            <label>
              <span>Do</span>
              <input type="datetime-local" value={toValue} onChange={event => setToValue(event.target.value)} />
            </label>
            <button type="button" onClick={handleLoad} disabled={loading}>
              {loading ? 'Načítám…' : 'Načíst'}
            </button>
          </div>

          {availableInterns.length > 0 ? (
            <div className="projectReportDetail__internFilters" role="group" aria-label="Filtr stážistů">
              <button
                type="button"
                className={`projectReportDetail__internButton${selectedInternUsername === null ? ' projectReportDetail__internButton--active' : ''}`}
                onClick={() => handleInternFilterChange(null)}
                disabled={loading}
                aria-pressed={selectedInternUsername === null}
              >
                Všichni
              </button>
              {availableInterns.map(intern => {
                const isActive = selectedInternUsername === intern.username;
                return (
                  <button
                    type="button"
                    key={intern.id}
                    className={`projectReportDetail__internButton${isActive ? ' projectReportDetail__internButton--active' : ''}`}
                    onClick={() => handleInternFilterChange(intern.username)}
                    disabled={loading}
                    aria-pressed={isActive}
                  >
                    @{intern.username}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="projectReportDetail__summary" aria-label="Souhrn období">
          <InfoCard title="Celkové vykázané hodiny" value={overallHoursDisplay} />
          <InfoCard title="Celkové náklady" value={overallCostDisplay} />
        </div>
      </header>

      <div className="projectReportDetail__body">
        {internsError ? (
          <p className="projectReportDetail__status projectReportDetail__status--error" role="alert">{internsError}</p>
        ) : null}

        {validationError ? (
          <p className="projectReportDetail__status projectReportDetail__status--error">{validationError}</p>
        ) : null}

        {error ? (
          <p className="projectReportDetail__status projectReportDetail__status--error" role="alert">
            {error.error.message}
          </p>
        ) : null}

        <div className="projectReportDetail__tableSection">
          {loading ? (
            <p className="projectReportDetail__tablePlaceholder">Načítám data…</p>
          ) : !report ? (
            <p className="projectReportDetail__tablePlaceholder">Zadejte filtr a klikněte na „Načíst“.</p>
          ) : issues.length === 0 ? (
            <p className="projectReportDetail__tablePlaceholder">V zadaném období nejsou žádné výkazy.</p>
          ) : (
            <div className="projectReportDetail__tableWrapper">
              <table className="projectReportDetail__table">
                <thead>
                  <tr>
                    <th scope="col">Issue</th>
                    {visibleInterns.map(intern => (
                      <th scope="col" key={intern.id}>
                        <span className="projectReportDetail__internName">{intern.firstName} {intern.lastName}</span>
                        <span className="projectReportDetail__internUsername">@{intern.username}</span>
                        <span className="projectReportDetail__headerNote">Hodiny / Náklady</span>
                      </th>
                    ))}
                    <th scope="col" className="projectReportDetail__totalHeader">
                      <span>Celkem</span>
                      <span className="projectReportDetail__headerNote">Hodiny / Náklady</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map(issue => {
                    const key = `${issue.repositoryId}-${issue.issueId ?? 'none'}-${issue.issueIid ?? 'none'}`;
                    const valuesByIntern = new Map<number, { hours: number; cost: number }>();
                    for (const cell of issue.internHours) {
                      valuesByIntern.set(cell.internId, {
                        hours: cell.hours ?? 0,
                        cost: cell.cost ?? 0,
                      });
                    }
                    let rowTotalHours = 0;
                    let rowTotalCost = 0;
                    for (const value of valuesByIntern.values()) {
                      rowTotalHours += value.hours;
                      rowTotalCost += value.cost;
                    }
                    const issueLabel = issue.issueIid ? `#${issue.issueIid}` : 'Bez čísla';
                    return (
                      <tr key={key}>
                        <th scope="row">
                          <div className="projectReportDetail__issue">
                            <span className="projectReportDetail__issueTitle">{issue.issueTitle}</span>
                            <span className="projectReportDetail__issueMeta">
                              {issue.repositoryName}
                              {issue.issueIid ? ` • ${issueLabel}` : ''}
                            </span>
                          </div>
                        </th>
                        {visibleInterns.map(intern => {
                          const value = valuesByIntern.get(intern.id);
                          return <td key={intern.id}>{renderCell(value?.hours, value?.cost)}</td>;
                        })}
                        <td className="projectReportDetail__totalCell">{renderCell(rowTotalHours, rowTotalCost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {interns.length > 0 ? (
                  <tfoot>
                    <tr>
                      <th scope="row">Celkem</th>
                      {visibleInterns.map(intern => (
                        <td key={intern.id}>
                          {renderCell(totals.perInternHours.get(intern.id), totals.perInternCost.get(intern.id))}
                        </td>
                      ))}
                      <td className="projectReportDetail__totalCell">
                        {renderCell(totals.overallHours, totals.overallCost)}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

