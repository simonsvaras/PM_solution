package czm.pm_solution_be.sync;

import czm.pm_solution_be.gitlab.GitLabClient;
import czm.pm_solution_be.gitlab.dto.GitLabMilestone;
import czm.pm_solution_be.sync.dto.SyncSummary;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class MilestoneSyncService {
    private static final Logger log = LoggerFactory.getLogger(MilestoneSyncService.class);

    private final GitLabClient gitlab;
    private final SyncDao dao;
    private final TransactionTemplate txTemplate;

    public MilestoneSyncService(GitLabClient gitlab,
                                SyncDao dao,
                                PlatformTransactionManager transactionManager) {
        this.gitlab = gitlab;
        this.dao = dao;
        this.txTemplate = new TransactionTemplate(transactionManager);
    }

    public SyncSummary syncNamespaceMilestones(long gitlabNamespaceId) {
        Long projectId = dao.findProjectIdByNamespaceId(gitlabNamespaceId)
                .orElseThrow(() -> new IllegalArgumentException("Nenalezen projekt pro namespace " + gitlabNamespaceId));

        log.info("Starting milestones sync namespace={} project={}", gitlabNamespaceId, projectId);
        SyncSummary summary = new SyncSummary();
        Set<Long> processedMilestoneIds = new HashSet<>();
        syncGroupMilestones(gitlabNamespaceId, projectId, summary, processedMilestoneIds);
        syncRepositoryMilestones(projectId, summary, processedMilestoneIds);
        log.info("Milestones sync done: namespace={} project={} fetched={} pages={}", gitlabNamespaceId, projectId, summary.fetched, summary.pages);
        return summary;
    }

    private void syncGroupMilestones(long gitlabNamespaceId,
                                     long projectId,
                                     SyncSummary summary,
                                     Set<Long> processedMilestoneIds) {
        Integer page = 1;
        while (true) {
            GitLabClient.PageResult<GitLabMilestone> pageRes = gitlab.listGroupMilestonesPage(gitlabNamespaceId, page);
            List<GitLabMilestone> milestones = pageRes.data;
            if ((milestones == null || milestones.isEmpty()) && (page == null || page == 1)) {
                break;
            }
            summary.addFetched(milestones.size()).addPage();
            persistMilestones(projectId, milestones, processedMilestoneIds, summary);
            if (pageRes.nextPage == null || pageRes.nextPage.isEmpty()) {
                break;
            }
            page = Integer.parseInt(pageRes.nextPage);
        }
    }

    private void syncRepositoryMilestones(long projectId,
                                          SyncSummary summary,
                                          Set<Long> processedMilestoneIds) {
        List<SyncDao.ProjectRepositoryLink> repositories = dao.listProjectRepositories(projectId);
        if (repositories.isEmpty()) {
            return;
        }
        for (SyncDao.ProjectRepositoryLink repository : repositories) {
            Long gitlabRepoId = repository.gitlabRepoId();
            if (gitlabRepoId == null) {
                log.debug("Repository {} has no gitlab_repo_id, skipping milestone sync", repository.repositoryId());
                continue;
            }
            Integer page = 1;
            while (true) {
                GitLabClient.PageResult<GitLabMilestone> pageRes = gitlab.listProjectMilestonesPage(gitlabRepoId, page);
                List<GitLabMilestone> milestones = pageRes.data;
                if ((milestones == null || milestones.isEmpty()) && (page == null || page == 1)) {
                    break;
                }
                summary.addFetched(milestones.size()).addPage();
                persistMilestones(projectId, milestones, processedMilestoneIds, summary);
                if (pageRes.nextPage == null || pageRes.nextPage.isEmpty()) {
                    break;
                }
                page = Integer.parseInt(pageRes.nextPage);
            }
        }
    }

    private void persistMilestones(long projectId,
                                   List<GitLabMilestone> milestones,
                                   Set<Long> processedMilestoneIds,
                                   SyncSummary summary) {
        if (milestones == null || milestones.isEmpty()) {
            return;
        }
        Long projectIdSnapshot = projectId;
        txTemplate.executeWithoutResult(status -> {
            for (GitLabMilestone milestone : milestones) {
                if (!processedMilestoneIds.add(milestone.id)) {
                    continue;
                }
                var upsert = dao.upsertMilestone(
                        projectIdSnapshot,
                        milestone.id,
                        milestone.iid,
                        milestone.title,
                        milestone.state,
                        milestone.description,
                        milestone.dueDate,
                        milestone.createdAt,
                        milestone.updatedAt
                );
                if (upsert.inserted) {
                    summary.addInserted(1);
                } else {
                    summary.addUpdated(1);
                }
            }
        });
    }
}
