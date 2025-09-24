PM_Solution_BE - GitLab Issue Sync (MVP)

Overview
- Syncs GitLab issues from GitLab into a local Postgres DB on demand.
- Projects and their repository mappings are managed purely in the application (UI/BE), not via GitLab sync.
- System notes/worklogs are out of scope; no GitLab notes API calls are performed.

Run
- Start DB: `docker compose -f docker-compose.yml up -d`
- Env vars: set at process level or `.env` (export before `bootRun`)
  - `GITLAB_API` default `https://gitlab.fel.cvut.cz/api/v4`
  - `GITLAB_TOKEN` required, scope `read_api`
  - `GITLAB_GROUP_ID` required for repositories group sync (numeric GitLab group id for CZM)
  - `GITLAB_TIMEOUT_MS` default `10000`
  - `GITLAB_RETRY_MAX` default `3`
  - `GITLAB_RETRY_BACKOFF_MS` default `500`
  - `GITLAB_PER_PAGE` default `100`
- App: `./gradlew bootRun` (Windows: `gradlew.bat bootRun`)

OpenAPI
- Swagger UI: `http://localhost:8081/swagger-ui.html`
- JSON: `http://localhost:8081/v3/api-docs`

Endpoints
- GET `/api/projects` — list local projects (id, gitlabProjectId, name) for UI selection
- POST `/api/sync/repositories`
  - Syncs repositories for all GitLab projects in configured group (`gitlab.groupId`).
  - Upserts only for local projects present in DB (matched by `project.gitlab_project_id`), others are counted as skipped.
  - Response: `{ "fetched": n, "inserted": n, "updated": n, "skipped": n, "pages": n, "durationMs": n }`
- POST `/api/sync/projects/{projectId}/repositories`
  - Fetches GitLab project metadata and upserts the root repository into the `repository` table.
  - Response: `{ "fetched": 1, "inserted": n, "updated": n, "skipped": 0, "pages": 0, "durationMs": n }`
- POST `/api/sync/projects/{projectId}/issues?full={true|false}`
  - `full=false` (default) -> incremental: adds `updated_after=<cursor>`.
  - Upserts by `(project_id, iid)` and sets cursor on success.
  - Response: `{ "fetched": n, "inserted": n, "updated": n, "skipped": 0, "pages": n, "durationMs": n }`
- POST `/api/sync/projects/{projectId}/all?full={true|false}`
  - Aggregates only issue sync.
  - Rejects any `projects`/`notes` query parameters with 400.
  - Response example: `{ "issues": {"status":"OK", "fetched": 10, ...}, "durationMs": 3200 }`

Deprecated/removed
- POST `/api/sync/projects` — deprecated, returns 400 `Synchronizace projektu ani notes neni podporovana...`
- `/api/sync/projects/{projectId}/notes` — removed, returns 400.
- `/api/sync/projects/{projectId}/issues/{iid}/notes` — removed, returns 400.

Database
- Flyway migrations: `src/main/resources/db/migration`
  - `V1__init.sql` core schema (project, repository, issue, report, etc.)
  - `V2__gitlab_sync.sql` adds `project.gitlab_project_id`, `sync_cursor` (issues only), and report uniqueness for dedupe

Error semantics
- 400: invalid input (project missing locally, disallowed sync combination, removed endpoint)
- 404: not found in GitLab
- 503: rate limited after retries
- 502: upstream GitLab failure (5xx)

Standard error contract
```
{ "error": { "code": "...", "message": "...", "details": "...", "httpStatus": 503, "requestId": "abc-123" } }
```

Logging
- Start/end of each issue sync with parameters, pages processed, and counters.
- 429/5xx logs include GitLab `X-Request-Id` when available.
- Token is only sent via `PRIVATE-TOKEN` header and never logged.

Project management (local)
- POST `/api/projects` — creates/links a local project; body: `{ "gitlabProjectId": 123, "name": "My Project" }`
- PUT `/api/projects/{id}` — updates the project name; body: `{ "name": "New name" }`

Terminology note
- GitLab API uses the term "projects". In our app, these are treated as repositories and persisted into table `repository`.
- The relation between local `project` and `repository` is many-to-many via the junction table `projects_to_repositorie`.
- Group repositories sync inserts/updates repository rows even if there is no local project yet; linking to projects is managed later in the UI.

Project management (local)
- POST `/api/projects` — creates/links a local project; body: `{ "gitlabProjectId": 123, "name": "My Project" }`
- PUT `/api/projects/{id}` — updates the project name; body: `{ "name": "New name" }`

Terminology note
- GitLab API uses the term "projects". In our app, these are treated as repositories and persisted into table `repository`. Each repository row is linked to a local `project` (foreign key `repository.project_id`). To insert repositories from a group sync, a local project with matching `gitlab_project_id` must already exist; otherwise the repository is skipped.
