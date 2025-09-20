package czm.pm_solution_be.gitlab.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class GitLabProject {
    public long id;
    public String name;
    @JsonProperty("path_with_namespace")
    public String pathWithNamespace;

    // Optional nested namespace info when using project detail
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Namespace {
        public long id;
        public String name;
        @JsonProperty("full_path")
        public String fullPath;
    }

    public Namespace namespace;
}

