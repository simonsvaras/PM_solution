import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import Navbar, { type Module } from './components/Navbar';
import ProjectsPage from './components/ProjectsPage';
import { API_BASE, syncAllGlobal, syncIssuesAll, syncRepositories } from './api';
import type { AllResult, ErrorResponse, SyncSummary } from './api';

type ActionKind = 'REPOSITORIES' | 'ISSUES' | 'ALL';

const modules: Module[] = [
  {
    key: 'sync',
    name: 'Synchronizace',
    submodules: [
      { key: 'sync-on-demand', name: 'On-demand' },
      { key: 'sync-history', name: 'Historie' },
    ],
  },
  {
    key: 'projects',
    name: 'Projekty',
    submodules: [
      { key: 'projects-admin', name: 'Správa projektů' },
    ],
  },
  {
    key: 'reports',
    name: 'Reporty',
    submodules: [
      { key: 'reports-overview', name: 'Přehled' },
      { key: 'reports-teams', name: 'Týmy' },
    ],
  },
  {
    key: 'settings',
    name: 'Nastavení',
    submodules: [
      { key: 'settings-projects', name: 'Projekty' },
      { key: 'settings-access', name: 'Přístupy' },
    ],
  },
];

function App() {
  const [full, setFull] = useState(false);
  const [since, setSince] = useState<string>('');

  const [running, setRunning] = useState<ActionKind | null>(null);
  const [result, setResult] = useState<SyncSummary | AllResult | null>(null);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const lastAction = useRef<null | (() => Promise<void>)>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);

  const [activeModuleKey, setActiveModuleKey] = useState<string>(modules[0].key);
  const [activeSubmoduleKey, setActiveSubmoduleKey] = useState<string>(modules[0].submodules[0].key);

  useEffect(() => { /* no-op */ }, []);

  const canRun = useMemo(() => running === null, [running]);

  const activeModule = useMemo(
    () => modules.find(module => module.key === activeModuleKey),
    [activeModuleKey],
  );
  const activeSubmodule = useMemo(
    () => activeModule?.submodules.find(submodule => submodule.key === activeSubmoduleKey),
    [activeModule, activeSubmoduleKey],
  );
  const isOnDemand = activeSubmoduleKey === 'sync-on-demand';
  const isProjectsAdmin = activeSubmoduleKey === 'projects-admin';

  function handleNavigation(moduleKey: string, submoduleKey?: string) {
    setActiveModuleKey(moduleKey);
    if (submoduleKey) {
      setActiveSubmoduleKey(submoduleKey);
    } else {
      const fallback = modules.find(module => module.key === moduleKey)?.submodules[0]?.key;
      if (fallback) setActiveSubmoduleKey(fallback);
    }
  }

  function showToast(type: 'success' | 'warning' | 'error', text: string) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  }

  async function run(action: ActionKind, fn: () => Promise<void>) {
    if (!canRun) return; // idempotence during run
    setRunning(action);
    setError(null);
    setResult(null);
    setProgress(null);
    console.info('Spouštím synchronizaci', { action, full });
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
      else if (['BAD_REQUEST', 'VALIDATION'].includes(code)) showToast('error', 'Neplatný vstup. Zkontrolujte parametry.');
      else if (code === 'NOT_FOUND') showToast('error', 'Projekt nebo issue nebylo nalezeno.');
      else showToast('error', 'Synchronizaci se nepodařilo dokončit. Zkuste to prosím znovu nebo kontaktujte správce.');
      console.warn('Synchronizace selhala', { action, durationMs: dt, error: err });
    } finally {
      setRunning(null);
    }
  }

  async function doRepositories() {
    await run('REPOSITORIES', async () => {
      const res = await syncRepositories();
      setResult(res);
    });
    lastAction.current = doRepositories;
  }

  async function doIssues() {
    await run('ISSUES', async () => {
      const res = await syncIssuesAll(full, (p, t) => setProgress({ processed: p, total: t }));
      setResult(res);
    });
    lastAction.current = doIssues;
  }

  async function doAll() {
    await run('ALL', async () => {
      const res = await syncAllGlobal(full, since || undefined);
      setResult(res);
    });
    lastAction.current = doAll;
  }

  const inlineStatus = running ? (
    <div className="inline-status">
      <span className="spinner" />
      <span>
        Spouštím synchronizaci…
        {running === 'ISSUES' && progress && progress.total > 0 ? (
          <> Repozitáře: {progress.processed}/{progress.total}</>
        ) : null}
      </span>
    </div>
  ) : null;

  const resCard = result ? (
    'durationMs' in result && 'fetched' in result ? (
      <div className="card-summary">
        <b>Souhrn</b>
        <p>
          fetched: {(result as SyncSummary).fetched}, inserted: {(result as SyncSummary).inserted}, updated: {(result as SyncSummary).updated}, skipped: {(result as SyncSummary).skipped}, pages: {(result as SyncSummary).pages}, duration: {(result as SyncSummary).durationMs} ms
        </p>
      </div>
    ) : (
      <div className="card-summary">
        <b>Souhrn (ALL)</b>
        <p>
          Issues: {(result as AllResult).issues.status}
          {(result as AllResult).issues.status === 'OK' ? ` (fetched ${(result as AllResult).issues.fetched}, pages ${(result as AllResult).issues.pages}, ${(result as AllResult).issues.durationMs} ms)` : ''}
          <br />
          Celkem: {(result as AllResult).durationMs} ms
        </p>
      </div>
    )
  ) : null;

  const errCard = error ? (
    <div className="card-summary card-summary--error">
      <b className="error">Chyba</b>
      <p>
        {error.error.message}
        <br />
        <small>kód: {error.error.code}{error.error.requestId ? ` • reqId: ${error.error.requestId}` : ''}</small>
      </p>
      <div className="card-summary__actions">
        <button onClick={() => lastAction.current?.()}>Zkusit znovu</button>
      </div>
    </div>
  ) : null;

  return (
    <div className="app-shell">
      <Navbar
        modules={modules}
        activeModuleKey={activeModuleKey}
        activeSubmoduleKey={activeSubmoduleKey}
        onSelect={handleNavigation}
      />
      <main className="app-content">
        <div className="app-content__inner">
          <header className="page-header">
            <p className="page-header__eyebrow">{activeModule?.name}</p>
            <h1>{activeSubmodule?.name}</h1>
            <p className="page-header__description">
              {isOnDemand && 'Manuálně spusťte synchronizaci projektových dat mezi GitLabem a aplikací.'}
              {isProjectsAdmin && 'Vytvářejte a spravujte projekty v aplikaci.'}
              {!isOnDemand && !isProjectsAdmin && 'Tato sekce bude dostupná v dalších verzích aplikace.'}
            </p>
          </header>

          {isOnDemand ? (
            <section className="panel">
              <div className="panel__body">
                <div className="toolbar">
                  <label className="checkbox">
                    <input type="checkbox" checked={full} onChange={e => setFull(e.target.checked)} />
                    <span>Full issues sync</span>
                  </label>
                  <label>
                    <span>Since</span>
                    <input
                      type="text"
                      placeholder="YYYY-MM-DDTHH:mm:ssZ"
                      value={since}
                      onChange={e => setSince(e.target.value)}
                    />
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

                <div className="panel__footer">
                  <small>API: {API_BASE}</small>
                </div>
              </div>
            </section>
          ) : isProjectsAdmin ? (
            <ProjectsPage />
          ) : (
            <section className="panel panel--placeholder">
              <div className="panel__body">
                <p>
                  Pracujeme na tom, aby tato stránka byla brzy připravena. Do té doby prosím pokračujte v sekci On-demand.
                </p>
              </div>
            </section>
          )}
        </div>
      </main>

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
