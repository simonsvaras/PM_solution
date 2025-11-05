-- V19__project_namespace.sql
-- Map projects to GitLab namespaces instead of projects

-- Rename the previous GitLab project mapping column and keep values intact
ALTER TABLE project
    RENAME COLUMN gitlab_project_id TO namespace_id;

-- Optional human readable namespace label
ALTER TABLE project
    ADD COLUMN IF NOT EXISTS namespace_name TEXT;

-- Keep the unique constraint on namespace identifier if present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'ux_project_gitlab_id'
    ) THEN
        EXECUTE 'ALTER INDEX ux_project_gitlab_id RENAME TO ux_project_namespace_id';
    END IF;
END $$;
