import { type FormEvent, useEffect, useMemo, useState } from 'react';
import './ProjectCapacityReportPage.css';
import type {
  ErrorResponse,
  ProjectCapacityReport,
  ProjectOverviewDTO,
  ReportProjectCapacityPayload,
} from '../api';
import { getProjectCapacity, reportProjectCapacity } from '../api';
import { PROJECT_CAPACITY_STATUS_OPTIONS } from '../config/capacityStatuses';

const NOTE_LIMIT = 1000;

type ToastKind = 'success' | 'error' | 'warning';

type ProjectCapacityReportPageProps = {
  project: ProjectOverviewDTO;
  onShowToast?: (type: ToastKind, text: string) => void;
};

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

export default function ProjectCapacityReportPage({ project, onShowToast }: ProjectCapacityReportPageProps) {
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentReport, setCurrentReport] = useState<ProjectCapacityReport | null>(null);
  const [statusCode, setStatusCode] = useState(PROJECT_CAPACITY_STATUS_OPTIONS[0]?.code ?? 'SATURATED');
  const [note, setNote] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    setLoadError(null);
    setCurrentReport(null);

    getProjectCapacity(project.id)
      .then(report => {
        if (cancelled) return;
        setCurrentReport(report);
        setStatusCode(report.statusCode);
        setLoadState('loaded');
      })
      .catch(error => {
        if (cancelled) return;
        const apiError = error as ErrorResponse;
        if (apiError?.error?.httpStatus === 404) {
          setLoadState('loaded');
          return;
        }
        const message = apiError?.error?.message ?? 'Kapacitní report se nepodařilo načíst.';
        setLoadError(message);
        setLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    setStatusCode(PROJECT_CAPACITY_STATUS_OPTIONS[0]?.code ?? 'SATURATED');
    setNote('');
  }, [project.id]);

  const lastReporterName = useMemo(() => {
    if (!currentReport) return null;
    return currentReport.reportedBy.fullName || currentReport.reportedBy.username;
  }, [currentReport]);

  const lastReportedAt = useMemo(() => {
    if (!currentReport) return null;
    try {
      const formatter = new Intl.DateTimeFormat('cs-CZ', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      return formatter.format(new Date(currentReport.reportedAt));
    } catch {
      return currentReport.reportedAt;
    }
  }, [currentReport]);

  const noteLength = note.length;
  const remainingCharacters = NOTE_LIMIT - noteLength;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    if (!statusCode) {
      setSubmitError('Vyberte stav projektu.');
      return;
    }
    if (note.length > NOTE_LIMIT) {
      setSubmitError(`Poznámka nesmí být delší než ${NOTE_LIMIT} znaků.`);
      return;
    }

    const payload: ReportProjectCapacityPayload = {
      statusCode,
      note: note.trim() ? note.trim() : null,
    };

    setSubmitting(true);
    try {
      const created = await reportProjectCapacity(project.id, payload);
      setCurrentReport(created);
      setStatusCode(created.statusCode);
      setNote('');
      onShowToast?.('success', 'Kapacitní report byl uložen.');
    } catch (error) {
      const apiError = error as ErrorResponse;
      const message = apiError?.error?.message ?? 'Report se nepodařilo uložit.';
      setSubmitError(message);
      onShowToast?.('error', message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="capacityReport" aria-label={`Report kapacit pro projekt ${project.name}`}>
      <div className="capacityReport__intro">
        <h2>Report kapacit</h2>
        <p>
          Vyberte aktuální stav kapacit projektu a odešlete ho. Reporty se ukládají do historie včetně uživatele,
          který změnu provedl.
        </p>
        {loadState === 'loading' ? (
          <p className="capacityReport__loader">Načítám poslední report…</p>
        ) : loadError ? (
          <p className="capacityReport__error" role="alert">
            {loadError}
          </p>
        ) : currentReport ? (
          <p className="capacityReport__statusSummary">
            Poslední stav: {currentReport.statusLabel}{' '}
            <span>
              {lastReportedAt ? `• ${lastReportedAt}` : null}
              {lastReporterName ? ` • ${lastReporterName}` : null}
            </span>
          </p>
        ) : (
          <p className="capacityReport__statusSummary">Zatím nebyl zaznamenán žádný kapacitní report.</p>
        )}
      </div>

      <form className="capacityReport__formCard" onSubmit={handleSubmit} noValidate>
        <div className="capacityReport__field">
          <label htmlFor="capacity-status">Aktuální stav</label>
          <select
            id="capacity-status"
            value={statusCode}
            onChange={event => setStatusCode(event.target.value)}
            disabled={submitting}
          >
            {PROJECT_CAPACITY_STATUS_OPTIONS.map(option => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="capacityReport__hint">Vyberte jednu z předdefinovaných možností kapacitního reportu.</p>
        </div>

        <div className="capacityReport__field">
          <label htmlFor="capacity-note">Poznámka (volitelná)</label>
          <textarea
            id="capacity-note"
            maxLength={NOTE_LIMIT}
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder="Doplňte kontext ke kapacitám, například plánovaný nábor nebo překážky."
            disabled={submitting}
          />
          <div className="capacityReport__actions">
            <span className="capacityReport__hint">Můžete dopsat doplňující informace pro delivery tým.</span>
            <span className="capacityReport__noteCounter">{remainingCharacters} znaků zbývá</span>
          </div>
        </div>

        {submitError ? (
          <p className="capacityReport__error" role="alert">
            {submitError}
          </p>
        ) : null}

        <div className="capacityReport__actions">
          <button type="submit" className="capacityReport__submit" disabled={submitting}>
            {submitting ? 'Odesílám…' : 'Odeslat report'}
          </button>
          <a
            className="capacityReport__historyLink"
            href={`?module=projects&submodule=projects-overview&projectId=${project.id}&view=detail-project`}
          >
            Zobrazit historii kapacit
          </a>
        </div>
      </form>
    </section>
  );
}
