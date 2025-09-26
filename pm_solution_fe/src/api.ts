// Default to same-origin (nginx proxies /api -> backend in docker)
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export type SyncSummary = {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  pages: number;
  durationMs: number;
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

export type ProjectDTO = {
  id: number;
  gitlabProjectId: number | null;
  name: string;
  budget: number | null;
  budgetFrom: string | null;
  budgetTo: string | null;
};
export type ProjectOverviewDTO = {
  id: number;
  name: string;
  budget: number | null;
  budgetFrom: string | null;
  budgetTo: string | null;
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
export type InternPayload = { firstName: string; lastName: string; username: string; levelId: number; groupIds: number[] };
export type InternGroupDTO = { id: number; code: number; label: string };
export type LevelOption = { id: number; code: string; label: string };
export type GroupOption = { id: number; code: number; label: string };
export type InternListParams = { q?: string; username?: string; page?: number; size?: number; sort?: string };

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
  return {
    first_name: payload.firstName.trim(),
    last_name: payload.lastName.trim(),
    username: payload.username.trim(),
    level_id: payload.levelId,
    group_ids: payload.groupIds,
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

/**
 * Deletes an intern.
 */
export async function deleteIntern(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/interns/${id}`, { method: "DELETE" });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
}


