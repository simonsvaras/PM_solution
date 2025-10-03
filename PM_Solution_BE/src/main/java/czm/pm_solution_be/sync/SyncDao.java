package czm.pm_solution_be.sync;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Types;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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

    public Long createProjectByName(String name,
                                    Integer budget,
                                    LocalDate budgetFrom,
                                    LocalDate budgetTo,
                                    Long namespaceId,
                                    String namespaceName,
                                    BigDecimal hourlyRateCzk) {
        return jdbc.queryForObject(
                "INSERT INTO project (name, budget, budget_from, budget_to, namespace_id, namespace_name, hourly_rate_czk) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
                Long.class,
                name,
                budget,
                budgetFrom,
                budgetTo,
                namespaceId,
                namespaceName,
                hourlyRateCzk);
    }

    public UpsertResult<Long> upsertProject(Long namespaceId,
                                            String namespaceName,
                                            String name,
                                            Integer budget,
                                            LocalDate budgetFrom,
                                            LocalDate budgetTo,
                                            BigDecimal hourlyRateCzk) {
        int updated = 0;
        if (namespaceId != null) {
            updated = jdbc.update("UPDATE project SET name = ?, namespace_name = ?, budget = ?, budget_from = ?, budget_to = ?, hourly_rate_czk = ? WHERE namespace_id = ?",
                    name,
                    namespaceName,
                    budget,
                    budgetFrom,
                    budgetTo,
                    hourlyRateCzk,
                    namespaceId);
            if (updated > 0) {
                Long id = jdbc.queryForObject("SELECT id FROM project WHERE namespace_id = ?", Long.class, namespaceId);
                return new UpsertResult<>(id, false);
            }
        }
        Long id = jdbc.queryForObject(
                "INSERT INTO project (namespace_id, namespace_name, name, budget, budget_from, budget_to, hourly_rate_czk) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
                Long.class,
                namespaceId,
                namespaceName,
                name,
                budget,
                budgetFrom,
                budgetTo,
                hourlyRateCzk);
        return new UpsertResult<>(id, true);
    }

    public Optional<Long> findProjectIdByNamespaceId(long namespaceId) {
        List<Long> ids = jdbc.query("SELECT id FROM project WHERE namespace_id = ?", (rs, rn) -> rs.getLong(1), namespaceId);
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.get(0));
    }

    public record ProjectRow(Long id,
                             Long namespaceId,
                             String namespaceName,
                             String name,
                             Integer budget,
                             LocalDate budgetFrom,
                             LocalDate budgetTo,
                             BigDecimal hourlyRateCzk,
                             BigDecimal reportedCost) {}
    public record ProjectOverviewRow(Long id,
                                     String name,
                                     Integer budget,
                                     LocalDate budgetFrom,
                                     LocalDate budgetTo,
                                     BigDecimal hourlyRateCzk,
                                     BigDecimal reportedCost,
                                     Integer teamMembers,
                                     Integer openIssues) {}
    public List<ProjectRow> listProjects() {
        return jdbc.query("SELECT id, namespace_id, namespace_name, name, budget, budget_from, budget_to, hourly_rate_czk, reported_cost FROM project ORDER BY name",
                (rs, rn) -> new ProjectRow(
                        rs.getLong("id"),
                        (Long) rs.getObject("namespace_id"),
                        rs.getString("namespace_name"),
                        rs.getString("name"),
                        (Integer) rs.getObject("budget"),
                        rs.getObject("budget_from", LocalDate.class),
                        rs.getObject("budget_to", LocalDate.class),
                        rs.getBigDecimal("hourly_rate_czk"),
                        rs.getBigDecimal("reported_cost")));
    }

    public List<ProjectOverviewRow> listProjectOverview() {
        String sql = """
                SELECT p.id,
                       p.name,
                       p.budget,
                       p.budget_from,
                       p.budget_to,
                       p.hourly_rate_czk,
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
                rs.getBigDecimal("hourly_rate_czk"),
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

    public record RepositoryNamespace(Long repositoryId, Long namespaceId) {}

    public Optional<RepositoryNamespace> findRepositoryNamespaceByGitLabRepoId(long gitlabRepoId) {
        List<RepositoryNamespace> rows = jdbc.query(
                "SELECT id, namespace_id FROM repository WHERE gitlab_repo_id = ?",
                (rs, rn) -> new RepositoryNamespace(
                        rs.getLong("id"),
                        (Long) rs.getObject("namespace_id")
                ),
                gitlabRepoId
        );
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public void linkProjectRepository(long projectId, long repositoryId) {
        jdbc.update("INSERT INTO projects_to_repositorie (project_id, repository_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
                projectId, repositoryId);
    }

    public record RepositoryAssignment(Long id, Long gitlabRepoId, String name, String nameWithNamespace, boolean assigned) {}

    public record ProjectRepositoryLink(long repositoryId, Long gitlabRepoId, String name, BigDecimal projectHourlyRate) {}

    public List<ProjectRepositoryLink> listAllRepositoriesForSync() {
        String sql = """
                SELECT r.id AS repository_id,
                       r.gitlab_repo_id,
                       r.name,
                       agg.hourly_rate_czk
                FROM repository r
                LEFT JOIN LATERAL (
                    SELECT MAX(p.hourly_rate_czk) AS hourly_rate_czk
                    FROM projects_to_repositorie ptr
                    JOIN project p ON p.id = ptr.project_id
                    WHERE ptr.repository_id = r.id
                ) AS agg ON TRUE
                ORDER BY r.name
                """;
        return jdbc.query(sql, (rs, rn) -> new ProjectRepositoryLink(
                rs.getLong("repository_id"),
                (Long) rs.getObject("gitlab_repo_id"),
                rs.getString("name"),
                rs.getBigDecimal("hourly_rate_czk")
        ));
    }

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
        String sql = "SELECT r.id AS repository_id, r.gitlab_repo_id, r.name, p.hourly_rate_czk " +
                "FROM repository r " +
                "JOIN projects_to_repositorie ptr ON ptr.repository_id = r.id " +
                "JOIN project p ON p.id = ptr.project_id " +
                "WHERE ptr.project_id = ? " +
                "ORDER BY r.name";
        return jdbc.query(sql, (rs, rn) -> new ProjectRepositoryLink(
                rs.getLong("repository_id"),
                (Long) rs.getObject("gitlab_repo_id"),
                rs.getString("name"),
                rs.getBigDecimal("hourly_rate_czk")
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
                                                String milestoneTitle,
                                                String milestoneState,
                                                String dueDate,
                                                OffsetDateTime createdAt,
                                                OffsetDateTime updatedAt,
                                                String webUrl,
                                                String humanTimeEstimate) {
        int updated = jdbc.update("UPDATE issue SET repository_id=?, title=?, state=?, assignee_id=?, assignee_username=?, author_name=?, labels=?, time_estimate_seconds=?, total_time_spent_seconds=?, milestone_title=?, milestone_state=?, due_date=?::date, created_at=?, updated_at=?, web_url=?, human_time_estimate=? WHERE gitlab_issue_id=?",
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
                    ps.setString(10, milestoneTitle);
                    ps.setString(11, milestoneState);
                    ps.setString(12, dueDate);
                    if (createdAt == null) ps.setNull(13, java.sql.Types.TIMESTAMP_WITH_TIMEZONE); else ps.setObject(13, createdAt);
                    if (updatedAt == null) ps.setNull(14, java.sql.Types.TIMESTAMP_WITH_TIMEZONE); else ps.setObject(14, updatedAt);
                    ps.setString(15, webUrl);
                    ps.setString(16, humanTimeEstimate);
                    ps.setLong(17, gitlabIssueId);
                });
        if (updated > 0) return new UpsertResult<>(null, false);

        jdbc.update("INSERT INTO issue (repository_id, gitlab_issue_id, iid, title, state, assignee_id, assignee_username, author_name, labels, time_estimate_seconds, total_time_spent_seconds, milestone_title, milestone_state, due_date, created_at, updated_at, web_url, human_time_estimate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?::date,?,?,?,?,?)",
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
                    ps.setString(12, milestoneTitle);
                    ps.setString(13, milestoneState);
                    ps.setString(14, dueDate);
                    if (createdAt == null) ps.setNull(15, java.sql.Types.TIMESTAMP_WITH_TIMEZONE); else ps.setObject(15, createdAt);
                    if (updatedAt == null) ps.setNull(16, java.sql.Types.TIMESTAMP_WITH_TIMEZONE); else ps.setObject(16, updatedAt);
                    ps.setString(17, webUrl);
                    ps.setString(18, humanTimeEstimate);
                });
        return new UpsertResult<>(null, true);
    }

    public UpsertResult<Void> upsertMilestone(long projectId,
                                              long milestoneId,
                                              long milestoneIid,
                                              String title,
                                              String state,
                                              String description,
                                              LocalDate dueDate,
                                              OffsetDateTime createdAt,
                                              OffsetDateTime updatedAt) {
        int updated = jdbc.update("UPDATE milestone SET project_id=?, milestone_iid=?, title=?, state=?, description=?, due_date=?, created_at=?, updated_at=? WHERE milestone_id=?",
                ps -> {
                    ps.setLong(1, projectId);
                    ps.setLong(2, milestoneIid);
                    ps.setString(3, title);
                    ps.setString(4, state);
                    if (description == null) ps.setNull(5, Types.LONGVARCHAR); else ps.setString(5, description);
                    if (dueDate == null) ps.setNull(6, Types.DATE); else ps.setObject(6, dueDate);
                    if (createdAt == null) ps.setNull(7, Types.TIMESTAMP_WITH_TIMEZONE); else ps.setObject(7, createdAt);
                    if (updatedAt == null) ps.setNull(8, Types.TIMESTAMP_WITH_TIMEZONE); else ps.setObject(8, updatedAt);
                    ps.setLong(9, milestoneId);
                });
        if (updated > 0) {
            return new UpsertResult<>(null, false);
        }

        jdbc.update("INSERT INTO milestone (milestone_id, project_id, milestone_iid, title, state, description, due_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                ps -> {
                    ps.setLong(1, milestoneId);
                    ps.setLong(2, projectId);
                    ps.setLong(3, milestoneIid);
                    ps.setString(4, title);
                    ps.setString(5, state);
                    if (description == null) ps.setNull(6, Types.LONGVARCHAR); else ps.setString(6, description);
                    if (dueDate == null) ps.setNull(7, Types.DATE); else ps.setObject(7, dueDate);
                    if (createdAt == null) ps.setNull(8, Types.TIMESTAMP_WITH_TIMEZONE); else ps.setObject(8, createdAt);
                    if (updatedAt == null) ps.setNull(9, Types.TIMESTAMP_WITH_TIMEZONE); else ps.setObject(9, updatedAt);
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
                            String username,
                            BigDecimal projectHourlyRate) {}

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
        List<ReportRow> orphanCandidates = new ArrayList<>();
        for (ReportRow row : rows) {
            if (!existingUsernames.contains(row.username())) {
                missingUsernames.add(row.username());
                orphanCandidates.add(row);
            } else {
                candidates.add(row);
            }
        }

        for (ReportRow row : candidates) {
            List<HourlyRateSlice> slices = hourlyRateTimeline.get(row.username());
            if (slices == null || slices.isEmpty()) {
                failed++;
                log.warn("Chybí historie sazeb pro uživatele {} – záznam nebyl uložen.", row.username());
                continue;
            }
            LocalDate spentDate = row.spentAt().toLocalDate();
            BigDecimal internHourlyRate = resolveHourlyRate(slices, spentDate);
            BigDecimal projectHourlyRate = row.projectHourlyRate();
            BigDecimal effectiveRate = projectHourlyRate != null ? projectHourlyRate : internHourlyRate;
            if (effectiveRate == null) {
                failed++;
                log.warn("Nenalezena sazba pro uživatele {} k datu {} – záznam nebyl uložen.", row.username(), spentDate);
                continue;
            }
            BigDecimal cost = row.timeSpentHours().multiply(effectiveRate).setScale(2, RoundingMode.HALF_UP);
            try {
                int result = jdbc.update("INSERT INTO report (repository_id, iid, spent_at, time_spent_seconds, time_spent_hours, username, cost, hourly_rate_czk, unregistered_username) " +
                                "VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT (repository_id, iid, username_fallback, spent_at, time_spent_seconds) DO NOTHING",
                        ps -> {
                            ps.setLong(1, row.repositoryId());
                            if (row.issueIid() == null) ps.setNull(2, java.sql.Types.BIGINT); else ps.setLong(2, row.issueIid());
                            ps.setObject(3, row.spentAt());
                            ps.setInt(4, row.timeSpentSeconds());
                            ps.setBigDecimal(5, row.timeSpentHours());
                            ps.setString(6, row.username());
                            if (cost == null) ps.setNull(7, Types.NUMERIC); else ps.setBigDecimal(7, cost);
                            if (internHourlyRate == null) ps.setNull(8, Types.NUMERIC); else ps.setBigDecimal(8, internHourlyRate);
                            ps.setNull(9, Types.VARCHAR);
                        });
                if (result > 0) inserted += result; else duplicates++;
            } catch (DataIntegrityViolationException ex) {
                failed++;
                log.warn("Nepodařilo se vložit report pro repo {}: {}", row.repositoryId(), ex.getMessage());
            }
        }
        for (ReportRow row : orphanCandidates) {
            try {
                BigDecimal projectHourlyRate = row.projectHourlyRate();
                BigDecimal cost = projectHourlyRate == null ? null : row.timeSpentHours().multiply(projectHourlyRate).setScale(2, RoundingMode.HALF_UP);
                int result = jdbc.update("INSERT INTO report (repository_id, iid, spent_at, time_spent_seconds, time_spent_hours, username, cost, hourly_rate_czk, unregistered_username) " +
                                "VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT (repository_id, iid, username_fallback, spent_at, time_spent_seconds) DO NOTHING",
                        ps -> {
                            ps.setLong(1, row.repositoryId());
                            if (row.issueIid() == null) ps.setNull(2, java.sql.Types.BIGINT); else ps.setLong(2, row.issueIid());
                            ps.setObject(3, row.spentAt());
                            ps.setInt(4, row.timeSpentSeconds());
                            ps.setBigDecimal(5, row.timeSpentHours());
                            ps.setNull(6, Types.VARCHAR);
                            if (cost == null) ps.setNull(7, Types.NUMERIC); else ps.setBigDecimal(7, cost);
                            ps.setNull(8, Types.NUMERIC);
                            ps.setString(9, row.username());
                        });
                if (result > 0) {
                    inserted += result;
                } else {
                    duplicates++;
                }
            } catch (DataIntegrityViolationException ex) {
                failed++;
                log.warn("Nepodařilo se vložit report pro repo {} (uživatel {}): {}", row.repositoryId(), row.username(), ex.getMessage());
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

    public void updateProject(long id,
                              String name,
                              Integer budget,
                              LocalDate budgetFrom,
                              LocalDate budgetTo,
                              Long namespaceId,
                              String namespaceName,
                              BigDecimal hourlyRateCzk) {
        jdbc.update("UPDATE project SET name = ?, budget = ?, budget_from = ?, budget_to = ?, namespace_id = ?, namespace_name = ?, hourly_rate_czk = ? WHERE id = ?",
                name,
                budget,
                budgetFrom,
                budgetTo,
                namespaceId,
                namespaceName,
                hourlyRateCzk,
                id);
    }

    public record NamespaceRow(Long namespaceId, String namespaceName) {}

    public List<NamespaceRow> listRepositoryNamespaces() {
        String sql = """
                SELECT namespace_name,
                       MIN(namespace_id) AS namespace_id
                FROM repository
                WHERE namespace_name IS NOT NULL
                GROUP BY namespace_name
                ORDER BY namespace_name
                """;
        return jdbc.query(sql, (rs, rn) -> new NamespaceRow(
                (Long) rs.getObject("namespace_id"),
                rs.getString("namespace_name")
        ));
    }

    public record ReportOverviewRow(long repositoryId,
                                    String repositoryName,
                                    Long issueIid,
                                    String issueTitle,
                                    OffsetDateTime spentAt,
                                    BigDecimal timeSpentHours,
                                    String resolvedUsername,
                                    BigDecimal cost) {}

    public List<ReportOverviewRow> listReportOverview(OffsetDateTime from, OffsetDateTime to, boolean untrackedOnly) {
        StringBuilder sql = new StringBuilder("SELECT r.repository_id, " +
                "repo.name_with_namespace AS repository_name, " +
                "r.iid AS issue_iid, " +
                "iss.title AS issue_title, " +
                "r.spent_at, " +
                "r.time_spent_hours, " +
                "r.cost, " +
                "COALESCE(r.username, r.unregistered_username) AS resolved_username " +
                "FROM report r " +
                "JOIN repository repo ON repo.id = r.repository_id " +
                "LEFT JOIN issue iss ON iss.repository_id = r.repository_id AND iss.iid = r.iid " +
                "WHERE 1 = 1");

        List<Object> params = new ArrayList<>();
        if (from != null) {
            sql.append(" AND r.spent_at >= ?");
            params.add(from);
        }
        if (to != null) {
            sql.append(" AND r.spent_at <= ?");
            params.add(to);
        }

        if (untrackedOnly) {
            sql.append(" AND NOT EXISTS (SELECT 1 FROM projects_to_repositorie ptr WHERE ptr.repository_id = r.repository_id)");
        }

        sql.append(" ORDER BY r.spent_at DESC, repo.name_with_namespace ASC, r.iid NULLS LAST, iss.title NULLS LAST");

        return jdbc.query(sql.toString(), (rs, rn) -> new ReportOverviewRow(
                rs.getLong("repository_id"),
                rs.getString("repository_name"),
                (Long) rs.getObject("issue_iid"),
                rs.getString("issue_title"),
                rs.getObject("spent_at", OffsetDateTime.class),
                rs.getBigDecimal("time_spent_hours"),
                rs.getString("resolved_username"),
                rs.getBigDecimal("cost")
        ), params.toArray());
    }

    public record ProjectInternRow(long id, String username, String firstName, String lastName) {}

    public record ProjectReportDetailRow(long repositoryId,
                                         String repositoryName,
                                         Long issueId,
                                         Long issueIid,
                                         String issueTitle,
                                         String issueWebUrl,
                                         String issueHumanTimeEstimate,
                                         long internId,
                                         String internUsername,
                                         String internFirstName,
                                         String internLastName,
                                         BigDecimal hours,
                                         BigDecimal cost) {}

    public record ProjectInternOpenIssueRow(long repositoryId,
                                            String repositoryName,
                                            Long issueId,
                                            Long issueIid,
                                            String issueTitle,
                                            String issueWebUrl,
                                            String issueHumanTimeEstimate,
                                            LocalDate dueDate,
                                            OffsetDateTime createdAt,
                                            long totalTimeSpentSeconds) {}

    public record ActiveMilestoneRow(long milestoneId,
                                     long milestoneIid,
                                     String title,
                                     String state,
                                     String description,
                                     LocalDate dueDate,
                                     long totalTimeSpentSeconds) {}

    public record MilestoneIssueCostRow(long milestoneId,
                                        Long issueId,
                                        Long issueIid,
                                        String issueTitle,
                                        BigDecimal totalCost) {}

    public record MilestoneDetailSummary(long milestoneId,
                                         long milestoneIid,
                                         String title,
                                         String state,
                                         String description,
                                         LocalDate dueDate,
                                         long totalTimeSpentSeconds,
                                         long totalIssues,
                                         long closedIssues,
                                         BigDecimal totalCost) {}

    public record MilestoneIssueDetailRow(Long issueId,
                                          Long issueIid,
                                          String issueTitle,
                                          String issueWebUrl,
                                          String issueHumanTimeEstimate,
                                          String state,
                                          LocalDate dueDate,
                                          String assigneeUsername,
                                          String assigneeName,
                                          long totalTimeSpentSeconds,
                                          BigDecimal totalCost) {}

    public record MilestoneInternContributionRow(Long internId,
                                                 String internUsername,
                                                 String internFirstName,
                                                 String internLastName,
                                                 long totalTimeSpentSeconds) {}

    public record MilestoneDetail(MilestoneDetailSummary summary,
                                  List<MilestoneIssueDetailRow> issues,
                                  List<MilestoneInternContributionRow> internContributions) {}

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
                "iss.web_url AS issue_web_url, " +
                "iss.human_time_estimate AS issue_human_time_estimate, " +
                "i.id AS intern_id, " +
                "i.username AS intern_username, " +
                "i.first_name AS intern_first_name, " +
                "i.last_name AS intern_last_name, " +
                "SUM(r.time_spent_hours) AS hours, " +
                "SUM(CASE WHEN ip.project_id IS NULL OR ip.include_in_reported_cost THEN " +
                "COALESCE(r.time_spent_hours * COALESCE(p.hourly_rate_czk, r.hourly_rate_czk), 0) ELSE 0 END) AS cost " +
                "FROM report r " +
                "JOIN projects_to_repositorie ptr ON ptr.repository_id = r.repository_id " +
                "JOIN project p ON p.id = ptr.project_id " +
                "JOIN repository repo ON repo.id = r.repository_id " +
                "JOIN intern i ON i.username = r.username " +
                "LEFT JOIN intern_project ip ON ip.intern_id = i.id AND ip.project_id = ptr.project_id " +
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

        sql.append(" GROUP BY r.repository_id, repo.name, iss.id, r.iid, iss.title, iss.web_url, iss.human_time_estimate, i.id, i.username, i.first_name, i.last_name");
        sql.append(" ORDER BY repo.name, r.iid NULLS LAST, iss.title NULLS LAST, i.last_name, i.first_name, i.username");

        return jdbc.query(sql.toString(), (rs, rn) -> new ProjectReportDetailRow(
                rs.getLong("repository_id"),
                rs.getString("repository_name"),
                (Long) rs.getObject("issue_id"),
                (Long) rs.getObject("issue_iid"),
                rs.getString("issue_title"),
                rs.getString("issue_web_url"),
                rs.getString("issue_human_time_estimate"),
                rs.getLong("intern_id"),
                rs.getString("intern_username"),
                rs.getString("intern_first_name"),
                rs.getString("intern_last_name"),
                rs.getBigDecimal("hours"),
                rs.getBigDecimal("cost")
        ), params.toArray());
    }

    public List<ProjectInternOpenIssueRow> listProjectInternOpenIssues(long projectId, String internUsername) {
        if (internUsername == null || internUsername.isBlank()) {
            return List.of();
        }

        String sql = """
                SELECT iss.repository_id,
                       repo.name AS repository_name,
                       iss.id AS issue_id,
                       iss.iid AS issue_iid,
                       iss.title AS issue_title,
                       iss.web_url AS issue_web_url,
                       iss.human_time_estimate AS issue_human_time_estimate,
                       iss.due_date,
                       iss.created_at,
                       COALESCE(SUM(r.time_spent_seconds), 0) AS total_time_spent_seconds
                FROM projects_to_repositorie ptr
                JOIN issue iss ON iss.repository_id = ptr.repository_id
                JOIN repository repo ON repo.id = ptr.repository_id
                LEFT JOIN report r
                       ON r.repository_id = iss.repository_id
                      AND r.iid = iss.iid
                      AND r.username = ?
                WHERE ptr.project_id = ?
                  AND iss.assignee_username = ?
                  AND iss.state = 'opened'
                GROUP BY iss.repository_id, repo.name, iss.id, iss.iid, iss.title, iss.web_url, iss.human_time_estimate, iss.due_date, iss.created_at
                ORDER BY iss.due_date NULLS LAST, LOWER(iss.title), iss.iid
                """;

        return jdbc.query(sql, (rs, rn) -> {
            OffsetDateTime createdAt = null;
            Object createdAtRaw = rs.getObject("created_at");
            if (createdAtRaw instanceof OffsetDateTime offset) {
                createdAt = offset;
            } else if (createdAtRaw instanceof LocalDateTime localDateTime) {
                createdAt = localDateTime.atOffset(ZoneOffset.UTC);
            }

            String title = rs.getString("issue_title");
            if (title == null || title.isBlank()) {
                title = "Bez názvu";
            }

            return new ProjectInternOpenIssueRow(
                    rs.getLong("repository_id"),
                    rs.getString("repository_name"),
                    (Long) rs.getObject("issue_id"),
                    (Long) rs.getObject("issue_iid"),
                    title,
                    rs.getString("issue_web_url"),
                    rs.getString("issue_human_time_estimate"),
                    rs.getObject("due_date", LocalDate.class),
                    createdAt,
                    Optional.ofNullable((Number) rs.getObject("total_time_spent_seconds")).map(Number::longValue).orElse(0L)
            );
        }, internUsername, projectId, internUsername);
    }

    public List<ActiveMilestoneRow> listActiveMilestones(long projectId) {
        String sql = """
                SELECT m.milestone_id,
                       m.milestone_iid,
                       m.title,
                       m.state,
                       m.description,
                       m.due_date,
                       COALESCE(SUM(iss.total_time_spent_seconds), 0) AS total_time_spent_seconds
                FROM milestone m
                LEFT JOIN projects_to_repositorie ptr ON ptr.project_id = m.project_id
                LEFT JOIN issue iss
                       ON iss.repository_id = ptr.repository_id
                      AND iss.milestone_title = m.title
                WHERE m.project_id = ?
                  AND m.state = 'active'
                GROUP BY m.milestone_id, m.milestone_iid, m.title, m.state, m.due_date
                ORDER BY m.due_date NULLS LAST, LOWER(m.title)
                """;
        return jdbc.query(sql, (rs, rn) -> new ActiveMilestoneRow(
                rs.getLong("milestone_id"),
                rs.getLong("milestone_iid"),
                rs.getString("title"),
                rs.getString("state"),
                rs.getString("description"),
                rs.getObject("due_date", LocalDate.class),
                ((Number) rs.getObject("total_time_spent_seconds")).longValue()
        ), projectId);
    }

    public MilestoneDetail getMilestoneDetail(long projectId, long milestoneId) {
        String summarySql = """
                SELECT m.milestone_id,
                       m.milestone_iid,
                       m.title,
                       m.state,
                       m.description,
                       m.due_date,
                       COALESCE(SUM(iss.total_time_spent_seconds), 0) AS total_time_spent_seconds,
                       COUNT(DISTINCT iss.id) AS total_issues,
                       COUNT(DISTINCT CASE WHEN iss.state = 'closed' THEN iss.id END) AS closed_issues
                FROM milestone m
                LEFT JOIN projects_to_repositorie ptr ON ptr.project_id = m.project_id
                LEFT JOIN issue iss
                       ON iss.repository_id = ptr.repository_id
                      AND iss.milestone_title = m.title
                WHERE m.project_id = ?
                  AND m.milestone_id = ?
                GROUP BY m.milestone_id, m.milestone_iid, m.title, m.state, m.due_date
                """;

        List<MilestoneDetailSummary> summaries = jdbc.query(summarySql, (rs, rn) -> new MilestoneDetailSummary(
                rs.getLong("milestone_id"),
                rs.getLong("milestone_iid"),
                rs.getString("title"),
                rs.getString("state"),
                rs.getString("description"),
                rs.getObject("due_date", LocalDate.class),
                Optional.ofNullable((Number) rs.getObject("total_time_spent_seconds")).map(Number::longValue).orElse(0L),
                rs.getLong("total_issues"),
                rs.getLong("closed_issues"),
                BigDecimal.ZERO
        ), projectId, milestoneId);

        if (summaries.isEmpty()) {
            return null;
        }

        MilestoneDetailSummary baseSummary = summaries.get(0);
        BigDecimal totalCost = fetchMilestoneTotalCost(projectId, milestoneId);
        MilestoneDetailSummary summary = new MilestoneDetailSummary(
                baseSummary.milestoneId(),
                baseSummary.milestoneIid(),
                baseSummary.title(),
                baseSummary.state(),
                baseSummary.description(),
                baseSummary.dueDate(),
                baseSummary.totalTimeSpentSeconds(),
                baseSummary.totalIssues(),
                baseSummary.closedIssues(),
                totalCost
        );

        List<MilestoneIssueDetailRow> issues = listMilestoneIssues(projectId, milestoneId);
        List<MilestoneInternContributionRow> internContributions = listMilestoneInternContributions(projectId, milestoneId);

        return new MilestoneDetail(summary, issues, internContributions);
    }

    private BigDecimal fetchMilestoneTotalCost(long projectId, long milestoneId) {
        String sql = """
                SELECT COALESCE(SUM(COALESCE(r.time_spent_hours * COALESCE(p.hourly_rate_czk, r.hourly_rate_czk), 0)), 0) AS total_cost
                FROM milestone m
                JOIN project p ON p.id = m.project_id
                LEFT JOIN projects_to_repositorie ptr ON ptr.project_id = m.project_id
                LEFT JOIN issue iss
                  ON iss.repository_id = ptr.repository_id
                 AND iss.milestone_title = m.title
                LEFT JOIN report r
                  ON r.repository_id = iss.repository_id
                 AND r.iid = iss.iid
                WHERE m.project_id = ?
                  AND m.milestone_id = ?
                """;

        return jdbc.query(sql, (rs, rn) -> rs.getBigDecimal("total_cost"), projectId, milestoneId)
                .stream()
                .findFirst()
                .orElse(BigDecimal.ZERO);
    }

    private List<MilestoneIssueDetailRow> listMilestoneIssues(long projectId, long milestoneId) {
        String sql = """
                SELECT *
                FROM (
                    SELECT iss.id AS issue_id,
                           iss.iid AS issue_iid,
                           COALESCE(NULLIF(iss.title, ''), 'Bez názvu') AS issue_title,
                           iss.web_url AS issue_web_url,
                           iss.human_time_estimate AS issue_human_time_estimate,
                           iss.state,
                           iss.due_date,
                           iss.assignee_username,
                           CASE
                               WHEN i.first_name IS NOT NULL AND i.last_name IS NOT NULL THEN CONCAT(i.first_name, ' ', i.last_name)
                               WHEN i.first_name IS NOT NULL THEN i.first_name
                               WHEN i.last_name IS NOT NULL THEN i.last_name
                               ELSE NULL
                           END AS assignee_name,
                           COALESCE(SUM(COALESCE(r.time_spent_seconds, 0)), 0) AS total_time_spent_seconds,
                           COALESCE(SUM(COALESCE(r.time_spent_hours * COALESCE(p.hourly_rate_czk, r.hourly_rate_czk), 0)), 0) AS total_cost
                    FROM milestone m
                    JOIN project p ON p.id = m.project_id
                    LEFT JOIN projects_to_repositorie ptr ON ptr.project_id = m.project_id
                    LEFT JOIN issue iss
                           ON iss.repository_id = ptr.repository_id
                          AND iss.milestone_title = m.title
                    LEFT JOIN intern i ON i.username = iss.assignee_username
                    LEFT JOIN report r
                           ON r.repository_id = iss.repository_id
                          AND r.iid = iss.iid
                    WHERE m.project_id = ?
                      AND m.milestone_id = ?
                    GROUP BY iss.id,
                             iss.iid,
                             iss.title,
                             iss.web_url,
                             iss.human_time_estimate,
                             iss.state,
                             iss.due_date,
                             iss.assignee_username,
                             i.first_name,
                             i.last_name
                ) issue_rows
                ORDER BY issue_rows.due_date NULLS LAST,
                         LOWER(issue_rows.issue_title),
                         issue_rows.issue_iid
                """;

        return jdbc.query(sql, (rs, rn) -> new MilestoneIssueDetailRow(
                (Long) rs.getObject("issue_id"),
                (Long) rs.getObject("issue_iid"),
                rs.getString("issue_title"),
                rs.getString("issue_web_url"),
                rs.getString("issue_human_time_estimate"),
                rs.getString("state"),
                rs.getObject("due_date", LocalDate.class),
                rs.getString("assignee_username"),
                rs.getString("assignee_name"),
                Optional.ofNullable((Number) rs.getObject("total_time_spent_seconds")).map(Number::longValue).orElse(0L),
                Optional.ofNullable(rs.getBigDecimal("total_cost")).orElse(BigDecimal.ZERO)
        ), projectId, milestoneId);
    }

    private List<MilestoneInternContributionRow> listMilestoneInternContributions(long projectId, long milestoneId) {
        String sql = """
                SELECT i.id AS intern_id,
                       i.username AS intern_username,
                       i.first_name,
                       i.last_name,
                       COALESCE(SUM(r.time_spent_seconds), 0) AS total_time_spent_seconds
                FROM milestone m
                JOIN projects_to_repositorie ptr ON ptr.project_id = m.project_id
                JOIN issue iss
                  ON iss.repository_id = ptr.repository_id
                 AND iss.milestone_title = m.title
                JOIN report r
                  ON r.repository_id = iss.repository_id
                 AND r.iid = iss.iid
                JOIN intern i ON i.username = r.username
                WHERE m.project_id = ?
                  AND m.milestone_id = ?
                GROUP BY i.id, i.username, i.first_name, i.last_name
                HAVING COALESCE(SUM(r.time_spent_seconds), 0) <> 0
                ORDER BY total_time_spent_seconds DESC, i.last_name, i.first_name, i.username
                """;

        return jdbc.query(sql, (rs, rn) -> new MilestoneInternContributionRow(
                (Long) rs.getObject("intern_id"),
                rs.getString("intern_username"),
                rs.getString("first_name"),
                rs.getString("last_name"),
                Optional.ofNullable((Number) rs.getObject("total_time_spent_seconds")).map(Number::longValue).orElse(0L)
        ), projectId, milestoneId);
    }

    public List<MilestoneIssueCostRow> listMilestoneIssueCosts(long projectId, List<Long> milestoneIds) {
        if (milestoneIds == null || milestoneIds.isEmpty()) {
            return List.of();
        }

        var uniqueIds = milestoneIds.stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (uniqueIds.isEmpty()) {
            return List.of();
        }

        String placeholders = uniqueIds.stream()
                .map(id -> "?")
                .collect(Collectors.joining(","));

        String sql = """
                SELECT m.milestone_id,
                       iss.id AS issue_id,
                       iss.iid AS issue_iid,
                       COALESCE(NULLIF(iss.title, ''), 'Bez názvu') AS issue_title,
                       COALESCE(SUM(COALESCE(r.time_spent_hours * COALESCE(p.hourly_rate_czk, r.hourly_rate_czk), 0)), 0) AS total_cost
                FROM milestone m
                JOIN project p ON p.id = m.project_id
                LEFT JOIN projects_to_repositorie ptr ON ptr.project_id = m.project_id
                JOIN issue iss
                  ON iss.repository_id = ptr.repository_id
                 AND iss.milestone_title = m.title
                LEFT JOIN report r
                  ON r.repository_id = iss.repository_id
                 AND r.iid = iss.iid
                WHERE m.project_id = ?
                  AND m.state = 'active'
                  AND m.milestone_id IN (%s)
                GROUP BY m.milestone_id, iss.id, iss.iid, issue_title
                ORDER BY m.due_date NULLS LAST, LOWER(m.title), issue_title
                """.formatted(placeholders);

        List<Object> params = new ArrayList<>();
        params.add(projectId);
        params.addAll(uniqueIds);

        return jdbc.query(sql, (rs, rn) -> new MilestoneIssueCostRow(
                rs.getLong("milestone_id"),
                (Long) rs.getObject("issue_id"),
                (Long) rs.getObject("issue_iid"),
                rs.getString("issue_title"),
                rs.getBigDecimal("total_cost")
        ), params.toArray());
    }

    public int recomputeReportCostsForIntern(long internId) {
        String sql = """
                UPDATE report r
                SET cost = CASE
                        WHEN COALESCE(project_rate.hourly_rate_czk, l.hourly_rate_czk) IS NULL THEN NULL
                        ELSE ROUND(COALESCE(project_rate.hourly_rate_czk, l.hourly_rate_czk) * r.time_spent_hours, 2)
                    END,
                    hourly_rate_czk = l.hourly_rate_czk
                FROM intern i
                JOIN intern_level_history h ON h.intern_id = i.id
                JOIN level l ON l.id = h.level_id
                LEFT JOIN LATERAL (
                    SELECT MAX(p.hourly_rate_czk) AS hourly_rate_czk
                    FROM projects_to_repositorie ptr
                    JOIN project p ON p.id = ptr.project_id
                    WHERE ptr.repository_id = r.repository_id
                ) AS project_rate ON TRUE
                WHERE i.id = ?
                  AND r.username = i.username
                  AND r.spent_at::date >= h.valid_from
                  AND (h.valid_to IS NULL OR r.spent_at::date <= h.valid_to)
                """;
        return jdbc.update(sql, internId);
    }
}
