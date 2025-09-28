-- V15__fix_report_trigger.sql
-- Ensure trg_report_refresh uses distinct variable names and table aliases to avoid ambiguity.

CREATE OR REPLACE FUNCTION trg_report_refresh()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    loop_project_id BIGINT;
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.repository_id IS NOT NULL THEN
        FOR loop_project_id IN
            SELECT DISTINCT ptr.project_id
            FROM projects_to_repositorie ptr
            WHERE ptr.repository_id = NEW.repository_id
        LOOP
            PERFORM refresh_project_report_cost(loop_project_id);
        END LOOP;
    END IF;

    IF (TG_OP = 'UPDATE' AND (NEW.repository_id IS DISTINCT FROM OLD.repository_id))
       OR TG_OP = 'DELETE' THEN
        IF OLD.repository_id IS NOT NULL THEN
            FOR loop_project_id IN
                SELECT DISTINCT ptr.project_id
                FROM projects_to_repositorie ptr
                WHERE ptr.repository_id = OLD.repository_id
            LOOP
                PERFORM refresh_project_report_cost(loop_project_id);
            END LOOP;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
