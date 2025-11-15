package czm.pm_solution_be.planning.sprint;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Objects;

/**
 * Immutable projection of the <code>planning_sprint</code> table.
 */
public record PlanningSprintEntity(
        long id,
        long projectId,
        String name,
        String description,
        LocalDate deadline,
        SprintStatus status,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {

    public PlanningSprintEntity {
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
    }
}
