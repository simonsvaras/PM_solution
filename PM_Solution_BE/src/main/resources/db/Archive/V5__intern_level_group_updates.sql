-- V5__intern_level_group_updates.sql
-- Update group.code to integer, add level relation to intern, and backfill history records

-- 1) Change group.code from TEXT to INTEGER
ALTER TABLE "group" ADD COLUMN code_new INTEGER;
WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
    FROM "group"
)
UPDATE "group" g
SET code_new = ordered.rn
FROM ordered
WHERE g.id = ordered.id;
ALTER TABLE "group" DROP CONSTRAINT IF EXISTS group_code_key;
ALTER TABLE "group" DROP COLUMN code;
ALTER TABLE "group" RENAME COLUMN code_new TO code;
ALTER TABLE "group" ALTER COLUMN code SET NOT NULL;
ALTER TABLE "group" ADD CONSTRAINT group_code_unique UNIQUE (code);

-- 2) Add level reference to intern table
ALTER TABLE intern ADD COLUMN level_id BIGINT;
ALTER TABLE intern
    ADD CONSTRAINT intern_level_fk FOREIGN KEY (level_id) REFERENCES level(id) ON UPDATE CASCADE;

WITH default_level AS (
    SELECT id AS lvl FROM level ORDER BY id LIMIT 1
)
UPDATE intern
SET level_id = default_level.lvl
FROM default_level
WHERE intern.level_id IS NULL;

ALTER TABLE intern ALTER COLUMN level_id SET NOT NULL;

-- 3) Ensure every intern has a current entry in intern_level_history
INSERT INTO intern_level_history (intern_id, level_id, valid_from, valid_to)
SELECT i.id, i.level_id, CURRENT_DATE, NULL
FROM intern i
WHERE NOT EXISTS (
    SELECT 1 FROM intern_level_history h WHERE h.intern_id = i.id
);
