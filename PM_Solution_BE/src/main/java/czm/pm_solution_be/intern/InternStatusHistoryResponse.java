package czm.pm_solution_be.intern;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDate;

/**
 * REST DTO exposing a single entry from the intern_status_history table.
 */
public record InternStatusHistoryResponse(
        @JsonProperty("id") long id,
        @JsonProperty("status_code") String statusCode,
        @JsonProperty("status_label") String statusLabel,
        @JsonProperty("status_severity") int statusSeverity,
        @JsonProperty("valid_from") LocalDate validFrom,
        @JsonProperty("valid_to") LocalDate validTo) {
}
