package czm.pm_solution_be.intern;

import czm.pm_solution_be.web.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class InternServiceTest {
    @Mock
    private InternDao dao;

    @InjectMocks
    private InternService service;

    @Test
    void createNormalizesAndPersists() {
        InternRequest request = new InternRequest("  Jan  ", "  de   Silva  ", "  JNoVaK  ", 1L, List.of(10L, 10L, 20L));
        when(dao.findByUsernameIgnoreCase("jnovak")).thenReturn(Optional.empty());
        when(dao.findLevel(1L)).thenReturn(Optional.of(new InternDao.LevelRow(1L, "junior", "Junior")));
        when(dao.findGroupsByIds(List.of(10L, 20L))).thenReturn(List.of(
                new InternDao.GroupRow(10L, 100, "Backend"),
                new InternDao.GroupRow(20L, 200, "Frontend")));
        InternDao.InternRow inserted = new InternDao.InternRow(1L, "Jan", "de Silva", "jnovak", 1L, "Junior");
        when(dao.insert("Jan", "de Silva", "jnovak", 1L)).thenReturn(inserted);
        when(dao.findById(1L)).thenReturn(Optional.of(inserted));
        when(dao.findGroupsForInternIds(List.of(1L))).thenReturn(Map.of(1L, List.of(
                new InternDao.GroupRow(10L, 100, "Backend"),
                new InternDao.GroupRow(20L, 200, "Frontend"))));

        InternResponse response = service.create(request);

        assertEquals(1L, response.id());
        assertEquals("Jan", response.firstName());
        assertEquals("de Silva", response.lastName());
        assertEquals("jnovak", response.username());
        assertEquals(1L, response.levelId());
        assertEquals(2, response.groups().size());

        verify(dao).replaceInternGroups(1L, List.of(10L, 20L));
        verify(dao).insertLevelHistory(eq(1L), eq(1L), any(LocalDate.class));
    }

    @Test
    void createConflictOnDuplicateUsername() {
        InternRequest request = new InternRequest("Jan", "Novák", "jnovak", 1L, List.of());
        InternDao.InternRow existing = new InternDao.InternRow(2L, "Jane", "Doe", "jnovak", 1L, "Junior");
        when(dao.findByUsernameIgnoreCase("jnovak")).thenReturn(Optional.of(existing));

        ApiException ex = assertThrows(ApiException.class, () -> service.create(request));
        assertEquals("CONFLICT", ex.getCode());
        verify(dao, never()).insert(any(), any(), any(), anyLong());
    }

    @Test
    void updateThrowsWhenNotFound() {
        InternRequest request = new InternRequest("Jan", "Novák", "jnovak", 1L, List.of());
        when(dao.findById(1L)).thenReturn(Optional.empty());

        ApiException ex = assertThrows(ApiException.class, () -> service.update(1L, request));
        assertEquals("NOT_FOUND", ex.getCode());
    }

    @Test
    void listUsesDefaults() {
        InternDao.PageResult page = new InternDao.PageResult(
                List.of(new InternDao.InternRow(1L, "Jan", "Novák", "jnovak", 1L, "Junior")),
                1L);
        when(dao.list(any())).thenReturn(page);
        when(dao.findGroupsForInternIds(List.of(1L))).thenReturn(Map.of());

        InternListResponse response = service.list(null, null, null, null, null);

        assertEquals(1, response.totalElements());
        assertEquals(1, response.totalPages());
        assertEquals(0, response.page());
        assertEquals(20, response.size());

        ArgumentCaptor<InternDao.InternQuery> captor = ArgumentCaptor.forClass(InternDao.InternQuery.class);
        verify(dao).list(captor.capture());
        InternDao.InternQuery query = captor.getValue();
        assertEquals(0, query.page());
        assertEquals(20, query.size());
        assertEquals(3, query.orders().size());
        assertEquals("last_name", query.orders().get(0).column());
        assertTrue(query.orders().get(0).ascending());
    }

    @Test
    void listRejectsOversize() {
        ApiException ex = assertThrows(ApiException.class, () -> service.list(null, null, 0, 200, null));
        assertEquals("VALIDATION", ex.getCode());
    }

    @Test
    void deleteRemovesIntern() {
        InternDao.InternRow existing = new InternDao.InternRow(1L, "Jan", "Novák", "jnovak", 1L, "Junior");
        when(dao.findById(1L)).thenReturn(Optional.of(existing));
        when(dao.delete(1L)).thenReturn(1);

        service.delete(1L);

        verify(dao).delete(1L);
    }

    @Test
    void deleteThrowsWhenMissing() {
        when(dao.findById(5L)).thenReturn(Optional.empty());

        ApiException ex = assertThrows(ApiException.class, () -> service.delete(5L));
        assertEquals("NOT_FOUND", ex.getCode());
    }
}

