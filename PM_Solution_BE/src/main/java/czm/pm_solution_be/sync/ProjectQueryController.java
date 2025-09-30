package czm.pm_solution_be.sync;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/projects")
public class ProjectQueryController {
    private final SyncDao dao;

    public ProjectQueryController(SyncDao dao) { this.dao = dao; }

    public record ProjectDto(Long id,
                             Long namespaceId,
                             String namespaceName,
                             String name,
                             Integer budget,
                             java.time.LocalDate budgetFrom,
                             java.time.LocalDate budgetTo,
                             BigDecimal reportedCost) {}

    public record ProjectOverviewDto(Long id,
                                     String name,
                                     Integer budget,
                                     java.time.LocalDate budgetFrom,
                                     java.time.LocalDate budgetTo,
                                     BigDecimal reportedCost,
                                     Integer teamMembers,
                                     Integer openIssues) {}

    @GetMapping
    public List<ProjectDto> list() {
        return dao.listProjects().stream()
                .map(r -> new ProjectDto(r.id(), r.namespaceId(), r.namespaceName(), r.name(), r.budget(), r.budgetFrom(), r.budgetTo(), r.reportedCost()))
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
                        r.reportedCost(),
                        r.teamMembers(),
                        r.openIssues()))
                .toList();
    }
}

