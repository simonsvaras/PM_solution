package czm.pm_solution_be.sync;

import czm.pm_solution_be.gitlab.GitLabGraphQlClient;
import czm.pm_solution_be.sync.dto.SyncSummary;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Coordinates report synchronisation for a single project.  The service
 * resolves all repositories linked to the project, fetches timelog data from
 * GitLab and persists only valid, non-duplicated rows.
 */
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

    /**
     * Synchronises all timelog entries for the repositories attached to the
     * provided project.
     *
     * @param projectId ID of the project in our database
     * @param from      optional lower bound for timelog timestamps.  Ignored when {@code sinceLast} is {@code true}.
     * @param to        optional upper bound for timelog timestamps (falls back to {@link OffsetDateTime#now()}).
     * @param sinceLast whether the caller explicitly requested to continue from the latest stored record.
     * @return aggregated sync statistics propagated back to the controller and the frontend.
     */
    public SyncSummary syncProjectReports(long projectId, OffsetDateTime from, OffsetDateTime to, boolean sinceLast) {
        List<SyncDao.ProjectRepositoryLink> repositories = syncDao.listProjectRepositories(projectId);
        if (repositories.isEmpty()) {
            throw new IllegalArgumentException("Projekt nemá přiřazené žádné repozitáře");
        }
        return syncReportsAcrossRepositories(repositories, from, to, sinceLast);
    }

    public SyncSummary syncAllReports(OffsetDateTime from, OffsetDateTime to, boolean sinceLast) {
        List<SyncDao.ProjectRepositoryLink> repositories = syncDao.listAllRepositoriesForSync();
        if (repositories.isEmpty()) {
            return new SyncSummary();
        }
        return syncReportsAcrossRepositories(repositories, from, to, sinceLast);
    }

    private SyncSummary syncReportsAcrossRepositories(List<SyncDao.ProjectRepositoryLink> repositories,
                                                      OffsetDateTime from,
                                                      OffsetDateTime to,
                                                      boolean sinceLast) {
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime effectiveTo = to != null ? to : now;
        SyncSummary summary = new SyncSummary();

        for (SyncDao.ProjectRepositoryLink repo : repositories) {
            if (repo.gitlabRepoId() == null) {
                log.warn("Repozitář {} (id={}) nemá GitLab ID – přeskočeno", repo.name(), repo.repositoryId());
                summary.addSkipped(1);
                continue;
            }
            OffsetDateTime repoFrom = (!sinceLast && from != null)
                    ? from
                    : syncDao.findLastReportSpentAt(repo.repositoryId()).orElse(from);
            if (repoFrom == null) {
                // If we have absolutely no cursor information we still fetch a
                // reasonably-sized slice (last year) instead of the whole
                // history.
                repoFrom = effectiveTo.minusYears(1);
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
                    BigDecimal hours = BigDecimal.valueOf(seconds)
                            .divide(BigDecimal.valueOf(3600), 4, RoundingMode.HALF_UP);
                    rows.add(new SyncDao.ReportRow(repo.repositoryId(), issueIid, spentAt, seconds, hours, username, repo.projectHourlyRate()));
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
                    // Missing usernames are bubbled up to the caller so the
                    // frontend can inform the user about data that requires a
                    // follow-up (e.g. onboarding a new intern).
                    summary.addMissingUsernames(stats.missingUsernames());
                }

                GitLabGraphQlClient.PageInfo pageInfo = page.pageInfo();
                hasNext = pageInfo != null && pageInfo.hasNextPage();
                cursor = hasNext ? pageInfo.endCursor() : null;
            } while (hasNext && cursor != null);
        }

        return summary;
    }

    /**
     * Deletes all persisted report rows.
     *
     * @return number of removed records
     */
    public int purgeAllReports() {
        return syncDao.deleteAllReports();
    }

    /**
     * Deletes persisted report rows that belong to repositories assigned to the provided projects.
     *
     * @param projectIds list of project identifiers (duplicates ignored)
     * @return number of removed records
     */
    public int purgeReportsForProjects(List<Long> projectIds) {
        return syncDao.deleteReportsForProjects(projectIds);
    }
}
