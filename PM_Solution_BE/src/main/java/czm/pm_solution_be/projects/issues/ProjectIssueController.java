package czm.pm_solution_be.projects.issues;

import czm.pm_solution_be.projects.issues.ProjectIssueService.ProjectIssue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/projects/{projectId}")
public class ProjectIssueController {

    private final ProjectIssueService service;

    public ProjectIssueController(ProjectIssueService service) {
        this.service = service;
    }

    @GetMapping("/issues")
    public List<ProjectIssueResponse> listProjectIssues(@PathVariable long projectId) {
        List<ProjectIssue> issues = service.listProjectIssues(projectId);
        return issues.stream()
                .map(issue -> new ProjectIssueResponse(
                        issue.id(),
                        issue.title(),
                        issue.state(),
                        issue.dueDate(),
                        issue.reference(),
                        issue.webUrl()))
                .toList();
    }

    public record ProjectIssueResponse(long id,
                                       String title,
                                       String state,
                                       LocalDate dueDate,
                                       String reference,
                                       String webUrl) {
    }
}
