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

function formatHours(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      return { perIntern: new Map<number, number>(), overall: 0 };
    }
    const perIntern = new Map<number, number>();
    let overall = 0;
    for (const issue of report.issues) {
      for (const cell of issue.internHours) {
        const current = perIntern.get(cell.internId) ?? 0;
        const value = cell.hours ?? 0;
        perIntern.set(cell.internId, current + value);
        overall += value;
      }
    }
    return { perIntern, overall };
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
                    </th>
                  ))}
                  <th scope="col" className="projectReportDetail__totalHeader">
                    Celkem
                  </th>
                </tr>
              </thead>
              <tbody>
                {issues.map(issue => {
                  const key = `${issue.repositoryId}-${issue.issueId ?? 'none'}-${issue.issueIid ?? 'none'}`;
                  const hoursByIntern = new Map<number, number>();
                  for (const cell of issue.internHours) {
                    hoursByIntern.set(cell.internId, cell.hours);
                  }
                  const rowTotal = interns.reduce((acc, intern) => acc + (hoursByIntern.get(intern.id) ?? 0), 0);
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
                      {interns.map(intern => (
                        <td key={intern.id}>{formatHours(hoursByIntern.get(intern.id))}</td>
                      ))}
                      <td className="projectReportDetail__totalCell">{formatHours(rowTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {interns.length > 0 ? (
                <tfoot>
                  <tr>
                    <th scope="row">Celkem</th>
                    {interns.map(intern => (
                      <td key={intern.id}>{formatHours(totals.perIntern.get(intern.id))}</td>
                    ))}
                    <td className="projectReportDetail__totalCell">{formatHours(totals.overall)}</td>
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

