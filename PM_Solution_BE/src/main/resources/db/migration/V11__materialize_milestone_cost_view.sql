-- Recreate milestone_report_cost as a materialized view so it can be refreshed
-- after syncing reports while still counting all issue-linked costs.
DROP VIEW IF EXISTS "public"."milestone_report_cost";
DROP MATERIALIZED VIEW IF EXISTS "public"."milestone_report_cost";

CREATE MATERIALIZED VIEW "public"."milestone_report_cost" AS
SELECT "m"."milestone_id",
       "m"."project_id",
       round(
           COALESCE(sum("r"."time_spent_hours" * COALESCE("p"."hourly_rate_czk", "r"."hourly_rate_czk")), (0)::numeric),
           2
       ) AS "total_cost"
FROM (((("public"."milestone" "m"
    JOIN "public"."project" "p" ON ("p"."id" = "m"."project_id"))
    LEFT JOIN "public"."projects_to_repositorie" "ptr" ON ("ptr"."project_id" = "m"."project_id"))
    LEFT JOIN "public"."issue" "iss" ON (("iss"."repository_id" = "ptr"."repository_id") AND ("iss"."milestone_title" = "m"."title")))
    LEFT JOIN "public"."report" "r" ON (("r"."repository_id" = "iss"."repository_id") AND ("r"."iid" = "iss"."iid")))
GROUP BY "m"."milestone_id", "m"."project_id";

ALTER MATERIALIZED VIEW "public"."milestone_report_cost" OWNER TO "postgres";
GRANT SELECT ON TABLE "public"."milestone_report_cost" TO "anon";
GRANT SELECT ON TABLE "public"."milestone_report_cost" TO "authenticated";
GRANT SELECT ON TABLE "public"."milestone_report_cost" TO "service_role";
