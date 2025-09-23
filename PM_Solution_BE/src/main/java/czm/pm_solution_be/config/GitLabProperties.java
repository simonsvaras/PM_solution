package czm.pm_solution_be.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "gitlab")
public class GitLabProperties {
    /** Base API URL, e.g. https://gitlab.fel.cvut.cz/api/v4 */
    private String api;
    /** Private token for GitLab (header PRIVATE-TOKEN) */
    private String token;
    /** Optional parent Group ID – if set, project sync is limited to this group (and subgroups). */
    private Long groupId;
    /** Request timeout ms */
    private int timeoutMs = 10_000;
    /** Max retries on 429/5xx */
    private int retryMax = 3;
    /** Backoff in ms between retries */
    private int retryBackoffMs = 500;
    /** Page size for GitLab pagination */
    private int perPage = 100;

    public String getApi() { return api; }
    public void setApi(String api) { this.api = api; }
    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public Long getGroupId() { return groupId; }
    public void setGroupId(Long groupId) { this.groupId = groupId; }
    public int getTimeoutMs() { return timeoutMs; }
    public void setTimeoutMs(int timeoutMs) { this.timeoutMs = timeoutMs; }
    public int getRetryMax() { return retryMax; }
    public void setRetryMax(int retryMax) { this.retryMax = retryMax; }
    public int getRetryBackoffMs() { return retryBackoffMs; }
    public void setRetryBackoffMs(int retryBackoffMs) { this.retryBackoffMs = retryBackoffMs; }
    public int getPerPage() { return perPage; }
    public void setPerPage(int perPage) { this.perPage = perPage; }
}
