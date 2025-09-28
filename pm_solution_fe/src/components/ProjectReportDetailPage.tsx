import { useMemo, useState } from 'react';
import './ProjectReportDetailPage.css';
import type {
  ErrorResponse,
  ProjectOverviewDTO,
  ProjectReportDetailResponse,
} from '../api';
import { getProjectReportDetail } from '../api';

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

export default function ProjectReportDetailPage({ project, onBack, onCloseDetail }: ProjectReportDetailPageProps) {
  const [fromValue, setFromValue] = useState('');
  const [toValue, setToValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [report, setReport] = useState<ProjectReportDetailResponse | null>(null);

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

  async function handleLoad() {
    setValidationError(null);
    setError(null);

    if (fromValue && toValue) {
      const fromDate = new Date(fromValue);
      const toDate = new Date(toValue);
      if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime()) && toDate < fromDate) {
        setValidationError('Datum "Do" nesmí být dříve než datum "Od".');
        return;
      }
    }

    setLoading(true);
    try {
      const params = {
        from: toIsoOrUndefined(fromValue),
        to: toIsoOrUndefined(toValue),
      };
      const data = await getProjectReportDetail(project.id, params);
      setReport(data);
    } catch (err) {
      setError(err as ErrorResponse);
    } finally {
      setLoading(false);
    }
  }

  const interns = report?.interns ?? [];
  const issues = report?.issues ?? [];

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
      <div className="projectReportDetail__toolbar">
        <button type="button" className="projectReport__backButton" onClick={onBack}>
          ← Zpět na projekty
        </button>
        <button type="button" className="projectReportDetail__link" onClick={onCloseDetail}>
          ← Zpět na souhrn
        </button>
      </div>

      <div className="projectReportDetail__panel">
        <div className="projectReportDetail__header">
          <h2>Detailní report</h2>
          <p>
            Vyberte časové období a načtěte sumu odpracovaných hodin podle issue a stážistů pro všechny repozitáře projektu.
          </p>
        </div>

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

        {validationError ? (
          <p className="projectReportDetail__status projectReportDetail__status--error">{validationError}</p>
        ) : null}

        {error ? (
          <p className="projectReportDetail__status projectReportDetail__status--error" role="alert">
            {error.error.message}
          </p>
        ) : null}

        {!loading && report && issues.length === 0 ? (
          <p className="projectReportDetail__status">V zadaném období nejsou žádné výkazy.</p>
        ) : null}

        {loading ? <p className="projectReportDetail__status">Načítám data…</p> : null}

        {issues.length > 0 ? (
          <div className="projectReportDetail__tableWrapper">
            <table className="projectReportDetail__table">
              <thead>
                <tr>
                  <th scope="col">Issue</th>
                  {interns.map(intern => (
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
                      {interns.map(intern => {
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
                    {interns.map(intern => (
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
        ) : null}
      </div>
    </section>
  );
}

