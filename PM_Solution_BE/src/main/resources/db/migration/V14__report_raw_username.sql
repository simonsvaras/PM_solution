-- V14__report_raw_username.sql
-- Store GitLab usernames directly in the report table so entries without a matching intern
-- account can be persisted alongside regular reports.

ALTER TABLE report
    RENAME COLUMN username TO intern_username;

ALTER INDEX IF EXISTS idx_report_username RENAME TO idx_report_intern_username;

ALTER TABLE report
    ADD COLUMN username TEXT;

UPDATE report
SET username = intern_username;

CREATE INDEX IF NOT EXISTS idx_report_username ON report(username);

ALTER TABLE report
    DROP CONSTRAINT IF EXISTS ux_report_repository_entry;

ALTER TABLE report
    ADD CONSTRAINT ux_report_repository_entry
        UNIQUE (repository_id, iid, username, spent_at, time_spent_seconds);

CREATE OR REPLACE VIEW intern_time_summary AS
SELECT
    i.id            AS intern_id,
    i.username      AS intern_username,
    COALESCE(SUM(r.time_spent_seconds), 0) AS seconds_spent_total
FROM intern i
         LEFT JOIN report r
                   ON r.intern_username = i.username
GROUP BY i.id, i.username;
