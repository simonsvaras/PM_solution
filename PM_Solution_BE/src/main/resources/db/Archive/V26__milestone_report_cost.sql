-- V26__milestone_report_cost.sql
-- Create a view that exposes aggregated milestone costs respecting project budget limits.

CREATE OR REPLACE VIEW milestone_report_cost AS
SELECT m.milestone_id,
       m.project_id,
       ROUND(COALESCE(SUM(r.time_spent_hours * COALESCE(p.hourly_rate_czk, r.hourly_rate_czk)), 0), 2) AS total_cost
FROM milestone m
JOIN project p ON p.id = m.project_id
LEFT JOIN projects_to_repositorie ptr ON ptr.project_id = m.project_id
LEFT JOIN issue iss
       ON iss.repository_id = ptr.repository_id
      AND iss.milestone_title = m.title
LEFT JOIN report r
       ON r.repository_id = iss.repository_id
      AND r.iid = iss.iid
      AND (p.budget_from IS NULL OR r.spent_at::date >= p.budget_from)
      AND (p.budget_to IS NULL OR r.spent_at::date <= p.budget_to)
GROUP BY m.milestone_id, m.project_id;
