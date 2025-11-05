-- V8__report_repository_id.sql
-- Rename report.project_id to repository_id and ensure deduplication uses repository context.

-- Drop old FK to project if present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'report_project_id_fkey'
    ) THEN
        ALTER TABLE report DROP CONSTRAINT report_project_id_fkey;
    END IF;
END $$;

-- Drop legacy unique constraint so we can recreate it later
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ux_report_nodup_mvp'
    ) THEN
        ALTER TABLE report DROP CONSTRAINT ux_report_nodup_mvp;
    END IF;
END $$;

-- Rename column to reflect repository ownership
ALTER TABLE report
    RENAME COLUMN project_id TO repository_id;

-- Relax iid to allow timelogs without an attached issue
ALTER TABLE report
    ALTER COLUMN iid DROP NOT NULL;

-- Add FK to repository table
ALTER TABLE report
    ADD CONSTRAINT fk_report_repository
        FOREIGN KEY (repository_id)
            REFERENCES repository(id)
            ON DELETE CASCADE;

-- Recreate unique constraint using repository_id
ALTER TABLE report
    ADD CONSTRAINT ux_report_repository_entry
        UNIQUE (repository_id, iid, username, spent_at, time_spent_seconds);
