
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
CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";
CREATE OR REPLACE FUNCTION "public"."compute_project_report_cost"("p_project_id" bigint) RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
DECLARE
total NUMERIC(14, 2);
BEGIN
SELECT COALESCE(SUM(
                        CASE
                            WHEN ip.project_id IS NULL OR ip.include_in_reported_cost THEN
                                COALESCE(r.time_spent_hours * COALESCE(p.hourly_rate_czk, r.hourly_rate_czk), 0)
                            WHEN lvl.code = 'employee' THEN
                                0
                            ELSE
                                COALESCE(r.time_spent_hours * COALESCE(p.hourly_rate_czk, r.hourly_rate_czk), 0)
                            END), 0)
INTO total
FROM project p
         JOIN projects_to_repositorie ptr ON ptr.project_id = p.id
         JOIN report r ON r.repository_id = ptr.repository_id
         LEFT JOIN intern i ON i.username = r.username
         LEFT JOIN intern_project ip ON ip.intern_id = i.id AND ip.project_id = p.id
         LEFT JOIN intern_level_history ilh ON ilh.intern_id = i.id
    AND ilh.valid_from <= r.spent_at::date
        AND (ilh.valid_to IS NULL OR ilh.valid_to >= r.spent_at::date)
    LEFT JOIN level lvl ON lvl.id = ilh.level_id
WHERE p.id = p_project_id
  AND (p.budget_from IS NULL OR r.spent_at::date >= p.budget_from)
  AND (p.budget_to IS NULL OR r.spent_at::date <= p.budget_to);
IF total IS NULL THEN
        total := 0;
END IF;
RETURN ROUND(total, 2);
END;
$$;
CREATE OR REPLACE FUNCTION "public"."refresh_project_report_cost"("p_project_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
total NUMERIC(14, 2);
BEGIN
    total := compute_project_report_cost(p_project_id);
UPDATE project
SET reported_cost = total
WHERE id = p_project_id;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."trg_intern_project_refresh"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        PERFORM refresh_project_report_cost(NEW.project_id);
END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM refresh_project_report_cost(OLD.project_id);
END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
END IF;
RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."trg_project_budget_refresh"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    PERFORM refresh_project_report_cost(NEW.id);
RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."trg_project_repository_refresh"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM refresh_project_report_cost(NEW.project_id);
RETURN NEW;
ELSIF TG_OP = 'DELETE' THEN
        PERFORM refresh_project_report_cost(OLD.project_id);
RETURN OLD;
ELSE
        IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
            PERFORM refresh_project_report_cost(OLD.project_id);
END IF;
        PERFORM refresh_project_report_cost(NEW.project_id);
RETURN NEW;
END IF;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."trg_report_refresh"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
loop_project_id BIGINT;
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.repository_id IS NOT NULL THEN
        FOR loop_project_id IN
SELECT DISTINCT ptr.project_id
FROM projects_to_repositorie ptr
WHERE ptr.repository_id = NEW.repository_id
    LOOP
            PERFORM refresh_project_report_cost(loop_project_id);
END LOOP;
END IF;
    IF (TG_OP = 'UPDATE' AND (NEW.repository_id IS DISTINCT FROM OLD.repository_id))
       OR TG_OP = 'DELETE' THEN
        IF OLD.repository_id IS NOT NULL THEN
            FOR loop_project_id IN
SELECT DISTINCT ptr.project_id
FROM projects_to_repositorie ptr
WHERE ptr.repository_id = OLD.repository_id
    LOOP
                PERFORM refresh_project_report_cost(loop_project_id);
END LOOP;
END IF;
END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
END IF;
RETURN NEW;
END;
$$;
SET default_tablespace = '';
SET default_table_access_method = "heap";
CREATE TABLE IF NOT EXISTS "public"."capacity_status" (
                                                          "code" "text" NOT NULL,
                                                          "label" "text" NOT NULL,
                                                          "severity" smallint NOT NULL,
                                                          CONSTRAINT "capacity_status_severity_check" CHECK ((("severity" >= 0) AND ("severity" <= 100)))
    );
CREATE TABLE IF NOT EXISTS "public"."group" (
                                                "id" bigint NOT NULL,
                                                "label" "text" NOT NULL,
                                                "code" integer NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS "public"."group_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."group_id_seq" OWNED BY "public"."group"."id";
CREATE TABLE IF NOT EXISTS "public"."intern" (
                                                 "id" bigint NOT NULL,
                                                 "first_name" "text" NOT NULL,
                                                 "last_name" "text" NOT NULL,
                                                 "username" "text" NOT NULL,
                                                 "level_id" bigint NOT NULL,
                                                 "status_code" "text" DEFAULT 'SATUROVANO'::"text" NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."intern_group" (
                                                       "intern_id" bigint NOT NULL,
                                                       "group_id" bigint NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS "public"."intern_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."intern_id_seq" OWNED BY "public"."intern"."id";
CREATE TABLE IF NOT EXISTS "public"."intern_level_history" (
                                                               "id" bigint NOT NULL,
                                                               "intern_id" bigint NOT NULL,
                                                               "level_id" bigint NOT NULL,
                                                               "valid_from" "date" NOT NULL,
                                                               "valid_to" "date",
                                                               CONSTRAINT "intern_level_history_check" CHECK ((("valid_to" IS NULL) OR ("valid_to" >= "valid_from")))
    );
CREATE SEQUENCE IF NOT EXISTS "public"."intern_level_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."intern_level_history_id_seq" OWNED BY "public"."intern_level_history"."id";
CREATE TABLE IF NOT EXISTS "public"."intern_project" (
                                                         "intern_id" bigint NOT NULL,
                                                         "project_id" bigint NOT NULL,
                                                         "workload_hours" numeric(6,2),
    "include_in_reported_cost" boolean DEFAULT true NOT NULL
    );
CREATE TABLE IF NOT EXISTS "public"."intern_status" (
                                                        "code" "text" NOT NULL,
                                                        "label" "text" NOT NULL,
                                                        "severity" integer NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."intern_status_history" (
                                                                "id" bigint NOT NULL,
                                                                "intern_id" bigint NOT NULL,
                                                                "status_code" "text" NOT NULL,
                                                                "valid_from" "date" NOT NULL,
                                                                "valid_to" "date",
                                                                CONSTRAINT "intern_status_history_check" CHECK ((("valid_to" IS NULL) OR ("valid_to" >= "valid_from")))
    );
CREATE SEQUENCE IF NOT EXISTS "public"."intern_status_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."intern_status_history_id_seq" OWNED BY "public"."intern_status_history"."id";
CREATE TABLE IF NOT EXISTS "public"."report" (
                                                 "id" bigint NOT NULL,
                                                 "repository_id" bigint NOT NULL,
                                                 "iid" bigint,
                                                 "spent_at" timestamp with time zone NOT NULL,
                                                 "time_spent_seconds" integer NOT NULL,
                                                 "username" "text",
                                                 "time_spent_hours" numeric(12,4) NOT NULL,
    "cost" numeric(12,2),
    "unregistered_username" "text",
    "username_fallback" "text" GENERATED ALWAYS AS (COALESCE("username", "unregistered_username")) STORED,
    "hourly_rate_czk" numeric(12,2),
    CONSTRAINT "chk_report_username_presence" CHECK ((("username" IS NOT NULL) OR ("unregistered_username" IS NOT NULL))),
    CONSTRAINT "report_time_spent_seconds_check" CHECK (("time_spent_seconds" <> 0))
    );
CREATE OR REPLACE VIEW "public"."intern_time_summary" AS
SELECT "i"."id" AS "intern_id",
       "i"."username" AS "intern_username",
       COALESCE("sum"("r"."time_spent_seconds"), (0)::bigint) AS "seconds_spent_total",
       COALESCE("sum"("r"."time_spent_hours"), (0)::numeric) AS "hours_spent_total"
FROM ("public"."intern" "i"
    LEFT JOIN "public"."report" "r" ON (("r"."username" = "i"."username")))
GROUP BY "i"."id", "i"."username";
CREATE TABLE IF NOT EXISTS "public"."issue" (
                                                "id" bigint NOT NULL,
                                                "repository_id" bigint,
                                                "gitlab_issue_id" bigint,
                                                "iid" bigint NOT NULL,
                                                "title" "text" NOT NULL,
                                                "state" "text" NOT NULL,
                                                "assignee_id" bigint,
                                                "assignee_username" "text",
                                                "author_name" "text",
                                                "labels" "text"[],
                                                "due_date" "date",
                                                "time_estimate_seconds" integer,
                                                "total_time_spent_seconds" integer,
                                                "updated_at" timestamp with time zone,
                                                "milestone_title" "text",
                                                "milestone_state" "text",
                                                "created_at" timestamp with time zone,
                                                "web_url" "text",
                                                "human_time_estimate" "text"
);
CREATE SEQUENCE IF NOT EXISTS "public"."issue_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."issue_id_seq" OWNED BY "public"."issue"."id";
CREATE TABLE IF NOT EXISTS "public"."level" (
                                                "id" bigint NOT NULL,
                                                "code" "text" NOT NULL,
                                                "label" "text" NOT NULL,
                                                "hourly_rate_czk" numeric(12,2) NOT NULL,
    CONSTRAINT "level_hourly_rate_czk_check" CHECK (("hourly_rate_czk" >= (0)::numeric))
    );
CREATE SEQUENCE IF NOT EXISTS "public"."level_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."level_id_seq" OWNED BY "public"."level"."id";
CREATE TABLE IF NOT EXISTS "public"."milestone" (
                                                    "milestone_id" bigint NOT NULL,
                                                    "milestone_iid" bigint NOT NULL,
                                                    "title" "text" NOT NULL,
                                                    "state" "text" NOT NULL,
                                                    "due_date" "date",
                                                    "created_at" timestamp with time zone,
                                                    "updated_at" timestamp with time zone,
                                                    "project_id" bigint NOT NULL,
                                                    "description" "text"
);
CREATE TABLE IF NOT EXISTS "public"."project" (
                                                  "id" bigint NOT NULL,
                                                  "name" "text" NOT NULL,
                                                  "namespace_id" bigint,
                                                  "budget" integer,
                                                  "budget_from" "date",
                                                  "budget_to" "date",
                                                  "reported_cost" numeric(14,2) DEFAULT 0 NOT NULL,
    "namespace_name" "text",
    "hourly_rate_czk" numeric(12,2),
    "is_external" boolean DEFAULT false NOT NULL,
    CONSTRAINT "project_external_rate_check" CHECK (("is_external" OR ("hourly_rate_czk" IS NULL)))
    );
CREATE TABLE IF NOT EXISTS "public"."projects_to_repositorie" (
                                                                  "project_id" bigint NOT NULL,
                                                                  "repository_id" bigint NOT NULL
);
CREATE OR REPLACE VIEW "public"."milestone_report_cost" AS
SELECT "m"."milestone_id",
       "m"."project_id",
       "round"(COALESCE("sum"(("r"."time_spent_hours" * COALESCE("p"."hourly_rate_czk", "r"."hourly_rate_czk"))), (0)::numeric), 2) AS "total_cost"
FROM (((("public"."milestone" "m"
    JOIN "public"."project" "p" ON (("p"."id" = "m"."project_id")))
    LEFT JOIN "public"."projects_to_repositorie" "ptr" ON (("ptr"."project_id" = "m"."project_id")))
    LEFT JOIN "public"."issue" "iss" ON ((("iss"."repository_id" = "ptr"."repository_id") AND ("iss"."milestone_title" = "m"."title"))))
    LEFT JOIN "public"."report" "r" ON ((("r"."repository_id" = "iss"."repository_id") AND ("r"."iid" = "iss"."iid") AND (("p"."budget_from" IS NULL) OR (("r"."spent_at")::"date" >= "p"."budget_from")) AND (("p"."budget_to" IS NULL) OR (("r"."spent_at")::"date" <= "p"."budget_to")))))
GROUP BY "m"."milestone_id", "m"."project_id";
CREATE TABLE IF NOT EXISTS "public"."project_capacity_report" (
                                                                  "id" bigint NOT NULL,
                                                                  "project_id" bigint NOT NULL,
                                                                  "reported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text"
    );
CREATE SEQUENCE IF NOT EXISTS "public"."project_capacity_report_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."project_capacity_report_id_seq" OWNED BY "public"."project_capacity_report"."id";
CREATE TABLE IF NOT EXISTS "public"."project_capacity_report_status" (
                                                                         "report_id" bigint NOT NULL,
                                                                         "status_code" "text" NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS "public"."project_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."project_id_seq" OWNED BY "public"."project"."id";
CREATE SEQUENCE IF NOT EXISTS "public"."report_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."report_id_seq" OWNED BY "public"."report"."id";
CREATE TABLE IF NOT EXISTS "public"."repository" (
                                                     "id" bigint NOT NULL,
                                                     "gitlab_repo_id" bigint,
                                                     "name" "text" NOT NULL,
                                                     "name_with_namespace" "text" NOT NULL,
                                                     "namespace_id" bigint,
                                                     "namespace_name" "text",
                                                     "root_repo" boolean DEFAULT false NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS "public"."repository_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."repository_id_seq" OWNED BY "public"."repository"."id";
CREATE TABLE IF NOT EXISTS "public"."sync_cursor_repo" (
                                                           "repository_id" bigint NOT NULL,
                                                           "scope" "text" NOT NULL,
                                                           "last_run_at" timestamp with time zone NOT NULL
);
ALTER TABLE ONLY "public"."group" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."group_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."intern" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."intern_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."intern_level_history" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."intern_level_history_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."intern_status_history" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."intern_status_history_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."issue" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."issue_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."level" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."level_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."project" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."project_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."project_capacity_report" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."project_capacity_report_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."report" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."report_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."repository" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."repository_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."capacity_status"
    ADD CONSTRAINT "capacity_status_pkey" PRIMARY KEY ("code");
ALTER TABLE ONLY "public"."group"
    ADD CONSTRAINT "group_code_unique" UNIQUE ("code");
ALTER TABLE ONLY "public"."group"
    ADD CONSTRAINT "group_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."intern_group"
    ADD CONSTRAINT "intern_group_pkey" PRIMARY KEY ("intern_id", "group_id");
ALTER TABLE ONLY "public"."intern_level_history"
    ADD CONSTRAINT "intern_level_history_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."intern"
    ADD CONSTRAINT "intern_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."intern_project"
    ADD CONSTRAINT "intern_project_pkey" PRIMARY KEY ("intern_id", "project_id");
ALTER TABLE ONLY "public"."intern_status_history"
    ADD CONSTRAINT "intern_status_history_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."intern_status"
    ADD CONSTRAINT "intern_status_pkey" PRIMARY KEY ("code");
ALTER TABLE ONLY "public"."intern"
    ADD CONSTRAINT "intern_username_key" UNIQUE ("username");
ALTER TABLE ONLY "public"."issue"
    ADD CONSTRAINT "issue_gitlab_issue_id_key" UNIQUE ("gitlab_issue_id");
ALTER TABLE ONLY "public"."issue"
    ADD CONSTRAINT "issue_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."level"
    ADD CONSTRAINT "level_code_key" UNIQUE ("code");
ALTER TABLE ONLY "public"."level"
    ADD CONSTRAINT "level_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."milestone"
    ADD CONSTRAINT "milestone_pkey" PRIMARY KEY ("milestone_id");
ALTER TABLE ONLY "public"."project_capacity_report"
    ADD CONSTRAINT "project_capacity_report_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_capacity_report_status"
    ADD CONSTRAINT "project_capacity_report_status_pkey" PRIMARY KEY ("report_id", "status_code");
ALTER TABLE ONLY "public"."project"
    ADD CONSTRAINT "project_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."projects_to_repositorie"
    ADD CONSTRAINT "projects_to_repositorie_pkey" PRIMARY KEY ("project_id", "repository_id");
ALTER TABLE ONLY "public"."report"
    ADD CONSTRAINT "report_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."repository"
    ADD CONSTRAINT "repository_gitlab_repo_id_key" UNIQUE ("gitlab_repo_id");
ALTER TABLE ONLY "public"."repository"
    ADD CONSTRAINT "repository_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."sync_cursor_repo"
    ADD CONSTRAINT "sync_cursor_repo_pkey" PRIMARY KEY ("repository_id", "scope");
ALTER TABLE ONLY "public"."issue"
    ADD CONSTRAINT "ux_issue_repo_iid" UNIQUE ("repository_id", "iid");
ALTER TABLE ONLY "public"."report"
    ADD CONSTRAINT "ux_report_repository_entry" UNIQUE ("repository_id", "iid", "username_fallback", "spent_at", "time_spent_seconds");
CREATE INDEX "idx_intern_status_code" ON "public"."intern" USING "btree" ("status_code");
CREATE INDEX "idx_issue_assignee_username" ON "public"."issue" USING "btree" ("assignee_username");
CREATE INDEX "idx_issue_repo" ON "public"."issue" USING "btree" ("repository_id");
CREATE INDEX "idx_issue_updated_at" ON "public"."issue" USING "btree" ("updated_at");
CREATE INDEX "idx_milestone_project" ON "public"."milestone" USING "btree" ("project_id");
CREATE INDEX "idx_project_capacity_report_project" ON "public"."project_capacity_report" USING "btree" ("project_id", "reported_at" DESC);
CREATE INDEX "idx_project_capacity_report_status_report" ON "public"."project_capacity_report_status" USING "btree" ("report_id");
CREATE INDEX "idx_report_cost_not_null" ON "public"."report" USING "btree" ("cost") WHERE ("cost" IS NOT NULL);
CREATE INDEX "idx_report_spent_at" ON "public"."report" USING "btree" ("spent_at");
CREATE INDEX "idx_report_unregistered_username" ON "public"."report" USING "btree" ("unregistered_username") WHERE ("unregistered_username" IS NOT NULL);
CREATE INDEX "idx_report_username" ON "public"."report" USING "btree" ("username");
CREATE INDEX "intern_level_hist_excl_idx" ON "public"."intern_level_history" USING "gist" ("intern_id", "daterange"("valid_from", COALESCE("valid_to", 'infinity'::"date"), '[]'::"text"));
CREATE INDEX "intern_status_hist_excl_idx" ON "public"."intern_status_history" USING "gist" ("intern_id", "daterange"("valid_from", COALESCE("valid_to", 'infinity'::"date"), '[]'::"text"));
CREATE UNIQUE INDEX "ux_milestone_project_iid" ON "public"."milestone" USING "btree" ("project_id", "milestone_iid");
CREATE UNIQUE INDEX "ux_project_namespace_id" ON "public"."project" USING "btree" ("namespace_id") WHERE ("namespace_id" IS NOT NULL);
CREATE OR REPLACE TRIGGER "intern_project_refresh" AFTER INSERT OR DELETE OR UPDATE ON "public"."intern_project" FOR EACH ROW EXECUTE FUNCTION "public"."trg_intern_project_refresh"();
CREATE OR REPLACE TRIGGER "project_budget_refresh" AFTER UPDATE OF "budget_from", "budget_to", "hourly_rate_czk", "is_external" ON "public"."project" FOR EACH ROW EXECUTE FUNCTION "public"."trg_project_budget_refresh"();
CREATE OR REPLACE TRIGGER "project_repository_refresh" AFTER INSERT OR DELETE OR UPDATE ON "public"."projects_to_repositorie" FOR EACH ROW EXECUTE FUNCTION "public"."trg_project_repository_refresh"();
CREATE OR REPLACE TRIGGER "report_refresh_project_cost" AFTER INSERT OR DELETE OR UPDATE ON "public"."report" FOR EACH ROW EXECUTE FUNCTION "public"."trg_report_refresh"();
ALTER TABLE ONLY "public"."report"
    ADD CONSTRAINT "fk_report_intern_username" FOREIGN KEY ("username") REFERENCES "public"."intern"("username") ON UPDATE CASCADE ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE ONLY "public"."report"
    ADD CONSTRAINT "fk_report_repository" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."intern_group"
    ADD CONSTRAINT "intern_group_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."intern_group"
    ADD CONSTRAINT "intern_group_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "public"."intern"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."intern"
    ADD CONSTRAINT "intern_level_fk" FOREIGN KEY ("level_id") REFERENCES "public"."level"("id") ON UPDATE CASCADE;
ALTER TABLE ONLY "public"."intern_level_history"
    ADD CONSTRAINT "intern_level_history_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "public"."intern"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."intern_level_history"
    ADD CONSTRAINT "intern_level_history_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "public"."level"("id");
ALTER TABLE ONLY "public"."intern_project"
    ADD CONSTRAINT "intern_project_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "public"."intern"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."intern_project"
    ADD CONSTRAINT "intern_project_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."intern"
    ADD CONSTRAINT "intern_status_fk" FOREIGN KEY ("status_code") REFERENCES "public"."intern_status"("code");
ALTER TABLE ONLY "public"."intern_status_history"
    ADD CONSTRAINT "intern_status_history_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "public"."intern"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."intern_status_history"
    ADD CONSTRAINT "intern_status_history_status_code_fkey" FOREIGN KEY ("status_code") REFERENCES "public"."intern_status"("code");
ALTER TABLE ONLY "public"."issue"
    ADD CONSTRAINT "issue_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."milestone"
    ADD CONSTRAINT "milestone_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_capacity_report"
    ADD CONSTRAINT "project_capacity_report_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_capacity_report_status"
    ADD CONSTRAINT "project_capacity_report_status_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."project_capacity_report"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_capacity_report_status"
    ADD CONSTRAINT "project_capacity_report_status_status_code_fkey" FOREIGN KEY ("status_code") REFERENCES "public"."capacity_status"("code");
ALTER TABLE ONLY "public"."projects_to_repositorie"
    ADD CONSTRAINT "projects_to_repositorie_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."projects_to_repositorie"
    ADD CONSTRAINT "projects_to_repositorie_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."sync_cursor_repo"
    ADD CONSTRAINT "sync_cursor_repo_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE CASCADE;
RESET ALL;

