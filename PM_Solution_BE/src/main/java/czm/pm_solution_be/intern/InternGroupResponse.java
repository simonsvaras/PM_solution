package czm.pm_solution_be.intern;

import com.fasterxml.jackson.annotation.JsonProperty;

public record InternGroupResponse(
        @JsonProperty("id") long id,
        @JsonProperty("code") int code,
        @JsonProperty("label") String label) {
}
