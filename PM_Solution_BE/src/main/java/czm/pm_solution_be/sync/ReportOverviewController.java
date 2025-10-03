package czm.pm_solution_be.sync;

import czm.pm_solution_be.web.ApiException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/sync/reports")
public class ReportOverviewController {
    private final SyncDao dao;

    public ReportOverviewController(SyncDao dao) {
        this.dao = dao;
    }

    public record ReportOverviewItem(String issueTitle,
                                     String repositoryName,
                                     String username,
                                     OffsetDateTime spentAt,
                                     BigDecimal timeSpentHours,
                                     BigDecimal cost,
                                     Boolean projectIsExternal) {}

    @GetMapping("/overview")
    public List<ReportOverviewItem> overview(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            @RequestParam(name = "untracked_only", defaultValue = "false") boolean untrackedOnly) {
        if (from != null && to != null && from.isAfter(to)) {
            throw ApiException.validation("Parametr \"od\" nesmí být později než \"do\".");
        }
        return dao.listReportOverview(from, to, untrackedOnly).stream()
                .map(row -> new ReportOverviewItem(
                        row.issueTitle(),
                        row.repositoryName(),
                        row.resolvedUsername(),
                        row.spentAt(),
                        row.timeSpentHours(),
                        row.cost(),
                        row.projectIsExternal()
                ))
                .toList();
    }
}
