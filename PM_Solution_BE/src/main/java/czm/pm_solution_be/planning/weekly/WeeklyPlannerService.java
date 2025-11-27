package czm.pm_solution_be.planning.weekly;

import czm.pm_solution_be.modules.planning.service.SprintService;
import czm.pm_solution_be.planning.sprint.PlanningSprintEntity;
import czm.pm_solution_be.planning.sprint.SprintStatus;
import czm.pm_solution_be.planning.weekly.WeeklyPlannerRepository.IssueMetadataRow;
import czm.pm_solution_be.planning.weekly.WeeklyPlannerRepository.ProjectConfigurationRow;
import czm.pm_solution_be.planning.weekly.WeeklyPlannerRepository.ProjectWeekRow;
import czm.pm_solution_be.planning.weekly.WeeklyPlannerRepository.WeeklyStatisticsRow;
import czm.pm_solution_be.planning.weekly.WeeklyPlannerRepository.WeeklyTaskMutation;
import czm.pm_solution_be.planning.weekly.WeeklyPlannerRepository.WeeklyTaskRow;
import czm.pm_solution_be.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class WeeklyPlannerService {

    private static final int MAX_GENERATED_WEEKS = 104;
    private static final BigDecimal MAX_WEEKLY_HOURS = new BigDecimal("168");

    private final WeeklyPlannerRepository repository;
    private final TransactionTemplate txTemplate;
    private final SprintService sprintService;

    public WeeklyPlannerService(WeeklyPlannerRepository repository,
            PlatformTransactionManager transactionManager,
            SprintService sprintService) {
        this.repository = repository;
        this.sprintService = sprintService;
        this.txTemplate = new TransactionTemplate(transactionManager);
    }

    public WeekConfiguration getWeekConfiguration(long projectId) {
        ProjectConfigurationRow project = requireProject(projectId);
        PlanningSprintEntity sprint = sprintService.requireActiveSprint(projectId);
        return new WeekConfiguration(project.id(), project.weekStartDay());
    }

    public WeekConfiguration configureWeekStart(long projectId, int weekStartDay) {
        if (weekStartDay < 1 || weekStartDay > 7) {
            throw ApiException.validation("Začátek týdne musí být v intervalu 1 až 7.", "week_start_day_invalid");
        }
        ProjectConfigurationRow project = repository.findProjectConfiguration(projectId)
                .orElseThrow(() -> ApiException.notFound("Projekt nebyl nalezen.", "project"));
        if (project.weekStartDay() == weekStartDay) {
            return new WeekConfiguration(projectId, weekStartDay);
        }
        boolean updated = repository.updateProjectWeekStartDay(projectId, weekStartDay);
        if (!updated) {
            throw ApiException.notFound("Projekt nebyl nalezen.", "project");
        }
        return new WeekConfiguration(projectId, weekStartDay);
    }

    public WeekCollection generateWeeks(long projectId, LocalDate from, LocalDate to) {
        ProjectConfigurationRow project = requireProject(projectId);
        PlanningSprintEntity sprint = sprintService.requireActiveSprint(projectId);
        if (from == null) {
            throw ApiException.validation("Datum 'od' je povinné.", "from_required");
        }
        if (to == null) {
            throw ApiException.validation("Datum 'do' je povinné.", "to_required");
        }
        if (to.isBefore(from)) {
            throw ApiException.validation("Datum 'do' nesmí být dříve než datum 'od'.", "range_invalid");
        }
        LocalDate start = alignToWeekStart(from, project.weekStartDay());
        LocalDate end = alignToWeekStart(to, project.weekStartDay());
        long weeks = ChronoUnit.WEEKS.between(start, end) + 1;
        if (weeks > MAX_GENERATED_WEEKS) {
            throw ApiException.validation(
                    "Rozsah generování může pokrývat maximálně " + MAX_GENERATED_WEEKS + " týdnů.",
                    "week_range_too_large");
        }
        txTemplate.executeWithoutResult(status -> {
            LocalDate current = start;
            while (!current.isAfter(end)) {
                if (!repository.projectWeekExists(projectId, current)) {
                    repository.insertProjectWeek(projectId, sprint.id(), current);
                }
                current = current.plusWeeks(1);
            }
        });
        List<WeekDetail> result = new ArrayList<>();
        LocalDate current = start;
        while (!current.isAfter(end)) {
            ProjectWeekRow row = repository.findProjectWeek(projectId, current)
                    .orElseThrow(() -> ApiException.internal("Nepodařilo se načíst vygenerovaný týden.",
                            "week_reload_failed"));
            result.add(mapWeek(row));
            current = current.plusWeeks(1);
        }
        PlannerMetadata metadata = createMetadata(projectId, project, sprint);
        return new WeekCollection(metadata, List.copyOf(result));
    }

    public WeekCollection listWeeks(long projectId, Long sprintId, int limit, int offset) {
        ProjectConfigurationRow project = requireProject(projectId);
        if (limit <= 0 || limit > 200) {
            throw ApiException.validation("Limit musí být v intervalu 1 až 200.", "pagination_limit_invalid");
        }
        if (offset < 0) {
            throw ApiException.validation("Offset nesmí být záporný.", "pagination_offset_invalid");
        }
        PlanningSprintEntity sprint = resolveSprint(projectId, sprintId);
        List<ProjectWeekRow> rows = repository.listProjectWeeks(projectId, sprint.id(), limit, offset);
        PlannerMetadata metadata = createMetadata(projectId, project, sprint);
        List<WeekDetail> weeks = rows.stream()
                .map(this::mapWeek)
                .toList();
        return new WeekCollection(metadata, weeks);
    }

    public WeekWithMetadata getWeek(long projectId, long projectWeekId, Long sprintId) {
        ProjectConfigurationRow project = requireProject(projectId);
        ProjectWeekRow row = requireWeek(projectId, projectWeekId, sprintId);
        PlanningSprintEntity sprint = loadSprint(projectId, row.sprintId());
        PlannerMetadata metadata = createMetadata(projectId, project, sprint);
        return new WeekWithMetadata(metadata, mapWeek(row));
    }

    public TaskDetail createTask(long projectId, Long projectWeekId, TaskInput input) {
        PlanningSprintEntity sprint = sprintService.requireActiveSprint(projectId);
        ProjectWeekRow week = null;
        if (projectWeekId != null) {
            week = requireWeek(projectId, projectWeekId, sprint.id());
        }
        validateTaskInput(projectId, week, input);
        LocalDate weekStart = week == null ? null : week.weekStartDate();
        WeeklyTaskRow inserted = txTemplate.execute(status -> {
            WeeklyTaskRow created = repository.insertTask(projectId, sprint.id(), projectWeekId, toMutation(input));
            if (input.issueId() != null) {
                LocalDate deadline = resolveDeadline(input.deadline(), weekStart);
                repository.updateIssueDueDate(input.issueId(), deadline);
                if (input.status() != null) {
                    String normalized = normalizeIssueState(input.status());
                    repository.updateIssueState(input.issueId(), normalized);
                }
            }
            return repository.findTaskById(created.id())
                    .orElseThrow(() -> ApiException.internal("Úkol byl vytvořen, ale nepodařilo se jej načíst.",
                            "task_reload_failed"));
        });
        return mapTask(inserted);
    }

    public TaskDetail updateTask(long projectId, long projectWeekId, long taskId, TaskInput input) {
        PlanningSprintEntity sprint = sprintService.requireActiveSprint(projectId);
        ProjectWeekRow week = requireWeek(projectId, projectWeekId, sprint.id());
        requireTask(projectId, projectWeekId, taskId);
        validateTaskInput(projectId, week, input);
        WeeklyTaskRow updated = txTemplate.execute(status -> {
            WeeklyTaskRow row = repository.updateTask(taskId, toMutation(input))
                    .orElseThrow(() -> ApiException.notFound("Úkol nebyl nalezen.", "weekly_task"));
            if (input.issueId() != null) {
                LocalDate deadline = resolveDeadline(input.deadline(), week.weekStartDate());
                repository.updateIssueDueDate(input.issueId(), deadline);
                if (input.status() != null) {
                    String normalized = normalizeIssueState(input.status());
                    repository.updateIssueState(input.issueId(), normalized);
                }
            }
            return repository.findTaskById(row.id())
                    .orElseThrow(() -> ApiException.internal("Úkol byl upraven, ale nepodařilo se jej načíst.",
                            "task_reload_failed"));
        });
        return mapTask(updated);
    }

    public void deleteTask(long projectId, long projectWeekId, long taskId) {
        PlanningSprintEntity sprint = sprintService.requireActiveSprint(projectId);
        requireWeek(projectId, projectWeekId, sprint.id());
        WeeklyTaskRow task = requireTask(projectId, projectWeekId, taskId);
        txTemplate.executeWithoutResult(status -> repository.deleteTask(task.id()));
    }

    public TaskDetail changeStatus(long projectId, long projectWeekId, long taskId, String newStatus) {
        PlanningSprintEntity sprint = sprintService.requireActiveSprint(projectId);
        ProjectWeekRow week = requireWeek(projectId, projectWeekId, sprint.id());
        WeeklyTaskRow task = requireTask(projectId, projectWeekId, taskId);
        String normalized = normalizeIssueState(newStatus);

        txTemplate.executeWithoutResult(status -> {
            if (task.issueId() != null) {
                IssueMetadataRow issue = repository.findIssueMetadata(task.issueId())
                        .orElseThrow(() -> ApiException.notFound("Issue nebylo nalezeno.", "issue"));
                if (!repository.issueBelongsToProject(projectId, issue.id())) {
                    throw ApiException.validation("Issue nepatří do vybraného projektu.", "issue_project_mismatch");
                }
                boolean updated = repository.updateIssueState(issue.id(), normalized);
                if (!updated) {
                    throw ApiException.internal("Nepodařilo se aktualizovat stav issue.", "issue_update_failed");
                }
            } else {
                repository.updateTaskStatus(taskId, normalized);
            }
        });

        WeeklyTaskRow reloaded = repository.findTaskById(task.id())
                .orElseThrow(
                        () -> ApiException.internal("Nepodařilo se načíst úkol po změně stavu.", "task_reload_failed"));
        return mapTask(reloaded);
    }

    public TaskDetail assignTask(long projectId, long taskId, Long destinationWeekId) {
        WeeklyTaskRow task = repository.findTaskById(taskId)
                .orElseThrow(() -> ApiException.notFound("Úkol nebyl nalezen.", "weekly_task"));
        if (task.projectId() != projectId) {
            throw ApiException.validation("Úkol nepatří do vybraného projektu.", "weekly_task_project_mismatch");
        }
        Long newWeekId = destinationWeekId;
        Long newSprintId = task.sprintId();
        if (newSprintId == null) {
            PlanningSprintEntity sprint = sprintService.requireActiveSprint(projectId);
            newSprintId = sprint.id();
        }
        if (destinationWeekId != null) {
            ProjectWeekRow targetWeek = requireWeek(projectId, destinationWeekId, newSprintId);
            if (targetWeek.sprintId() != null && !Objects.equals(targetWeek.sprintId(), newSprintId)) {
                throw ApiException.validation("Týden nepatří do sprintu úkolu.", "project_week_sprint_mismatch");
            }
            newWeekId = targetWeek.id();
            newSprintId = targetWeek.sprintId() == null ? newSprintId : targetWeek.sprintId();
        }
        Long sprintId = newSprintId;
        Long targetWeekId = newWeekId;
        WeeklyTaskRow updated = txTemplate.execute(status -> repository.updateTaskAssignment(
                taskId,
                targetWeekId,
                sprintId)
                .orElseThrow(() -> ApiException.notFound("Úkol nebyl nalezen.", "weekly_task")));
        return mapTask(updated);
    }

    public void deleteWeek(long projectId, long projectWeekId) {
        PlanningSprintEntity sprint = sprintService.requireActiveSprint(projectId);
        ProjectWeekRow week = requireWeek(projectId, projectWeekId, sprint.id());
        if (week.sprintId() == null) {
            throw ApiException.validation("Týden není přiřazen k žádnému sprintu.", "project_week_sprint_missing");
        }
        var lastWeek = repository.findLastWeekInSprint(projectId, week.sprintId())
                .orElseThrow(() -> ApiException.notFound("Sprint nemá žádné týdny.", "project_week"));
        if (!Objects.equals(lastWeek.id(), projectWeekId)) {
            throw ApiException.validation("Smazat lze pouze poslední týden sprintu.", "project_week_not_last");
        }
        if (!week.tasks().isEmpty()) {
            throw ApiException.validation("Týden nelze smazat, protože obsahuje úkoly.", "project_week_not_empty");
        }
        txTemplate.executeWithoutResult(status -> {
            int removed = repository.deleteProjectWeek(projectWeekId);
            if (removed == 0) {
                throw ApiException.notFound("Požadovaný týden neexistuje.", "project_week");
            }
        });
    }

    public List<TaskDetail> carryOverTasks(long projectId,
            long sourceProjectWeekId,
            LocalDate targetWeekStart,
            List<Long> taskIds) {
        PlanningSprintEntity sprint = sprintService.requireActiveSprint(projectId);
        ProjectWeekRow source = requireWeek(projectId, sourceProjectWeekId, sprint.id());
        if (targetWeekStart == null) {
            throw ApiException.validation("Datum cílového týdne je povinné.", "target_week_required");
        }
        ProjectConfigurationRow project = requireProject(projectId);
        LocalDate alignedTarget = alignToWeekStart(targetWeekStart, project.weekStartDay());
        List<WeeklyTaskRow> sourceTasks = source.tasks();
        Set<Long> filterIds = taskIds == null ? Set.of() : new LinkedHashSet<>(taskIds);
        if (!filterIds.isEmpty()) {
            Set<Long> existingIds = sourceTasks.stream().map(WeeklyTaskRow::id).collect(Collectors.toSet());
            for (Long id : filterIds) {
                if (!existingIds.contains(id)) {
                    throw ApiException.notFound("Vybraný úkol nebyl v týdnu nalezen.", "weekly_task");
                }
            }
        }
        List<WeeklyTaskRow> toCopy = sourceTasks.stream()
                .filter(task -> filterIds.isEmpty()
                        ? !"closed".equalsIgnoreCase(Optional.ofNullable(task.issueState()).orElse(""))
                        : filterIds.contains(task.id()))
                .toList();
        if (toCopy.isEmpty()) {
            return List.of();
        }
        LocalDate targetWeekEnd = computeWeekEnd(alignedTarget);
        List<Long> newTaskIds = txTemplate.execute(status -> {
            ProjectWeekRow targetWeek = repository.findProjectWeek(projectId, alignedTarget)
                    .map(existing -> {
                        if (existing.sprintId() != null && !existing.sprintId().equals(sprint.id())) {
                            throw ApiException.validation("Týden nepatří do aktuálního sprintu.",
                                    "project_week_sprint_mismatch");
                        }
                        return existing;
                    })
                    .orElseGet(() -> {
                        var inserted = repository.insertProjectWeek(projectId, sprint.id(), alignedTarget);
                        return repository.findProjectWeekById(inserted.id())
                                .orElseThrow(() -> ApiException.internal("Nepodařilo se načíst cílový týden.",
                                        "target_week_reload_failed"));
                    });
            List<Long> ids = new ArrayList<>();
            Long targetSprintId = targetWeek.sprintId() == null ? sprint.id() : targetWeek.sprintId();
            for (WeeklyTaskRow task : toCopy) {
                WeeklyTaskRow inserted = repository.insertTask(projectId,
                        targetSprintId,
                        targetWeek.id(),
                        new WeeklyTaskMutation(task.internId(), task.issueId(), task.note(), task.plannedHours(),
                                null));
                ids.add(inserted.id());
                if (task.issueId() != null) {
                    repository.updateIssueDueDate(task.issueId(), targetWeekEnd);
                }
            }
            return ids;
        });
        return newTaskIds.stream()
                .map(id -> repository.findTaskById(id)
                        .orElseThrow(() -> ApiException.internal("Nepodařilo se načíst přenesený úkol.",
                                "task_reload_failed")))
                .map(this::mapTask)
                .toList();
    }

    public WeekWithMetadata closeWeek(long projectId, long projectWeekId) {
        ProjectConfigurationRow project = requireProject(projectId);
        PlanningSprintEntity sprint = sprintService.requireActiveSprint(projectId);
        ProjectWeekRow week = requireWeek(projectId, projectWeekId, sprint.id());
        LocalDate weekEnd = computeWeekEnd(week.weekStartDate());
        txTemplate.executeWithoutResult(status -> {
            for (WeeklyTaskRow task : week.tasks()) {
                if (task.issueId() != null) {
                    repository.updateIssueState(task.issueId(), "closed");
                    repository.updateIssueDueDate(task.issueId(), weekEnd);
                }
            }
        });
        ProjectWeekRow refreshed = repository.findProjectWeekById(projectWeekId)
                .orElseThrow(
                        () -> ApiException.internal("Nepodařilo se načíst týden po uzavření.", "week_reload_failed"));
        PlannerMetadata metadata = createMetadata(projectId, project, sprint);
        return new WeekWithMetadata(metadata, mapWeek(refreshed));
    }

    public WeeklySummary getSummary(long projectId, long projectWeekId) {
        requireWeek(projectId, projectWeekId);
        WeeklyStatisticsRow stats = repository.loadWeeklyStatistics(projectWeekId);
        List<InternSummary> perIntern = stats.perIntern().stream()
                .map(row -> new InternSummary(row.internId(), row.internName(), row.taskCount(), row.totalHours()))
                .toList();
        return new WeeklySummary(stats.projectWeekId(), stats.taskCount(), stats.totalHours(), perIntern);
    }

    private ProjectConfigurationRow requireProject(long projectId) {
        return repository.findProjectConfiguration(projectId)
                .orElseThrow(() -> ApiException.notFound("Projekt nebyl nalezen.", "project"));
    }

    private ProjectWeekRow requireWeek(long projectId, long projectWeekId) {
        return requireWeek(projectId, projectWeekId, null);
    }

    private ProjectWeekRow requireWeek(long projectId, long projectWeekId, Long requiredSprintId) {
        ProjectWeekRow row = repository.findProjectWeekById(projectWeekId)
                .orElseThrow(() -> ApiException.notFound("Požadovaný týden neexistuje.", "project_week"));
        if (row.projectId() != projectId) {
            throw ApiException.notFound("Požadovaný týden neexistuje.", "project_week");
        }
        if (requiredSprintId != null && row.sprintId() != null && !Objects.equals(row.sprintId(), requiredSprintId)) {
            throw ApiException.validation("Týden nepatří do vybraného sprintu.", "project_week_sprint_mismatch");
        }
        return row;
    }

    private WeeklyTaskRow requireTask(long projectId, Long projectWeekId, long taskId) {
        WeeklyTaskRow row = repository.findTaskById(taskId)
                .orElseThrow(() -> ApiException.notFound("Úkol nebyl nalezen.", "weekly_task"));
        if (row.projectId() != projectId) {
            throw ApiException.notFound("Úkol nepatří do vybraného projektu.", "weekly_task");
        }
        if (projectWeekId != null && !Objects.equals(row.projectWeekId(), projectWeekId)) {
            throw ApiException.notFound("Úkol nebyl nalezen v daném týdnu.", "weekly_task");
        }
        return row;
    }

    private void validateTaskInput(long projectId, ProjectWeekRow week, TaskInput input) {
        if (input == null) {
            throw ApiException.validation("Tělo požadavku je povinné.", "task_body_required");
        }
        if (input.plannedHours() != null) {
            BigDecimal hours = input.plannedHours().setScale(2, RoundingMode.HALF_UP);
            if (hours.compareTo(BigDecimal.ZERO) < 0) {
                throw ApiException.validation("Počet hodin nesmí být záporný.", "planned_hours_negative");
            }
            if (hours.compareTo(MAX_WEEKLY_HOURS) > 0) {
                throw ApiException.validation("Počet hodin nesmí překročit " + MAX_WEEKLY_HOURS + ".",
                        "planned_hours_exceeded");
            }
        }
        if (input.issueId() != null) {
            if (input.issueId() <= 0) {
                throw ApiException.validation("ID issue musí být kladné.", "issue_id_invalid");
            }
            IssueMetadataRow issue = repository.findIssueMetadata(input.issueId())
                    .orElseThrow(() -> ApiException.notFound("Issue nebylo nalezeno.", "issue"));
            if (!repository.issueBelongsToProject(projectId, issue.id())) {
                throw ApiException.validation("Issue nepatří do vybraného projektu.", "issue_project_mismatch");
            }
        }
        if (input.internId() != null) {
            if (input.internId() <= 0) {
                throw ApiException.validation("ID stážisty musí být kladné.", "intern_id_invalid");
            }
            if (!repository.internAssignedToProject(projectId, input.internId())) {
                throw ApiException.validation("Stážista není přiřazen k projektu.", "intern_project_mismatch");
            }
        }
        if (input.deadline() != null && week != null) {
            LocalDate weekEnd = computeWeekEnd(week.weekStartDate());
            if (input.deadline().isBefore(week.weekStartDate()) || input.deadline().isAfter(weekEnd)) {
                throw ApiException.validation("Deadline musí spadat do vybraného týdne.", "deadline_out_of_range");
            }
        }
    }

    private WeeklyTaskMutation toMutation(TaskInput input) {
        BigDecimal plannedHours = input.plannedHours() == null ? null
                : input.plannedHours().setScale(2, RoundingMode.HALF_UP);
        String status = input.status() == null ? null : normalizeIssueState(input.status());
        return new WeeklyTaskMutation(input.internId(), input.issueId(), input.note(), plannedHours, status);
    }

    private WeekDetail mapWeek(ProjectWeekRow row) {
        LocalDate weekEnd = computeWeekEnd(row.weekStartDate());
        List<TaskDetail> tasks = row.tasks().stream()
                .map(this::mapTask)
                .toList();
        return new WeekDetail(
                row.id(),
                row.projectId(),
                row.sprintId(),
                row.weekStartDate(),
                weekEnd,
                row.createdAt(),
                row.updatedAt(),
                tasks);
    }

    private PlanningSprintEntity resolveSprint(long projectId, Long sprintId) {
        if (sprintId == null) {
            return sprintService.requireActiveSprint(projectId);
        }
        return sprintService.requireSprint(projectId, sprintId);
    }

    private PlanningSprintEntity loadSprint(long projectId, Long sprintId) {
        if (sprintId == null) {
            return null;
        }
        return sprintService.requireSprint(projectId, sprintId);
    }

    private PlannerMetadata createMetadata(long projectId,
            ProjectConfigurationRow project,
            PlanningSprintEntity sprint) {
        LocalDate today = OffsetDateTime.now(ZoneOffset.UTC).toLocalDate();
        LocalDate currentWeekStart = alignToWeekStart(today, project.weekStartDay());
        LocalDate currentWeekEnd = computeWeekEnd(currentWeekStart);
        Long currentWeekId = repository.findProjectWeek(projectId, currentWeekStart)
                .map(ProjectWeekRow::id)
                .orElse(null);
        Long sprintId = sprint == null ? null : sprint.id();
        String sprintName = sprint == null ? null : sprint.name();
        SprintStatus sprintStatus = sprint == null ? null : sprint.status();
        LocalDate sprintDeadline = sprint == null ? null : sprint.deadline();
        return new PlannerMetadata(projectId,
                project.weekStartDay(),
                today,
                currentWeekStart,
                currentWeekEnd,
                currentWeekId,
                sprintId,
                sprintName,
                sprintStatus,
                sprintDeadline);
    }

    private TaskDetail mapTask(WeeklyTaskRow row) {
        String effectiveStatus = row.issueId() != null ? row.issueState() : row.status();
        if (effectiveStatus != null) {
            effectiveStatus = effectiveStatus.toUpperCase(Locale.ROOT);
        }
        return new TaskDetail(
                row.id(),
                row.projectWeekId(),
                row.sprintId(),
                row.projectWeekId() == null,
                row.note(),
                row.plannedHours(),
                row.internId(),
                row.internName(),
                row.issueId(),
                row.issueTitle(),
                row.issueState(),
                effectiveStatus,
                row.issueDueDate(),
                row.createdAt(),
                row.updatedAt());
    }

    private LocalDate resolveDeadline(LocalDate requested, LocalDate weekStart) {
        if (weekStart == null) {
            return requested;
        }
        LocalDate weekEnd = computeWeekEnd(weekStart);
        if (requested == null) {
            return weekEnd;
        }
        if (requested.isBefore(weekStart) || requested.isAfter(weekEnd)) {
            throw ApiException.validation("Deadline musí spadat do vybraného týdne.", "deadline_out_of_range");
        }
        return requested;
    }

    private LocalDate computeWeekEnd(LocalDate weekStart) {
        return weekStart.plusDays(6);
    }

    private LocalDate alignToWeekStart(LocalDate date, int weekStartDay) {
        DayOfWeek target = DayOfWeek.of(weekStartDay);
        return date.with(TemporalAdjusters.previousOrSame(target));
    }

    private String normalizeIssueState(String status) {
        if (status == null || status.isBlank()) {
            throw ApiException.validation("Status je povinný.", "issue_status_required");
        }
        String normalised = status.trim().toLowerCase(Locale.ROOT);
        if (!normalised.equals("opened") && !normalised.equals("closed") && !normalised.equals("in_progress")) {
            throw ApiException.validation("Status může být pouze OPENED, CLOSED nebo IN_PROGRESS.",
                    "issue_status_invalid");
        }
        return normalised;
    }

    public record WeekConfiguration(long projectId, int weekStartDay) {
    }

    public record WeekCollection(PlannerMetadata metadata, List<WeekDetail> weeks) {
    }

    public record WeekWithMetadata(PlannerMetadata metadata, WeekDetail week) {
    }

    public record PlannerMetadata(long projectId,
            int weekStartDay,
            LocalDate today,
            LocalDate currentWeekStart,
            LocalDate currentWeekEnd,
            Long currentWeekId,
            Long sprintId,
            String sprintName,
            SprintStatus sprintStatus,
            LocalDate sprintDeadline) {
    }

    public record WeekDetail(long id,
            long projectId,
            Long sprintId,
            LocalDate weekStart,
            LocalDate weekEnd,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt,
            List<TaskDetail> tasks) {
    }

    public record TaskDetail(long id,
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
            String status,
            LocalDate deadline,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {
    }

    public record WeeklySummary(long projectWeekId,
            long taskCount,
            BigDecimal totalHours,
            List<InternSummary> perIntern) {
    }

    public record InternSummary(Long internId, String internName, long taskCount, BigDecimal totalHours) {
    }

    public record TaskInput(Long issueId,
            Long internId,
            String note,
            BigDecimal plannedHours,
            LocalDate deadline,
            String status) {
    }
}
