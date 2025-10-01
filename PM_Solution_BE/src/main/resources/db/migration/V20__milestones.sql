-- V20__milestones.sql
-- Store GitLab milestones mapped to local projects via namespace.

CREATE TABLE IF NOT EXISTS milestone (
    milestone_id   BIGINT PRIMARY KEY,
    milestone_iid  BIGINT        NOT NULL,
    title          TEXT          NOT NULL,
    state          TEXT          NOT NULL,
    due_date       DATE          NULL,
    created_at     TIMESTAMPTZ   NULL,
    updated_at     TIMESTAMPTZ   NULL,
    project_id     BIGINT        NOT NULL REFERENCES project(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_milestone_project_iid
    ON milestone(project_id, milestone_iid);

CREATE INDEX IF NOT EXISTS idx_milestone_project
    ON milestone(project_id);
