# Architektura systému PM Solution

## Účel a rozsah
PM Solution kombinuje orchestraci dat z GitLabu, rozpočtování projektů a řízení kapacit internů do jedné interní aplikace. Systém je tvořen:
- backendem PM_Solution_BE (Spring Boot), který synchronizuje GitLab repozitáře/issues/reports do PostgreSQL, poskytuje REST API a implementuje business logiku pro projekty, interny a plánování,
- frontendem pm_solution_fe (React + TypeScript + Vite), který poskytuje jednotnou SPA konzoli,
- relační databází PostgreSQL s Flyway migracemi, kde žijí všechny business entity, derivované pohledy a cache výpočtů.

Aplikace pokrývá tyto domény: on-demand synchronizaci dat z GitLabu, správu projektů a jejich týmů, evidenci internů a jejich výkonnostních statistik, plánování kapacit, sledování nákladů a weekly planner pro sprinty.

## Nasazení a provozní prostředí
### Kontejnerová topologie
- Soubor `docker-compose.yml` vytváří dvojici služeb: `pm-solution-backend` (Spring Boot běžící na portu 8081) a `pm-solution-frontend` (Nginx, který servíruje sestavenou React SPA na portu 5173 a proxy‑ruje `/api` na backend).
- Postgres databáze je konfigurována externě pomocí proměnných `DB_URL`, `DB_USER`, `DB_PASSWORD`. Výchozí `.env` v kořeni repo ukazuje na spravovanou Supabase instance; pro lokální běh lze DB spustit separátně.
- Frontend Dockerfile (`pm_solution_fe/Dockerfile`) očekává build argument `VITE_API_BASE_URL`. V docker-compose je ponechán prázdný, aby Nginx proxy zajistil komunikaci se stejným hostem.

### Konfigurace runtime
- Kořenový soubor `.env` obsahuje GitLab token, URL, skupinové ID a přístupové údaje k databázi. Backend je napsán tak, aby čerpal tyto proměnné mimo zdrojový kód.
- `pm_solution_fe/.env` nastavuje `VITE_API_BASE_URL` pro lokální vývoj mimo Docker (typicky `http://localhost:8081`).
- `PM_Solution_BE/src/main/resources/application.yml` definuje datasource, pool (`HikariCP`), Flyway, server port a konfiguraci GitLabu (timeouty, backoff, limit stránek).
- Automatizované načtení tajemství z dockerových secretů obstarává `SecretsPropertySourceEnvironmentPostProcessor` – pokud jsou dostupné soubory s heslem/klíčem, vloží se do Spring Environmentu ještě před načtením `application.yml`.

### Síťové a bezpečnostní limity
- `WebConfig` povoluje CORS pouze z `http://localhost:5173`, `http://localhost` a `http://127.0.0.1` pro `/api/**`, čímž chrání produkční instanci před neočekávanými původy.
- Kontejner backendu dostává GitLab token výhradně přes proměnné/secret soubory, čímž odpadá potřeba mít klíče ve zdrojích.

## Backend (Spring Boot)
### Vrstvy a struktura balíčků
Backend (`PM_Solution_BE/src/main/java/czm/pm_solution_be`) je rozdělen do jasných vrstev:
- `config` – konfigurace prostředí (`HttpConfig`, `GitLabProperties`, `WebConfig`, `SecretsPropertySource...`).
- `gitlab` – klienti GitLabu (`GitLabClient`, `GitLabGraphQlClient`) a DTO mapy (`gitlab/dto`).
- `sync` – REST kontrolery (`SyncController`, `ProjectAdminController`, `ProjectReportDetailController`, `ProjectMilestoneController`, `ProjectRepositoryController`, …), služby (`RepositorySyncService`, `IssueSyncService`, `ReportSyncService`, `MilestoneSyncService`) a masivní DAO (`SyncDao`), které přes `JdbcTemplate` provádí všechny SQL operace.
- `intern` – controller (`InternController`), reference controller, service a DAO pro CRUD nad interny, historií úrovní a přiřazeními do projektů.
- `projects` – subsystémy pro kapacitní reporting (`projects/capacity`) a přehled issues (`projects/issues`).
- `planning` – kapacitní agregace (`PlanningCapacityController`, `PlanningCapacityService`) a modul weekly planner (`planning/weekly`, `planning/sprint`).
- `modules/planning` – nový modul věnovaný sprintům (REST API `SprintController`, DTO mapery, služby, `WeeklyTaskRepository`).
- `web` – společné výjimky (`ApiException`), DTO odpovědí a `GlobalExceptionHandler`.

Každý modul používá vzor Controller -> Service -> Repository/DAO s čistě SQL implementacemi místo JPA, což usnadňuje optimalizaci komplexních dotazů (např. agregace v `SyncDao` nebo `ProjectCapacityRepository`).

### Konfigurační vrstva
`PmSolutionBeApplication.java` startuje Spring Boot aplikaci. `application.yml` váže se na `GitLabProperties` a `HttpConfig` konstruuje `RestTemplate` s autorizační hlavičkou `PRIVATE-TOKEN`. `WebConfig` nastavuje CORS, `SecretsPropertySourceEnvironmentPostProcessor` propisuje tajemství a `PlanningModuleConfig` zapíná modul weekly planner (registruje repozitáře/služby jako Spring beany).

### Integrace s GitLabem
- `GitLabClient` obálí REST API GitLabu (projekty, repozitáře, issues, milníky) s retry logikou, stránkováním a logováním `X-Request-Id`.
- `GitLabGraphQlClient` obsluhuje GraphQL dotazy, pokud je třeba získat komplexní data (např. timelog).
- `TimeSpentParser` převádí GitLabové `human_time_estimate`/`time_spent` do sekund/hodin.
- `gitlab/dto` definuje mapování JSON -> Java typy, což umožňuje přesnou persistenci do lokální DB.

### Synchronizační modul
- `SyncController` poskytuje všechny `/api/sync/**` endpoints (repozitáře, issues, milníky, reporty). Zpracování každého requestu měří runtime a vrací `SyncSummary`.
- `RepositorySyncService`, `IssueSyncService`, `ReportSyncService` a `MilestoneSyncService` orchestrace volání GitLabu a předávání dat do `SyncDao`, který provádí `UPSERT`-y, udržuje vazby `projects_to_repositorie` a generuje agregace (přehled projektů, dlouhodobé reporty, měsíční náklady).
- `SyncDao` (85 kB SQL) používá `JdbcTemplate` a ručně psané dotazy pro všechny projekty, interny, výkazy, kapacitní metriky nebo weekly planner.
- `sync.jobs` obsahuje `SyncJobController` + `SyncJobService`, které ukládají parametry dlouhotrvajících synchronizačních jobů (audit trail).

### Správa projektů, reportů a kapacit
- `ProjectAdminController`, `ProjectQueryController`, `ProjectInternController`, `ProjectReportDetailController`, `ProjectReportTeamController` a `ProjectMilestoneController` obsluhují CRUD operace nad projekty, správu týmů, přehledy reportů, detaily podle internů/projektů/milníků a exporty.
- Balík `projects/capacity` nabízí API `/api/projects/{id}/capacity` pro hlášení stavů (pomocí `ProjectCapacityRepository` a `ProjectCapacityService`), zatímco `PlanningCapacityController` a `PlanningCapacityService` agregují nejnovější statusy napříč projekty a interny pro dashboard "Aktuální kapacity".

### Registr internů a reference data
- `InternController` a `InternService` realizují kompletní CRUD (včetně historie úrovní `InternLevelHistory`, zařazení do `group`, přepočtu `project.reported_cost` při změně `includeInReportedCost`).
- `InternDao` obsahuje všechny SQL dotazy pro seznamy, detaily, overview, monthly hours (`listInternMonthlyHours`), statistiky výkonu a validace referenčních dat (`level`, `group`).
- `InternReferenceController` poskytuje `/api/levels` a `/api/groups` jako referenční data pro frontend.

### Plánování sprintů a weekly planner
- Klasická kapacitní agregace žije v balíčku `planning` (viz `PlanningCapacityRepository`, `PlanningCapacityController`).
- Weekly planner je samostatný modul (`planning/weekly`, `planning/sprint`, `modules/planning`). `WeeklyPlannerController` zveřejňuje endpoints `/api/projects/{projectId}/weekly-planner/**`, `WeeklyPlannerService` implementuje business logiku nad tabulkami `project_week`, `weekly_task`, `weekly_task_assignment` apod. `PlanningSprintRepository` spravuje entitu `PlanningSprintEntity`.
- `modules/planning/api/SprintController` a odpovídající DTO/Service mapují weekly planner do agregovaných sprintových přehledů (např. `SprintSummaryDto`, `WeeklyTaskDto`).

### API, validace a chybová komunikace
- Základní `ApiException` a `ApiErrorResponse` definují strukturu chyb. `GlobalExceptionHandler` převádí výjimky na jednotné JSON odpovědi (kódy VALIDATION/CONFLICT/NOT_FOUND…) a loguje `requestId`.
- Validace probíhá na vstupu (např. `SyncController.ProjectReportSyncRequest`, `InternRequest`) i na úrovni SQL (constrainty + `ON CONFLICT` upsert).

### Observabilita a management
- Logging (SLF4J) zachycuje start/finish synchronizací (počty, trvání) i varování při výjimkách.
- `management.endpoints.web.exposure.include=health,info` zpřístupňuje `/actuator` endpoints pro health‑check.
- `SyncController` měří `durationMs` každého běhu a vystavuje ho ve výsledku, aby frontend mohl zobrazit výkon.

## Databázová architektura
### Základní tabulky a vztahy
- `project`, `repository`, `projects_to_repositorie` a `issue` reprezentují GitLab entitní prostor. `project` obsahuje `namespace_id`, `namespace_name`, rozpočtová data, `is_external`, `hourly_rate_czk` a `week_start_day`.
- `intern`, `group`, `level`, `intern_group`, `intern_level_history` a `intern_project` pokrývají registr internů včetně historie úrovní a příznaku `include_in_reported_cost`.
- `report` ukládá časové výkazy s vazbou na repository, username, issue a hodinovou sazbu.
- `capacity_status`, `project_capacity_report`, `project_capacity_report_status` ukládají záznamy o kapacitě. `project.reported_cost` funguje jako cache.
- Weekly planner využívá tabulky vytvořené v migracích `V2__weekly_planner.sql` až `V7__drop_weekly_task_day_of_week.sql` (např. `project_week`, `weekly_task`, `planning_sprint`, `weekly_task_backlog`).

### Funkce, trigery a cache
- `V1__baseline.sql` definuje funkce `compute_project_report_cost` a `refresh_project_report_cost` plus trigery (`trg_intern_project_refresh`, `trg_project_repository_refresh`, `trg_report_refresh`), které při každé změně projektu/tymu/reportu přepočítávají `project.reported_cost`.
- SQL dotazy ve `SyncDao` a `ProjectCapacityRepository` využívají pohledy/CTE pro agregace (souhrny projektů, open issues, monthly burn). Indexy a `ON CONFLICT` constraints chrání proti duplicitám (např. report `(repository_id, iid, username, spent_at, time_spent_seconds)`).

### Migrace pro plánování
- `V2__weekly_planner.sql` přidává tabulky pro týdenní plán (project weeks, tasks, assignments).
- `V3__add_planning_sprint.sql`, `V4__link_project_week_to_sprint.sql`, `V5__weekly_task_backlog.sql`, `V6__weekly_task_day_nullable.sql` a `V7__drop_weekly_task_day_of_week.sql` rozvíjejí weekly planner o sprinty, backlog a flexibilitu pracovních dnů.

Flyway (`spring.flyway.locations=classpath:db/migration`) aplikuje migrace při startu aplikace, takže struktura DB je verzovaná a reprodukovatelná.

## Frontend (React + Vite)
### Vstupní bod a navigace
- `src/main.tsx` mountuje `App` do DOM a importuje globální styly (`index.css`).
- `src/App.tsx` definuje modulární navigaci (`modules` pole) a custom router, který čte parametry `module`, `submodule`, `projectId`, `view`, `internId`, `tab` z `window.location.search`. Není použit React Router; navigace funguje skrze `URLSearchParams` a `history.replaceState`.
- `Navbar` (`src/components/Navbar.tsx`) vykresluje přepínače modulů a submodulů.

### Komponenty a UI moduly
- Každá obrazovka má vlastní `.tsx` a `.css` v `src/components`. Patří sem například `ProjectsPage`, `ProjectsOverviewPage`, `ProjectReportPage`, `ProjectReportDetailPage`, `ProjectCapacityReportPage`, `ProjectWeeklyPlannerPage`, `InternsPage`, `InternsOverviewPage`, `InternPerformancePage`, `ReportsTeamsPage`, `PlanningResourcesPage`, `PlanningCurrentCapacityPage` a modály (`ManageRepositoriesModal`, `ManageProjectInternsModal`, `ProjectSettingsModal`, `InternLevelHistoryModal`).
- Podsložka `components/planning` obsahuje sdílené bloky pro weekly planner (např. `PlannerBoard`, `SprintHeader`, `SprintCreateForm`).
- Specifické komponenty mají dedikované styly s BEM‑like názvy, sticky hlavičky tabulek a responzivní prvky (např. `ProjectReportDetailPage.css`, `InternDetailPage.css`).

### Datová vrstva na frontendu
- `src/api.ts` (72 kB) je jediný zdroj pravdy pro komunikaci s backendem. Obsahuje typy DTO (`ProjectDTO`, `ProjectOverviewDTO`, `ProjectLongTermReportResponse`, `WeeklyTaskDto`, …) i funkce `fetch`/`fetchJson` volající `/api/**`.
- `hooks/useQuery.ts` implementuje jednoduchý hook pro dotazování s loading/error stavem a `refetch`.
- `config/reportingPeriod.ts` definuje pomocné funkce (`getDefaultReportingPeriod`, `datetimeLocalToIso`) i konfigurační konstanty (`REPORTING_PERIOD_START_DAY`, `REPORTING_PERIOD_END_DAY`), které ovlivňují výchozí filtry synchronizací.
- `api.ts` zajišťuje také helpery pro weekly planner (`getWeeklyPlannerSettings`, `listProjectWeeks`, `createWeeklyTask`, `updateWeeklyTaskAssignment`, …) a pro capacity/planning dashboardy (`getPlanningCurrentCapacity`, `getPlanningResources`).

### Stav, persistence a UX
- Většina stavů je lokální v komponentách; globální stav (např. výběr modulu) je odvozen z URL.
- `ProjectReportDetailPage.tsx` používá `localStorage`, aby uchoval poslední nastavení filtrů (časové rozmezí, seznam internů) napříč reloady.
- Tlačítka a formuláře mají konzistentní modální vrstvy (viz `Modal.tsx`), validace reflektuje odpovědi backendu.
- Náročnější vizualizace (např. grafy v `PlanningResourcesPage`) využívají knihovnu Recharts s gradienty a zvýrazněním kritických období, jak je popsáno v `pm_solution_fe/README.md`.

## Komunikace a integrační scénáře
### Synchronizace issues a reportů
1. Operátor na stránce "Synchronizace" (`components/ProjectsPage.tsx` + `App.tsx` modul `sync`) spustí akci (např. "Synchronizovat reporty").
2. Frontend volá `syncReportsAll`, resp. `syncProjectReports` z `api.ts`, které POSTne parametry (`sinceLast`, `from`, `to`) na `/api/sync/...`.
3. `SyncController` parametry validuje, volá příslušný service (`ReportSyncService`), který orchestruje volání `GitLabClient`/`GitLabGraphQlClient` a předává surová data do `SyncDao`.
4. `SyncDao` provede upsert do `report`, propojí data s projekty přes `projects_to_repositorie`, přepočítá `project.reported_cost` (trigery) a vrátí `SyncSummary`.
5. Frontend zobrazí stav na kartách, včetně `missingUsernames`, časů běhu a počtů přidaných záznamů.

### Kapacitní reporting
1. Na stránce "Aktuální kapacity" frontend načte `getPlanningCurrentCapacity` (`/api/planning/capacity/current` skrze `PlanningCapacityController`).
2. Back-end dotazy (`PlanningCapacityRepository`) vyhledají poslední záznamy z `project_capacity_report` a `project_capacity_report_status`, agregují je podle severity a odděleně pro projekty/interny.
3. Frontend vizualizuje počty a seznamy projektů s kritickými statusy, zobrazí barvy dle `severity`.

### Weekly planner a sprinty
1. `ProjectWeeklyPlannerPage.tsx` načítá `listProjectWeeks`, `listWeeklyTasksByWeek`, `getWeeklyPlannerSettings` z `api.ts`.
2. API obsluhuje `WeeklyPlannerController`/`WeeklyPlannerService`. Služba pracuje s `PlanningSprintRepository`, `WeeklyPlannerRepository` a `WeeklyTaskRepository` pro čtení/zápis do tabulek `project_week`, `weekly_task`, `planning_sprint`.
3. Při generování týdenních plánů `WeeklyPlannerService` vytvoří `project_week` (podle `project.week_start_day`) a naváže je na sprinty (`planning_sprint`). Přesun úkolu mezi týdny se ukládá spolu s odkazem na issue/interna.
4. Souhrny sprintů (`modules/planning/api/SprintController`) agregují otevřené úkoly a poskytují frontendu numeriku pro `ProjectWeeklyPlannerPage` a `PlanningResourcesPage`.

### Správa internů a plánování zdrojů
1. Frontend používá `listInterns`, `getInternDetail`, `updateIntern` z `api.ts`.
2. Backend `InternController` -> `InternService` -> `InternDao` validuje požadavky, aktualizuje `intern`, `intern_level_history`, `intern_group`, `intern_project` a využívá `SyncDao.refreshProjectReportedCost`.
3. Kapacitní plánování (`PlanningResourcesPage`) využívá `/api/interns/monthly-hours` (SQL v `SyncDao.listInternMonthlyHours`) pro graf normalizované kapacity. FE následně vizualizuje data v grafu a tabulce.

## Bezpečnost, konfigurace a kvalita
- **Bezpečnost**: Tokeny GitLabu jsou mimo repozitář, CORS omezuje přístupy, backend neuchovává přihlašovací údaje GitLabu, pouze technický token. Mazání reportů (`DELETE /api/sync/reports`) vyžaduje explicitní akci a backend loguje zásahy. Weekly planner i synchronizační endpointy validují, že projekt existuje a běží v rámci přidělených repozitářů.
- **Konfigurace**: Veškeré runtime parametry jsou konfigurovatelné přes proměnné (`.env`, secrets). `GitLabProperties` centralizuje endpoint, timeouts a retry logiku, takže změna API se soustředí do jednoho místa.
- **Testování a kvalita**: Backend používá Gradle (`build.gradle.kts`) s úlohami `test` a Flyway migracemi – `./gradlew test` ověřuje business logiku i H2 profil. Frontend má Vitest (`vitest.config.ts`) a smoke test `alwaysPass.test.tsx`; vývojáři spouštějí `npm run dev`/`npm run test` podle potřeby. Linting (`eslint.config.js`) zachycuje nekonzistence v React komponentách.

Tato dokumentace poskytuje holistický pohled na architekturu, takže v bakalářské práci lze odkázat jednotlivé kapitoly na konkrétní balíčky a datové toky uvedené výše.
