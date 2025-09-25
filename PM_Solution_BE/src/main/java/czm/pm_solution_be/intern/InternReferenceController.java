package czm.pm_solution_be.intern;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Read-only endpoints exposing levels and groups for the frontend configuration screens.
 */
@RestController
@RequestMapping("/api")
public class InternReferenceController {
    private final InternService service;

    public InternReferenceController(InternService service) {
        this.service = service;
    }

    @GetMapping("/levels")
    public List<InternService.LevelDto> listLevels() {
        return service.listLevels();
    }

    @GetMapping("/groups")
    public List<InternService.GroupDto> listGroups() {
        return service.listGroups();
    }
}


