package czm.pm_solution_be.web;

public class ApiErrorResponse {
    public ErrorBody error;

    public static class ErrorBody {
        public String code;
        public String message;
        public String details;
        public int httpStatus;
        public String requestId;
    }

    public static ApiErrorResponse of(String code, String message, String details, int httpStatus, String requestId) {
        ApiErrorResponse r = new ApiErrorResponse();
        r.error = new ErrorBody();
        r.error.code = code;
        r.error.message = message;
        r.error.details = details;
        r.error.httpStatus = httpStatus;
        r.error.requestId = requestId;
        return r;
    }
}

