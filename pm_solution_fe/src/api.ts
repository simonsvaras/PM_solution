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

export type ProjectDTO = { id: number; gitlabProjectId: number | null; name: string };
export type RepositoryAssignmentDTO = {
  id: number;
  gitlabRepoId: number | null;
  name: string;
  nameWithNamespace: string;
  assigned: boolean;
};

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

export async function createProjectByName(name: string): Promise<ProjectDTO> {
  const res = await fetch(`${API_BASE}/api/projects/by-name`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectDTO>(res);
}

export async function updateProjectName(id: number, name: string): Promise<ProjectDTO> {
  const res = await fetch(`${API_BASE}/api/projects/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectDTO>(res);
}

export async function deleteProject(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
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
export async function syncIssuesAll(full: boolean, onProgress?: (processed: number, total: number) => void): Promise<SyncSummary> {
  const started = await startIssuesAsync(full);
  return waitForJob(started.jobId, 2000, 60 * 60 * 1000, onProgress);
}

export async function syncAllGlobal(full: boolean, since?: string): Promise<AllResult> {
  const qs = new URLSearchParams();
  qs.set("full", String(full));
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

export async function startIssuesAsync(full: boolean): Promise<StartJobResponse> {
  const res = await fetch(`${API_BASE}/api/sync/issues/async?full=${full}`, { method: "POST" });
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
