# Databázový model PM Solution

## Přehled
Databáze běží na PostgreSQL a je verzovaná pomocí Flyway migrací (`PM_Solution_BE/src/main/resources/db/migration`). Všechny entity jsou navržené pro synchronizaci dat z GitLabu, evidenci internů a plánování kapacit. Backend používá hlavně `JdbcTemplate` a přímo psané SQL (`SyncDao`, `PlanningCapacityRepository`, `WeeklyPlannerRepository`), takže struktura tabulek je pevně svázaná s jednotlivými use-casy.

## Projekty a GitLab data
- `project` – hlavní tabulka projektů. Obsahuje rozpočtové údaje (`budget`, `budget_from`, `budget_to`), příznak externího projektu (`is_external`), cache nákladů (`reported_cost`), hodinovou sazbu a `week_start_day` pro weekly planner. Využívají ji moduly `ProjectAdminController`, `ProjectCapacityRepository`, `WeeklyPlannerService` i `PlanningCapacityService`.
- `repository` + `projects_to_repositorie` – ukládají GitLab repozitáře a jejich přiřazení k projektům. Slouží `RepositorySyncService` a `ProjectRepositoryController` při mapování lokálních projektů na GitLab namespace.
- `issue` – persistuje GitLab issues včetně `web_url`, `human_time_estimate`, due dates a stavu. Odkazují na něj reporty, weekly planner (`weekly_task.issue_id`) a projektové reporty (`ProjectReportDetailController`).
- `milestone` – ukládá milníky stažené z GitLab skupin. Čte jej `ProjectMilestoneController` a plánovací přehledy v UI.
- `sync_cursor_repo` – technická tabulka s kurzory poslední synchronizace pro každé repo. Používá ji `RepositorySyncService` a `ReportSyncService`, aby mohly navázat od posledního `updated_at`.

## Výkazy a nákladové výpočty
- `report` – časové záznamy (`spent_at`, `time_spent_hours`, `username`, `hourly_rate_czk`) napojené přes `repository_id` a nepřímo na projekty. `ReportSyncService` do ní ukládá deduplikované položky z GitLabu (`ON CONFLICT` nad `repository_id, iid, username, spent_at, time_spent_seconds`).
- Funkce `compute_project_report_cost` a `refresh_project_report_cost` + trigery `trg_*` přepočítávají `project.reported_cost` při každé změně projektu, přiřazení internů nebo doplnění výkazů. Spotřebovává je `SyncDao`, které z těchto cache počítá přehledy a metriky.

## Registr internů
- `intern` – základní profil (jméno, username, `level_id`, `status_code`). `InternService` nad ní provádí CRUD.
- `level`, `intern_level_history` – referenční úrovně a jejich časová osa pro každý profil. Využívá je výpočet kapacit (`include_in_reported_cost` respektuje úrovně typu `employee`).
- `group`, `intern_group` – přiřazení internů do skupin/týmů, aby šly filtrovat v UI.
- `intern_project` – M:N vazba intern vs. projekt; ukládá `workload_hours` a příznak `include_in_reported_cost`. Triggeruje přepočet nákladů při každé změně.
- `intern_status`, `intern_status_history` – evidují pracovní statusy (např. SATUROVANO) a jejich historii. Používají se v přehledech `InternsOverviewPage` a `PlanningResourcesPage`.

## Kapacitní reporting
- `capacity_status` – číselník stavů (kód, label, `severity`). Sdílí ho `ProjectCapacityController` i `PlanningCapacityController`.
- `project_capacity_report` + `project_capacity_report_status` – historické záznamy hlášení kapacit pro každý projekt, včetně volitelné poznámky a seznamu statusů. Backend nad nimi staví dashboard „Aktuální kapacity“ (agregace posledních záznamů) a detailní timeline pro projekty.

## Weekly planner a sprinty
- `planning_sprint` – sprinty s názvem, deadlinem a stavem (`OPEN`/`CLOSED`). Slouží weekly planneru (`WeeklyPlannerService`, `SprintController`) k navázání projektových týdnů a úkolů.
- `project_week` – generované týdny s unikátním `week_start_date` per projekt. Podle nastaveného `project.week_start_day` se zakládají periodické kontejnery, které se mohou navázat na sprint (`sprint_id`).
- `weekly_task` – samotné plánované úkoly. Uchovávají vazbu na projekt, sprint, případně konkrétní `project_week`, odkaz na issue/interna, poznámku a plánované hodiny. Odtud čerpají `WeeklyPlannerRepository`, `WeeklyTaskRepository` i agregace `modules/planning` (souhrny sprintů, carry-over, backlog).

## Další poznámky
- Všude jsou cizí klíče s `ON DELETE CASCADE/SET NULL`, takže mazání projektů internů nebo sprintů propaguje změny konzistentně. Triggery `set_updated_at_timestamp` zároveň udržují `updated_at` timestamps pro projekty, týdny, sprinty a weekly tasks.
- Flyway migrace V2–V7 zachycují evoluci weekly planneru (přidání sprintů, vazby a odstranění `day_of_week`), takže datový model lze sledovat v čase.
- Backend přistupuje k DB výhradně přes servisní uživatele definované v `.env`/docker secrets a nevyužívá ORM, takže případné úpravy tabulek je nutné promítnout i do SQL ve třídách `SyncDao`, `PlanningCapacityRepository`, `WeeklyPlannerRepository` a `InternDao`.
