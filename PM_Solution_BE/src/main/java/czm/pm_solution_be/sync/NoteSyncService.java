package czm.pm_solution_be.sync;

import czm.pm_solution_be.gitlab.GitLabClient;
import czm.pm_solution_be.gitlab.dto.GitLabNote;
import czm.pm_solution_be.sync.dto.SyncSummary;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class NoteSyncService {
    private static final Logger log = LoggerFactory.getLogger(NoteSyncService.class);
    private final GitLabClient gitlab;
    private final SyncDao dao;
    private final TransactionTemplate txTemplate;

    public NoteSyncService(GitLabClient gitlab, SyncDao dao, PlatformTransactionManager tm) {
        this.gitlab = gitlab;
        this.dao = dao;
        this.txTemplate = new TransactionTemplate(tm);
    }

    public SyncSummary syncProjectNotes(long gitlabProjectId, OffsetDateTime since) {
        var maybeProjectId = dao.findProjectIdByGitLabId(gitlabProjectId);
        if (maybeProjectId.isEmpty()) {
            throw new IllegalArgumentException("Project not found locally: " + gitlabProjectId);
        }
        long projectId = maybeProjectId.get();

        OffsetDateTime cutoff = since != null ? since : dao.getCursor(projectId, "notes").orElse(null);
        log.info("Starting notes sync project={} since={}", gitlabProjectId, cutoff);

        SyncSummary summary = new SyncSummary();
        List<Long> iids = dao.findIssueIidsForProject(projectId);
        for (Long iid : iids) {
            syncIssueNotesInternal(gitlabProjectId, projectId, iid, cutoff, summary);
        }
        // move cursor when full success
        dao.upsertCursor(projectId, "notes", OffsetDateTime.now());
        log.info("Notes sync done: project={} fetched={} pages={}", gitlabProjectId, summary.fetched, summary.pages);
        return summary;
    }

    public SyncSummary syncSingleIssueNotes(long gitlabProjectId, long iid, OffsetDateTime since) {
        var maybeProjectId = dao.findProjectIdByGitLabId(gitlabProjectId);
        if (maybeProjectId.isEmpty()) {
            throw new IllegalArgumentException("Project not found locally: " + gitlabProjectId);
        }
        long projectId = maybeProjectId.get();
        SyncSummary summary = new SyncSummary();
        syncIssueNotesInternal(gitlabProjectId, projectId, iid, since, summary);
        return summary;
    }

    private void syncIssueNotesInternal(long gitlabProjectId, long projectId, long iid, OffsetDateTime cutoff, SyncSummary summary) {
        Integer page = 1;
        while (true) {
            GitLabClient.PageResult<GitLabNote> res = gitlab.listIssueNotesPage(gitlabProjectId, iid, page);
            List<GitLabNote> notes = res.data;
            summary.addFetched(notes.size());
            if (!notes.isEmpty()) summary.addPage();

            txTemplate.executeWithoutResult(status -> {
                for (GitLabNote n : notes) {
                    if (!n.system) continue;
                    if (cutoff != null && n.createdAt.isBefore(cutoff)) continue; // local cutoff
                    Integer delta = TimeSpentParser.parseDeltaSeconds(n.body);
                    if (delta == null || delta == 0) continue;
                    boolean inserted = dao.insertReportIfNotExists(projectId, iid, n.createdAt, delta, n.author != null ? n.author.username : null);
                    if (inserted) summary.addInserted(1); else summary.addSkipped(1);
                }
            });

            if (res.nextPage == null || res.nextPage.isEmpty()) break;
            page = Integer.parseInt(res.nextPage);
        }
    }
}

