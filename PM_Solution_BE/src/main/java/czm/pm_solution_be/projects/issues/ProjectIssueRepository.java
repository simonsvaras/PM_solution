package czm.pm_solution_be.projects.issues;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;

@Repository
public class ProjectIssueRepository {

    private static final String SQL_PROJECT_EXISTS = "SELECT EXISTS (SELECT 1 FROM project WHERE id = ?)";

    private static final String SQL_LIST_PROJECT_ISSUES = """
            SELECT iss.id,
                   iss.iid,
                   iss.title,
                   iss.state,
                   iss.due_date,
                   iss.web_url
            FROM projects_to_repositorie ptr
            JOIN issue iss ON iss.repository_id = ptr.repository_id
            WHERE ptr.project_id = ?
              AND iss.state = 'opened'
            ORDER BY iss.due_date NULLS LAST, LOWER(iss.title), iss.iid
            """;

    private static final RowMapper<ProjectIssueRow> ISSUE_ROW_MAPPER = new RowMapper<>() {
        @Override
        public ProjectIssueRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            Long iid = (Long) rs.getObject("iid");
            LocalDate dueDate = rs.getObject("due_date", LocalDate.class);
            String title = rs.getString("title");
            if (title == null || title.isBlank()) {
                title = "Bez názvu";
            }
            return new ProjectIssueRow(
                    rs.getLong("id"),
                    iid,
                    title,
                    rs.getString("state"),
                    dueDate,
                    rs.getString("web_url")
            );
        }
    };

    private final JdbcTemplate jdbc;

    public ProjectIssueRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean projectExists(long projectId) {
        Boolean exists = jdbc.queryForObject(SQL_PROJECT_EXISTS, Boolean.class, projectId);
        return Boolean.TRUE.equals(exists);
    }

    public List<ProjectIssueRow> listProjectIssues(long projectId) {
        return jdbc.query(SQL_LIST_PROJECT_ISSUES, ISSUE_ROW_MAPPER, projectId);
    }

    public record ProjectIssueRow(long id,
                                  Long iid,
                                  String title,
                                  String state,
                                  LocalDate dueDate,
                                  String webUrl) {
    }
}
