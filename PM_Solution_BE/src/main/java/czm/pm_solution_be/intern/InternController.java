package czm.pm_solution_be.intern;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/interns")
@Tag(name = "Interns", description = "Registrace a správa stážistů")
public class InternController {
    private final InternService service;

    public InternController(InternService service) {
        this.service = service;
    }

    @PostMapping
    @Operation(summary = "Registrace stážisty", description = "Vytvoří nového stážistu se zadanými údaji.")
    @ApiResponse(responseCode = "201", description = "Stážista byl úspěšně vytvořen.")
    public ResponseEntity<InternResponse> create(@RequestBody InternRequest request) {
        InternResponse response = service.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Úprava stážisty", description = "Aktualizuje jméno, příjmení nebo username stávajícího stážisty.")
    public InternResponse update(@PathVariable long id, @RequestBody InternRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Smazání stážisty", description = "Odebere stávajícího stážistu.")
    public void delete(@PathVariable long id) {
        service.delete(id);
    }

    @GetMapping("/overview")
    @Operation(summary = "Přehled stážistů", description = "Vrací všechny stážisty včetně celkového počtu odpracovaných hodin.")
    public List<InternOverviewResponse> overview() {
        return service.overview();
    }

    /**
     * Serves the month-bucketed aggregation of intern workload between the supplied dates.
     */
    @GetMapping("/monthly-hours")
    @Operation(summary = "Měsíční odpracované hodiny stážistů",
            description = "Vrací seznam stážistů s agregovanými hodinami a náklady po jednotlivých měsících v daném intervalu.")
    public List<InternService.InternMonthlyHoursResponse> monthlyHours(
            @Parameter(description = "Datum od (včetně)", required = true)
            @RequestParam("from") LocalDate from,
            @Parameter(description = "Datum do (včetně)", required = true)
            @RequestParam("to") LocalDate to) {
        return service.monthlyHours(from, to);
    }

    @GetMapping("/performance")
    @Operation(summary = "Výkon stážistů",
            description = "Vrací porovnání odpracovaných hodin napříč týdny nebo měsíci pro vybranou množinu stážistů.")
    public InternService.InternPerformanceResponse performance(
            @Parameter(description = "Typ období (week nebo month)")
            @RequestParam(value = "period", required = false, defaultValue = "week") String period,
            @Parameter(description = "Počet období pro porovnání (2–5)")
            @RequestParam(value = "periods", required = false, defaultValue = "2") Integer periods,
            @Parameter(description = "Filtrovaní stážisti podle ID")
            @RequestParam(value = "internId", required = false) List<Long> internIds,
            @Parameter(description = "Filtrované skupiny podle ID")
            @RequestParam(value = "groupId", required = false) List<Long> groupIds) {
        return service.performance(period, periods, internIds, groupIds);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Detail stážisty")
    public InternResponse get(@PathVariable long id) {
        return service.get(id);
    }

    @GetMapping("/{id}/levels/history")
    @Operation(summary = "Historie úrovní stážisty")
    public List<InternLevelHistoryResponse> history(@PathVariable long id) {
        return service.getLevelHistory(id);
    }

    @GetMapping("/{id}/status/history")
    @Operation(summary = "Historie statusů stážisty")
    public List<InternStatusHistoryResponse> statusHistory(@PathVariable long id) {
        return service.getStatusHistory(id);
    }

    @GetMapping("/{id}/detail")
    @Operation(summary = "Přehled stážisty", description = "Vrací agregovaná data o stážistovi včetně projektů a úvazků.")
    public InternDetailResponse overviewDetail(@PathVariable long id) {
        return service.overviewDetail(id);
    }

    @PostMapping("/{id}/status")
    @Operation(summary = "Změna statusu stážisty", description = "Aktualizuje aktuální status a uloží položku do historie.")
    public InternResponse updateStatus(@PathVariable long id, @RequestBody InternStatusUpdateRequest request) {
        return service.updateStatus(id, request);
    }

    @GetMapping
    @Operation(summary = "Seznam stážistů", description = "Vrací filtrovaný a stránkovaný seznam stážistů.")
    public InternListResponse list(@Parameter(description = "Fulltext na jméno/příjmení/username", example = "nov")
                                   @RequestParam(value = "q", required = false) String q,
                                   @Parameter(description = "Přesný username (case-insensitive)", example = "jnovak")
                                   @RequestParam(value = "username", required = false) String username,
                                   @Parameter(description = "Index stránky (0-based)")
                                   @RequestParam(value = "page", required = false) Integer page,
                                   @Parameter(description = "Velikost stránky (max 100)")
                                   @RequestParam(value = "size", required = false) Integer size,
                                   @Parameter(description = "Řazení ve formátu pole,směr", example = "last_name,asc")
                                   @RequestParam(value = "sort", required = false) String sort) {
        return service.list(q, username, page, size, sort);
    }
}
