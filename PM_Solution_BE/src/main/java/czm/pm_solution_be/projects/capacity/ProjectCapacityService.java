package czm.pm_solution_be.projects.capacity;

import czm.pm_solution_be.projects.capacity.ProjectCapacityRepository.CapacityStatusRow;
import czm.pm_solution_be.projects.capacity.ProjectCapacityRepository.ProjectCapacityRow;
import czm.pm_solution_be.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Application service orchestrating validation and orchestration for project capacity reports.
 */
@Service
public class ProjectCapacityService {
    private static final Logger log = LoggerFactory.getLogger(ProjectCapacityService.class);
    /** Výchozí stránka pokud FE nezadá parametr (zarovnání na FE grid). */
    private static final int DEFAULT_PAGE = 0;
    /** FE očekává stránkování po 20 záznamech – držíme stejnou hodnotu i na BE. */
    private static final int DEFAULT_SIZE = 20;
    /** Horní hranice pro ochranu DB – větší dávky by měly používat export/cursor. */
    private static final int MAX_SIZE = 100;
    /** Maximální délka poznámky, aby se payload vešel do stávajících FE komponent. */
    private static final int MAX_NOTE_LENGTH = 1000;

    private final ProjectCapacityRepository repository;

    public ProjectCapacityService(ProjectCapacityRepository repository) {
        this.repository = repository;
    }

    // NOTE: Unit tests budou doplněny v následném kroku po stabilizaci API kontraktu.

    /**
     * Persistuje nový záznam o kapacitě včetně validací proti referenčním tabulkám.
     *
     * <p>Metoda je synchronní a navržená tak, aby ji bylo možné znovupoužít i z plánovaných batch jobů – návratová
     * hodnota obsahuje kompletně obohacená data a lze ji poslat přímo FE nebo použít pro audit.</p>
     */
    public ProjectCapacityEntry reportCapacity(long projectId,
                                               List<String> statusCodes,
                                               String note) {
        Set<String> distinctCodes = sanitizeStatusCodes(statusCodes);
        if (distinctCodes.isEmpty()) {
            throw ApiException.validation("Vyberte alespoň jeden kapacitní stav.", "status_required");
        }
        validateNoteLength(note);

        if (!repository.projectExists(projectId)) {
            throw ApiException.notFound("Projekt pro report kapacit nebyl nalezen.", "project");
        }
        for (String code : distinctCodes) {
            if (!repository.statusExists(code)) {
                throw ApiException.validation("Neznámý kapacitní status.", "capacity_status");
            }
        }

        // TODO: extend audit logging once unified audit service is available
        ProjectCapacityRow row = repository.insertReport(projectId, List.copyOf(distinctCodes), note);
        log.info("Kapacitní status projektu {} nastaven na {}", projectId, distinctCodes);
        return toEntry(row);
    }

    /**
     * Vrací aktuální stav projektu – využívá indexované pořadí (reported_at DESC, id DESC).
     *
     * <p>Vrací 404 pokud neexistuje žádný report, čímž explicitně signalizujeme FE, že má zobrazit fallback.</p>
     */
    public ProjectCapacityEntry getCurrentCapacity(long projectId) {
        if (!repository.projectExists(projectId)) {
            throw ApiException.notFound("Projekt pro report kapacit nebyl nalezen.", "project");
        }
        return repository.findCurrent(projectId)
                .map(this::toEntry)
                .orElseThrow(() -> ApiException.notFound("Projekt zatím nemá žádný kapacitní report.", "capacity_report_not_found"));
    }

    /**
     * Stránkovaný výpis historie včetně filtrů na časové období.
     *
     * <p>Výsledek obsahuje total count, aby se FE nemuselo dotazovat dvakrát. Parametry jsou navrženy tak, aby se
     * daly snadno mapovat na REST query parametry i na potenciální GraphQL resolver.</p>
     */
    public CapacityHistoryResult listCapacityHistory(long projectId,
                                                     OffsetDateTime from,
                                                     OffsetDateTime to,
                                                     Integer page,
                                                     Integer size) {
        if (!repository.projectExists(projectId)) {
            throw ApiException.notFound("Projekt pro report kapacit nebyl nalezen.", "project");
        }
        OffsetDateTime fromDate = from;
        OffsetDateTime toDate = to;
        if (fromDate != null && toDate != null && toDate.isBefore(fromDate)) {
            throw ApiException.validation("Parametr 'to' nesmí být dříve než 'from'.", "interval_invalid");
        }
        // Stránkování je tolerantní k záporným hodnotám z URL – normalizujeme je na 0, aby FE nedostalo 400.
        int resolvedPage = page != null ? Math.max(page, 0) : DEFAULT_PAGE; // záporné hodnoty normalizujeme na 0
        int requestedSize = size != null ? size : DEFAULT_SIZE;
        if (requestedSize <= 0) {
            throw ApiException.validation("Parametr 'size' musí být kladný.", "page_size_invalid");
        }
        int resolvedSize = Math.min(requestedSize, MAX_SIZE);
        int offset;
        try {
            // multiplyExact chrání proti přetečení při extrémním stránkování (např. při útocích).
            offset = Math.multiplyExact(resolvedPage, resolvedSize);
        } catch (ArithmeticException ex) {
            throw ApiException.validation("Parametry stránkování jsou příliš velké.", "pagination_overflow");
        }

        List<ProjectCapacityEntry> items = repository.listHistory(projectId, fromDate, toDate, resolvedSize, offset).stream()
                .map(this::toEntry)
                .collect(Collectors.toList());
        // Total count vracíme i při prázdném seznamu – FE díky tomu může skrýt stránkování.
        long total = repository.countHistory(projectId, fromDate, toDate);
        return new CapacityHistoryResult(items, total, resolvedPage, resolvedSize);
    }

    private Set<String> sanitizeStatusCodes(List<String> statusCodes) {
        if (statusCodes == null) {
            return Set.of();
        }
        LinkedHashSet<String> result = new LinkedHashSet<>();
        for (String code : statusCodes) {
            if (code == null) {
                continue;
            }
            String trimmed = code.trim();
            if (!trimmed.isEmpty()) {
                result.add(trimmed);
            }
        }
        return result;
    }

    private void validateNoteLength(String note) {
        if (note != null && note.length() > MAX_NOTE_LENGTH) {
            // Vracíme validaci s konkrétním kódem, FE může zobrazit lokalizovanou hlášku.
            throw ApiException.validation("Poznámka nesmí přesáhnout " + MAX_NOTE_LENGTH + " znaků.", "note_too_long");
        }
    }

    private ProjectCapacityEntry toEntry(ProjectCapacityRow row) {
        List<ProjectCapacityStatus> statuses = row.statuses().stream()
                .map(status -> new ProjectCapacityStatus(status.code(), status.label(), status.severity()))
                .collect(Collectors.toList());
        return new ProjectCapacityEntry(row.id(), row.projectId(), row.reportedAt(), row.note(), statuses);
    }

    public record ProjectCapacityEntry(long id,
                                       long projectId,
                                       OffsetDateTime reportedAt,
                                       String note,
                                       List<ProjectCapacityStatus> statuses) {}

    public record ProjectCapacityStatus(String code, String label, int severity) {}

    public record CapacityHistoryResult(List<ProjectCapacityEntry> items,
                                        long totalElements,
                                        int page,
                                        int size) {}
}
