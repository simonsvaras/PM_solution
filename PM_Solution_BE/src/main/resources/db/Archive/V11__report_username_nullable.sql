-- Allow nullable usernames in report table so FK ON DELETE SET NULL succeeds
ALTER TABLE report
    ALTER COLUMN username DROP NOT NULL;
