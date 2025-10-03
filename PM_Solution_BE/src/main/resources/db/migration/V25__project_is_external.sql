-- V25__project_is_external.sql
-- Add a flag to distinguish external projects and restrict project billing rates to external projects only.

ALTER TABLE project
    ADD COLUMN is_external BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE project
SET is_external = TRUE
WHERE hourly_rate_czk IS NOT NULL;

UPDATE project
SET hourly_rate_czk = NULL
WHERE is_external = FALSE;

ALTER TABLE project
    ADD CONSTRAINT project_external_rate_check
        CHECK (is_external OR hourly_rate_czk IS NULL);

DROP TRIGGER IF EXISTS project_budget_refresh ON project;

CREATE TRIGGER project_budget_refresh
AFTER UPDATE OF budget_from, budget_to, hourly_rate_czk, is_external ON project
FOR EACH ROW
EXECUTE FUNCTION trg_project_budget_refresh();

UPDATE project
SET reported_cost = compute_project_report_cost(id);
