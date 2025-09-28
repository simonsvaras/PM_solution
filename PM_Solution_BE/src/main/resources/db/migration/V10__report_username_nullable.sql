-- V10__report_username_nullable.sql
-- Allow report.username to be nulled when an intern account is removed.

ALTER TABLE report
    ALTER COLUMN username DROP NOT NULL;
