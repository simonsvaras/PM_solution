package czm.pm_solution_be.web;

import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {
    private final String code;
    private final HttpStatus status;
    private final String details;

    private ApiException(String code, String message, String details, HttpStatus status) {
        super(message);
        this.code = code;
        this.status = status;
        this.details = details;
    }

    public static ApiException validation(String message) {
        return new ApiException("VALIDATION", message, null, HttpStatus.BAD_REQUEST);
    }

    public static ApiException validation(String message, String details) {
        return new ApiException("VALIDATION", message, details, HttpStatus.BAD_REQUEST);
    }

    public static ApiException conflict(String message) {
        return new ApiException("CONFLICT", message, null, HttpStatus.CONFLICT);
    }

    public static ApiException conflict(String message, String details) {
        return new ApiException("CONFLICT", message, details, HttpStatus.CONFLICT);
    }

    public static ApiException notFound(String message) {
        return new ApiException("NOT_FOUND", message, null, HttpStatus.NOT_FOUND);
    }

    public static ApiException notFound(String message, String details) {
        return new ApiException("NOT_FOUND", message, details, HttpStatus.NOT_FOUND);
    }

    public static ApiException internal(String message) {
        return new ApiException("INTERNAL", message, null, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    public static ApiException internal(String message, String details) {
        return new ApiException("INTERNAL", message, details, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    public String getCode() {
        return code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getDetails() {
        return details;
    }
}
