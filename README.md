PM Solution — Docker Compose

Run the whole stack (DB + Backend + Frontend) with one command.

Prerequisites
- Docker and Docker Compose v2
- GitLab token with `read_api` scope

Quick start
1) Create `.env` in repo root with your token (and optional overrides):

   GITLAB_TOKEN=your_token_here
   # GITLAB_API=https://gitlab.fel.cvut.cz/api/v4

2) Build and run all services:

   docker compose up --build

Services
- Postgres: localhost:5432 (db=issueviz, user=issueviz, pass=issueviz)
 - Backend (Spring Boot): localhost:8081
- Frontend (Nginx): localhost:5173

Notes
- Frontend proxies `/api/*` to backend inside the compose network (to port 8081), so no CORS is needed in Docker.
- For local dev outside Docker, frontend uses `VITE_API_BASE_URL` from `pm_solution_fe/.env` (defaults to same-origin if unset).

## Report synchronisation

The report module now provides an overview of all projects and a detailed page for each project:

- **Overview (`/reports`)** lists every project using `SimpleProjectCard` tiles. Selecting a tile opens the project report detail.
- **Project detail** shows the number of open issues and exposes a "Synchronizovat výkazy" button. Users can either synchronise from the last stored timelog or supply a custom time range. The UI disables manual date inputs when "Synchronizovat data jen od poslední synchronizace" is ticked to prevent conflicting filters.

Each synchronisation triggers the backend endpoint `POST /api/sync/projects/{projectId}/reports`. The request body is optional and accepts:

| Field | Type | Description |
| --- | --- | --- |
| `sinceLast` | boolean | When `true`, the backend resumes from the most recent `report.spent_at` value. |
| `from` | ISO-8601 string | Optional lower bound for `spent_at` when `sinceLast` is `false`. |
| `to` | ISO-8601 string | Optional upper bound for `spent_at`, defaults to the current time. |

The backend deduplicates entries with an `ON CONFLICT` clause on `(repository_id, iid, username, spent_at, time_spent_seconds)` and reports usernames that do not exist in the `intern` table so the UI can inform operators.

### API reference

Swagger UI is available at `http://localhost:8081/swagger-ui/index.html` when the backend is running. The documentation now includes the detailed description of the report synchronisation endpoint together with request/response schemas.
