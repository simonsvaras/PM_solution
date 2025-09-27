package czm.pm_solution_be.gitlab;

import czm.pm_solution_be.config.GitLabProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Thin wrapper around the GitLab GraphQL API that exposes only the pieces of
 * functionality the project currently needs.  The client focuses on the
 * {@code timelogs} connection because GitLab does not offer an equivalent REST
 * endpoint for the data we need while synchronising reports.
 */
@Component
public class GitLabGraphQlClient {
    private static final Logger log = LoggerFactory.getLogger(GitLabGraphQlClient.class);
    /**
     * GraphQL document used for fetching timelog entries.  The query is kept as
     * a raw string for readability and to make it obvious which arguments are
     * supported by the upstream schema.
     */
    private static final String TIMELOG_QUERY = """
            query ProjectTimelogsIssues(
              $projectId: ProjectID!,
              $from: Time!,
              $to: Time!,
              $first: Int = 100,
              $after: String
            ) {
              timelogs(
                projectId: $projectId
                startDate: $from
                endDate: $to
                first: $first
                after: $after
                sort: SPENT_AT_DESC
              ) {
                nodes {
                  timeSpent
                  spentAt
                  summary
                  user { username }
                  issue { iid }
                }
                pageInfo { hasNextPage endCursor }
              }
            }
            """;

    private final RestTemplate restTemplate;
    private final GitLabProperties props;

    public GitLabGraphQlClient(RestTemplate gitlabRestTemplate, GitLabProperties props) {
        this.restTemplate = gitlabRestTemplate;
        this.props = props;
    }

    /**
     * Fetches a single page of timelog entries from GitLab.
     *
     * @param projectGid GitLab "global ID" of the project (e.g. {@code gid://gitlab/Project/123})
     * @param from       lower bound (inclusive) for {@code spentAt}
     * @param to         upper bound (inclusive) for {@code spentAt}
     * @param afterCursor pagination cursor returned by the previous page; {@code null} for the first request
     * @param pageSize   number of records requested from GitLab
     * @return hydrated {@link TimelogPage} wrapper containing both the rows and page information
     */
    public TimelogPage fetchTimelogs(String projectGid, OffsetDateTime from, OffsetDateTime to, String afterCursor, int pageSize) {
        Map<String, Object> variables = new HashMap<>();
        variables.put("projectId", projectGid);
        variables.put("from", from);
        variables.put("to", to);
        variables.put("first", pageSize);
        if (afterCursor != null) {
            variables.put("after", afterCursor);
        }

        GraphQlRequest request = new GraphQlRequest(TIMELOG_QUERY, variables);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        URI uri = resolveGraphQlUri();

        try {
            ResponseEntity<GraphQlResponse<TimelogData>> resp = restTemplate.exchange(
                    uri,
                    org.springframework.http.HttpMethod.POST,
                    new HttpEntity<>(request, headers),
                    new ParameterizedTypeReference<>() {}
            );
            GraphQlResponse<TimelogData> body = resp.getBody();
            if (body == null) {
                throw new IllegalStateException("GitLab GraphQL returned empty body");
            }
            if (body.errors != null && !body.errors.isEmpty()) {
                String message = body.errors.stream().map(GraphQlError::message).filter(Objects::nonNull).findFirst()
                        .orElse("Neznámá chyba GraphQL");
                throw new IllegalStateException("GitLab GraphQL error: " + message);
            }
            if (body.data == null || body.data.timelogs == null) {
                throw new IllegalStateException("GitLab GraphQL response missing timelog data");
            }
            TimelogConnection connection = body.data.timelogs;
            return new TimelogPage(connection.nodes(), connection.pageInfo());
        } catch (HttpStatusCodeException ex) {
            log.warn("GraphQL {} body={} reqId={}", ex.getStatusCode().value(), truncate(ex.getResponseBodyAsString(), 500),
                    ex.getResponseHeaders() != null ? ex.getResponseHeaders().getFirst("X-Request-Id") : null);
            throw ex;
        }
    }

    /**
     * Turns the configured REST URL into the GraphQL endpoint.  GitLab exposes
     * the GraphQL API either at {@code /api/graphql} (if {@code /api/v4}
     * suffix is present) or {@code /graphql} relative to the instance root.
     */
    private URI resolveGraphQlUri() {
        String api = props.getApi();
        if (api == null || api.isBlank()) {
            throw new IllegalStateException("gitlab.api is not configured");
        }
        String graphql = api.replace("/api/v4", "/api/graphql");
        if (graphql.equals(api)) {
            // fallback if api doesn't contain /api/v4
            if (!graphql.endsWith("/")) {
                graphql += "/";
            }
            graphql += "graphql";
        }
        return URI.create(graphql);
    }

    private static String truncate(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max) + "...";
    }

    public record TimelogPage(List<TimelogNode> nodes, PageInfo pageInfo) { }

    public record PageInfo(boolean hasNextPage, String endCursor) { }

    public record TimelogNode(Double timeSpent, OffsetDateTime spentAt, String summary, TimelogUser user, TimelogIssue issue) { }

    public record TimelogUser(String username) { }

    public record TimelogIssue(Long iid) { }

    private record GraphQlRequest(String query, Map<String, Object> variables) { }

    private record GraphQlResponse<T>(T data, List<GraphQlError> errors) { }

    private record GraphQlError(String message) { }

    private record TimelogData(TimelogConnection timelogs) { }

    private record TimelogConnection(List<TimelogNode> nodes, PageInfo pageInfo) { }
}
