package czm.pm_solution_be.intern;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDate;

/**
 * Request DTO used when changing the current status of an intern.
 */
public record InternStatusUpdateRequest(
        @JsonProperty("status_code") String statusCode,
        @JsonProperty("valid_from") LocalDate validFrom) {
}
