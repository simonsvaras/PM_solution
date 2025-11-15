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

CREATE TABLE IF NOT EXISTS "public"."planning_sprint" (
    "id" bigserial PRIMARY KEY,
    "project_id" bigint NOT NULL REFERENCES "public"."project"("id") ON DELETE CASCADE,
    "name" varchar(255) NOT NULL,
    "description" text,
    "deadline" date,
    "status" varchar(32) NOT NULL DEFAULT 'OPEN',
    "created_at" timestamp with time zone NOT NULL DEFAULT NOW(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT NOW(),
    CONSTRAINT "planning_sprint_status_check" CHECK (("status"::text = ANY (ARRAY['OPEN'::text, 'CLOSED'::text])))
);

CREATE INDEX IF NOT EXISTS "idx_planning_sprint_project_id"
    ON "public"."planning_sprint" USING "btree" ("project_id");

CREATE INDEX IF NOT EXISTS "idx_planning_sprint_deadline"
    ON "public"."planning_sprint" USING "btree" ("deadline");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_planning_sprint_open_per_project"
    ON "public"."planning_sprint" USING "btree" ("project_id")
    WHERE "status" = 'OPEN';

CREATE TRIGGER "trg_planning_sprint_set_updated_at"
    BEFORE UPDATE ON "public"."planning_sprint"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."set_updated_at_timestamp"();
