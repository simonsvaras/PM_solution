import { useEffect, useMemo, useState } from 'react';
import './InternDetailPage.css';
import {
  getInternOverviewDetail,
  getInternStatusHistory,
  type ErrorResponse,
  type InternDetail,
  type InternStatusHistoryEntry,
} from '../api';

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

type InternDetailPageProps = {
  internId: number;
  onBack: () => void;
};

export default function InternDetailPage({ internId, onBack }: InternDetailPageProps) {
  const [detail, setDetail] = useState<InternDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<InternStatusHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

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

  const groups = detail?.groups.map(group => group.label).join(', ') || 'Bez skupiny';

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
        </>
      ) : null}
    </section>
  );
}
