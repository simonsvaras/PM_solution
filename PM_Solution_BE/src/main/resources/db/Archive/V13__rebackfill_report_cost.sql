-- V13__rebackfill_report_cost.sql
-- Recalculate report costs using intern level history for instances where V12 was executed
-- before the backfill query was corrected.

UPDATE report r
SET cost = ROUND(l.hourly_rate_czk * r.time_spent_hours, 2)
FROM intern i
JOIN intern_level_history h ON h.intern_id = i.id
JOIN level l ON l.id = h.level_id
WHERE r.username = i.username
  AND r.spent_at::date >= h.valid_from
  AND (h.valid_to IS NULL OR r.spent_at::date <= h.valid_to);
