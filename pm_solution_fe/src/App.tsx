import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import Navbar, { type Module } from './components/Navbar';
import ProjectsPage from './components/ProjectsPage';
import ProjectsOverviewPage from './components/ProjectsOverviewPage';
import ProjectReportPage from './components/ProjectReportPage';
import ProjectReportDetailPage from './components/ProjectReportDetailPage';
import ProjectReportInternDetailPage from './components/ProjectReportInternDetailPage';
import ProjectReportProjectDetailPage from './components/ProjectReportProjectDetailPage';
import ProjectReportLongTermPage from './components/ProjectReportLongTermPage';
import ProjectCapacityReportPage from './components/ProjectCapacityReportPage';
import ProjectWeeklyPlannerPage from './components/ProjectWeeklyPlannerPage';
import InternsPage from './components/InternsPage';
import InternsOverviewPage from './components/InternsOverviewPage';
import InternDetailPage from './components/InternDetailPage';
import InternPerformancePage from './components/InternPerformancePage';
import ReportsTeamsPage from './components/ReportsTeamsPage';
import SyncReportsOverviewPage from './components/SyncReportsOverviewPage';
import PlanningResourcesPage from './components/PlanningResourcesPage';
import PlanningCurrentCapacityPage from './components/PlanningCurrentCapacityPage';
import {
  API_BASE,
  deleteReports,
  getProjects,
  getProjectsOverview,
  syncIssuesAll,
  syncRepositories,
  syncReportsAll,
} from './api';
import {
  REPORTING_PERIOD_END_DAY,
  REPORTING_PERIOD_START_DAY,
  datetimeLocalToIso,
  getDefaultReportingPeriod,
} from './config/reportingPeriod';
import type { ErrorResponse, ProjectDTO, ProjectOverviewDTO, SyncSummary } from './api';

type ActionKind = 'REPOSITORIES' | 'ISSUES' | 'REPORTS';

const modules: Module[] = [
  {
    key: 'projects',
    name: 'Projekty',
    submodules: [
      { key: 'projects-overview', name: 'Přehled projektů' },
      { key: 'projects-teams', name: 'Týmy' },
      { key: 'projects-admin', name: 'Správa projektů' },
    ],
  },
  {
    key: 'sync',
    name: 'Synchronizace',
    submodules: [
      { key: 'sync-on-demand', name: 'On-demand' },
      { key: 'sync-report-overview', name: 'Přehled reportů' },
      { key: 'sync-history', name: 'Historie' },
    ],
  },
  {
    key: 'interns',
    name: 'Stážisti',
    submodules: [
      { key: 'interns-overview', name: 'Přehled stážistů' },
      { key: 'interns-performance', name: 'Výkon stážistů' },
      { key: 'interns-admin', name: 'Správa uživatelů' },
    ],
  },
  {
    key: 'planning',
    name: 'Plánování',
    submodules: [
      { key: 'planning-current', name: 'Aktuální kapacity' },
      { key: 'planning-resources', name: 'Plánování zdrojů' },
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

const HelpIcon = ({ text }: { text: string }) => (
  <span
    className="on-demand-helpIcon"
    role="img"
    aria-label={text}
    tabIndex={0}
    data-tooltip={text}
    onClick={event => {
      event.preventDefault();
      event.stopPropagation();
    }}
    onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
      }
    }}
  >
    !
  </span>
);

type ReportDetailView =
  | 'summary'
  | 'detail'
  | 'detail-long-term'
  | 'detail-intern'
  | 'detail-project'
  | 'detail-capacity'
  | 'detail-planning';

type DetailSectionView = Exclude<ReportDetailView, 'summary'>;

function isReportDetailView(value: string | null): value is ReportDetailView {
  return (
    value === 'summary' ||
    value === 'detail' ||
    value === 'detail-long-term' ||
    value === 'detail-intern' ||
    value === 'detail-project' ||
    value === 'detail-capacity' ||
    value === 'detail-planning'
  );
}

type ParsedRoute = {
  moduleKey?: string | null;
  submoduleKey?: string | null;
  projectId?: number | null;
  view?: ReportDetailView | null;
  internId?: number | null;
  tab?: string | null;
};

type NormalizedRoute = {
  moduleKey: string;
  submoduleKey: string;
  projectId: number | null;
  view: ReportDetailView | null;
  internId: number | null;
  tab: string | null;
};

function parseRoute(pathname: string, search: string): ParsedRoute {
  const params = new URLSearchParams(search);
  const moduleKey = params.get('module');
  const submoduleKey = params.get('submodule');
  const projectIdParam = params.get('projectId');
  const viewParam = params.get('view');
  const tabParam = params.get('tab');
  const parsedId = projectIdParam !== null ? Number.parseInt(projectIdParam, 10) : null;
  const projectId = Number.isNaN(parsedId) ? null : parsedId;
  const internIdParam = params.get('internId');
  const parsedInternId = internIdParam !== null ? Number.parseInt(internIdParam, 10) : null;
  const internId = Number.isNaN(parsedInternId) ? null : parsedInternId;
  const view = isReportDetailView(viewParam) ? viewParam : null;
  let normalizedModuleKey = moduleKey;
  let normalizedSubmoduleKey = submoduleKey;
  let normalizedProjectIdParam = projectIdParam;
  const trimmedPath = pathname.replace(/^\/+|\/+$/g, '');
  if (trimmedPath.length > 0) {
    const segments = trimmedPath.split('/').filter(Boolean);
    if (segments[0] === 'projects-overview') {
      normalizedModuleKey = 'projects';
      normalizedSubmoduleKey = 'projects-overview';
      if (segments.length > 1 && !normalizedProjectIdParam) {
        normalizedProjectIdParam = segments[1];
      } else if (segments.length > 1) {
        normalizedProjectIdParam = segments[1];
      }
    }
  }
  const tab = tabParam ?? null;
  const normalizedProjectId =
    normalizedProjectIdParam !== null && normalizedProjectIdParam !== undefined
      ? Number.parseInt(normalizedProjectIdParam, 10)
      : null;
  const finalProjectId =
    normalizedProjectId !== null && !Number.isNaN(normalizedProjectId) ? normalizedProjectId : projectId;
  return {
    moduleKey: normalizedModuleKey,
    submoduleKey: normalizedSubmoduleKey,
    projectId: finalProjectId,
    view,
    internId,
    tab,
  };
}

function normalizeRoute(route: ParsedRoute): NormalizedRoute {
  const requestedModuleKey = route.moduleKey === 'reports' ? 'projects' : route.moduleKey;
  const requestedSubmoduleKey =
    route.moduleKey === 'reports' && route.submoduleKey === 'reports-overview'
      ? 'projects-overview'
      : route.submoduleKey;

  const fallbackModule = modules[0];
  const moduleDef =
    requestedModuleKey && modules.some(module => module.key === requestedModuleKey)
      ? (modules.find(module => module.key === requestedModuleKey) as Module)
      : fallbackModule;
  const fallbackSubmodule = moduleDef.submodules[0];
  const submoduleDef =
    requestedSubmoduleKey && moduleDef.submodules.some(submodule => submodule.key === requestedSubmoduleKey)
      ? (moduleDef.submodules.find(submodule => submodule.key === requestedSubmoduleKey) as Module['submodules'][number])
      : fallbackSubmodule;

  const isProjectsOverview = moduleDef.key === 'projects' && submoduleDef?.key === 'projects-overview';
  const isInternsOverview = moduleDef.key === 'interns' && submoduleDef?.key === 'interns-overview';
  const projectId = isProjectsOverview && typeof route.projectId === 'number' && !Number.isNaN(route.projectId)
    ? route.projectId
    : null;
  const requestedTab = typeof route.tab === 'string' ? route.tab : null;
  let view: ReportDetailView | null = null;
  let tab: string | null = null;
  if (isProjectsOverview) {
    if (projectId === null) {
      view = null;
      tab = null;
    } else if (requestedTab === 'planning') {
      view = 'detail-planning';
      tab = 'planning';
    } else if (route.view === 'detail-planning') {
      view = 'detail-planning';
      tab = 'planning';
    } else if (route.view && route.view !== 'summary') {
      view = route.view;
      tab = null;
    } else {
      view = 'summary';
      tab = null;
    }
  }

  const internId =
    isInternsOverview && typeof route.internId === 'number' && !Number.isNaN(route.internId)
      ? route.internId
      : null;

  return {
    moduleKey: moduleDef.key,
    submoduleKey: submoduleDef?.key ?? fallbackSubmodule.key,
    projectId,
    view,
    internId,
    tab,
  };
}

function pushRoute(route: NormalizedRoute, replace = false) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const isProjectsOverviewRoute =
    route.moduleKey === 'projects' && route.submoduleKey === 'projects-overview';

  if (isProjectsOverviewRoute) {
    url.pathname = route.projectId !== null ? `/projects-overview/${route.projectId}` : '/projects-overview';
    params.delete('module');
    params.delete('submodule');
    params.delete('projectId');
  } else {
    url.pathname = '/';
    params.set('module', route.moduleKey);
    params.set('submodule', route.submoduleKey);
    if (route.projectId !== null) params.set('projectId', String(route.projectId));
    else params.delete('projectId');
  }

  if (route.internId !== null) params.set('internId', String(route.internId));
  else params.delete('internId');

  if (route.view && route.view !== 'summary') params.set('view', route.view);
  else if (!isProjectsOverviewRoute) params.delete('view');
  else if (route.view === 'summary') params.delete('view');

  if (route.tab) params.set('tab', route.tab);
  else params.delete('tab');

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
        ? parseRoute(window.location.pathname, window.location.search)
        : {
            moduleKey: modules[0].key,
            submoduleKey: modules[0].submodules[0].key,
            projectId: null,
            view: null,
            internId: null,
            tab: null,
          },
    ),
  );
  const [deltaOnly, setDeltaOnly] = useState(true);
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [since, setSince] = useState<string>('');
  const defaultReportingPeriod = useMemo(() => getDefaultReportingPeriod(), []);
  const [reportsFrom, setReportsFrom] = useState(defaultReportingPeriod.from);
  const [reportsTo, setReportsTo] = useState(defaultReportingPeriod.to);

  const [running, setRunning] = useState<ActionKind | null>(null);
  const [result, setResult] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const lastAction = useRef<null | (() => Promise<void>)>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  // Keeps track of the project whose report detail is currently displayed.
  const [selectedReportProject, setSelectedReportProject] = useState<ProjectOverviewDTO | null>(null);
  const [reportView, setReportView] = useState<ReportDetailView | null>(initialRoute.view);
  const [purgingReports, setPurgingReports] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<ProjectDTO[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [reportProjectsCache, setReportProjectsCache] = useState<Map<number, ProjectOverviewDTO>>(() => new Map());
  const [activeInternId, setActiveInternId] = useState<number | null>(initialRoute.internId);

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
          setReportView(null);
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
        setReportView(null);
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
      const nextRoute = normalizeRoute(parseRoute(window.location.pathname, window.location.search));
      setActiveModuleKey(nextRoute.moduleKey);
      setActiveSubmoduleKey(nextRoute.submoduleKey);
      setReportView(nextRoute.view);
      setPendingReportProjectId(nextRoute.projectId);
      setActiveInternId(nextRoute.internId);
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

  const selectedProjectNamespaceName = useMemo(() => {
    if (!selectedReportProject) {
      return null;
    }
    const match = availableProjects.find(project => project.id === selectedReportProject.id);
    return match?.namespaceName ?? null;
  }, [availableProjects, selectedReportProject]);

  const selectedProjectNamespaceId = useMemo(() => {
    if (!selectedReportProject) {
      return null;
    }
    const match = availableProjects.find(project => project.id === selectedReportProject.id);
    return match?.namespaceId ?? null;
  }, [availableProjects, selectedReportProject]);

  const canRun = useMemo(() => running === null, [running]);
  const isReportRangeValid = useMemo(() => {
    if (!reportsFrom || !reportsTo) {
      return false;
    }
    const fromDate = new Date(reportsFrom);
    const toDate = new Date(reportsTo);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return false;
    }
    return fromDate <= toDate;
  }, [reportsFrom, reportsTo]);
  const reportRangeMessage = isReportRangeValid
    ? `Výchozí období: ${REPORTING_PERIOD_START_DAY}. – ${REPORTING_PERIOD_END_DAY}. den v měsíci (hodnoty můžete dle potřeby upravit).`
    : 'Zkontrolujte platnost data „od“ a „do“ (datum od nesmí být později než datum do).';
  const reportRangeHintClassName = `toolbar__hint${isReportRangeValid ? '' : ' toolbar__hint--error'}`;

  const activeModule = useMemo(
    () => modules.find(module => module.key === activeModuleKey),
    [activeModuleKey],
  );
  const activeSubmodule = useMemo(
    () => activeModule?.submodules.find(submodule => submodule.key === activeSubmoduleKey),
    [activeModule, activeSubmoduleKey],
  );
  const isOnDemand = activeModuleKey === 'sync' && activeSubmoduleKey === 'sync-on-demand';
  const isSyncReportsOverview = activeModuleKey === 'sync' && activeSubmoduleKey === 'sync-report-overview';
  const isProjectsOverview = activeModuleKey === 'projects' && activeSubmoduleKey === 'projects-overview';
  const isProjectsAdmin = activeModuleKey === 'projects' && activeSubmoduleKey === 'projects-admin';
  const isProjectsTeams = activeModuleKey === 'projects' && activeSubmoduleKey === 'projects-teams';
  const isInternsOverview = activeModuleKey === 'interns' && activeSubmoduleKey === 'interns-overview';
  const isInternDetailRoute = isInternsOverview && activeInternId !== null;
  const isInternsPerformance = activeModuleKey === 'interns' && activeSubmoduleKey === 'interns-performance';
  const isInternsAdmin = activeModuleKey === 'interns' && activeSubmoduleKey === 'interns-admin';
  const isPlanningResources = activeModuleKey === 'planning' && activeSubmoduleKey === 'planning-resources';
  const isPlanningCurrent = activeModuleKey === 'planning' && activeSubmoduleKey === 'planning-current';
  const isProjectReportActive = isProjectsOverview && selectedReportProject !== null;
  const isProjectReportSummary =
    isProjectReportActive && (reportView === 'summary' || reportView === null || reportView === undefined);
  const isProjectReportDetail = isProjectReportActive && reportView !== null && reportView !== 'summary';
  const shouldUseFullWidthContent = isProjectReportDetail || isProjectsOverview;
  const appContentClassNames = ['app-content'];
  if (isProjectsOverview) {
    appContentClassNames.push('app-content--projects-overview');
  } else if (isSyncReportsOverview) {
    appContentClassNames.push('app-content--sync-report-overview');
  }
  const appContentInnerClassNames = ['app-content__inner'];
  if (shouldUseFullWidthContent) {
    appContentInnerClassNames.push('app-content__inner--full');
  }
  if (isInternDetailRoute) {
    appContentInnerClassNames.push('app-content__inner--intern-detail');
  } else if (isInternsOverview) {
    appContentInnerClassNames.push('app-content__inner--interns-overview');
  }
  if (isInternsPerformance) {
    appContentInnerClassNames.push('app-content__inner--interns-performance');
  }
  if (activeModuleKey === 'planning') {
    appContentInnerClassNames.push('app-content__inner--planning');
  }
  if (isOnDemand) {
    appContentInnerClassNames.push('app-content__inner--on-demand');
  }

  const headerEyebrow =
    isProjectReportDetail && selectedReportProject ? selectedReportProject.name : activeModule?.name ?? '';
  let headerTitle = activeSubmodule?.name ?? activeModule?.name ?? '';
  if (isProjectReportDetail) {
    if (reportView === 'detail') {
      headerTitle = 'Detailní report';
    } else if (reportView === 'detail-long-term') {
      headerTitle = 'Dlouhodobý report';
    } else if (reportView === 'detail-intern') {
      headerTitle = 'Detail stážisty';
    } else if (reportView === 'detail-project') {
      headerTitle = 'Detail milníků';
    } else if (reportView === 'detail-planning') {
      headerTitle = 'Planning';
    }
  } else if (isInternDetailRoute) {
    headerTitle = 'Detail stážisty';
  } else if (selectedReportProject) {
    headerTitle = selectedReportProject.name;
  }
  let headerDescription = '';
  if (isProjectReportDetail) {
    if (reportView === 'detail') {
      headerDescription =
        'Vyberte časové období a načtěte sumu odpracovaných hodin podle issue a stážistů pro všechny repozitáře projektu.';
    } else if (reportView === 'detail-long-term') {
      headerDescription = 'Analyzujte dlouhodobý vývoj hodin a vyčerpání rozpočtu projektu po jednotlivých měsících.';
    } else if (reportView === 'detail-intern') {
      headerDescription = 'Stránka detailu stážisty je ve vývoji.';
    } else if (reportView === 'detail-capacity') {
      headerDescription = 'Zaznamenejte aktuální stav kapacit projektu a sdílejte kontext s dodavatelským týmem.';
    } else if (reportView === 'detail-planning') {
      headerDescription = 'Naplánujte týdenní zaměření projektu a sdílejte priority s týmem.';
    }
  } else if (isInternDetailRoute) {
    headerDescription = 'Zobrazte kompletní přehled o vytížení a historii stážisty.';
  } else if (isOnDemand) {
    headerDescription = 'Manuálně spusťte synchronizaci projektových dat mezi GitLabem a aplikací.';
  } else if (isProjectsOverview && !isProjectReportActive) {
    headerDescription = 'Získejte rychlý přehled o projektech, jejich týmech a otevřených issue.';
  } else if (isProjectsAdmin) {
    headerDescription = 'Vytvářejte a spravujte projekty v aplikaci.';
  } else if (isInternsPerformance) {
    headerDescription = 'Porovnejte vykázané hodiny stážistů v čase a sledujte trendy napříč obdobími.';
  } else if (isInternsAdmin) {
    headerDescription = 'Spravujte evidenci stážistů včetně registrace, úprav a mazání.';
  } else if (isPlanningCurrent) {
    headerDescription = 'Získejte aktuální přehled o vytížení projektů a stážistů.';
  } else if (isPlanningResources) {
    headerDescription = 'Sledujte relativní vytížení stážistů napříč měsíci pomocí normalizované kapacity.';
  } else if (isSyncReportsOverview) {
    headerDescription = 'Prohlédněte si jednotlivé výkazy podle zvoleného období.';
  } else if (isProjectReportSummary) {
    headerDescription = 'Souhrn otevřených issue vybraného projektu.';
  } else if (isProjectsTeams) {
    headerDescription = 'Zobrazte složení týmů a jejich úvazky na projektech.';
  } else if (
    !isOnDemand &&
    !isProjectsOverview &&
    !isProjectsAdmin &&
    !isInternsPerformance &&
    !isInternsAdmin &&
    !isPlanningCurrent &&
    !isPlanningResources &&
    !isProjectsTeams &&
    !isInternsOverview &&
    !isSyncReportsOverview
  ) {
    headerDescription = 'Vyberte modul z navigace a zpřístupněte si funkce, které potřebujete pro správu projektů a stážistů.';
  }

  const detailNavigationItems: { view: DetailSectionView; label: string }[] = [
    { view: 'detail-capacity', label: 'Report stavů' },
    { view: 'detail', label: 'Obecný report' },
    { view: 'detail-intern', label: 'Detail stážisty' },
    { view: 'detail-project', label: 'Detail milníků' },
    { view: 'detail-long-term', label: 'Dlouhodobý report' },
    { view: 'detail-planning', label: 'Planning' },
  ];

  const detailNavigation = isProjectReportDetail ? (
    <nav className="page-header__nav" aria-label="Navigace detailního reportu">
      {detailNavigationItems.map(item => {
        const isActive = reportView === item.view;
        return (
          <button
            key={item.view}
            type="button"
            className={`page-header__navButton${isActive ? ' page-header__navButton--active' : ''}`}
            onClick={() => handleSetReportView(item.view)}
            aria-pressed={isActive}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  ) : null;

  const headerEyebrowContent = headerEyebrow ? <p className="page-header__eyebrow">{headerEyebrow}</p> : null;
  const showProjectNavigation = isProjectsOverview && selectedReportProject !== null;
  const showProjectSummaryNavigation = showProjectNavigation && reportView !== null && reportView !== 'summary';
  const headerEyebrowActions = showProjectNavigation ? (
    <div className="page-header__eyebrowActions">
      <button type="button" className="page-header__eyebrowButton" onClick={handleExitReportProject}>
        ← Zpět na projekty
      </button>
      {showProjectSummaryNavigation ? (
        <button type="button" className="page-header__eyebrowLink" onClick={handleHideReportDetail}>
          ← Zpět na souhrn
        </button>
      ) : null}
    </div>
  ) : null;
  const shouldRenderEyebrowRow = headerEyebrowContent !== null || headerEyebrowActions !== null;

  function handleNavigation(moduleKey: string, submoduleKey?: string) {
    const moduleDef = modules.find(module => module.key === moduleKey) ?? modules[0];
    const fallbackSubmoduleKey = moduleDef.submodules[0]?.key ?? modules[0].submodules[0].key;
    const nextSubmoduleKey =
      submoduleKey && moduleDef.submodules.some(submodule => submodule.key === submoduleKey)
        ? submoduleKey
        : fallbackSubmoduleKey;

    setActiveModuleKey(moduleDef.key);
    setActiveSubmoduleKey(nextSubmoduleKey);
    setActiveInternId(null);

    let nextProjectId = selectedReportProject?.id ?? pendingReportProjectId;
    let nextView: ReportDetailView | null = reportView;
    let nextInternId: number | null = null;

    if (moduleDef.key !== 'projects' || nextSubmoduleKey !== 'projects-overview') {
      nextProjectId = null;
      nextView = null;
      setSelectedReportProject(null);
      setReportView(null);
      setPendingReportProjectId(null);
    } else if (nextProjectId === null) {
      nextView = null;
    } else if (nextView === null) {
      nextView = 'summary';
    }

    pushRoute(
      normalizeRoute({
        moduleKey: moduleDef.key,
        submoduleKey: nextSubmoduleKey,
        projectId: nextProjectId,
        view: nextView,
        internId: nextInternId,
      }),
    );
  }

  function handleSelectReportProject(project: ProjectOverviewDTO) {
    setActiveModuleKey('projects');
    setActiveSubmoduleKey('projects-overview');
    setActiveInternId(null);
    setSelectedReportProject(project);
    setReportView('summary');
    setPendingReportProjectId(project.id);
    setReportProjectsCache(prev => {
      const next = new Map(prev);
      next.set(project.id, project);
      return next;
    });
    pushRoute(
      normalizeRoute({
        moduleKey: 'projects',
        submoduleKey: 'projects-overview',
        projectId: project.id,
        view: 'summary',
      }),
    );
  }

  const handleReportProjectUpdated = useCallback((next: ProjectOverviewDTO) => {
    setSelectedReportProject(prev => (prev && prev.id === next.id ? { ...prev, ...next } : prev));
    setReportProjectsCache(prev => {
      const map = new Map(prev);
      const existing = map.get(next.id);
      map.set(next.id, existing ? { ...existing, ...next } : next);
      return map;
    });
  }, []);

  function handleExitReportProject() {
    setSelectedReportProject(null);
    setReportView(null);
    setPendingReportProjectId(null);
    pushRoute(
      normalizeRoute({
        moduleKey: 'projects',
        submoduleKey: 'projects-overview',
        projectId: null,
        view: null,
      }),
    );
  }

  function handleSetReportView(next: ReportDetailView) {
    if (!selectedReportProject) return;
    if (reportView === next) return;
    setReportView(next);
    setPendingReportProjectId(selectedReportProject.id);
    pushRoute(
      normalizeRoute({
        moduleKey: 'projects',
        submoduleKey: 'projects-overview',
        projectId: selectedReportProject.id,
        view: next,
      }),
    );
  }

  function handleShowReportDetail() {
    if (!selectedReportProject) return;
    handleSetReportView('detail');
  }

  function handleHideReportDetail() {
    if (!selectedReportProject) return;
    handleSetReportView('summary');
  }

  function handleOpenInternDetailPage(internId: number) {
    setActiveModuleKey('interns');
    setActiveSubmoduleKey('interns-overview');
    setActiveInternId(internId);
    setSelectedReportProject(null);
    setReportView(null);
    setPendingReportProjectId(null);
    pushRoute(
      normalizeRoute({
        moduleKey: 'interns',
        submoduleKey: 'interns-overview',
        projectId: null,
        view: null,
        internId,
      }),
    );
  }

  function handleExitInternDetailPage() {
    setActiveModuleKey('interns');
    setActiveSubmoduleKey('interns-overview');
    setActiveInternId(null);
    pushRoute(
      normalizeRoute({
        moduleKey: 'interns',
        submoduleKey: 'interns-overview',
        projectId: null,
        view: null,
        internId: null,
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

  async function doReports() {
    if (!isReportRangeValid) {
      showToast('warning', 'Neplatné datum od/do. Upravte rozsah a zkuste to znovu.');
      return;
    }
    await run('REPORTS', async () => {
      const res = await syncReportsAll({
        from: datetimeLocalToIso(reportsFrom),
        to: datetimeLocalToIso(reportsTo),
      });
      setResult(res);
    });
    lastAction.current = doReports;
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
    <div className="card-summary">
      <b>Souhrn</b>
      <p>
        fetched: {result.fetched}, inserted: {result.inserted}, updated: {result.updated}, skipped: {result.skipped}, pages: {result.pages}, duration: {result.durationMs} ms
      </p>
    </div>
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
      <main className={appContentClassNames.join(' ')}>
        <div className={appContentInnerClassNames.join(' ')}>
          <header className={`page-header${isProjectReportDetail ? ' page-header--with-nav' : ''}`}>
            <div className="page-header__top">
              <div className="page-header__headline">
                {shouldRenderEyebrowRow ? (
                  <div className="page-header__eyebrowRow">
                    {headerEyebrowContent}
                    {headerEyebrowActions}
                  </div>
                ) : null}
                <h1>{headerTitle}</h1>
              </div>
              {detailNavigation}
            </div>
            {headerDescription ? (
              <p className="page-header__description">{headerDescription}</p>
            ) : null}
          </header>

          {isOnDemand ? (
            <>
              <section className="panel">
                <div className="panel__body panel__body--on-demand">
                  <div className="on-demand-layout__notice">
                    <p>
                      Pro synchronizace pouze jednoho projektu přejděte do detailu projektu.
                    </p>
                    <a className="button button--secondary" href="/?module=projects&submodule=projects-overview">
                      Otevřít Projects Overview
                    </a>
                  </div>
                  <div className="on-demand-layout">
                    <div className="on-demand-layout__filters">
                      <h2 className="on-demand-layout__title">Nastavení synchronizace</h2>

                      <div className="on-demand-layout__group">
                        <h3 className="on-demand-layout__subtitle">Nastavení issues</h3>
                        <div className="on-demand-layout__toggles">
                          <label className="checkbox">
                            <input type="checkbox" checked={deltaOnly} onChange={e => setDeltaOnly(e.target.checked)} />
                            <span>Synchronizovat jen issues změněné od poslední synchronizace</span>
                            <HelpIcon text="Stáhne pouze issues, které se změnily od posledního běhu. Zrychlí synchronizaci, ale ignoruje starší změny." />
                          </label>
                          <label className="checkbox">
                            <input type="checkbox" checked={assignedOnly} onChange={e => setAssignedOnly(e.target.checked)} />
                            <span>Sync issues jen pro repozitáře přiřazené k projektu</span>
                            <HelpIcon text="Omezí synchronizaci jen na repozitáře napojené na projekty. Hodí se, pokud nechcete stahovat všechna data." />
                          </label>
                        </div>
                        <div className="on-demand-layout__fields on-demand-layout__fields--issues">
                          <label className="on-demand-layout__field">
                            <span className="on-demand-layout__label">
                              <span>Since</span>
                              <HelpIcon text="Volitelné ruční datum/čas odkdy se mají issues znovu načítat. Nechte prázdné, pokud chcete použít poslední známý stav." />
                            </span>
                            <input
                              type="text"
                              placeholder="YYYY-MM-DDTHH:mm:ssZ"
                              value={since}
                              onChange={e => setSince(e.target.value)}
                            />
                          </label>
                        </div>
                      </div>

                      <div className="on-demand-layout__group">
                        <h3 className="on-demand-layout__subtitle">Nastavení reportů</h3>
                        <div className="on-demand-layout__fields">
                          <label className="on-demand-layout__field on-demand-layout__field--reports-range">
                            <span className="on-demand-layout__label">
                              <span>Reporty od</span>
                              <HelpIcon text="Spodní hranice časového intervalu pro synchronizaci reportů." />
                            </span>
                            <input
                              type="datetime-local"
                              value={reportsFrom}
                              onChange={e => setReportsFrom(e.target.value)}
                            />
                          </label>
                          <label className="on-demand-layout__field on-demand-layout__field--reports-range">
                            <span className="on-demand-layout__label">
                              <span>Reporty do</span>
                              <HelpIcon text="Horní hranice intervalu. Musí být stejná nebo novější než pole „Reporty od“." />
                            </span>
                            <input
                              type="datetime-local"
                              value={reportsTo}
                              onChange={e => setReportsTo(e.target.value)}
                            />
                          </label>
                        </div>
                        <p className={reportRangeHintClassName}>{reportRangeMessage}</p>
                      </div>
                    </div>

                    <div className="on-demand-layout__actions">
                      <h2 className="on-demand-layout__title">Spustit synchronizaci</h2>
                      <div className="actions">
                        <button onClick={doRepositories} disabled={running === 'REPOSITORIES'}>
                          Sync Repositories
                        </button>
                        <button onClick={doIssues} disabled={running === 'ISSUES'}>Sync Issues</button>
                        <button
                          onClick={doReports}
                          disabled={running === 'REPORTS' || !isReportRangeValid}
                        >
                          Synchronizovat reporty
                        </button>
                      </div>
                    </div>

                    <div className="on-demand-layout__results">
                      <h2 className="on-demand-layout__title">Stav a výsledky</h2>
                      <div className="results">
                        {inlineStatus}
                        {resCard}
                        {errCard}
                      </div>
                    </div>
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
          ) : isSyncReportsOverview ? (
            <SyncReportsOverviewPage />
          ) : isProjectReportActive && selectedReportProject ? (
            reportView && reportView !== 'summary' ? (
              reportView === 'detail' ? (
                <ProjectReportDetailPage project={selectedReportProject} />
              ) : reportView === 'detail-long-term' ? (
                <ProjectReportLongTermPage project={selectedReportProject} />
              ) : reportView === 'detail-intern' ? (
                <ProjectReportInternDetailPage project={selectedReportProject} />
              ) : reportView === 'detail-capacity' ? (
                <ProjectCapacityReportPage project={selectedReportProject} onShowToast={showToast} />
              ) : reportView === 'detail-planning' ? (
                <ProjectWeeklyPlannerPage project={selectedReportProject} onShowToast={showToast} />
              ) : (
                <ProjectReportProjectDetailPage project={selectedReportProject} />
              )
            ) : (
              <ProjectReportPage
                project={selectedReportProject}
                  namespaceId={selectedProjectNamespaceId}
                  namespaceName={selectedProjectNamespaceName}
                  onShowDetail={handleShowReportDetail}
                  onProjectUpdated={handleReportProjectUpdated}
                />
            )
          ) : isProjectsOverview ? (
            <ProjectsOverviewPage onSelectProject={handleSelectReportProject} />
          ) : isProjectsAdmin ? (
            <ProjectsPage />
          ) : isInternsOverview ? (
            activeInternId !== null ? (
              <InternDetailPage internId={activeInternId} onBack={handleExitInternDetailPage} />
            ) : (
              <InternsOverviewPage onNavigateInternDetail={intern => handleOpenInternDetailPage(intern.id)} />
            )
          ) : isInternsPerformance ? (
            <InternPerformancePage />
          ) : isInternsAdmin ? (
            <InternsPage />
          ) : isPlanningResources ? (
            <PlanningResourcesPage />
          ) : isPlanningCurrent ? (
            <PlanningCurrentCapacityPage />
          ) : isProjectsTeams ? (
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
