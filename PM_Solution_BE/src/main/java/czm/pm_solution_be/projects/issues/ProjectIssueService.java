package czm.pm_solution_be.projects.issues;

import czm.pm_solution_be.projects.issues.ProjectIssueRepository.ProjectIssueRow;
import czm.pm_solution_be.web.ApiException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

@Service
public class ProjectIssueService {

    private final ProjectIssueRepository repository;

    public ProjectIssueService(ProjectIssueRepository repository) {
        this.repository = repository;
    }

    public List<ProjectIssue> listProjectIssues(long projectId) {
        if (!repository.projectExists(projectId)) {
            throw ApiException.notFound("Projekt nebyl nalezen.", "project");
        }
        List<ProjectIssueRow> rows = repository.listProjectIssues(projectId);
        return rows.stream()
                .map(row -> new ProjectIssue(
                        row.id(),
                        row.title(),
                        row.state(),
                        row.dueDate(),
                        row.iid() == null ? null : String.valueOf(row.iid()),
                        row.webUrl()))
                .toList();
    }

    public record ProjectIssue(long id,
                               String title,
                               String state,
                               LocalDate dueDate,
                               String reference,
                               String webUrl) {
    }
}
