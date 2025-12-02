package czm.pm_solution_be.sync.jobs;

import czm.pm_solution_be.sync.dto.SyncSummary;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api/sync")
public class SyncJobController {
    private final SyncJobService jobs;

    public SyncJobController(SyncJobService jobs) { this.jobs = jobs; }

    public static class StartResponse { public String jobId; }
    public static class ProjectReportRequest {
        public boolean sinceLast;
        public OffsetDateTime from;
        public OffsetDateTime to;
    }
    public static class JobStatusResponse {
        public String jobId;
        public String status; // RUNNING | DONE | ERROR
        public SyncSummary result; // present when DONE
        public Map<String, String> error; // present when ERROR
        public Integer totalRepos;
        public Integer processedRepos;
        public Long currentRepoId;
    }

    @PostMapping("/issues/async")
    public ResponseEntity<StartResponse> startIssuesAsync(@RequestParam(defaultValue = "false") boolean full,
                                                          @RequestParam(defaultValue = "false") boolean assignedOnly) {
        String id = jobs.startIssuesAll(full, assignedOnly);
        StartResponse r = new StartResponse();
        r.jobId = id;
        return ResponseEntity.accepted().body(r);
    }

    @PostMapping("/projects/{projectId}/reports/async")
    public ResponseEntity<StartResponse> startProjectReportsAsync(@PathVariable long projectId,
                                                                  @RequestBody(required = false) ProjectReportRequest request) {
        boolean sinceLast = request != null && request.sinceLast;
        OffsetDateTime from = request != null ? request.from : null;
        OffsetDateTime to = request != null ? request.to : null;
        if (sinceLast) {
            from = null;
        }
        String id = jobs.startProjectReports(projectId, from, to, sinceLast);
        StartResponse r = new StartResponse();
        r.jobId = id;
        return ResponseEntity.accepted().body(r);
    }

    @GetMapping("/jobs/{id}")
    public ResponseEntity<JobStatusResponse> getJob(@PathVariable String id) {
        SyncJobService.Job j = jobs.getJob(id);
        if (j == null) return ResponseEntity.notFound().build();
        JobStatusResponse r = new JobStatusResponse();
        r.jobId = j.id;
        r.status = j.status;
        r.result = j.result;
        r.totalRepos = j.totalRepos;
        r.processedRepos = j.processedRepos;
        r.currentRepoId = j.currentRepoId;
        if ("ERROR".equals(j.status)) {
            r.error = Map.of(
                    "code", j.errorCode != null ? j.errorCode : "UNKNOWN",
                    "message", j.errorMessage != null ? j.errorMessage : "Neznámá chyba"
            );
        }
        return ResponseEntity.ok(r);
    }
}
