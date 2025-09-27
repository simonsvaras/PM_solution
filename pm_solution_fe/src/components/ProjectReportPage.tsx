import { useState, type ChangeEvent } from 'react';
import './ProjectReportPage.css';
import type { ProjectOverviewDTO, SyncSummary } from '../api';
import { syncProjectReports, type ErrorResponse } from '../api';

type ProjectReportPageProps = {
  project: ProjectOverviewDTO;
  onBack: () => void;
  onShowDetail: () => void;
};

/**
 * Page displaying project level metrics together with the controls for triggering
 * report synchronisation.
 */
export default function ProjectReportPage({ project, onBack, onShowDetail }: ProjectReportPageProps) {
  const [sinceLast, setSinceLast] = useState(true);
  const [fromValue, setFromValue] = useState('');
  const [toValue, setToValue] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);

  function toIsoOrUndefined(value: string): string | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  }

  // Validates the current form state and triggers the backend synchronisation endpoint.
  async function handleSync() {
    setSyncError(null);
    setSyncSummary(null);
    if (!sinceLast && !fromValue) {
      setSyncError('Vyplňte datum "Od" nebo synchronizujte od poslední synchronizace.');
      return;
    }
    if (!sinceLast && fromValue && toValue) {
      const fromDate = new Date(fromValue);
      const toDate = new Date(toValue);
      if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime()) && toDate < fromDate) {
        setSyncError('Datum "Do" nesmí být dříve než datum "Od".');
        return;
      }
    }

    setSyncing(true);
    try {
      const payload = {
        sinceLast,
        from: sinceLast ? undefined : toIsoOrUndefined(fromValue),
        to: sinceLast ? undefined : toIsoOrUndefined(toValue),
      };
      const result = await syncProjectReports(project.id, payload);
      setSyncSummary(result);
    } catch (err) {
      const error = err as ErrorResponse;
      const message = error?.error?.message || 'Synchronizaci se nepodařilo dokončit.';
      setSyncError(message);
    } finally {
      setSyncing(false);
    }
  }

  // When toggling the "since last" switch we clear the manual range to avoid inconsistent UI state.
  function handleToggleSinceLast(event: ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked;
    setSinceLast(checked);
    if (checked) {
      setFromValue('');
      setToValue('');
    }
  }

  return (
    <section className="projectReport" aria-label={`Report projektu ${project.name}`}>
      <div className="projectReport__toolbar">
        <button type="button" className="projectReport__backButton" onClick={onBack}>
          ← Zpět na projekty
        </button>
        <button type="button" className="projectReport__detailButton" onClick={onShowDetail}>
          Zobrazit detailní report
        </button>
      </div>
      <div className="projectReport__card">
        <h2>Otevřené issue</h2>
        <p className="projectReport__metric">{project.openIssues}</p>
      </div>
      <div className="projectReport__card projectReport__syncCard">
        <div className="projectReport__syncHeader">
          <h2>Synchronizace výkazů</h2>
          <p className="projectReport__syncDescription">
            Spusť synchronizaci, která načte timelogy ze všech repozitářů přiřazených k projektu a uloží je do databáze.
          </p>
          <p className="projectReport__note">Výkazy se synchronizují jen pro uživatele, kteří jsou v systému vytvořeni.</p>
        </div>
        <label className="projectReport__checkbox">
          <input type="checkbox" checked={sinceLast} onChange={handleToggleSinceLast} />
          Synchronizovat data jen od poslední synchronizace
        </label>
        <div className="projectReport__range" aria-disabled={sinceLast}>
          <label>
            <span>Od</span>
            <input
              type="datetime-local"
              value={fromValue}
              onChange={event => setFromValue(event.target.value)}
              disabled={sinceLast}
            />
          </label>
          <label>
            <span>Do</span>
            <input
              type="datetime-local"
              value={toValue}
              onChange={event => setToValue(event.target.value)}
              disabled={sinceLast}
            />
          </label>
        </div>
        {syncError ? <p className="projectReport__status projectReport__status--error">{syncError}</p> : null}
        {syncSummary ? (
          <p className="projectReport__status projectReport__status--success">
            Načteno {syncSummary.fetched} záznamů, vloženo {syncSummary.inserted}, přeskočeno {syncSummary.skipped}. Trvalo{' '}
            {syncSummary.durationMs} ms.
          </p>
        ) : null}
        {syncSummary && syncSummary.missingUsernames.length > 0 ? (
          <div className="projectReport__missing">
            <p className="projectReport__missingTitle">
              Výkazy se nepodařilo uložit pro tyto uživatele (nenalezeni v systému):
            </p>
            <ul className="projectReport__missingList">
              {syncSummary.missingUsernames.map(username => (
                <li key={username}>{username}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <button
          type="button"
          className="projectReport__syncButton"
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? 'Synchronizuji…' : 'Synchronizovat výkazy'}
        </button>
      </div>
    </section>
  );
}
