package czm.pm_solution_be.gitlab.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.OffsetDateTime;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class GitLabIssue {
    public long id;       // global id
    public long iid;      // per-project
    public String title;
    public String state;
    public String description;
    @JsonProperty("due_date")
    public String dueDate; // YYYY-MM-DD or null
    @JsonProperty("created_at")
    public OffsetDateTime createdAt;
    @JsonProperty("updated_at")
    public OffsetDateTime updatedAt;
    @JsonProperty("time_stats")
    public TimeStats timeStats;
    public List<Assignee> assignees;
    public List<String> labels;
    public Author author;
    public Milestone milestone;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TimeStats {
        @JsonProperty("time_estimate")
        public Integer timeEstimate; // seconds
        @JsonProperty("total_time_spent")
        public Integer totalTimeSpent; // seconds
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Assignee {
        public Long id;
        public String username;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Author {
        public String name;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Milestone {
        public String title;
        public String state;
    }
}

