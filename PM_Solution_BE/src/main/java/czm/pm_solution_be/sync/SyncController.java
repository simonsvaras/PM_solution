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
        List<Long> ids = req != null ? req.projectIds : null;
        return projectSyncService.syncAllProjects(ids);
    }

    @PostMapping("/projects/{projectId}/issues")
    public SyncSummary syncIssues(@PathVariable long projectId, @RequestParam(defaultValue = "false") boolean full) {
        return issueSyncService.syncProjectIssues(projectId, full);
    }

    @PostMapping("/projects/{projectId}/notes")
    public SyncSummary syncNotes(@PathVariable long projectId,
                                 @RequestParam(required = false)
                                 @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since) {
        return noteSyncService.syncProjectNotes(projectId, since);
    }

    @PostMapping("/projects/{projectId}/issues/{iid}/notes")
    public SyncSummary syncIssueNotes(@PathVariable long projectId,
                                      @PathVariable long iid,
                                      @RequestParam(required = false)
                                      @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since) {
        return noteSyncService.syncSingleIssueNotes(projectId, iid, since);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(HttpStatusCodeException.class)
    public ResponseEntity<Map<String, String>> handleGitLabErrors(HttpStatusCodeException ex) {
        int code = ex.getStatusCode().value();
        String body = ex.getResponseBodyAsString();
        if (code == 429) {
            return ResponseEntity.status(503).body(Map.of("error", "rate limited", "gitlab", body));
        } else if (code >= 500) {
            return ResponseEntity.status(502).body(Map.of("error", "gitlab upstream error", "gitlab", body));
        } else if (code == 404) {
            return ResponseEntity.status(404).body(Map.of("error", "not found in gitlab"));
        }
        return ResponseEntity.status(code).body(Map.of("error", "gitlab error", "gitlab", body));
    }
}

