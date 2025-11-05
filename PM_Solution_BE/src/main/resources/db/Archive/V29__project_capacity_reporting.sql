-- V29__project_capacity_reporting.sql
-- Introduce capacity reporting tables for projects, including a reference table of statuses
-- and the historical records capturing individual capacity reports per project.

CREATE TABLE capacity_status (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    severity SMALLINT NOT NULL CHECK (severity BETWEEN 0 AND 100)
);

COMMENT ON TABLE capacity_status IS 'Reference data for possible project capacity states reported by delivery teams.';
COMMENT ON COLUMN capacity_status.code IS 'Stable identifier used by backend and frontend to reference the capacity status.';
COMMENT ON COLUMN capacity_status.label IS 'Human readable label presented to users in the UI.';
COMMENT ON COLUMN capacity_status.severity IS 'Ordering helper; 0 denotes no risk while 100 represents the most critical shortage.';

-- severity 0 = no capacity issues, 100 = critical capacity risk
INSERT INTO capacity_status (code, label, severity) VALUES
    ('SATURATED', 'Všechny pozice saturovány', 0),
    ('LACK_BE', 'Chybí kapacity na backend', 60),
    ('LACK_FE', 'Chybí kapacity na frontend', 60),
    ('LACK_ANALYSIS', 'Chybí kapacity na analýzu', 50),
    ('CRITICAL', 'Kritický nedostatek kapacit', 100);

CREATE TABLE project_capacity_report (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    status_code TEXT NOT NULL REFERENCES capacity_status(code),
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reported_by TEXT NOT NULL REFERENCES intern(username),
    note TEXT NULL,
    UNIQUE (project_id, reported_at, reported_by)
);

COMMENT ON TABLE project_capacity_report IS 'Historical records of capacity status updates per project.';
COMMENT ON COLUMN project_capacity_report.project_id IS 'Project associated with the capacity report entry.';
COMMENT ON COLUMN project_capacity_report.status_code IS 'Reference to capacity_status determining the reported capacity situation.';
COMMENT ON COLUMN project_capacity_report.reported_at IS 'Timestamp when the capacity report was created; defaults to NOW().';
COMMENT ON COLUMN project_capacity_report.reported_by IS 'Username of the reporter; mapped to intern.username until unified user table exists.';
COMMENT ON COLUMN project_capacity_report.note IS 'Optional free-form explanation providing more detail for the reported status.';

CREATE INDEX idx_project_capacity_report_project
    ON project_capacity_report (project_id, reported_at DESC);
