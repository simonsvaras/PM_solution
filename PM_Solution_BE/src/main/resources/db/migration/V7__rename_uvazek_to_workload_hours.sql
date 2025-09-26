-- V7__rename_uvazek_to_workload_hours.sql
-- Rename the intern workload column to an English name
ALTER TABLE intern_project
    RENAME COLUMN uvazek TO workload_hours;
