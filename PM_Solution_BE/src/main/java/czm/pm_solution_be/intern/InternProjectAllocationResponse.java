package czm.pm_solution_be.intern;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;

public record InternProjectAllocationResponse(
        @JsonProperty("project_id") long projectId,
        @JsonProperty("project_name") String projectName,
        @JsonProperty("workload_hours") BigDecimal workloadHours,
        @JsonProperty("include_in_reported_cost") boolean includeInReportedCost) {
}
