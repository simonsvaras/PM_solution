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
- **Detail projektu** nyní obsahuje přehled issues s možností filtrovat podle stavu, priority a týmu. Nové radio filtry „Priority“ a „Tým“ pracují nad GitLab štítky ve formátu `Priority: Hodnota` a `Team: Hodnota`.
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

### Výpočet vykázaných nákladů

Výkazy uložené v tabulce `report` se do jednotlivých přehledů i do cache projektu (`project.reported_cost`) promítají jednotným SQL výrazem, který je znovu definovaný ve funkci `compute_project_report_cost` a sdílený metodami `SyncDao.listProjectReportDetail` a `SyncDao.listProjectMonthlyReport`.

- **Vazba na projekt:** Každý výkaz se mapuje přes tabulku `projects_to_repositorie` na konkrétní projekt. Stejný vztah používají i detailní reporty.
- **Použitá sazba:** Pokud má projekt nastavenou `hourly_rate_czk` a je označen jako externí, náklady se počítají podle ní. V opačném případě se použije hodinová sazba uložená přímo u výkazu (`report.hourly_rate_czk`).
- **Stážista není v týmu:** Pokud k výkazu neexistuje vazba v `intern_project`, výraz `ip.project_id IS NULL` vrací `TRUE` a náklady se plně započítají. Tím je splněno pravidlo, že vykázaná práce stážisty mimo tým se má do nákladů zahrnout.
- **Příznak `include_in_reported_cost`:**
  - Pokud má stážista příznak `TRUE`, nebo pokud příznak není nastaven, náklady se počítají vždy.
  - Pokud je příznak `FALSE`, SQL ještě kontroluje historii úrovní stážisty (`intern_level_history` → `level`). Vyloučení z nákladů nastane pouze pro řádky, kde výkaz časově spadá do období, kdy má stážista úroveň `employee` (porovnává se `report.spent_at::date` s intervalem `valid_from`/`valid_to`).
  - Výkazy před datem, kdy se stážista stal zaměstnancem, zůstávají v nákladech započítané, i když je příznak `include_in_reported_cost = FALSE`. Jakmile období úrovně `employee` začne, nové výkazy s tímto příznakem se do nákladů nezahrnují (výraz vrací `0`).
- **Časová omezení projektu:** Všechny výpočty respektují případně nastavené datumy `project.budget_from` a `project.budget_to` a ignorují výkazy mimo toto období.
- **Souhrny v UI:** Přehled projektů (`listProjectOverview`) čte hodnotu `project.reported_cost`, takže po každé změně logiky musí migrace přepočítat cache, aby souhrn i detailní přehledy zobrazovaly shodné částky.

Po úpravě funkce `compute_project_report_cost` se v migraci provede `UPDATE project SET reported_cost = compute_project_report_cost(id);`, aby se přepočítala cache pro všechny projekty a data v přehledech byla konzistentní s novou logikou.

### API reference

Swagger UI is available at `http://localhost:8081/swagger-ui/index.html` when the backend is running. The documentation now includes the detailed description of the report synchronisation endpoint together with request/response schemas.
