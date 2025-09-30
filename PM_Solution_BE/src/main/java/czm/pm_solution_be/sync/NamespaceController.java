package czm.pm_solution_be.sync;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/namespaces")
public class NamespaceController {
    private final SyncDao dao;

    public NamespaceController(SyncDao dao) {
        this.dao = dao;
    }

    public record NamespaceDto(Long namespaceId, String namespaceName) {}

    @GetMapping
    public List<NamespaceDto> list() {
        return dao.listRepositoryNamespaces().stream()
                .map(row -> new NamespaceDto(row.namespaceId(), row.namespaceName()))
                .toList();
    }
}
