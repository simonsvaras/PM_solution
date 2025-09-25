package czm.pm_solution_be.intern;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public record InternListResponse(
        @JsonProperty("content") List<InternResponse> content,
        @JsonProperty("page") int page,
        @JsonProperty("size") int size,
        @JsonProperty("total_elements") long totalElements,
        @JsonProperty("total_pages") int totalPages) {
}
