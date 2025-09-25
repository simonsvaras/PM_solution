package czm.pm_solution_be.sync;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/projects/{projectId}/repositories")
public class ProjectRepositoryController {
    private final SyncDao dao;

    public ProjectRepositoryController(SyncDao dao) {
        this.dao = dao;
    }

    public record RepositoryAssignmentDto(Long id, Long gitlabRepoId, String name, String nameWithNamespace, boolean assigned) {}

    @GetMapping
    public List<RepositoryAssignmentDto> list(@PathVariable long projectId,
                                              @RequestParam(value = "search", required = false) String search) {
        return dao.listRepositoriesWithAssignment(projectId, search).stream()
                .map(r -> new RepositoryAssignmentDto(r.id(), r.gitlabRepoId(), r.name(), r.nameWithNamespace(), r.assigned()))
                .toList();
    }

    public record UpdateRepositoriesRequest(List<Long> repositoryIds) {}

    @PutMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void update(@PathVariable long projectId, @RequestBody UpdateRepositoriesRequest req) {
        if (req == null) {
            throw new IllegalArgumentException("Body nesmí být prázdné.");
        }
        List<Long> ids = req.repositoryIds();
        if (ids == null) {
            throw new IllegalArgumentException("repositoryIds je povinné pole.");
        }
        dao.replaceProjectRepositories(projectId, ids);
    }
}
