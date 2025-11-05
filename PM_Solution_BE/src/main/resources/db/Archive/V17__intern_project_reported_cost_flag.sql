-- V17__intern_project_reported_cost_flag.sql
-- Adds a toggle to control whether an intern's spending counts towards the
-- cached reported cost total of a project and hooks the flag into refresh logic.

ALTER TABLE intern_project
    ADD COLUMN include_in_reported_cost BOOLEAN NOT NULL DEFAULT TRUE;

CREATE OR REPLACE FUNCTION compute_project_report_cost(p_project_id BIGINT)
RETURNS NUMERIC(14, 2)
LANGUAGE plpgsql
AS $$
DECLARE
    total NUMERIC(14, 2);
BEGIN
    SELECT COALESCE(SUM(
                       CASE
                           WHEN r.cost IS NULL THEN 0
                           WHEN i.id IS NULL THEN r.cost
                           WHEN ip.project_id IS NULL THEN r.cost
                           WHEN ip.include_in_reported_cost THEN r.cost
                           ELSE 0
                       END), 0)
    INTO total
    FROM project p
    JOIN projects_to_repositorie ptr ON ptr.project_id = p.id
    JOIN report r ON r.repository_id = ptr.repository_id
    LEFT JOIN intern i ON i.username = r.username
    LEFT JOIN intern_project ip ON ip.project_id = p.id AND ip.intern_id = i.id
    WHERE p.id = p_project_id
      AND r.cost IS NOT NULL
      AND (p.budget_from IS NULL OR r.spent_at::date >= p.budget_from)
      AND (p.budget_to IS NULL OR r.spent_at::date <= p.budget_to);

    IF total IS NULL THEN
        total := 0;
    END IF;

    RETURN ROUND(total, 2);
END;
$$;

CREATE OR REPLACE FUNCTION trg_intern_project_refresh()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        PERFORM refresh_project_report_cost(NEW.project_id);
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM refresh_project_report_cost(OLD.project_id);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS intern_project_refresh ON intern_project;

CREATE TRIGGER intern_project_refresh
AFTER INSERT OR UPDATE OR DELETE ON intern_project
FOR EACH ROW
EXECUTE FUNCTION trg_intern_project_refresh();

UPDATE project
SET reported_cost = compute_project_report_cost(id);
