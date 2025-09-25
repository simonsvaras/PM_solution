package czm.pm_solution_be.sync;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/projects")
public class ProjectAdminController {
    private final SyncDao dao;

    public ProjectAdminController(SyncDao dao) { this.dao = dao; }

    public record ProjectDto(Long id, Long gitlabProjectId, String name) {}
    public record CreateRequest(Long gitlabProjectId, String name) {}
    public record UpdateRequest(String name) {}

    @PostMapping
    public ResponseEntity<ProjectDto> create(@RequestBody CreateRequest req) {
        if (req == null || req.gitlabProjectId == null || req.name == null || req.name.isBlank()) {
            throw new IllegalArgumentException("gitlabProjectId a name jsou povinné");
        }
        SyncDao.UpsertResult<Long> res = dao.upsertProject(req.gitlabProjectId, req.name);
        ProjectDto body = new ProjectDto(res.id, req.gitlabProjectId, req.name);
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @PutMapping("/{id}")
    public ProjectDto update(@PathVariable long id, @RequestBody UpdateRequest req) {
        if (req == null || req.name == null || req.name.isBlank()) {
            throw new IllegalArgumentException("name je povinné");
        }
        dao.updateProjectName(id, req.name);
        // Reload minimal view
        var list = dao.listProjects();
        for (var p : list) {
            if (p.id().equals(id)) {
                return new ProjectDto(p.id(), p.gitlabProjectId(), req.name);
            }
        }
        throw new IllegalArgumentException("Project not found: " + id);
    }

    public record CreateByNameRequest(String name) {}

    @PostMapping("/by-name")
    public ResponseEntity<ProjectDto> createByName(@RequestBody CreateByNameRequest req) {
        if (req == null || req.name == null || req.name.isBlank()) {
            throw new IllegalArgumentException("name je povinnĂ©");
        }
        Long id = dao.createProjectByName(req.name);
        ProjectDto body = new ProjectDto(id, null, req.name);
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        dao.deleteProject(id);
    }
}
