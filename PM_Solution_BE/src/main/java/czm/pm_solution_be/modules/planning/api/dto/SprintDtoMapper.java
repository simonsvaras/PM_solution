package czm.pm_solution_be.modules.planning.api.dto;

import czm.pm_solution_be.planning.sprint.PlanningSprintEntity;

import java.util.List;
import java.util.Objects;

public final class SprintDtoMapper {

    private SprintDtoMapper() {
    }

    public static SprintDto toDto(PlanningSprintEntity entity) {
        Objects.requireNonNull(entity, "entity");
        return new SprintDto(
                entity.id(),
                entity.projectId(),
                entity.name(),
                entity.description(),
                entity.deadline(),
                entity.status(),
                entity.createdAt(),
                entity.updatedAt());
    }

    public static SprintSummaryDto toSummary(PlanningSprintEntity entity) {
        return toSummary(entity, null, null);
    }

    public static SprintSummaryDto toSummary(PlanningSprintEntity entity,
                                             SprintTaskSummaryDto taskSummary,
                                             List<WeeklyTaskDto> tasks) {
        Objects.requireNonNull(entity, "entity");
        List<WeeklyTaskDto> safeTasks = tasks == null ? null : List.copyOf(tasks);
        return new SprintSummaryDto(
                entity.id(),
                entity.projectId(),
                entity.name(),
                entity.deadline(),
                entity.status(),
                taskSummary,
                safeTasks);
    }
}
