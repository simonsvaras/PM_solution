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
    ALTER COLUMN "day_of_week" DROP NOT NULL;

UPDATE "public"."weekly_task"
SET day_of_week = NULL
WHERE project_week_id IS NULL;
