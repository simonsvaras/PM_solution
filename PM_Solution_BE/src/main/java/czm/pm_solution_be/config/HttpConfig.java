package czm.pm_solution_be.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@Configuration
public class HttpConfig {

    @Bean
    public RestTemplate gitlabRestTemplate(RestTemplateBuilder builder, GitLabProperties props) {
        RestTemplate rt = builder
                .setConnectTimeout(Duration.ofMillis(props.getTimeoutMs()))
                .setReadTimeout(Duration.ofMillis(props.getTimeoutMs()))
                .build();

        List<ClientHttpRequestInterceptor> interceptors = new ArrayList<>();
        interceptors.add((request, body, execution) -> {
            if (props.getToken() != null && !props.getToken().isEmpty()) {
                request.getHeaders().add("PRIVATE-TOKEN", props.getToken());
            }
            return execution.execute(request, body);
        });
        rt.setInterceptors(interceptors);
        return rt;
    }
}

