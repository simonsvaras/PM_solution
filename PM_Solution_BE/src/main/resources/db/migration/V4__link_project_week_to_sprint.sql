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

ALTER TABLE "public"."project_week"
    ADD COLUMN IF NOT EXISTS "sprint_id" bigint;

ALTER TABLE "public"."project_week"
    DROP CONSTRAINT IF EXISTS "project_week_sprint_fk";

ALTER TABLE "public"."project_week"
    ADD CONSTRAINT "project_week_sprint_fk"
        FOREIGN KEY ("sprint_id")
        REFERENCES "public"."planning_sprint"("id")
        ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_project_week_sprint"
    ON "public"."project_week" USING "btree" ("sprint_id");

CREATE INDEX IF NOT EXISTS "idx_project_week_project_sprint"
    ON "public"."project_week" USING "btree" ("project_id", "sprint_id", "week_start_date");
