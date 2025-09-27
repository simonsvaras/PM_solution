-- V9__report_time_spent_hours.sql
-- Store precomputed hour values for timelog entries to simplify downstream reporting.

ALTER TABLE report
    ADD COLUMN IF NOT EXISTS time_spent_hours NUMERIC(12,6);

UPDATE report
SET time_spent_hours = ROUND(time_spent_seconds::NUMERIC / 3600, 6)
WHERE time_spent_hours IS NULL;

ALTER TABLE report
    ALTER COLUMN time_spent_hours SET NOT NULL;
