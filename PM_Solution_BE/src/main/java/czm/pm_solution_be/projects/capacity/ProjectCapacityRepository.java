package czm.pm_solution_be.projects.capacity;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
            WITH latest AS (
                SELECT r.id,
                       r.project_id,
                       r.reported_at,
                       r.note
                FROM project_capacity_report r
                WHERE r.project_id = ?
                ORDER BY r.reported_at DESC, r.id DESC
                LIMIT 1
            )
            SELECT l.id,
                   l.project_id,
                   l.reported_at,
                   l.note,
                   cs.code AS status_code,
                   cs.label AS status_label,
                   cs.severity AS status_severity
            FROM latest l
            JOIN project_capacity_report_status rs ON rs.report_id = l.id
            JOIN capacity_status cs ON cs.code = rs.status_code
            ORDER BY cs.severity DESC, cs.code ASC
            """;

    private static final String SQL_COUNT_HISTORY =
            "SELECT COUNT(*) FROM project_capacity_report r WHERE r.project_id = ?";

    // V případě filtrace podle časového intervalu je základní count výrazně levnější než reálná stránka –
    // potřebujeme ho kvůli zobrazení celkového počtu záznamů ve FE paginatoru.

    private static final String SQL_STATUS_EXISTS = "SELECT EXISTS (SELECT 1 FROM capacity_status WHERE code = ?)";

    private static final String SQL_PROJECT_EXISTS = "SELECT EXISTS (SELECT 1 FROM project WHERE id = ?)";

    /**
     * Insert query returning metadata of the new report (statuses are inserted separately).
     */
    private static final String SQL_INSERT_REPORT =
            """
            INSERT INTO project_capacity_report (project_id, note)
            VALUES (?, ?)
            RETURNING id, project_id, reported_at, note
            """;

    private static final String SQL_FIND_BY_ID =
            """
            SELECT r.id,
                   r.project_id,
                   r.reported_at,
                   r.note,
                   cs.code AS status_code,
                   cs.label AS status_label,
                   cs.severity AS status_severity
            FROM project_capacity_report r
            JOIN project_capacity_report_status rs ON rs.report_id = r.id
            JOIN capacity_status cs ON cs.code = rs.status_code
            WHERE r.id = ?
            ORDER BY cs.severity DESC, cs.code ASC
            """;

    private static final String SQL_INSERT_STATUS =
            "INSERT INTO project_capacity_report_status (report_id, status_code) VALUES (?, ?)";

    private final JdbcTemplate jdbc;

    public ProjectCapacityRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Mapper vrací jednotlivé řádky s jedním stavem, později se agregují do celého reportu.
     */
    private static final RowMapper<ProjectCapacityRawRow> CAPACITY_RAW_MAPPER = new RowMapper<>() {
        @Override
        public ProjectCapacityRawRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            OffsetDateTime reportedAt = rs.getObject("reported_at", OffsetDateTime.class);
            return new ProjectCapacityRawRow(
                    rs.getLong("id"),
                    rs.getLong("project_id"),
                    reportedAt,
                    rs.getString("note"),
                    rs.getString("status_code"),
                    rs.getString("status_label"),
                    rs.getInt("status_severity"));
        }
    };

    private static final RowMapper<ProjectCapacityInsertRow> INSERT_MAPPER = new RowMapper<>() {
        @Override
        public ProjectCapacityInsertRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            OffsetDateTime reportedAt = rs.getObject("reported_at", OffsetDateTime.class);
            return new ProjectCapacityInsertRow(rs.getLong("id"), rs.getLong("project_id"), reportedAt, rs.getString("note"));
        }
    };

    public record ProjectCapacityRow(long id,
                                     long projectId,
                                     OffsetDateTime reportedAt,
                                     String note,
                                     List<CapacityStatusRow> statuses) {}

    private record ProjectCapacityRawRow(long id,
                                         long projectId,
                                         OffsetDateTime reportedAt,
                                         String note,
                                         String statusCode,
                                         String statusLabel,
                                         int statusSeverity) {}

    private record ProjectCapacityInsertRow(long id, long projectId, OffsetDateTime reportedAt, String note) {}

    public record CapacityStatusRow(String code, String label, int severity) {}

    public boolean projectExists(long projectId) {
        // Guard pro majority use-case: API se volá pouze pro existující projekty, ale chráníme se proti špatným ID
        // a vracíme 404 z vyšších vrstev.
        return Boolean.TRUE.equals(jdbc.queryForObject(SQL_PROJECT_EXISTS, Boolean.class, projectId));
    }

    public boolean statusExists(String statusCode) {
        // Pomocí EXISTS necháváme rozhodnutí databázi a tím minimalizujeme objem přenášených dat.
        return Boolean.TRUE.equals(jdbc.queryForObject(SQL_STATUS_EXISTS, Boolean.class, statusCode));
    }

    public Optional<ProjectCapacityRow> findCurrent(long projectId) {
        List<ProjectCapacityRawRow> rows = jdbc.query(SQL_FIND_CURRENT, CAPACITY_RAW_MAPPER, projectId);
        List<ProjectCapacityRow> aggregated = aggregateRows(rows);
        return aggregated.isEmpty() ? Optional.empty() : Optional.of(aggregated.get(0));
    }

    public ProjectCapacityRow insertReport(long projectId, List<String> statusCodes, String note) {
        ProjectCapacityInsertRow inserted = jdbc.queryForObject(SQL_INSERT_REPORT, INSERT_MAPPER, projectId, note);
        if (inserted == null) {
            throw new IllegalStateException("Očekávali jsme vložený kapacitní report, ale databáze nevrátila žádný řádek.");
        }
        if (statusCodes == null || statusCodes.isEmpty()) {
            throw new IllegalArgumentException("Kapacitní report musí obsahovat alespoň jeden status.");
        }
        jdbc.batchUpdate(SQL_INSERT_STATUS, statusCodes, statusCodes.size(), (ps, code) -> {
            ps.setLong(1, inserted.id());
            ps.setString(2, code);
        });
        return findById(inserted.id())
                .orElseThrow(() -> new IllegalStateException("Kapacitní report nebyl nalezen po vložení."));
    }

    public List<ProjectCapacityRow> listHistory(long projectId,
                                                OffsetDateTime from,
                                                OffsetDateTime to,
                                                int limit,
                                                int offset) {
        // Query využívá CTE, aby stránkování probíhalo nad reporty a nikoliv nad kombinací report+status.
        StringBuilder sql = new StringBuilder();
        List<Object> params = new ArrayList<>();
        sql.append(
                """
                WITH filtered AS (
                    SELECT r.id,
                           r.project_id,
                           r.reported_at,
                           r.note
                    FROM project_capacity_report r
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
        sql.append(
                """
                    ORDER BY r.reported_at DESC, r.id DESC
                    LIMIT ? OFFSET ?
                )
                SELECT f.id,
                       f.project_id,
                       f.reported_at,
                       f.note,
                       cs.code AS status_code,
                       cs.label AS status_label,
                       cs.severity AS status_severity
                FROM filtered f
                JOIN project_capacity_report_status rs ON rs.report_id = f.id
                JOIN capacity_status cs ON cs.code = rs.status_code
                ORDER BY f.reported_at DESC, f.id DESC, cs.severity DESC, cs.code ASC
                """);
        params.add(limit);
        params.add(offset);
        List<ProjectCapacityRawRow> rows = jdbc.query(sql.toString(), CAPACITY_RAW_MAPPER, params.toArray());
        return aggregateRows(rows);
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

    private Optional<ProjectCapacityRow> findById(long id) {
        List<ProjectCapacityRawRow> rows = jdbc.query(SQL_FIND_BY_ID, CAPACITY_RAW_MAPPER, id);
        List<ProjectCapacityRow> aggregated = aggregateRows(rows);
        return aggregated.isEmpty() ? Optional.empty() : Optional.of(aggregated.get(0));
    }

    private List<ProjectCapacityRow> aggregateRows(List<ProjectCapacityRawRow> rows) {
        Map<Long, ReportAccumulator> grouped = new LinkedHashMap<>();
        for (ProjectCapacityRawRow raw : rows) {
            ReportAccumulator accumulator = grouped.computeIfAbsent(raw.id(),
                    ignored -> new ReportAccumulator(raw.id(), raw.projectId(), raw.reportedAt(), raw.note()));
            accumulator.addStatus(new CapacityStatusRow(raw.statusCode(), raw.statusLabel(), raw.statusSeverity()));
        }
        return grouped.values().stream().map(ReportAccumulator::toRow).toList();
    }

    private static final class ReportAccumulator {
        private final long id;
        private final long projectId;
        private final OffsetDateTime reportedAt;
        private final String note;
        private final List<CapacityStatusRow> statuses = new ArrayList<>();

        private ReportAccumulator(long id, long projectId, OffsetDateTime reportedAt, String note) {
            this.id = id;
            this.projectId = projectId;
            this.reportedAt = reportedAt;
            this.note = note;
        }

        private void addStatus(CapacityStatusRow status) {
            statuses.add(status);
        }

        private ProjectCapacityRow toRow() {
            return new ProjectCapacityRow(id, projectId, reportedAt, note, List.copyOf(statuses));
        }
    }
}
