-- Add support for storing timelogs that reference GitLab users
-- who are not yet present in the local intern registry.
ALTER TABLE report
    ADD COLUMN unregistered_username TEXT;

ALTER TABLE report
    ADD COLUMN username_fallback TEXT GENERATED ALWAYS AS (COALESCE(username, unregistered_username)) STORED;

ALTER TABLE report
    ADD CONSTRAINT chk_report_username_presence
        CHECK (username IS NOT NULL OR unregistered_username IS NOT NULL);

ALTER TABLE report
    DROP CONSTRAINT IF EXISTS ux_report_repository_entry;

ALTER TABLE report
    ADD CONSTRAINT ux_report_repository_entry
        UNIQUE (repository_id, iid, username_fallback, spent_at, time_spent_seconds);

CREATE INDEX IF NOT EXISTS idx_report_unregistered_username
    ON report (unregistered_username)
    WHERE unregistered_username IS NOT NULL;
