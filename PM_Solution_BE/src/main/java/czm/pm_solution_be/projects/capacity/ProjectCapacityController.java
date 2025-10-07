package czm.pm_solution_be.projects.capacity;

import czm.pm_solution_be.projects.capacity.ProjectCapacityService.CapacityHistoryResult;
import czm.pm_solution_be.projects.capacity.ProjectCapacityService.ProjectCapacityEntry;
import czm.pm_solution_be.projects.capacity.ProjectCapacityService.ProjectCapacityStatus;
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
     * @param request vstupní payload s kolekcí kódů statusů a volitelnou poznámkou
     * @return vytvořený záznam
     */
    @PostMapping
    public ResponseEntity<ProjectCapacityResponse> reportCapacity(@PathVariable long projectId,
                                                                  @RequestBody ReportCapacityRequest request) {
        if (request == null) {
            throw ApiException.validation("Request nesmí být prázdný.", "request_required");
        }
        ProjectCapacityEntry entry = service.reportCapacity(projectId, request.statusCodes(), request.note());
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(entry));
    }

    private ProjectCapacityResponse toResponse(ProjectCapacityEntry entry) {
        List<ProjectCapacityStatusResponse> statuses = entry.statuses().stream()
                .map(status -> new ProjectCapacityStatusResponse(status.code(), status.label(), status.severity()))
                .toList();
        return new ProjectCapacityResponse(entry.id(), entry.projectId(), entry.reportedAt(), statuses, entry.note());
    }

    public record ProjectCapacityResponse(long id,
                                          long projectId,
                                          OffsetDateTime reportedAt,
                                          List<ProjectCapacityStatusResponse> statuses,
                                          String note) {}

    public record ProjectCapacityStatusResponse(String code, String label, int severity) {}

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
    public record ReportCapacityRequest(List<String> statusCodes, String note) {}
}
