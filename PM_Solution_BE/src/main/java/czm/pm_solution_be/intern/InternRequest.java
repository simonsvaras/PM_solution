package czm.pm_solution_be.intern;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public record InternRequest(
        @JsonProperty("first_name") String firstName,
        @JsonProperty("last_name") String lastName,
        @JsonProperty("username") String username,
        @JsonProperty("level_id") Long levelId,
        @JsonProperty("group_ids") List<Long> groupIds) {
}
