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

DROP INDEX IF EXISTS "public"."idx_weekly_task_day_of_week";

ALTER TABLE "public"."weekly_task"
    DROP CONSTRAINT IF EXISTS "weekly_task_day_of_week_check";

ALTER TABLE "public"."weekly_task"
    DROP COLUMN IF EXISTS "day_of_week";
