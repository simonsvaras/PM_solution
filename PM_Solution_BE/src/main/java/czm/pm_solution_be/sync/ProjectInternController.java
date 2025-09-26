package czm.pm_solution_be.sync;

import czm.pm_solution_be.intern.InternDao;
import czm.pm_solution_be.intern.InternDao.GroupRow;
import czm.pm_solution_be.intern.InternDao.InternAssignmentRow;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.Objects;

@RestController
@RequestMapping("/api/projects/{projectId}/interns")
public class ProjectInternController {
    private final InternDao internDao;

    public ProjectInternController(InternDao internDao) {
        this.internDao = internDao;
    }

    public record InternGroupDto(long id, int code, String label) {}

    public record InternAssignmentDto(long id,
                                      String firstName,
                                      String lastName,
                                      String username,
                                      long levelId,
                                      String levelCode,
                                      String levelLabel,
                                      List<InternGroupDto> groups,
                                      boolean assigned) {}

    public record UpdateInternsRequest(List<Long> internIds) {}

    @GetMapping
    public List<InternAssignmentDto> list(@PathVariable long projectId,
                                          @RequestParam(value = "search", required = false) String search) {
        List<InternAssignmentRow> rows = internDao.listInternsWithAssignment(projectId, search);
        List<Long> internIds = rows.stream().map(InternAssignmentRow::id).toList();
        Map<Long, List<GroupRow>> groupMap = internDao.findGroupsForInternIds(internIds);
        return rows.stream().map(row -> new InternAssignmentDto(
                row.id(),
                row.firstName(),
                row.lastName(),
                row.username(),
                row.levelId(),
                row.levelCode(),
                row.levelLabel(),
                groupMap.getOrDefault(row.id(), List.of()).stream()
                        .map(g -> new InternGroupDto(g.id(), g.code(), g.label()))
                        .toList(),
                row.assigned()
        )).toList();
    }

    @PutMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void update(@PathVariable long projectId, @RequestBody UpdateInternsRequest req) {
        if (req == null || req.internIds() == null) {
            throw new IllegalArgumentException("internIds je povinné pole.");
        }
        List<Long> uniqueIds = req.internIds().stream()
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        internDao.replaceProjectInterns(projectId, uniqueIds);
    }
}

