-- V33__intern_status_default.sql
-- Ensure intern status uses SATUROVANO as the default state so new interns don't need to provide it explicitly.

-- Add the corrected status code if it doesn't exist yet and migrate existing references.
INSERT INTO intern_status (code, label, severity)
SELECT 'SATUROVANO', 'Saturováno', severity
FROM intern_status
WHERE code = 'SATUROVAN'
ON CONFLICT (code) DO NOTHING;

-- Update current and historical records to use the corrected code.
UPDATE intern SET status_code = 'SATUROVANO' WHERE status_code = 'SATUROVAN';
UPDATE intern_status_history SET status_code = 'SATUROVANO' WHERE status_code = 'SATUROVAN';

-- Remove the old code if it no longer has any references.
DELETE FROM intern_status WHERE code = 'SATUROVAN';

-- Set default for future inserts.
ALTER TABLE intern ALTER COLUMN status_code SET DEFAULT 'SATUROVANO';
