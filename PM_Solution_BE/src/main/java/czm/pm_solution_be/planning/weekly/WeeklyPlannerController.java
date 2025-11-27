package czm.pm_solution_be.planning.weekly;

import czm.pm_solution_be.planning.weekly.WeeklyPlannerService.PlannerMetadata;
import czm.pm_solution_be.planning.weekly.WeeklyPlannerService.TaskDetail;
import czm.pm_solution_be.planning.weekly.WeeklyPlannerService.TaskInput;
import czm.pm_solution_be.planning.weekly.WeeklyPlannerService.WeekCollection;
import czm.pm_solution_be.planning.weekly.WeeklyPlannerService.WeekConfiguration;
import czm.pm_solution_be.planning.weekly.WeeklyPlannerService.WeekDetail;
import czm.pm_solution_be.planning.weekly.WeeklyPlannerService.WeekWithMetadata;
import czm.pm_solution_be.planning.weekly.WeeklyPlannerService.WeeklySummary;
import czm.pm_solution_be.web.ApiException;
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
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/projects/{projectId}/weekly-planner")
public class WeeklyPlannerController {

    private final WeeklyPlannerService service;

    public WeeklyPlannerController(WeeklyPlannerService service) {
        this.service = service;
    }

    @GetMapping("/settings")
    public WeekConfigurationResponse getWeekSettings(@PathVariable long projectId) {
        WeekConfiguration configuration = service.getWeekConfiguration(projectId);
        return new WeekConfigurationResponse(configuration.projectId(), configuration.weekStartDay());
    }

    @PutMapping({"/settings", "/configuration/week-start"})
    public WeekConfigurationResponse configureWeekStart(@PathVariable long projectId,
                                                        @RequestBody WeekStartConfigurationRequest request) {
        if (request == null) {
            throw ApiException.validation("Request nesmí být prázdný.", "request_required");
        }
        if (request.weekStartDay() == null) {
            throw ApiException.validation("Začátek týdne je povinný.", "week_start_day_required");
        }
        WeekConfiguration configuration = service.configureWeekStart(projectId, request.weekStartDay());
        return new WeekConfigurationResponse(configuration.projectId(), configuration.weekStartDay());
    }

    @PostMapping("/weeks/generate")
    public ResponseEntity<WeekCollectionResponse> generateWeeks(@PathVariable long projectId,
                                                                @RequestBody WeekGenerationRequest request) {
        if (request == null) {
            throw ApiException.validation("Request nesmí být prázdný.", "request_required");
        }
        WeekCollection weeks = service.generateWeeks(projectId, request.from(), request.to());
        return ResponseEntity.status(HttpStatus.CREATED).body(toWeekCollectionResponse(weeks));
    }

    @GetMapping("/weeks")
    public WeekCollectionResponse listWeeks(@PathVariable long projectId,
                                            @RequestParam(defaultValue = "20") int limit,
                                            @RequestParam(defaultValue = "0") int offset,
                                            @RequestParam(required = false) Long sprintId) {
        WeekCollection weeks = service.listWeeks(projectId, sprintId, limit, offset);
        return toWeekCollectionResponse(weeks);
    }

    @GetMapping("/weeks/{projectWeekId}")
    public WeekWithMetadataResponse getWeek(@PathVariable long projectId,
                                            @PathVariable long projectWeekId,
                                            @RequestParam(required = false) Long sprintId) {
        WeekWithMetadata detail = service.getWeek(projectId, projectWeekId, sprintId);
        return new WeekWithMetadataResponse(toWeekResponse(detail.week()), toMetadataResponse(detail.metadata()));
    }

    @PostMapping("/weeks/{projectWeekId}/tasks")
    public ResponseEntity<TaskDetailResponse> createTask(@PathVariable long projectId,
                                                         @PathVariable long projectWeekId,
                                                         @RequestBody WeeklyTaskRequest request) {
        if (request == null) {
            throw ApiException.validation("Request nesmí být prázdný.", "request_required");
        }
        TaskDetail created = service.createTask(projectId, projectWeekId, toTaskInput(request));
        return ResponseEntity.status(HttpStatus.CREATED).body(toTaskResponse(created));
    }

    @PostMapping("/tasks")
    public ResponseEntity<TaskDetailResponse> createBacklogTask(@PathVariable long projectId,
                                                                @RequestBody WeeklyTaskRequest request) {
        if (request == null) {
            throw ApiException.validation("Request nesmí být prázdný.", "request_required");
        }
        TaskDetail created = service.createTask(projectId, null, toTaskInput(request));
        return ResponseEntity.status(HttpStatus.CREATED).body(toTaskResponse(created));
    }

    @DeleteMapping("/weeks/{projectWeekId}")
    public ResponseEntity<Void> deleteWeek(@PathVariable long projectId, @PathVariable long projectWeekId) {
        service.deleteWeek(projectId, projectWeekId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/weeks/{projectWeekId}/tasks/{taskId}")
    public TaskDetailResponse updateTask(@PathVariable long projectId,
                                         @PathVariable long projectWeekId,
                                         @PathVariable long taskId,
                                         @RequestBody WeeklyTaskRequest request) {
        if (request == null) {
            throw ApiException.validation("Request nesmí být prázdný.", "request_required");
        }
        TaskDetail updated = service.updateTask(projectId, projectWeekId, taskId, toTaskInput(request));
        return toTaskResponse(updated);
    }

    @DeleteMapping("/weeks/{projectWeekId}/tasks/{taskId}")
    public ResponseEntity<Void> deleteTask(@PathVariable long projectId,
                                           @PathVariable long projectWeekId,
                                           @PathVariable long taskId) {
        service.deleteTask(projectId, projectWeekId, taskId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/weeks/{projectWeekId}/tasks/{taskId}/status")
    public TaskDetailResponse changeStatus(@PathVariable long projectId,
                                           @PathVariable long projectWeekId,
                                           @PathVariable long taskId,
                                           @RequestBody ChangeStatusRequest request) {
        if (request == null) {
            throw ApiException.validation("Request nesmí být prázdný.", "request_required");
        }
        TaskDetail updated = service.changeStatus(projectId, projectWeekId, taskId, request.status());
        return toTaskResponse(updated);
    }

    @PutMapping("/tasks/{taskId}/assignment")
    public TaskDetailResponse assignTask(@PathVariable long projectId,
                                         @PathVariable long taskId,
                                         @RequestBody TaskAssignmentRequest request) {
        if (request == null) {
            throw ApiException.validation("Request nesmí být prázdný.", "request_required");
        }
        Long targetWeekId = request.weekId();
        if (request.destination() != null && "backlog".equalsIgnoreCase(request.destination().trim())) {
            targetWeekId = null;
        }
        TaskDetail updated = service.assignTask(projectId, taskId, targetWeekId);
        return toTaskResponse(updated);
    }

    @PostMapping("/weeks/{projectWeekId}/carry-over")
    public List<TaskDetailResponse> carryOverTasks(@PathVariable long projectId,
                                                   @PathVariable long projectWeekId,
                                                   @RequestBody CarryOverRequest request) {
        if (request == null) {
            throw ApiException.validation("Request nesmí být prázdný.", "request_required");
        }
        List<TaskDetail> carried = service.carryOverTasks(projectId, projectWeekId, request.targetWeekStart(), request.taskIds());
        return carried.stream().map(this::toTaskResponse).toList();
    }

    @PostMapping("/weeks/{projectWeekId}/close")
    public WeekWithMetadataResponse closeWeek(@PathVariable long projectId, @PathVariable long projectWeekId) {
        WeekWithMetadata detail = service.closeWeek(projectId, projectWeekId);
        return new WeekWithMetadataResponse(toWeekResponse(detail.week()), toMetadataResponse(detail.metadata()));
    }

    @GetMapping("/weeks/{projectWeekId}/summary")
    public WeeklySummaryResponse getSummary(@PathVariable long projectId, @PathVariable long projectWeekId) {
        WeeklySummary summary = service.getSummary(projectId, projectWeekId);
        List<InternSummaryResponse> perIntern = summary.perIntern().stream()
                .map(intern -> new InternSummaryResponse(intern.internId(), intern.internName(), intern.taskCount(), intern.totalHours()))
                .toList();
        return new WeeklySummaryResponse(summary.projectWeekId(), summary.taskCount(), summary.totalHours(), perIntern);
    }

    private WeekCollectionResponse toWeekCollectionResponse(WeekCollection weeks) {
        List<WeekDetailResponse> responses = weeks.weeks().stream()
                .map(this::toWeekResponse)
                .toList();
        return new WeekCollectionResponse(responses, toMetadataResponse(weeks.metadata()));
    }

    private WeekDetailResponse toWeekResponse(WeekDetail detail) {
        List<TaskDetailResponse> tasks = detail.tasks().stream()
                .map(this::toTaskResponse)
                .toList();
        return new WeekDetailResponse(detail.id(), detail.projectId(), detail.sprintId(), detail.weekStart(), detail.weekEnd(), detail.createdAt(), detail.updatedAt(), tasks);
    }

    private PlannerMetadataResponse toMetadataResponse(PlannerMetadata metadata) {
        return new PlannerMetadataResponse(
                metadata.projectId(),
                metadata.weekStartDay(),
                metadata.today(),
                metadata.currentWeekStart(),
                metadata.currentWeekEnd(),
                metadata.currentWeekId(),
                metadata.sprintId(),
                metadata.sprintName(),
                metadata.sprintStatus() == null ? null : metadata.sprintStatus().name(),
                metadata.sprintDeadline());
    }

    private TaskDetailResponse toTaskResponse(TaskDetail detail) {
        return new TaskDetailResponse(
                detail.id(),
                detail.weekId(),
                detail.sprintId(),
                detail.isBacklog(),
                detail.note(),
                detail.plannedHours(),
                detail.internId(),
                detail.internName(),
                detail.issueId(),
                detail.issueTitle(),
                detail.issueState(),
                detail.deadline(),
                detail.createdAt(),
                detail.updatedAt());
    }

    private TaskInput toTaskInput(WeeklyTaskRequest request) {
        return new TaskInput(
                request.issueId(),
                request.internId(),
                request.note(),
                request.plannedHours(),
                request.deadline());
    }

    public record WeekStartConfigurationRequest(Integer weekStartDay) {
    }

    public record WeekGenerationRequest(LocalDate from, LocalDate to) {
    }

    public record WeeklyTaskRequest(Long issueId,
                                    Long internId,
                                    String note,
                                    BigDecimal plannedHours,
                                    LocalDate deadline) {
    }

    public record ChangeStatusRequest(String status) {
    }

    public record TaskAssignmentRequest(Long weekId, String destination) {
    }

    public record CarryOverRequest(LocalDate targetWeekStart, List<Long> taskIds) {
    }

    public record WeekConfigurationResponse(long projectId, int weekStartDay) {
    }

    public record WeekCollectionResponse(List<WeekDetailResponse> weeks,
                                         PlannerMetadataResponse metadata) {
    }

    public record WeekWithMetadataResponse(WeekDetailResponse week,
                                           PlannerMetadataResponse metadata) {
    }

    public record PlannerMetadataResponse(long projectId,
                                          int weekStartDay,
                                          LocalDate today,
                                          LocalDate currentWeekStart,
                                          LocalDate currentWeekEnd,
                                          Long currentWeekId,
                                          Long sprintId,
                                          String sprintName,
                                          String sprintStatus,
                                          LocalDate sprintDeadline) {
    }

    public record WeekDetailResponse(long id,
                                     long projectId,
                                     Long sprintId,
                                     LocalDate weekStart,
                                     LocalDate weekEnd,
                                     OffsetDateTime createdAt,
                                     OffsetDateTime updatedAt,
                                     List<TaskDetailResponse> tasks) {
    }

    public record TaskDetailResponse(long id,
                                     Long weekId,
                                     Long sprintId,
                                     boolean isBacklog,
                                     String note,
                                     BigDecimal plannedHours,
                                     Long internId,
                                     String internName,
                                     Long issueId,
                                     String issueTitle,
                                     String issueState,
                                     LocalDate deadline,
                                     OffsetDateTime createdAt,
                                     OffsetDateTime updatedAt) {
    }

    public record WeeklySummaryResponse(long projectWeekId,
                                        long taskCount,
                                        BigDecimal totalHours,
                                        List<InternSummaryResponse> perIntern) {
    }

    public record InternSummaryResponse(Long internId, String internName, long taskCount, BigDecimal totalHours) {
    }

}
