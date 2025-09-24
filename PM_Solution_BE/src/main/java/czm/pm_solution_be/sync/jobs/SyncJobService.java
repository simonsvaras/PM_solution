package czm.pm_solution_be.sync.jobs;

import czm.pm_solution_be.sync.IssueSyncService;
import czm.pm_solution_be.sync.dto.SyncSummary;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
public class SyncJobService {
    public static class Job {
        public final String id;
        public volatile String status; // RUNNING | DONE | ERROR
        public volatile SyncSummary result;
        public volatile String errorCode;
        public volatile String errorMessage;
        public final long startedAt;
        public volatile Long finishedAt;
        public volatile Integer totalRepos;
        public volatile Integer processedRepos;
        public volatile Long currentRepoId;
        public Job(String id) { this.id = id; this.status = "RUNNING"; this.startedAt = System.currentTimeMillis(); }
    }

    private final Map<String, Job> jobs = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    private final IssueSyncService issueSyncService;

    public SyncJobService(IssueSyncService issueSyncService) {
        this.issueSyncService = issueSyncService;
    }

    public String startIssuesAll(boolean full) {
        String id = UUID.randomUUID().toString();
        Job job = new Job(id);
        jobs.put(id, job);
        executor.submit(() -> {
            try {
                SyncSummary s = issueSyncService.syncAllIssues(full, new IssueSyncService.ProgressListener() {
                    @Override public void onStart(int totalRepos) {
                        job.totalRepos = totalRepos;
                        job.processedRepos = 0;
                    }
                    @Override public void onRepoDone(int processedRepos, long gitlabRepoId, SyncSummary repoSummary) {
                        job.processedRepos = processedRepos;
                        job.currentRepoId = gitlabRepoId;
                    }
                });
                job.result = s;
                job.status = "DONE";
            } catch (Exception ex) {
                job.status = "ERROR";
                job.errorCode = "UNKNOWN";
                job.errorMessage = ex.getMessage();
            } finally {
                job.finishedAt = System.currentTimeMillis();
            }
        });
        return id;
    }

    public Job getJob(String id) {
        return jobs.get(id);
    }
}
