package czm.pm_solution_be.gitlab.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class GitLabProject {
    public long id;
    public String name;
    @JsonProperty("path_with_namespace")
    public String pathWithNamespace;
    public Namespace namespace;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Namespace {
        public Long id;
        public String name;
    }
}
