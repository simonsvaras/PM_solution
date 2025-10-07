package czm.pm_solution_be.projects.capacity;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Repository responsible for low-level access to project capacity reporting tables.
 *
 * <p>The class encapsulates all SQL snippets touching {@code project_capacity_report}
 * and {@code capacity_status} so higher layers can focus on validation and mapping.</p>
 */
@Repository
public class ProjectCapacityRepository {

    /**
     * Selects the newest capacity report using the descending index on (project_id, reported_at).
     */
    private static final String SQL_FIND_CURRENT =
            """
            SELECT r.id,
                   r.project_id,
                   r.status_code,
                   cs.label AS status_label,
                   cs.severity,
                   r.reported_at,
                   r.reported_by,
                   reporter.first_name AS reported_by_first_name,
                   reporter.last_name AS reported_by_last_name,
                   r.note
            FROM project_capacity_report r
            JOIN capacity_status cs ON cs.code = r.status_code
            LEFT JOIN intern reporter ON reporter.username = r.reported_by
            WHERE r.project_id = ?
            ORDER BY r.reported_at DESC, r.id DESC
            LIMIT 1
            """;

    private static final String SQL_COUNT_HISTORY =
            "SELECT COUNT(*) FROM project_capacity_report r WHERE r.project_id = ?";

    // V případě filtrace podle časového intervalu je základní count výrazně levnější než reálná stránka –
    // potřebujeme ho kvůli zobrazení celkového počtu záznamů ve FE paginatoru.

    private static final String SQL_STATUS_EXISTS = "SELECT EXISTS (SELECT 1 FROM capacity_status WHERE code = ?)";

    private static final String SQL_PROJECT_EXISTS = "SELECT EXISTS (SELECT 1 FROM project WHERE id = ?)";

    private static final String SQL_REPORTER_EXISTS = "SELECT EXISTS (SELECT 1 FROM intern WHERE username = ?)";

    /**
     * Insert query returning the inserted row enriched with status metadata and reporter name.
     *
     * <p>The CTE helps to keep the mapping logic in a single place and leverages the
     * database default for {@code reported_at}.</p>
     */
    private static final String SQL_INSERT_REPORT =
            """
            WITH inserted AS (
                INSERT INTO project_capacity_report (project_id, status_code, reported_by, note)
                VALUES (?, ?, ?, ?)
                RETURNING id, project_id, status_code, reported_at, reported_by, note
            )
            SELECT i.id,
                   i.project_id,
                   i.status_code,
                   cs.label AS status_label,
                   cs.severity,
                   i.reported_at,
                   i.reported_by,
                   reporter.first_name AS reported_by_first_name,
                   reporter.last_name AS reported_by_last_name,
                   i.note
            FROM inserted i
            JOIN capacity_status cs ON cs.code = i.status_code
            LEFT JOIN intern reporter ON reporter.username = i.reported_by
            """;

    private final JdbcTemplate jdbc;

    public ProjectCapacityRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Row mapping shared across the read queries.
     *
     * <p>Mapper vrací neutralní {@link ProjectCapacityRow}, který se dá snadno transformovat do REST DTO i
     * doménových objektů. Díky {@code OffsetDateTime} nepřicházíme o timezone informaci z DB.</p>
     */
    private static final RowMapper<ProjectCapacityRow> CAPACITY_MAPPER = new RowMapper<>() {
        @Override
        public ProjectCapacityRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            OffsetDateTime reportedAt = rs.getObject("reported_at", OffsetDateTime.class);
            return new ProjectCapacityRow(
                    rs.getLong("id"),
                    rs.getLong("project_id"),
                    rs.getString("status_code"),
                    rs.getString("status_label"),
                    rs.getInt("severity"),
                    reportedAt,
                    rs.getString("reported_by"),
                    rs.getString("reported_by_first_name"),
                    rs.getString("reported_by_last_name"),
                    rs.getString("note"));
        }
    };

    public record ProjectCapacityRow(long id,
                                     long projectId,
                                     String statusCode,
                                     String statusLabel,
                                     int severity,
                                     OffsetDateTime reportedAt,
                                     String reportedBy,
                                     String reportedByFirstName,
                                     String reportedByLastName,
                                     String note) {}

    public boolean projectExists(long projectId) {
        // Guard pro majority use-case: API se volá pouze pro existující projekty, ale chráníme se proti špatným ID
        // a vracíme 404 z vyšších vrstev.
        return Boolean.TRUE.equals(jdbc.queryForObject(SQL_PROJECT_EXISTS, Boolean.class, projectId));
    }

    public boolean statusExists(String statusCode) {
        // Pomocí EXISTS necháváme rozhodnutí databázi a tím minimalizujeme objem přenášených dat.
        return Boolean.TRUE.equals(jdbc.queryForObject(SQL_STATUS_EXISTS, Boolean.class, statusCode));
    }

    public boolean reporterExists(String username) {
        // Validace reportujícího probíhá proti tabulce internů – v další iteraci lze rozšířit o externí dodavatele.
        return Boolean.TRUE.equals(jdbc.queryForObject(SQL_REPORTER_EXISTS, Boolean.class, username));
    }

    public Optional<ProjectCapacityRow> findCurrent(long projectId) {
        List<ProjectCapacityRow> rows = jdbc.query(SQL_FIND_CURRENT, CAPACITY_MAPPER, projectId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public ProjectCapacityRow insertReport(long projectId, String statusCode, String reportedBy, String note) {
        return jdbc.queryForObject(SQL_INSERT_REPORT, CAPACITY_MAPPER, projectId, statusCode, reportedBy, note);
    }

    public List<ProjectCapacityRow> listHistory(long projectId,
                                                OffsetDateTime from,
                                                OffsetDateTime to,
                                                int limit,
                                                int offset) {
        // Query benefits from idx_project_capacity_report_project covering project_id and reported_at DESC.
        // Filtry se skládají dynamicky – držíme jednoduchou StringBuilder variantu, protože počet kombinací je nízký
        // a reaktivní DSL by bylo zbytečně komplexní.
        StringBuilder sql = new StringBuilder();
        List<Object> params = new ArrayList<>();
        sql.append(
                """
                SELECT r.id,
                       r.project_id,
                       r.status_code,
                       cs.label AS status_label,
                       cs.severity,
                       r.reported_at,
                       r.reported_by,
                       reporter.first_name AS reported_by_first_name,
                       reporter.last_name AS reported_by_last_name,
                       r.note
                FROM project_capacity_report r
                JOIN capacity_status cs ON cs.code = r.status_code
                LEFT JOIN intern reporter ON reporter.username = r.reported_by
                WHERE r.project_id = ?
                """);
        params.add(projectId);
        if (from != null) {
            sql.append(" AND r.reported_at >= ?");
            params.add(from);
        }
        if (to != null) {
            sql.append(" AND r.reported_at <= ?");
            params.add(to);
        }
        sql.append(" ORDER BY r.reported_at DESC, r.id DESC LIMIT ? OFFSET ?");
        params.add(limit);
        params.add(offset);
        return jdbc.query(sql.toString(), CAPACITY_MAPPER, params.toArray());
    }

    public long countHistory(long projectId, OffsetDateTime from, OffsetDateTime to) {
        StringBuilder sql = new StringBuilder(SQL_COUNT_HISTORY);
        // Stejná skladba WHERE podmínek jako u listHistory – případné změny musí být udržovány synchronně.
        List<Object> params = new ArrayList<>();
        params.add(projectId);
        if (from != null) {
            sql.append(" AND r.reported_at >= ?");
            params.add(from);
        }
        if (to != null) {
            sql.append(" AND r.reported_at <= ?");
            params.add(to);
        }
        Long count = jdbc.queryForObject(sql.toString(), Long.class, params.toArray());
        return count != null ? count : 0L;
    }
}
