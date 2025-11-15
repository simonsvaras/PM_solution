package czm.pm_solution_be.modules.planning.api;

import czm.pm_solution_be.modules.planning.api.dto.SprintDto;
import czm.pm_solution_be.modules.planning.api.dto.SprintDtoMapper;
import czm.pm_solution_be.modules.planning.api.dto.SprintSummaryDto;
import czm.pm_solution_be.modules.planning.api.dto.SprintTaskSummaryDto;
import czm.pm_solution_be.modules.planning.api.dto.WeeklyTaskDto;
import czm.pm_solution_be.modules.planning.api.dto.WeeklyTaskDtoMapper;
import czm.pm_solution_be.modules.planning.api.request.CreateSprintRequest;
import czm.pm_solution_be.modules.planning.service.SprintService;
import czm.pm_solution_be.modules.planning.service.SprintService.SprintInput;
import czm.pm_solution_be.modules.planning.service.SprintSummaryService;
import czm.pm_solution_be.modules.planning.service.SprintSummaryService.SprintSummary;
import czm.pm_solution_be.modules.planning.service.SprintSummaryService.SprintTaskSummary;
import czm.pm_solution_be.web.ApiException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/projects/{projectId}/sprints")
@Tag(name = "Project Sprints", description = "Správa sprintů projektu")
public class SprintController {

    private final SprintService sprintService;
    private final SprintSummaryService sprintSummaryService;

    public SprintController(SprintService sprintService, SprintSummaryService sprintSummaryService) {
        this.sprintService = sprintService;
        this.sprintSummaryService = sprintSummaryService;
    }

    @GetMapping("/current")
    @Operation(summary = "Aktuální sprint", description = "Vrací právě otevřený sprint projektu.")
    public SprintDto getCurrentSprint(@PathVariable long projectId) {
        return SprintDtoMapper.toDto(sprintService.getCurrentSprint(projectId));
    }

    @GetMapping("/history")
    @Operation(summary = "Historie sprintů", description = "Vrací seznam sprintů projektu seřazený od nejnovějšího.")
    public List<SprintSummaryDto> listHistory(@PathVariable long projectId) {
        return sprintService.getSprintHistory(projectId).stream()
                .map(SprintDtoMapper::toSummary)
                .toList();
    }

    @PostMapping
    @Operation(summary = "Vytvoření sprintu", description = "Vytvoří nový sprint. Projekt může mít vždy pouze jeden otevřený sprint.")
    public SprintDto createSprint(@PathVariable long projectId,
                                  @Valid @RequestBody CreateSprintRequest request) {
        if (request == null) {
            throw ApiException.validation("Request nesmí být prázdný.", "request_required");
        }
        SprintInput input = new SprintInput(request.name(), request.description(), request.deadline());
        return SprintDtoMapper.toDto(sprintService.createSprint(projectId, input));
    }

    @PostMapping("/{sprintId}/close")
    @Operation(summary = "Uzavření sprintu", description = "Uzavře zadaný sprint. Pro uzavření musí být všechny úkoly ve weekly plánu uzavřené.")
    public SprintDto closeSprint(@PathVariable long projectId, @PathVariable long sprintId) {
        return SprintDtoMapper.toDto(sprintService.closeSprint(projectId, sprintId));
    }

    @GetMapping("/{sprintId}/summary")
    @Operation(summary = "Souhrn sprintu", description = "Vrací agregované informace a seznam úkolů sprintu.")
    public SprintSummaryDto getSprintSummary(@PathVariable long projectId, @PathVariable long sprintId) {
        SprintSummary summary = sprintSummaryService.getSprintSummary(projectId, sprintId);
        SprintTaskSummary taskSummary = summary.taskSummary();
        SprintTaskSummaryDto summaryDto = new SprintTaskSummaryDto(
                taskSummary.totalTasks(),
                taskSummary.openTasks(),
                taskSummary.closedTasks(),
                taskSummary.totalPlannedHours());
        List<WeeklyTaskDto> tasks = summary.tasks().stream()
                .map(WeeklyTaskDtoMapper::toDto)
                .toList();
        return SprintDtoMapper.toSummary(summary.sprint(), summaryDto, tasks);
    }
}
