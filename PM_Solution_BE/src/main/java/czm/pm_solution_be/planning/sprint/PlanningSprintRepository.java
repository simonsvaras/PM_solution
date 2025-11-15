package czm.pm_solution_be.planning.sprint;

import org.springframework.dao.support.DataAccessUtils;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * Data-access component for the {@code planning_sprint} table.
 */
public class PlanningSprintRepository {

    private static final String SQL_SELECT_BASE =
            """
            SELECT id,
                   project_id,
                   name,
                   description,
                   deadline,
                   status,
                   created_at,
                   updated_at
            FROM planning_sprint
            """;

    private static final String SQL_SELECT_BY_ID =
            SQL_SELECT_BASE +
            " WHERE id = ?";

    private static final String SQL_SELECT_BY_PROJECT_AND_STATUS =
            SQL_SELECT_BASE +
            " WHERE project_id = ? AND status = ?\n" +
            " ORDER BY created_at DESC, id DESC\n" +
            " LIMIT 1";

    private static final String SQL_SELECT_LATEST_BY_PROJECT =
            SQL_SELECT_BASE +
            " WHERE project_id = ?\n" +
            " ORDER BY created_at DESC, id DESC\n" +
            " LIMIT 1";

    private static final String SQL_LIST_BY_PROJECT =
            SQL_SELECT_BASE +
            " WHERE project_id = ?\n" +
            " ORDER BY created_at DESC, id DESC";

    private static final String SQL_INSERT =
            """
            INSERT INTO planning_sprint (project_id, name, description, deadline, status)
            VALUES (?, ?, ?, ?, ?)
            RETURNING id, project_id, name, description, deadline, status, created_at, updated_at
            """;

    private static final String SQL_UPDATE =
            """
            UPDATE planning_sprint
            SET name        = ?,
                description = ?,
                deadline    = ?,
                status      = ?
            WHERE id = ?
            RETURNING id, project_id, name, description, deadline, status, created_at, updated_at
            """;

    private static final RowMapper<PlanningSprintEntity> ROW_MAPPER = new RowMapper<>() {
        @Override
        public PlanningSprintEntity mapRow(ResultSet rs, int rowNum) throws SQLException {
            LocalDate deadline = rs.getObject("deadline", LocalDate.class);
            OffsetDateTime createdAt = rs.getObject("created_at", OffsetDateTime.class);
            OffsetDateTime updatedAt = rs.getObject("updated_at", OffsetDateTime.class);
            return new PlanningSprintEntity(
                    rs.getLong("id"),
                    rs.getLong("project_id"),
                    rs.getString("name"),
                    rs.getString("description"),
                    deadline,
                    SprintStatus.valueOf(rs.getString("status")),
                    createdAt,
                    updatedAt);
        }
    };

    private final JdbcTemplate jdbc;

    public PlanningSprintRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<PlanningSprintEntity> findByProjectAndStatus(long projectId, SprintStatus status) {
        Objects.requireNonNull(status, "status");
        List<PlanningSprintEntity> rows = jdbc.query(SQL_SELECT_BY_PROJECT_AND_STATUS, ROW_MAPPER, projectId, status.name());
        return Optional.ofNullable(DataAccessUtils.singleResult(rows));
    }

    public Optional<PlanningSprintEntity> findById(long sprintId) {
        List<PlanningSprintEntity> rows = jdbc.query(SQL_SELECT_BY_ID, ROW_MAPPER, sprintId);
        return Optional.ofNullable(DataAccessUtils.singleResult(rows));
    }

    public Optional<PlanningSprintEntity> findLatestByProject(long projectId) {
        List<PlanningSprintEntity> rows = jdbc.query(SQL_SELECT_LATEST_BY_PROJECT, ROW_MAPPER, projectId);
        return Optional.ofNullable(DataAccessUtils.singleResult(rows));
    }

    public List<PlanningSprintEntity> findAllByProject(long projectId) {
        return jdbc.query(SQL_LIST_BY_PROJECT, ROW_MAPPER, projectId);
    }

    public PlanningSprintEntity insert(long projectId,
                                       String name,
                                       String description,
                                       LocalDate deadline,
                                       SprintStatus status) {
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(status, "status");
        return jdbc.queryForObject(SQL_INSERT, ROW_MAPPER, projectId, name, description, deadline, status.name());
    }

    public Optional<PlanningSprintEntity> update(long sprintId,
                                                 String name,
                                                 String description,
                                                 LocalDate deadline,
                                                 SprintStatus status) {
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(status, "status");
        List<PlanningSprintEntity> rows = jdbc.query(SQL_UPDATE, ROW_MAPPER, name, description, deadline, status.name(), sprintId);
        return Optional.ofNullable(DataAccessUtils.singleResult(rows));
    }
}
