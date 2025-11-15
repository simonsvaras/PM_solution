package czm.pm_solution_be.modules.planning.service;

import czm.pm_solution_be.modules.planning.repository.WeeklyTaskRepository.WeeklyTaskEntity;
import czm.pm_solution_be.planning.sprint.PlanningSprintEntity;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

@Service
public class SprintSummaryService {

    private final SprintService sprintService;

    public SprintSummaryService(SprintService sprintService) {
        this.sprintService = sprintService;
    }

    public SprintSummary getSprintSummary(long projectId, long sprintId) {
        PlanningSprintEntity sprint = sprintService.requireSprint(projectId, sprintId);
        List<WeeklyTaskEntity> tasks = sprintService.listSprintTasks(sprint);
        SprintTaskSummary taskSummary = computeSummary(tasks);
        return new SprintSummary(sprint, taskSummary, List.copyOf(tasks));
    }

    private SprintTaskSummary computeSummary(List<WeeklyTaskEntity> tasks) {
        long open = 0L;
        long closed = 0L;
        BigDecimal hours = BigDecimal.ZERO;
        for (WeeklyTaskEntity task : tasks) {
            if (isTaskClosed(task)) {
                closed++;
            } else {
                open++;
            }
            if (task.plannedHours() != null) {
                hours = hours.add(task.plannedHours());
            }
        }
        return new SprintTaskSummary(tasks.size(), open, closed, hours);
    }

    private boolean isTaskClosed(WeeklyTaskEntity task) {
        String state = task.issueState();
        return state != null && "closed".equalsIgnoreCase(state.trim());
    }

    public record SprintSummary(PlanningSprintEntity sprint,
                                SprintTaskSummary taskSummary,
                                List<WeeklyTaskEntity> tasks) {
    }

    public record SprintTaskSummary(long totalTasks,
                                    long openTasks,
                                    long closedTasks,
                                    BigDecimal totalPlannedHours) {
    }
}
