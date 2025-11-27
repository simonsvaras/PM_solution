package czm.pm_solution_be.modules.planning.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Simplified repository providing aggregate information about weekly tasks across projects.
 */
@Repository
public class WeeklyTaskRepository {

    private static final String SQL_COUNT_OPEN_TASKS_BY_SPRINT =
            """
            SELECT COUNT(*)
            FROM weekly_task wt
            LEFT JOIN issue iss ON iss.id = wt.issue_id
            WHERE wt.project_id = ?
              AND wt.sprint_id = ?
              AND (iss.state IS NULL OR LOWER(iss.state) <> 'closed')
            """;

    private static final String SQL_SELECT_TASKS_BY_SPRINT =
            """
            SELECT wt.id,
                   wt.project_id,
                   wt.project_week_id,
                   wt.sprint_id,
                   wt.note,
                   wt.planned_hours,
                   wt.intern_id,
                   concat_ws(' ', i.first_name, i.last_name) AS intern_name,
                   wt.issue_id,
                   iss.title AS issue_title,
                   iss.state AS issue_state,
                   iss.due_date AS issue_due_date,
                   wt.created_at,
                   wt.updated_at
            FROM weekly_task wt
            LEFT JOIN intern i ON i.id = wt.intern_id
            LEFT JOIN issue iss ON iss.id = wt.issue_id
            WHERE wt.project_id = ?
              AND wt.sprint_id = ?
            ORDER BY wt.id ASC
            """;

    private static final RowMapper<WeeklyTaskEntity> TASK_ENTITY_MAPPER = new RowMapper<>() {
        @Override
        public WeeklyTaskEntity mapRow(ResultSet rs, int rowNum) throws SQLException {
            Long projectWeekId = rs.getObject("project_week_id") == null ? null : rs.getLong("project_week_id");
            return new WeeklyTaskEntity(
                    rs.getLong("id"),
                    rs.getLong("project_id"),
                    projectWeekId,
                    rs.getLong("sprint_id"),
                    rs.getString("note"),
                    rs.getBigDecimal("planned_hours"),
                    rs.getObject("intern_id") == null ? null : rs.getLong("intern_id"),
                    rs.getString("intern_name"),
                    rs.getObject("issue_id") == null ? null : rs.getLong("issue_id"),
                    rs.getString("issue_title"),
                    rs.getString("issue_state"),
                    rs.getObject("issue_due_date", LocalDate.class),
                    rs.getObject("created_at", OffsetDateTime.class),
                    rs.getObject("updated_at", OffsetDateTime.class));
        }
    };

    private final JdbcTemplate jdbcTemplate;

    public WeeklyTaskRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public long countOpenTasksBySprint(long projectId, long sprintId) {
        Long count = jdbcTemplate.queryForObject(SQL_COUNT_OPEN_TASKS_BY_SPRINT, Long.class, projectId, sprintId);
        return count == null ? 0L : count;
    }

    public List<WeeklyTaskEntity> findTasksBySprint(long projectId, long sprintId) {
        return jdbcTemplate.query(SQL_SELECT_TASKS_BY_SPRINT, TASK_ENTITY_MAPPER, projectId, sprintId);
    }

    public record WeeklyTaskEntity(long id,
                                   long projectId,
                                   Long projectWeekId,
                                   long sprintId,
                                   String note,
                                   BigDecimal plannedHours,
                                   Long internId,
                                   String internName,
                                   Long issueId,
                                   String issueTitle,
                                   String issueState,
                                   LocalDate issueDueDate,
                                   OffsetDateTime createdAt,
                                   OffsetDateTime updatedAt) {
    }
}
