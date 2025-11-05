-- V2__gitlab_sync.sql
-- Add GitLab mapping and sync cursor support

-- 1) Add gitlab_project_id to project and make it unique
ALTER TABLE project
    ADD COLUMN IF NOT EXISTS gitlab_project_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_project_gitlab_id
    ON project(gitlab_project_id)
    WHERE gitlab_project_id IS NOT NULL;

-- 2) Sync cursor table for incremental syncs
CREATE TABLE IF NOT EXISTS sync_cursor (
    project_id   BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    scope        TEXT   NOT NULL, -- 'issues' | 'notes'
    last_run_at  TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (project_id, scope)
);

-- 3) Ensure idempotence for report inserts in MVP
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM   pg_constraint
        WHERE  conname = 'ux_report_nodup_mvp'
    ) THEN
        ALTER TABLE report
            ADD CONSTRAINT ux_report_nodup_mvp
                UNIQUE (project_id, iid, username, spent_at, time_spent_seconds);
    END IF;
END $$;

