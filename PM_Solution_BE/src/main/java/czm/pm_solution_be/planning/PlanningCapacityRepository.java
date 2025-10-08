package czm.pm_solution_be.planning;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

/**
 * Repository responsible for aggregating current capacity information for planning dashboards.
 */
@Repository
public class PlanningCapacityRepository {

    private static final String SQL_PROJECT_STATUS_COUNTS =
            """
            WITH latest AS (
                SELECT DISTINCT ON (r.project_id) r.id,
                                                r.project_id
                FROM project_capacity_report r
                ORDER BY r.project_id, r.reported_at DESC, r.id DESC
            ),
            latest_statuses AS (
                SELECT l.project_id,
                       rs.status_code
                FROM latest l
                JOIN project_capacity_report_status rs ON rs.report_id = l.id
            )
            SELECT cs.code,
                   cs.label,
                   cs.severity,
                   COUNT(DISTINCT ls.project_id) AS status_count
            FROM capacity_status cs
            LEFT JOIN latest_statuses ls ON ls.status_code = cs.code
            GROUP BY cs.code, cs.label, cs.severity
            ORDER BY cs.severity DESC, cs.code ASC
            """;

    private static final String SQL_PROJECTS_BY_STATUS =
            """
            WITH latest AS (
                SELECT DISTINCT ON (r.project_id) r.id,
                                                r.project_id
                FROM project_capacity_report r
                ORDER BY r.project_id, r.reported_at DESC, r.id DESC
            ),
            latest_statuses AS (
                SELECT l.project_id,
                       rs.status_code
                FROM latest l
                JOIN project_capacity_report_status rs ON rs.report_id = l.id
            )
            SELECT ls.status_code,
                   p.id          AS project_id,
                   p.name        AS project_name
            FROM latest_statuses ls
            JOIN project p ON p.id = ls.project_id
            ORDER BY ls.status_code ASC, p.name ASC
            """;

    private static final String SQL_PROJECT_TOTAL = "SELECT COUNT(*) FROM project";

    private static final String SQL_INTERN_STATUS_COUNTS =
            """
            SELECT s.code,
                   s.label,
                   s.severity,
                   COUNT(i.id) AS status_count
            FROM intern_status s
            LEFT JOIN intern i ON i.status_code = s.code
            GROUP BY s.code, s.label, s.severity
            ORDER BY s.severity DESC, s.code ASC
            """;

    private static final String SQL_INTERNS_BY_STATUS =
            """
            SELECT i.status_code,
                   i.id   AS intern_id,
                   concat_ws(' ', i.first_name, i.last_name) AS intern_name,
                   l.label AS level_label,
                   array_agg(g.label ORDER BY g.label) AS group_labels
            FROM intern i
            JOIN level l ON l.id = i.level_id
            LEFT JOIN intern_group ig ON ig.intern_id = i.id
            LEFT JOIN "group" g ON g.id = ig.group_id
            GROUP BY i.status_code, i.id, intern_name, l.label
            ORDER BY i.status_code ASC, intern_name ASC
            """;

    private static final String SQL_INTERN_TOTAL = "SELECT COUNT(*) FROM intern";

    private final JdbcTemplate jdbc;

    public PlanningCapacityRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<StatusCountRow> STATUS_COUNT_MAPPER = new RowMapper<>() {
        @Override
        public StatusCountRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new StatusCountRow(
                    rs.getString("code"),
                    rs.getString("label"),
                    rs.getInt("severity"),
                    rs.getLong("status_count"));
        }
    };

    public List<StatusCountRow> loadProjectStatusCounts() {
        return jdbc.query(SQL_PROJECT_STATUS_COUNTS, STATUS_COUNT_MAPPER);
    }

    public List<ProjectStatusAssignmentRow> loadProjectsByStatus() {
        return jdbc.query(SQL_PROJECTS_BY_STATUS, new RowMapper<>() {
            @Override
            public ProjectStatusAssignmentRow mapRow(ResultSet rs, int rowNum) throws SQLException {
                return new ProjectStatusAssignmentRow(
                        rs.getString("status_code"),
                        rs.getLong("project_id"),
                        rs.getString("project_name"));
            }
        });
    }

    public long countProjects() {
        Long total = jdbc.queryForObject(SQL_PROJECT_TOTAL, Long.class);
        return total == null ? 0L : total;
    }

    public List<StatusCountRow> loadInternStatusCounts() {
        return jdbc.query(SQL_INTERN_STATUS_COUNTS, STATUS_COUNT_MAPPER);
    }

    public List<InternStatusAssignmentRow> loadInternsByStatus() {
        return jdbc.query(SQL_INTERNS_BY_STATUS, new RowMapper<>() {
            @Override
            public InternStatusAssignmentRow mapRow(ResultSet rs, int rowNum) throws SQLException {
                java.sql.Array sqlArray = rs.getArray("group_labels");
                List<String> groupLabels = List.of();
                if (sqlArray != null) {
                    Object array = sqlArray.getArray();
                    if (array instanceof String[] strings) {
                        groupLabels = Arrays.stream(strings)
                                .filter(Objects::nonNull)
                                .toList();
                    } else if (array instanceof Object[] objects) {
                        groupLabels = Arrays.stream(objects)
                                .filter(Objects::nonNull)
                                .map(Object::toString)
                                .toList();
                    }
                }
                return new InternStatusAssignmentRow(
                        rs.getString("status_code"),
                        rs.getLong("intern_id"),
                        rs.getString("intern_name"),
                        rs.getString("level_label"),
                        groupLabels);
            }
        });
    }

    public long countInterns() {
        Long total = jdbc.queryForObject(SQL_INTERN_TOTAL, Long.class);
        return total == null ? 0L : total;
    }

    public record StatusCountRow(String code, String label, int severity, long count) {}

    public record ProjectStatusAssignmentRow(String statusCode, long projectId, String projectName) {}

    public record InternStatusAssignmentRow(String statusCode, long internId, String internName,
                                            String levelLabel, List<String> groupLabels) {}
}

