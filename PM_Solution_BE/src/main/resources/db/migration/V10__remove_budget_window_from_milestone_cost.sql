-- Remove project budget window filtering from milestone_report_cost so that
-- every report tied to an issue within the milestone is counted.
CREATE OR REPLACE VIEW "public"."milestone_report_cost" AS
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
