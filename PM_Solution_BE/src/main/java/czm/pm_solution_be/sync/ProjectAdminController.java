package czm.pm_solution_be.sync;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@RestController
@RequestMapping("/api/projects")
public class ProjectAdminController {
    private final SyncDao dao;

    public ProjectAdminController(SyncDao dao) { this.dao = dao; }

    public record ProjectDto(Long id,
                             Long gitlabProjectId,
                             String name,
                             Integer budget,
                             LocalDate budgetFrom,
                             LocalDate budgetTo,
                             BigDecimal reportedCost) {}
    public record CreateRequest(Long gitlabProjectId, String name, Integer budget, LocalDate budgetFrom, LocalDate budgetTo) {}
    public record UpdateRequest(String name, Integer budget, LocalDate budgetFrom, LocalDate budgetTo) {}

    @PostMapping
    public ResponseEntity<ProjectDto> create(@RequestBody CreateRequest req) {
        if (req == null || req.gitlabProjectId == null || req.name == null || req.name.isBlank()) {
            throw new IllegalArgumentException("gitlabProjectId a name jsou povinné");
        }
        validateBudgetPayload(req.budget(), req.budgetFrom(), req.budgetTo());
        SyncDao.UpsertResult<Long> res = dao.upsertProject(req.gitlabProjectId, req.name, req.budget(), req.budgetFrom(), req.budgetTo());
        ProjectDto body = findProjectOrFallback(res.id, req.gitlabProjectId, req.name, req.budget(), req.budgetFrom(), req.budgetTo());
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @PutMapping("/{id}")
    public ProjectDto update(@PathVariable long id, @RequestBody UpdateRequest req) {
        if (req == null || req.name == null || req.name.isBlank()) {
            throw new IllegalArgumentException("name je povinné");
        }
        validateBudgetPayload(req.budget(), req.budgetFrom(), req.budgetTo());
        dao.updateProject(id, req.name, req.budget(), req.budgetFrom(), req.budgetTo());
        return dao.listProjects().stream()
                .filter(p -> p.id().equals(id))
                .findFirst()
                .map(p -> new ProjectDto(p.id(), p.gitlabProjectId(), p.name(), p.budget(), p.budgetFrom(), p.budgetTo(), p.reportedCost()))
                .orElseThrow(() -> new IllegalArgumentException("Project not found: " + id));
    }

    public record CreateByNameRequest(String name, Integer budget, LocalDate budgetFrom, LocalDate budgetTo) {}

    @PostMapping("/by-name")
    public ResponseEntity<ProjectDto> createByName(@RequestBody CreateByNameRequest req) {
        if (req == null || req.name == null || req.name.isBlank()) {
            throw new IllegalArgumentException("name je povinné");
        }
        validateBudgetPayload(req.budget(), req.budgetFrom(), req.budgetTo());
        Long id = dao.createProjectByName(req.name, req.budget(), req.budgetFrom(), req.budgetTo());
        ProjectDto body = findProjectOrFallback(id, null, req.name, req.budget(), req.budgetFrom(), req.budgetTo());
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        dao.deleteProject(id);
    }

    private void validateBudgetPayload(Integer budget, LocalDate budgetFrom, LocalDate budgetTo) {
        if (budget != null && budget < 0) {
            throw new IllegalArgumentException("budget nesmí být záporný");
        }
        if (budgetFrom != null && budgetTo != null && budgetFrom.isAfter(budgetTo)) {
            throw new IllegalArgumentException("budget_from nesmí být po budget_to");
        }
    }

    private ProjectDto findProjectOrFallback(Long id,
                                             Long gitlabProjectId,
                                             String name,
                                             Integer budget,
                                             LocalDate budgetFrom,
                                             LocalDate budgetTo) {
        if (id == null) {
            throw new IllegalStateException("ID projektu nebylo vráceno databází");
        }
        return dao.listProjects().stream()
                .filter(p -> p.id().equals(id))
                .findFirst()
                .map(p -> new ProjectDto(p.id(), p.gitlabProjectId(), p.name(), p.budget(), p.budgetFrom(), p.budgetTo(), p.reportedCost()))
                .orElse(new ProjectDto(id, gitlabProjectId, name, budget, budgetFrom, budgetTo, BigDecimal.ZERO));
    }
}
