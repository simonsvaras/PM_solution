// Default to same-origin (nginx proxies /api -> backend in docker)
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export type SyncSummary = {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  pages: number;
  durationMs: number;
  missingUsernames: string[];
};

export type ProjectReportSyncPayload = {
  sinceLast: boolean;
  from?: string;
  to?: string;
};

export type GlobalReportSyncPayload = {
  sinceLast?: boolean;
  from?: string;
  to?: string;
};

export type ErrorBody = {
  code: string;
  message: string;
  details?: string;
  httpStatus: number;
  requestId?: string;
};

export type ErrorResponse = { error: ErrorBody };

export type StepAggregate = {
  status: "OK" | "ERROR" | "SKIPPED";
  fetched?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  pages?: number;
  durationMs?: number;
  error?: ErrorBody;
};

export type AllResult = {
  issues: StepAggregate;
  durationMs: number;
};

export type DeleteReportsResult = {
  deleted: number;
};

export type SyncReportOverviewRowDTO = {
  issueTitle: string | null;
  repositoryName: string;
  username: string | null;
  spentAt: string;
  timeSpentHours: number | string;
  cost: number | string | null;
  projectIsExternal: boolean | null;
};

export type ProjectDTO = {
  id: number;
  namespaceId: number | null;
  namespaceName: string | null;
  name: string;
  budget: number | null;
  budgetFrom: string | null;
  budgetTo: string | null;
  reportedCost: number;
  isExternal: boolean;
  hourlyRateCzk: number | null;
};
export type ProjectOverviewDTO = {
  id: number;
  name: string;
  budget: number | null;
  budgetFrom: string | null;
  budgetTo: string | null;
  reportedCost: number;
  teamMembers: number;
  openIssues: number;
  isExternal: boolean;
  hourlyRateCzk: number | null;
};

export type ProjectCapacityStatus = {
  code: string;
  label: string;
  severity: number;
};

export type ProjectCapacityReport = {
  id: number;
  projectId: number;
  reportedAt: string;
  note: string | null;
  statuses: ProjectCapacityStatus[];
};

export type ReportProjectCapacityPayload = {
  statusCodes: string[];
  note?: string | null;
};

export type PlanningCapacityStatusItem = {
  id: number;
  name: string;
  level?: string | null;
  groups?: string[];
};

export type PlanningCapacityStatusSummary = {
  code: string;
  label: string;
  severity: number;
  count: number;
  projects: PlanningCapacityStatusItem[];
  interns: PlanningCapacityStatusItem[];
};

export type PlanningCapacitySummarySection = {
  total: number;
  statuses: PlanningCapacityStatusSummary[];
};

export type PlanningCurrentCapacityResponse = {
  projects: PlanningCapacitySummarySection;
  interns: PlanningCapacitySummarySection;
};

export type ProjectLongTermReportMeta = {
  budget: number | null;
  budgetFrom: string | null;
  budgetTo: string | null;
  hourlyRate: number | null;
};

export type ProjectLongTermReportMonth = {
  monthStart: string;
  hours: number;
  cost: number;
  cumulativeHours: number;
  cumulativeCost: number;
  burnRatio: number | null;
};

export type ProjectLongTermReportResponse = {
  meta: ProjectLongTermReportMeta | null;
  totalHours: number;
  totalCost: number;
  months: ProjectLongTermReportMonth[];
};

export type ProjectLongTermReportParams = {
  from: string;
  to: string;
};
export type ProjectMilestoneSummary = {
  milestoneId: number;
  milestoneIid: number;
  title: string;
  state: string;
  description: string | null;
  dueDate: string | null;
  totalTimeSpentSeconds: number;
  totalCost: number;
};

export type ProjectMilestoneCostSummary = {
  milestoneId: number;
  milestoneIid: number;
  title: string;
  state: string;
  dueDate: string | null;
  totalCost: number;
};
export type ProjectMilestoneIssueCost = {
  milestoneId: number;
  issueId: number | null;
  issueIid: number | null;
  issueTitle: string;
  totalCost: number;
};

export type ProjectMilestoneDetailSummary = {
  milestoneId: number;
  milestoneIid: number;
  title: string;
  state: string;
  description: string | null;
  dueDate: string | null;
  totalTimeSpentSeconds: number;
  totalIssues: number;
  closedIssues: number;
  totalCost: number;
};

/**
 * Single milestone issue returned by the backend enriched with GitLab labels for local filtering.
 */
export type ProjectMilestoneIssueDetail = {
  issueId: number | null;
  issueIid: number | null;
  issueTitle: string;
  issueWebUrl: string | null;
  humanTimeEstimate: string | null;
  state: string | null;
  dueDate: string | null;
  assigneeUsername: string | null;
  assigneeName: string | null;
  labels: string[];
  totalTimeSpentSeconds: number;
  totalCost: number;
};

export type ProjectMilestoneInternContribution = {
  internId: number | null;
  internUsername: string;
  internFirstName: string | null;
  internLastName: string | null;
  totalTimeSpentSeconds: number;
};

export type ProjectMilestoneDetail = {
  summary: ProjectMilestoneDetailSummary;
  issues: ProjectMilestoneIssueDetail[];
  internContributions: ProjectMilestoneInternContribution[];
};
export type ProjectBudgetPayload = {
  name: string;
  budget?: number | null;
  budgetFrom?: string | null;
  budgetTo?: string | null;
  namespaceId?: number | null;
  namespaceName?: string | null;
  isExternal?: boolean | null;
  hourlyRateCzk?: number | null;
};
export type ProjectNamespaceOption = {
  namespaceId: number | null;
  namespaceName: string;
};
export type RepositoryAssignmentDTO = {
  id: number;
  gitlabRepoId: number | null;
  name: string;
  nameWithNamespace: string;
  assigned: boolean;
};

export type InternDTO = {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
  level_id: number;
  level_label: string;
  status_code: string;
  status_label: string;
  status_severity: number;
  groups: InternGroupDTO[];
};
export type InternListResponseDTO = {
  content: InternDTO[];
  page: number;
  size: number;
  total_elements: number;
  total_pages: number;
};

export type InternGroup = { id: number; code: number; label: string };
export type Intern = {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  levelId: number;
  levelLabel: string;
  statusCode: string;
  statusLabel: string;
  statusSeverity: number;
  groups: InternGroup[];
};
export type InternListResult = { content: Intern[]; page: number; size: number; totalElements: number; totalPages: number };
export type InternLevelHistoryEntryDTO = {
  id: number;
  level_id: number;
  level_code: string;
  level_label: string;
  valid_from: string;
  valid_to: string | null;
};
export type InternLevelHistoryPayload = { levelId: number; validFrom: string; validTo: string | null };
export type InternPayload = { firstName: string; lastName: string; username: string; groupIds: number[]; levelHistory: InternLevelHistoryPayload[] };
export type InternGroupDTO = { id: number; code: number; label: string };
export type LevelOption = { id: number; code: string; label: string };
export type GroupOption = { id: number; code: number; label: string };
export type InternListParams = { q?: string; username?: string; page?: number; size?: number; sort?: string };
export type InternOverviewDTO = {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
  level_id: number;
  level_label: string;
  status_code: string;
  status_label: string;
  status_severity: number;
  groups: InternGroupDTO[];
  total_hours: number | string;
};
export type InternOverview = {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  levelId: number;
  levelLabel: string;
  statusCode: string;
  statusLabel: string;
  statusSeverity: number;
  groups: InternGroup[];
  totalHours: number;
};
export type InternProjectAllocationDTO = {
  project_id: number;
  project_name: string;
  workload_hours: number | string | null;
  include_in_reported_cost: boolean;
};
export type InternProjectAllocation = {
  projectId: number;
  projectName: string;
  workloadHours: number | null;
  includeInReportedCost: boolean;
};
export type InternDetailDTO = InternOverviewDTO & { projects: InternProjectAllocationDTO[] };
export type InternDetail = InternOverview & { projects: InternProjectAllocation[] };

export type InternStatusOptionDTO = { code: string; label: string; severity: number };
export type InternStatusOption = { code: string; label: string; severity: number };
export type InternStatusHistoryEntryDTO = {
  id: number;
  status_code: string;
  status_label: string;
  status_severity: number;
  valid_from: string;
  valid_to: string | null;
};
export type InternStatusHistoryEntry = {
  id: number;
  statusCode: string;
  statusLabel: string;
  statusSeverity: number;
  validFrom: string;
  validTo: string | null;
};
export type UpdateInternStatusPayload = { statusCode: string; validFrom?: string | null };

export type InternMonthlyHoursRowDTO = {
  internId: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  monthStart: string;
  year: number;
  month: number;
  hours: number | string;
  cost: number | string | null;
  levelId: number | null;
  levelCode: string | null;
  levelLabel: string | null;
};

export type InternPerformanceBucketDTO = { index: number; from: string; to: string; label: string };
export type InternPerformanceProjectDTO = {
  projectId: number | null;
  projectName: string | null;
  hours: (number | string)[];
};

export type InternPerformanceRowDTO = {
  internId: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  hours: (number | string)[];
  projects?: InternPerformanceProjectDTO[];
};
export type InternPerformanceResponseDTO = {
  buckets: InternPerformanceBucketDTO[];
  interns: InternPerformanceRowDTO[];
};

export type InternMonthlyHoursRow = {
  internId: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  monthStart: string;
  year: number;
  month: number;
  hours: number;
  cost: number | null;
  levelId: number | null;
  levelCode: string | null;
  levelLabel: string | null;
};

export type InternPerformanceBucket = { index: number; from: string; to: string; label: string };
export type InternPerformanceProject = {
  projectId: number | null;
  projectName: string | null;
  hours: number[];
};
export type InternPerformanceRow = {
  internId: number;
  username: string;
  firstName: string;
  lastName: string;
  hours: number[];
  projects: InternPerformanceProject[];
};
export type InternPerformanceResponse = {
  buckets: InternPerformanceBucket[];
  interns: InternPerformanceRow[];
};
export type InternPerformanceParams = {
  period?: 'week' | 'month';
  periods?: number;
  internIds?: number[];
  groupIds?: number[];
};

export type TeamReportInternDTO = {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  levelId: number;
  levelLabel: string;
  workloadHours: number | string | null;
  groups: InternGroupDTO[];
};
export type TeamReportTeamDTO = { projectId: number; projectName: string; interns: TeamReportInternDTO[] };
export type TeamReportIntern = {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  levelId: number;
  levelLabel: string;
  workloadHours: number | null;
  groups: InternGroup[];
};
export type TeamReportTeam = { projectId: number; projectName: string; interns: TeamReportIntern[] };

export type InternLevelHistoryEntry = {
  id: number;
  levelId: number;
  levelCode: string;
  levelLabel: string;
  validFrom: string;
  validTo: string | null;
};

export type ProjectInternAssignmentGroupDTO = { id: number; code: number; label: string };
export type ProjectInternAssignmentDTO = {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  levelId: number;
  levelCode: string;
  levelLabel: string;
  groups: ProjectInternAssignmentGroupDTO[];
  workloadHours: number | null;
  includeInReportedCost: boolean;
  assigned: boolean;
};

export type ProjectReportDetailIntern = {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
};

export type ProjectReportDetailIssueCell = {
  internId: number;
  hours: number;
  cost: number | null;
};

export type ProjectReportDetailIssue = {
  repositoryId: number;
  repositoryName: string;
  issueId: number | null;
  issueIid: number | null;
  issueTitle: string;
  assigneeUsername: string | null;
  labels: string[];
  issueWebUrl: string | null;
  humanTimeEstimate: string | null;
  internHours: ProjectReportDetailIssueCell[];
};

export type ProjectReportDetailResponse = {
  interns: ProjectReportDetailIntern[];
  issues: ProjectReportDetailIssue[];
};

export type ProjectIssueDTO = {
  id: number | string | null;
  issue_id?: number | string | null;
  iid?: number | string | null;
  title: string | null;
  state?: string | null;
  status?: string | null;
  dueDate?: string | null;
  due_date?: string | null;
  reference?: string | null;
  ref?: string | null;
  webUrl?: string | null;
  web_url?: string | null;
};

export type ProjectIssue = {
  id: number;
  title: string;
  state: string | null;
  dueDate: string | null;
  reference: string | null;
  webUrl: string | null;
};

export type WeeklyPlannerTaskDTO = {
  id: number;
  dayOfWeek: number | null;
  note: string | null;
  plannedHours: number | string | null;
  internId: number | null;
  internName: string | null;
  issueId: number | null;
  issueTitle: string | null;
  issueState: string | null;
  status?: string | null;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  carriedOverFromWeekStart?: string | null;
  carriedOverFromWeekId?: number | null;
};

export type WeeklyPlannerTask = {
  id: number;
  dayOfWeek: number | null;
  note: string | null;
  plannedHours: number | null;
  internId: number | null;
  internName: string | null;
  issueId: number | null;
  issueTitle: string | null;
  issueState: string | null;
  status: 'OPENED' | 'CLOSED';
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  carriedOverFromWeekStart: string | null;
  carriedOverFromWeekId: number | null;
};

export type WeeklyPlannerWeekDTO = {
  id: number;
  projectId: number;
  weekStart: string;
  weekEnd: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  isClosed?: boolean;
  tasks: WeeklyPlannerTaskDTO[];
};

export type WeeklyPlannerWeek = {
  id: number;
  projectId: number;
  weekStart: string;
  weekEnd: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  isClosed: boolean;
  tasks: WeeklyPlannerTask[];
};

export type WeeklyTaskPayload = {
  issueId?: number | null;
  internId?: number | null;
  dayOfWeek?: number | null;
  note?: string | null;
  plannedHours?: number | null;
  deadline?: string | null;
  title?: string | null;
  description?: string | null;
  status?: 'OPENED' | 'CLOSED';
};

export type WeeklyPlannerMetadataDTO = {
  projectId: number;
  weekStartDay: number;
  today: string;
  currentWeekStart: string | null;
  currentWeekEnd: string | null;
  currentWeekId: number | null;
  roles?: string[];
};

export type WeeklyPlannerMetadata = {
  projectId: number;
  weekStartDay: number;
  today: string;
  currentWeekStart: string | null;
  currentWeekEnd: string | null;
  currentWeekId: number | null;
  roles: string[];
};

export type WeeklyPlannerWeekCollectionDTO = {
  weeks: WeeklyPlannerWeekDTO[];
  metadata: WeeklyPlannerMetadataDTO;
};

export type WeeklyPlannerWeekCollection = {
  weeks: WeeklyPlannerWeek[];
  metadata: WeeklyPlannerMetadata;
};

export type WeeklyPlannerWeekWithMetadataDTO = {
  week: WeeklyPlannerWeekDTO;
  metadata: WeeklyPlannerMetadataDTO;
};

export type WeeklyPlannerWeekWithMetadata = {
  week: WeeklyPlannerWeek;
  metadata: WeeklyPlannerMetadata;
};

export type WeeklyPlannerSettingsDTO = {
  weekStartDay: number;
};

export type WeeklyPlannerSettings = {
  weekStartDay: number;
};

export type WeeklySummaryPermissionsDTO = {
  canCloseWeek?: boolean;
  canCarryOver?: boolean;
};

export type WeeklySummaryMetricsDTO = {
  totalTasks?: number | string | null;
  completedTasks?: number | string | null;
  completedPercentage?: number | string | null;
  carriedOverTasks?: number | string | null;
  carriedOverPercentage?: number | string | null;
  newTasks?: number | string | null;
  inProgressTasks?: number | string | null;
};

export type WeeklySummaryDTO = {
  projectWeekId: number;
  taskCount: number | string;
  totalHours: number | string;
  weekStart?: string | null;
  weekEnd?: string | null;
  state?: string | null;
  isClosed?: boolean;
  completedAt?: string | null;
  metrics?: WeeklySummaryMetricsDTO | null;
  permissions?: WeeklySummaryPermissionsDTO | null;
};

export type WeeklySummaryMetrics = {
  totalTasks: number | null;
  completedTasks: number | null;
  completedPercentage: number | null;
  carriedOverTasks: number | null;
  carriedOverPercentage: number | null;
  newTasks: number | null;
  inProgressTasks: number | null;
};

export type WeeklySummaryPermissions = {
  canCloseWeek: boolean;
  canCarryOver: boolean;
};

export type WeeklySummary = {
  projectWeekId: number;
  taskCount: number;
  totalHours: number | null;
  weekStart: string | null;
  weekEnd: string | null;
  state: string | null;
  isClosed: boolean;
  completedAt: string | null;
  metrics: WeeklySummaryMetrics;
  permissions: WeeklySummaryPermissions;
};

export type CarryOverTasksPayload = {
  targetWeekStart: string;
  taskIds?: number[];
};

export type ProjectReportInternDetailIssue = {
  repositoryId: number;
  repositoryName: string;
  issueId: number | null;
  issueIid: number | null;
  issueTitle: string;
  issueWebUrl: string | null;
  humanTimeEstimate: string | null;
  labels: string[];
  dueDate: string | null;
  createdAt: string | null;
  ageDays: number | null;
  totalTimeSpentSeconds: number;
};

export type ProjectReportInternDetailResponse = {
  interns: ProjectReportDetailIntern[];
  issues: ProjectReportInternDetailIssue[];
};

export type ProjectReportDetailParams = {
  from?: string;
  to?: string;
  internUsername?: string;
};


function mapIntern(dto: InternDTO): Intern {
  const groups = (dto.groups ?? []).map(g => ({ id: g.id, code: g.code, label: g.label }));
  // Technický komentář: Statusové pole mapujeme přímo z DTO, aby FE vždy pracoval s aktuální kombinací kódu, labelu a severity.
  return {
    id: dto.id,
    firstName: dto.first_name,
    lastName: dto.last_name,
    username: dto.username,
    levelId: dto.level_id,
    levelLabel: dto.level_label,
    statusCode: dto.status_code,
    statusLabel: dto.status_label,
    statusSeverity: dto.status_severity,
    groups,
  };
}

function prepareInternBody(payload: InternPayload) {
  const history = (payload.levelHistory ?? []).map(item => ({
    level_id: item.levelId,
    valid_from: item.validFrom,
    valid_to: item.validTo ?? null,
  }));
  return {
    first_name: payload.firstName.trim(),
    last_name: payload.lastName.trim(),
    username: payload.username.trim(),
    group_ids: payload.groupIds,
    level_history: history,
  };
}

function parseNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function mapProjectIssue(dto: ProjectIssueDTO): ProjectIssue {
  const idCandidate = dto.id ?? dto.issue_id ?? dto.iid ?? null;
  const parsedId = parseNumber(idCandidate as number | string | null | undefined);
  const id = Number.isNaN(parsedId) ? 0 : parsedId;
  const rawReference = dto.reference ?? dto.ref ?? dto.iid ?? null;
  const reference = rawReference === null || rawReference === undefined ? null : String(rawReference);
  const rawState = dto.state ?? dto.status ?? null;
  const state = rawState === null ? null : String(rawState);
  const dueDate = dto.dueDate ?? dto.due_date ?? null;
  const webUrl = dto.webUrl ?? dto.web_url ?? null;
  return {
    id,
    title: dto.title ?? '',
    state,
    dueDate,
    reference,
    webUrl,
  };
}

function mapInternOverview(dto: InternOverviewDTO): InternOverview {
  const groups = (dto.groups ?? []).map(g => ({ id: g.id, code: g.code, label: g.label }));
  const totalHoursRaw = parseNumber(dto.total_hours);
  // Technický komentář: Přenášíme status i do přehledu, aby se badge a formuláře v modalu propsaly bez dalších dotazů.
  return {
    id: dto.id,
    firstName: dto.first_name,
    lastName: dto.last_name,
    username: dto.username,
    levelId: dto.level_id,
    levelLabel: dto.level_label,
    statusCode: dto.status_code,
    statusLabel: dto.status_label,
    statusSeverity: dto.status_severity,
    groups,
    totalHours: Number.isNaN(totalHoursRaw) ? 0 : totalHoursRaw,
  };
}

function mapTeamReportIntern(dto: TeamReportInternDTO): TeamReportIntern {
  const groups = (dto.groups ?? []).map(g => ({ id: g.id, code: g.code, label: g.label }));
  const workloadRaw = parseNumber(dto.workloadHours);
  return {
    id: dto.id,
    firstName: dto.firstName,
    lastName: dto.lastName,
    username: dto.username,
    levelId: dto.levelId,
    levelLabel: dto.levelLabel,
    workloadHours: Number.isNaN(workloadRaw) ? null : workloadRaw,
    groups,
  };
}

function mapTeamReportTeam(dto: TeamReportTeamDTO): TeamReportTeam {
  return {
    projectId: dto.projectId,
    projectName: dto.projectName,
    interns: (dto.interns ?? []).map(mapTeamReportIntern),
  };
}

function mapInternProjectAllocation(dto: InternProjectAllocationDTO): InternProjectAllocation {
  const workload = parseNumber(dto.workload_hours);
  return {
    projectId: dto.project_id,
    projectName: dto.project_name,
    workloadHours: Number.isNaN(workload) ? null : workload,
    includeInReportedCost: dto.include_in_reported_cost,
  };
}

function mapInternDetail(dto: InternDetailDTO): InternDetail {
  const overview = mapInternOverview(dto);
  return {
    ...overview,
    projects: (dto.projects ?? []).map(mapInternProjectAllocation),
  };
}

function normaliseWeeklyTaskStatus(status: string | null | undefined): 'OPENED' | 'CLOSED' {
  const normalized = typeof status === 'string' ? status.trim().toUpperCase() : '';
  return normalized === 'CLOSED' ? 'CLOSED' : 'OPENED';
}

function mapWeeklyPlannerTask(dto: WeeklyPlannerTaskDTO): WeeklyPlannerTask {
  const plannedHoursRaw = parseNumber(dto.plannedHours);
  const status = normaliseWeeklyTaskStatus(dto.status ?? dto.issueState ?? null);
  return {
    id: dto.id,
    dayOfWeek: dto.dayOfWeek ?? null,
    note: dto.note ?? null,
    plannedHours: Number.isNaN(plannedHoursRaw) ? null : plannedHoursRaw,
    internId: dto.internId ?? null,
    internName: dto.internName ?? null,
    issueId: dto.issueId ?? null,
    issueTitle: dto.issueTitle ?? null,
    issueState: dto.issueState ?? null,
    status,
    deadline: dto.deadline ?? null,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    carriedOverFromWeekStart: dto.carriedOverFromWeekStart ?? null,
    carriedOverFromWeekId: dto.carriedOverFromWeekId ?? null,
  };
}

function mapWeeklyPlannerWeek(dto: WeeklyPlannerWeekDTO): WeeklyPlannerWeek {
  const closedAt = dto.closedAt ?? null;
  const explicitClosed = dto.isClosed === true || dto.isClosed === false ? dto.isClosed : null;
  return {
    id: dto.id,
    projectId: dto.projectId,
    weekStart: dto.weekStart,
    weekEnd: dto.weekEnd,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    closedAt,
    isClosed: explicitClosed ?? (closedAt !== null),
    tasks: (dto.tasks ?? []).map(mapWeeklyPlannerTask),
  };
}

function mapWeeklyPlannerMetadata(dto: WeeklyPlannerMetadataDTO): WeeklyPlannerMetadata {
  return {
    projectId: dto.projectId,
    weekStartDay: dto.weekStartDay,
    today: dto.today,
    currentWeekStart: dto.currentWeekStart ?? null,
    currentWeekEnd: dto.currentWeekEnd ?? null,
    currentWeekId: dto.currentWeekId ?? null,
    roles: Array.isArray(dto.roles) ? dto.roles : [],
  };
}

function mapWeeklyPlannerSettings(dto: WeeklyPlannerSettingsDTO): WeeklyPlannerSettings {
  return {
    weekStartDay: dto.weekStartDay,
  };
}

function mapWeeklySummaryMetrics(dto: WeeklySummaryMetricsDTO | null | undefined): WeeklySummaryMetrics {
  function normalise(value: number | string | null | undefined): number | null {
    const parsed = parseNumber(value ?? null);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return {
    totalTasks: normalise(dto?.totalTasks),
    completedTasks: normalise(dto?.completedTasks),
    completedPercentage: normalise(dto?.completedPercentage),
    carriedOverTasks: normalise(dto?.carriedOverTasks),
    carriedOverPercentage: normalise(dto?.carriedOverPercentage),
    newTasks: normalise(dto?.newTasks),
    inProgressTasks: normalise(dto?.inProgressTasks),
  };
}

function mapWeeklySummary(dto: WeeklySummaryDTO): WeeklySummary {
  const taskCountRaw = parseNumber(dto.taskCount);
  const totalHoursRaw = parseNumber(dto.totalHours);
  const normalizedState = dto.state ? dto.state.trim().toUpperCase() : null;
  const isClosed = dto.isClosed ?? (normalizedState === 'CLOSED');
  return {
    projectWeekId: dto.projectWeekId,
    taskCount: Number.isNaN(taskCountRaw) ? 0 : taskCountRaw,
    totalHours: Number.isNaN(totalHoursRaw) ? null : totalHoursRaw,
    weekStart: dto.weekStart ?? null,
    weekEnd: dto.weekEnd ?? null,
    state: normalizedState,
    isClosed: Boolean(isClosed),
    completedAt: dto.completedAt ?? null,
    metrics: mapWeeklySummaryMetrics(dto.metrics),
    permissions: {
      canCloseWeek: dto.permissions?.canCloseWeek ?? false,
      canCarryOver: dto.permissions?.canCarryOver ?? false,
    },
  };
}

function mapWeeklyPlannerWeekCollection(dto: WeeklyPlannerWeekCollectionDTO): WeeklyPlannerWeekCollection {
  return {
    weeks: (dto.weeks ?? []).map(mapWeeklyPlannerWeek),
    metadata: mapWeeklyPlannerMetadata(dto.metadata),
  };
}

function mapWeeklyPlannerWeekWithMetadata(dto: WeeklyPlannerWeekWithMetadataDTO): WeeklyPlannerWeekWithMetadata {
  return {
    week: mapWeeklyPlannerWeek(dto.week),
    metadata: mapWeeklyPlannerMetadata(dto.metadata),
  };
}

function mapInternStatusHistoryEntry(dto: InternStatusHistoryEntryDTO): InternStatusHistoryEntry {
  // Technický komentář: Historii vracíme již ve formátu vhodném pro UI (camelCase + zachovaný rozsah platnosti).
  return {
    id: dto.id,
    statusCode: dto.status_code,
    statusLabel: dto.status_label,
    statusSeverity: dto.status_severity,
    validFrom: dto.valid_from,
    validTo: dto.valid_to,
  };
}

function mapInternMonthlyHoursRow(dto: InternMonthlyHoursRowDTO): InternMonthlyHoursRow {
  const hoursRaw = parseNumber(dto.hours);
  const costRaw = parseNumber(dto.cost);
  return {
    internId: dto.internId,
    username: dto.username,
    firstName: dto.firstName,
    lastName: dto.lastName,
    monthStart: dto.monthStart,
    year: dto.year,
    month: dto.month,
    hours: Number.isNaN(hoursRaw) ? 0 : hoursRaw,
    cost: Number.isNaN(costRaw) ? null : costRaw,
    levelId: dto.levelId ?? null,
    levelCode: dto.levelCode ?? null,
    levelLabel: dto.levelLabel ?? null,
  };
}

function mapInternPerformanceProject(dto: InternPerformanceProjectDTO): InternPerformanceProject {
  const hours = (dto.hours ?? []).map(value => {
    const parsed = parseNumber(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  });
  return {
    projectId: dto.projectId ?? null,
    projectName: dto.projectName ?? null,
    hours,
  };
}

function mapInternPerformanceRow(dto: InternPerformanceRowDTO): InternPerformanceRow {
  const hours = (dto.hours ?? []).map(value => {
    const parsed = parseNumber(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  });
  return {
    internId: dto.internId,
    username: dto.username,
    firstName: dto.firstName ?? '',
    lastName: dto.lastName ?? '',
    hours,
    projects: (dto.projects ?? []).map(mapInternPerformanceProject),
  };
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw { error: { code: "INVALID_JSON", message: "Neplatná odpověď serveru.", details: text, httpStatus: res.status } } as ErrorResponse;
  }
  try { return JSON.parse(text) as T; } catch {
    throw { error: { code: "INVALID_JSON", message: "Neplatná odpověď serveru.", details: text, httpStatus: res.status } } as ErrorResponse;
  }
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await parseJson<T | ErrorResponse>(res);
  if (!res.ok) {
    throw data as ErrorResponse;
  }
  return data as T;
}

export async function getProjects(): Promise<ProjectDTO[]> {
  const res = await fetch(`${API_BASE}/api/projects`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectDTO[]>(res);
}

export async function getRepositoryNamespaces(): Promise<ProjectNamespaceOption[]> {
  const res = await fetch(`${API_BASE}/api/namespaces`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectNamespaceOption[]>(res);
}

export async function getProjectsOverview(): Promise<ProjectOverviewDTO[]> {
  const res = await fetch(`${API_BASE}/api/projects/overview`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectOverviewDTO[]>(res);
}

export async function getProjectCapacity(projectId: number): Promise<ProjectCapacityReport> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/capacity`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectCapacityReport>(res);
}

export async function reportProjectCapacity(
  projectId: number,
  payload: ReportProjectCapacityPayload,
): Promise<ProjectCapacityReport> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/capacity`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectCapacityReport>(res);
}

export async function getPlanningCurrentCapacity(): Promise<PlanningCurrentCapacityResponse> {
  const res = await fetch(`${API_BASE}/api/planning/current-capacity`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<PlanningCurrentCapacityResponse>(res);
}

export async function getReportTeams(): Promise<TeamReportTeam[]> {
  const res = await fetch(`${API_BASE}/api/reports/teams`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<TeamReportTeamDTO[]>(res);
  return data.map(mapTeamReportTeam);
}

function serialiseProjectBudgetPayload(payload: ProjectBudgetPayload): ProjectBudgetPayload {
  const isExternal = payload.isExternal ?? false;
  const hourlyRate = isExternal ? payload.hourlyRateCzk ?? null : null;
  return {
    ...payload,
    isExternal,
    hourlyRateCzk: hourlyRate,
  };
}

export async function createProjectByName(payload: ProjectBudgetPayload): Promise<ProjectDTO> {
  const body = serialiseProjectBudgetPayload(payload);
  const res = await fetch(`${API_BASE}/api/projects/by-name`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectDTO>(res);
}

export async function updateProject(id: number, payload: ProjectBudgetPayload): Promise<ProjectDTO> {
  const body = serialiseProjectBudgetPayload(payload);
  const res = await fetch(`${API_BASE}/api/projects/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectDTO>(res);
}

export async function deleteProject(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
}

export async function deleteReports(projectIds?: number[]): Promise<DeleteReportsResult> {
  const params = new URLSearchParams();
  if (Array.isArray(projectIds)) {
    const uniqueIds = Array.from(
      new Set(projectIds.filter(id => typeof id === "number" && Number.isFinite(id))),
    );
    for (const id of uniqueIds) {
      params.append("projectId", String(id));
    }
  }
  const query = params.toString();
  const res = await fetch(`${API_BASE}/api/sync/reports${query ? `?${query}` : ""}`, { method: "DELETE" });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<DeleteReportsResult>(res);
}

export async function deleteAllReports(): Promise<DeleteReportsResult> {
  return deleteReports();
}

export async function getSyncReportOverview(params?: {
  from?: string;
  to?: string;
  untrackedOnly?: boolean;
}): Promise<SyncReportOverviewRowDTO[]> {
  const searchParams = new URLSearchParams();
  if (params?.from) {
    searchParams.set("from", params.from);
  }
  if (params?.to) {
    searchParams.set("to", params.to);
  }
  if (params?.untrackedOnly) {
    searchParams.set("untracked_only", "true");
  }
  const query = searchParams.toString();
  const res = await fetch(`${API_BASE}/api/sync/reports/overview${query ? `?${query}` : ""}`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<SyncReportOverviewRowDTO[]>(res);
}


/**
 * Loads all level options for the intern form.
 */
export async function getLevels(): Promise<LevelOption[]> {
  const res = await fetch(`${API_BASE}/api/levels`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<LevelOption[]>(res);
}

/**
 * Loads all group options for the intern form.
 */
export async function getGroups(): Promise<GroupOption[]> {
  const res = await fetch(`${API_BASE}/api/groups`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<GroupOption[]>(res);
}
export async function getProjectRepositories(projectId: number, search?: string): Promise<RepositoryAssignmentDTO[]> {
  const qs = new URLSearchParams();
  if (search && search.trim()) qs.set('search', search.trim());
  const url = `${API_BASE}/api/projects/${projectId}/repositories${qs.toString() ? `?${qs.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<RepositoryAssignmentDTO[]>(res);
}

export async function updateProjectRepositories(projectId: number, repositoryIds: number[]): Promise<void> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/repositories`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repositoryIds }),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
}

export async function getProjectIssues(projectId: number): Promise<ProjectIssue[]> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/issues`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<ProjectIssueDTO[]>(res);
  return (data ?? []).map(mapProjectIssue);
}

export async function getProjectInterns(projectId: number, search?: string): Promise<ProjectInternAssignmentDTO[]> {
  const qs = new URLSearchParams();
  if (search && search.trim()) qs.set('search', search.trim());
  const url = `${API_BASE}/api/projects/${projectId}/interns${qs.toString() ? `?${qs.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectInternAssignmentDTO[]>(res);
}

export type ProjectInternUpdatePayload = {
  internId: number;
  workloadHours: number | null;
  includeInReportedCost: boolean;
};

export async function updateProjectInterns(projectId: number, interns: ProjectInternUpdatePayload[]): Promise<void> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/interns`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ interns }),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
}

export async function getWeeklyPlannerSettings(projectId: number): Promise<WeeklyPlannerSettings> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/weekly-planner/settings`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<WeeklyPlannerSettingsDTO>(res);
  return mapWeeklyPlannerSettings(data);
}

export async function updateWeeklyPlannerSettings(
  projectId: number,
  settings: WeeklyPlannerSettings,
): Promise<WeeklyPlannerSettings> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/weekly-planner/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<WeeklyPlannerSettingsDTO>(res);
  return mapWeeklyPlannerSettings(data);
}

export type GenerateWeeklyPlannerWeeksPayload = {
  from: string;
  to: string;
};

export async function generateProjectWeeklyPlannerWeeks(
  projectId: number,
  payload: GenerateWeeklyPlannerWeeksPayload,
): Promise<WeeklyPlannerWeekCollection> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/weekly-planner/weeks/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<WeeklyPlannerWeekCollectionDTO>(res);
  return mapWeeklyPlannerWeekCollection(data);
}

export async function listProjectWeeklyPlannerWeeks(
  projectId: number,
  params?: { limit?: number; offset?: number },
): Promise<WeeklyPlannerWeekCollection> {
  const searchParams = new URLSearchParams();
  if (typeof params?.limit === 'number' && Number.isFinite(params.limit)) {
    searchParams.set('limit', String(params.limit));
  }
  if (typeof params?.offset === 'number' && Number.isFinite(params.offset)) {
    searchParams.set('offset', String(params.offset));
  }
  const query = searchParams.toString();
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/weekly-planner/weeks${query ? `?${query}` : ''}`,
  );
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<WeeklyPlannerWeekCollectionDTO>(res);
  return mapWeeklyPlannerWeekCollection(data);
}

export async function getProjectWeeklyPlannerWeek(
  projectId: number,
  projectWeekId: number,
): Promise<WeeklyPlannerWeekWithMetadata> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/weekly-planner/weeks/${projectWeekId}`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<WeeklyPlannerWeekWithMetadataDTO>(res);
  return mapWeeklyPlannerWeekWithMetadata(data);
}

export async function getProjectWeekSummary(
  projectId: number,
  projectWeekId: number,
): Promise<WeeklySummary> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/weekly-planner/weeks/${projectWeekId}/summary`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<WeeklySummaryDTO>(res);
  return mapWeeklySummary(data);
}

export async function closeProjectWeek(
  projectId: number,
  projectWeekId: number,
): Promise<WeeklyPlannerWeekWithMetadata> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/weekly-planner/weeks/${projectWeekId}/close`, {
    method: "POST",
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<WeeklyPlannerWeekWithMetadataDTO>(res);
  return mapWeeklyPlannerWeekWithMetadata(data);
}

function normaliseWeeklyTaskPayload(payload: WeeklyTaskPayload): WeeklyTaskPayload {
  return {
    issueId: payload.issueId ?? null,
    internId: payload.internId ?? null,
    dayOfWeek: payload.dayOfWeek ?? null,
    note: payload.note ?? null,
    plannedHours: payload.plannedHours ?? null,
    deadline: payload.deadline ?? null,
    title: payload.title ?? null,
    description: payload.description ?? null,
    status: payload.status,
  };
}

export async function createWeeklyTask(
  projectId: number,
  projectWeekId: number,
  payload: WeeklyTaskPayload,
): Promise<WeeklyPlannerTask> {
  const body = normaliseWeeklyTaskPayload(payload);
  const data = await fetchJson<WeeklyPlannerTaskDTO>(
    `${API_BASE}/api/projects/${projectId}/weekly-planner/weeks/${projectWeekId}/tasks`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return mapWeeklyPlannerTask(data);
}

export async function updateWeeklyTask(
  projectId: number,
  projectWeekId: number,
  taskId: number,
  payload: WeeklyTaskPayload,
): Promise<WeeklyPlannerTask> {
  const body = normaliseWeeklyTaskPayload(payload);
  const data = await fetchJson<WeeklyPlannerTaskDTO>(
    `${API_BASE}/api/projects/${projectId}/weekly-planner/weeks/${projectWeekId}/tasks/${taskId}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return mapWeeklyPlannerTask(data);
}

export async function carryOverWeeklyTasks(
  projectId: number,
  projectWeekId: number,
  payload: CarryOverTasksPayload,
): Promise<WeeklyPlannerTask[]> {
  const body: CarryOverTasksPayload = {
    targetWeekStart: payload.targetWeekStart,
    taskIds: payload.taskIds && payload.taskIds.length > 0 ? payload.taskIds : undefined,
  };
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/weekly-planner/weeks/${projectWeekId}/carry-over`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<WeeklyPlannerTaskDTO[]>(res);
  return (data ?? []).map(mapWeeklyPlannerTask);
}

export async function getProjectActiveMilestones(projectId: number): Promise<ProjectMilestoneSummary[]> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/milestones/active`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectMilestoneSummary[]>(res);
}

/**
 * Fetches aggregated cost totals for every milestone within the selected project. The endpoint
 * returns a flat list so the consumer can build arbitrary comparisons without further API calls.
 */
export async function getProjectMilestoneCostSummary(
  projectId: number,
): Promise<ProjectMilestoneCostSummary[]> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/milestones/costs`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectMilestoneCostSummary[]>(res);
}

/**
 * Loads per-issue cost totals for a whitelist of milestone identifiers. The helper defensively
 * filters duplicate and non-numeric values to avoid unnecessary backend work and to keep the
 * generated query string compact.
 */
export async function getProjectMilestoneIssueCosts(
  projectId: number,
  milestoneIds: number[],
): Promise<ProjectMilestoneIssueCost[]> {
  const uniqueIds = Array.from(new Set(milestoneIds.filter(id => typeof id === "number" && Number.isFinite(id))));
  if (uniqueIds.length === 0) {
    return [];
  }
  const params = new URLSearchParams();
  for (const id of uniqueIds) {
    params.append("milestoneId", String(id));
  }
  const query = params.toString();
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/milestones/issues${query ? `?${query}` : ""}`,
  );
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectMilestoneIssueCost[]>(res);
}

export async function getProjectMilestoneDetail(
  projectId: number,
  milestoneId: number,
): Promise<ProjectMilestoneDetail> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/milestones/${milestoneId}/detail`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const detail = await parseJson<ProjectMilestoneDetail>(res);
  return {
    ...detail,
    issues: detail.issues.map(issue => ({
      ...issue,
      labels: (issue.labels ?? []).map(label => label.trim()).filter(label => label.length > 0),
    })),
  };
}

export async function syncRepositories(): Promise<SyncSummary> {
  const res = await fetch(`${API_BASE}/api/sync/repositories`, { method: "POST" });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<SyncSummary>(res);
}

/**
 * Triggers backend synchronisation for a single project and returns aggregated statistics.
 */
export async function syncProjectReports(projectId: number, payload: ProjectReportSyncPayload): Promise<SyncSummary> {
  const res = await fetch(`${API_BASE}/api/sync/projects/${projectId}/reports`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<SyncSummary>(res);
}

export async function syncProjectMilestones(gitlabProjectId: number): Promise<SyncSummary> {
  const res = await fetch(`${API_BASE}/api/sync/projects/${gitlabProjectId}/milestones`, {
    method: "POST",
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<SyncSummary>(res);
}

export async function getProjectReportDetail(
  projectId: number,
  params: ProjectReportDetailParams,
): Promise<ProjectReportDetailResponse> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.internUsername) qs.set("internUsername", params.internUsername);
  const query = qs.toString();
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/reports/detail${query ? `?${query}` : ""}`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<ProjectReportDetailResponse>(res);
  return {
    interns: data.interns.map(intern => ({ ...intern })),
    issues: data.issues.map(issue => ({
      ...issue,
      issueWebUrl:
        issue.issueWebUrl && issue.issueWebUrl.trim() ? issue.issueWebUrl.trim() : null,
    })),
  };
}

export async function getProjectReportInternDetail(
  projectId: number,
  internUsername: string | null,
): Promise<ProjectReportInternDetailResponse> {
  const qs = new URLSearchParams();
  if (internUsername) {
    qs.set("internUsername", internUsername);
  }
  const query = qs.toString();
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/reports/intern-detail${query ? `?${query}` : ""}`,
  );
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<ProjectReportInternDetailResponse>(res);
  return {
    interns: data.interns.map(intern => ({ ...intern })),
    issues: data.issues.map(issue => {
      const normalizedAgeDays =
        typeof issue.ageDays === 'number' && Number.isFinite(issue.ageDays)
          ? Math.max(0, Math.floor(issue.ageDays))
          : null;
      const normalizedWebUrl = issue.issueWebUrl && issue.issueWebUrl.trim() ? issue.issueWebUrl.trim() : null;
      const normalizedHumanEstimate =
        issue.humanTimeEstimate && issue.humanTimeEstimate.trim() ? issue.humanTimeEstimate.trim() : null;
      const normalizedLabels = issue.labels
        .map(label => (typeof label === 'string' ? label.trim() : ''))
        .filter(label => label.length > 0);

      return {
        ...issue,
        labels: normalizedLabels,
        issueWebUrl: normalizedWebUrl,
        humanTimeEstimate: normalizedHumanEstimate,
        dueDate: issue.dueDate ?? null,
        createdAt: issue.createdAt ?? null,
        ageDays: normalizedAgeDays,
        totalTimeSpentSeconds: Number.isFinite(issue.totalTimeSpentSeconds)
          ? issue.totalTimeSpentSeconds
          : 0,
        issueTitle: issue.issueTitle.trim() ? issue.issueTitle.trim() : 'Bez názvu',
      };
    }),
  };
}

export async function getProjectLongTermReport(
  projectId: number,
  params: ProjectLongTermReportParams,
): Promise<ProjectLongTermReportResponse> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const query = qs.toString();
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/reports/long-term${query ? `?${query}` : ""}`,
  );
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<ProjectLongTermReportResponse>(res);

  const sanitizeNumber = (value: unknown): number => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 0;
  };

  const sanitizeNullableNumber = (value: unknown): number | null => {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  };

  const months = Array.isArray(data.months)
    ? data.months.map(month => ({
        monthStart: typeof month.monthStart === "string" ? month.monthStart.trim() : "",
        hours: sanitizeNumber(month.hours),
        cost: sanitizeNumber(month.cost),
        cumulativeHours: sanitizeNumber(month.cumulativeHours),
        cumulativeCost: sanitizeNumber(month.cumulativeCost),
        burnRatio: sanitizeNullableNumber(month.burnRatio),
      }))
    : [];

  const meta = data.meta
    ? {
        budget: sanitizeNullableNumber(data.meta.budget),
        budgetFrom: data.meta.budgetFrom ?? null,
        budgetTo: data.meta.budgetTo ?? null,
        hourlyRate: sanitizeNullableNumber(data.meta.hourlyRate),
      }
    : null;

  return {
    meta,
    totalHours: sanitizeNumber(data.totalHours),
    totalCost: sanitizeNumber(data.totalCost),
    months,
  };
}

// (Legacy project-specific) Not used now, kept for compatibility
export async function syncIssues(projectId: number, full: boolean): Promise<SyncSummary> {
  const res = await fetch(`${API_BASE}/api/sync/projects/${projectId}/issues?full=${full}`, { method: "POST" });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<SyncSummary>(res);
}

export async function syncAll(projectId: number, full: boolean, since?: string): Promise<AllResult> {
  const qs = new URLSearchParams();
  qs.set("full", String(full));
  if (since) qs.set("since", since);
  const res = await fetch(`${API_BASE}/api/sync/projects/${projectId}/all?${qs.toString()}`, { method: "POST" });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<AllResult>(res);
}

// New global syncs (no project selection)
export async function syncIssuesAll(
  full: boolean,
  assignedOnly: boolean,
  onProgress?: (processed: number, total: number) => void,
): Promise<SyncSummary> {
  const started = await startIssuesAsync(full, assignedOnly);
  return waitForJob(started.jobId, 2000, 60 * 60 * 1000, onProgress);
}

export async function syncAllGlobal(full: boolean, assignedOnly: boolean, since?: string): Promise<AllResult> {
  const qs = new URLSearchParams();
  qs.set("full", String(full));
  qs.set("assignedOnly", String(assignedOnly));
  if (since) qs.set("since", since);
  const res = await fetch(`${API_BASE}/api/sync/all?${qs.toString()}`, { method: "POST" });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<AllResult>(res);
}

export async function syncReportsAll(payload: GlobalReportSyncPayload = {}): Promise<SyncSummary> {
  const hasBody = Object.keys(payload).length > 0;
  const res = await fetch(`${API_BASE}/api/sync/reports`, {
    method: "POST",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<SyncSummary>(res);
}

// ----- Async jobs (issues) -----
export type StartJobResponse = { jobId: string };
export type JobStatusResponse = {
  jobId: string;
  status: "RUNNING" | "DONE" | "ERROR";
  result?: SyncSummary;
  error?: { code: string; message: string };
  totalRepos?: number;
  processedRepos?: number;
  currentRepoId?: number;
};

export async function startIssuesAsync(full: boolean, assignedOnly: boolean): Promise<StartJobResponse> {
  const params = new URLSearchParams();
  params.set("full", String(full));
  params.set("assignedOnly", String(assignedOnly));
  const res = await fetch(`${API_BASE}/api/sync/issues/async?${params.toString()}`, { method: "POST" });
  // Backend returns 202 Accepted for job start
  if (res.status !== 202 && !res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<StartJobResponse>(res);
}

export async function getJob(jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`${API_BASE}/api/sync/jobs/${jobId}`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<JobStatusResponse>(res);
}

async function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function waitForJob(
  jobId: string,
  pollMs = 2000,
  maxMs = 60 * 60 * 1000,
  onProgress?: (processed: number, total: number) => void,
): Promise<SyncSummary> {
  const start = Date.now();
  while (true) {
    const st = await getJob(jobId);
    if (onProgress && typeof st.processedRepos === 'number' && typeof st.totalRepos === 'number') {
      onProgress(st.processedRepos, st.totalRepos);
    }
    if (st.status === "DONE" && st.result) return st.result;
    if (st.status === "ERROR") {
      const err = { error: { code: st.error?.code || "UNKNOWN", message: st.error?.message || "Job selhal.", httpStatus: 500 } } as ErrorResponse;
      throw err;
    }
    if (Date.now() - start > maxMs) {
      throw { error: { code: "TIMEOUT", message: "Timeout waiting for job completion.", httpStatus: 504 } } as ErrorResponse;
    }
    await delay(pollMs);
  }
}

/**
 * Fetches a paginated list of interns with optional search parameters.
 */
export async function listInterns(params: InternListParams = {}): Promise<InternListResult> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q.trim());
  if (params.username) qs.set("username", params.username.trim());
  if (typeof params.page === "number") qs.set("page", String(params.page));
  if (typeof params.size === "number") qs.set("size", String(params.size));
  if (params.sort) qs.set("sort", params.sort);
  const query = qs.toString();
  const res = await fetch(`${API_BASE}/api/interns${query ? `?${query}` : ""}`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<InternListResponseDTO>(res);
  return {
    content: data.content.map(mapIntern),
    page: data.page,
    size: data.size,
    totalElements: data.total_elements,
    totalPages: data.total_pages,
  };
}

/**
 * Fetches all interns by iterating through paginated results while respecting the backend page size limit.
 */
export async function listAllInterns(sort: string = "last_name,asc"): Promise<Intern[]> {
  const PAGE_SIZE = 100;
  const firstPage = await listInterns({ page: 0, size: PAGE_SIZE, sort });
  if (firstPage.totalPages <= 1) {
    return firstPage.content;
  }

  const byId = new Map<number, Intern>();
  firstPage.content.forEach(intern => byId.set(intern.id, intern));

  for (let page = 1; page < firstPage.totalPages; page += 1) {
    const nextPage = await listInterns({ page, size: PAGE_SIZE, sort });
    nextPage.content.forEach(intern => byId.set(intern.id, intern));
  }

  return Array.from(byId.values());
}

/**
 * Loads the full overview including total tracked hours for each intern.
 */
export async function listInternOverview(): Promise<InternOverview[]> {
  const res = await fetch(`${API_BASE}/api/interns/overview`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<InternOverviewDTO[]>(res);
  return data.map(mapInternOverview);
}

/**
 * Loads the month-bucketed workload for all interns within the provided inclusive date range.
 */
export async function getInternMonthlyHours(from: string, to: string): Promise<InternMonthlyHoursRow[]> {
  const params = new URLSearchParams();
  params.set("from", from);
  params.set("to", to);
  const res = await fetch(`${API_BASE}/api/interns/monthly-hours?${params.toString()}`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<InternMonthlyHoursRowDTO[]>(res);
  return data.map(mapInternMonthlyHoursRow);
}

export async function getInternPerformance(
  params: InternPerformanceParams = {},
): Promise<InternPerformanceResponse> {
  const searchParams = new URLSearchParams();
  if (params.period) searchParams.set('period', params.period);
  if (typeof params.periods === 'number') searchParams.set('periods', String(params.periods));
  (params.internIds ?? []).forEach(id => searchParams.append('internId', String(id)));
  (params.groupIds ?? []).forEach(id => searchParams.append('groupId', String(id)));
  const query = searchParams.toString();
  const res = await fetch(`${API_BASE}/api/interns/performance${query ? `?${query}` : ''}`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<InternPerformanceResponseDTO>(res);
  return {
    buckets: data.buckets.map(bucket => ({ ...bucket })),
    interns: data.interns.map(mapInternPerformanceRow),
  };
}

/**
 * Loads a single intern overview enriched with project allocations.
 */
export async function getInternOverviewDetail(id: number): Promise<InternDetail> {
  const res = await fetch(`${API_BASE}/api/interns/${id}/detail`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<InternDetailDTO>(res);
  return mapInternDetail(data);
}

/**
 * Načte dostupné statusy stážistů pro formulářové ovladače.
 */
export async function listInternStatuses(): Promise<InternStatusOption[]> {
  const res = await fetch(`${API_BASE}/api/intern-statuses`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<InternStatusOptionDTO[]>(res);
  // Technický komentář: Katalog statusů není třeba transformovat, pouze zachováváme pořadí dle závažnosti.
  return data.map(item => ({ code: item.code, label: item.label, severity: item.severity }));
}

/**
 * Vrací chronologickou historii statusů pro konkrétního stážistu.
 */
export async function getInternStatusHistory(id: number): Promise<InternStatusHistoryEntry[]> {
  const res = await fetch(`${API_BASE}/api/interns/${id}/status/history`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<InternStatusHistoryEntryDTO[]>(res);
  return data.map(mapInternStatusHistoryEntry);
}

/**
 * Odesílá změnu statusu daného stážisty a vrací aktualizovaný objekt.
 */
export async function updateInternStatus(
  id: number,
  payload: UpdateInternStatusPayload,
): Promise<Intern> {
  const body = {
    status_code: payload.statusCode,
    valid_from: payload.validFrom ?? null,
  };
  const res = await fetch(`${API_BASE}/api/interns/${id}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<InternDTO>(res);
  return mapIntern(data);
}

/**
 * Creates a new intern with the provided payload.
 */
export async function createIntern(payload: InternPayload): Promise<Intern> {
  const res = await fetch(`${API_BASE}/api/interns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(prepareInternBody(payload)),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<InternDTO>(res);
  return mapIntern(data);
}

/**
 * Updates an existing intern identified by id.
 */
export async function updateIntern(id: number, payload: InternPayload): Promise<Intern> {
  const res = await fetch(`${API_BASE}/api/interns/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(prepareInternBody(payload)),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<InternDTO>(res);
  return mapIntern(data);
}

function mapInternLevelHistoryEntry(dto: InternLevelHistoryEntryDTO): InternLevelHistoryEntry {
  return {
    id: dto.id,
    levelId: dto.level_id,
    levelCode: dto.level_code,
    levelLabel: dto.level_label,
    validFrom: dto.valid_from,
    validTo: dto.valid_to,
  };
}

export async function getInternLevelHistory(id: number): Promise<InternLevelHistoryEntry[]> {
  const res = await fetch(`${API_BASE}/api/interns/${id}/levels/history`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<InternLevelHistoryEntryDTO[]>(res);
  return data.map(mapInternLevelHistoryEntry);
}

/**
 * Deletes an intern.
 */
export async function deleteIntern(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/interns/${id}`, { method: "DELETE" });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
}


