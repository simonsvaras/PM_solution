import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import './SyncReportsOverviewPage.css';
import { getSyncReportOverview, type ErrorResponse, type SyncReportOverviewRowDTO } from '../api';
import { datetimeLocalToIso, getDefaultReportingPeriod } from '../config/reportingPeriod';

type ReportRow = {
  issueTitle: string | null;
  repositoryName: string;
  username: string | null;
  spentAt: string;
  timeSpentHours: number | null;
  cost: number | null;
};

type SummaryRow = {
  username: string;
  totalHours: number | null;
  totalCost: number | null;
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function mapDto(row: SyncReportOverviewRowDTO): ReportRow {
  return {
    issueTitle: row.issueTitle,
    repositoryName: row.repositoryName,
    username: row.username,
    spentAt: row.spentAt,
    timeSpentHours: toNumber(row.timeSpentHours),
    cost: toNumber(row.cost),
  };
}

function formatHours(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCost(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
  });
}

function formatDateTime(value: string): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('cs-CZ');
}

const defaultPeriod = getDefaultReportingPeriod();

export default function SyncReportsOverviewPage() {
  const [from, setFrom] = useState<string>(defaultPeriod.from);
  const [to, setTo] = useState<string>(defaultPeriod.to);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [untrackedOnly, setUntrackedOnly] = useState(false);
  const [showClosures, setShowClosures] = useState(false);

  const isRangeValid = useMemo(() => {
    if (!from || !to) {
      return true;
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return false;
    }
    return fromDate <= toDate;
  }, [from, to]);

  const hintClassName = `syncReportOverview__hint${isRangeValid ? '' : ' syncReportOverview__hint--error'}`;
  const hintText = isRangeValid
    ? 'Výchozí období se nastaví podle vykazovacího období. Hodnoty můžete upravit podle potřeby.'
    : 'Zkontrolujte datum „od“ a „do“. Hodnota od nesmí být později než hodnota do a obě musí být platná.';

  const loadReports = useCallback(async () => {
    if (!isRangeValid) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getSyncReportOverview({
        from: datetimeLocalToIso(from),
        to: datetimeLocalToIso(to),
        untrackedOnly,
      });
      setRows(data.map(mapDto));
    } catch (err) {
      setRows([]);
      setError(err as ErrorResponse);
    } finally {
      setLoading(false);
    }
  }, [from, to, isRangeValid, untrackedOnly]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void loadReports();
    },
    [loadReports],
  );

  const summaryRows = useMemo<SummaryRow[]>(() => {
    if (rows.length === 0) {
      return [];
    }

    const totals = new Map<string, { hours: number; cost: number }>();
    for (const row of rows) {
      const key = row.username ?? '—';
      const existing = totals.get(key) ?? { hours: 0, cost: 0 };
      const hours = Number.isFinite(row.timeSpentHours ?? NaN) ? row.timeSpentHours ?? 0 : 0;
      const cost = Number.isFinite(row.cost ?? NaN) ? row.cost ?? 0 : 0;
      existing.hours += hours;
      existing.cost += cost;
      totals.set(key, existing);
    }

    return Array.from(totals.entries())
      .map(([username, values]) => ({
        username,
        totalHours: values.hours,
        totalCost: values.cost,
      }))
      .sort((a, b) => a.username.localeCompare(b.username, 'cs', { sensitivity: 'base' }));
  }, [rows]);

  return (
    <section className="panel">
      <div className="panel__body syncReportOverview">
        <form className="syncReportOverview__controls" onSubmit={handleSubmit}>
          <label className="syncReportOverview__field">
            <span>Od</span>
            <input type="datetime-local" value={from} onChange={event => setFrom(event.target.value)} />
          </label>
          <label className="syncReportOverview__field">
            <span>Do</span>
            <input type="datetime-local" value={to} onChange={event => setTo(event.target.value)} />
          </label>
          <div className="syncReportOverview__actions">
            <button type="submit" disabled={!isRangeValid || loading}>
              {loading ? 'Načítám…' : 'Získat'}
            </button>
            <label className="syncReportOverview__checkbox">
              <input
                type="checkbox"
                checked={untrackedOnly}
                onChange={event => setUntrackedOnly(event.target.checked)}
              />
              <span>Pouze netrackovaná repa</span>
            </label>
          </div>
          <p className={hintClassName}>{hintText}</p>
        </form>

        {error ? (
          <p className="syncReportOverview__error" role="alert">
            {error.error.message}
          </p>
        ) : null}

        <div className="syncReportOverview__summaryToggle">
          <button type="button" onClick={() => setShowClosures(prev => !prev)}>
            {showClosures ? 'Skrýt uzávěrky' : 'Zobrazit uzávěrky'}
          </button>
        </div>

        {showClosures ? (
          <div className="syncReportOverview__tableWrapper">
            <table className="syncReportOverview__table">
              <thead>
                <tr>
                  <th scope="col">Username</th>
                  <th scope="col">Celkové hodiny</th>
                  <th scope="col">Celkové náklady</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="syncReportOverview__empty">
                      Načítám uzávěrky…
                    </td>
                  </tr>
                ) : summaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="syncReportOverview__empty">
                      Žádná data pro uzávěrku.
                    </td>
                  </tr>
                ) : (
                  summaryRows.map(row => (
                    <tr key={row.username}>
                      <td>{row.username}</td>
                      <td className="syncReportOverview__cell--numeric">{formatHours(row.totalHours)}</td>
                      <td className="syncReportOverview__cell--numeric">{formatCost(row.totalCost)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="syncReportOverview__tableWrapper">
          <table className="syncReportOverview__table">
            <thead>
              <tr>
                <th scope="col">Název issue</th>
                <th scope="col">Repozitář</th>
                <th scope="col">Uživatel</th>
                <th scope="col">Zapsáno</th>
                <th scope="col">Čas (h)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="syncReportOverview__empty">
                    Načítám výkazy…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="syncReportOverview__empty">
                    Žádné výkazy pro zadané období.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={`${row.repositoryName}-${row.spentAt}-${index}`}>
                    <td>{row.issueTitle ?? '—'}</td>
                    <td>{row.repositoryName}</td>
                    <td>{row.username ?? '—'}</td>
                    <td>{formatDateTime(row.spentAt)}</td>
                    <td className="syncReportOverview__cell--numeric">{formatHours(row.timeSpentHours)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
