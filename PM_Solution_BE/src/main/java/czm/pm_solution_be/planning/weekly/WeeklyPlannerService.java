package czm.pm_solution_be.planning.weekly;

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
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class WeeklyPlannerService {

    private static final int MAX_GENERATED_WEEKS = 104;
    private static final BigDecimal MAX_WEEKLY_HOURS = new BigDecimal("168");

    private final WeeklyPlannerRepository repository;
    private final TransactionTemplate txTemplate;

    public WeeklyPlannerService(WeeklyPlannerRepository repository, PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.txTemplate = new TransactionTemplate(transactionManager);
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
            throw ApiException.validation("Rozsah generování může pokrývat maximálně " + MAX_GENERATED_WEEKS + " týdnů.", "week_range_too_large");
        }
        txTemplate.executeWithoutResult(status -> {
            LocalDate current = start;
            while (!current.isAfter(end)) {
                if (!repository.projectWeekExists(projectId, current)) {
                    repository.insertProjectWeek(projectId, current);
                }
                current = current.plusWeeks(1);
            }
        });
        List<WeekDetail> result = new ArrayList<>();
        LocalDate current = start;
        while (!current.isAfter(end)) {
            ProjectWeekRow row = repository.findProjectWeek(projectId, current)
                    .orElseThrow(() -> ApiException.internal("Nepodařilo se načíst vygenerovaný týden.", "week_reload_failed"));
            result.add(mapWeek(row));
            current = current.plusWeeks(1);
        }
        PlannerMetadata metadata = createMetadata(projectId, project);
        return new WeekCollection(metadata, List.copyOf(result));
    }

    public WeekCollection listWeeks(long projectId, int limit, int offset) {
        ProjectConfigurationRow project = requireProject(projectId);
        if (limit <= 0 || limit > 200) {
            throw ApiException.validation("Limit musí být v intervalu 1 až 200.", "pagination_limit_invalid");
        }
        if (offset < 0) {
            throw ApiException.validation("Offset nesmí být záporný.", "pagination_offset_invalid");
        }
        List<ProjectWeekRow> rows = repository.listProjectWeeks(projectId, limit, offset);
        PlannerMetadata metadata = createMetadata(projectId, project);
        List<WeekDetail> weeks = rows.stream()
                .map(this::mapWeek)
                .toList();
        return new WeekCollection(metadata, weeks);
    }

    public WeekWithMetadata getWeek(long projectId, long projectWeekId) {
        ProjectConfigurationRow project = requireProject(projectId);
        ProjectWeekRow row = repository.findProjectWeekById(projectWeekId)
                .orElseThrow(() -> ApiException.notFound("Požadovaný týden neexistuje.", "project_week"));
        if (row.projectId() != projectId) {
            throw ApiException.notFound("Požadovaný týden neexistuje.", "project_week");
        }
        PlannerMetadata metadata = createMetadata(projectId, project);
        return new WeekWithMetadata(metadata, mapWeek(row));
    }

    public TaskDetail createTask(long projectId, long projectWeekId, TaskInput input) {
        ProjectWeekRow week = requireWeek(projectId, projectWeekId);
        validateTaskInput(projectId, week, input);
        WeeklyTaskRow inserted = txTemplate.execute(status -> {
            WeeklyTaskRow created = repository.insertTask(projectWeekId, toMutation(input));
            if (input.issueId() != null) {
                LocalDate deadline = resolveDeadline(input.deadline(), week.weekStartDate());
                repository.updateIssueDueDate(input.issueId(), deadline);
            }
            return repository.findTaskById(created.id())
                    .orElseThrow(() -> ApiException.internal("Úkol byl vytvořen, ale nepodařilo se jej načíst.", "task_reload_failed"));
        });
        return mapTask(inserted);
    }

    public TaskDetail updateTask(long projectId, long projectWeekId, long taskId, TaskInput input) {
        ProjectWeekRow week = requireWeek(projectId, projectWeekId);
        requireTask(projectWeekId, taskId);
        validateTaskInput(projectId, week, input);
        WeeklyTaskRow updated = txTemplate.execute(status -> {
            WeeklyTaskRow row = repository.updateTask(taskId, toMutation(input))
                    .orElseThrow(() -> ApiException.notFound("Úkol nebyl nalezen.", "weekly_task"));
            if (input.issueId() != null) {
                LocalDate deadline = resolveDeadline(input.deadline(), week.weekStartDate());
                repository.updateIssueDueDate(input.issueId(), deadline);
            }
            return repository.findTaskById(row.id())
                    .orElseThrow(() -> ApiException.internal("Úkol byl upraven, ale nepodařilo se jej načíst.", "task_reload_failed"));
        });
        return mapTask(updated);
    }

    public TaskDetail changeStatus(long projectId, long projectWeekId, long taskId, String newStatus) {
        ProjectWeekRow week = requireWeek(projectId, projectWeekId);
        WeeklyTaskRow task = requireTask(projectWeekId, taskId);
        if (task.issueId() == null) {
            throw ApiException.validation("Úkol není navázán na issue, status nelze změnit.", "issue_required");
        }
        String normalized = normalizeIssueState(newStatus);
        IssueMetadataRow issue = repository.findIssueMetadata(task.issueId())
                .orElseThrow(() -> ApiException.notFound("Issue nebylo nalezeno.", "issue"));
        if (!repository.issueBelongsToProject(projectId, issue.id())) {
            throw ApiException.validation("Issue nepatří do vybraného projektu.", "issue_project_mismatch");
        }
        txTemplate.executeWithoutResult(status -> {
            boolean updated = repository.updateIssueState(issue.id(), normalized);
            if (!updated) {
                throw ApiException.internal("Nepodařilo se aktualizovat stav issue.", "issue_update_failed");
            }
        });
        WeeklyTaskRow reloaded = repository.findTaskById(task.id())
                .orElseThrow(() -> ApiException.internal("Nepodařilo se načíst úkol po změně stavu.", "task_reload_failed"));
        return mapTask(reloaded);
    }

    public List<TaskDetail> carryOverTasks(long projectId,
                                           long sourceProjectWeekId,
                                           LocalDate targetWeekStart,
                                           List<Long> taskIds) {
        ProjectWeekRow source = requireWeek(projectId, sourceProjectWeekId);
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
                .filter(task -> filterIds.isEmpty() ? !"closed".equalsIgnoreCase(Optional.ofNullable(task.issueState()).orElse("")) : filterIds.contains(task.id()))
                .toList();
        if (toCopy.isEmpty()) {
            return List.of();
        }
        LocalDate targetWeekEnd = computeWeekEnd(alignedTarget);
        List<Long> newTaskIds = txTemplate.execute(status -> {
            ProjectWeekRow targetWeek = repository.findProjectWeek(projectId, alignedTarget)
                    .orElseGet(() -> {
                        var inserted = repository.insertProjectWeek(projectId, alignedTarget);
                        return repository.findProjectWeekById(inserted.id())
                                .orElseThrow(() -> ApiException.internal("Nepodařilo se načíst cílový týden.", "target_week_reload_failed"));
                    });
            List<Long> ids = new ArrayList<>();
            for (WeeklyTaskRow task : toCopy) {
                WeeklyTaskRow inserted = repository.insertTask(targetWeek.id(),
                        new WeeklyTaskMutation(task.internId(), task.issueId(), task.dayOfWeek(), task.note(), task.plannedHours()));
                ids.add(inserted.id());
                if (task.issueId() != null) {
                    repository.updateIssueDueDate(task.issueId(), targetWeekEnd);
                }
            }
            return ids;
        });
        return newTaskIds.stream()
                .map(id -> repository.findTaskById(id)
                        .orElseThrow(() -> ApiException.internal("Nepodařilo se načíst přenesený úkol.", "task_reload_failed")))
                .map(this::mapTask)
                .toList();
    }

    public WeekWithMetadata closeWeek(long projectId, long projectWeekId) {
        ProjectConfigurationRow project = requireProject(projectId);
        ProjectWeekRow week = requireWeek(projectId, projectWeekId);
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
                .orElseThrow(() -> ApiException.internal("Nepodařilo se načíst týden po uzavření.", "week_reload_failed"));
        PlannerMetadata metadata = createMetadata(projectId, project);
        return new WeekWithMetadata(metadata, mapWeek(refreshed));
    }

    public WeeklySummary getSummary(long projectId, long projectWeekId) {
        requireWeek(projectId, projectWeekId);
        WeeklyStatisticsRow stats = repository.loadWeeklyStatistics(projectWeekId);
        List<DailySummary> perDay = stats.perDay().stream()
                .map(row -> new DailySummary(row.dayOfWeek(), row.taskCount(), row.totalHours()))
                .toList();
        List<InternSummary> perIntern = stats.perIntern().stream()
                .map(row -> new InternSummary(row.internId(), row.internName(), row.taskCount(), row.totalHours()))
                .toList();
        return new WeeklySummary(stats.projectWeekId(), stats.taskCount(), stats.totalHours(), perDay, perIntern);
    }

    private ProjectConfigurationRow requireProject(long projectId) {
        return repository.findProjectConfiguration(projectId)
                .orElseThrow(() -> ApiException.notFound("Projekt nebyl nalezen.", "project"));
    }

    private ProjectWeekRow requireWeek(long projectId, long projectWeekId) {
        ProjectWeekRow row = repository.findProjectWeekById(projectWeekId)
                .orElseThrow(() -> ApiException.notFound("Požadovaný týden neexistuje.", "project_week"));
        if (row.projectId() != projectId) {
            throw ApiException.notFound("Požadovaný týden neexistuje.", "project_week");
        }
        return row;
    }

    private WeeklyTaskRow requireTask(long projectWeekId, long taskId) {
        WeeklyTaskRow row = repository.findTaskById(taskId)
                .orElseThrow(() -> ApiException.notFound("Úkol nebyl nalezen.", "weekly_task"));
        if (row.projectWeekId() != projectWeekId) {
            throw ApiException.notFound("Úkol nebyl nalezen v daném týdnu.", "weekly_task");
        }
        return row;
    }

    private void validateTaskInput(long projectId, ProjectWeekRow week, TaskInput input) {
        if (input == null) {
            throw ApiException.validation("Tělo požadavku je povinné.", "task_body_required");
        }
        if (input.dayOfWeek() == null) {
            throw ApiException.validation("Den v týdnu je povinný.", "day_of_week_required");
        }
        if (input.dayOfWeek() < 1 || input.dayOfWeek() > 7) {
            throw ApiException.validation("Den v týdnu musí být v intervalu 1 až 7.", "day_of_week_invalid");
        }
        if (input.plannedHours() != null) {
            BigDecimal hours = input.plannedHours().setScale(2, RoundingMode.HALF_UP);
            if (hours.compareTo(BigDecimal.ZERO) < 0) {
                throw ApiException.validation("Počet hodin nesmí být záporný.", "planned_hours_negative");
            }
            if (hours.compareTo(MAX_WEEKLY_HOURS) > 0) {
                throw ApiException.validation("Počet hodin nesmí překročit " + MAX_WEEKLY_HOURS + ".", "planned_hours_exceeded");
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
        if (input.deadline() != null) {
            LocalDate weekEnd = computeWeekEnd(week.weekStartDate());
            if (input.deadline().isBefore(week.weekStartDate()) || input.deadline().isAfter(weekEnd)) {
                throw ApiException.validation("Deadline musí spadat do vybraného týdne.", "deadline_out_of_range");
            }
        }
    }

    private WeeklyTaskMutation toMutation(TaskInput input) {
        BigDecimal plannedHours = input.plannedHours() == null ? null : input.plannedHours().setScale(2, RoundingMode.HALF_UP);
        return new WeeklyTaskMutation(input.internId(), input.issueId(), input.dayOfWeek(), input.note(), plannedHours);
    }

    private WeekDetail mapWeek(ProjectWeekRow row) {
        LocalDate weekEnd = computeWeekEnd(row.weekStartDate());
        List<TaskDetail> tasks = row.tasks().stream()
                .map(this::mapTask)
                .toList();
        return new WeekDetail(
                row.id(),
                row.projectId(),
                row.weekStartDate(),
                weekEnd,
                row.createdAt(),
                row.updatedAt(),
                tasks);
    }

    private PlannerMetadata createMetadata(long projectId, ProjectConfigurationRow project) {
        LocalDate today = OffsetDateTime.now(ZoneOffset.UTC).toLocalDate();
        LocalDate currentWeekStart = alignToWeekStart(today, project.weekStartDay());
        LocalDate currentWeekEnd = computeWeekEnd(currentWeekStart);
        Long currentWeekId = repository.findProjectWeek(projectId, currentWeekStart)
                .map(ProjectWeekRow::id)
                .orElse(null);
        return new PlannerMetadata(projectId, project.weekStartDay(), today, currentWeekStart, currentWeekEnd, currentWeekId);
    }

    private TaskDetail mapTask(WeeklyTaskRow row) {
        return new TaskDetail(
                row.id(),
                row.dayOfWeek(),
                row.note(),
                row.plannedHours(),
                row.internId(),
                row.internName(),
                row.issueId(),
                row.issueTitle(),
                row.issueState(),
                row.issueDueDate(),
                row.createdAt(),
                row.updatedAt());
    }

    private LocalDate resolveDeadline(LocalDate requested, LocalDate weekStart) {
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
        if (!normalised.equals("opened") && !normalised.equals("closed")) {
            throw ApiException.validation("Status může být pouze OPENED nebo CLOSED.", "issue_status_invalid");
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
                                   Long currentWeekId) {
    }

    public record WeekDetail(long id,
                             long projectId,
                             LocalDate weekStart,
                             LocalDate weekEnd,
                             OffsetDateTime createdAt,
                             OffsetDateTime updatedAt,
                             List<TaskDetail> tasks) {
    }

    public record TaskDetail(long id,
                             Integer dayOfWeek,
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

    public record WeeklySummary(long projectWeekId,
                                long taskCount,
                                BigDecimal totalHours,
                                List<DailySummary> perDay,
                                List<InternSummary> perIntern) {
    }

    public record DailySummary(int dayOfWeek, long taskCount, BigDecimal totalHours) {
    }

    public record InternSummary(Long internId, String internName, long taskCount, BigDecimal totalHours) {
    }

    public record TaskInput(Long issueId,
                            Long internId,
                            Integer dayOfWeek,
                            String note,
                            BigDecimal plannedHours,
                            LocalDate deadline) {
    }
}
