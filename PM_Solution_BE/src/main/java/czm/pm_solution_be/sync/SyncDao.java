package czm.pm_solution_be.sync;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public class SyncDao {
    private final JdbcTemplate jdbc;

    public SyncDao(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // Project
    public static class UpsertResult<T> {
        public final T id;
        public final boolean inserted;
        public UpsertResult(T id, boolean inserted) { this.id = id; this.inserted = inserted; }
    }

    public UpsertResult<Long> upsertProject(long gitlabProjectId, String name) {
        int updated = jdbc.update("UPDATE project SET name = ? WHERE gitlab_project_id = ?", name, gitlabProjectId);
        if (updated > 0) {
            Long id = jdbc.queryForObject("SELECT id FROM project WHERE gitlab_project_id = ?", Long.class, gitlabProjectId);
            return new UpsertResult<>(id, false);
        } else {
            Long id = jdbc.queryForObject(
                    "INSERT INTO project (gitlab_project_id, name) VALUES (?, ?) RETURNING id",
                    Long.class, gitlabProjectId, name);
            return new UpsertResult<>(id, true);
        }
    }

    public Optional<Long> findProjectIdByGitLabId(long gitlabProjectId) {
        List<Long> ids = jdbc.query("SELECT id FROM project WHERE gitlab_project_id = ?", (rs, rn) -> rs.getLong(1), gitlabProjectId);
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.get(0));
    }

    public record ProjectRow(Long id, Long gitlabProjectId, String name) {}
    public List<ProjectRow> listProjects() {
        return jdbc.query("SELECT id, gitlab_project_id, name FROM project ORDER BY name",
                (rs, rn) -> new ProjectRow(rs.getLong("id"), (Long)rs.getObject("gitlab_project_id"), rs.getString("name")));
    }

    // Repository (1:1 mapping to project as root repo)
    public UpsertResult<Long> upsertRepository(long projectId, long gitlabRepoId, String name, String nameWithNamespace,
                                 Long namespaceId, String namespaceName, boolean rootRepo) {
        int updated = jdbc.update("UPDATE repository SET project_id=?, name=?, name_with_namespace=?, namespace_id=?, namespace_name=?, root_repo=? WHERE gitlab_repo_id=?",
                projectId, name, nameWithNamespace, namespaceId, namespaceName, rootRepo, gitlabRepoId);
        if (updated > 0) {
            Long id = jdbc.queryForObject("SELECT id FROM repository WHERE gitlab_repo_id = ?", Long.class, gitlabRepoId);
            return new UpsertResult<>(id, false);
        } else {
            Long id = jdbc.queryForObject(
                    "INSERT INTO repository (project_id, gitlab_repo_id, name, name_with_namespace, namespace_id, namespace_name, root_repo) VALUES (?,?,?,?,?,?,?) RETURNING id",
                    Long.class, projectId, gitlabRepoId, name, nameWithNamespace, namespaceId, namespaceName, rootRepo);
            return new UpsertResult<>(id, true);
        }
    }

    // Issues
    public UpsertResult<Void> upsertIssue(long projectId,
                           Long repositoryId,
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
        // Update first
        int updated = jdbc.update("UPDATE issue SET repository_id=?, title=?, state=?, assignee_id=?, assignee_username=?, author_name=?, labels=?, time_estimate_seconds=?, total_time_spent_seconds=?, due_date=?::date, updated_at=? WHERE project_id=? AND iid=?",
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
                    ps.setLong(12, projectId);
                    ps.setLong(13, iid);
                });
        if (updated > 0) return new UpsertResult<>(null, false);

        // Insert
        jdbc.update("INSERT INTO issue (project_id, repository_id, gitlab_issue_id, iid, title, state, assignee_id, assignee_username, author_name, labels, time_estimate_seconds, total_time_spent_seconds, due_date, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?::date,?)",
                (ps) -> {
                    ps.setLong(1, projectId);
                    if (repositoryId == null) ps.setNull(2, java.sql.Types.BIGINT); else ps.setLong(2, repositoryId);
                    ps.setLong(3, gitlabIssueId);
                    ps.setLong(4, iid);
                    ps.setString(5, title);
                    ps.setString(6, state);
                    if (assigneeId == null) ps.setNull(7, java.sql.Types.BIGINT); else ps.setLong(7, assigneeId);
                    ps.setString(8, assigneeUsername);
                    ps.setString(9, authorName);
                    ps.setArray(10, labels == null ? null : ps.getConnection().createArrayOf("text", labels));
                    if (timeEstimateSeconds == null) ps.setNull(11, java.sql.Types.INTEGER); else ps.setInt(11, timeEstimateSeconds);
                    if (totalTimeSpentSeconds == null) ps.setNull(12, java.sql.Types.INTEGER); else ps.setInt(12, totalTimeSpentSeconds);
                    ps.setString(13, dueDate);
                    if (updatedAt == null) ps.setNull(14, java.sql.Types.TIMESTAMP_WITH_TIMEZONE); else ps.setObject(14, updatedAt);
                });
        return new UpsertResult<>(null, true);
    }

    public List<Long> findIssueIidsForProject(long projectId) {
        return jdbc.query("SELECT iid FROM issue WHERE project_id = ? ORDER BY iid", (rs, rn) -> rs.getLong(1), projectId);
    }

    // Reports
    public boolean insertReportIfNotExists(long projectId, long iid, OffsetDateTime spentAt, int timeSpentSeconds, String username) {
        String sql = "INSERT INTO report (project_id, iid, spent_at, time_spent_seconds, username) VALUES (?,?,?,?,?) ON CONFLICT ON CONSTRAINT ux_report_nodup_mvp DO NOTHING";
        int updated = jdbc.update(sql, projectId, iid, spentAt, timeSpentSeconds, username);
        return updated > 0;
    }

    // Cursors
    public Optional<OffsetDateTime> getCursor(long projectId, String scope) {
        List<OffsetDateTime> rows = jdbc.query("SELECT last_run_at FROM sync_cursor WHERE project_id = ? AND scope = ?",
                (rs, rn) -> rs.getObject(1, OffsetDateTime.class), projectId, scope);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public void upsertCursor(long projectId, String scope, OffsetDateTime lastRunAt) {
        String sql = "INSERT INTO sync_cursor (project_id, scope, last_run_at) VALUES (?,?,?) ON CONFLICT (project_id, scope) DO UPDATE SET last_run_at = EXCLUDED.last_run_at";
        jdbc.update(sql, projectId, scope, lastRunAt);
    }
}
