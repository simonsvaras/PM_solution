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
  projects: StepAggregate;
  issues: StepAggregate;
  notes: StepAggregate;
  durationMs: number;
};

export type ProjectDTO = { id: number; gitlabProjectId: number; name: string };

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try { return JSON.parse(text) as T; } catch {
    throw { error: { code: "INVALID_JSON", message: "Neplatná odpověď serveru.", details: text, httpStatus: res.status } } as ErrorResponse;
  }
}

export async function getProjects(): Promise<ProjectDTO[]> {
  const res = await fetch(`${API_BASE}/api/projects`);
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<ProjectDTO[]>(res);
}

export async function syncProjects(): Promise<SyncSummary> {
  const res = await fetch(`${API_BASE}/api/sync/projects`, { method: "POST" });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<SyncSummary>(res);
}

export async function syncIssues(projectId: number, full: boolean): Promise<SyncSummary> {
  const res = await fetch(`${API_BASE}/api/sync/projects/${projectId}/issues?full=${full}`, { method: "POST" });
  if (!res.ok) throw await parseJson<ErrorResponse>(res);
  return parseJson<SyncSummary>(res);
}

export async function syncNotes(projectId: number, since?: string): Promise<SyncSummary> {
  const qs = new URLSearchParams();
  if (since) qs.set("since", since);
  const res = await fetch(`${API_BASE}/api/sync/projects/${projectId}/notes${qs.toString() ? `?${qs.toString()}` : ""}`, { method: "POST" });
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
