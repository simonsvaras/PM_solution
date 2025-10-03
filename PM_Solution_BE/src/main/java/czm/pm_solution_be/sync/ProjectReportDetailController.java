package czm.pm_solution_be.sync;

import czm.pm_solution_be.web.ApiException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/projects")
public class ProjectReportDetailController {
    private final SyncDao dao;

    public ProjectReportDetailController(SyncDao dao) {
        this.dao = dao;
    }

    public record InternSummary(long id, String username, String firstName, String lastName) {}

    public record IssueInternHours(long internId, BigDecimal hours, BigDecimal cost) {}

    public record IssueRow(long repositoryId,
                           String repositoryName,
                           Long issueId,
                           Long issueIid,
                           String issueTitle,
                           String assigneeUsername,
                           List<String> labels,
                           List<IssueInternHours> internHours) {}

    public record ProjectReportDetailResponse(List<InternSummary> interns, List<IssueRow> issues) {}

    @GetMapping("/{projectId}/reports/detail")
    public ProjectReportDetailResponse getProjectReportDetail(@PathVariable long projectId,
                                                              @RequestParam(required = false) OffsetDateTime from,
                                                              @RequestParam(required = false) OffsetDateTime to,
                                                              @RequestParam(required = false) String internUsername) {
        if (from != null && to != null && to.isBefore(from)) {
            throw ApiException.validation("Datum \"Do\" nesmí být dříve než datum \"Od\".");
        }

        String normalizedInternUsername = internUsername != null && !internUsername.isBlank() ? internUsername.trim() : null;

        List<SyncDao.ProjectInternRow> projectInternRows = dao.listProjectInterns(projectId);
        Map<Long, InternSummary> internMap = new LinkedHashMap<>();
        for (SyncDao.ProjectInternRow row : projectInternRows) {
            internMap.put(row.id(), new InternSummary(row.id(), row.username(), row.firstName(), row.lastName()));
        }

        List<SyncDao.ProjectReportDetailRow> rows = dao.listProjectReportDetail(projectId, from, to, normalizedInternUsername);

        Map<String, IssueRowBuilder> issueMap = new LinkedHashMap<>();

        for (SyncDao.ProjectReportDetailRow row : rows) {
            internMap.computeIfAbsent(row.internId(), id -> new InternSummary(
                    row.internId(),
                    row.internUsername(),
                    row.internFirstName(),
                    row.internLastName()
            ));

            String key = row.repositoryId() + "::" + (row.issueId() != null ? row.issueId() : "_") + "::" +
                    (row.issueIid() != null ? row.issueIid() : "_");
            IssueRowBuilder builder = issueMap.computeIfAbsent(key, k -> new IssueRowBuilder(
                    row.repositoryId(),
                    row.repositoryName(),
                    row.issueId(),
                    row.issueIid(),
                    row.issueTitle(),
                    row.issueAssigneeUsername(),
                    row.issueLabels()
            ));
            builder.updateMetadata(row.issueAssigneeUsername(), row.issueLabels());
            builder.addEntry(row.internId(), row.hours(), row.cost());
        }

        List<InternSummary> interns = new ArrayList<>(internMap.values());
        interns.sort(Comparator.comparing(InternSummary::lastName)
                .thenComparing(InternSummary::firstName)
                .thenComparing(InternSummary::username));

        List<IssueRow> issues = issueMap.values().stream()
                .map(IssueRowBuilder::build)
                .toList();

        return new ProjectReportDetailResponse(interns, issues);
    }

    private static class IssueRowBuilder {
        private final long repositoryId;
        private final String repositoryName;
        private final Long issueId;
        private final Long issueIid;
        private final String issueTitle;
        private final Map<Long, BigDecimal> hours = new LinkedHashMap<>();
        private final Map<Long, BigDecimal> costs = new LinkedHashMap<>();
        private String assigneeUsername;
        private List<String> labels;

        IssueRowBuilder(long repositoryId,
                        String repositoryName,
                        Long issueId,
                        Long issueIid,
                        String issueTitle,
                        String assigneeUsername,
                        List<String> labels) {
            this.repositoryId = repositoryId;
            this.repositoryName = repositoryName;
            this.issueId = issueId;
            this.issueIid = issueIid;
            this.issueTitle = (issueTitle == null || issueTitle.isBlank()) ? "Bez názvu" : issueTitle;
            updateMetadata(assigneeUsername, labels);
        }

        void addEntry(long internId, BigDecimal hoursValue, BigDecimal costValue) {
            if (hoursValue != null) {
                hours.merge(internId, hoursValue, BigDecimal::add);
            }
            if (costValue != null) {
                costs.merge(internId, costValue, BigDecimal::add);
            }
        }

        void updateMetadata(String assigneeUsername, List<String> labels) {
            if (this.assigneeUsername == null && assigneeUsername != null && !assigneeUsername.isBlank()) {
                this.assigneeUsername = assigneeUsername.trim();
            }
            if ((this.labels == null || this.labels.isEmpty()) && labels != null && !labels.isEmpty()) {
                this.labels = List.copyOf(labels);
            }
        }

        IssueRow build() {
            List<IssueInternHours> cells = hours.entrySet().stream()
                    .map(entry -> new IssueInternHours(entry.getKey(), entry.getValue(), costs.get(entry.getKey())))
                    .toList();
            List<String> metadataLabels = labels == null ? List.of() : List.copyOf(labels);
            return new IssueRow(repositoryId, repositoryName, issueId, issueIid, issueTitle, assigneeUsername, metadataLabels, cells);
        }
    }
}

