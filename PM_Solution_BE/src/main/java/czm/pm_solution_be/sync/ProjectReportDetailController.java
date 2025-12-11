package czm.pm_solution_be.sync;

import czm.pm_solution_be.web.ApiException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
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
                           String issueWebUrl,
                           String humanTimeEstimate,
                           List<IssueInternHours> internHours) {}

    public record ProjectReportDetailResponse(List<InternSummary> interns, List<IssueRow> issues) {}

    public record InternOpenIssue(long repositoryId,
                                  String repositoryName,
                                  Long issueId,
                                  Long issueIid,
                                  String issueTitle,
                                  String issueWebUrl,
                                  String humanTimeEstimate,
                                  List<String> labels,
                                  String dueDate,
                                  String createdAt,
                                  Integer ageDays,
                                  long totalTimeSpentSeconds) {}

    public record ProjectReportInternIssueStats(long totalIssues,
                                                long closedIssues,
                                                long totalTimeSpentSeconds) {}

    public record ProjectReportInternDetailResponse(List<InternSummary> interns,
                                                    List<InternOpenIssue> issues,
                                                    ProjectReportInternIssueStats stats) {}

    public record ProjectLongTermReportMeta(Integer budget,
                                            LocalDate budgetFrom,
                                            LocalDate budgetTo,
                                            BigDecimal hourlyRate) {}

    public record ProjectLongTermReportMonth(OffsetDateTime monthStart,
                                             BigDecimal hours,
                                             BigDecimal cost,
                                             BigDecimal cumulativeHours,
                                             BigDecimal cumulativeCost,
                                             BigDecimal burnRatio) {}

    public record ProjectLongTermReportResponse(ProjectLongTermReportMeta meta,
                                                 BigDecimal totalHours,
                                                 BigDecimal totalCost,
                                                 List<ProjectLongTermReportMonth> months) {}

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
                    row.issueWebUrl(),
                    row.issueHumanTimeEstimate()
            ));
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

    @GetMapping("/{projectId}/reports/intern-detail")
    public ProjectReportInternDetailResponse getProjectReportInternDetail(@PathVariable long projectId,
                                                                          @RequestParam(required = false)
                                                                          String internUsername) {
        String normalizedInternUsername = internUsername != null && !internUsername.isBlank()
                ? internUsername.trim()
                : null;

        List<SyncDao.ProjectInternRow> projectInternRows = dao.listProjectInterns(projectId);
        Map<Long, InternSummary> internMap = new LinkedHashMap<>();
        for (SyncDao.ProjectInternRow row : projectInternRows) {
            internMap.put(row.id(), new InternSummary(row.id(), row.username(), row.firstName(), row.lastName()));
        }

        List<InternOpenIssue> issues = List.of();
        ProjectReportInternIssueStats stats = null;
        if (normalizedInternUsername != null) {
            List<SyncDao.ProjectInternOpenIssueRow> rows =
                    dao.listProjectInternOpenIssues(projectId, normalizedInternUsername);
            issues = rows.stream()
                    .map(row -> new InternOpenIssue(
                            row.repositoryId(),
                            row.repositoryName(),
                            row.issueId(),
                            row.issueIid(),
                            row.issueTitle(),
                            normalizeBlank(row.issueWebUrl()),
                            normalizeBlank(row.issueHumanTimeEstimate()),
                            row.labels(),
                            row.dueDate() != null ? row.dueDate().toString() : null,
                            row.createdAt() != null ? row.createdAt().toString() : null,
                            calculateIssueAgeDays(row.createdAt()),
                            row.totalTimeSpentSeconds()))
                    .toList();

            stats = dao.findProjectInternIssueStats(projectId, normalizedInternUsername)
                    .map(row -> new ProjectReportInternIssueStats(
                            row.totalIssues(),
                            row.closedIssues(),
                            row.totalTimeSpentSeconds()))
                    .orElse(new ProjectReportInternIssueStats(0, 0, 0));
        }

        List<InternSummary> interns = new ArrayList<>(internMap.values());
        interns.sort(Comparator.comparing(InternSummary::lastName)
                .thenComparing(InternSummary::firstName)
                .thenComparing(InternSummary::username));

        return new ProjectReportInternDetailResponse(interns, issues, stats);
    }

    @GetMapping("/{projectId}/reports/long-term")
    public ProjectLongTermReportResponse getProjectLongTermReport(@PathVariable long projectId,
                                                                  @RequestParam(required = false) LocalDate from,
                                                                  @RequestParam(required = false) LocalDate to) {
        LocalDate today = OffsetDateTime.now(ZoneOffset.UTC).toLocalDate();
        LocalDate defaultFrom = today.with(TemporalAdjusters.firstDayOfYear());
        LocalDate defaultTo = today.with(TemporalAdjusters.lastDayOfYear());

        LocalDate fromDate = from != null ? from : defaultFrom;
        LocalDate toDate = to != null ? to : defaultTo;

        if (toDate.isBefore(fromDate)) {
            throw ApiException.validation("Datum \"Do\" nesmí být dříve než datum \"Od\".");
        }

        OffsetDateTime fromDateTime = fromDate.atStartOfDay().atOffset(ZoneOffset.UTC);
        OffsetDateTime toDateTime = toDate.plusDays(1).atStartOfDay().atOffset(ZoneOffset.UTC);

        SyncDao.ProjectRow project = dao.findProjectById(projectId)
                .orElseThrow(() -> ApiException.notFound("Projekt nebyl nalezen."));

        List<SyncDao.ProjectMonthlyReportRow> rows = dao.listProjectMonthlyReport(projectId, fromDateTime, toDateTime);

        BigDecimal cumulativeHours = BigDecimal.ZERO;
        BigDecimal cumulativeCost = BigDecimal.ZERO;
        BigDecimal budgetValue = project.budget() != null ? BigDecimal.valueOf(project.budget()) : null;

        List<ProjectLongTermReportMonth> months = new ArrayList<>(rows.size());
        for (SyncDao.ProjectMonthlyReportRow row : rows) {
            BigDecimal hours = row.hours() != null ? row.hours() : BigDecimal.ZERO;
            BigDecimal cost = row.cost() != null ? row.cost() : BigDecimal.ZERO;

            cumulativeHours = cumulativeHours.add(hours);
            cumulativeCost = cumulativeCost.add(cost);

            BigDecimal burnRatio = null;
            if (budgetValue != null && budgetValue.compareTo(BigDecimal.ZERO) > 0) {
                burnRatio = cumulativeCost.divide(budgetValue, 4, RoundingMode.HALF_UP);
            }

            months.add(new ProjectLongTermReportMonth(
                    row.monthStart(),
                    hours,
                    cost,
                    cumulativeHours,
                    cumulativeCost,
                    burnRatio
            ));
        }

        ProjectLongTermReportMeta meta = new ProjectLongTermReportMeta(
                project.budget(),
                project.budgetFrom(),
                project.budgetTo(),
                project.hourlyRateCzk()
        );

        return new ProjectLongTermReportResponse(
                meta,
                cumulativeHours,
                cumulativeCost,
                List.copyOf(months)
        );
    }

    private static class IssueRowBuilder {
        private final long repositoryId;
        private final String repositoryName;
        private final Long issueId;
        private final Long issueIid;
        private final String issueTitle;
        private final String issueWebUrl;
        private final String humanTimeEstimate;
        private final Map<Long, BigDecimal> hours = new LinkedHashMap<>();
        private final Map<Long, BigDecimal> costs = new LinkedHashMap<>();

        IssueRowBuilder(long repositoryId,
                        String repositoryName,
                        Long issueId,
                        Long issueIid,
                        String issueTitle,
                        String issueWebUrl,
                        String humanTimeEstimate) {
            this.repositoryId = repositoryId;
            this.repositoryName = repositoryName;
            this.issueId = issueId;
            this.issueIid = issueIid;
            this.issueTitle = (issueTitle == null || issueTitle.isBlank()) ? "Bez názvu" : issueTitle;
            this.issueWebUrl = normalizeBlank(issueWebUrl);
            this.humanTimeEstimate = normalizeBlank(humanTimeEstimate);
        }

        void addEntry(long internId, BigDecimal hoursValue, BigDecimal costValue) {
            if (hoursValue != null) {
                hours.merge(internId, hoursValue, BigDecimal::add);
            }
            if (costValue != null) {
                costs.merge(internId, costValue, BigDecimal::add);
            }
        }

        IssueRow build() {
            List<IssueInternHours> cells = hours.entrySet().stream()
                    .map(entry -> new IssueInternHours(entry.getKey(), entry.getValue(), costs.get(entry.getKey())))
                    .toList();
            return new IssueRow(repositoryId, repositoryName, issueId, issueIid, issueTitle, issueWebUrl, humanTimeEstimate, cells);
        }
    }

    private static String normalizeBlank(String value) {
        return (value == null || value.isBlank()) ? null : value;
    }

    private static Integer calculateIssueAgeDays(OffsetDateTime createdAt) {
        if (createdAt == null) {
            return null;
        }

        LocalDate createdDate = createdAt.toLocalDate();
        LocalDate today = OffsetDateTime.now(ZoneOffset.UTC).toLocalDate();
        long diff = ChronoUnit.DAYS.between(createdDate, today);

        if (diff < 0) {
            diff = 0;
        }

        if (diff > Integer.MAX_VALUE) {
            return Integer.MAX_VALUE;
        }

        return (int) diff;
    }
}

