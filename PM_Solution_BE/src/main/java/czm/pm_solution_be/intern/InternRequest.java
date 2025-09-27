package czm.pm_solution_be.intern;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * DTO used for create/update intern requests.
 */
public record InternRequest(
        @JsonProperty("first_name") String firstName,
        @JsonProperty("last_name") String lastName,
        @JsonProperty("username") String username,
        @JsonProperty("group_ids") List<Long> groupIds,
        @JsonProperty("level_history") List<InternLevelHistoryRequest> levelHistory) {
}




