-- V14__project_reported_cost_cache.sql
-- Maintain cached reported cost totals per project for fast access.

ALTER TABLE project
    ADD COLUMN reported_cost NUMERIC(14, 2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION compute_project_report_cost(p_project_id BIGINT)
RETURNS NUMERIC(14, 2)
LANGUAGE plpgsql
AS $$
DECLARE
    total NUMERIC(14, 2);
BEGIN
    SELECT COALESCE(SUM(r.cost), 0)
    INTO total
    FROM project p
    JOIN projects_to_repositorie ptr ON ptr.project_id = p.id
    JOIN report r ON r.repository_id = ptr.repository_id
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

CREATE OR REPLACE FUNCTION trg_project_budget_refresh()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM refresh_project_report_cost(NEW.id);
    RETURN NEW;
END;
$$;

CREATE TRIGGER project_budget_refresh
AFTER UPDATE OF budget_from, budget_to ON project
FOR EACH ROW
EXECUTE FUNCTION trg_project_budget_refresh();

CREATE OR REPLACE FUNCTION trg_report_refresh()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    project_id BIGINT;
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.repository_id IS NOT NULL THEN
        FOR project_id IN
            SELECT DISTINCT project_id FROM projects_to_repositorie WHERE repository_id = NEW.repository_id
        LOOP
            PERFORM refresh_project_report_cost(project_id);
        END LOOP;
    END IF;

    IF (TG_OP = 'UPDATE' AND (NEW.repository_id IS DISTINCT FROM OLD.repository_id))
       OR TG_OP = 'DELETE' THEN
        IF OLD.repository_id IS NOT NULL THEN
            FOR project_id IN
                SELECT DISTINCT project_id FROM projects_to_repositorie WHERE repository_id = OLD.repository_id
            LOOP
                PERFORM refresh_project_report_cost(project_id);
            END LOOP;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER report_refresh_project_cost
AFTER INSERT OR UPDATE OR DELETE ON report
FOR EACH ROW
EXECUTE FUNCTION trg_report_refresh();

CREATE OR REPLACE FUNCTION trg_project_repository_refresh()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM refresh_project_report_cost(NEW.project_id);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM refresh_project_report_cost(OLD.project_id);
        RETURN OLD;
    ELSE
        IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
            PERFORM refresh_project_report_cost(OLD.project_id);
        END IF;
        PERFORM refresh_project_report_cost(NEW.project_id);
        RETURN NEW;
    END IF;
END;
$$;

CREATE TRIGGER project_repository_refresh
AFTER INSERT OR UPDATE OR DELETE ON projects_to_repositorie
FOR EACH ROW
EXECUTE FUNCTION trg_project_repository_refresh();

UPDATE project
SET reported_cost = compute_project_report_cost(id);

