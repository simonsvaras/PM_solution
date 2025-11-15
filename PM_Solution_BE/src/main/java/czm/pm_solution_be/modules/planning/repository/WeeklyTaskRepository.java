package czm.pm_solution_be.modules.planning.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Simplified repository providing aggregate information about weekly tasks across projects.
 */
@Repository
public class WeeklyTaskRepository {

    private static final String SQL_COUNT_OPEN_TASKS =
            """
            SELECT COUNT(*)
            FROM weekly_task wt
            JOIN project_week pw ON pw.id = wt.project_week_id
            LEFT JOIN issue iss ON iss.id = wt.issue_id
            WHERE pw.project_id = ?
              AND (iss.state IS NULL OR LOWER(iss.state) <> 'closed')
            """;

    private final JdbcTemplate jdbcTemplate;

    public WeeklyTaskRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public long countOpenTasks(long projectId) {
        Long count = jdbcTemplate.queryForObject(SQL_COUNT_OPEN_TASKS, Long.class, projectId);
        return count == null ? 0L : count;
    }

    public boolean hasOpenTasks(long projectId) {
        return countOpenTasks(projectId) > 0;
    }
}
