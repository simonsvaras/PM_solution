package czm.pm_solution_be;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class PmSolutionBeApplication {

    public static void main(String[] args) {
        SpringApplication.run(PmSolutionBeApplication.class, args);
    }

}
