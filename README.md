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

Projektové reporty jsou dostupné přímo z modulu **Projekty → Přehled projektů**:

- **Souhrn projektu** otevřete z dlaždice projektu přes odkaz „Zobrazit detail“. Stránka ukazuje základní statistiky a umožňuje spustit synchronizaci výkazů pro zvolené období.
- **Detailní report** nabízí přepínače pro jednotlivé sekce (obecný přehled, detail stážisty a detail projektu). Mezi sekcemi lze přecházet bez opuštění modulu „Projekty“.
- **On-demand maintenance** (Synchronizace → On-demand) now contains a red "Smazat všechny reporty" panel. The action requires a confirmation dialog and calls `DELETE /api/sync/reports`, which permanently removes every row from the `report` table. Use it to reset the database before a full re-import.
- **Synchronizace → Přehled reportů** nabízí tabulku všech uložených výkazů. Filtry „od“ a „do“ jsou předvyplněny podle vykazovacího období a můžete je kdykoliv upravit, než stisknete tlačítko „Získat“ pro načtení dat.

Each synchronisation triggers the backend endpoint `POST /api/sync/projects/{projectId}/reports`. The request body is optional and accepts:

| Field | Type | Description |
| --- | --- | --- |
| `sinceLast` | boolean | When `true`, the backend resumes from the most recent `report.spent_at` value. |
| `from` | ISO-8601 string | Optional lower bound for `spent_at` when `sinceLast` is `false`. |
| `to` | ISO-8601 string | Optional upper bound for `spent_at`, defaults to the current time. |

The backend deduplicates entries with an `ON CONFLICT` clause on `(repository_id, iid, username, spent_at, time_spent_seconds)` and reports usernames that do not exist in the `intern` table so the UI can inform operators. If an intern account is deleted, Flyway migration `V11__report_username_nullable.sql` keeps the referential integrity intact by allowing `report.username` to be set to `NULL` so the `ON DELETE SET NULL` rule can run before the maintenance purge.

### Projektové sazby

- Projekty mají nový příznak `project.is_external` (výchozí `FALSE`). Pouze externí projekty mohou uchovávat projektovou hodinovou sazbu (`project.hourly_rate_czk`).
- REST API rozšiřuje DTO o pole `isExternal`. Pokud je hodnota `false` nebo chybí, backend sazbu ignoruje a uloží `NULL`. Pokus o nastavení sazby pro interní projekt skončí validační chybou.
- Přepočty výkazů a cache (`project.reported_cost`) používají projektovou sazbu pouze tehdy, když je projekt označen jako externí.

### API reference

Swagger UI is available at `http://localhost:8081/swagger-ui/index.html` when the backend is running. The documentation now includes the detailed description of the report synchronisation endpoint together with request/response schemas.
