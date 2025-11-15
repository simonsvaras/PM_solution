package czm.pm_solution_be.modules.planning.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import czm.pm_solution_be.planning.sprint.SprintStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SprintSummaryDto(
        @NotNull Long id,
        @NotNull Long projectId,
        @NotBlank String name,
        LocalDate deadline,
        @NotNull SprintStatus status) {
}
