package czm.pm_solution_be.planning;

import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PlanningCapacityService {

    private final PlanningCapacityRepository repository;

    public PlanningCapacityService(PlanningCapacityRepository repository) {
        this.repository = repository;
    }

    public CurrentCapacityResponse getCurrentCapacitySummary() {
        List<PlanningCapacityRepository.StatusCountRow> projectStatuses = repository.loadProjectStatusCounts();
        List<PlanningCapacityRepository.StatusCountRow> internStatuses = repository.loadInternStatusCounts();

        CurrentCapacityResponse.Section projectSection = new CurrentCapacityResponse.Section(
                repository.countProjects(),
                projectStatuses.stream()
                        .map(row -> new CurrentCapacityResponse.StatusSummary(row.code(), row.label(), row.severity(), row.count()))
                        .toList());

        CurrentCapacityResponse.Section internSection = new CurrentCapacityResponse.Section(
                repository.countInterns(),
                internStatuses.stream()
                        .map(row -> new CurrentCapacityResponse.StatusSummary(row.code(), row.label(), row.severity(), row.count()))
                        .toList());

        return new CurrentCapacityResponse(projectSection, internSection);
    }

    public record CurrentCapacityResponse(Section projects, Section interns) {
        public record Section(long total, List<StatusSummary> statuses) {}

        public record StatusSummary(String code, String label, int severity, long count) {}
    }
}

