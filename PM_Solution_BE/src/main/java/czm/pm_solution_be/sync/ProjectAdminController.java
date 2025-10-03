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
                             Long namespaceId,
                             String namespaceName,
                             String name,
                             Integer budget,
                             LocalDate budgetFrom,
                             LocalDate budgetTo,
                             BigDecimal hourlyRateCzk,
                             BigDecimal reportedCost) {}
    public record CreateRequest(Long namespaceId,
                                String namespaceName,
                                String name,
                                Integer budget,
                                LocalDate budgetFrom,
                                LocalDate budgetTo,
                                BigDecimal hourlyRateCzk) {}
    public record UpdateRequest(String name,
                                 Integer budget,
                                 LocalDate budgetFrom,
                                 LocalDate budgetTo,
                                 Long namespaceId,
                                 String namespaceName,
                                 BigDecimal hourlyRateCzk) {}

    @PostMapping
    public ResponseEntity<ProjectDto> create(@RequestBody CreateRequest req) {
        if (req == null || req.namespaceId == null || req.name == null || req.name.isBlank()) {
            throw new IllegalArgumentException("namespaceId a name jsou povinné");
        }
        validateBudgetPayload(req.budget(), req.budgetFrom(), req.budgetTo());
        validateHourlyRate(req.hourlyRateCzk());
        SyncDao.UpsertResult<Long> res = dao.upsertProject(req.namespaceId(), req.namespaceName(), req.name(), req.budget(), req.budgetFrom(), req.budgetTo(), req.hourlyRateCzk());
        ProjectDto body = findProjectOrFallback(res.id, req.namespaceId(), req.namespaceName(), req.name(), req.budget(), req.budgetFrom(), req.budgetTo(), req.hourlyRateCzk());
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @PutMapping("/{id}")
    public ProjectDto update(@PathVariable long id, @RequestBody UpdateRequest req) {
        if (req == null || req.name == null || req.name.isBlank()) {
            throw new IllegalArgumentException("name je povinné");
        }
        validateBudgetPayload(req.budget(), req.budgetFrom(), req.budgetTo());
        validateHourlyRate(req.hourlyRateCzk());
        dao.updateProject(id, req.name, req.budget(), req.budgetFrom(), req.budgetTo(), req.namespaceId(), req.namespaceName(), req.hourlyRateCzk());
        return dao.listProjects().stream()
                .filter(p -> p.id().equals(id))
                .findFirst()
                .map(p -> new ProjectDto(p.id(), p.namespaceId(), p.namespaceName(), p.name(), p.budget(), p.budgetFrom(), p.budgetTo(), p.hourlyRateCzk(), p.reportedCost()))
                .orElseThrow(() -> new IllegalArgumentException("Project not found: " + id));
    }

    public record CreateByNameRequest(String name,
                                      Integer budget,
                                      LocalDate budgetFrom,
                                      LocalDate budgetTo,
                                      Long namespaceId,
                                      String namespaceName,
                                      BigDecimal hourlyRateCzk) {}

    @PostMapping("/by-name")
    public ResponseEntity<ProjectDto> createByName(@RequestBody CreateByNameRequest req) {
        if (req == null || req.name == null || req.name.isBlank()) {
            throw new IllegalArgumentException("name je povinné");
        }
        validateBudgetPayload(req.budget(), req.budgetFrom(), req.budgetTo());
        validateHourlyRate(req.hourlyRateCzk());
        Long id = dao.createProjectByName(req.name(), req.budget(), req.budgetFrom(), req.budgetTo(), req.namespaceId(), req.namespaceName(), req.hourlyRateCzk());
        ProjectDto body = findProjectOrFallback(id, req.namespaceId(), req.namespaceName(), req.name(), req.budget(), req.budgetFrom(), req.budgetTo(), req.hourlyRateCzk());
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

    private void validateHourlyRate(BigDecimal hourlyRateCzk) {
        if (hourlyRateCzk != null && hourlyRateCzk.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("hourly_rate_czk nesmí být záporná");
        }
    }

    private ProjectDto findProjectOrFallback(Long id,
                                             Long namespaceId,
                                             String namespaceName,
                                             String name,
                                             Integer budget,
                                             LocalDate budgetFrom,
                                             LocalDate budgetTo,
                                             BigDecimal hourlyRateCzk) {
        if (id == null) {
            throw new IllegalStateException("ID projektu nebylo vráceno databází");
        }
        return dao.listProjects().stream()
                .filter(p -> p.id().equals(id))
                .findFirst()
                .map(p -> new ProjectDto(p.id(), p.namespaceId(), p.namespaceName(), p.name(), p.budget(), p.budgetFrom(), p.budgetTo(), p.hourlyRateCzk(), p.reportedCost()))
                .orElse(new ProjectDto(id, namespaceId, namespaceName, name, budget, budgetFrom, budgetTo, hourlyRateCzk, BigDecimal.ZERO));
    }
}
