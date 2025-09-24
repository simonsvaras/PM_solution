package czm.pm_solution_be.sync.jobs;

import czm.pm_solution_be.sync.dto.SyncSummary;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/sync")
public class SyncJobController {
    private final SyncJobService jobs;

    public SyncJobController(SyncJobService jobs) { this.jobs = jobs; }

    public static class StartResponse { public String jobId; }
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
    public ResponseEntity<StartResponse> startIssuesAsync(@RequestParam(defaultValue = "false") boolean full) {
        String id = jobs.startIssuesAll(full);
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
