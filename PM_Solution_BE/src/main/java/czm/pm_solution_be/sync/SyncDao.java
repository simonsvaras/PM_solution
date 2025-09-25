package czm.pm_solution_be.sync;

import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class SyncDao {
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

    public Long createProjectByName(String name) {
        return jdbc.queryForObject(
                "INSERT INTO project (name) VALUES (?) RETURNING id",
                Long.class, name);
    }

    public UpsertResult<Long> upsertProject(long gitlabProjectId, String name) {
        int updated = jdbc.update("UPDATE project SET name = ? WHERE gitlab_project_id = ?", name, gitlabProjectId);
        if (updated > 0) {
            Long id = jdbc.queryForObject("SELECT id FROM project WHERE gitlab_project_id = ?", Long.class, gitlabProjectId);
            return new UpsertResult<>(id, false);
        }
        Long id = jdbc.queryForObject(
                "INSERT INTO project (gitlab_project_id, name) VALUES (?, ?) RETURNING id",
                Long.class, gitlabProjectId, name);
        return new UpsertResult<>(id, true);
    }

    public Optional<Long> findProjectIdByGitLabId(long gitlabProjectId) {
        List<Long> ids = jdbc.query("SELECT id FROM project WHERE gitlab_project_id = ?", (rs, rn) -> rs.getLong(1), gitlabProjectId);
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.get(0));
    }

    public record ProjectRow(Long id, Long gitlabProjectId, String name) {}
    public List<ProjectRow> listProjects() {
        return jdbc.query("SELECT id, gitlab_project_id, name FROM project ORDER BY name",
                (rs, rn) -> new ProjectRow(rs.getLong("id"), (Long) rs.getObject("gitlab_project_id"), rs.getString("name")));
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

    public Optional<OffsetDateTime> getRepoCursor(long repositoryId, String scope) {
        List<OffsetDateTime> rows = jdbc.query("SELECT last_run_at FROM sync_cursor_repo WHERE repository_id = ? AND scope = ?",
                (rs, rn) -> rs.getObject(1, OffsetDateTime.class), repositoryId, scope);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public void upsertRepoCursor(long repositoryId, String scope, OffsetDateTime lastRunAt) {
        String sql = "INSERT INTO sync_cursor_repo (repository_id, scope, last_run_at) VALUES (?,?,?) ON CONFLICT (repository_id, scope) DO UPDATE SET last_run_at = EXCLUDED.last_run_at";
        jdbc.update(sql, repositoryId, scope, lastRunAt);
    }

        public void updateProjectName(long id, String name) {
        jdbc.update("UPDATE project SET name = ? WHERE id = ?", name, id);
    }
}
