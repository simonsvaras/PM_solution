package czm.pm_solution_be.sync;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/projects")
public class ProjectQueryController {
    private final SyncDao dao;

    public ProjectQueryController(SyncDao dao) { this.dao = dao; }

    public record ProjectDto(Long id,
                             Long gitlabProjectId,
                             String name,
                             Integer budget,
                             java.time.LocalDate budgetFrom,
                             java.time.LocalDate budgetTo) {}

    public record ProjectOverviewDto(Long id,
                                     String name,
                                     Integer budget,
                                     java.time.LocalDate budgetFrom,
                                     java.time.LocalDate budgetTo,
                                     Integer teamMembers,
                                     Integer openIssues) {}

    @GetMapping
    public List<ProjectDto> list() {
        return dao.listProjects().stream()
                .map(r -> new ProjectDto(r.id(), r.gitlabProjectId(), r.name(), r.budget(), r.budgetFrom(), r.budgetTo()))
                .toList();
    }

    @GetMapping("/overview")
    public List<ProjectOverviewDto> overview() {
        return dao.listProjectOverview().stream()
                .map(r -> new ProjectOverviewDto(
                        r.id(),
                        r.name(),
                        r.budget(),
                        r.budgetFrom(),
                        r.budgetTo(),
                        r.teamMembers(),
                        r.openIssues()))
                .toList();
    }
}

