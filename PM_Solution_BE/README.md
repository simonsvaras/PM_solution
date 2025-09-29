PM_Solution_BE - GitLab Issue Sync & Intern Registry
====================================================

Overview
--------
- Synchronises GitLab projects/issues into a local PostgreSQL database on demand.
- Manages local projects, their repository assignments and intern allocations (levels + groups).
- Provides REST endpoints for the React frontend used in the PM Solution suite.

Running locally
---------------
1. Start Postgres (uses docker-compose in repo root):
   ```bash
   docker compose -f docker-compose.yml up -d db
   ```
2. Provide required environment variables (see `.env.example` or set process vars):
   - `GITLAB_API` (default `https://gitlab.fel.cvut.cz/api/v4`)
   - `GITLAB_TOKEN` (`read_api` scope)
   - `GITLAB_GROUP_ID` (numeric group id for repository sync)
3. Launch Spring Boot:
   ```bash
   ./gradlew bootRun      # Linux/macOS
   gradlew.bat bootRun    # Windows
   ```

Key REST endpoints
------------------
### Synchronisation
- `POST /api/sync/repositories` – sync repositories for the configured GitLab group.
- `POST /api/sync/all?full={bool}&since={timestamp?}` – sync all issues globally.
- `POST /api/sync/projects/{projectId}/repositories` – sync a single project.
- `POST /api/sync/projects/{projectId}/issues?full={bool}` – sync issues for one project.
- `GET /api/projects/{projectId}/reports/detail?from={iso?}&to={iso?}&internUsername={username?}` – aggregated timelog hours per
  issue/intern for the project's repositories within the optional time range. Passing `internUsername` narrows the aggregation to a
  single intern while still returning the complete list of assigned members for UI filters.
- `DELETE /api/sync/reports?projectId=1&projectId=2` – trvale odstraní uložené výkazy. Bez parametrů smaže vše, s opakovaným `projectId` zlikviduje jen záznamy repozitářů přiřazených k vybraným projektům. Volání vrací `{ "deleted": <počet_záznamů> }`.

### Local project management
- `GET /api/projects` – list local projects (id, gitlabProjectId, name, budget, budgetFrom, budgetTo).
- `POST /api/projects` – create/link a local project.
- `PUT /api/projects/{id}` – update name + optional `budget`, `budget_from`, `budget_to` (dates in ISO form, `budget` ≥ 0).
- `DELETE /api/projects/{id}` – remove a project.
- `GET /api/projects/{id}/repositories` / `PUT /api/projects/{id}/repositories` – manage repository assignments.
- `GET /api/projects/{id}/interns` – list assignable interns including `workloadHours` for already assigned members.
- `PUT /api/projects/{id}/interns` – replace intern assignments with payload `{ "interns": [{ "internId": 1, "workloadHours": 20.5, "includeInReportedCost": true }] }` where `workloadHours` is nullable (project allocation in hours) and `includeInReportedCost` toggles whether the intern's reported costs count towards the project's cached `reported_cost`.
- When `includeInReportedCost` changes, the cached `project.reported_cost` is refreshed automatically so totals in the UI stay in sync with the toggle.

### Intern registry
- `GET /api/interns/overview` – non-paginated overview of all interns including aggregated tracked hours.
- `GET /api/interns/{id}/detail` – overview for a single intern with project workload allocations.
- `GET /api/levels` – list level reference data (id, code, label).
- `GET /api/groups` – list intern groups (id, code, label).
- `GET /api/interns` – paginated intern list (`q`, `username`, `page`, `size`, `sort`).
- `GET /api/interns/{id}` – intern detail.
- `POST /api/interns` – create intern (`first_name`, `last_name`, `username`, `group_ids`, `level_history` – list of `{ level_id, valid_from, valid_to? }`, one entry must be open with `valid_to = null`).
- `PUT /api/interns/{id}` – update intern (same payload, replaces full history and current level).
- `GET /api/interns/{id}/levels/history` – list the full level history for a given intern (used by FE modal).
- `DELETE /api/interns/{id}` – delete intern.

Standard error contract
-----------------------
All errors return the common body:
```json
{
  "error": {
    "code": "VALIDATION|CONFLICT|NOT_FOUND|...",
    "message": "Human friendly explanation",
    "details": "optional machine hint",
    "httpStatus": 400,
    "requestId": "optional"
  }
}
```

Database migrations
-------------------
Flyway migrations are located in `src/main/resources/db/migration`:
- `V1__init.sql` – base schema (project, repository, intern, report, ...).
- `V2__gitlab_sync.sql` – GitLab sync cursors + project IDs.
- `V3__repository_m2m.sql`, `V4__issues_without_project.sql` – sync refinements.
- `V5__intern_level_group_updates.sql` – converts `group.code` to integer, adds `intern.level_id`, backfills `intern_level_history` and leaves `level_id` `NOT NULL`. Ensure at least one level exists before running.
- `V6__project_budget_and_intern_workload.sql` – adds project budget columns (`budget`, `budget_from`, `budget_to`) and workload (`workload_hours`) for the `intern_project` junction table.
- `V7__rename_uvazek_to_workload_hours.sql` – renames the intern workload column to `workload_hours` for clarity.
- `V15__intern_project_reported_cost_flag.sql` – adds `intern_project.include_in_reported_cost`, wiring the flag into the cached project `reported_cost` calculation and refreshing triggers.
- `V10__report_username_nullable.sql` – povolí `NULL` v `report.username`, aby smazání stážisty pouze odpojilo jeho reporty.
- `V11__report_username_nullable.sql` – opětovně aplikuje `ALTER TABLE report ALTER COLUMN username DROP NOT NULL;` pro instance, které migrovaly z verze bez předchozí opravy.

Logging & observability
-----------------------
- Sync operations log start/end, counts and duration.
- HTTP clients attach GitLab `X-Request-Id` to warn logs when available.
- Unexpected exceptions are logged by `GlobalExceptionHandler`.

Testing
-------
Run the full suite via `./gradlew test`. Unit coverage includes intern service logic and migration-safe H2 profile configuration.
