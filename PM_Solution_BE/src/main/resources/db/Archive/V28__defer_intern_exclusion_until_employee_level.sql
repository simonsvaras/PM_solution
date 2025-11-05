-- V28__defer_intern_exclusion_until_employee_level.sql
-- Only drop intern costs from reported totals once the intern reaches the 'employee' level.

CREATE OR REPLACE FUNCTION compute_project_report_cost(p_project_id BIGINT)
RETURNS NUMERIC(14, 2)
LANGUAGE plpgsql
AS $$
DECLARE
    total NUMERIC(14, 2);
BEGIN
    SELECT COALESCE(SUM(
                       CASE
                           WHEN ip.project_id IS NULL OR ip.include_in_reported_cost THEN
                               COALESCE(r.time_spent_hours * COALESCE(p.hourly_rate_czk, r.hourly_rate_czk), 0)
                           WHEN lvl.code = 'employee' THEN
                               0
                           ELSE
                               COALESCE(r.time_spent_hours * COALESCE(p.hourly_rate_czk, r.hourly_rate_czk), 0)
                       END), 0)
    INTO total
    FROM project p
    JOIN projects_to_repositorie ptr ON ptr.project_id = p.id
    JOIN report r ON r.repository_id = ptr.repository_id
    LEFT JOIN intern i ON i.username = r.username
    LEFT JOIN intern_project ip ON ip.intern_id = i.id AND ip.project_id = p.id
    LEFT JOIN intern_level_history ilh ON ilh.intern_id = i.id
        AND ilh.valid_from <= r.spent_at::date
        AND (ilh.valid_to IS NULL OR ilh.valid_to >= r.spent_at::date)
    LEFT JOIN level lvl ON lvl.id = ilh.level_id
    WHERE p.id = p_project_id
      AND (p.budget_from IS NULL OR r.spent_at::date >= p.budget_from)
      AND (p.budget_to IS NULL OR r.spent_at::date <= p.budget_to);

    IF total IS NULL THEN
        total := 0;
    END IF;

    RETURN ROUND(total, 2);
END;
$$;

UPDATE project
SET reported_cost = compute_project_report_cost(id);
