package czm.pm_solution_be.modules.planning.api.dto;

import czm.pm_solution_be.planning.sprint.PlanningSprintEntity;

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
        Objects.requireNonNull(entity, "entity");
        return new SprintSummaryDto(
                entity.id(),
                entity.projectId(),
                entity.name(),
                entity.deadline(),
                entity.status());
    }
}
