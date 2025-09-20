PM_Solution_BE — GitLab On‑Demand Sync (MVP)

Overview
- Syncs GitLab projects, issues and system notes (time spent) into a local Postgres DB on demand.
- Provides 4 idempotent endpoints returning a concise JSON summary of the sync run.
- Supports pagination (per_page=100), simple retries/backoff for 429/5xx, and incremental cursors.

Run
- Start DB: `docker compose -f docker-compose.yml up -d`
- Env vars: set at process level or `.env` (export before `bootRun`)
  - `GITLAB_API` default `https://gitlab.fel.cvut.cz/api/v4`
  - `GITLAB_TOKEN` required, scope `read_api`
  - `GITLAB_TIMEOUT_MS` default `10000`
  - `GITLAB_RETRY_MAX` default `3`
  - `GITLAB_RETRY_BACKOFF_MS` default `500`
  - `GITLAB_PER_PAGE` default `100`
- App: `./gradlew bootRun` (Windows: `gradlew.bat bootRun`)

OpenAPI
- Swagger UI: `http://localhost:8081/swagger-ui.html`
- JSON: `http://localhost:8081/v3/api-docs`

Endpoints
- GET `/api/projects` → list local projects (id, gitlabProjectId, name) for FE select
- POST `/api/sync/projects`
  - Body (optional): `{ "projectIds": [123, 456] }`
  - Upserts projects and their 1:1 repositories (root_repo=true).
  - Response: `{ "fetched": n, "inserted": n, "updated": n, "skipped": n, "pages": n }`

- POST `/api/sync/projects/{projectId}/issues?full={true|false}`
  - `full=false` (default) → incremental: adds `updated_after=<cursor>`.
  - Upserts by `(project_id, iid)` and sets cursor on success.
  - Response: `{ "fetched": n, "inserted": n, "updated": n, "skipped": 0, "pages": n }`

- POST `/api/sync/projects/{projectId}/notes?since=ISO8601`
  - Fetches system notes for all issues in the project; if `since` omitted uses cursor.
  - Parses "added/subtracted … of time spent" and stores in `report`.
  - Response: `{ "fetched": n, "inserted": n, "updated": 0, "skipped": n, "pages": n }`

- POST `/api/sync/projects/{projectId}/issues/{iid}/notes?since=ISO8601`
  - Same as above but for a single issue.
  - Response: `{ "fetched": n, "inserted": n, "updated": 0, "skipped": n, "pages": n, "durationMs": n }`

- POST `/api/sync/projects/{projectId}/all?full={true|false}&since=ISO8601`
  - MVP aggregates Issues → Notes; returns 200 even with per-step errors
  - Response example:
    `{ "projects": {"status":"SKIPPED"}, "issues": {"status":"OK", "fetched": 10, ...}, "notes": {"status":"ERROR", "error": {"code":"RATE_LIMITED", ...}}, "durationMs": 3200 }`

Database
- Flyway migrations: `src/main/resources/db/migration`
  - `V1__init.sql` core schema (project, repository, issue, report, etc.)
  - `V2__gitlab_sync.sql` adds `project.gitlab_project_id`, `sync_cursor`, and report uniqueness for dedupe

Error semantics
- 400: invalid input (e.g., syncing issues/notes for a project not present locally)
- 404: not found in GitLab
- 503: rate limited after retries
- 502: upstream GitLab failure (5xx)

Standard error contract
```
{ "error": { "code": "...", "message": "...", "details": "...", "httpStatus": 503, "requestId": "abc-123" } }
```

Logging
- Start/end of each sync with parameters, pages processed, and counters.
- 429/5xx logs include GitLab `X-Request-Id` when available.
- Token is only sent via `PRIVATE-TOKEN` header and never logged.

Notes
- In MVP `assignee_username` uses first assignee only.
- `report` dedupe key (MVP): `(project_id, iid, username, spent_at, time_spent_seconds)`.
- Run `POST /api/sync/projects` before issues/notes so the local project exists.
