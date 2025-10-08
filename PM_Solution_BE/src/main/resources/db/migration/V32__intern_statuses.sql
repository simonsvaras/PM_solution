-- V32__intern_statuses.sql
-- Adds reference data and history tracking for intern workload statuses.

-- 1) Reference table storing available intern statuses with severity ordering for FE highlighting.
CREATE TABLE intern_status (
    code     TEXT PRIMARY KEY,
    label    TEXT NOT NULL,
    severity INTEGER NOT NULL
);

-- Pre-populate the catalog with the three requested business states.
INSERT INTO intern_status (code, label, severity) VALUES
    ('VOLNE_CAPACITY', 'Volné kapacity', 10),
    ('SATUROVAN', 'Saturován', 20),
    ('PRETIZEN', 'Přetížen', 30);

-- 2) Persist the current status on the intern aggregate for quick filtering.
ALTER TABLE intern
    ADD COLUMN status_code TEXT;

-- Default all existing rows to "Volné kapacity" so the NOT NULL constraint can be applied.
UPDATE intern SET status_code = 'VOLNE_CAPACITY' WHERE status_code IS NULL;

-- Enforce referential integrity against the catalog.
ALTER TABLE intern
    ALTER COLUMN status_code SET NOT NULL,
    ADD CONSTRAINT intern_status_fk FOREIGN KEY (status_code) REFERENCES intern_status(code);

-- 3) Track historical changes similarly to intern_level_history for audit purposes.
CREATE TABLE intern_status_history (
    id           BIGSERIAL PRIMARY KEY,
    intern_id    BIGINT NOT NULL REFERENCES intern(id) ON DELETE CASCADE,
    status_code  TEXT NOT NULL REFERENCES intern_status(code),
    valid_from   DATE NOT NULL,
    valid_to     DATE NULL,
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- Prevent overlapping ranges per intern (requires btree_gist from V1).
CREATE INDEX IF NOT EXISTS intern_status_hist_excl_idx
    ON intern_status_history
    USING GIST (intern_id, daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]'));

-- Backfill a single open record reflecting the current status for each intern.
INSERT INTO intern_status_history (intern_id, status_code, valid_from, valid_to)
SELECT i.id, i.status_code, CURRENT_DATE, NULL
FROM intern i;

-- 4) Optional helper index for dashboards filtering by current status.
CREATE INDEX IF NOT EXISTS idx_intern_status_code ON intern(status_code);
