package czm.pm_solution_be.projects.capacity;

import czm.pm_solution_be.projects.capacity.ProjectCapacityService.CapacityHistoryResult;
import czm.pm_solution_be.projects.capacity.ProjectCapacityService.ProjectCapacityEntry;
import czm.pm_solution_be.projects.capacity.ProjectCapacityService.Reporter;
import czm.pm_solution_be.web.ApiException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * REST layer exposing project capacity reporting endpoints for project overview module.
 *
 * <p>Controller vrství pouze transportní logiku a deleguje validace i business pravidla do servisní vrstvy,
 * aby bylo možné později snadno nasadit GraphQL či gRPC adaptér se stejným jádrem.</p>
 */
@RestController
@RequestMapping("/api/projects/{projectId}/capacity")
public class ProjectCapacityController {

    private final ProjectCapacityService service;

    public ProjectCapacityController(ProjectCapacityService service) {
        this.service = service;
    }

    /**
     * Vrátí aktuální kapacitní status projektu.
     *
     * <p>Endpoint je určen pro dlaždici v projects-overview – pracujeme s {@code GET /api/projects/:id/capacity}
     * tak, aby FE nemusel řešit stránkování nebo řazení a mohl vždy zobrazit poslední stav.</p>
     */
    @GetMapping
    public ProjectCapacityResponse getCurrent(@PathVariable long projectId) {
        return toResponse(service.getCurrentCapacity(projectId));
    }

    /**
     * Stránkovaná historie kapacitních reportů. FE může stránkovat po 20 záznamech.
     *
     * <p>Kombinace {@code from}/{@code to} filtrů odpovídá možnostem analytického listu a využívá index na
     * {@code project_capacity_report(project_id, reported_at DESC)}. Controller neobsahuje business logiku, pouze
     * normalizuje výsledky do DTO kompatibilního s FE.</p>
     */
    @GetMapping("/history")
    public HistoryResponse getHistory(@PathVariable long projectId,
                                      @RequestParam(required = false)
                                      @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
                                      OffsetDateTime from,
                                      @RequestParam(required = false)
                                      @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
                                      OffsetDateTime to,
                                      @RequestParam(required = false) Integer page,
                                      @RequestParam(required = false) Integer size) {
        CapacityHistoryResult result = service.listCapacityHistory(projectId, from, to, page, size);
        List<ProjectCapacityResponse> items = result.items().stream()
                .map(this::toResponse)
                .toList();
        return new HistoryResponse(items, result.totalElements(), result.page(), result.size());
    }

    /**
     * Vytvoří nový kapacitní report.
     *
     * <p>Endpoint zůstává úmyslně jednoduchý: nepodporuje bulk operace a spouští synchronní insert, aby se logování
     * a notifikace mohly napojit na {@link ProjectCapacityService} bez dalších listenerů.</p>
     *
     * @param projectId identifikátor projektu
     * @param request vstupní payload s kódem statusu a volitelnou poznámkou
     * @param principal autentizovaný uživatel používá svůj username jako reported_by
     * @return vytvořený záznam
     */
    @PostMapping
    public ResponseEntity<ProjectCapacityResponse> reportCapacity(@PathVariable long projectId,
                                                                  @RequestBody ReportCapacityRequest request,
                                                                  Principal principal) {
        if (request == null) {
            throw ApiException.validation("Request nesmí být prázdný.", "request_required");
        }
        if (principal == null || principal.getName() == null) {
            throw ApiException.validation("Nelze určit přihlášeného uživatele.", "principal_missing");
        }
        // Principal#getName vrací username pro sloupec reported_by
        ProjectCapacityEntry entry = service.reportCapacity(projectId, request.statusCode(), request.note(), principal.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(entry));
    }

    private ProjectCapacityResponse toResponse(ProjectCapacityEntry entry) {
        Reporter reporter = entry.reporter();
        ReporterResponse reporterResponse = new ReporterResponse(
                reporter.username(),
                reporter.firstName(),
                reporter.lastName(),
                reporter.fullName());
        return new ProjectCapacityResponse(
                entry.id(),
                entry.statusCode(),
                entry.statusLabel(),
                entry.severity(),
                entry.reportedAt(),
                reporterResponse,
                entry.note());
    }

    public record ProjectCapacityResponse(long id,
                                          String statusCode,
                                          String statusLabel,
                                          int severity,
                                          OffsetDateTime reportedAt,
                                          ReporterResponse reportedBy,
                                          String note) {}

    public record ReporterResponse(String username, String firstName, String lastName, String fullName) {}

    public record HistoryResponse(List<ProjectCapacityResponse> items,
                                  long totalElements,
                                  int page,
                                  int size) {}

    /**
     * Request DTO pro vytvoření nového reportu.
     *
     * <p>Validace se provádí až na servisní vrstvě, aby šlo později doplnit jednotné bean validation anotace,
     * které budou sdíleny pro REST i případný message consumer.</p>
     */
    public record ReportCapacityRequest(String statusCode, String note) {}
}
