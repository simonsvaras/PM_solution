-- V3__repository_m2m.sql
-- Switch repository->project relation to M:N via junction table

-- 1) Create junction table for project <-> repository (M:N)
CREATE TABLE IF NOT EXISTS projects_to_repositorie (
    project_id    BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    repository_id BIGINT NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, repository_id)
);

-- 2) Migrate existing 1:N links (if any) into junction table
INSERT INTO projects_to_repositorie (project_id, repository_id)
SELECT project_id, id FROM repository WHERE project_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3) Drop old index and column on repository
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'i' AND c.relname = 'idx_repository_project'
    ) THEN
        EXECUTE 'DROP INDEX idx_repository_project';
    END IF;
END $$;

ALTER TABLE repository
    DROP COLUMN IF EXISTS project_id;

