package czm.pm_solution_be.gitlab.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDate;
import java.time.OffsetDateTime;

public class GitLabMilestone {
    public long id;
    public long iid;
    public String title;
    public String state;
    public String description;
    @JsonProperty("due_date")
    public LocalDate dueDate;
    @JsonProperty("created_at")
    public OffsetDateTime createdAt;
    @JsonProperty("updated_at")
    public OffsetDateTime updatedAt;
}
