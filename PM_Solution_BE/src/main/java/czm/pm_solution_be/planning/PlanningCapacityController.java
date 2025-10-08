package czm.pm_solution_be.planning;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/planning")
@Tag(name = "Planning", description = "Plánování kapacit")
public class PlanningCapacityController {

    private final PlanningCapacityService service;

    public PlanningCapacityController(PlanningCapacityService service) {
        this.service = service;
    }

    @GetMapping("/current-capacity")
    @Operation(summary = "Aktuální kapacity", description = "Vrací agregovaný přehled stavů pro projekty a stážisty.")
    public PlanningCapacityService.CurrentCapacityResponse currentCapacity() {
        return service.getCurrentCapacitySummary();
    }
}

