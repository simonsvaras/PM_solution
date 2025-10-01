package czm.pm_solution_be.sync;

import czm.pm_solution_be.gitlab.GitLabClient;
import czm.pm_solution_be.gitlab.dto.GitLabMilestone;
import czm.pm_solution_be.sync.dto.SyncSummary;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

@Service
public class MilestoneSyncService {
    private static final Logger log = LoggerFactory.getLogger(MilestoneSyncService.class);

    private final GitLabClient gitlab;
    private final SyncDao dao;
    private final RepositorySyncService repositorySyncService;
    private final TransactionTemplate txTemplate;

    public MilestoneSyncService(GitLabClient gitlab,
                                SyncDao dao,
                                RepositorySyncService repositorySyncService,
                                PlatformTransactionManager transactionManager) {
        this.gitlab = gitlab;
        this.dao = dao;
        this.repositorySyncService = repositorySyncService;
        this.txTemplate = new TransactionTemplate(transactionManager);
    }

    public SyncSummary syncProjectMilestones(long gitlabProjectId) {
        SyncDao.RepositoryNamespace repository = ensureRepository(gitlabProjectId);
        Long namespaceId = repository.namespaceId();
        if (namespaceId == null) {
            throw new IllegalStateException("Repository " + gitlabProjectId + " nemá přiřazený namespace.");
        }
        Long projectId = dao.findProjectIdByNamespaceId(namespaceId)
                .orElseThrow(() -> new IllegalArgumentException("Nenalezen projekt pro namespace " + namespaceId));

        log.info("Starting milestones sync repo={}", gitlabProjectId);
        SyncSummary summary = new SyncSummary();
        Integer page = 1;
        while (true) {
            GitLabClient.PageResult<GitLabMilestone> pageRes = gitlab.listProjectMilestonesPage(gitlabProjectId, page);
            List<GitLabMilestone> milestones = pageRes.data;
            if ((milestones == null || milestones.isEmpty()) && (page == null || page == 1)) {
                break;
            }
            summary.addFetched(milestones.size()).addPage();

            Long projectIdSnapshot = projectId;
            txTemplate.executeWithoutResult(status -> {
                for (GitLabMilestone milestone : milestones) {
                    var upsert = dao.upsertMilestone(
                            projectIdSnapshot,
                            milestone.id,
                            milestone.iid,
                            milestone.title,
                            milestone.state,
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

            if (pageRes.nextPage == null || pageRes.nextPage.isEmpty()) {
                break;
            }
            page = Integer.parseInt(pageRes.nextPage);
        }
        log.info("Milestones sync done: repo={} fetched={} pages={}", gitlabProjectId, summary.fetched, summary.pages);
        return summary;
    }

    private SyncDao.RepositoryNamespace ensureRepository(long gitlabProjectId) {
        SyncDao.RepositoryNamespace repository = dao.findRepositoryNamespaceByGitLabRepoId(gitlabProjectId).orElse(null);
        if (repository != null) {
            return repository;
        }

        repositorySyncService.syncProjectRepositories(gitlabProjectId);
        return dao.findRepositoryNamespaceByGitLabRepoId(gitlabProjectId)
                .orElseThrow(() -> new IllegalArgumentException("Repository not found locally: " + gitlabProjectId));
    }
}
