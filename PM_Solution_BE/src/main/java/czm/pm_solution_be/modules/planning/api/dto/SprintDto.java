package czm.pm_solution_be.modules.planning.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import czm.pm_solution_be.planning.sprint.SprintStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SprintDto(
        @NotNull Long id,
        @NotNull Long projectId,
        @NotBlank String name,
        String description,
        LocalDate deadline,
        @NotNull SprintStatus status,
        @NotNull OffsetDateTime createdAt,
        @NotNull OffsetDateTime updatedAt) {
}
