package czm.pm_solution_be.sync;

import czm.pm_solution_be.gitlab.GitLabClient;
import czm.pm_solution_be.gitlab.dto.GitLabProject;
import czm.pm_solution_be.sync.dto.SyncSummary;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Optional;

@Service
public class ProjectSyncService {
    private static final Logger log = LoggerFactory.getLogger(ProjectSyncService.class);
    private final GitLabClient gitlab;
    private final SyncDao dao;
    private final TransactionTemplate txTemplate;

    public ProjectSyncService(GitLabClient gitlab, SyncDao dao, PlatformTransactionManager tm) {
        this.gitlab = gitlab;
        this.dao = dao;
        this.txTemplate = new TransactionTemplate(tm);
    }

    public SyncSummary syncAllProjects(List<Long> onlyIds) {
        log.info("Starting projects sync. onlyIds={}", onlyIds);
        SyncSummary summary = new SyncSummary();
        if (onlyIds != null && !onlyIds.isEmpty()) {
            for (Long id : onlyIds) {
                GitLabProject p = gitlab.getProject(id);
                txTemplate.executeWithoutResult(status -> {
                    SyncDao.UpsertResult<Long> pr = dao.upsertProject(p.id, p.name);
                    SyncDao.UpsertResult<Long> rr = dao.upsertRepository(pr.id, p.id, p.name, p.pathWithNamespace,
                            p.namespace != null ? p.namespace.id : null,
                            p.namespace != null ? p.namespace.name : null,
                            true);
                    summary.addFetched(1);
                    if (pr.inserted) summary.addInserted(1); else summary.addUpdated(1);
                });
            }
            return summary;
        }

        Integer page = 1;
        while (true) {
            GitLabClient.PageResult<GitLabProject> pageRes = gitlab.listProjectsPage(page, null);
            List<GitLabProject> projects = pageRes.data;
            if (projects.isEmpty() && (page == null || page == 1)) break;
            summary.addFetched(projects.size()).addPage();

            txTemplate.executeWithoutResult(status -> {
                for (GitLabProject p : projects) {
                    SyncDao.UpsertResult<Long> pr = dao.upsertProject(p.id, p.name);
                    dao.upsertRepository(pr.id, p.id, p.name, p.pathWithNamespace,
                            p.namespace != null ? p.namespace.id : null,
                            p.namespace != null ? p.namespace.name : null,
                            true);
                    if (pr.inserted) summary.addInserted(1); else summary.addUpdated(1);
                }
            });

            if (pageRes.nextPage == null || pageRes.nextPage.isEmpty()) break;
            page = Integer.parseInt(pageRes.nextPage);
        }
        log.info("Projects sync done: fetched={}, pages={}", summary.fetched, summary.pages);
        return summary;
    }
}
