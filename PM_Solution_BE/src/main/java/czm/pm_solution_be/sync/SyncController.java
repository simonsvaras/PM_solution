package czm.pm_solution_be.sync;

import czm.pm_solution_be.sync.dto.SyncSummary;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpStatusCodeException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sync")
public class SyncController {
    private static final Logger log = LoggerFactory.getLogger(SyncController.class);

    private final ProjectSyncService projectSyncService;
    private final IssueSyncService issueSyncService;
    private final NoteSyncService noteSyncService;

    public SyncController(ProjectSyncService projectSyncService, IssueSyncService issueSyncService, NoteSyncService noteSyncService) {
        this.projectSyncService = projectSyncService;
        this.issueSyncService = issueSyncService;
        this.noteSyncService = noteSyncService;
    }

    public record ProjectsRequest(List<Long> projectIds) {}

    @PostMapping("/projects")
    public SyncSummary syncProjects(@RequestBody(required = false) ProjectsRequest req) {
        long start = System.currentTimeMillis();
        List<Long> ids = req != null ? req.projectIds : null;
        SyncSummary s = projectSyncService.syncAllProjects(ids);
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

    @PostMapping("/projects/{projectId}/notes")
    public SyncSummary syncNotes(@PathVariable long projectId,
                                 @RequestParam(required = false)
                                 @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since) {
        long start = System.currentTimeMillis();
        SyncSummary s = noteSyncService.syncProjectNotes(projectId, since);
        s.durationMs = System.currentTimeMillis() - start;
        return s;
    }

    @PostMapping("/projects/{projectId}/issues/{iid}/notes")
    public SyncSummary syncIssueNotes(@PathVariable long projectId,
                                      @PathVariable long iid,
                                      @RequestParam(required = false)
                                      @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since) {
        long start = System.currentTimeMillis();
        SyncSummary s = noteSyncService.syncSingleIssueNotes(projectId, iid, since);
        s.durationMs = System.currentTimeMillis() - start;
        return s;
    }

    // Aggregator: MVP runs Issues -> Notes only
    public static class StepAggregate {
        public String status; // OK | ERROR | SKIPPED
        public Integer fetched;
        public Integer inserted;
        public Integer updated;
        public Integer skipped;
        public Integer pages;
        public Long durationMs;
        public ErrorResponse.ErrorBody error;
    }

    public static class AllResult {
        public StepAggregate projects; // SKIPPED in MVP
        public StepAggregate issues;
        public StepAggregate notes;
        public long durationMs;
    }

    @PostMapping("/projects/{projectId}/all")
    public AllResult syncAll(@PathVariable long projectId,
                             @RequestParam(defaultValue = "false") boolean full,
                             @RequestParam(required = false)
                             @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since) {
        long allStart = System.currentTimeMillis();
        AllResult ar = new AllResult();
        // projects step skipped in MVP
        StepAggregate proj = new StepAggregate();
        proj.status = "SKIPPED";
        ar.projects = proj;

        // Issues
        StepAggregate issues = new StepAggregate();
        long st = System.currentTimeMillis();
        try {
            SyncSummary s = issueSyncService.syncProjectIssues(projectId, full);
            issues.status = "OK";
            issues.fetched = s.fetched; issues.inserted = s.inserted; issues.updated = s.updated; issues.skipped = s.skipped; issues.pages = s.pages; issues.durationMs = System.currentTimeMillis() - st;
        } catch (Exception ex) {
            issues.status = "ERROR";
            issues.error = ErrorResponse.fromException(ex).error;
            issues.durationMs = System.currentTimeMillis() - st;
        }
        ar.issues = issues;

        // Notes
        StepAggregate notes = new StepAggregate();
        st = System.currentTimeMillis();
        try {
            SyncSummary s = noteSyncService.syncProjectNotes(projectId, since);
            notes.status = "OK";
            notes.fetched = s.fetched; notes.inserted = s.inserted; notes.updated = s.updated; notes.skipped = s.skipped; notes.pages = s.pages; notes.durationMs = System.currentTimeMillis() - st;
        } catch (Exception ex) {
            notes.status = "ERROR";
            notes.error = ErrorResponse.fromException(ex).error;
            notes.durationMs = System.currentTimeMillis() - st;
        }
        ar.notes = notes;
        ar.durationMs = System.currentTimeMillis() - allStart;
        return ar;
    }

    // Local utility error builder used in aggregator
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
            if (ex instanceof HttpStatusCodeException h) {
                int http = h.getStatusCode().value();
                if (http == 429) { er.error.code = "RATE_LIMITED"; er.error.httpStatus = 503; er.error.message = "GitLab rate limit, retry later"; }
                else if (http == 404) { er.error.code = "NOT_FOUND"; er.error.httpStatus = 404; er.error.message = "Projekt nebo issue nebylo nalezeno."; }
                else if (http >= 500) { er.error.code = "GITLAB_UNAVAILABLE"; er.error.httpStatus = 502; er.error.message = "GitLab je teď nedostupný. Zkuste to prosím znovu."; }
                else { er.error.code = "BAD_REQUEST"; er.error.httpStatus = 400; er.error.message = "Neplatný požadavek."; }
                er.error.details = truncate(h.getResponseBodyAsString(), 500);
                er.error.requestId = h.getResponseHeaders() != null ? h.getResponseHeaders().getFirst("X-Request-Id") : null;
            } else if (ex instanceof IllegalArgumentException) {
                er.error.code = "BAD_REQUEST"; er.error.httpStatus = 400; er.error.message = ex.getMessage();
            } else {
                er.error.code = "UNKNOWN"; er.error.httpStatus = 500; er.error.message = "Nastala neočekávaná chyba.";
                er.error.details = ex.getMessage();
            }
            return er;
        }
    }
    private static String truncate(String s, int max) { if (s == null) return null; return s.length() <= max ? s : s.substring(0, max) + "..."; }
}
