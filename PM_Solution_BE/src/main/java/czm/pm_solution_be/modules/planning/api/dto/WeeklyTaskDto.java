package czm.pm_solution_be.modules.planning.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record WeeklyTaskDto(long id,
                            long projectId,
                            Long projectWeekId,
                            long sprintId,
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
