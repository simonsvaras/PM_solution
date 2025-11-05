-- V31__project_capacity_surplus_statuses.sql
-- Extend capacity status reference data with surplus options for each delivery discipline.

INSERT INTO capacity_status (code, label, severity) VALUES
    ('SURPLUS_BE', 'Přebytek BE', 10)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    severity = EXCLUDED.severity;

INSERT INTO capacity_status (code, label, severity) VALUES
    ('SURPLUS_FE', 'Přebytek FE', 10)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    severity = EXCLUDED.severity;

INSERT INTO capacity_status (code, label, severity) VALUES
    ('SURPLUS_ANALYSIS', 'Přebytek Analysis', 10)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    severity = EXCLUDED.severity;
