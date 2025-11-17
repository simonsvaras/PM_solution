SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE "public"."weekly_task"
    ADD COLUMN IF NOT EXISTS "project_id" bigint;

ALTER TABLE "public"."weekly_task"
    ADD COLUMN IF NOT EXISTS "sprint_id" bigint;

UPDATE "public"."weekly_task" wt
SET project_id = pw.project_id,
    sprint_id = pw.sprint_id
FROM "public"."project_week" pw
WHERE wt.project_week_id = pw.id
  AND (wt.project_id IS NULL OR wt.sprint_id IS NULL);

ALTER TABLE "public"."weekly_task"
    ALTER COLUMN "project_id" SET NOT NULL;

ALTER TABLE "public"."weekly_task"
    ALTER COLUMN "sprint_id" SET NOT NULL;

ALTER TABLE "public"."weekly_task"
    ADD CONSTRAINT "weekly_task_project_fk"
        FOREIGN KEY ("project_id")
        REFERENCES "public"."project"("id")
        ON DELETE CASCADE;

ALTER TABLE "public"."weekly_task"
    ADD CONSTRAINT "weekly_task_sprint_fk"
        FOREIGN KEY ("sprint_id")
        REFERENCES "public"."planning_sprint"("id")
        ON DELETE CASCADE;

ALTER TABLE "public"."weekly_task"
    ALTER COLUMN "project_week_id" DROP NOT NULL;

ALTER TABLE "public"."weekly_task"
    DROP CONSTRAINT IF EXISTS "weekly_task_day_of_week_check";

ALTER TABLE "public"."weekly_task"
    ADD CONSTRAINT "weekly_task_day_of_week_check"
        CHECK ("day_of_week" IS NULL OR ("day_of_week" >= 1 AND "day_of_week" <= 7));

CREATE INDEX IF NOT EXISTS "idx_weekly_task_project"
    ON "public"."weekly_task" USING "btree" ("project_id");

CREATE INDEX IF NOT EXISTS "idx_weekly_task_sprint"
    ON "public"."weekly_task" USING "btree" ("sprint_id");
