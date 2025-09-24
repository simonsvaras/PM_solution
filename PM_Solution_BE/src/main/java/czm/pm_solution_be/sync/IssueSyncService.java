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
    private final TransactionTemplate txTemplate;

    public IssueSyncService(GitLabClient gitlab, SyncDao dao, PlatformTransactionManager tm) {
        this.gitlab = gitlab;
        this.dao = dao;
        this.txTemplate = new TransactionTemplate(tm);
    }

    public SyncSummary syncProjectIssues(long gitlabProjectId, boolean full) {
        var maybeProjectId = dao.findProjectIdByGitLabId(gitlabProjectId);
        if (maybeProjectId.isEmpty()) {
            throw new IllegalArgumentException("Project not found locally: " + gitlabProjectId);
        }
        long projectId = maybeProjectId.get();

        Long repositoryId = dao.findRepositoryIdByGitLabRepoId(gitlabProjectId).orElse(null);

        log.info("Starting issues sync project={} full={}", gitlabProjectId, full);
        OffsetDateTime updatedAfter = null;
        if (!full) {
            updatedAfter = dao.getCursor(projectId, "issues").orElse(null);
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
                    var upsert = dao.upsertIssue(
                            projectId,
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
                            is.dueDate,
                            is.updatedAt
                    );
                    if (upsert.inserted) summary.addInserted(1); else summary.addUpdated(1);
                }
            });

            if (pageRes.nextPage == null || pageRes.nextPage.isEmpty()) break;
            page = Integer.parseInt(pageRes.nextPage);
        }
        if (!full) {
            dao.upsertCursor(projectId, "issues", OffsetDateTime.now());
        }
        log.info("Issues sync done: project={} fetched={} pages={}", gitlabProjectId, summary.fetched, summary.pages);
        return summary;
    }
}
