import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import Navbar, { type Module } from './components/Navbar';
import ProjectsPage from './components/ProjectsPage';
import ProjectsOverviewPage from './components/ProjectsOverviewPage';
import ReportsOverviewPage from './components/ReportsOverviewPage';
import ProjectReportPage from './components/ProjectReportPage';
import ProjectReportDetailPage from './components/ProjectReportDetailPage';
import InternsPage from './components/InternsPage';
import InternsOverviewPage from './components/InternsOverviewPage';
import ReportsTeamsPage from './components/ReportsTeamsPage';
import { API_BASE, deleteReports, getProjects, getProjectsOverview, syncAllGlobal, syncIssuesAll, syncRepositories } from './api';
import type { AllResult, ErrorResponse, ProjectDTO, ProjectOverviewDTO, SyncSummary } from './api';

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
      { key: 'projects-overview', name: 'Přehled projektů' },
      { key: 'projects-admin', name: 'Správa projektů' },
    ],
  },
  {
    key: 'interns',
    name: 'Stážisti',
    submodules: [
      { key: 'interns-overview', name: 'Přehled stážistů' },
      { key: 'interns-admin', name: 'Správa uživatelů' },
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

type ReportDetailView = 'summary' | 'detail';

type ParsedRoute = {
  moduleKey?: string | null;
  submoduleKey?: string | null;
  projectId?: number | null;
  view?: ReportDetailView | null;
};

type NormalizedRoute = {
  moduleKey: string;
  submoduleKey: string;
  projectId: number | null;
  view: ReportDetailView | null;
};

function parseRoute(search: string): ParsedRoute {
  const params = new URLSearchParams(search);
  const moduleKey = params.get('module');
  const submoduleKey = params.get('submodule');
  const projectIdParam = params.get('projectId');
  const viewParam = params.get('view');
  const parsedId = projectIdParam !== null ? Number.parseInt(projectIdParam, 10) : null;
  const projectId = Number.isNaN(parsedId) ? null : parsedId;
  const view = viewParam === 'detail' || viewParam === 'summary' ? (viewParam as ReportDetailView) : null;
  return { moduleKey, submoduleKey, projectId, view };
}

function normalizeRoute(route: ParsedRoute): NormalizedRoute {
  const fallbackModule = modules[0];
  const moduleDef =
    route.moduleKey && modules.some(module => module.key === route.moduleKey)
      ? (modules.find(module => module.key === route.moduleKey) as Module)
      : fallbackModule;
  const fallbackSubmodule = moduleDef.submodules[0];
  const submoduleDef =
    route.submoduleKey && moduleDef.submodules.some(submodule => submodule.key === route.submoduleKey)
      ? (moduleDef.submodules.find(submodule => submodule.key === route.submoduleKey) as Module['submodules'][number])
      : fallbackSubmodule;

  const isReportsOverview = moduleDef.key === 'reports' && submoduleDef?.key === 'reports-overview';
  const projectId = isReportsOverview && typeof route.projectId === 'number' && !Number.isNaN(route.projectId)
    ? route.projectId
    : null;
  const view: ReportDetailView | null = isReportsOverview
    ? route.view === 'detail'
      ? 'detail'
      : projectId !== null
      ? 'summary'
      : null
    : null;

  return {
    moduleKey: moduleDef.key,
    submoduleKey: submoduleDef?.key ?? fallbackSubmodule.key,
    projectId,
    view,
  };
}

function pushRoute(route: NormalizedRoute, replace = false) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const params = url.searchParams;
  params.set('module', route.moduleKey);
  params.set('submodule', route.submoduleKey);
  if (route.projectId !== null) params.set('projectId', String(route.projectId));
  else params.delete('projectId');
  if (route.view) params.set('view', route.view);
  else params.delete('view');
  url.search = params.toString();
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const state = { ...route };
  if (nextUrl === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(state, '', nextUrl);
    return;
  }
  if (replace) window.history.replaceState(state, '', nextUrl);
  else window.history.pushState(state, '', nextUrl);
}

function App() {
  const [initialRoute] = useState<NormalizedRoute>(() =>
    normalizeRoute(
      typeof window !== 'undefined'
        ? parseRoute(window.location.search)
        : { moduleKey: modules[0].key, submoduleKey: modules[0].submodules[0].key, projectId: null, view: null },
    ),
  );
  const [deltaOnly, setDeltaOnly] = useState(true);
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [since, setSince] = useState<string>('');

  const [running, setRunning] = useState<ActionKind | null>(null);
  const [result, setResult] = useState<SyncSummary | AllResult | null>(null);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const lastAction = useRef<null | (() => Promise<void>)>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  // Keeps track of the project whose report detail is currently displayed.
  const [selectedReportProject, setSelectedReportProject] = useState<ProjectOverviewDTO | null>(null);
  const [showReportDetail, setShowReportDetail] = useState(initialRoute.view === 'detail');
  const [purgingReports, setPurgingReports] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<ProjectDTO[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [reportProjectsCache, setReportProjectsCache] = useState<Map<number, ProjectOverviewDTO>>(() => new Map());

  const [activeModuleKey, setActiveModuleKey] = useState<string>(initialRoute.moduleKey);
  const [activeSubmoduleKey, setActiveSubmoduleKey] = useState<string>(initialRoute.submoduleKey);
  const [pendingReportProjectId, setPendingReportProjectId] = useState<number | null>(initialRoute.projectId);

  useEffect(() => {
    pushRoute(initialRoute, true);
  }, [initialRoute]);

  useEffect(() => {
    let cancelled = false;
    setLoadingProjects(true);
    getProjects()
      .then(projects => {
        if (cancelled) return;
        setAvailableProjects(projects);
        setProjectLoadError(null);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Nepodařilo se načíst projekty', err);
        if (err && typeof err === 'object' && 'error' in err) {
          const apiError = err as ErrorResponse;
          setProjectLoadError(apiError.error.message || 'Nepodařilo se načíst projekty.');
        } else {
          setProjectLoadError('Nepodařilo se načíst projekty.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingProjects(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (pendingReportProjectId === null) {
      return;
    }

    if (selectedReportProject && selectedReportProject.id === pendingReportProjectId) {
      setPendingReportProjectId(null);
      return;
    }

    const cached = reportProjectsCache.get(pendingReportProjectId);
    if (cached) {
      if (!selectedReportProject || selectedReportProject.id !== cached.id) {
        setSelectedReportProject(cached);
      }
      setPendingReportProjectId(null);
      return;
    }

    let ignore = false;
    async function resolveProject() {
      try {
        const overview = await getProjectsOverview();
        if (ignore) return;
        const found = overview.find(project => project.id === pendingReportProjectId);
        if (found) {
          setReportProjectsCache(prev => {
            const next = new Map(prev);
            next.set(found.id, found);
            return next;
          });
          setSelectedReportProject(found);
        } else {
          setSelectedReportProject(null);
          setShowReportDetail(false);
          pushRoute(
            normalizeRoute({
              moduleKey: activeModuleKey,
              submoduleKey: activeSubmoduleKey,
              projectId: null,
              view: null,
            }),
            true,
          );
        }
      } catch (err) {
        console.error('Nepodařilo se načíst přehled projektu pro report', err);
        setSelectedReportProject(null);
        setShowReportDetail(false);
      } finally {
        if (!ignore) {
          setPendingReportProjectId(null);
        }
      }
    }

    void resolveProject();

    return () => {
      ignore = true;
    };
  }, [
    pendingReportProjectId,
    selectedReportProject,
    reportProjectsCache,
    activeModuleKey,
    activeSubmoduleKey,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    function handlePopstate() {
      const nextRoute = normalizeRoute(parseRoute(window.location.search));
      setActiveModuleKey(nextRoute.moduleKey);
      setActiveSubmoduleKey(nextRoute.submoduleKey);
      setShowReportDetail(nextRoute.view === 'detail');
      setPendingReportProjectId(nextRoute.projectId);
      if (nextRoute.projectId === null) {
        setSelectedReportProject(null);
        return;
      }
      const cached = reportProjectsCache.get(nextRoute.projectId);
      setSelectedReportProject(cached ?? null);
    }
    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, [reportProjectsCache]);

  const selectedProjects = useMemo(
    () => availableProjects.filter(project => selectedProjectIds.includes(project.id)),
    [availableProjects, selectedProjectIds],
  );

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
  const isProjectsOverview = activeSubmoduleKey === 'projects-overview';
  const isProjectsAdmin = activeSubmoduleKey === 'projects-admin';
  const isInternsOverview = activeSubmoduleKey === 'interns-overview';
  const isInternsAdmin = activeSubmoduleKey === 'interns-admin';
  const isReportsOverview = activeSubmoduleKey === 'reports-overview';
  const isReportsTeams = activeSubmoduleKey === 'reports-teams';
  const isReportsProject = activeModuleKey === 'reports' && selectedReportProject !== null;
  const isReportsProjectSummary = isReportsProject && !showReportDetail;
  const isReportsProjectDetail = isReportsProject && showReportDetail;

  const headerEyebrow =
    isReportsProjectDetail && selectedReportProject ? selectedReportProject.name : activeModule?.name ?? '';
  let headerTitle = activeSubmodule?.name ?? activeModule?.name ?? '';
  if (isReportsProjectDetail) {
    headerTitle = 'Detailní report';
  } else if (selectedReportProject) {
    headerTitle = selectedReportProject.name;
  }
  let headerDescription = '';
  if (isReportsProjectDetail) {
    headerDescription =
      'Vyberte časové období a načtěte sumu odpracovaných hodin podle issue a stážistů pro všechny repozitáře projektu.';
  } else if (isOnDemand) {
    headerDescription = 'Manuálně spusťte synchronizaci projektových dat mezi GitLabem a aplikací.';
  } else if (isProjectsOverview) {
    headerDescription = 'Získejte rychlý přehled o projektech, jejich týmech a otevřených issue.';
  } else if (isProjectsAdmin) {
    headerDescription = 'Vytvářejte a spravujte projekty v aplikaci.';
  } else if (isInternsAdmin) {
    headerDescription = 'Spravujte evidenci stážistů včetně registrace, úprav a mazání.';
  } else if (isReportsOverview && !isReportsProject) {
    headerDescription = 'Vyberte projekt a zobrazte jeho detailní report.';
  } else if (isReportsProjectSummary) {
    headerDescription = 'Souhrn otevřených issue vybraného projektu.';
  } else if (isReportsTeams) {
    headerDescription = 'Zobrazte složení týmů a jejich úvazky na projektech.';
  } else if (
    !isOnDemand &&
    !isProjectsOverview &&
    !isProjectsAdmin &&
    !isInternsAdmin &&
    !isReportsOverview &&
    !isReportsTeams
  ) {
    headerDescription = 'Tato sekce bude dostupná v dalších verzích aplikace.';
  }

  function handleNavigation(moduleKey: string, submoduleKey?: string) {
    const moduleDef = modules.find(module => module.key === moduleKey) ?? modules[0];
    const fallbackSubmoduleKey = moduleDef.submodules[0]?.key ?? modules[0].submodules[0].key;
    const nextSubmoduleKey =
      submoduleKey && moduleDef.submodules.some(submodule => submodule.key === submoduleKey)
        ? submoduleKey
        : fallbackSubmoduleKey;

    setActiveModuleKey(moduleDef.key);
    setActiveSubmoduleKey(nextSubmoduleKey);

    let nextProjectId = selectedReportProject?.id ?? pendingReportProjectId;
    let nextView: ReportDetailView | null = showReportDetail
      ? 'detail'
      : nextProjectId !== null
      ? 'summary'
      : null;

    if (moduleDef.key !== 'reports' || nextSubmoduleKey !== 'reports-overview') {
      nextProjectId = null;
      nextView = null;
      setSelectedReportProject(null);
      setShowReportDetail(false);
      setPendingReportProjectId(null);
    }

    pushRoute(
      normalizeRoute({
        moduleKey: moduleDef.key,
        submoduleKey: nextSubmoduleKey,
        projectId: nextProjectId,
        view: nextView,
      }),
    );
  }

  function handleSelectReportProject(project: ProjectOverviewDTO) {
    setActiveModuleKey('reports');
    setActiveSubmoduleKey('reports-overview');
    setSelectedReportProject(project);
    setShowReportDetail(false);
    setPendingReportProjectId(project.id);
    setReportProjectsCache(prev => {
      const next = new Map(prev);
      next.set(project.id, project);
      return next;
    });
    pushRoute(
      normalizeRoute({
        moduleKey: 'reports',
        submoduleKey: 'reports-overview',
        projectId: project.id,
        view: 'summary',
      }),
    );
  }

  function handleExitReportProject() {
    setSelectedReportProject(null);
    setShowReportDetail(false);
    setPendingReportProjectId(null);
    pushRoute(
      normalizeRoute({
        moduleKey: 'reports',
        submoduleKey: 'reports-overview',
        projectId: null,
        view: null,
      }),
    );
  }

  function handleShowReportDetail() {
    if (!selectedReportProject) return;
    setShowReportDetail(true);
    setPendingReportProjectId(selectedReportProject.id);
    pushRoute(
      normalizeRoute({
        moduleKey: 'reports',
        submoduleKey: 'reports-overview',
        projectId: selectedReportProject.id,
        view: 'detail',
      }),
    );
  }

  function handleHideReportDetail() {
    if (!selectedReportProject) return;
    setShowReportDetail(false);
    setPendingReportProjectId(selectedReportProject.id);
    pushRoute(
      normalizeRoute({
        moduleKey: 'reports',
        submoduleKey: 'reports-overview',
        projectId: selectedReportProject.id,
        view: 'summary',
      }),
    );
  }

  function handleToggleMaintenanceProject(projectId: number) {
    setSelectedProjectIds(prev =>
      prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId],
    );
  }

  function resetMaintenanceSelection() {
    setSelectedProjectIds([]);
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
    console.info('Spouštím synchronizaci', { action, deltaOnly, assignedOnly, full: !deltaOnly });
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
      const res = await syncIssuesAll(!deltaOnly, assignedOnly, (p, t) => setProgress({ processed: p, total: t }));
      setResult(res);
    });
    lastAction.current = doIssues;
  }

  async function doAll() {
    await run('ALL', async () => {
      const res = await syncAllGlobal(!deltaOnly, assignedOnly, since || undefined);
      setResult(res);
    });
    lastAction.current = doAll;
  }

  async function handleDeleteAllReports() {
    if (purgingReports) return;
    const hasProjectSelection = selectedProjects.length > 0;
    const previewNamesList = selectedProjects.slice(0, 3).map(project => `„${project.name}“`);
    const previewNames = previewNamesList.join(', ');
    const extraCount = selectedProjects.length > 3 ? selectedProjects.length - 3 : 0;
    const projectSummary = hasProjectSelection
      ? selectedProjects.length === 1
        ? `projekt ${previewNames}`
        : `${selectedProjects.length} vybrané projekty (${previewNames}${extraCount > 0 ? ', …' : ''})`
      : '';
    const confirmed = window.confirm(
      hasProjectSelection
        ? `Opravdu chcete smazat reporty pro ${projectSummary}? Operaci nelze vrátit.`
        : 'Opravdu chcete smazat všechny reporty? Operaci nelze vrátit.',
    );
    if (!confirmed) return;
    setPurgingReports(true);
    try {
      const response = await deleteReports(hasProjectSelection ? selectedProjects.map(project => project.id) : undefined);
      showToast(
        'success',
        hasProjectSelection
          ? `Smazáno ${response.deleted} reportů pro vybrané projekty.`
          : `Smazáno ${response.deleted} reportů.`,
      );
      if (hasProjectSelection) {
        resetMaintenanceSelection();
      }
    } catch (err) {
      console.error('Nepodařilo se smazat reporty', err);
      if (err && typeof err === 'object' && 'error' in err) {
        const apiError = err as ErrorResponse;
        showToast('error', apiError.error.message || 'Mazání reportů selhalo.');
      } else {
        showToast('error', 'Mazání reportů selhalo.');
      }
    } finally {
      setPurgingReports(false);
    }
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

  const hasProjectSelection = selectedProjects.length > 0;
  const maintenanceSelectionHint = hasProjectSelection
    ? `Vybráno ${selectedProjects.length} projekt${selectedProjects.length === 1 ? '' : 'ů'}. Reporty se smažou pouze pro jejich přiřazené repozitáře.`
    : 'Bez výběru se smažou reporty všech projektů. Výběrem omezíte mazání jen na konkrétní projekty.';

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
        <div className={`app-content__inner${isReportsProjectDetail ? ' app-content__inner--full' : ''}`}>
          <header className="page-header">
            <p className="page-header__eyebrow">{headerEyebrow}</p>
            <h1>{headerTitle}</h1>
            <p className="page-header__description">{headerDescription}</p>
          </header>

          {isOnDemand ? (
            <>
              <section className="panel">
                <div className="panel__body">
                  <div className="toolbar">
                    <label className="checkbox">
                      <input type="checkbox" checked={deltaOnly} onChange={e => setDeltaOnly(e.target.checked)} />
                      <span>Synchronizovat jen issues změněné od poslední synchronizace</span>
                    </label>
                    <label className="checkbox">
                      <input type="checkbox" checked={assignedOnly} onChange={e => setAssignedOnly(e.target.checked)} />
                      <span>Sync issues jen pro repozitáře přiřazené k projektu</span>
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
                    <button onClick={doRepositories} disabled={running === 'REPOSITORIES' || running === 'ALL'}>
                      Sync Repositories
                    </button>
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

              <section className="panel panel--danger">
                <div className="panel__body">
                  <div className="danger-panel">
                    <div>
                      <h2>Údržba reportů</h2>
                      <p>
                        Trvale odstraní všechny záznamy z tabulky report. Použijte pouze pokud chcete databázi vyčistit před
                        novým importem dat.
                      </p>
                    </div>
                    <div className="danger-panel__options">
                      <p className="danger-panel__helper">
                        Vyberte projekty, pro které chcete reporty smazat. Pokud nic nevyberete, odstraní se reporty pro všechny
                        projekty.
                      </p>
                      {loadingProjects ? (
                        <p className="danger-panel__status">Načítám projekty…</p>
                      ) : projectLoadError ? (
                        <p className="danger-panel__error" role="alert">{projectLoadError}</p>
                      ) : availableProjects.length === 0 ? (
                        <p className="danger-panel__status">Zatím nejsou vytvořené žádné projekty.</p>
                      ) : (
                        <div className="danger-panel__projects" role="group" aria-label="Projekty pro mazání reportů">
                          {availableProjects.map(project => (
                            <label key={project.id} className="danger-panel__checkbox">
                              <input
                                type="checkbox"
                                checked={selectedProjectIds.includes(project.id)}
                                onChange={() => handleToggleMaintenanceProject(project.id)}
                              />
                              <span>{project.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      <p className="danger-panel__hint">{maintenanceSelectionHint}</p>
                    </div>
                    <div className="danger-panel__actions">
                      <button className="button--danger" onClick={handleDeleteAllReports} disabled={purgingReports}>
                        {purgingReports
                          ? 'Mažu…'
                          : hasProjectSelection
                          ? 'Smazat reporty pro vybrané projekty'
                          : 'Smazat všechny reporty'}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : isReportsProject && selectedReportProject ? (
            showReportDetail ? (
              <ProjectReportDetailPage
                project={selectedReportProject}
                onBack={handleExitReportProject}
                onCloseDetail={handleHideReportDetail}
              />
            ) : (
              <ProjectReportPage
                project={selectedReportProject}
                onBack={handleExitReportProject}
                onShowDetail={handleShowReportDetail}
              />
            )
          ) : isReportsProjectDetail && selectedReportProject ? (
            <ProjectReportPage
              project={selectedReportProject}
              onBack={handleExitReportProject}
              onShowDetail={handleShowReportDetail}
            />
          ) : isProjectsOverview ? (
            <ProjectsOverviewPage />
          ) : isProjectsAdmin ? (
            <ProjectsPage />
          ) : isInternsOverview ? (
            <InternsOverviewPage />
          ) : isInternsAdmin ? (
            <InternsPage />
          ) : isReportsOverview ? (
            <ReportsOverviewPage onSelectProject={handleSelectReportProject} />
          ) : isReportsTeams ? (
            <ReportsTeamsPage />
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
