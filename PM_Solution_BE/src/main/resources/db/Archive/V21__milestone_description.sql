-- V21__milestone_description.sql
-- Add description column to milestone records synced from GitLab.

ALTER TABLE milestone
    ADD COLUMN IF NOT EXISTS description TEXT;
