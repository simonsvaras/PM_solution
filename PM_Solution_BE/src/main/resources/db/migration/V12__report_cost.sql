-- V12__report_cost.sql
-- Persist monetary cost per report row based on the intern's current level rate.

ALTER TABLE report
    ADD COLUMN cost NUMERIC(12, 2);

UPDATE report r
SET cost = ROUND(l.hourly_rate_czk * r.time_spent_hours, 2)
    FROM intern i
JOIN level l ON l.id = i.level_id
WHERE i.username = r.username;

-- Leave NULL costs for orphaned rows (e.g. after intern removal).

CREATE INDEX IF NOT EXISTS idx_report_cost_not_null ON report(cost) WHERE cost IS NOT NULL;
