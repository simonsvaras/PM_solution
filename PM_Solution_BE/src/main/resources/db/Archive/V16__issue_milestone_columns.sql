-- V16__issue_milestone_columns.sql
-- Add milestone metadata to issues table

ALTER TABLE issue
    ADD COLUMN IF NOT EXISTS milestone_title TEXT,
    ADD COLUMN IF NOT EXISTS milestone_state TEXT;
