package czm.pm_solution_be.planning;

import czm.pm_solution_be.planning.sprint.PlanningSprintRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
public class PlanningModuleConfig {

    @Bean
    public PlanningSprintRepository planningSprintRepository(JdbcTemplate jdbcTemplate) {
        return new PlanningSprintRepository(jdbcTemplate);
    }
}
