package czm.pm_solution_be.intern;

import czm.pm_solution_be.intern.InternDao.GroupRow;
import czm.pm_solution_be.intern.InternDao.InternOverviewRow;
import czm.pm_solution_be.intern.InternDao.InternProjectRow;
import czm.pm_solution_be.intern.InternDao.InternRow;
import czm.pm_solution_be.intern.InternDao.LevelRow;
import czm.pm_solution_be.intern.InternDao.StatusHistoryRow;
import czm.pm_solution_be.intern.InternDao.StatusRow;
import czm.pm_solution_be.intern.InternLevelHistoryResponse;
import czm.pm_solution_be.intern.InternStatusHistoryResponse;
import czm.pm_solution_be.intern.InternStatusUpdateRequest;
import czm.pm_solution_be.sync.SyncDao;
import czm.pm_solution_be.sync.SyncDao.InternPerformanceRow;
import czm.pm_solution_be.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Application service orchestrating intern CRUD operations, including validation,
 * level/group consistency and level history updates.
 */
@Service
public class InternService {
    private static final Logger log = LoggerFactory.getLogger(InternService.class);
    private static final int DEFAULT_PAGE = 0;
    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 100;
    /** Default status used when the caller does not specify an explicit code on create. */
    private static final String DEFAULT_STATUS_CODE = "VOLNE_CAPACITY";
    private static final Locale LOCALE_CS = Locale.forLanguageTag("cs-CZ");
    private static final DateTimeFormatter PERIOD_LABEL_FORMAT = DateTimeFormatter.ofPattern("d. M. yyyy", LOCALE_CS);

    private final InternDao dao;
    private final SyncDao syncDao;

    public InternService(InternDao dao, SyncDao syncDao) {
        this.dao = dao;
        this.syncDao = syncDao;
    }

    @Transactional
    public InternResponse create(InternRequest request) {
        NormalizedInput input = normalizeRequest(request);
        ensureUsernameUnique(input.username(), null);

        LevelRow currentLevel = input.levelsById().get(input.currentLevelId());
        if (currentLevel == null) {
            throw ApiException.validation("Zvolená úroveň neexistuje.", "level_not_found");
        }
        List<GroupRow> groups = validateGroupIds(input.groupIds());

        String resolvedStatusCode = input.statusCode() != null ? input.statusCode() : DEFAULT_STATUS_CODE;
        StatusRow status = dao.findStatus(resolvedStatusCode)
                .orElseThrow(() -> ApiException.validation("Neznámý status stážisty.", "intern_status_not_found"));

        // Persist the intern row with the resolved status code so subsequent queries read a consistent state.
        InternRow inserted = dao.insert(input.firstName(), input.lastName(), input.username(), currentLevel.id(), status.code());
        dao.replaceInternGroups(inserted.id(), input.groupIds());
        dao.replaceLevelHistory(inserted.id(), input.history().stream()
                .map(entry -> new InternDao.LevelHistoryInput(entry.levelId(), entry.validFrom(), entry.validTo()))
                .toList());
        // Immediately open the status history so auditing endpoints return a non-empty collection.
        dao.insertStatusHistory(inserted.id(), status.code(), LocalDate.now());

        InternRow row = dao.findById(inserted.id())
                .orElseThrow(() -> ApiException.internal("Stážista byl vytvořen, ale nepodařilo se načíst jeho data.", "intern_reload_failed"));
        Map<Long, List<GroupRow>> groupMap = dao.findGroupsForInternIds(List.of(row.id()));
        log.info("Intern created id={} username={} levelId={} status={}", row.id(), row.username(), row.levelId(), row.statusCode());
        return toResponse(row, groupMap.getOrDefault(row.id(), groups));
    }

    @Transactional
    public InternResponse update(long id, InternRequest request) {
        NormalizedInput input = normalizeRequest(request);
        InternRow existing = dao.findById(id)
                .orElseThrow(() -> ApiException.notFound("Stážista nebyl nalezen.", "intern"));
        ensureUsernameUnique(input.username(), existing.id());

        LevelRow level = dao.findLevel(input.currentLevelId())
                .orElseThrow(() -> ApiException.validation("Zvolená úroveň neexistuje.", "level_not_found"));
        List<GroupRow> groups = validateGroupIds(input.groupIds());

        StatusRow requestedStatus = null;
        if (input.statusCode() != null) {
            requestedStatus = dao.findStatus(input.statusCode())
                    .orElseThrow(() -> ApiException.validation("Neznámý status stážisty.", "intern_status_not_found"));
        }

        InternRow updated = dao.update(existing.id(), input.firstName(), input.lastName(), input.username(), level.id());
        dao.replaceInternGroups(updated.id(), input.groupIds());
        dao.replaceLevelHistory(updated.id(), input.history().stream()
                .map(entry -> new InternDao.LevelHistoryInput(entry.levelId(), entry.validFrom(), entry.validTo()))
                .toList());

        InternRow statusAwareRow = updated;
        if (requestedStatus != null && !Objects.equals(existing.statusCode(), requestedStatus.code())) {
            // Propagate the change into both the denormalised column and the history table.
            statusAwareRow = applyStatusChange(updated.id(), requestedStatus.code(), LocalDate.now());
        }

        if (existing.levelId() != level.id()) {
            int recalculated = syncDao.recomputeReportCostsForIntern(existing.id());
            log.info("Přepočítáno {} nákladů reportů pro stážistu {}", recalculated, updated.username());
        }

        InternRow finalRow = statusAwareRow != null ? statusAwareRow : dao.findById(updated.id())
                .orElseThrow(() -> ApiException.internal("Stážista byl upraven, ale nepodařilo se načíst jeho data.", "intern_reload_failed"));
        Map<Long, List<GroupRow>> groupMap = dao.findGroupsForInternIds(List.of(finalRow.id()));
        log.info("Intern updated id={} username={} levelId={} status={}", finalRow.id(), finalRow.username(), finalRow.levelId(), finalRow.statusCode());
        return toResponse(finalRow, groupMap.getOrDefault(finalRow.id(), groups));
    }

    @Transactional
    public void delete(long id) {
        InternRow existing = dao.findById(id)
                .orElseThrow(() -> ApiException.notFound("Stážista nebyl nalezen.", "intern"));
        int deleted = dao.delete(existing.id());
        if (deleted == 0) {
            throw ApiException.notFound("Stážista nebyl nalezen.", "intern");
        }
        log.info("Intern deleted id={} username={}", existing.id(), existing.username());
    }

    /**
     * Returns an intern with resolved level and groups.
     */
    public InternResponse get(long id) {
        InternRow row = dao.findById(id)
                .orElseThrow(() -> ApiException.notFound("Stážista nebyl nalezen.", "intern"));
        Map<Long, List<GroupRow>> groupMap = dao.findGroupsForInternIds(List.of(row.id()));
        return toResponse(row, groupMap.getOrDefault(row.id(), List.of()));
    }

    /**
     * Returns a non-paginated overview including tracked hours for each intern.
     */
    public List<InternOverviewResponse> overview() {
        List<InternOverviewRow> rows = dao.listOverview();
        List<Long> ids = rows.stream().map(InternOverviewRow::id).toList();
        Map<Long, List<GroupRow>> groupMap = dao.findGroupsForInternIds(ids);
        return rows.stream()
                .map(row -> toOverviewResponse(row, groupMap.getOrDefault(row.id(), List.of())))
                .toList();
    }

    /**
     * Produces a month-indexed grid of intern workload and cost using the shared SyncDao aggregation.
     *
     * <p>The method validates the requested date interval, transforms it into UTC offsets compatible with
     * the reporting schema (closed-open interval) and post-processes the DAO output so the REST layer
     * returns stable numeric types even for gaps without activity.</p>
     */
    public List<InternMonthlyHoursResponse> monthlyHours(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw ApiException.validation("Parametry \"from\" a \"to\" jsou povinné.", "interval_required");
        }
        if (to.isBefore(from)) {
            throw ApiException.validation("Datum \"Do\" nesmí být dříve než datum \"Od\".", "interval_invalid");
        }

        OffsetDateTime fromDateTime = from.atStartOfDay().atOffset(ZoneOffset.UTC);
        OffsetDateTime toDateTime = to.plusDays(1).atStartOfDay().atOffset(ZoneOffset.UTC);

        return syncDao.listInternMonthlyHours(fromDateTime, toDateTime).stream()
                .map(row -> {
                    OffsetDateTime monthStart = row.monthStart();
                    int year = monthStart != null ? monthStart.getYear() : 0;
                    int month = monthStart != null ? monthStart.getMonthValue() : 0;
                    return new InternMonthlyHoursResponse(
                            row.internId(),
                            row.username(),
                            row.firstName(),
                            row.lastName(),
                            monthStart,
                            year,
                            month,
                            row.hours() != null ? row.hours() : BigDecimal.ZERO,
                            row.cost() != null ? row.cost() : BigDecimal.ZERO,
                            row.levelId(),
                            row.levelCode(),
                            row.levelLabel());
                })
                .toList();
    }

    /**
     * Aggregates the worked hours per intern across recent week or month buckets for performance comparison.
     */
    public InternPerformanceResponse performance(String periodParam,
                                                 Integer periodsParam,
                                                 List<Long> internIds,
                                                 List<Long> groupIds) {
        PerformancePeriod period = PerformancePeriod.fromParameter(periodParam);
        int periods = periodsParam != null ? periodsParam : 2;
        if (periods < 2 || periods > 5) {
            throw ApiException.validation("Počet období musí být v rozmezí 2 až 5.", "performance_periods_invalid");
        }

        List<Long> sanitizedInternIds = sanitizeInternIds(internIds);
        List<Long> sanitizedGroupIds = sanitizeGroupIds(groupIds);
        List<PerformanceBucket> buckets = buildBuckets(period, periods);
        if (buckets.isEmpty()) {
            return new InternPerformanceResponse(List.of(), List.of());
        }

        Map<LocalDate, Integer> bucketIndexByStart = new HashMap<>();
        for (PerformanceBucket bucket : buckets) {
            bucketIndexByStart.put(bucket.from(), bucket.index());
        }

        OffsetDateTime from = buckets.get(0).from().atStartOfDay().atOffset(ZoneOffset.UTC);
        LocalDate lastStart = buckets.get(buckets.size() - 1).from();
        OffsetDateTime to = period.nextStart(lastStart).atStartOfDay().atOffset(ZoneOffset.UTC);

        List<InternPerformanceRow> rows = syncDao.listInternPerformance(
                from,
                to,
                period.sqlUnit(),
                sanitizedInternIds,
                sanitizedGroupIds);

        Map<Long, InternPerformanceAccumulator> accumulatorMap = new LinkedHashMap<>();
        for (InternPerformanceRow row : rows) {
            if (row.periodStart() == null) {
                continue;
            }
            LocalDate bucketStart = row.periodStart().toLocalDate();
            Integer bucketIndex = bucketIndexByStart.get(bucketStart);
            if (bucketIndex == null) {
                continue;
            }
            InternPerformanceAccumulator accumulator = accumulatorMap.computeIfAbsent(
                    row.internId(),
                    id -> new InternPerformanceAccumulator(
                            row.internId(),
                            row.username(),
                            row.firstName(),
                            row.lastName(),
                            buckets.size()));
            if (row.projectId() == null) {
                accumulator.setTotalHours(bucketIndex, row.hours());
            } else {
                accumulator.addProjectHours(bucketIndex, row.projectId(), row.projectName(), row.hours());
            }
        }

        List<InternPerformanceIntern> internRows = accumulatorMap.values().stream()
                .map(InternPerformanceAccumulator::toResponse)
                .toList();

        return new InternPerformanceResponse(buckets, internRows);
    }

    /**
     * Returns a single intern overview enriched with project workload allocations.
     */
    public InternDetailResponse overviewDetail(long id) {
        InternOverviewRow row = dao.findOverviewById(id)
                .orElseThrow(() -> ApiException.notFound("Stážista nebyl nalezen.", "intern"));
        Map<Long, List<GroupRow>> groupMap = dao.findGroupsForInternIds(List.of(row.id()));
        List<InternProjectRow> projects = dao.listProjectsForIntern(id);
        List<InternProjectAllocationResponse> allocations = projects.stream()
                .map(p -> new InternProjectAllocationResponse(
                        p.projectId(),
                        p.projectName(),
                        p.workloadHours(),
                        p.includeInReportedCost()))
                .toList();
        InternOverviewResponse base = toOverviewResponse(row, groupMap.getOrDefault(row.id(), List.of()));
        return new InternDetailResponse(
                base.id(),
                base.firstName(),
                base.lastName(),
                base.username(),
                base.levelId(),
                base.levelLabel(),
                base.statusCode(),
                base.statusLabel(),
                base.statusSeverity(),
                base.groups(),
                base.totalHours(),
                allocations);
    }

    /**
     * Applies a status change request and returns the refreshed intern payload for FE hydration.
     */
    @Transactional
    public InternResponse updateStatus(long internId, InternStatusUpdateRequest request) {
        if (request == null) {
            throw ApiException.validation("Body nesmí být prázdné.", "body_required");
        }
        String normalizedCode = normalizeStatusCode(request.statusCode());
        if (normalizedCode == null) {
            throw ApiException.validation("Status je povinný.", "intern_status_required");
        }
        LocalDate effectiveDate = request.validFrom() != null ? request.validFrom() : LocalDate.now();

        InternRow existing = dao.findById(internId)
                .orElseThrow(() -> ApiException.notFound("Stážista nebyl nalezen.", "intern"));
        StatusRow status = dao.findStatus(normalizedCode)
                .orElseThrow(() -> ApiException.validation("Neznámý status stážisty.", "intern_status_not_found"));

        InternRow updated = applyStatusChange(existing.id(), status.code(), effectiveDate);
        Map<Long, List<GroupRow>> groupMap = dao.findGroupsForInternIds(List.of(updated.id()));
        log.info("Intern status updated id={} username={} status={} effective={}", updated.id(), updated.username(), updated.statusCode(), effectiveDate);
        return toResponse(updated, groupMap.getOrDefault(updated.id(), List.of()));
    }

    public List<InternLevelHistoryResponse> getLevelHistory(long internId) {
        dao.findById(internId)
                .orElseThrow(() -> ApiException.notFound("Stážista nebyl nalezen.", "intern"));
        return dao.findLevelHistory(internId).stream()
                .map(row -> new InternLevelHistoryResponse(
                        row.id(),
                        row.levelId(),
                        row.levelCode(),
                        row.levelLabel(),
                        row.validFrom(),
                        row.validTo()))
                .toList();
    }

    /**
     * Returns the chronological history of status changes for the requested intern.
     */
    public List<InternStatusHistoryResponse> getStatusHistory(long internId) {
        dao.findById(internId)
                .orElseThrow(() -> ApiException.notFound("Stážista nebyl nalezen.", "intern"));
        return dao.findStatusHistory(internId).stream()
                .map(row -> new InternStatusHistoryResponse(
                        row.id(),
                        row.statusCode(),
                        row.statusLabel(),
                        row.statusSeverity(),
                        row.validFrom(),
                        row.validTo()))
                .toList();
    }

    /**
     * Lists interns using optional filtering, pagination and sorting.
     */
    public InternListResponse list(String q,
                                   String username,
                                   Integer pageParam,
                                   Integer sizeParam,
                                   String sortParam) {
        int page = pageParam == null ? DEFAULT_PAGE : pageParam;
        int size = sizeParam == null ? DEFAULT_SIZE : sizeParam;

        if (page < 0) {
            throw ApiException.validation("Parametr page musí být nezáporné číslo.", "page_invalid");
        }
        if (size <= 0 || size > MAX_SIZE) {
            throw ApiException.validation("Parametr size musí být v intervalu 1 až 100.", "size_invalid");
        }

        String normalizedQ = normalizeQuery(q);
        String normalizedUsername = normalizeFilterUsername(username);
        List<InternDao.SortOrder> orders = resolveSort(sortParam);

        InternDao.PageResult result = dao.list(new InternDao.InternQuery(
                normalizedQ,
                normalizedUsername,
                page,
                size,
                orders));

        List<InternRow> rows = result.rows();
        List<Long> ids = rows.stream().map(InternRow::id).toList();
        Map<Long, List<GroupRow>> groups = dao.findGroupsForInternIds(ids);

        List<InternResponse> content = rows.stream()
                .map(row -> toResponse(row, groups.getOrDefault(row.id(), List.of())))
                .toList();

        long total = result.totalElements();
        int totalPages = size == 0 ? 0 : (total == 0 ? 0 : (int) ((total + size - 1) / size));

        return new InternListResponse(content, page, size, total, totalPages);
    }

    /**
     * Exposes level references for the frontend.
     */
    public List<LevelDto> listLevels() {
        return dao.listLevels().stream()
                .map(l -> new LevelDto(l.id(), l.code(), l.label()))
                .toList();
    }

    /**
     * Exposes group references for the frontend.
     */
    public List<GroupDto> listGroups() {
        return dao.listGroups().stream()
                .map(g -> new GroupDto(g.id(), g.code(), g.label()))
                .toList();
    }

    /**
     * Exposes intern status references so FE can populate dropdowns consistently.
     */
    public List<StatusDto> listInternStatuses() {
        return dao.listStatuses().stream()
                .map(s -> new StatusDto(s.code(), s.label(), s.severity()))
                .toList();
    }

    private void ensureUsernameUnique(String username, Long selfId) {
        dao.findByUsernameIgnoreCase(username).ifPresent(existing -> {
            if (selfId == null || !Objects.equals(existing.id(), selfId)) {
                throw ApiException.conflict("Uživatelské jméno je již obsazeno.", "username_exists");
            }
        });
    }

    /**
     * Parses and sanitises incoming data before hitting the database layer.
     */
    private NormalizedInput normalizeRequest(InternRequest request) {
        if (request == null) {
            throw ApiException.validation("Body nesmí být prázdné.", "body_required");
        }
        String firstName = normalizeName(request.firstName(), true);
        String lastName = normalizeName(request.lastName(), false);
        String username = normalizeUsername(request.username());
        if (false) {
            throw ApiException.validation("Úroveň je povinná.", "level_required");
        }
        List<Long> groupIds = request.groupIds() != null ? request.groupIds() : List.of();
        List<Long> sanitized = sanitizeGroupIds(groupIds);
        List<LevelAssignmentInput> history = normalizeLevelHistory(request.levelHistory());
        String statusCode = normalizeStatusCode(request.statusCode());
        Set<Long> levelIds = history.stream().map(LevelAssignmentInput::levelId).collect(Collectors.toCollection(LinkedHashSet::new));
        List<LevelRow> levelRows = dao.findLevelsByIds(levelIds);
        Map<Long, LevelRow> levelsById = new HashMap<>();
        for (LevelRow row : levelRows) {
            levelsById.put(row.id(), row);
        }
        for (Long requestedLevelId : levelIds) {
            if (!levelsById.containsKey(requestedLevelId)) {
                throw ApiException.validation("Zvolená úroveň neexistuje.", "level_not_found");
            }
        }
        LevelAssignmentInput current = history.get(history.size() - 1);
        if (current.validTo() != null) {
            throw ApiException.validation("Aktuální úroveň musí mít nevyplněné datum do.", "level_history_current_required");
        }
        long currentLevelId = current.levelId();
        return new NormalizedInput(firstName, lastName, username, currentLevelId, sanitized, history, levelsById, statusCode);
    }

    private List<GroupRow> validateGroupIds(List<Long> groupIds) {
        if (groupIds.isEmpty()) {
            return List.of();
        }
        List<GroupRow> rows = dao.findGroupsByIds(groupIds);
        Set<Long> found = rows.stream().map(GroupRow::id).collect(java.util.stream.Collectors.toSet());
        for (Long requested : groupIds) {
            if (!found.contains(requested)) {
                throw ApiException.validation("Vybraná skupina neexistuje.", "group_not_found");
            }
        }
        return rows;
    }

    private List<LevelAssignmentInput> normalizeLevelHistory(List<InternLevelHistoryRequest> historyRequests) {
        if (historyRequests == null || historyRequests.isEmpty()) {
            throw ApiException.validation("Historie úrovní nesmí být prázdná.", "level_history_required");
        }
        List<LevelAssignmentInput> entries = new ArrayList<>();
        for (int i = 0; i < historyRequests.size(); i++) {
            InternLevelHistoryRequest item = historyRequests.get(i);
            if (item == null) {
                throw ApiException.validation("Položka historie úrovní nesmí být prázdná.", "level_history_item_required");
            }
            Long levelId = item.levelId();
            if (levelId == null) {
                throw ApiException.validation("Úroveň je povinná.", "level_required");
            }
            LocalDate validFrom = item.validFrom();
            if (validFrom == null) {
                throw ApiException.validation("Datum od je povinné.", "level_valid_from_required");
            }
            LocalDate validTo = item.validTo();
            if (validTo != null && validTo.isBefore(validFrom)) {
                throw ApiException.validation("Datum do nesmí být dříve než datum od.", "level_period_invalid");
            }
            entries.add(new LevelAssignmentInput(levelId, validFrom, validTo));
        }
        entries.sort(Comparator.comparing(LevelAssignmentInput::validFrom));

        LevelAssignmentInput openEntry = null;
        for (int i = 0; i < entries.size(); i++) {
            LevelAssignmentInput current = entries.get(i);
            if (current.validTo() == null) {
                if (openEntry != null) {
                    throw ApiException.validation("Pouze jedna úroveň může být aktuální.", "level_history_multiple_open");
                }
                openEntry = current;
                if (i != entries.size() - 1) {
                    throw ApiException.validation("Aktuální úroveň musí být poslední v pořadí.", "level_history_open_position");
                }
            }
            if (i > 0) {
                LevelAssignmentInput previous = entries.get(i - 1);
                if (previous.validTo() == null) {
                    throw ApiException.validation("Historie úrovní obsahuje překrývající se období.", "level_history_overlap");
                }
                if (!previous.validTo().isBefore(current.validFrom())) {
                    throw ApiException.validation("Historie úrovní obsahuje překrývající se období.", "level_history_overlap");
                }
            }
        }

        if (openEntry == null) {
            throw ApiException.validation("Jedna úroveň musí být aktuálně otevřená.", "level_history_open_required");
        }

        return entries;
    }

    private List<Long> sanitizeGroupIds(List<Long> source) {
        if (source == null || source.isEmpty()) {
            return List.of();
        }
        Set<Long> unique = new LinkedHashSet<>();
        for (Long id : source) {
            if (id == null) {
                throw ApiException.validation("ID skupiny nesmí být prázdné.", "group_null");
            }
            unique.add(id);
        }
        return new ArrayList<>(unique);
    }

    private List<Long> sanitizeInternIds(List<Long> source) {
        if (source == null || source.isEmpty()) {
            return List.of();
        }
        Set<Long> unique = new LinkedHashSet<>();
        for (Long id : source) {
            if (id == null) {
                throw ApiException.validation("ID stážisty nesmí být prázdné.", "intern_id_null");
            }
            if (id <= 0) {
                throw ApiException.validation("ID stážisty musí být kladné.", "intern_id_invalid");
            }
            unique.add(id);
        }
        return new ArrayList<>(unique);
    }

    private List<PerformanceBucket> buildBuckets(PerformancePeriod period, int count) {
        if (count <= 0) {
            return List.of();
        }
        LocalDate today = LocalDate.now();
        LocalDate anchor = period.alignStart(today);
        LocalDate firstStart = period.addPeriods(anchor, -(count - 1));
        List<PerformanceBucket> buckets = new ArrayList<>(count);
        for (int index = 0; index < count; index++) {
            LocalDate start = period.addPeriods(firstStart, index);
            LocalDate nextStart = period.addPeriods(start, 1);
            LocalDate endInclusive = nextStart.minusDays(1);
            String label = formatPeriodLabel(start, endInclusive);
            buckets.add(new PerformanceBucket(index, start, endInclusive, label));
        }
        return List.copyOf(buckets);
    }

    private String formatPeriodLabel(LocalDate from, LocalDate to) {
        return PERIOD_LABEL_FORMAT.format(from) + " – " + PERIOD_LABEL_FORMAT.format(to);
    }

    private String normalizeName(String value, boolean firstName) {
        if (value == null) {
            if (firstName) {
                throw ApiException.validation("Jméno je povinné.", "first_name_required");
            } else {
                throw ApiException.validation("Příjmení je povinné.", "last_name_required");
            }
        }
        String trimmed = collapseWhitespace(value.trim());
        if (trimmed.isEmpty()) {
            if (firstName) {
                throw ApiException.validation("Jméno je povinné.", "first_name_required");
            } else {
                throw ApiException.validation("Příjmení je povinné.", "last_name_required");
            }
        }
        if (trimmed.length() > 100) {
            throw ApiException.validation("Jméno a příjmení mohou mít maximálně 100 znaků.", "name_too_long");
        }
        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            if (Character.isISOControl(c)) {
                throw ApiException.validation("Jméno obsahuje neplatné znaky.", "name_invalid_chars");
            }
        }
        String digitsOnly = trimmed.replace(" ", "");
        if (!digitsOnly.isEmpty() && digitsOnly.chars().allMatch(Character::isDigit)) {
            throw ApiException.validation("Jméno nesmí být čistě numerické.", "name_numeric_only");
        }
        return trimmed;
    }

    private String collapseWhitespace(String input) {
        StringBuilder sb = new StringBuilder();
        boolean previousSpace = false;
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            if (Character.isWhitespace(c)) {
                if (!previousSpace && sb.length() > 0) {
                    sb.append(' ');
                    previousSpace = true;
                }
            } else {
                sb.append(c);
                previousSpace = false;
            }
        }
        return sb.toString();
    }

    private String normalizeUsername(String value) {
        if (value == null) {
            throw ApiException.validation("Uživatelské jméno smí obsahovat pouze malá písmena, číslice a znaky .-_ a musí mít 3–50 znaků.", "username_format");
        }
        String trimmed = value.trim().toLowerCase(Locale.ROOT);
        if (trimmed.length() < 3 || trimmed.length() > 50) {
            throw ApiException.validation("Uživatelské jméno smí obsahovat pouze malá písmena, číslice a znaky .-_ a musí mít 3–50 znaků.", "username_format");
        }
        if (!trimmed.matches("[a-z0-9._-]+")) {
            throw ApiException.validation("Uživatelské jméno smí obsahovat pouze malá písmena, číslice a znaky .-_ a musí mít 3–50 znaků.", "username_format");
        }
        return trimmed;
    }

    private String normalizeQuery(String q) {
        if (q == null) {
            return null;
        }
        String trimmed = q.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String normalizeFilterUsername(String username) {
        if (username == null) {
            return null;
        }
        String trimmed = username.trim().toLowerCase(Locale.ROOT);
        if (trimmed.isEmpty()) {
            return null;
        }
        if (!trimmed.matches("[a-z0-9._-]+")) {
            throw ApiException.validation("Parametr username obsahuje neplatné znaky.", "username_filter_invalid");
        }
        return trimmed;
    }

    /**
     * Normalises status codes to uppercase snake-case and validates allowed characters.
     */
    private String normalizeStatusCode(String statusCode) {
        if (statusCode == null) {
            return null;
        }
        String trimmed = statusCode.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        String upper = trimmed.toUpperCase(Locale.ROOT);
        if (!upper.matches("[A-Z0-9_]+")) {
            throw ApiException.validation("Status smí obsahovat pouze písmena, číslice a podtržítko.", "intern_status_invalid");
        }
        return upper;
    }

    private List<InternDao.SortOrder> resolveSort(String sortParam) {
        List<InternDao.SortOrder> orders = new ArrayList<>();
        if (sortParam == null || sortParam.isBlank()) {
            orders.add(new InternDao.SortOrder("last_name", true));
            orders.add(new InternDao.SortOrder("first_name", true));
            orders.add(new InternDao.SortOrder("id", true));
            return orders;
        }
        String[] parts = sortParam.split(",");
        if (parts.length == 0) {
            throw ApiException.validation("Parametr sort má neplatný formát.", "sort_invalid");
        }
        String field = parts[0].trim().toLowerCase(Locale.ROOT);
        String direction = parts.length > 1 ? parts[1].trim().toLowerCase(Locale.ROOT) : "asc";
        String column = switch (field) {
            case "first_name" -> "first_name";
            case "last_name" -> "last_name";
            case "username" -> "username";
            case "level" -> "level_label";
            case "id" -> "id";
            default -> throw ApiException.validation("Parametr sort obsahuje neznámé pole.", "sort_unknown_field");
        };
        boolean ascending = switch (direction) {
            case "asc" -> true;
            case "desc" -> false;
            default -> throw ApiException.validation("Parametr sort má neplatný směr. Použijte asc nebo desc.", "sort_invalid_direction");
        };
        orders.add(new InternDao.SortOrder(column, ascending));
        if (!"id".equals(column)) {
            orders.add(new InternDao.SortOrder("id", true));
        }
        return orders;
    }

    /**
     * Persists a status change atomically by updating both the current column and the history table.
     */
    private InternRow applyStatusChange(long internId, String statusCode, LocalDate effectiveDate) {
        if (effectiveDate == null) {
            throw ApiException.validation("Datum od je povinné.", "intern_status_valid_from_required");
        }
        List<StatusHistoryRow> history = dao.findStatusHistory(internId);
        StatusHistoryRow current = null;
        for (StatusHistoryRow row : history) {
            if (row.validTo() == null) {
                current = row;
            }
        }
        if (current != null) {
            if (effectiveDate.isBefore(current.validFrom())) {
                throw ApiException.validation("Datum od nesmí být dříve než aktuální otevřený záznam.", "intern_status_overlap");
            }
            if (Objects.equals(current.statusCode(), statusCode) && effectiveDate.isEqual(current.validFrom())) {
                return dao.findById(internId)
                        .orElseThrow(() -> ApiException.internal("Nepodařilo se načíst stav stážisty po změně.", "intern_status_reload_failed"));
            }
        }

        dao.closeOpenStatusHistory(internId, effectiveDate);
        dao.insertStatusHistory(internId, statusCode, effectiveDate);
        dao.updateInternStatus(internId, statusCode);

        return dao.findById(internId)
                .orElseThrow(() -> ApiException.internal("Nepodařilo se načíst stav stážisty po změně.", "intern_status_reload_failed"));
    }

    private InternResponse toResponse(InternRow row, List<GroupRow> groups) {
        List<InternGroupResponse> groupResponses = groups.stream()
                .map(g -> new InternGroupResponse(g.id(), g.code(), g.label()))
                .toList();
        return new InternResponse(
                row.id(),
                row.firstName(),
                row.lastName(),
                row.username(),
                row.levelId(),
                row.levelLabel(),
                row.statusCode(),
                row.statusLabel(),
                row.statusSeverity(),
                groupResponses);
    }

    private InternOverviewResponse toOverviewResponse(InternOverviewRow row, List<GroupRow> groups) {
        List<InternGroupResponse> groupResponses = groups.stream()
                .map(g -> new InternGroupResponse(g.id(), g.code(), g.label()))
                .toList();
        BigDecimal hours = BigDecimal.valueOf(row.totalSeconds())
                .divide(BigDecimal.valueOf(3600), 2, RoundingMode.HALF_UP);
        return new InternOverviewResponse(
                row.id(),
                row.firstName(),
                row.lastName(),
                row.username(),
                row.levelId(),
                row.levelLabel(),
                row.statusCode(),
                row.statusLabel(),
                row.statusSeverity(),
                groupResponses,
                hours);
    }

    private enum PerformancePeriod {
        WEEK("week") {
            @Override
            LocalDate alignStart(LocalDate date) {
                return date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            }

            @Override
            LocalDate addPeriods(LocalDate date, int amount) {
                return date.plusWeeks(amount);
            }
        },
        MONTH("month") {
            @Override
            LocalDate alignStart(LocalDate date) {
                return date.withDayOfMonth(1);
            }

            @Override
            LocalDate addPeriods(LocalDate date, int amount) {
                return date.plusMonths(amount);
            }
        };

        private final String sqlUnit;

        PerformancePeriod(String sqlUnit) {
            this.sqlUnit = sqlUnit;
        }

        String sqlUnit() {
            return sqlUnit;
        }

        abstract LocalDate alignStart(LocalDate date);

        abstract LocalDate addPeriods(LocalDate date, int amount);

        LocalDate nextStart(LocalDate date) {
            return addPeriods(date, 1);
        }

        static PerformancePeriod fromParameter(String value) {
            if (value == null || value.isBlank()) {
                return WEEK;
            }
            return switch (value.toLowerCase(Locale.ROOT)) {
                case "week", "weeks" -> WEEK;
                case "month", "months" -> MONTH;
                default -> throw ApiException.validation("Parametr period má neplatnou hodnotu.", "performance_period_invalid");
            };
        }
    }

    private static class InternPerformanceAccumulator {
        private final long internId;
        private final String username;
        private final String firstName;
        private final String lastName;
        private final BigDecimal[] hours;
        private final Map<Long, InternPerformanceProjectAccumulator> projects;

        InternPerformanceAccumulator(long internId, String username, String firstName, String lastName, int bucketCount) {
            this.internId = internId;
            this.username = username;
            this.firstName = firstName;
            this.lastName = lastName;
            this.hours = new BigDecimal[bucketCount];
            this.projects = new LinkedHashMap<>();
            for (int i = 0; i < bucketCount; i++) {
                this.hours[i] = BigDecimal.ZERO;
            }
        }

        void setTotalHours(int index, BigDecimal value) {
            this.hours[index] = value != null ? value : BigDecimal.ZERO;
        }

        void addProjectHours(int index, Long projectId, String projectName, BigDecimal value) {
            BigDecimal normalized = value != null ? value : BigDecimal.ZERO;
            InternPerformanceProjectAccumulator accumulator = projects.computeIfAbsent(
                    projectId,
                    id -> new InternPerformanceProjectAccumulator(id, projectName, hours.length));
            accumulator.addHours(index, normalized);
        }

        InternPerformanceIntern toResponse() {
            List<BigDecimal> values = new ArrayList<>(hours.length);
            for (BigDecimal hour : hours) {
                values.add(hour);
            }
            List<InternPerformanceProject> projectValues = projects.values().stream()
                    .map(InternPerformanceProjectAccumulator::toResponse)
                    .toList();
            return new InternPerformanceIntern(internId, username, firstName, lastName, values, projectValues);
        }
    }

    private static class InternPerformanceProjectAccumulator {
        private final Long projectId;
        private final String projectName;
        private final BigDecimal[] hours;

        InternPerformanceProjectAccumulator(Long projectId, String projectName, int bucketCount) {
            this.projectId = projectId;
            this.projectName = projectName;
            this.hours = new BigDecimal[bucketCount];
            for (int i = 0; i < bucketCount; i++) {
                this.hours[i] = BigDecimal.ZERO;
            }
        }

        void addHours(int index, BigDecimal value) {
            this.hours[index] = this.hours[index].add(value != null ? value : BigDecimal.ZERO);
        }

        InternPerformanceProject toResponse() {
            List<BigDecimal> values = new ArrayList<>(hours.length);
            for (BigDecimal hour : hours) {
                values.add(hour);
            }
            return new InternPerformanceProject(projectId, projectName, values);
        }
    }

    public record PerformanceBucket(int index, LocalDate from, LocalDate to, String label) {}

    public record InternPerformanceProject(Long projectId,
                                            String projectName,
                                            List<BigDecimal> hours) {}

    public record InternPerformanceIntern(long internId,
                                          String username,
                                          String firstName,
                                          String lastName,
                                          List<BigDecimal> hours,
                                          List<InternPerformanceProject> projects) {}

    public record InternPerformanceResponse(List<PerformanceBucket> buckets,
                                            List<InternPerformanceIntern> interns) {}

    private record NormalizedInput(String firstName,
                                   String lastName,
                                   String username,
                                   long currentLevelId,
                                   List<Long> groupIds,
                                   List<LevelAssignmentInput> history,
                                   Map<Long, LevelRow> levelsById,
                                   String statusCode) {}

    private record LevelAssignmentInput(long levelId, LocalDate validFrom, LocalDate validTo) {}

    public record LevelDto(long id, String code, String label) {}
    public record GroupDto(long id, int code, String label) {}
    public record StatusDto(String code, String label, int severity) {}
    public record InternMonthlyHoursResponse(long internId,
                                             String username,
                                             String firstName,
                                             String lastName,
                                             OffsetDateTime monthStart,
                                             int year,
                                             int month,
                                             BigDecimal hours,
                                             BigDecimal cost,
                                             Long levelId,
                                             String levelCode,
                                             String levelLabel) {}
}


