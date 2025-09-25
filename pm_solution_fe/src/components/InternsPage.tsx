import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import './InternsPage.css';
import Modal from './Modal';
import {
  API_BASE,
  createIntern,
  deleteIntern,
  getGroups,
  getLevels,
  listInterns,
  updateIntern,
  type ErrorResponse,
  type GroupOption,
  type Intern,
  type InternListResult,
  type InternPayload,
  type LevelOption,
} from '../api';

const PAGE_SIZE = 20;
const DEFAULT_SORT = 'last_name,asc';

type FormState = { firstName: string; lastName: string; username: string; levelId: number | null; groupIds: number[] };
const emptyForm: FormState = { firstName: '', lastName: '', username: '', levelId: null, groupIds: [] };

type FormErrors = { firstName?: string; lastName?: string; username?: string; level?: string; groups?: string; general?: string };

type Mode = 'create' | 'edit';

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function validateForm(form: FormState): { valid: boolean; errors: FormErrors } {
  const errors: FormErrors = {};
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  const username = normalizeUsername(form.username);

  if (!firstName) errors.firstName = 'Jméno je povinné.';
  else if (firstName.length > 100) errors.firstName = 'Jméno může mít maximálně 100 znaků.';
  else if (/^\d+$/.test(firstName.replace(/\s+/g, ''))) errors.firstName = 'Jméno nesmí být čistě numerické.';

  if (!lastName) errors.lastName = 'Příjmení je povinné.';
  else if (lastName.length > 100) errors.lastName = 'Příjmení může mít maximálně 100 znaků.';
  else if (/^\d+$/.test(lastName.replace(/\s+/g, ''))) errors.lastName = 'Příjmení nesmí být čistě numerické.';

  if (!username) errors.username = 'Username je povinné.';
  else if (username.length < 3 || username.length > 50) errors.username = 'Username musí mít 3–50 znaků.';
  else if (!/^[a-z0-9._-]+$/.test(username)) errors.username = 'Username smí obsahovat pouze malá písmena, číslice a znaky .-_.';

  if (form.levelId === null) errors.level = 'Vyberte úroveň.';

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Top-level page component. Handles state and orchestrates API calls for the intern module.
 */
export default function InternsPage() {
  const [data, setData] = useState<InternListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [refsLoading, setRefsLoading] = useState(true);
  const [refsError, setRefsError] = useState<ErrorResponse | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('create');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ErrorResponse | null>(null);
  const [activeIntern, setActiveIntern] = useState<Intern | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // References (levels & groups) need to be fetched once per modal lifecycle
  const loadReferences = useCallback(async () => {
    setRefsLoading(true);
    setRefsError(null);
    try {
      const [levelsResponse, groupsResponse] = await Promise.all([getLevels(), getGroups()]);
      setLevels(levelsResponse);
      setGroups(groupsResponse);
    } catch (e) {
      setRefsError(e as ErrorResponse);
    } finally {
      setRefsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    if (form.levelId === null && levels.length > 0) {
      setForm(current => ({ ...current, levelId: current.levelId ?? levels[0].id }));
    }
  }, [levels, form.levelId]);

  const loadInterns = useCallback(async (targetPage: number, targetSearch: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listInterns({ q: targetSearch || undefined, page: targetPage, size: PAGE_SIZE, sort: DEFAULT_SORT });
      if (result.totalPages > 0 && targetPage >= result.totalPages) {
        setPage(result.totalPages - 1);
        setData(result);
        return;
      }
      if (result.totalPages === 0 && targetPage !== 0) {
        setPage(0);
        setData(result);
        return;
      }
      setData(result);
    } catch (e) {
      setError(e as ErrorResponse);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInterns(page, search);
  }, [loadInterns, page, search]);

  const totalPages = useMemo(() => data?.totalPages ?? 0, [data]);
  const totalElements = data?.totalElements ?? 0;

  function openCreate() {
    setMode('create');
    setModalOpen(true);
    setInfo(null);
    setForm({ ...emptyForm, levelId: levels.length > 0 ? levels[0].id : null });
    setFormErrors({});
    setSubmitError(null);
    setActiveIntern(null);
  }

  function openEdit(intern: Intern) {
    setMode('edit');
    setModalOpen(true);
    setInfo(null);
    setForm({
      firstName: intern.firstName,
      lastName: intern.lastName,
      username: intern.username,
      levelId: intern.levelId,
      groupIds: intern.groups.map(g => g.id),
    });
    setFormErrors({});
    setSubmitError(null);
    setActiveIntern(intern);
  }

  function closeModal() {
    if (submitting) return;
    setModalOpen(false);
    setSubmitError(null);
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const next = searchInput.trim();
    setSearchInput(next);
    setInfo(null);
    setPage(0);
    setSearch(next);
  }

  async function handleDelete(intern: Intern) {
    if (!confirm(`Opravdu chcete smazat stážistu ${intern.firstName} ${intern.lastName}?`)) return;
    try {
      await deleteIntern(intern.id);
      setInfo('Stážista byl smazán.');
      await loadInterns(page, search);
    } catch (e) {
      setError(e as ErrorResponse);
    }
  }

  function mapBackendError(err: ErrorResponse): FormErrors {
    const { code, details, message } = err.error;
    if (code === 'VALIDATION') {
      if (details === 'first_name_required') return { firstName: 'Jméno je povinné.' };
      if (details === 'last_name_required') return { lastName: 'Příjmení je povinné.' };
      if (details === 'username_format') return { username: 'Username smí obsahovat pouze malá písmena, číslice a znaky .-_ a mít 3–50 znaků.' };
      if (details === 'username_filter_invalid') return { username: 'Username obsahuje neplatné znaky.' };
      if (details === 'level_required') return { level: 'Vyberte úroveň.' };
      if (details === 'level_not_found') return { level: 'Zvolená úroveň neexistuje.' };
      if (details === 'group_not_found' || details === 'group_null') return { groups: 'Vyberte platné skupiny.' };
      if (details === 'body_required') return { general: 'Tělo požadavku nesmí být prázdné.' };
      return { general: message };
    }
    if (code === 'CONFLICT' && details === 'username_exists') {
      return { username: 'Uživatelské jméno je již obsazeno.' };
    }
    return { general: message };
  }

  // Persist the form; handles both create and update flows
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const normalizedUsername = normalizeUsername(form.username);
    const validation = validateForm({ ...form, username: normalizedUsername });
    if (!validation.valid) {
      setFormErrors(validation.errors);
      return;
    }
    if (form.levelId === null) {
      setFormErrors(current => ({ ...current, level: 'Vyberte úroveň.' }));
      return;
    }
    setFormErrors({});
    setSubmitting(true);
    try {
      const uniqueGroupIds = Array.from(new Set(form.groupIds));
      const payload: InternPayload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        username: normalizedUsername,
        levelId: form.levelId,
        groupIds: uniqueGroupIds,
      };
      if (mode === 'edit' && activeIntern) {
        await updateIntern(activeIntern.id, payload);
        setInfo('Stážista byl aktualizován.');
        await loadInterns(page, search);
      } else {
        await createIntern(payload);
        setInfo('Stážista byl vytvořen.');
        setPage(0);
        await loadInterns(0, search);
      }
      setModalOpen(false);
    } catch (e) {
      const err = e as ErrorResponse;
      setSubmitError(err);
      setFormErrors(mapBackendError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel__body">
        <div className="interns-toolbar">
          <button onClick={openCreate} disabled={refsLoading || !!refsError}>+ Přidat stážistu</button>
          <form className="interns-search" onSubmit={handleSearchSubmit} role="search">
            <label htmlFor="interns-search-input" className="visually-hidden">Hledat stážistu</label>
            <input
              id="interns-search-input"
              type="search"
              placeholder="Hledat jméno nebo username"
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
            />
            <button type="submit">Hledat</button>
          </form>
        </div>

        {refsLoading && (
          <div className="inline-status"><span className="spinner" /> Načítám referenční data…</div>
        )}

        {refsError && (
          <div className="card-summary card-summary--error">
            <b className="error">Chyba</b>
            <p>{refsError.error.message}<br /><small>kód: {refsError.error.code}</small></p>
          </div>
        )}

        {info && (
          <div className="card-summary">
            <b>Hotovo</b>
            <p>{info}</p>
          </div>
        )}

        {loading && (
          <div className="inline-status"><span className="spinner" /> Načítám stážisty…</div>
        )}

        {error && (
          <div className="card-summary card-summary--error">
            <b className="error">Chyba</b>
            <p>{error.error.message}<br /><small>kód: {error.error.code}</small></p>
          </div>
        )}

        <div className="interns-tableWrapper">
          <table className="interns-table">
            <thead>
              <tr>
                <th>Jméno</th>
                <th>Příjmení</th>
                <th>Username</th>
                <th>Úroveň</th>
                <th>Skupiny</th>
                <th className="interns-table__actions">Akce</th>
              </tr>
            </thead>
            <tbody>
              {(data?.content ?? []).map(intern => (
                <tr key={intern.id}>
                  <td>{intern.firstName}</td>
                  <td>{intern.lastName}</td>
                  <td><code>{intern.username}</code></td>
                  <td>{intern.levelLabel}</td>
                  <td className="interns-table__groups">{intern.groups.length > 0 ? intern.groups.map(g => g.label).join(', ') : '—'}</td>
                  <td className="interns-table__actions">
                    <button type="button" onClick={() => openEdit(intern)}>Upravit</button>
                    <button type="button" className="danger" onClick={() => handleDelete(intern)}>Smazat</button>
                  </td>
                </tr>
              ))}
              {(!data || data.content.length === 0) && !loading && (
                <tr>
                  <td colSpan={6} className="interns-table__empty">
                    {search ? 'Nenašli jsme žádné stážisty pro zadané filtrování.' : 'Zatím nejsou evidováni žádní stážisti.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="interns-pagination">
          <button
            type="button"
            disabled={loading || page === 0}
            onClick={() => { setInfo(null); setPage(prev => Math.max(0, prev - 1)); }}
          >
            Předchozí
          </button>
          <span>
            Stránka {totalPages === 0 ? 0 : page + 1} / {totalPages || 0}
            {totalElements > 0 ? ` • ${totalElements} celkem` : ''}
          </span>
          <button
            type="button"
            disabled={loading || totalPages === 0 || page >= totalPages - 1}
            onClick={() => { setInfo(null); setPage(prev => prev + 1); }}
          >
            Další
          </button>
        </div>

        <div className="panel__footer">
          <small>API: {API_BASE}</small>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={mode === 'edit' ? 'Upravit stážistu' : 'Přidat stážistu'}>
        <form onSubmit={handleSubmit} className="interns-form">
          <div className="field">
            <label htmlFor="intern-first-name">Jméno</label>
            <input
              id="intern-first-name"
              type="text"
              value={form.firstName}
              onChange={event => setForm(current => ({ ...current, firstName: event.target.value }))}
              autoFocus
            />
            {formErrors.firstName && <div className="errorText">{formErrors.firstName}</div>}
          </div>
          <div className="field">
            <label htmlFor="intern-last-name">Příjmení</label>
            <input
              id="intern-last-name"
              type="text"
              value={form.lastName}
              onChange={event => setForm(current => ({ ...current, lastName: event.target.value }))}
            />
            {formErrors.lastName && <div className="errorText">{formErrors.lastName}</div>}
          </div>
          <div className="field">
            <label htmlFor="intern-username">Username</label>
            <input
              id="intern-username"
              type="text"
              value={form.username}
              onChange={event => setForm(current => ({ ...current, username: normalizeUsername(event.target.value) }))}
            />
            {formErrors.username && <div className="errorText">{formErrors.username}</div>}
          </div>
          <div className="field">
            <span>Úroveň</span>
            <div className="interns-levels">
              {levels.map(level => (
                <label key={level.id} className="radio">
                  <input
                    type="radio"
                    name="intern-level"
                    value={level.id}
                    checked={form.levelId === level.id}
                    onChange={() => setForm(current => ({ ...current, levelId: level.id }))}
                    disabled={submitting}
                  />
                  <span>{level.label}</span>
                </label>
              ))}
              {levels.length === 0 && !refsLoading && <span className="notice">Žádné úrovně nejsou k dispozici.</span>}
            </div>
            {formErrors.level && <div className="errorText">{formErrors.level}</div>}
          </div>
          <div className="field">
            <span>Skupiny</span>
            <div className="interns-groups">
              {groups.map(group => (
                <label key={group.id} className="checkbox">
                  <input
                    type="checkbox"
                    value={group.id}
                    checked={form.groupIds.includes(group.id)}
                    onChange={event => {
                      const checked = event.target.checked;
                      setForm(current => {
                        const currentIds = new Set(current.groupIds);
                        if (checked) currentIds.add(group.id);
                        else currentIds.delete(group.id);
                        return { ...current, groupIds: Array.from(currentIds) };
                      });
                    }}
                    disabled={submitting}
                  />
                  <span>{group.label}</span>
                </label>
              ))}
              {groups.length === 0 && !refsLoading && <span className="notice">Žádné skupiny nejsou k dispozici.</span>}
            </div>
            {formErrors.groups && <div className="errorText">{formErrors.groups}</div>}
          </div>
          {formErrors.general && <div className="errorText">{formErrors.general}</div>}
          {submitError && !formErrors.general && (
            <div className="errorText">
              {submitError.error.message} (kód: {submitError.error.code})
            </div>
          )}
          <div className="modal__footer">
            <button type="button" className="btn" onClick={closeModal} disabled={submitting}>Zrušit</button>
            <button type="submit" className="btn btn--primary" disabled={submitting || refsLoading || !!refsError}>
              {mode === 'edit' ? 'Uložit změny' : 'Vytvořit'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

