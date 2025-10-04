-- V27__reported_cost_include_flag.sql
-- Align compute_project_report_cost with SyncDao aggregation to honour intern include flag.

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
                           ELSE 0
                       END), 0)
    INTO total
    FROM project p
    JOIN projects_to_repositorie ptr ON ptr.project_id = p.id
    JOIN report r ON r.repository_id = ptr.repository_id
    LEFT JOIN intern i ON i.username = r.username
    LEFT JOIN intern_project ip ON ip.intern_id = i.id AND ip.project_id = p.id
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
