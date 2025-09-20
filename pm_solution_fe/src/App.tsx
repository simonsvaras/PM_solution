import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { API_BASE, getProjects, syncAll, syncIssues, syncNotes, syncProjects } from './api';
import type { AllResult, ErrorResponse, ProjectDTO, SyncSummary } from './api';

type ActionKind = 'PROJECTS' | 'ISSUES' | 'NOTES' | 'ALL';

function App() {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [selected, setSelected] = useState<number | undefined>();
  const [full, setFull] = useState(false);
  const [since, setSince] = useState<string>('');

  const [running, setRunning] = useState<ActionKind | null>(null);
  const [result, setResult] = useState<SyncSummary | AllResult | null>(null);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const lastAction = useRef<null | (() => Promise<void>)>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await getProjects();
        setProjects(list);
        if (list.length > 0) setSelected(list[0].gitlabProjectId);
      } catch (e) {
        console.info('Failed to load projects', e);
      }
    })();
  }, []);

  const canRun = useMemo(() => running === null, [running]);

  function showToast(type: 'success' | 'warning' | 'error', text: string) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  }

  async function run(action: ActionKind, fn: () => Promise<void>) {
    if (!canRun) return; // idempotence during run
    setRunning(action);
    setError(null);
    setResult(null);
    console.info('Spouštím synchronizaci…', { action, selected, full, since });
    const t0 = performance.now();
    try {
      await fn();
      const dt = Math.round(performance.now() - t0);
      showToast('success', 'Synchronizace dokončena.');
      console.info('Synchronizace dokončena.', { action, durationMs: dt });
    } catch (e) {
      const err = e as ErrorResponse;
      setError(err);
      const dt = Math.round(performance.now() - t0);
      const code = err?.error?.code || 'UNKNOWN';
      if (code === 'RATE_LIMITED') showToast('warning', 'GitLab nás dočasně omezil. Počkejte minutu a zkuste to znovu.');
      else if (['GITLAB_UNAVAILABLE', 'TIMEOUT'].includes(code)) showToast('error', 'GitLab je teď nedostupný. Zkuste to prosím znovu.');
      else if (['BAD_REQUEST', 'VALIDATION'].includes(code)) showToast('error', 'Neplatný vstup. Zkontrolujte vybraný projekt a parametry.');
      else if (code === 'NOT_FOUND') showToast('error', 'Projekt nebo issue nebylo nalezeno.');
      else showToast('error', 'Synchronizaci se nepodařilo dokončit. Zkuste to prosím znovu nebo kontaktujte správce.');
      console.warn('Synchronizace selhala', { action, durationMs: dt, error: err });
    } finally {
      setRunning(null);
    }
  }

  async function doProjects() {
    await run('PROJECTS', async () => {
      const res = await syncProjects();
      setResult(res);
      // refresh projects list after sync
      try { setProjects(await getProjects()); } catch {}
    });
    lastAction.current = doProjects;
  }

  async function doIssues() {
    if (!selected) { showToast('error', 'Vyberte projekt.'); return; }
    await run('ISSUES', async () => {
      const res = await syncIssues(selected, full);
      setResult(res);
    });
    lastAction.current = doIssues;
  }

  async function doNotes() {
    if (!selected) { showToast('error', 'Vyberte projekt.'); return; }
    await run('NOTES', async () => {
      const res = await syncNotes(selected, since || undefined);
      setResult(res);
    });
    lastAction.current = doNotes;
  }

  async function doAll() {
    if (!selected) { showToast('error', 'Vyberte projekt.'); return; }
    await run('ALL', async () => {
      const res = await syncAll(selected, full, since || undefined);
      setResult(res);
    });
    lastAction.current = doAll;
  }

  const inlineStatus = running ? (
    <div>
      <span className="spinner" />{' '}
      {running === 'ALL' ? (
        <span>
          Spouštím synchronizaci… {' '}
          {`Krok ${result ? 2 : 1}/2: ${result ? 'Notes…' : 'Issues…'}`}
        </span>
      ) : (
        <span>Spouštím synchronizaci…</span>
      )}
    </div>
  ) : null;

  const resCard = result ? (
    'durationMs' in result && 'fetched' in result ? (
      <div className="card-summary">
        <b>Souhrn</b><br />
        fetched: {(result as SyncSummary).fetched}, inserted: {(result as SyncSummary).inserted}, updated: {(result as SyncSummary).updated}, skipped: {(result as SyncSummary).skipped}, pages: {(result as SyncSummary).pages}, duration: {(result as SyncSummary).durationMs} ms
      </div>
    ) : (
      <div className="card-summary">
        <b>Souhrn (ALL)</b><br />
        Issues: {((result as AllResult).issues.status)}{(result as AllResult).issues.status === 'OK' ? ` (fetched ${(result as AllResult).issues.fetched}, pages ${(result as AllResult).issues.pages}, ${ (result as AllResult).issues.durationMs } ms)` : ''}<br />
        Notes: {((result as AllResult).notes.status)}{(result as AllResult).notes.status === 'OK' ? ` (fetched ${(result as AllResult).notes.fetched}, pages ${(result as AllResult).notes.pages}, ${ (result as AllResult).notes.durationMs } ms)` : ''}<br />
        Celkem: {(result as AllResult).durationMs} ms
      </div>
    )
  ) : null;

  const errCard = error ? (
    <div className="card-summary">
      <b className="error">Chyba</b><br />
      {error.error.message}<br />
      <small>kód: {error.error.code}{error.error.requestId ? ` • reqId: ${error.error.requestId}` : ''}</small>
      <div style={{ marginTop: 8 }}>
        <button onClick={() => lastAction.current?.()}>Zkusit znovu</button>
      </div>
    </div>
  ) : null;

  return (
    <div>
      <h2>On‑Demand Synchronizace</h2>
      <div className="toolbar">
        <label>
          Projekt:&nbsp;
          <select value={selected ?? ''} onChange={e => setSelected(Number(e.target.value))}>
            {projects.map(p => (
              <option key={p.gitlabProjectId} value={p.gitlabProjectId}>
                {p.name} ({p.gitlabProjectId})
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={full} onChange={e => setFull(e.target.checked)} /> Full issues sync
        </label>
        <label>
          Since:&nbsp;
          <input placeholder="YYYY-MM-DDTHH:mm:ssZ" value={since} onChange={e => setSince(e.target.value)} style={{ width: 240 }} />
        </label>
      </div>

      <div className="actions">
        <button onClick={doProjects} disabled={running === 'PROJECTS' || running === 'ALL'}>Sync Projects</button>
        <button onClick={doIssues} disabled={running === 'ISSUES' || running === 'ALL'}>Sync Issues</button>
        <button onClick={doNotes} disabled={running === 'NOTES' || running === 'ALL'}>Sync Notes</button>
        <button onClick={doAll} disabled={running !== null}>Sync ALL</button>
      </div>

      <div className="results">
        {inlineStatus}
        {resCard}
        {errCard}
      </div>

      {toast && (
        <div className="toast" role="status">
          <span className={toast.type}>{toast.text}</span>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <small>API: {API_BASE}</small>
      </div>
    </div>
  );
}

export default App;
