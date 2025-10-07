-- V30__project_capacity_multi_status.sql
-- Remove reporter column and allow multiple capacity statuses per report.

ALTER TABLE project_capacity_report
    DROP CONSTRAINT IF EXISTS project_capacity_report_project_id_reported_at_reported_by_key;

ALTER TABLE project_capacity_report
    DROP COLUMN IF EXISTS reported_by;

CREATE TABLE project_capacity_report_status (
    report_id BIGINT NOT NULL REFERENCES project_capacity_report (id) ON DELETE CASCADE,
    status_code TEXT NOT NULL REFERENCES capacity_status (code),
    PRIMARY KEY (report_id, status_code)
);

COMMENT ON TABLE project_capacity_report_status IS 'Join table linking project capacity reports with one or more capacity statuses.';
COMMENT ON COLUMN project_capacity_report_status.report_id IS 'Foreign key to project_capacity_report identifying the report entry.';
COMMENT ON COLUMN project_capacity_report_status.status_code IS 'Status assigned to the report; references capacity_status.';

INSERT INTO project_capacity_report_status (report_id, status_code)
SELECT id, status_code
FROM project_capacity_report;

ALTER TABLE project_capacity_report
    DROP COLUMN IF EXISTS status_code;

CREATE INDEX idx_project_capacity_report_status_report
    ON project_capacity_report_status (report_id);
