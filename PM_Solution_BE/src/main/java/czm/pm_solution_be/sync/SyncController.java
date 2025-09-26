package czm.pm_solution_be.sync;

import czm.pm_solution_be.sync.dto.SyncSummary;
import io.swagger.v3.oas.annotations.Hidden;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;

@RestController
@RequestMapping("/api/sync")
public class SyncController {
    private static final String UNSUPPORTED_MESSAGE = "Synchronizace projektu ani notes neni podporovana, projekty a notes spravujte pouze v aplikaci.";

    private final IssueSyncService issueSyncService;
    private final RepositorySyncService repositorySyncService;
    private final ReportSyncService reportSyncService;

    public SyncController(IssueSyncService issueSyncService, RepositorySyncService repositorySyncService, ReportSyncService reportSyncService) {
        this.issueSyncService = issueSyncService;
        this.repositorySyncService = repositorySyncService;
        this.reportSyncService = reportSyncService;
    }

    @Deprecated
    @Hidden
    @PostMapping("/projects")
    public void syncProjectsUnsupported() {
        throw unsupported();
    }

    @Deprecated
    @Hidden
    @PostMapping("/projects/{projectId}/notes")
    public void syncNotesUnsupported(@PathVariable long projectId) {
        throw unsupported();
    }

    @Deprecated
    @Hidden
    @PostMapping("/projects/{projectId}/issues/{iid}/notes")
    public void syncIssueNotesUnsupported(@PathVariable long projectId, @PathVariable long iid) {
        throw unsupported();
    }

    @PostMapping("/repositories")
    public SyncSummary syncRepositoriesAll() {
        long start = System.currentTimeMillis();
        SyncSummary s = repositorySyncService.syncAllRepositories();
        s.durationMs = System.currentTimeMillis() - start;
        return s;
    }

    @PostMapping("/projects/{projectId}/repositories")
    public SyncSummary syncRepositories(@PathVariable long projectId) {
        long start = System.currentTimeMillis();
        SyncSummary s = repositorySyncService.syncProjectRepositories(projectId);
        s.durationMs = System.currentTimeMillis() - start;
        return s;
    }

    @PostMapping("/projects/{projectId}/issues")
    public SyncSummary syncIssues(@PathVariable long projectId, @RequestParam(defaultValue = "false") boolean full) {
        long start = System.currentTimeMillis();
        SyncSummary s = issueSyncService.syncProjectIssues(projectId, full);
        s.durationMs = System.currentTimeMillis() - start;
        return s;
    }

    public static class ProjectReportSyncRequest {
        public boolean sinceLast;
        public OffsetDateTime from;
        public OffsetDateTime to;
    }

    @PostMapping("/projects/{projectId}/reports")
    public SyncSummary syncProjectReports(@PathVariable long projectId,
                                          @RequestBody(required = false) ProjectReportSyncRequest request) {
        long start = System.currentTimeMillis();
        boolean sinceLast = request != null && request.sinceLast;
        OffsetDateTime from = request != null ? request.from : null;
        OffsetDateTime to = request != null ? request.to : null;
        if (sinceLast) {
            from = null;
        }
        SyncSummary summary = reportSyncService.syncProjectReports(projectId, from, to, sinceLast);
        summary.durationMs = System.currentTimeMillis() - start;
        return summary;
    }

    public static class StepAggregate {
        public String status; // OK | ERROR
        public Integer fetched;
        public Integer inserted;
        public Integer updated;
        public Integer skipped;
        public Integer pages;
        public Long durationMs;
        public ErrorResponse.ErrorBody error;
    }

    public static class AllResult {
        public StepAggregate issues;
        public long durationMs;
    }

    @PostMapping("/projects/{projectId}/all")
    public AllResult syncAll(@PathVariable long projectId,
                             @RequestParam(defaultValue = "false") boolean full,
                             @RequestParam(required = false)
                             @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since,
                             @RequestParam(required = false) String notes,
                             @RequestParam(required = false) String projects) {
        if (notes != null || projects != null) {
            throw unsupported();
        }
        long allStart = System.currentTimeMillis();
        AllResult ar = new AllResult();

        StepAggregate issues = new StepAggregate();
        long st = System.currentTimeMillis();
        try {
            SyncSummary s = issueSyncService.syncProjectIssues(projectId, full);
            issues.status = "OK";
            issues.fetched = s.fetched;
            issues.inserted = s.inserted;
            issues.updated = s.updated;
            issues.skipped = s.skipped;
            issues.pages = s.pages;
            issues.durationMs = System.currentTimeMillis() - st;
        } catch (Exception ex) {
            issues.status = "ERROR";
            issues.error = ErrorResponse.fromException(ex).error;
            issues.durationMs = System.currentTimeMillis() - st;
        }
        ar.issues = issues;
        ar.durationMs = System.currentTimeMillis() - allStart;
        return ar;
    }

    // New global Issues sync (no project selection)
    @PostMapping("/issues")
    public SyncSummary syncIssuesAll(@RequestParam(defaultValue = "false") boolean full,
                                     @RequestParam(defaultValue = "false") boolean assignedOnly) {
        long start = System.currentTimeMillis();
        SyncSummary s = issueSyncService.syncAllIssues(full, assignedOnly);
        s.durationMs = System.currentTimeMillis() - start;
        return s;
    }

    // Aggregated ALL for global run (currently only issues)
    @PostMapping("/all")
    public AllResult syncAllGlobal(@RequestParam(defaultValue = "false") boolean full,
                                   @RequestParam(defaultValue = "false") boolean assignedOnly,
                                   @RequestParam(required = false)
                                   @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since) {
        long allStart = System.currentTimeMillis();
        AllResult ar = new AllResult();

        StepAggregate issues = new StepAggregate();
        long st = System.currentTimeMillis();
        try {
            SyncSummary s = issueSyncService.syncAllIssues(full, assignedOnly);
            issues.status = "OK";
            issues.fetched = s.fetched;
            issues.inserted = s.inserted;
            issues.updated = s.updated;
            issues.skipped = s.skipped;
            issues.pages = s.pages;
            issues.durationMs = System.currentTimeMillis() - st;
        } catch (Exception ex) {
            issues.status = "ERROR";
            issues.error = ErrorResponse.fromException(ex).error;
            issues.durationMs = System.currentTimeMillis() - st;
        }
        ar.issues = issues;
        ar.durationMs = System.currentTimeMillis() - allStart;
        return ar;
    }

    public static class ErrorResponse {
        public ErrorBody error;
        public static class ErrorBody {
            public String code;
            public String message;
            public String details;
            public int httpStatus;
            public String requestId;
        }
        public static ErrorResponse fromException(Exception ex) {
            ErrorResponse er = new ErrorResponse();
            er.error = new ErrorBody();
            if (ex instanceof org.springframework.web.client.HttpStatusCodeException h) {
                int http = h.getStatusCode().value();
                if (http == 429) {
                    er.error.code = "RATE_LIMITED";
                    er.error.httpStatus = 503;
                    er.error.message = "GitLab rate limit, retry later";
                } else if (http == 404) {
                    er.error.code = "NOT_FOUND";
                    er.error.httpStatus = 404;
                    er.error.message = "Projekt nebo issue nebylo nalezeno.";
                } else if (http >= 500) {
                    er.error.code = "GITLAB_UNAVAILABLE";
                    er.error.httpStatus = 502;
                    er.error.message = "GitLab je ted nedostupny. Zkuste to prosim znovu.";
                } else {
                    er.error.code = "BAD_REQUEST";
                    er.error.httpStatus = 400;
                    er.error.message = "Neplatny pozadavek.";
                }
                er.error.details = truncate(h.getResponseBodyAsString(), 500);
                er.error.requestId = h.getResponseHeaders() != null ? h.getResponseHeaders().getFirst("X-Request-Id") : null;
            } else if (ex instanceof IllegalArgumentException) {
                er.error.code = "BAD_REQUEST";
                er.error.httpStatus = 400;
                er.error.message = ex.getMessage();
            } else {
                er.error.code = "UNKNOWN";
                er.error.httpStatus = 500;
                er.error.message = "Nastala neocekavana chyba.";
                er.error.details = ex.getMessage();
            }
            return er;
        }
    }

    private static IllegalArgumentException unsupported() {
        return new IllegalArgumentException(UNSUPPORTED_MESSAGE);
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max) + "...";
    }
}
