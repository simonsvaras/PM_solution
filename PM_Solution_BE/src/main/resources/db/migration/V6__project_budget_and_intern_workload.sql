-- V6__project_budget_and_intern_workload.sql
-- Add budget metadata to projects and workload tracking for intern assignments

ALTER TABLE intern_project
    ADD COLUMN uvazek NUMERIC(6,2);

ALTER TABLE project
    ADD COLUMN budget INTEGER,
    ADD COLUMN budget_from DATE,
    ADD COLUMN budget_to DATE;
