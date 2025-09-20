package czm.pm_solution_be.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.net.SocketTimeoutException;

@ControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiErrorResponse> handleIllegalArgument(IllegalArgumentException ex) {
        ApiErrorResponse body = ApiErrorResponse.of(
                "BAD_REQUEST",
                ex.getMessage() != null ? ex.getMessage() : "Neplatný vstup.",
                null,
                HttpStatus.BAD_REQUEST.value(),
                null);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler({MethodArgumentTypeMismatchException.class, HttpMessageNotReadableException.class, MethodArgumentNotValidException.class})
    public ResponseEntity<ApiErrorResponse> handleValidation(Exception ex) {
        ApiErrorResponse body = ApiErrorResponse.of(
                "VALIDATION",
                "Neplatný vstup. Zkontrolujte vybraný projekt a parametry.",
                ex.getMessage(),
                HttpStatus.BAD_REQUEST.value(),
                null);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler(HttpStatusCodeException.class)
    public ResponseEntity<ApiErrorResponse> handleGitLab(HttpStatusCodeException ex) {
        int status = ex.getStatusCode().value();
        String reqId = ex.getResponseHeaders() != null ? ex.getResponseHeaders().getFirst("X-Request-Id") : null;
        if (status == 429) {
            ApiErrorResponse body = ApiErrorResponse.of(
                    "RATE_LIMITED",
                    "GitLab nás dočasně omezil. Počkejte minutu a zkuste to znovu.",
                    truncate(ex.getResponseBodyAsString(), 500),
                    503,
                    reqId);
            return ResponseEntity.status(503).body(body);
        } else if (status == 404) {
            ApiErrorResponse body = ApiErrorResponse.of(
                    "NOT_FOUND",
                    "Projekt nebo issue nebylo nalezeno.",
                    truncate(ex.getResponseBodyAsString(), 500),
                    404,
                    reqId);
            return ResponseEntity.status(404).body(body);
        } else if (status >= 500) {
            ApiErrorResponse body = ApiErrorResponse.of(
                    "GITLAB_UNAVAILABLE",
                    "GitLab je teď nedostupný. Zkuste to prosím znovu.",
                    truncate(ex.getResponseBodyAsString(), 500),
                    502,
                    reqId);
            return ResponseEntity.status(502).body(body);
        } else {
            ApiErrorResponse body = ApiErrorResponse.of(
                    "BAD_REQUEST",
                    "Neplatný požadavek.",
                    truncate(ex.getResponseBodyAsString(), 500),
                    400,
                    reqId);
            return ResponseEntity.status(400).body(body);
        }
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleGeneric(Exception ex) {
        // timeouts
        Throwable cause = ex.getCause();
        if (cause instanceof SocketTimeoutException) {
            ApiErrorResponse body = ApiErrorResponse.of(
                    "TIMEOUT",
                    "GitLab je teď nedostupný. Zkuste to prosím znovu.",
                    ex.getMessage(),
                    504,
                    null);
            return ResponseEntity.status(504).body(body);
        }
        log.error("Unhandled exception", ex);
        ApiErrorResponse body = ApiErrorResponse.of(
                "UNKNOWN",
                "Nastala neočekávaná chyba. Zkuste to znovu nebo kontaktujte správce.",
                ex.getMessage(),
                500,
                null);
        return ResponseEntity.status(500).body(body);
    }

    private static String truncate(String s, int max) { if (s == null) return null; return s.length() <= max ? s : s.substring(0, max) + "..."; }
}

