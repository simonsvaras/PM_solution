package czm.pm_solution_be.modules.planning.api.dto;

import czm.pm_solution_be.modules.planning.repository.WeeklyTaskRepository.WeeklyTaskEntity;

import java.util.Objects;

public final class WeeklyTaskDtoMapper {

    private WeeklyTaskDtoMapper() {
    }

    public static WeeklyTaskDto toDto(WeeklyTaskEntity entity) {
        Objects.requireNonNull(entity, "entity");
        return new WeeklyTaskDto(
                entity.id(),
                entity.projectId(),
                entity.projectWeekId(),
                entity.sprintId(),
                entity.note(),
                entity.plannedHours(),
                entity.internId(),
                entity.internName(),
                entity.issueId(),
                entity.issueTitle(),
                entity.issueState(),
                entity.taskStatus(),
                entity.issueDueDate(),
                entity.createdAt(),
                entity.updatedAt());
    }
}
