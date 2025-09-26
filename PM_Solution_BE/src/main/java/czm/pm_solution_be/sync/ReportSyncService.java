package czm.pm_solution_be.sync;

import czm.pm_solution_be.gitlab.GitLabGraphQlClient;
import czm.pm_solution_be.sync.dto.SyncSummary;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class ReportSyncService {
    private static final Logger log = LoggerFactory.getLogger(ReportSyncService.class);
    private static final int PAGE_SIZE = 100;

    private final SyncDao syncDao;
    private final GitLabGraphQlClient graphQlClient;

    public ReportSyncService(SyncDao syncDao, GitLabGraphQlClient graphQlClient) {
        this.syncDao = syncDao;
        this.graphQlClient = graphQlClient;
    }

    public SyncSummary syncProjectReports(long projectId, OffsetDateTime from, OffsetDateTime to, boolean sinceLast) {
        List<SyncDao.ProjectRepositoryLink> repositories = syncDao.listProjectRepositories(projectId);
        if (repositories.isEmpty()) {
            throw new IllegalArgumentException("Projekt nemá přiřazené žádné repozitáře");
        }
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime effectiveTo = to != null ? to : now;
        SyncSummary summary = new SyncSummary();

        for (SyncDao.ProjectRepositoryLink repo : repositories) {
            if (repo.gitlabRepoId() == null) {
                log.warn("Repozitář {} (id={}) nemá GitLab ID – přeskočeno", repo.name(), repo.repositoryId());
                summary.addSkipped(1);
                continue;
            }
            OffsetDateTime repoFrom = (!sinceLast && from != null) ? from : syncDao.findLastReportSpentAt(repo.repositoryId()).orElse(from);
            if (repoFrom == null) {
                repoFrom = effectiveTo.minusYears(1); // fallback to fetch last year if nothing synced yet
            }
            if (!repoFrom.isBefore(effectiveTo)) {
                log.debug("Repo {}: počáteční datum {} není před {} – přeskočeno", repo.name(), repoFrom, effectiveTo);
                continue;
            }

            String projectGid = "gid://gitlab/Project/" + repo.gitlabRepoId();
            String cursor = null;
            boolean hasNext;
            do {
                GitLabGraphQlClient.TimelogPage page = graphQlClient.fetchTimelogs(projectGid, repoFrom, effectiveTo, cursor, PAGE_SIZE);
                List<GitLabGraphQlClient.TimelogNode> nodes = page.nodes();
                summary.addPage();
                summary.addFetched(nodes.size());

                List<SyncDao.ReportRow> rows = new ArrayList<>();
                int invalid = 0;
                for (GitLabGraphQlClient.TimelogNode node : nodes) {
                    if (node == null) {
                        invalid++;
                        continue;
                    }
                    OffsetDateTime spentAt = node.spentAt();
                    Double timeSpentRaw = node.timeSpent();
                    GitLabGraphQlClient.TimelogUser user = node.user();
                    if (spentAt == null || timeSpentRaw == null || user == null || user.username() == null) {
                        invalid++;
                        continue;
                    }
                    String username = user.username().trim();
                    if (username.isEmpty()) {
                        invalid++;
                        continue;
                    }
                    int seconds = (int) Math.round(timeSpentRaw);
                    if (seconds == 0) {
                        invalid++;
                        continue;
                    }
                    Long issueIid = node.issue() != null ? node.issue().iid() : null;
                    rows.add(new SyncDao.ReportRow(repo.repositoryId(), issueIid, spentAt, seconds, username));
                }
                if (invalid > 0) {
                    summary.addSkipped(invalid);
                }

                if (!rows.isEmpty()) {
                    SyncDao.ReportInsertStats stats = syncDao.insertReports(rows);
                    summary.addInserted(stats.inserted());
                    summary.addSkipped(stats.duplicates());
                    if (stats.failed() > 0) {
                        summary.addSkipped(stats.failed());
                    }
                }

                GitLabGraphQlClient.PageInfo pageInfo = page.pageInfo();
                hasNext = pageInfo != null && pageInfo.hasNextPage();
                cursor = hasNext ? pageInfo.endCursor() : null;
            } while (hasNext && cursor != null);
        }

        return summary;
    }
}
