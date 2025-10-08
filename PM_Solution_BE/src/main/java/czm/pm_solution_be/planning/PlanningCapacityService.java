package czm.pm_solution_be.planning;

import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class PlanningCapacityService {

    private final PlanningCapacityRepository repository;

    public PlanningCapacityService(PlanningCapacityRepository repository) {
        this.repository = repository;
    }

    public CurrentCapacityResponse getCurrentCapacitySummary() {
        List<PlanningCapacityRepository.StatusCountRow> projectStatuses = repository.loadProjectStatusCounts();
        List<PlanningCapacityRepository.ProjectStatusAssignmentRow> projectAssignments = repository.loadProjectsByStatus();
        Map<String, List<CurrentCapacityResponse.AssignmentSummary>> projectsByStatus = projectAssignments.stream()
                .collect(Collectors.groupingBy(
                        PlanningCapacityRepository.ProjectStatusAssignmentRow::statusCode,
                        LinkedHashMap::new,
                        Collectors.mapping(
                                row -> new CurrentCapacityResponse.AssignmentSummary(row.projectId(), row.projectName()),
                                Collectors.toList())));

        List<PlanningCapacityRepository.StatusCountRow> internStatuses = repository.loadInternStatusCounts();
        List<PlanningCapacityRepository.InternStatusAssignmentRow> internAssignments = repository.loadInternsByStatus();
        Map<String, List<CurrentCapacityResponse.AssignmentSummary>> internsByStatus = internAssignments.stream()
                .collect(Collectors.groupingBy(
                        PlanningCapacityRepository.InternStatusAssignmentRow::statusCode,
                        LinkedHashMap::new,
                        Collectors.mapping(
                                row -> new CurrentCapacityResponse.AssignmentSummary(row.internId(), row.internName()),
                                Collectors.toList())));

        CurrentCapacityResponse.Section projectSection = new CurrentCapacityResponse.Section(
                repository.countProjects(),
                projectStatuses.stream()
                        .map(row -> new CurrentCapacityResponse.StatusSummary(
                                row.code(),
                                row.label(),
                                row.severity(),
                                row.count(),
                                projectsByStatus.getOrDefault(row.code(), List.of()),
                                List.of()))
                        .toList());

        CurrentCapacityResponse.Section internSection = new CurrentCapacityResponse.Section(
                repository.countInterns(),
                internStatuses.stream()
                        .map(row -> new CurrentCapacityResponse.StatusSummary(
                                row.code(),
                                row.label(),
                                row.severity(),
                                row.count(),
                                List.of(),
                                internsByStatus.getOrDefault(row.code(), List.of())))
                        .toList());

        return new CurrentCapacityResponse(projectSection, internSection);
    }

    public record CurrentCapacityResponse(Section projects, Section interns) {
        public record Section(long total, List<StatusSummary> statuses) {}

        public record StatusSummary(String code, String label, int severity, long count,
                                    List<AssignmentSummary> projects,
                                    List<AssignmentSummary> interns) {}

        public record AssignmentSummary(long id, String name) {}
    }
}

