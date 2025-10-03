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
                             boolean isExternal,
                             BigDecimal hourlyRateCzk,
                             BigDecimal reportedCost) {}
    public record CreateRequest(Long namespaceId,
                                String namespaceName,
                                String name,
                                Integer budget,
                                LocalDate budgetFrom,
                                LocalDate budgetTo,
                                Boolean isExternal,
                                BigDecimal hourlyRateCzk) {}
    public record UpdateRequest(String name,
                                 Integer budget,
                                 LocalDate budgetFrom,
                                 LocalDate budgetTo,
                                 Long namespaceId,
                                 String namespaceName,
                                 Boolean isExternal,
                                 BigDecimal hourlyRateCzk) {}

    @PostMapping
    public ResponseEntity<ProjectDto> create(@RequestBody CreateRequest req) {
        if (req == null || req.namespaceId == null || req.name == null || req.name.isBlank()) {
            throw new IllegalArgumentException("namespaceId a name jsou povinné");
        }
        validateBudgetPayload(req.budget(), req.budgetFrom(), req.budgetTo());
        validateHourlyRate(req.hourlyRateCzk());
        boolean isExternal = Boolean.TRUE.equals(req.isExternal());
        enforceExternalHourlyRateRule(isExternal, req.hourlyRateCzk());
        BigDecimal hourlyRate = isExternal ? req.hourlyRateCzk() : null;
        SyncDao.UpsertResult<Long> res = dao.upsertProject(req.namespaceId(), req.namespaceName(), req.name(), req.budget(), req.budgetFrom(), req.budgetTo(), isExternal, hourlyRate);
        ProjectDto body = findProjectOrFallback(res.id, req.namespaceId(), req.namespaceName(), req.name(), req.budget(), req.budgetFrom(), req.budgetTo(), isExternal, hourlyRate);
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @PutMapping("/{id}")
    public ProjectDto update(@PathVariable long id, @RequestBody UpdateRequest req) {
        if (req == null || req.name == null || req.name.isBlank()) {
            throw new IllegalArgumentException("name je povinné");
        }
        validateBudgetPayload(req.budget(), req.budgetFrom(), req.budgetTo());
        validateHourlyRate(req.hourlyRateCzk());
        SyncDao.ProjectRow existing = dao.listProjects().stream()
                .filter(p -> p.id().equals(id))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Project not found: " + id));
        boolean isExternal = req.isExternal() != null ? req.isExternal() : existing.isExternal();
        enforceExternalHourlyRateRule(isExternal, req.hourlyRateCzk());
        BigDecimal hourlyRate = isExternal ? req.hourlyRateCzk() : null;
        dao.updateProject(id, req.name, req.budget(), req.budgetFrom(), req.budgetTo(), req.namespaceId(), req.namespaceName(), isExternal, hourlyRate);
        return dao.listProjects().stream()
                .filter(p -> p.id().equals(id))
                .findFirst()
                .map(p -> new ProjectDto(p.id(), p.namespaceId(), p.namespaceName(), p.name(), p.budget(), p.budgetFrom(), p.budgetTo(), p.isExternal(), p.hourlyRateCzk(), p.reportedCost()))
                .orElseThrow(() -> new IllegalArgumentException("Project not found: " + id));
    }

    public record CreateByNameRequest(String name,
                                      Integer budget,
                                      LocalDate budgetFrom,
                                      LocalDate budgetTo,
                                      Long namespaceId,
                                      String namespaceName,
                                      Boolean isExternal,
                                      BigDecimal hourlyRateCzk) {}

    @PostMapping("/by-name")
    public ResponseEntity<ProjectDto> createByName(@RequestBody CreateByNameRequest req) {
        if (req == null || req.name == null || req.name.isBlank()) {
            throw new IllegalArgumentException("name je povinné");
        }
        validateBudgetPayload(req.budget(), req.budgetFrom(), req.budgetTo());
        validateHourlyRate(req.hourlyRateCzk());
        boolean isExternal = Boolean.TRUE.equals(req.isExternal());
        enforceExternalHourlyRateRule(isExternal, req.hourlyRateCzk());
        BigDecimal hourlyRate = isExternal ? req.hourlyRateCzk() : null;
        Long id = dao.createProjectByName(req.name(), req.budget(), req.budgetFrom(), req.budgetTo(), req.namespaceId(), req.namespaceName(), isExternal, hourlyRate);
        ProjectDto body = findProjectOrFallback(id, req.namespaceId(), req.namespaceName(), req.name(), req.budget(), req.budgetFrom(), req.budgetTo(), isExternal, hourlyRate);
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

    private void enforceExternalHourlyRateRule(boolean isExternal, BigDecimal hourlyRateCzk) {
        if (!isExternal && hourlyRateCzk != null) {
            throw new IllegalArgumentException("hourly_rate_czk lze nastavit pouze pro externí projekt");
        }
    }

    private ProjectDto findProjectOrFallback(Long id,
                                             Long namespaceId,
                                             String namespaceName,
                                             String name,
                                             Integer budget,
                                             LocalDate budgetFrom,
                                             LocalDate budgetTo,
                                             boolean isExternal,
                                             BigDecimal hourlyRateCzk) {
        if (id == null) {
            throw new IllegalStateException("ID projektu nebylo vráceno databází");
        }
        return dao.listProjects().stream()
                .filter(p -> p.id().equals(id))
                .findFirst()
                .map(p -> new ProjectDto(p.id(), p.namespaceId(), p.namespaceName(), p.name(), p.budget(), p.budgetFrom(), p.budgetTo(), p.isExternal(), p.hourlyRateCzk(), p.reportedCost()))
                .orElse(new ProjectDto(id, namespaceId, namespaceName, name, budget, budgetFrom, budgetTo, isExternal, hourlyRateCzk, BigDecimal.ZERO));
    }
}
