-- V24__project_hourly_rate.sql
-- Introduce optional project billing rate and persist the underlying hourly rate per report row.

ALTER TABLE project
    ADD COLUMN hourly_rate_czk NUMERIC(12, 2);

ALTER TABLE report
    ADD COLUMN hourly_rate_czk NUMERIC(12, 2);

UPDATE report
SET hourly_rate_czk = CASE
    WHEN time_spent_hours IS NULL OR time_spent_hours = 0 THEN NULL
    WHEN cost IS NULL THEN NULL
    ELSE ROUND(cost / NULLIF(time_spent_hours, 0), 2)
END;

CREATE OR REPLACE FUNCTION compute_project_report_cost(p_project_id BIGINT)
RETURNS NUMERIC(14, 2)
LANGUAGE plpgsql
AS $$
DECLARE
    total NUMERIC(14, 2);
BEGIN
    SELECT COALESCE(SUM(r.time_spent_hours * COALESCE(p.hourly_rate_czk, r.hourly_rate_czk)), 0)
    INTO total
    FROM project p
    JOIN projects_to_repositorie ptr ON ptr.project_id = p.id
    JOIN report r ON r.repository_id = ptr.repository_id
    WHERE p.id = p_project_id
      AND (p.budget_from IS NULL OR r.spent_at::date >= p.budget_from)
      AND (p.budget_to IS NULL OR r.spent_at::date <= p.budget_to);

    IF total IS NULL THEN
        total := 0;
    END IF;

    RETURN ROUND(total, 2);
END;
$$;

CREATE OR REPLACE FUNCTION refresh_project_report_cost(p_project_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    total NUMERIC(14, 2);
BEGIN
    total := compute_project_report_cost(p_project_id);
    UPDATE project
    SET reported_cost = total
    WHERE id = p_project_id;
END;
$$;

DROP TRIGGER IF EXISTS project_budget_refresh ON project;

CREATE TRIGGER project_budget_refresh
AFTER UPDATE OF budget_from, budget_to, hourly_rate_czk ON project
FOR EACH ROW
EXECUTE FUNCTION trg_project_budget_refresh();

UPDATE project
SET reported_cost = compute_project_report_cost(id);
