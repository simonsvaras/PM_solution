package czm.pm_solution_be.intern;

/**
 * Low-level JDBC access for the intern aggregate.
 *
 * The DAO encapsulates all SQL related to interns, including
 * pagination, level/group lookups and writing helper tables
 * such as intern_group or intern_level_history.
 */
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.rowset.SqlRowSet;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Repository
public class InternDao {
    private final JdbcTemplate jdbc;

    public record InternRow(long id, String firstName, String lastName, String username, long levelId, String levelLabel) {}
    public record InternAssignmentRow(long id,
                                      String firstName,
                                      String lastName,
                                      String username,
                                      long levelId,
                                      String levelCode,
                                      String levelLabel,
                                      BigDecimal workloadHours,
                                      boolean assigned) {}
    public record GroupRow(long id, int code, String label) {}
    public record LevelRow(long id, String code, String label) {}
    public record SortOrder(String column, boolean ascending) {}
    public record InternQuery(String q, String username, int page, int size, List<SortOrder> orders) {}
    public record PageResult(List<InternRow> rows, long totalElements) {}
    public record ProjectInternAllocation(long internId, BigDecimal workloadHours) {}

    private static final RowMapper<InternRow> INTERN_MAPPER = new RowMapper<>() {
        @Override
        public InternRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new InternRow(
                    rs.getLong("id"),
                    rs.getString("first_name"),
                    rs.getString("last_name"),
                    rs.getString("username"),
                    rs.getLong("level_id"),
                    rs.getString("level_label"));
        }
    };

    private static final RowMapper<GroupRow> GROUP_MAPPER = (rs, rn) -> new GroupRow(
            rs.getLong("id"),
            rs.getInt("code"),
            rs.getString("label"));

    private static final RowMapper<LevelRow> LEVEL_MAPPER = (rs, rn) -> new LevelRow(
            rs.getLong("id"),
            rs.getString("code"),
            rs.getString("label"));

    public InternDao(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Fetches a single intern by id including the resolved level label.
     */
    public Optional<InternRow> findById(long id) {
        List<InternRow> rows = jdbc.query("""
                SELECT i.id, i.first_name, i.last_name, i.username, i.level_id, l.label AS level_label
                FROM intern i
                JOIN level l ON l.id = i.level_id
                WHERE i.id = ?
                """, INTERN_MAPPER, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /**
     * Looks up an intern by username ignoring case.
     */
    public Optional<InternRow> findByUsernameIgnoreCase(String username) {
        List<InternRow> rows = jdbc.query("""
                SELECT i.id, i.first_name, i.last_name, i.username, i.level_id, l.label AS level_label
                FROM intern i
                JOIN level l ON l.id = i.level_id
                WHERE LOWER(i.username) = ?
                """, INTERN_MAPPER, username.toLowerCase(Locale.ROOT));
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /**
     * Inserts a new intern and returns the stored row.
     */
    public InternRow insert(String firstName, String lastName, String username, long levelId) {
        InternRow inserted = jdbc.queryForObject(
                """
                INSERT INTO intern (first_name, last_name, username, level_id)
                VALUES (?, ?, ?, ?)
                RETURNING id, first_name, last_name, username, level_id,
                          (SELECT label FROM level WHERE id = level_id) AS level_label
                """,
                INTERN_MAPPER,
                firstName,
                lastName,
                username,
                levelId);
        if (inserted == null) {
            throw new IllegalStateException("Failed to insert intern");
        }
        return inserted;
    }

    /**
     * Updates an intern record and returns the current state.
     */
    public InternRow update(long id, String firstName, String lastName, String username, long levelId) {
        InternRow updated = jdbc.queryForObject(
                """
                UPDATE intern
                SET first_name = ?, last_name = ?, username = ?, level_id = ?
                WHERE id = ?
                RETURNING id, first_name, last_name, username, level_id,
                          (SELECT label FROM level WHERE id = level_id) AS level_label
                """,
                INTERN_MAPPER,
                firstName,
                lastName,
                username,
                levelId,
                id);
        if (updated == null) {
            throw new IllegalStateException("Failed to update intern");
        }
        return updated;
    }

    /**
     * Removes the intern row. Returns number of affected rows.
     */
    public int delete(long id) {
        return jdbc.update("DELETE FROM intern WHERE id = ?", id);
    }

    /**
     * Lists interns with pagination, optional filtering and sorting.
     */
    public PageResult list(InternQuery query) {
        StringBuilder sql = new StringBuilder("""
                FROM intern i
                JOIN level l ON l.id = i.level_id
                WHERE 1=1
                """);
        List<Object> params = new ArrayList<>();

        if (query.username() != null && !query.username().isBlank()) {
            sql.append(" AND LOWER(i.username) = ?");
            params.add(query.username().toLowerCase(Locale.ROOT));
        }

        if (query.q() != null && !query.q().isBlank()) {
            String like = "%" + query.q().toLowerCase(Locale.ROOT) + "%";
            sql.append(" AND (LOWER(i.first_name) LIKE ? OR LOWER(i.last_name) LIKE ? OR LOWER(i.username) LIKE ?)");
            params.add(like);
            params.add(like);
            params.add(like);
        }

        Long total = jdbc.queryForObject("SELECT COUNT(*) " + sql, params.toArray(), Long.class);

        String orderClause = buildOrderClause(query.orders());
        List<Object> listParams = new ArrayList<>(params);
        listParams.add(query.size());
        listParams.add(query.page() * query.size());

        List<InternRow> rows = jdbc.query(
                """
                SELECT i.id, i.first_name, i.last_name, i.username, i.level_id, l.label AS level_label
                """ + sql + orderClause + " LIMIT ? OFFSET ?",
                INTERN_MAPPER,
                listParams.toArray());

        return new PageResult(rows, total != null ? total : 0L);
    }

    /**
     * Returns all configured levels ordered by label.
     */
    public List<LevelRow> listLevels() {
        return jdbc.query("SELECT id, code, label FROM level ORDER BY label", LEVEL_MAPPER);
    }

    /**
     * Fetches a single level row by id.
     */
    public Optional<LevelRow> findLevel(long levelId) {
        List<LevelRow> rows = jdbc.query("SELECT id, code, label FROM level WHERE id = ?", LEVEL_MAPPER, levelId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /**
     * Returns all groups ordered by label.
     */
    public List<GroupRow> listGroups() {
        return jdbc.query("SELECT id, code, label FROM \"group\" ORDER BY label", GROUP_MAPPER);
    }

    /**
     * Resolves the details for the provided group ids.
     */
    public List<GroupRow> findGroupsByIds(Collection<Long> groupIds) {
        if (groupIds == null || groupIds.isEmpty()) {
            return List.of();
        }
        String inClause = groupIds.stream().map(id -> "?").reduce((a, b) -> a + "," + b).orElse("?");
        List<Object> params = new ArrayList<>();
        params.addAll(groupIds);
        return jdbc.query("SELECT id, code, label FROM \"group\" WHERE id IN (" + inClause + ")", GROUP_MAPPER, params.toArray());
    }

    /**
     * Loads group allocations for a set of intern ids.
     */
    public Map<Long, List<GroupRow>> findGroupsForInternIds(Collection<Long> internIds) {
        Map<Long, List<GroupRow>> map = new HashMap<>();
        if (internIds == null || internIds.isEmpty()) {
            return map;
        }
        String inClause = internIds.stream().map(id -> "?").reduce((a, b) -> a + "," + b).orElse("?");
        List<Object> params = new ArrayList<>();
        params.addAll(internIds);
        jdbc.query("""
                SELECT ig.intern_id, g.id, g.code, g.label
                FROM intern_group ig
                JOIN \"group\" g ON g.id = ig.group_id
                WHERE ig.intern_id IN (""" + inClause + ") ORDER BY g.label",
                rs -> {
                    long internId = rs.getLong("intern_id");
                    map.computeIfAbsent(internId, k -> new ArrayList<>())
                            .add(new GroupRow(rs.getLong("id"), rs.getInt("code"), rs.getString("label")));
                },
                params.toArray());
        return map;
    }

    /**
     * Replaces all group assignments for a given intern.
     */
    public void replaceInternGroups(long internId, List<Long> groupIds) {
        jdbc.update("DELETE FROM intern_group WHERE intern_id = ?", internId);
        if (groupIds == null || groupIds.isEmpty()) {
            return;
        }
        jdbc.batchUpdate("INSERT INTO intern_group (intern_id, group_id) VALUES (?, ?)", groupIds, groupIds.size(), (ps, groupId) -> {
            ps.setLong(1, internId);
            ps.setLong(2, groupId);
        });
    }

    public List<InternAssignmentRow> listInternsWithAssignment(long projectId, String search) {
        StringBuilder sql = new StringBuilder("""
                SELECT i.id,
                       i.first_name,
                       i.last_name,
                       i.username,
                       i.level_id,
                       l.code AS level_code,
                       l.label AS level_label,
                       ip.workload_hours AS workload_hours,
                       CASE WHEN ip.project_id IS NULL THEN FALSE ELSE TRUE END AS assigned
                FROM intern i
                JOIN level l ON l.id = i.level_id
                LEFT JOIN intern_project ip ON ip.intern_id = i.id AND ip.project_id = ?
                """);
        List<Object> params = new ArrayList<>();
        params.add(projectId);
        if (search != null && !search.isBlank()) {
            String like = "%" + search.toLowerCase(Locale.ROOT) + "%";
            sql.append(" WHERE LOWER(i.first_name) LIKE ? OR LOWER(i.last_name) LIKE ? OR LOWER(i.username) LIKE ?");
            params.add(like);
            params.add(like);
            params.add(like);
        }
        sql.append(" ORDER BY i.last_name ASC, i.first_name ASC, i.id ASC");
        return jdbc.query(sql.toString(), (rs, rn) -> new InternAssignmentRow(
                rs.getLong("id"),
                rs.getString("first_name"),
                rs.getString("last_name"),
                rs.getString("username"),
                rs.getLong("level_id"),
                rs.getString("level_code"),
                rs.getString("level_label"),
                rs.getBigDecimal("workload_hours"),
                rs.getBoolean("assigned")),
                params.toArray());
    }

    public void replaceProjectInterns(long projectId, List<ProjectInternAllocation> assignments) {
        jdbc.update("DELETE FROM intern_project WHERE project_id = ?", projectId);
        if (assignments == null || assignments.isEmpty()) {
            return;
        }
        jdbc.batchUpdate("INSERT INTO intern_project (project_id, intern_id, workload_hours) VALUES (?, ?, ?)", assignments, assignments.size(),
                (ps, assignment) -> {
                    ps.setLong(1, projectId);
                    ps.setLong(2, assignment.internId());
                    if (assignment.workloadHours() == null) {
                        ps.setNull(3, Types.NUMERIC);
                    } else {
                        ps.setBigDecimal(3, assignment.workloadHours());
                    }
                });
    }

    /**
     * Inserts a new record into intern_level_history for the supplied level.
     */
    public void insertLevelHistory(long internId, long levelId, LocalDate fromDate) {
        jdbc.update(
                "INSERT INTO intern_level_history (intern_id, level_id, valid_from, valid_to) VALUES (?, ?, ?, NULL)",
                internId,
                levelId,
                fromDate);
    }

    /**
     * Closes the current open level history record when a level changes.
     */
    public void closeOpenLevelHistory(long internId, LocalDate newLevelStart) {
        jdbc.update(
                """
                UPDATE intern_level_history
                SET valid_to = CASE WHEN valid_from >= ? THEN ? ELSE ? END
                WHERE intern_id = ? AND valid_to IS NULL
                """,
                newLevelStart,
                newLevelStart,
                newLevelStart.minusDays(1),
                internId);
    }

    private static String buildOrderClause(List<SortOrder> orders) {
        if (orders == null || orders.isEmpty()) {
            return " ORDER BY i.last_name ASC, i.first_name ASC, i.id ASC";
        }
        StringBuilder sb = new StringBuilder(" ORDER BY ");
        for (int i = 0; i < orders.size(); i++) {
            SortOrder order = orders.get(i);
            if (i > 0) {
                sb.append(", ");
            }
            sb.append(order.column()).append(order.ascending() ? " ASC" : " DESC");
        }
        return sb.toString();
    }
}

