package czm.pm_solution_be.sync;

import czm.pm_solution_be.gitlab.GitLabClient;
import czm.pm_solution_be.gitlab.dto.GitLabIssue;
import czm.pm_solution_be.sync.dto.SyncSummary;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.List;

@Service
public class IssueSyncService {
    private static final Logger log = LoggerFactory.getLogger(IssueSyncService.class);
    private final GitLabClient gitlab;
    private final SyncDao dao;
    private final RepositorySyncService repoSyncService;
    private final TransactionTemplate txTemplate;

    public IssueSyncService(GitLabClient gitlab, SyncDao dao, PlatformTransactionManager tm, RepositorySyncService repoSyncService) {
        this.gitlab = gitlab;
        this.dao = dao;
        this.repoSyncService = repoSyncService;
        this.txTemplate = new TransactionTemplate(tm);
    }

    public SyncSummary syncProjectIssues(long gitlabProjectId, boolean full) {
        // Ensure repository exists locally
        Long repositoryId = dao.findRepositoryIdByGitLabRepoId(gitlabProjectId).orElse(null);
        if (repositoryId == null) {
            // Try to create it from GitLab
            repoSyncService.syncProjectRepositories(gitlabProjectId);
            repositoryId = dao.findRepositoryIdByGitLabRepoId(gitlabProjectId).orElse(null);
        }
        if (repositoryId == null) {
            throw new IllegalArgumentException("Repository not found locally: " + gitlabProjectId);
        }

        log.info("Starting issues sync repo={} full={}", gitlabProjectId, full);
        OffsetDateTime updatedAfter = null;
        if (!full) {
            updatedAfter = dao.getRepoCursor(repositoryId, "issues").orElse(null);
        }

        SyncSummary summary = new SyncSummary();
        Integer page = 1;
        while (true) {
            GitLabClient.PageResult<GitLabIssue> pageRes = gitlab.listIssuesPage(gitlabProjectId, page, updatedAfter);
            List<GitLabIssue> issues = pageRes.data;
            if (issues.isEmpty() && (page == null || page == 1)) break;
            summary.addFetched(issues.size()).addPage();

            Long repoIdSnapshot = repositoryId;
            txTemplate.executeWithoutResult(status -> {
                for (GitLabIssue is : issues) {
                    String assigneeUsername = (is.assignees != null && !is.assignees.isEmpty()) ? is.assignees.get(0).username : null;
                    Long assigneeId = (is.assignees != null && !is.assignees.isEmpty()) ? is.assignees.get(0).id : null;
                    String[] labels = is.labels == null ? null : is.labels.toArray(new String[0]);
                    var upsert = dao.upsertIssueByRepo(
                            repoIdSnapshot,
                            is.id,
                            is.iid,
                            is.title,
                            is.state,
                            assigneeId,
                            assigneeUsername,
                            is.author != null ? is.author.name : null,
                            labels,
                            is.timeStats != null ? is.timeStats.timeEstimate : null,
                            is.timeStats != null ? is.timeStats.totalTimeSpent : null,
                            is.milestone != null ? is.milestone.title : null,
                            is.milestone != null ? is.milestone.state : null,
                            is.dueDate,
                            is.createdAt,
                            is.updatedAt,
                            is.webUrl,
                            is.timeStats != null ? is.timeStats.humanTimeEstimate : null
                    );
                    if (upsert.inserted) summary.addInserted(1); else summary.addUpdated(1);
                }
            });

            if (pageRes.nextPage == null || pageRes.nextPage.isEmpty()) break;
            page = Integer.parseInt(pageRes.nextPage);
        }
        if (!full) {
            dao.upsertRepoCursor(repositoryId, "issues", OffsetDateTime.now());
        }
        log.info("Issues sync done: repo={} fetched={} pages={}", gitlabProjectId, summary.fetched, summary.pages);
        return summary;
    }

    public interface ProgressListener {
        void onStart(int totalRepos);
        void onRepoDone(int processedRepos, long gitlabRepoId, SyncSummary repoSummary);
    }

    public SyncSummary syncAllIssues(boolean full, boolean assignedOnly) {
        return syncAllIssues(full, assignedOnly, null);
    }

    public SyncSummary syncAllIssues(boolean full, boolean assignedOnly, ProgressListener progress) {
        // Refresh repositories from the configured CZM group
        repoSyncService.syncAllRepositories();

        var repoIds = assignedOnly ? dao.listAssignedGitLabRepositoryIds() : dao.listAllGitLabRepositoryIds();
        if (progress != null) progress.onStart(repoIds.size());

        SyncSummary total = new SyncSummary();
        int processed = 0;
        for (Long gitlabRepoId : repoIds) {
            SyncSummary s = syncProjectIssues(gitlabRepoId, full);
            total.addFetched(s.fetched);
            total.addInserted(s.inserted);
            total.addUpdated(s.updated);
            total.addSkipped(s.skipped);
            total.pages += s.pages;
            processed++;
            if (progress != null) progress.onRepoDone(processed, gitlabRepoId, s);
        }
        return total;
    }
}
