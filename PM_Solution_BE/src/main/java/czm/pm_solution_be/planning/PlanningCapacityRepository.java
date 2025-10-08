package czm.pm_solution_be.planning;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

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

    public long countProjects() {
        Long total = jdbc.queryForObject(SQL_PROJECT_TOTAL, Long.class);
        return total == null ? 0L : total;
    }

    public List<StatusCountRow> loadInternStatusCounts() {
        return jdbc.query(SQL_INTERN_STATUS_COUNTS, STATUS_COUNT_MAPPER);
    }

    public long countInterns() {
        Long total = jdbc.queryForObject(SQL_INTERN_TOTAL, Long.class);
        return total == null ? 0L : total;
    }

    public record StatusCountRow(String code, String label, int severity, long count) {}
}

