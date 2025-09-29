package czm.pm_solution_be.sync;

import czm.pm_solution_be.intern.InternDao;
import czm.pm_solution_be.intern.InternDao.GroupRow;
import czm.pm_solution_be.intern.InternDao.ProjectTeamRow;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/reports/teams")
public class ReportTeamController {
    private final InternDao internDao;

    public ReportTeamController(InternDao internDao) {
        this.internDao = internDao;
    }

    public record InternGroupDto(long id, int code, String label) {}

    public record TeamInternDto(long id,
                                String firstName,
                                String lastName,
                                String username,
                                long levelId,
                                String levelLabel,
                                BigDecimal workloadHours,
                                List<InternGroupDto> groups) {}

    public record TeamDto(long projectId, String projectName, List<TeamInternDto> interns) {}

    @GetMapping
    public List<TeamDto> list() {
        List<ProjectTeamRow> rows = internDao.listProjectTeams();
        if (rows.isEmpty()) {
            return List.of();
        }

        Set<Long> internIds = rows.stream().map(ProjectTeamRow::internId).collect(Collectors.toSet());
        Map<Long, List<GroupRow>> groups = internDao.findGroupsForInternIds(internIds);

        Map<Long, TeamAccumulator> teams = new LinkedHashMap<>();
        for (ProjectTeamRow row : rows) {
            TeamAccumulator accumulator = teams.computeIfAbsent(row.projectId(),
                    id -> new TeamAccumulator(row.projectId(), row.projectName()));
            List<GroupRow> internGroups = groups.getOrDefault(row.internId(), List.of());
            accumulator.interns.add(new TeamInternDto(
                    row.internId(),
                    row.firstName(),
                    row.lastName(),
                    row.username(),
                    row.levelId(),
                    row.levelLabel(),
                    row.workloadHours(),
                    internGroups.stream()
                            .map(g -> new InternGroupDto(g.id(), g.code(), g.label()))
                            .toList()
            ));
        }

        return teams.values().stream().map(TeamAccumulator::toDto).toList();
    }

    private static final class TeamAccumulator {
        private final long projectId;
        private final String projectName;
        private final List<TeamInternDto> interns = new ArrayList<>();

        private TeamAccumulator(long projectId, String projectName) {
            this.projectId = projectId;
            this.projectName = projectName;
        }

        private TeamDto toDto() {
            return new TeamDto(projectId, projectName, List.copyOf(interns));
        }
    }
}
