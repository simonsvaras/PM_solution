package czm.pm_solution_be.modules.planning.api.request;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public record CreateSprintRequest(@NotBlank String name,
                                  String description,
                                  LocalDate deadline) {
}
