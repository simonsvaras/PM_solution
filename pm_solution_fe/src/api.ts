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

export type ProjectDTO = {
  id: number;
  gitlabProjectId: number | null;
  name: string;
  budget: number | null;
  budgetFrom: string | null;
  budgetTo: string | null;
  reportedCost: number;
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
};
export type ProjectBudgetPayload = {
  name: string;
  budget?: number | null;
  budgetFrom?: string | null;
  budgetTo?: string | null;
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
export type Intern = { id: number; firstName: string; lastName: string; username: string; levelId: number; levelLabel: string; groups: InternGroup[] };
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
  groups: InternGroup[];
  totalHours: number;
};
export type InternProjectAllocationDTO = { project_id: number; project_name: string; workload_hours: number | string | null };
export type InternProjectAllocation = { projectId: number; projectName: string; workloadHours: number | null };
export type InternDetailDTO = InternOverviewDTO & { projects: InternProjectAllocationDTO[] };
export type InternDetail = InternOverview & { projects: InternProjectAllocation[] };

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
  internHours: ProjectReportDetailIssueCell[];
};

export type ProjectReportDetailResponse = {
  interns: ProjectReportDetailIntern[];
  issues: ProjectReportDetailIssue[];
};

export type ProjectReportDetailParams = {
  from?: string;
  to?: string;
  internUsername?: string;
};


function mapIntern(dto: InternDTO): Intern {
  const groups = (dto.groups ?? []).map(g => ({ id: g.id, code: g.code, label: g.label }));
  return {
    id: dto.id,
    firstName: dto.first_name,
    lastName: dto.last_name,
    username: dto.username,
    levelId: dto.level_id,
    levelLabel: dto.level_label,
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

function mapInternOverview(dto: InternOverviewDTO): InternOverview {
  const groups = (dto.groups ?? []).map(g => ({ id: g.id, code: g.code, label: g.label }));
  const totalHoursRaw = parseNumber(dto.total_hours);
  return {
    id: dto.id,
    firstName: dto.first_name,
    lastName: dto.last_name,
    username: dto.username,
    levelId: dto.level_id,
    levelLabel: dto.level_label,
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
  };
}

function mapInternDetail(dto: InternDetailDTO): InternDetail {
  const overview = mapInternOverview(dto);
  return {
    ...overview,
    projects: (dto.projects ?? []).map(mapInternProjectAllocation),
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

export async function getProjects(): Promise<ProjectDTO[]> {
  const res = await fetch(`${API_BASE}/api/projects`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectDTO[]>(res);
}

export async function getProjectsOverview(): Promise<ProjectOverviewDTO[]> {
  const res = await fetch(`${API_BASE}/api/projects/overview`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectOverviewDTO[]>(res);
}

export async function getReportTeams(): Promise<TeamReportTeam[]> {
  const res = await fetch(`${API_BASE}/api/reports/teams`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<TeamReportTeamDTO[]>(res);
  return data.map(mapTeamReportTeam);
}

export async function createProjectByName(payload: ProjectBudgetPayload): Promise<ProjectDTO> {
  const res = await fetch(`${API_BASE}/api/projects/by-name`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectDTO>(res);
}

export async function updateProject(id: number, payload: ProjectBudgetPayload): Promise<ProjectDTO> {
  const res = await fetch(`${API_BASE}/api/projects/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
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

export async function getProjectInterns(projectId: number, search?: string): Promise<ProjectInternAssignmentDTO[]> {
  const qs = new URLSearchParams();
  if (search && search.trim()) qs.set('search', search.trim());
  const url = `${API_BASE}/api/projects/${projectId}/interns${qs.toString() ? `?${qs.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectInternAssignmentDTO[]>(res);
}

export type ProjectInternUpdatePayload = { internId: number; workloadHours: number | null };

export async function updateProjectInterns(projectId: number, interns: ProjectInternUpdatePayload[]): Promise<void> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/interns`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ interns }),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
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
  return parseJson<ProjectReportDetailResponse>(res);
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
 * Loads the full overview including total tracked hours for each intern.
 */
export async function listInternOverview(): Promise<InternOverview[]> {
  const res = await fetch(`${API_BASE}/api/interns/overview`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  const data = await parseJson<InternOverviewDTO[]>(res);
  return data.map(mapInternOverview);
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


