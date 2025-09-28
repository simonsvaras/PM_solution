package czm.pm_solution_be.intern;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.util.List;

public record InternDetailResponse(
        @JsonProperty("id") long id,
        @JsonProperty("first_name") String firstName,
        @JsonProperty("last_name") String lastName,
        @JsonProperty("username") String username,
        @JsonProperty("level_id") long levelId,
        @JsonProperty("level_label") String levelLabel,
        @JsonProperty("groups") List<InternGroupResponse> groups,
        @JsonProperty("total_hours") BigDecimal totalHours,
        @JsonProperty("projects") List<InternProjectAllocationResponse> projects) {
}
