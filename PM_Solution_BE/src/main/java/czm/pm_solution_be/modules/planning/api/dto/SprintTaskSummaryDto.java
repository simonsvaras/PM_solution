package czm.pm_solution_be.modules.planning.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SprintTaskSummaryDto(long totalTasks,
                                   long openTasks,
                                   long closedTasks,
                                   BigDecimal totalPlannedHours) {
}
