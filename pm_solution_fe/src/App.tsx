import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { API_BASE, getProjects, syncAll, syncIssues, syncRepositories } from './api';
import type { AllResult, ErrorResponse, ProjectDTO, SyncSummary } from './api';

type ActionKind = 'REPOSITORIES' | 'ISSUES' | 'ALL';

function App() {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [selected, setSelected] = useState<number | undefined>();
  const [full, setFull] = useState(false);

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
    console.info('Spoustim synchronizaci', { action, selected, full });
    const t0 = performance.now();
    try {
      await fn();
      const dt = Math.round(performance.now() - t0);
      showToast('success', 'Synchronizace dokoncena.');
      console.info('Synchronizace dokoncena.', { action, durationMs: dt });
    } catch (e) {
      const err = e as ErrorResponse;
      setError(err);
      const dt = Math.round(performance.now() - t0);
      const code = err?.error?.code || 'UNKNOWN';
      if (code === 'RATE_LIMITED') showToast('warning', 'GitLab nas docasne omezil. Pockejte minutu a zkuste to znovu.');
      else if (['GITLAB_UNAVAILABLE', 'TIMEOUT'].includes(code)) showToast('error', 'GitLab je ted nedostupny. Zkuste to prosim znovu.');
      else if (['BAD_REQUEST', 'VALIDATION'].includes(code)) showToast('error', 'Neplatny vstup. Zkontrolujte vybrany projekt a parametry.');
      else if (code === 'NOT_FOUND') showToast('error', 'Projekt nebo issue nebylo nalezeno.');
      else showToast('error', 'Synchronizaci se nepodarilo dokoncit. Zkuste to prosim znovu nebo kontaktujte spravce.');
      console.warn('Synchronizace selhala', { action, durationMs: dt, error: err });
    } finally {
      setRunning(null);
    }
  }

  async function doRepositories() {
    await run('REPOSITORIES', async () => {
      const res = await syncRepositories();
      setResult(res);
      try { setProjects(await getProjects()); } catch {}
    });
    lastAction.current = doRepositories;
  }
  async function doIssues() {
    if (!selected) { showToast('error', 'Vyberte projekt.'); return; }
    await run('ISSUES', async () => {
      const res = await syncIssues(selected, full);
      setResult(res);
    });
    lastAction.current = doIssues;
  }

  async function doAll() {
    if (!selected) { showToast('error', 'Vyberte projekt.'); return; }
    await run('ALL', async () => {
      const res = await syncAll(selected, full);
      setResult(res);
    });
    lastAction.current = doAll;
  }

  const inlineStatus = running ? (
    <div>
      <span className="spinner" />{' '}<span>Spoustim synchronizaci</span>
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
        Celkem: {(result as AllResult).durationMs} ms
      </div>
    )
  ) : null;

  const errCard = error ? (
    <div className="card-summary">
      <b className="error">Chyba</b><br />
      {error.error.message}<br />
      <small>kod: {error.error.code}{error.error.requestId ? ` â€˘ reqId: ${error.error.requestId}` : ''}</small>
      <div style={{ marginTop: 8 }}>
        <button onClick={() => lastAction.current?.()}>Zkusit znovu</button>
      </div>
    </div>
  ) : null;

  return (
    <div>
      <h2>On-Demand Synchronizace</h2>
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
      </div>

      <div className="actions">
        <button onClick={doRepositories} disabled={running === 'REPOSITORIES' || running === 'ALL'}>Sync Repositories</button>
        <button onClick={doIssues} disabled={running === 'ISSUES' || running === 'ALL'}>Sync Issues</button>
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
