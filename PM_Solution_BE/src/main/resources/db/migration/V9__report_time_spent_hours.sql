-- V9__report_time_spent_hours.sql
-- Store derived time spent values in hours for easier reporting and payroll calculations.

ALTER TABLE report
    ADD COLUMN time_spent_hours NUMERIC(12, 4);

UPDATE report
SET time_spent_hours = time_spent_seconds::numeric / 3600;

ALTER TABLE report
    ALTER COLUMN time_spent_hours SET NOT NULL;

CREATE OR REPLACE VIEW intern_time_summary AS
SELECT
    i.id            AS intern_id,
    i.username      AS intern_username,
    COALESCE(SUM(r.time_spent_seconds), 0) AS seconds_spent_total,
    COALESCE(SUM(r.time_spent_hours), 0::NUMERIC) AS hours_spent_total
FROM intern i
         LEFT JOIN report r
                   ON r.username = i.username
GROUP BY i.id, i.username;
