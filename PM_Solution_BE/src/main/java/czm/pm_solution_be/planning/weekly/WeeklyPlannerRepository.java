package czm.pm_solution_be.planning.weekly;

import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Low-level repository encapsulating access to weekly planning tables.
 *
 * <p>The repository mirrors the structure of {@link czm.pm_solution_be.projects.capacity.ProjectCapacityRepository}
 * and exposes convenient CRUD methods with batch helpers and statistics aggregation used by higher layers.</p>
 */
@Repository
public class WeeklyPlannerRepository {

    private static final String SQL_SELECT_WEEK_BY_ID =
            """
            SELECT pw.id                       AS project_week_id,
                   pw.project_id,
                   pw.sprint_id,
                   pw.week_start_date,
                   pw.created_at               AS project_week_created_at,
                   pw.updated_at               AS project_week_updated_at,
                   wt.id                       AS task_id,
                   wt.day_of_week,
                   wt.note,
                   wt.planned_hours,
                   wt.intern_id,
                   wt.issue_id,
                   wt.created_at               AS task_created_at,
                   wt.updated_at               AS task_updated_at,
                   concat_ws(' ', i.first_name, i.last_name) AS intern_name,
                   iss.title                   AS issue_title,
                   iss.state                   AS issue_state,
                   iss.due_date                AS issue_due_date
            FROM project_week pw
            LEFT JOIN weekly_task wt ON wt.project_week_id = pw.id
            LEFT JOIN intern i ON i.id = wt.intern_id
            LEFT JOIN issue iss ON iss.id = wt.issue_id
            WHERE pw.id = ?
            ORDER BY wt.day_of_week ASC, wt.id ASC
            """;

    private static final String SQL_SELECT_WEEK_BY_PROJECT_AND_DATE =
            """
            SELECT pw.id                       AS project_week_id,
                   pw.project_id,
                   pw.sprint_id,
                   pw.week_start_date,
                   pw.created_at               AS project_week_created_at,
                   pw.updated_at               AS project_week_updated_at,
                   wt.id                       AS task_id,
                   wt.day_of_week,
                   wt.note,
                   wt.planned_hours,
                   wt.intern_id,
                   wt.issue_id,
                   wt.created_at               AS task_created_at,
                   wt.updated_at               AS task_updated_at,
                   concat_ws(' ', i.first_name, i.last_name) AS intern_name,
                   iss.title                   AS issue_title,
                   iss.state                   AS issue_state,
                   iss.due_date                AS issue_due_date
            FROM project_week pw
            LEFT JOIN weekly_task wt ON wt.project_week_id = pw.id
            LEFT JOIN intern i ON i.id = wt.intern_id
            LEFT JOIN issue iss ON iss.id = wt.issue_id
            WHERE pw.project_id = ?
              AND pw.week_start_date = ?
            ORDER BY wt.day_of_week ASC, wt.id ASC
            """;

    private static final String SQL_LIST_WEEKS_BY_PROJECT =
            """
            WITH selected AS (
                SELECT pw.id         AS project_week_id,
                       pw.project_id,
                       pw.sprint_id,
                       pw.week_start_date,
                       pw.created_at AS project_week_created_at,
                       pw.updated_at AS project_week_updated_at
                FROM project_week pw
                WHERE pw.project_id = ?
                ORDER BY pw.week_start_date DESC, pw.id DESC
                LIMIT ?
                OFFSET ?
            )
            SELECT s.project_week_id,
                   s.project_id,
                   s.sprint_id,
                   s.week_start_date,
                   s.project_week_created_at,
                   s.project_week_updated_at,
                   wt.id         AS task_id,
                   wt.day_of_week,
                   wt.note,
                   wt.planned_hours,
                   wt.intern_id,
                   wt.issue_id,
                   wt.created_at AS task_created_at,
                   wt.updated_at AS task_updated_at,
                   concat_ws(' ', i.first_name, i.last_name) AS intern_name,
                   iss.title     AS issue_title,
                   iss.state     AS issue_state,
                   iss.due_date  AS issue_due_date
            FROM selected s
            LEFT JOIN weekly_task wt ON wt.project_week_id = s.project_week_id
            LEFT JOIN intern i ON i.id = wt.intern_id
            LEFT JOIN issue iss ON iss.id = wt.issue_id
            ORDER BY s.week_start_date DESC, s.project_week_id DESC, wt.day_of_week ASC, wt.id ASC
            """;

    private static final String SQL_LIST_WEEKS_BY_PROJECT_AND_SPRINT =
            """
            WITH selected AS (
                SELECT pw.id         AS project_week_id,
                       pw.project_id,
                       pw.sprint_id,
                       pw.week_start_date,
                       pw.created_at AS project_week_created_at,
                       pw.updated_at AS project_week_updated_at
                FROM project_week pw
                WHERE pw.project_id = ?
                  AND pw.sprint_id = ?
                ORDER BY pw.week_start_date DESC, pw.id DESC
                LIMIT ?
                OFFSET ?
            )
            SELECT s.project_week_id,
                   s.project_id,
                   s.sprint_id,
                   s.week_start_date,
                   s.project_week_created_at,
                   s.project_week_updated_at,
                   wt.id         AS task_id,
                   wt.day_of_week,
                   wt.note,
                   wt.planned_hours,
                   wt.intern_id,
                   wt.issue_id,
                   wt.created_at AS task_created_at,
                   wt.updated_at AS task_updated_at,
                   concat_ws(' ', i.first_name, i.last_name) AS intern_name,
                   iss.title     AS issue_title,
                   iss.state     AS issue_state,
                   iss.due_date  AS issue_due_date
            FROM selected s
            LEFT JOIN weekly_task wt ON wt.project_week_id = s.project_week_id
            LEFT JOIN intern i ON i.id = wt.intern_id
            LEFT JOIN issue iss ON iss.id = wt.issue_id
            ORDER BY s.week_start_date DESC, s.project_week_id DESC, wt.day_of_week ASC, wt.id ASC
            """;

    private static final String SQL_PROJECT_WEEK_EXISTS =
            "SELECT EXISTS (SELECT 1 FROM project_week WHERE project_id = ? AND week_start_date = ?)";

    private static final String SQL_INSERT_PROJECT_WEEK =
            """
            INSERT INTO project_week (project_id, sprint_id, week_start_date)
            VALUES (?, ?, ?)
            RETURNING id,
                      project_id,
                      sprint_id,
                      week_start_date,
                      created_at AS project_week_created_at,
                      updated_at AS project_week_updated_at
            """;

    private static final String SQL_UPDATE_PROJECT_WEEK =
            """
            UPDATE project_week
            SET week_start_date = ?,
                updated_at      = NOW()
            WHERE id = ?
            RETURNING id,
                      project_id,
                      sprint_id,
                      week_start_date,
                      created_at AS project_week_created_at,
                      updated_at AS project_week_updated_at
            """;

    private static final String SQL_DELETE_PROJECT_WEEK = "DELETE FROM project_week WHERE id = ?";

    private static final String SQL_SELECT_TASK_BY_ID =
            """
            SELECT wt.id,
                   wt.project_id,
                   wt.project_week_id,
                   wt.sprint_id,
                   wt.day_of_week,
                   wt.note,
                   wt.planned_hours,
                   wt.intern_id,
                   wt.issue_id,
                   wt.created_at,
                   wt.updated_at,
                   concat_ws(' ', i.first_name, i.last_name) AS intern_name,
                   iss.title AS issue_title,
                   iss.state AS issue_state,
                   iss.due_date AS issue_due_date
            FROM weekly_task wt
            LEFT JOIN intern i ON i.id = wt.intern_id
            LEFT JOIN issue iss ON iss.id = wt.issue_id
            WHERE wt.id = ?
            """;

    private static final String SQL_LIST_TASKS_BY_WEEK =
            """
            SELECT wt.id,
                   wt.project_id,
                   wt.project_week_id,
                   wt.sprint_id,
                   wt.day_of_week,
                   wt.note,
                   wt.planned_hours,
                   wt.intern_id,
                   wt.issue_id,
                   wt.created_at,
                   wt.updated_at,
                   concat_ws(' ', i.first_name, i.last_name) AS intern_name,
                   iss.title AS issue_title,
                   iss.state AS issue_state,
                   iss.due_date AS issue_due_date
            FROM weekly_task wt
            LEFT JOIN intern i ON i.id = wt.intern_id
            LEFT JOIN issue iss ON iss.id = wt.issue_id
            WHERE wt.project_week_id = ?
            ORDER BY wt.day_of_week ASC, wt.id ASC
            """;

    private static final String SQL_INSERT_WEEKLY_TASK =
            """
            INSERT INTO weekly_task (project_id, sprint_id, project_week_id, intern_id, issue_id, day_of_week, note, planned_hours)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """;

    private static final String SQL_UPDATE_WEEKLY_TASK =
            """
            UPDATE weekly_task
            SET intern_id     = ?,
                issue_id      = ?,
                day_of_week   = ?,
                note          = ?,
                planned_hours = ?,
                updated_at    = NOW()
            WHERE id = ?
            RETURNING id
            """;

    private static final String SQL_DELETE_WEEKLY_TASK = "DELETE FROM weekly_task WHERE id = ?";

    private static final String SQL_BATCH_INSERT_TASK =
            "INSERT INTO weekly_task (project_id, sprint_id, project_week_id, intern_id, issue_id, day_of_week, note, planned_hours) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

    private static final String SQL_UPDATE_TASK_ASSIGNMENT =
            """
            UPDATE weekly_task
            SET project_week_id = ?,
                sprint_id       = ?,
                updated_at      = NOW()
            WHERE id = ?
            RETURNING id
            """;

    private static final String SQL_BATCH_DELETE_TASK = "DELETE FROM weekly_task WHERE id = ?";

    private static final String SQL_SELECT_PROJECT_CONFIGURATION =
            "SELECT p.id, p.week_start_day FROM project p WHERE p.id = ?";

    private static final String SQL_UPDATE_PROJECT_WEEK_START_DAY =
            "UPDATE project SET week_start_day = ? WHERE id = ?";

    private static final String SQL_CHECK_ISSUE_BELONGS_TO_PROJECT =
            """
            SELECT EXISTS (
                SELECT 1
                FROM issue iss
                JOIN projects_to_repositorie ptr ON ptr.repository_id = iss.repository_id
                WHERE ptr.project_id = ?
                  AND iss.id = ?
            )
            """;

    private static final String SQL_CHECK_INTERN_ASSIGNED_TO_PROJECT =
            "SELECT EXISTS (SELECT 1 FROM intern_project ip WHERE ip.project_id = ? AND ip.intern_id = ?)";

    private static final String SQL_SELECT_ISSUE_METADATA =
            "SELECT id, state, due_date FROM issue WHERE id = ?";

    private static final String SQL_UPDATE_ISSUE_STATE =
            "UPDATE issue SET state = ?, updated_at = NOW() WHERE id = ?";

    private static final String SQL_UPDATE_ISSUE_DUE_DATE =
            "UPDATE issue SET due_date = ? WHERE id = ?";

    private static final String SQL_STATS_TOTAL =
            """
            SELECT COUNT(*)                    AS task_count,
                   COALESCE(SUM(planned_hours), 0) AS total_hours
            FROM weekly_task
            WHERE project_week_id = ?
            """;

    private static final String SQL_STATS_BY_DAY =
            """
            SELECT wt.day_of_week,
                   COUNT(*)                    AS task_count,
                   COALESCE(SUM(wt.planned_hours), 0) AS total_hours
            FROM weekly_task wt
            WHERE wt.project_week_id = ?
            GROUP BY wt.day_of_week
            ORDER BY wt.day_of_week ASC
            """;

    private static final String SQL_STATS_BY_INTERN =
            """
            SELECT wt.intern_id,
                   concat_ws(' ', i.first_name, i.last_name) AS intern_name,
                   COUNT(*)                    AS task_count,
                   COALESCE(SUM(wt.planned_hours), 0) AS total_hours
            FROM weekly_task wt
            LEFT JOIN intern i ON i.id = wt.intern_id
            WHERE wt.project_week_id = ?
            GROUP BY wt.intern_id, intern_name
            ORDER BY intern_name NULLS LAST, wt.intern_id
            """;

    private final JdbcTemplate jdbc;

    public WeeklyPlannerRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<ProjectWeekRawRow> PROJECT_WEEK_RAW_MAPPER = new RowMapper<>() {
        @Override
        public ProjectWeekRawRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            LocalDate weekStart = rs.getObject("week_start_date", LocalDate.class);
            OffsetDateTime projectWeekCreated = rs.getObject("project_week_created_at", OffsetDateTime.class);
            OffsetDateTime projectWeekUpdated = rs.getObject("project_week_updated_at", OffsetDateTime.class);
            Long sprintId = mapNullableLong(rs, "sprint_id");
            Long taskId = mapNullableLong(rs, "task_id");
            Integer dayOfWeek = mapNullableInteger(rs, "day_of_week");
            Long internId = mapNullableLong(rs, "intern_id");
            Long issueId = mapNullableLong(rs, "issue_id");
            OffsetDateTime taskCreated = rs.getObject("task_created_at", OffsetDateTime.class);
            OffsetDateTime taskUpdated = rs.getObject("task_updated_at", OffsetDateTime.class);
            BigDecimal plannedHours = rs.getBigDecimal("planned_hours");
            LocalDate issueDueDate = rs.getObject("issue_due_date", LocalDate.class);
            return new ProjectWeekRawRow(
                    rs.getLong("project_week_id"),
                    rs.getLong("project_id"),
                    sprintId,
                    weekStart,
                    projectWeekCreated,
                    projectWeekUpdated,
                    taskId,
                    dayOfWeek,
                    rs.getString("note"),
                    plannedHours,
                    internId,
                    rs.getString("intern_name"),
                    issueId,
                    rs.getString("issue_title"),
                    rs.getString("issue_state"),
                    issueDueDate,
                    taskCreated,
                    taskUpdated);
        }
    };

    private static final RowMapper<ProjectWeekMetadataRow> PROJECT_WEEK_METADATA_MAPPER = new RowMapper<>() {
        @Override
        public ProjectWeekMetadataRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            LocalDate weekStart = rs.getObject("week_start_date", LocalDate.class);
            OffsetDateTime createdAt = rs.getObject("project_week_created_at", OffsetDateTime.class);
            OffsetDateTime updatedAt = rs.getObject("project_week_updated_at", OffsetDateTime.class);
            return new ProjectWeekMetadataRow(
                    rs.getLong("id"),
                    rs.getLong("project_id"),
                    mapNullableLong(rs, "sprint_id"),
                    weekStart,
                    createdAt,
                    updatedAt);
        }
    };

    private static final RowMapper<WeeklyTaskRow> TASK_MAPPER = new RowMapper<>() {
        @Override
        public WeeklyTaskRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            Long internId = mapNullableLong(rs, "intern_id");
            Long issueId = mapNullableLong(rs, "issue_id");
            Integer dayOfWeek = mapNullableInteger(rs, "day_of_week");
            BigDecimal plannedHours = rs.getBigDecimal("planned_hours");
            OffsetDateTime createdAt = rs.getObject("created_at", OffsetDateTime.class);
            OffsetDateTime updatedAt = rs.getObject("updated_at", OffsetDateTime.class);
            LocalDate issueDueDate = rs.getObject("issue_due_date", LocalDate.class);
            return new WeeklyTaskRow(
                    rs.getLong("id"),
                    mapNullableLong(rs, "project_week_id"),
                    rs.getLong("project_id"),
                    mapNullableLong(rs, "sprint_id"),
                    dayOfWeek,
                    rs.getString("note"),
                    plannedHours,
                    internId,
                    rs.getString("intern_name"),
                    issueId,
                    rs.getString("issue_title"),
                    rs.getString("issue_state"),
                    issueDueDate,
                    createdAt,
                    updatedAt);
        }
    };

    private static final RowMapper<DailyStatisticsRow> DAILY_STATS_MAPPER = new RowMapper<>() {
        @Override
        public DailyStatisticsRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            BigDecimal totalHours = rs.getBigDecimal("total_hours");
            return new DailyStatisticsRow(
                    rs.getInt("day_of_week"),
                    rs.getLong("task_count"),
                    totalHours == null ? BigDecimal.ZERO : totalHours);
        }
    };

    private static final RowMapper<InternStatisticsRow> INTERN_STATS_MAPPER = new RowMapper<>() {
        @Override
        public InternStatisticsRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            BigDecimal totalHours = rs.getBigDecimal("total_hours");
            return new InternStatisticsRow(
                    mapNullableLong(rs, "intern_id"),
                    rs.getString("intern_name"),
                    rs.getLong("task_count"),
                    totalHours == null ? BigDecimal.ZERO : totalHours);
        }
    };

    private static final RowMapper<WeeklyTotalsRow> WEEKLY_TOTALS_MAPPER = new RowMapper<>() {
        @Override
        public WeeklyTotalsRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            BigDecimal totalHours = rs.getBigDecimal("total_hours");
            return new WeeklyTotalsRow(
                    rs.getLong("task_count"),
                    totalHours == null ? BigDecimal.ZERO : totalHours);
        }
    };

    private static final RowMapper<ProjectConfigurationRow> PROJECT_CONFIGURATION_MAPPER = (rs, rn) ->
            new ProjectConfigurationRow(rs.getLong("id"), rs.getInt("week_start_day"));

    private static final RowMapper<IssueMetadataRow> ISSUE_METADATA_MAPPER = (rs, rn) ->
            new IssueMetadataRow(rs.getLong("id"), rs.getString("state"), rs.getObject("due_date", LocalDate.class));

    public Optional<ProjectWeekRow> findProjectWeekById(long projectWeekId) {
        List<ProjectWeekRawRow> rows = jdbc.query(SQL_SELECT_WEEK_BY_ID, PROJECT_WEEK_RAW_MAPPER, projectWeekId);
        List<ProjectWeekRow> aggregated = aggregateWeeks(rows);
        return aggregated.isEmpty() ? Optional.empty() : Optional.of(aggregated.get(0));
    }

    public Optional<ProjectWeekRow> findProjectWeek(long projectId, LocalDate weekStartDate) {
        Objects.requireNonNull(weekStartDate, "weekStartDate");
        List<ProjectWeekRawRow> rows = jdbc.query(SQL_SELECT_WEEK_BY_PROJECT_AND_DATE, PROJECT_WEEK_RAW_MAPPER, projectId, weekStartDate);
        List<ProjectWeekRow> aggregated = aggregateWeeks(rows);
        return aggregated.isEmpty() ? Optional.empty() : Optional.of(aggregated.get(0));
    }

    public List<ProjectWeekRow> listProjectWeeks(long projectId, Long sprintId, int limit, int offset) {
        if (limit <= 0) {
            return List.of();
        }
        List<ProjectWeekRawRow> rows;
        if (sprintId == null) {
            rows = jdbc.query(SQL_LIST_WEEKS_BY_PROJECT, PROJECT_WEEK_RAW_MAPPER, projectId, limit, offset);
        } else {
            rows = jdbc.query(SQL_LIST_WEEKS_BY_PROJECT_AND_SPRINT, PROJECT_WEEK_RAW_MAPPER, projectId, sprintId, limit, offset);
        }
        return aggregateWeeks(rows);
    }

    public boolean projectWeekExists(long projectId, LocalDate weekStartDate) {
        Objects.requireNonNull(weekStartDate, "weekStartDate");
        Boolean exists = jdbc.queryForObject(SQL_PROJECT_WEEK_EXISTS, Boolean.class, projectId, weekStartDate);
        return Boolean.TRUE.equals(exists);
    }

    public Optional<ProjectConfigurationRow> findProjectConfiguration(long projectId) {
        List<ProjectConfigurationRow> rows = jdbc.query(SQL_SELECT_PROJECT_CONFIGURATION, PROJECT_CONFIGURATION_MAPPER, projectId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public boolean updateProjectWeekStartDay(long projectId, int weekStartDay) {
        return jdbc.update(SQL_UPDATE_PROJECT_WEEK_START_DAY, weekStartDay, projectId) > 0;
    }

    public ProjectWeekMetadataRow insertProjectWeek(long projectId, Long sprintId, LocalDate weekStartDate) {
        Objects.requireNonNull(weekStartDate, "weekStartDate");
        ProjectWeekMetadataRow metadata = jdbc.queryForObject(SQL_INSERT_PROJECT_WEEK, PROJECT_WEEK_METADATA_MAPPER,
                projectId, sprintId, weekStartDate);
        if (metadata == null) {
            throw new IllegalStateException("Databáze při vkládání project_week nevrátila žádný řádek.");
        }
        return metadata;
    }

    public Optional<ProjectWeekMetadataRow> updateProjectWeek(long projectWeekId, LocalDate newWeekStartDate) {
        Objects.requireNonNull(newWeekStartDate, "newWeekStartDate");
        try {
            ProjectWeekMetadataRow updated = jdbc.queryForObject(SQL_UPDATE_PROJECT_WEEK, PROJECT_WEEK_METADATA_MAPPER, newWeekStartDate, projectWeekId);
            return Optional.ofNullable(updated);
        } catch (EmptyResultDataAccessException ex) {
            return Optional.empty();
        }
    }

    public int deleteProjectWeek(long projectWeekId) {
        return jdbc.update(SQL_DELETE_PROJECT_WEEK, projectWeekId);
    }

    public Optional<WeeklyTaskRow> findTaskById(long taskId) {
        List<WeeklyTaskRow> tasks = jdbc.query(SQL_SELECT_TASK_BY_ID, TASK_MAPPER, taskId);
        return tasks.isEmpty() ? Optional.empty() : Optional.of(tasks.get(0));
    }

    public List<WeeklyTaskRow> listTasksForWeek(long projectWeekId) {
        return jdbc.query(SQL_LIST_TASKS_BY_WEEK, TASK_MAPPER, projectWeekId);
    }

    public WeeklyTaskRow insertTask(long projectId, long sprintId, Long projectWeekId, WeeklyTaskMutation mutation) {
        Objects.requireNonNull(mutation, "mutation");
        Long taskId = jdbc.query(con -> {
            PreparedStatement ps = con.prepareStatement(SQL_INSERT_WEEKLY_TASK);
            ps.setLong(1, projectId);
            ps.setLong(2, sprintId);
            setNullableLong(ps, 3, projectWeekId);
            setNullableLong(ps, 4, mutation.internId());
            setNullableLong(ps, 5, mutation.issueId());
            setNullableInteger(ps, 6, mutation.dayOfWeek());
            setNullableString(ps, 7, mutation.note());
            setNullableBigDecimal(ps, 8, mutation.plannedHours());
            return ps;
        }, singleLongExtractor());
        if (taskId == null) {
            throw new IllegalStateException("Databáze při vkládání weekly_task nevrátila žádné ID.");
        }
        return findTaskById(taskId).orElseThrow(() ->
                new IllegalStateException("Vložený weekly_task s ID " + taskId + " nebyl nalezen."));
    }

    public Optional<WeeklyTaskRow> updateTask(long taskId, WeeklyTaskMutation mutation) {
        Objects.requireNonNull(mutation, "mutation");
        try {
            Long updatedId = jdbc.query(con -> {
                PreparedStatement ps = con.prepareStatement(SQL_UPDATE_WEEKLY_TASK);
                setNullableLong(ps, 1, mutation.internId());
                setNullableLong(ps, 2, mutation.issueId());
                setNullableInteger(ps, 3, mutation.dayOfWeek());
                setNullableString(ps, 4, mutation.note());
                setNullableBigDecimal(ps, 5, mutation.plannedHours());
                ps.setLong(6, taskId);
                return ps;
            }, singleLongExtractor());
            if (updatedId == null) {
                return Optional.empty();
            }
            return findTaskById(updatedId);
        } catch (EmptyResultDataAccessException ex) {
            return Optional.empty();
        }
    }

    public int deleteTask(long taskId) {
        return jdbc.update(SQL_DELETE_WEEKLY_TASK, taskId);
    }

    public int[] batchInsertTasks(long projectId, long sprintId, long projectWeekId, List<WeeklyTaskMutation> tasks) {
        if (tasks == null || tasks.isEmpty()) {
            return new int[0];
        }
        return jdbc.batchUpdate(SQL_BATCH_INSERT_TASK, new BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement ps, int i) throws SQLException {
                WeeklyTaskMutation mutation = tasks.get(i);
                ps.setLong(1, projectId);
                ps.setLong(2, sprintId);
                ps.setLong(3, projectWeekId);
                setNullableLong(ps, 4, mutation.internId());
                setNullableLong(ps, 5, mutation.issueId());
                setNullableInteger(ps, 6, mutation.dayOfWeek());
                setNullableString(ps, 7, mutation.note());
                setNullableBigDecimal(ps, 8, mutation.plannedHours());
            }

            @Override
            public int getBatchSize() {
                return tasks.size();
            }
        });
    }

    public Optional<WeeklyTaskRow> updateTaskAssignment(long taskId, Long projectWeekId, long sprintId) {
        try {
            Long updatedId = jdbc.query(con -> {
                PreparedStatement ps = con.prepareStatement(SQL_UPDATE_TASK_ASSIGNMENT);
                setNullableLong(ps, 1, projectWeekId);
                ps.setLong(2, sprintId);
                ps.setLong(3, taskId);
                return ps;
            }, singleLongExtractor());
            if (updatedId == null) {
                return Optional.empty();
            }
            return findTaskById(updatedId);
        } catch (EmptyResultDataAccessException ex) {
            return Optional.empty();
        }
    }

    public int[] batchDeleteTasks(List<Long> taskIds) {
        if (taskIds == null || taskIds.isEmpty()) {
            return new int[0];
        }
        return jdbc.batchUpdate(SQL_BATCH_DELETE_TASK, new BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement ps, int i) throws SQLException {
                Long taskId = taskIds.get(i);
                ps.setLong(1, taskId);
            }

            @Override
            public int getBatchSize() {
                return taskIds.size();
            }
        });
    }

    public WeeklyStatisticsRow loadWeeklyStatistics(long projectWeekId) {
        WeeklyTotalsRow totals = jdbc.queryForObject(SQL_STATS_TOTAL, WEEKLY_TOTALS_MAPPER, projectWeekId);
        List<DailyStatisticsRow> perDay = jdbc.query(SQL_STATS_BY_DAY, DAILY_STATS_MAPPER, projectWeekId);
        List<InternStatisticsRow> perIntern = jdbc.query(SQL_STATS_BY_INTERN, INTERN_STATS_MAPPER, projectWeekId);
        if (totals == null) {
            totals = new WeeklyTotalsRow(0L, BigDecimal.ZERO);
        }
        return new WeeklyStatisticsRow(projectWeekId, totals.taskCount(), totals.totalHours(), perDay, perIntern);
    }

    public boolean issueBelongsToProject(long projectId, long issueId) {
        Boolean exists = jdbc.queryForObject(SQL_CHECK_ISSUE_BELONGS_TO_PROJECT, Boolean.class, projectId, issueId);
        return Boolean.TRUE.equals(exists);
    }

    public boolean internAssignedToProject(long projectId, long internId) {
        Boolean exists = jdbc.queryForObject(SQL_CHECK_INTERN_ASSIGNED_TO_PROJECT, Boolean.class, projectId, internId);
        return Boolean.TRUE.equals(exists);
    }

    public Optional<IssueMetadataRow> findIssueMetadata(long issueId) {
        List<IssueMetadataRow> rows = jdbc.query(SQL_SELECT_ISSUE_METADATA, ISSUE_METADATA_MAPPER, issueId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public boolean updateIssueState(long issueId, String state) {
        return jdbc.update(SQL_UPDATE_ISSUE_STATE, state, issueId) > 0;
    }

    public void updateIssueDueDate(long issueId, LocalDate dueDate) {
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(SQL_UPDATE_ISSUE_DUE_DATE);
            if (dueDate == null) {
                ps.setNull(1, Types.DATE);
            } else {
                ps.setObject(1, dueDate);
            }
            ps.setLong(2, issueId);
            return ps;
        });
    }

    private static List<ProjectWeekRow> aggregateWeeks(List<ProjectWeekRawRow> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<Long, ProjectWeekAggregation> aggregated = new LinkedHashMap<>();
        for (ProjectWeekRawRow row : rows) {
            ProjectWeekAggregation aggregation = aggregated.computeIfAbsent(row.projectWeekId(), id ->
                    new ProjectWeekAggregation(row.projectWeekId(), row.projectId(), row.sprintId(), row.weekStartDate(), row.projectWeekCreatedAt(), row.projectWeekUpdatedAt()));
            if (row.taskId() != null) {
                aggregation.addTask(new WeeklyTaskRow(
                        row.taskId(),
                        row.projectWeekId(),
                        row.projectId(),
                        row.sprintId(),
                        row.dayOfWeek(),
                        row.note(),
                        row.plannedHours(),
                        row.internId(),
                        row.internName(),
                        row.issueId(),
                        row.issueTitle(),
                        row.issueState(),
                        row.issueDueDate(),
                        row.taskCreatedAt(),
                        row.taskUpdatedAt()));
            }
        }
        return aggregated.values().stream()
                .map(ProjectWeekAggregation::toRow)
                .toList();
    }

    private static Long mapNullableLong(ResultSet rs, String column) throws SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    private static Integer mapNullableInteger(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private static void setNullableLong(PreparedStatement ps, int parameterIndex, Long value) throws SQLException {
        if (value == null) {
            ps.setNull(parameterIndex, Types.BIGINT);
        } else {
            ps.setLong(parameterIndex, value);
        }
    }

    private static void setNullableString(PreparedStatement ps, int parameterIndex, String value) throws SQLException {
        if (value == null) {
            ps.setNull(parameterIndex, Types.VARCHAR);
        } else {
            ps.setString(parameterIndex, value);
        }
    }

    private static void setNullableBigDecimal(PreparedStatement ps, int parameterIndex, BigDecimal value) throws SQLException {
        if (value == null) {
            ps.setNull(parameterIndex, Types.NUMERIC);
        } else {
            ps.setBigDecimal(parameterIndex, value);
        }
    }

    private static void setNullableInteger(PreparedStatement ps, int parameterIndex, Integer value) throws SQLException {
        if (value == null) {
            ps.setNull(parameterIndex, Types.INTEGER);
        } else {
            ps.setInt(parameterIndex, value);
        }
    }

    private static ResultSetExtractor<Long> singleLongExtractor() {
        return rs -> {
            if (rs.next()) {
                long value = rs.getLong(1);
                return rs.wasNull() ? null : value;
            }
            return null;
        };
    }

    private record ProjectWeekRawRow(long projectWeekId,
                                     long projectId,
                                     Long sprintId,
                                     LocalDate weekStartDate,
                                     OffsetDateTime projectWeekCreatedAt,
                                     OffsetDateTime projectWeekUpdatedAt,
                                     Long taskId,
                                     Integer dayOfWeek,
                                     String note,
                                     BigDecimal plannedHours,
                                     Long internId,
                                     String internName,
                                     Long issueId,
                                     String issueTitle,
                                     String issueState,
                                     LocalDate issueDueDate,
                                     OffsetDateTime taskCreatedAt,
                                     OffsetDateTime taskUpdatedAt) {
    }

    public record ProjectWeekRow(long id,
                                 long projectId,
                                 Long sprintId,
                                 LocalDate weekStartDate,
                                 OffsetDateTime createdAt,
                                 OffsetDateTime updatedAt,
                                 List<WeeklyTaskRow> tasks) {
    }

    public record ProjectWeekMetadataRow(long id,
                                         long projectId,
                                         Long sprintId,
                                         LocalDate weekStartDate,
                                         OffsetDateTime createdAt,
                                         OffsetDateTime updatedAt) {
    }

    public record WeeklyTaskRow(long id,
                                Long projectWeekId,
                                long projectId,
                                Long sprintId,
                                Integer dayOfWeek,
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

    public record WeeklyTaskMutation(Long internId,
                                     Long issueId,
                                     Integer dayOfWeek,
                                     String note,
                                     BigDecimal plannedHours) {
    }

    public record DailyStatisticsRow(int dayOfWeek,
                                     long taskCount,
                                     BigDecimal totalHours) {
    }

    public record InternStatisticsRow(Long internId,
                                      String internName,
                                      long taskCount,
                                      BigDecimal totalHours) {
    }

    public record WeeklyStatisticsRow(long projectWeekId,
                                      long taskCount,
                                      BigDecimal totalHours,
                                      List<DailyStatisticsRow> perDay,
                                      List<InternStatisticsRow> perIntern) {
    }

    private record WeeklyTotalsRow(long taskCount, BigDecimal totalHours) {
    }

    public record ProjectConfigurationRow(long id, int weekStartDay) {
    }

    public record IssueMetadataRow(long id, String state, LocalDate dueDate) {
    }

    private static final class ProjectWeekAggregation {
        private final long projectWeekId;
        private final long projectId;
        private final Long sprintId;
        private final LocalDate weekStartDate;
        private final OffsetDateTime createdAt;
        private final OffsetDateTime updatedAt;
        private final List<WeeklyTaskRow> tasks = new ArrayList<>();

        private ProjectWeekAggregation(long projectWeekId,
                                       long projectId,
                                       Long sprintId,
                                       LocalDate weekStartDate,
                                       OffsetDateTime createdAt,
                                       OffsetDateTime updatedAt) {
            this.projectWeekId = projectWeekId;
            this.projectId = projectId;
            this.sprintId = sprintId;
            this.weekStartDate = weekStartDate;
            this.createdAt = createdAt;
            this.updatedAt = updatedAt;
        }

        private void addTask(WeeklyTaskRow task) {
            tasks.add(task);
        }

        private ProjectWeekRow toRow() {
            return new ProjectWeekRow(projectWeekId, projectId, sprintId, weekStartDate, createdAt, updatedAt, List.copyOf(tasks));
        }
    }
}
