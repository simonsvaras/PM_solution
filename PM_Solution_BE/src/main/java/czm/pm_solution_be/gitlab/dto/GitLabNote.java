package czm.pm_solution_be.gitlab.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.OffsetDateTime;

@JsonIgnoreProperties(ignoreUnknown = true)
public class GitLabNote {
    public long id;
    public String body;
    public boolean system;
    @JsonProperty("created_at")
    public OffsetDateTime createdAt;
    public Author author;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Author {
        public String username;
    }
}

