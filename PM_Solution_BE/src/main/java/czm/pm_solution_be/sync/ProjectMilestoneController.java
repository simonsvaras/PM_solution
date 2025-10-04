package czm.pm_solution_be.sync;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

@RestController
@RequestMapping("/api/projects")
public class ProjectMilestoneController {
    private final SyncDao dao;

    public ProjectMilestoneController(SyncDao dao) {
        this.dao = dao;
    }

    /**
     * Returns all milestones that are still active for the given project together with the
     * aggregated time and cost information that is necessary to render the long term overview.
     *
     * @param projectId unique identifier of the project requested from the UI
     * @return immutable list of active milestone summaries ordered by due date
     */
    @GetMapping("/{projectId}/milestones/active")
    public List<SyncDao.ActiveMilestoneRow> listActiveMilestones(@PathVariable long projectId) {
        return dao.listActiveMilestones(projectId);
    }

    /**
     * Loads the cost totals for every milestone on the project. The data comes from a precomputed
     * database view ({@code milestone_report_cost}) so the endpoint only needs to proxy the result
     * set to the front-end.
     *
     * @param projectId unique identifier of the project requested from the UI
     * @return list of cost summaries sorted by due date and title for stable rendering
     */
    @GetMapping("/{projectId}/milestones/costs")
    public List<SyncDao.MilestoneCostSummaryRow> listMilestoneCosts(@PathVariable long projectId) {
        return dao.listProjectMilestoneCosts(projectId);
    }

    /**
     * Returns per-issue cost totals for a user selected subset of milestones. When no milestone
     * identifiers are supplied an empty response is returned to keep the behaviour idempotent.
     *
     * @param projectId identifier of the project the milestones belong to
     * @param milestoneIds list of selected milestone identifiers (may be null/empty)
     * @return ordered list of issue cost aggregates filtered by the provided milestones
     */
    @GetMapping("/{projectId}/milestones/issues")
    public List<SyncDao.MilestoneIssueCostRow> listMilestoneIssues(@PathVariable long projectId,
                                                                   @RequestParam(name = "milestoneId", required = false) List<Long> milestoneIds) {
        if (milestoneIds == null || milestoneIds.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<Long> normalized = milestoneIds.stream()
                .filter(Objects::nonNull)
                .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
        if (normalized.isEmpty()) {
            return List.of();
        }
        return dao.listMilestoneIssueCosts(projectId, new ArrayList<>(normalized));
    }

    /**
     * Returns the full detail for a single milestone including issue and intern breakdown. The
     * endpoint responds with {@code 404} when the DAO cannot resolve the milestone in the context of
     * the project.
     *
     * @param projectId identifier of the project requested from the UI
     * @param milestoneId identifier of the milestone whose detail should be returned
     * @return HTTP 200 with the milestone detail payload or 404 when no record exists
     */
    @GetMapping("/{projectId}/milestones/{milestoneId}/detail")
    public ResponseEntity<SyncDao.MilestoneDetail> getMilestoneDetail(@PathVariable long projectId,
                                                                      @PathVariable long milestoneId) {
        SyncDao.MilestoneDetail detail = dao.getMilestoneDetail(projectId, milestoneId);
        if (detail == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(detail);
    }
}
