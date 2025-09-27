package czm.pm_solution_be.intern;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDate;

/**
 * Request DTO representing a single level assignment period for an intern.
 */
public record InternLevelHistoryRequest(
        @JsonProperty("level_id") Long levelId,
        @JsonProperty("valid_from") LocalDate validFrom,
        @JsonProperty("valid_to") LocalDate validTo) {
}
