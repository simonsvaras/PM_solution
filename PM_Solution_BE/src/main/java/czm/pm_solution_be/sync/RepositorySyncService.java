package czm.pm_solution_be.sync;

import czm.pm_solution_be.gitlab.GitLabClient;
import czm.pm_solution_be.gitlab.dto.GitLabProject;
import czm.pm_solution_be.sync.dto.SyncSummary;
import czm.pm_solution_be.config.GitLabProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class RepositorySyncService {
    private static final Logger log = LoggerFactory.getLogger(RepositorySyncService.class);

    private final GitLabClient gitlab;
    private final SyncDao dao;
    private final GitLabProperties props;
    private final TransactionTemplate txTemplate;

    public RepositorySyncService(GitLabClient gitlab, SyncDao dao, PlatformTransactionManager tm, GitLabProperties props) {
        this.gitlab = gitlab;
        this.dao = dao;
        this.props = props;
        this.txTemplate = new TransactionTemplate(tm);
    }

    public SyncSummary syncProjectRepositories(long gitlabProjectId) {
        log.info("Starting repositories sync project={}", gitlabProjectId);
        SyncSummary summary = new SyncSummary();
        GitLabProject p = gitlab.getProject(gitlabProjectId);
        txTemplate.executeWithoutResult(status -> {
            SyncDao.UpsertResult<Long> rr = dao.upsertRepository(
                    p.id,
                    p.name,
                    p.pathWithNamespace,
                    p.namespace != null ? p.namespace.id : null,
                    p.namespace != null ? p.namespace.name : null,
                    true
            );
            summary.addFetched(1);
            if (rr.inserted) summary.addInserted(1); else summary.addUpdated(1);
        });
        log.info("Repositories sync done: project={} fetched=1", gitlabProjectId);
        return summary;
    }

    public SyncSummary syncAllRepositories() {
        Long groupId = props.getGroupId();
        if (groupId == null) throw new IllegalArgumentException("GitLab groupId is not configured");
        SyncSummary summary = new SyncSummary();
        Integer page = 1;
        while (true) {
            GitLabClient.PageResult<GitLabProject> res = gitlab.listGroupProjectsPage(groupId, page);
            var projects = res.data;
            if ((projects == null || projects.isEmpty()) && (page == null || page == 1)) break;
            for (GitLabProject p : projects) {
                txTemplate.executeWithoutResult(status -> {
                    SyncDao.UpsertResult<Long> rr = dao.upsertRepository(
                            p.id,
                            p.name,
                            p.pathWithNamespace,
                            p.namespace != null ? p.namespace.id : null,
                            p.namespace != null ? p.namespace.name : null,
                            true
                    );
                    summary.addFetched(1);
                    if (rr.inserted) summary.addInserted(1); else summary.addUpdated(1);
                });
            }
            if (res.nextPage == null || res.nextPage.isEmpty()) break;
            page = Integer.parseInt(res.nextPage);
            summary.addPage();
        }
        return summary;
    }
}
