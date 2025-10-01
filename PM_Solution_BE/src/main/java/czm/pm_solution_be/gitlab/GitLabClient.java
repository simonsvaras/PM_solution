package czm.pm_solution_be.gitlab;

import czm.pm_solution_be.config.GitLabProperties;
import czm.pm_solution_be.gitlab.dto.GitLabIssue;
import czm.pm_solution_be.gitlab.dto.GitLabMilestone;
import czm.pm_solution_be.gitlab.dto.GitLabProject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;

@Component
public class GitLabClient {
    private static final Logger log = LoggerFactory.getLogger(GitLabClient.class);

    private final RestTemplate restTemplate;
    private final GitLabProperties props;

    public GitLabClient(RestTemplate gitlabRestTemplate, GitLabProperties props) {
        this.restTemplate = gitlabRestTemplate;
        this.props = props;
    }

    public static class PageResult<T> {
        public final List<T> data;
        public final int page;
        public final int totalPages;
        public final String nextPage;

        public PageResult(List<T> data, int page, int totalPages, String nextPage) {
            this.data = data;
            this.page = page;
            this.totalPages = totalPages;
            this.nextPage = nextPage;
        }
    }

    private <T> PageResult<T> getPage(String path, MultiValueMap<String, String> query, ParameterizedTypeReference<List<T>> type) {
        URI uri = UriComponentsBuilder.fromHttpUrl(props.getApi())
                .path(path)
                .queryParams(query)
                .build(true)
                .toUri();

        int attempt = 0;
        while (true) {
            try {
                ResponseEntity<List<T>> resp = restTemplate.exchange(uri, HttpMethod.GET, null, type);
                List<T> body = resp.getBody();
                if (body == null) body = Collections.emptyList();
                String next = header(resp, "X-Next-Page");
                int page = parseIntDefault(header(resp, "X-Page"), 0);
                int totalPages = parseIntDefault(header(resp, "X-Total-Pages"), 0);
                return new PageResult<>(body, page, totalPages, next);
            } catch (HttpStatusCodeException ex) {
                int status = ex.getStatusCode().value();
                String reqId = exceptionHeader(ex, "X-Request-Id");
                if ((status == 429 || status >= 500) && attempt < props.getRetryMax()) {
                    attempt++;
                    long backoff = (long) props.getRetryBackoffMs() * attempt;
                    log.warn("GitLab {} (reqId={}). Retrying in {}ms (attempt {}/{})", status, reqId, backoff, attempt, props.getRetryMax());
                    sleep(backoff);
                    continue;
                }
                log.warn("GitLab error {} (reqId={}) body={} path={}", status, reqId, truncate(ex.getResponseBodyAsString(), 500), path);
                throw ex;
            }
        }
    }

    private static int parseIntDefault(String s, int def) {
        try { return Integer.parseInt(s); } catch (Exception e) { return def; }
    }
    private static String header(ResponseEntity<?> resp, String name) {
        return resp.getHeaders().getFirst(name);
    }
    private static String exceptionHeader(HttpStatusCodeException ex, String name) {
        if (ex.getResponseHeaders() == null) return "";
        return ex.getResponseHeaders().getFirst(name);
    }
    private static String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "...";
    }
    private static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
    }

    public PageResult<GitLabIssue> listIssuesPage(long projectId, Integer page, OffsetDateTime updatedAfter) {
        MultiValueMap<String, String> q = new LinkedMultiValueMap<>();
        q.add("state", "all");
        q.add("per_page", String.valueOf(props.getPerPage()));
        if (page != null) q.add("page", String.valueOf(page));
        if (updatedAfter != null) q.add("updated_after", updatedAfter.toString());

        String path = "/projects/" + projectId + "/issues";
        return getPage(path, q, new ParameterizedTypeReference<List<GitLabIssue>>(){});
    }

    public GitLabProject getProject(long projectId) {
        URI uri = UriComponentsBuilder.fromHttpUrl(props.getApi())
                .path("/projects/{id}")
                .buildAndExpand(java.util.Map.of("id", projectId))
                .toUri();
        int attempt = 0;
        while (true) {
            try {
                return restTemplate.getForObject(uri, GitLabProject.class);
            } catch (HttpStatusCodeException ex) {
                int status = ex.getStatusCode().value();
                String reqId = exceptionHeader(ex, "X-Request-Id");
                if ((status == 429 || status >= 500) && attempt < props.getRetryMax()) {
                    attempt++;
                    long backoff = (long) props.getRetryBackoffMs() * attempt;
                    log.warn("GitLab {} (reqId={}). Retrying in {}ms (attempt {}/{})", status, reqId, backoff, attempt, props.getRetryMax());
                    sleep(backoff);
                    continue;
                }
                log.warn("GitLab error {} (reqId={}) body={} path=/projects/{id}", status, reqId, truncate(ex.getResponseBodyAsString(), 500));
                throw ex;
            }
        }
    }

    public PageResult<GitLabProject> listGroupProjectsPage(long groupId, Integer page) {
        MultiValueMap<String, String> q = new LinkedMultiValueMap<>();
        q.add("per_page", String.valueOf(props.getPerPage()));
        q.add("include_subgroups", "true");
        if (page != null) q.add("page", String.valueOf(page));
        String path = "/groups/" + groupId + "/projects";
        return getPage(path, q, new ParameterizedTypeReference<List<GitLabProject>>(){});
    }

    public PageResult<GitLabMilestone> listGroupMilestonesPage(long groupId, Integer page) {
        MultiValueMap<String, String> q = new LinkedMultiValueMap<>();
        q.add("per_page", String.valueOf(props.getPerPage()));
        q.add("state", "all");
        if (page != null) q.add("page", String.valueOf(page));

        String path = "/groups/" + groupId + "/milestones";
        return getPage(path, q, new ParameterizedTypeReference<List<GitLabMilestone>>(){});
    }
}