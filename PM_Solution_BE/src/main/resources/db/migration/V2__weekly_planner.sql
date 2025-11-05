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

-- Add project.week_start_day with default Monday (ISO weekday 1)
ALTER TABLE "public"."project"
    ADD COLUMN IF NOT EXISTS "week_start_day" smallint DEFAULT 1;

UPDATE "public"."project"
SET "week_start_day" = 1
WHERE "week_start_day" IS NULL;

ALTER TABLE "public"."project"
    ALTER COLUMN "week_start_day" SET NOT NULL;

ALTER TABLE "public"."project"
    ADD CONSTRAINT IF NOT EXISTS "project_week_start_day_check" CHECK (("week_start_day" >= 1 AND "week_start_day" <= 7));

CREATE INDEX IF NOT EXISTS "idx_project_week_start_day"
    ON "public"."project" USING "btree" ("week_start_day");

-- Helper function to automatically update updated_at
CREATE OR REPLACE FUNCTION "public"."set_updated_at_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Table storing per-project weekly planning metadata
CREATE TABLE IF NOT EXISTS "public"."project_week" (
    "id" bigserial PRIMARY KEY,
    "project_id" bigint NOT NULL,
    "week_start_date" date NOT NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT NOW(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT NOW(),
    CONSTRAINT "project_week_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE,
    CONSTRAINT "project_week_unique_week" UNIQUE ("project_id", "week_start_date")
);

ALTER TABLE "public"."project_week" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "idx_project_week_project_week_start"
    ON "public"."project_week" USING "btree" ("project_id", "week_start_date");

CREATE TRIGGER "trg_project_week_set_updated_at"
    BEFORE UPDATE ON "public"."project_week"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."set_updated_at_timestamp"();

-- Tasks planned for specific days within a project week
CREATE TABLE IF NOT EXISTS "public"."weekly_task" (
    "id" bigserial PRIMARY KEY,
    "project_week_id" bigint NOT NULL,
    "intern_id" bigint,
    "issue_id" bigint,
    "day_of_week" smallint NOT NULL,
    "note" text,
    "planned_hours" numeric(5,2),
    "created_at" timestamp with time zone NOT NULL DEFAULT NOW(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT NOW(),
    CONSTRAINT "weekly_task_day_of_week_check" CHECK (("day_of_week" >= 1 AND "day_of_week" <= 7)),
    CONSTRAINT "weekly_task_project_week_fk" FOREIGN KEY ("project_week_id") REFERENCES "public"."project_week"("id") ON DELETE CASCADE,
    CONSTRAINT "weekly_task_intern_fk" FOREIGN KEY ("intern_id") REFERENCES "public"."intern"("id") ON DELETE SET NULL,
    CONSTRAINT "weekly_task_issue_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE SET NULL
);

ALTER TABLE "public"."weekly_task" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "idx_weekly_task_project_week_id"
    ON "public"."weekly_task" USING "btree" ("project_week_id");

CREATE INDEX IF NOT EXISTS "idx_weekly_task_intern_id"
    ON "public"."weekly_task" USING "btree" ("intern_id");

CREATE INDEX IF NOT EXISTS "idx_weekly_task_issue_id"
    ON "public"."weekly_task" USING "btree" ("issue_id");

CREATE INDEX IF NOT EXISTS "idx_weekly_task_day_of_week"
    ON "public"."weekly_task" USING "btree" ("day_of_week");

CREATE TRIGGER "trg_weekly_task_set_updated_at"
    BEFORE UPDATE ON "public"."weekly_task"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."set_updated_at_timestamp"();

