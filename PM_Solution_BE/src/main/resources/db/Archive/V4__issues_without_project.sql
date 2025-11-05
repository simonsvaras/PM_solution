-- V4__issues_without_project.sql
-- Remove project dependency from issues; use repository_id instead. Also switch sync cursor to repository-based.

-- 1) Drop report -> issue FK that used project_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_report_issue'
    ) THEN
        ALTER TABLE report DROP CONSTRAINT fk_report_issue;
    END IF;
END $$;

-- 2) Drop index on report that included project_id,iid if present (not harmful if missing)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'i' AND c.relname = 'idx_report_issue'
    ) THEN
        EXECUTE 'DROP INDEX idx_report_issue';
    END IF;
END $$;

-- 3) Adjust issue table: drop unique(project_id,iid), drop index, drop column project_id, add unique(repository_id,iid)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conrelid = 'issue'::regclass AND conname = 'issue_project_id_iid_key'
    ) THEN
        ALTER TABLE issue DROP CONSTRAINT issue_project_id_iid_key;
    END IF;
EXCEPTION WHEN undefined_object THEN
    -- ignore
    NULL;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'i' AND c.relname = 'idx_issue_project'
    ) THEN
        EXECUTE 'DROP INDEX idx_issue_project';
    END IF;
END $$;

-- Drop the column if present
ALTER TABLE issue
    DROP COLUMN IF EXISTS project_id;

-- Add uniqueness on (repository_id, iid) if not already present.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conrelid = 'issue'::regclass AND conname = 'ux_issue_repo_iid'
    ) THEN
        ALTER TABLE issue ADD CONSTRAINT ux_issue_repo_iid UNIQUE (repository_id, iid);
    END IF;
END $$;

-- 4) Switch sync cursor to repository-based table
DROP TABLE IF EXISTS sync_cursor;

CREATE TABLE IF NOT EXISTS sync_cursor_repo (
    repository_id   BIGINT NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
    scope           TEXT   NOT NULL,
    last_run_at     TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (repository_id, scope)
);

