-- V23__issue_web_url_human_estimate.sql
-- Adds GitLab metadata fields to the local issue cache

ALTER TABLE issue
    ADD COLUMN IF NOT EXISTS web_url TEXT;

ALTER TABLE issue
    ADD COLUMN IF NOT EXISTS human_time_estimate TEXT;
