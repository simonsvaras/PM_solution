package czm.pm_solution_be.intern;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDate;

/**
 * Response DTO representing an item from intern_level_history with level metadata.
 */
public record InternLevelHistoryResponse(
        @JsonProperty("id") long id,
        @JsonProperty("level_id") long levelId,
        @JsonProperty("level_code") String levelCode,
        @JsonProperty("level_label") String levelLabel,
        @JsonProperty("valid_from") LocalDate validFrom,
        @JsonProperty("valid_to") LocalDate validTo) {
}
