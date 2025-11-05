ALTER TABLE issue
    ADD COLUMN created_at TIMESTAMPTZ;

UPDATE issue
SET created_at = updated_at
WHERE created_at IS NULL;
