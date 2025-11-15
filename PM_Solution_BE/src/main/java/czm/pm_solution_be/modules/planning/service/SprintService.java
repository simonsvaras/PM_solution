package czm.pm_solution_be.modules.planning.service;

import czm.pm_solution_be.modules.planning.repository.WeeklyTaskRepository;
import czm.pm_solution_be.planning.sprint.PlanningSprintEntity;
import czm.pm_solution_be.planning.sprint.PlanningSprintRepository;
import czm.pm_solution_be.planning.sprint.SprintStatus;
import czm.pm_solution_be.web.ApiException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

@Service
public class SprintService {

    private final PlanningSprintRepository sprintRepository;
    private final WeeklyTaskRepository weeklyTaskRepository;

    public SprintService(PlanningSprintRepository sprintRepository,
                         WeeklyTaskRepository weeklyTaskRepository) {
        this.sprintRepository = sprintRepository;
        this.weeklyTaskRepository = weeklyTaskRepository;
    }

    public PlanningSprintEntity getCurrentSprint(long projectId) {
        return sprintRepository.findByProjectAndStatus(projectId, SprintStatus.OPEN)
                .orElseThrow(() -> ApiException.notFound("Aktivní sprint nebyl nalezen.", "sprint_not_found"));
    }

    public PlanningSprintEntity createSprint(long projectId, SprintInput input) {
        SprintInput normalized = normalizeInput(input);
        sprintRepository.findByProjectAndStatus(projectId, SprintStatus.OPEN)
                .ifPresent(existing -> {
                    throw ApiException.conflict("Projekt již má aktivní sprint.", "sprint_already_exists");
                });
        return sprintRepository.insert(projectId,
                normalized.name(),
                normalized.description(),
                normalized.deadline(),
                SprintStatus.OPEN);
    }

    public PlanningSprintEntity closeSprint(long projectId, long sprintId) {
        PlanningSprintEntity sprint = sprintRepository.findById(sprintId)
                .orElseThrow(() -> ApiException.notFound("Sprint nebyl nalezen.", "sprint_not_found"));
        if (sprint.projectId() != projectId) {
            throw ApiException.validation("Sprint nepatří do vybraného projektu.", "sprint_project_mismatch");
        }
        if (sprint.status() != SprintStatus.OPEN) {
            throw ApiException.conflict("Sprint je již uzavřen.", "sprint_already_closed");
        }
        long openTasks = weeklyTaskRepository.countOpenTasks(projectId);
        if (openTasks > 0) {
            throw ApiException.conflict("Nelze uzavřít sprint s " + openTasks + " otevřenými úkoly.", "weekly_tasks_open");
        }
        return sprintRepository.update(sprintId, sprint.name(), sprint.description(), sprint.deadline(), SprintStatus.CLOSED)
                .orElseThrow(() -> ApiException.internal("Nepodařilo se uzavřít sprint.", "sprint_close_failed"));
    }

    public List<PlanningSprintEntity> getSprintHistory(long projectId) {
        return sprintRepository.findAllByProject(projectId);
    }

    public PlanningSprintEntity requireActiveSprint(long projectId) {
        return sprintRepository.findByProjectAndStatus(projectId, SprintStatus.OPEN)
                .orElseThrow(() -> ApiException.conflict("Pro projekt není aktivní sprint.", "sprint_required"));
    }

    private SprintInput normalizeInput(SprintInput input) {
        if (input == null || input.name() == null || input.name().isBlank()) {
            throw ApiException.validation("Název sprintu je povinný.", "sprint_name_required");
        }
        String name = input.name().trim();
        String description = input.description();
        if (description != null) {
            description = description.trim();
            if (description.isBlank()) {
                description = null;
            }
        }
        return new SprintInput(name, description, input.deadline());
    }

    public record SprintInput(String name, String description, LocalDate deadline) {
    }
}
