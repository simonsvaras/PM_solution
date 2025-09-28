-- V12__report_cost.sql
-- Persist monetary cost per report row based on the intern's level at the time of work.

ALTER TABLE report
    ADD COLUMN cost NUMERIC(12, 2);

UPDATE report r
SET cost = ROUND(l.hourly_rate_czk * r.time_spent_hours, 2)
FROM intern i
JOIN intern_level_history h ON h.intern_id = i.id
JOIN level l ON l.id = h.level_id
WHERE i.username = r.username
  AND r.spent_at::date >= h.valid_from
  AND (h.valid_to IS NULL OR r.spent_at::date <= h.valid_to);

-- Leave NULL costs for orphaned rows (e.g. after intern removal).

CREATE INDEX IF NOT EXISTS idx_report_cost_not_null ON report(cost) WHERE cost IS NOT NULL;
