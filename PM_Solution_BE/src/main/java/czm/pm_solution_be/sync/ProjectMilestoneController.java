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

    @GetMapping("/{projectId}/milestones/active")
    public List<SyncDao.ActiveMilestoneRow> listActiveMilestones(@PathVariable long projectId) {
        return dao.listActiveMilestones(projectId);
    }

    @GetMapping("/{projectId}/milestones/costs")
    public List<SyncDao.MilestoneCostSummaryRow> listMilestoneCosts(@PathVariable long projectId) {
        return dao.listProjectMilestoneCosts(projectId);
    }

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
