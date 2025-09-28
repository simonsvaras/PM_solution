package czm.pm_solution_be.sync;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.StringJoiner;
import java.util.stream.Collectors;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class SyncDao {
    private static final Logger log = LoggerFactory.getLogger(SyncDao.class);
    private final JdbcTemplate jdbc;

    public SyncDao(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public static class UpsertResult<T> {
        public final T id;
        public final boolean inserted;
        public UpsertResult(T id, boolean inserted) {
            this.id = id;
            this.inserted = inserted;
        }
    }

    public Long createProjectByName(String name, Integer budget, LocalDate budgetFrom, LocalDate budgetTo) {
        return jdbc.queryForObject(
                "INSERT INTO project (name, budget, budget_from, budget_to) VALUES (?, ?, ?, ?) RETURNING id",
                Long.class,
                name,
                budget,
                budgetFrom,
                budgetTo);
    }

    public UpsertResult<Long> upsertProject(long gitlabProjectId, String name, Integer budget, LocalDate budgetFrom, LocalDate budgetTo) {
        int updated = jdbc.update("UPDATE project SET name = ?, budget = ?, budget_from = ?, budget_to = ? WHERE gitlab_project_id = ?",
                name,
                budget,
                budgetFrom,
                budgetTo,
                gitlabProjectId);
        if (updated > 0) {
            Long id = jdbc.queryForObject("SELECT id FROM project WHERE gitlab_project_id = ?", Long.class, gitlabProjectId);
            return new UpsertResult<>(id, false);
        }
        Long id = jdbc.queryForObject(
                "INSERT INTO project (gitlab_project_id, name, budget, budget_from, budget_to) VALUES (?, ?, ?, ?, ?) RETURNING id",
                Long.class,
                gitlabProjectId,
                name,
                budget,
                budgetFrom,
                budgetTo);
        return new UpsertResult<>(id, true);
    }

    public Optional<Long> findProjectIdByGitLabId(long gitlabProjectId) {
        List<Long> ids = jdbc.query("SELECT id FROM project WHERE gitlab_project_id = ?", (rs, rn) -> rs.getLong(1), gitlabProjectId);
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.get(0));
    }

    public record ProjectRow(Long id,
                             Long gitlabProjectId,
                             String name,
                             Integer budget,
                             LocalDate budgetFrom,
                             LocalDate budgetTo,
                             BigDecimal reportedCost) {}
    public record ProjectOverviewRow(Long id,
                                     String name,
                                     Integer budget,
                                     LocalDate budgetFrom,
                                     LocalDate budgetTo,
                                     BigDecimal reportedCost,
                                     Integer teamMembers,
                                     Integer openIssues) {}
    public List<ProjectRow> listProjects() {
        return jdbc.query("SELECT id, gitlab_project_id, name, budget, budget_from, budget_to, reported_cost FROM project ORDER BY name",
                (rs, rn) -> new ProjectRow(
                        rs.getLong("id"),
                        (Long) rs.getObject("gitlab_project_id"),
                        rs.getString("name"),
                        (Integer) rs.getObject("budget"),
                        rs.getObject("budget_from", LocalDate.class),
                        rs.getObject("budget_to", LocalDate.class),
                        rs.getBigDecimal("reported_cost")));
    }

    public List<ProjectOverviewRow> listProjectOverview() {
        String sql = """
                SELECT p.id,
                       p.name,
                       p.budget,
                       p.budget_from,
                       p.budget_to,
                       p.reported_cost,
                       COALESCE(team_counts.team_members, 0) AS team_members,
                       COALESCE(issue_counts.open_issues, 0) AS open_issues
                FROM project p
                LEFT JOIN (
                    SELECT ip.project_id,
                           COUNT(DISTINCT ip.intern_id) AS team_members
                    FROM intern_project ip
                    GROUP BY ip.project_id
                ) AS team_counts ON team_counts.project_id = p.id
                LEFT JOIN (
                    SELECT ptr.project_id,
                           COUNT(DISTINCT CASE WHEN iss.state = 'opened' THEN iss.id END) AS open_issues
                    FROM projects_to_repositorie ptr
                    JOIN issue iss ON iss.repository_id = ptr.repository_id
                    GROUP BY ptr.project_id
                ) AS issue_counts ON issue_counts.project_id = p.id
                ORDER BY p.name
                """;
        return jdbc.query(sql, (rs, rn) -> new ProjectOverviewRow(
                rs.getLong("id"),
                rs.getString("name"),
                (Integer) rs.getObject("budget"),
                rs.getObject("budget_from", LocalDate.class),
                rs.getObject("budget_to", LocalDate.class),
                rs.getBigDecimal("reported_cost"),
                rs.getInt("team_members"),
                rs.getInt("open_issues")));
    }

    public int deleteProject(long id) {
        return jdbc.update("DELETE FROM project WHERE id = ?", id);
    }

    public UpsertResult<Long> upsertRepository(long gitlabRepoId, String name, String nameWithNamespace,
                                               Long namespaceId, String namespaceName, boolean rootRepo) {
        int updated = jdbc.update("UPDATE repository SET name=?, name_with_namespace=?, namespace_id=?, namespace_name=?, root_repo=? WHERE gitlab_repo_id=?",
                name, nameWithNamespace, namespaceId, namespaceName, rootRepo, gitlabRepoId);
        if (updated > 0) {
            Long id = jdbc.queryForObject("SELECT id FROM repository WHERE gitlab_repo_id = ?", Long.class, gitlabRepoId);
            return new UpsertResult<>(id, false);
        }
        Long id = jdbc.queryForObject(
                "INSERT INTO repository (gitlab_repo_id, name, name_with_namespace, namespace_id, namespace_name, root_repo) VALUES (?,?,?,?,?,?) RETURNING id",
                Long.class, gitlabRepoId, name, nameWithNamespace, namespaceId, namespaceName, rootRepo);
        return new UpsertResult<>(id, true);
    }

    public Optional<Long> findRepositoryIdByGitLabRepoId(long gitlabRepoId) {
        List<Long> ids = jdbc.query("SELECT id FROM repository WHERE gitlab_repo_id = ?",
                (rs, rn) -> rs.getLong(1), gitlabRepoId);
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.get(0));
    }

    public void linkProjectRepository(long projectId, long repositoryId) {
        jdbc.update("INSERT INTO projects_to_repositorie (project_id, repository_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
                projectId, repositoryId);
    }

    public record RepositoryAssignment(Long id, Long gitlabRepoId, String name, String nameWithNamespace, boolean assigned) {}

    public record ProjectRepositoryLink(long repositoryId, Long gitlabRepoId, String name) {}

    public List<RepositoryAssignment> listRepositoriesWithAssignment(long projectId, String search) {
        StringBuilder sql = new StringBuilder("SELECT r.id, r.gitlab_repo_id, r.name, r.name_with_namespace, " +
                "CASE WHEN ptr.project_id IS NULL THEN FALSE ELSE TRUE END AS assigned " +
                "FROM repository r " +
                "LEFT JOIN projects_to_repositorie ptr ON ptr.repository_id = r.id AND ptr.project_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(projectId);
        if (search != null && !search.isBlank()) {
            sql.append(" WHERE LOWER(r.name) LIKE ? OR LOWER(r.name_with_namespace) LIKE ?");
            String like = "%" + search.toLowerCase() + "%";
            params.add(like);
            params.add(like);
        }
        sql.append(" ORDER BY r.name");
        return jdbc.query(sql.toString(), (rs, rn) -> new RepositoryAssignment(
                rs.getLong("id"),
                (Long) rs.getObject("gitlab_repo_id"),
                rs.getString("name"),
                rs.getString("name_with_namespace"),
                rs.getBoolean("assigned")
        ), params.toArray());
    }

    /**
     * Lists all repositories linked to a given project.  The result provides both the
     * local repository identifier (needed for persistence) and the GitLab repository
     * id that must be used when calling the GraphQL API.
     */
    public List<ProjectRepositoryLink> listProjectRepositories(long projectId) {
        String sql = "SELECT r.id AS repository_id, r.gitlab_repo_id, r.name " +
                "FROM repository r " +
                "JOIN projects_to_repositorie ptr ON ptr.repository_id = r.id " +
                "WHERE ptr.project_id = ? " +
                "ORDER BY r.name";
        return jdbc.query(sql, (rs, rn) -> new ProjectRepositoryLink(
                rs.getLong("repository_id"),
                (Long) rs.getObject("gitlab_repo_id"),
                rs.getString("name")
        ), projectId);
    }

    @Transactional
    public void replaceProjectRepositories(long projectId, List<Long> repositoryIds) {
        jdbc.update("DELETE FROM projects_to_repositorie WHERE project_id = ?", projectId);
        if (repositoryIds == null || repositoryIds.isEmpty()) {
            return;
        }
        jdbc.batchUpdate("INSERT INTO projects_to_repositorie (project_id, repository_id) VALUES (?, ?)",
                new BatchPreparedStatementSetter() {
                    @Override
                    public void setValues(java.sql.PreparedStatement ps, int i) throws java.sql.SQLException {
                        ps.setLong(1, projectId);
                        ps.setLong(2, repositoryIds.get(i));
                    }

                    @Override
                    public int getBatchSize() {
                        return repositoryIds.size();
                    }
                });
    }

    public UpsertResult<Void> upsertIssueByRepo(Long repositoryId,
                                                long gitlabIssueId,
                                                long iid,
                                                String title,
                                                String state,
                                                Long assigneeId,
                                                String assigneeUsername,
                                                String authorName,
                                                String[] labels,
                                                Integer timeEstimateSeconds,
                                                Integer totalTimeSpentSeconds,
                                                String dueDate,
                                                OffsetDateTime updatedAt) {
        int updated = jdbc.update("UPDATE issue SET repository_id=?, title=?, state=?, assignee_id=?, assignee_username=?, author_name=?, labels=?, time_estimate_seconds=?, total_time_spent_seconds=?, due_date=?::date, updated_at=? WHERE gitlab_issue_id=?",
                (ps) -> {
                    if (repositoryId == null) ps.setNull(1, java.sql.Types.BIGINT); else ps.setLong(1, repositoryId);
                    ps.setString(2, title);
                    ps.setString(3, state);
                    if (assigneeId == null) ps.setNull(4, java.sql.Types.BIGINT); else ps.setLong(4, assigneeId);
                    ps.setString(5, assigneeUsername);
                    ps.setString(6, authorName);
                    ps.setArray(7, labels == null ? null : ps.getConnection().createArrayOf("text", labels));
                    if (timeEstimateSeconds == null) ps.setNull(8, java.sql.Types.INTEGER); else ps.setInt(8, timeEstimateSeconds);
                    if (totalTimeSpentSeconds == null) ps.setNull(9, java.sql.Types.INTEGER); else ps.setInt(9, totalTimeSpentSeconds);
                    ps.setString(10, dueDate);
                    if (updatedAt == null) ps.setNull(11, java.sql.Types.TIMESTAMP_WITH_TIMEZONE); else ps.setObject(11, updatedAt);
                    ps.setLong(12, gitlabIssueId);
                });
        if (updated > 0) return new UpsertResult<>(null, false);

        jdbc.update("INSERT INTO issue (repository_id, gitlab_issue_id, iid, title, state, assignee_id, assignee_username, author_name, labels, time_estimate_seconds, total_time_spent_seconds, due_date, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?::date,?)",
                (ps) -> {
                    if (repositoryId == null) ps.setNull(1, java.sql.Types.BIGINT); else ps.setLong(1, repositoryId);
                    ps.setLong(2, gitlabIssueId);
                    ps.setLong(3, iid);
                    ps.setString(4, title);
                    ps.setString(5, state);
                    if (assigneeId == null) ps.setNull(6, java.sql.Types.BIGINT); else ps.setLong(6, assigneeId);
                    ps.setString(7, assigneeUsername);
                    ps.setString(8, authorName);
                    ps.setArray(9, labels == null ? null : ps.getConnection().createArrayOf("text", labels));
                    if (timeEstimateSeconds == null) ps.setNull(10, java.sql.Types.INTEGER); else ps.setInt(10, timeEstimateSeconds);
                    if (totalTimeSpentSeconds == null) ps.setNull(11, java.sql.Types.INTEGER); else ps.setInt(11, totalTimeSpentSeconds);
                    ps.setString(12, dueDate);
                    if (updatedAt == null) ps.setNull(13, java.sql.Types.TIMESTAMP_WITH_TIMEZONE); else ps.setObject(13, updatedAt);
                });
        return new UpsertResult<>(null, true);
    }

    public List<Long> listAllGitLabRepositoryIds() {
        return jdbc.query("SELECT gitlab_repo_id FROM repository WHERE gitlab_repo_id IS NOT NULL ORDER BY gitlab_repo_id",
                (rs, rn) -> rs.getLong(1));
    }

    public List<Long> listAssignedGitLabRepositoryIds() {
        return jdbc.query("SELECT DISTINCT r.gitlab_repo_id " +
                        "FROM repository r " +
                        "JOIN projects_to_repositorie ptr ON ptr.repository_id = r.id " +
                        "WHERE r.gitlab_repo_id IS NOT NULL " +
                        "ORDER BY r.gitlab_repo_id",
                (rs, rn) -> rs.getLong(1));
    }

    public Optional<OffsetDateTime> getRepoCursor(long repositoryId, String scope) {
        List<OffsetDateTime> rows = jdbc.query("SELECT last_run_at FROM sync_cursor_repo WHERE repository_id = ? AND scope = ?",
                (rs, rn) -> rs.getObject(1, OffsetDateTime.class), repositoryId, scope);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public void upsertRepoCursor(long repositoryId, String scope, OffsetDateTime lastRunAt) {
        String sql = "INSERT INTO sync_cursor_repo (repository_id, scope, last_run_at) VALUES (?,?,?) ON CONFLICT (repository_id, scope) DO UPDATE SET last_run_at = EXCLUDED.last_run_at";
        jdbc.update(sql, repositoryId, scope, lastRunAt);
    }

    /**
     * Returns the newest {@code spent_at} timestamp stored for a repository.  The
     * timestamp acts as a cursor for incremental synchronisation.
     */
    public Optional<OffsetDateTime> findLastReportSpentAt(long repositoryId) {
        List<OffsetDateTime> rows = jdbc.query(
                "SELECT spent_at FROM report WHERE repository_id = ? ORDER BY spent_at DESC LIMIT 1",
                (rs, rn) -> rs.getObject(1, OffsetDateTime.class),
                repositoryId);
        return rows.isEmpty() ? Optional.empty() : Optional.ofNullable(rows.get(0));
    }

    public record ReportRow(long repositoryId,
                            Long issueIid,
                            OffsetDateTime spentAt,
                            int timeSpentSeconds,
                            BigDecimal timeSpentHours,
                            String username) {}

    public record ReportInsertStats(int inserted, int duplicates, int failed, List<String> missingUsernames) {}

    /**
     * Inserts timelog rows and reports how many entries were persisted,
     * deduplicated or rejected because of referential problems (e.g. missing
     * intern accounts).
     */
    public ReportInsertStats insertReports(List<ReportRow> rows) {
        int inserted = 0;
        int duplicates = 0;
        int failed = 0;
        LinkedHashSet<String> missingUsernames = new LinkedHashSet<>();
        if (rows == null || rows.isEmpty()) {
            return new ReportInsertStats(0, 0, 0, List.of());
        }

        Set<String> uniqueUsernames = rows.stream()
                .map(ReportRow::username)
                .filter(username -> username != null && !username.isBlank())
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<String> existingUsernames = loadExistingInternUsernames(uniqueUsernames);
        Map<String, List<HourlyRateSlice>> hourlyRateTimeline = loadInternHourlyRateTimeline(existingUsernames);

        List<ReportRow> candidates = new ArrayList<>();
        for (ReportRow row : rows) {
            if (!existingUsernames.contains(row.username())) {
                failed++;
                missingUsernames.add(row.username());
                continue;
            }
            candidates.add(row);
        }

        if (candidates.isEmpty()) {
            return new ReportInsertStats(0, 0, failed, List.copyOf(missingUsernames));
        }

        for (ReportRow row : candidates) {
            List<HourlyRateSlice> slices = hourlyRateTimeline.get(row.username());
            if (slices == null || slices.isEmpty()) {
                failed++;
                log.warn("Chybí historie sazeb pro uživatele {} – záznam nebyl uložen.", row.username());
                continue;
            }
            LocalDate spentDate = row.spentAt().toLocalDate();
            BigDecimal hourlyRate = resolveHourlyRate(slices, spentDate);
            if (hourlyRate == null) {
                failed++;
                log.warn("Nenalezena sazba pro uživatele {} k datu {} – záznam nebyl uložen.", row.username(), spentDate);
                continue;
            }
            BigDecimal cost = row.timeSpentHours().multiply(hourlyRate).setScale(2, RoundingMode.HALF_UP);
            try {
                int result = jdbc.update("INSERT INTO report (repository_id, iid, spent_at, time_spent_seconds, time_spent_hours, username, cost) " +
                                "VALUES (?,?,?,?,?,?,?) ON CONFLICT (repository_id, iid, username, spent_at, time_spent_seconds) DO NOTHING",
                        ps -> {
                            ps.setLong(1, row.repositoryId());
                            if (row.issueIid() == null) ps.setNull(2, java.sql.Types.BIGINT); else ps.setLong(2, row.issueIid());
                            ps.setObject(3, row.spentAt());
                            ps.setInt(4, row.timeSpentSeconds());
                            ps.setBigDecimal(5, row.timeSpentHours());
                            ps.setString(6, row.username());
                            ps.setBigDecimal(7, cost);
                        });
                if (result > 0) inserted += result; else duplicates++;
            } catch (DataIntegrityViolationException ex) {
                failed++;
                log.warn("Nepodařilo se vložit report pro repo {}: {}", row.repositoryId(), ex.getMessage());
            }
        }
        return new ReportInsertStats(inserted, duplicates, failed, List.copyOf(missingUsernames));
    }

    /**
     * Removes every stored timelog entry. Used by the on-demand maintenance action.
     *
     * @return number of deleted rows.
     */
    public int deleteAllReports() {
        return jdbc.update("DELETE FROM report");
    }

    /**
     * Removes timelog entries linked to the repositories assigned to the provided project IDs.
     *
     * @param projectIds list of project identifiers (duplicates are ignored)
     * @return number of deleted rows
     */
    public int deleteReportsForProjects(List<Long> projectIds) {
        if (projectIds == null || projectIds.isEmpty()) {
            return 0;
        }
        Set<Long> uniqueIds = new LinkedHashSet<>(projectIds);
        StringJoiner placeholders = new StringJoiner(", ");
        List<Object> params = new ArrayList<>();
        for (Long id : uniqueIds) {
            placeholders.add("?");
            params.add(id);
        }
        String sql = "DELETE FROM report WHERE repository_id IN (" +
                "SELECT ptr.repository_id FROM projects_to_repositorie ptr WHERE ptr.project_id IN (" + placeholders + ")" +
                ")";
        return jdbc.update(sql, params.toArray());
    }

    /**
     * Resolves which usernames already exist in the {@code intern} table.  Keeping the
     * lookup close to the data layer ensures we do not accidentally duplicate
     * validation logic in multiple services.
     */
    private Set<String> loadExistingInternUsernames(Set<String> usernames) {
        if (usernames == null || usernames.isEmpty()) {
            return Set.of();
        }
        StringJoiner placeholders = new StringJoiner(", ");
        List<Object> params = new ArrayList<>();
        for (String username : usernames) {
            placeholders.add("?");
            params.add(username);
        }
        String sql = "SELECT username FROM intern WHERE username IN (" + placeholders + ")";
        return jdbc.query(sql, (rs, rn) -> rs.getString(1), params.toArray())
                .stream()
                .collect(Collectors.toSet());
    }

    private Map<String, List<HourlyRateSlice>> loadInternHourlyRateTimeline(Set<String> usernames) {
        if (usernames == null || usernames.isEmpty()) {
            return Map.of();
        }
        StringJoiner placeholders = new StringJoiner(", ");
        List<Object> params = new ArrayList<>();
        for (String username : usernames) {
            placeholders.add("?");
            params.add(username);
        }
        String sql = "SELECT i.username, h.valid_from, h.valid_to, l.hourly_rate_czk " +
                "FROM intern i " +
                "JOIN intern_level_history h ON h.intern_id = i.id " +
                "JOIN level l ON l.id = h.level_id " +
                "WHERE i.username IN (" + placeholders + ") " +
                "ORDER BY i.username, h.valid_from";
        Map<String, List<HourlyRateSlice>> rates = new HashMap<>();
        jdbc.query(sql, params.toArray(), rs -> {
            String username = rs.getString("username");
            LocalDate validFrom = rs.getObject("valid_from", LocalDate.class);
            LocalDate validTo = rs.getObject("valid_to", LocalDate.class);
            BigDecimal hourlyRate = rs.getBigDecimal("hourly_rate_czk");
            rates.computeIfAbsent(username, ignored -> new ArrayList<>())
                    .add(new HourlyRateSlice(validFrom, validTo, hourlyRate));
        });
        return rates;
    }

    private BigDecimal resolveHourlyRate(List<HourlyRateSlice> slices, LocalDate spentDate) {
        for (HourlyRateSlice slice : slices) {
            if (slice.covers(spentDate)) {
                return slice.hourlyRate();
            }
        }
        return null;
    }

    private record HourlyRateSlice(LocalDate validFrom, LocalDate validTo, BigDecimal hourlyRate) {
        boolean covers(LocalDate date) {
            if (date.isBefore(validFrom)) {
                return false;
            }
            return validTo == null || !date.isAfter(validTo);
        }
    }

    public void updateProject(long id, String name, Integer budget, LocalDate budgetFrom, LocalDate budgetTo) {
        jdbc.update("UPDATE project SET name = ?, budget = ?, budget_from = ?, budget_to = ? WHERE id = ?",
                name,
                budget,
                budgetFrom,
                budgetTo,
                id);
    }

    public record ProjectInternRow(long id, String username, String firstName, String lastName) {}

    public record ProjectReportDetailRow(long repositoryId,
                                         String repositoryName,
                                         Long issueId,
                                         Long issueIid,
                                         String issueTitle,
                                         long internId,
                                         String internUsername,
                                         String internFirstName,
                                         String internLastName,
                                         BigDecimal hours,
                                         BigDecimal cost) {}

    public List<ProjectInternRow> listProjectInterns(long projectId) {
        String sql = """
                SELECT DISTINCT i.id,
                                i.username,
                                i.first_name,
                                i.last_name
                FROM intern_project ip
                JOIN intern i ON i.id = ip.intern_id
                WHERE ip.project_id = ?
                ORDER BY i.last_name, i.first_name, i.username
                """;
        return jdbc.query(sql, (rs, rn) -> new ProjectInternRow(
                rs.getLong("id"),
                rs.getString("username"),
                rs.getString("first_name"),
                rs.getString("last_name")
        ), projectId);
    }

    public List<ProjectReportDetailRow> listProjectReportDetail(long projectId,
                                                                OffsetDateTime from,
                                                                OffsetDateTime to,
                                                                String internUsername) {
        StringBuilder sql = new StringBuilder("SELECT r.repository_id, " +
                "repo.name AS repository_name, " +
                "iss.id AS issue_id, " +
                "r.iid AS issue_iid, " +
                "iss.title AS issue_title, " +
                "i.id AS intern_id, " +
                "i.username AS intern_username, " +
                "i.first_name AS intern_first_name, " +
                "i.last_name AS intern_last_name, " +
                "SUM(r.time_spent_hours) AS hours, " +
                "COALESCE(SUM(r.cost), 0) AS cost " +
                "FROM report r " +
                "JOIN projects_to_repositorie ptr ON ptr.repository_id = r.repository_id " +
                "JOIN repository repo ON repo.id = r.repository_id " +
                "JOIN intern i ON i.username = r.username " +
                "LEFT JOIN issue iss ON iss.repository_id = r.repository_id AND iss.iid = r.iid " +
                "WHERE ptr.project_id = ?");

        List<Object> params = new ArrayList<>();
        params.add(projectId);

        if (from != null) {
            sql.append(" AND r.spent_at >= ?");
            params.add(from);
        }
        if (to != null) {
            sql.append(" AND r.spent_at <= ?");
            params.add(to);
        }
        if (internUsername != null && !internUsername.isBlank()) {
            sql.append(" AND i.username = ?");
            params.add(internUsername);
        }

        sql.append(" GROUP BY r.repository_id, repo.name, iss.id, r.iid, iss.title, i.id, i.username, i.first_name, i.last_name");
        sql.append(" ORDER BY repo.name, r.iid NULLS LAST, iss.title NULLS LAST, i.last_name, i.first_name, i.username");

        return jdbc.query(sql.toString(), (rs, rn) -> new ProjectReportDetailRow(
                rs.getLong("repository_id"),
                rs.getString("repository_name"),
                (Long) rs.getObject("issue_id"),
                (Long) rs.getObject("issue_iid"),
                rs.getString("issue_title"),
                rs.getLong("intern_id"),
                rs.getString("intern_username"),
                rs.getString("intern_first_name"),
                rs.getString("intern_last_name"),
                rs.getBigDecimal("hours"),
                rs.getBigDecimal("cost")
        ), params.toArray());
    }

    public int recomputeReportCostsForIntern(long internId) {
        String sql = """
                UPDATE report r
                SET cost = ROUND(l.hourly_rate_czk * r.time_spent_hours, 2)
                FROM intern i
                JOIN intern_level_history h ON h.intern_id = i.id
                JOIN level l ON l.id = h.level_id
                WHERE i.id = ?
                  AND r.username = i.username
                  AND r.spent_at::date >= h.valid_from
                  AND (h.valid_to IS NULL OR r.spent_at::date <= h.valid_to)
                """;
        return jdbc.update(sql, internId);
    }
}
