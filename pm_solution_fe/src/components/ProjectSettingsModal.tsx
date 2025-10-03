import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import './ProjectSettingsModal.css';
import './ManageProjectInternsModal.css';
import './ManageRepositoriesModal.css';
import {
  getProjects,
  getRepositoryNamespaces,
  getProjectInterns,
  getProjectRepositories,
  updateProject,
  updateProjectInterns,
  updateProjectRepositories,
  type ErrorResponse,
  type ProjectBudgetPayload,
  type ProjectDTO,
  type ProjectNamespaceOption,
  type ProjectOverviewDTO,
  type ProjectInternAssignmentDTO,
  type ProjectInternUpdatePayload,
  type RepositoryAssignmentDTO,
} from '../api';

type ProjectSettingsModalProps = {
  project: ProjectOverviewDTO;
  isOpen: boolean;
  onClose: () => void;
  onProjectUpdated: (next: ProjectOverviewDTO) => void;
  onTeamUpdated: () => void;
};

type SettingsTab = 'general' | 'team' | 'repositories';

type GeneralSectionState = {
  loading: boolean;
  error: string | null;
  saving: boolean;
  saveError: ErrorResponse | null;
};

function validateName(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = (raw || '').trim();
  if (!value) return { ok: false, error: 'Název je povinný.' };
  if (value.length > 200) return { ok: false, error: 'Název je příliš dlouhý (max 200 znaků).' };
  return { ok: true, value };
}

function parseBudget(raw: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, error: 'Rozpočet musí být nezáporné číslo.' };
  }
  return { ok: true, value: parsed };
}

function normaliseDate(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export default function ProjectSettingsModal({
  project,
  isOpen,
  onClose,
  onProjectUpdated,
  onTeamUpdated,
}: ProjectSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [projectDetail, setProjectDetail] = useState<ProjectDTO | null>(null);
  const [detailState, setDetailState] = useState<GeneralSectionState>({
    loading: false,
    error: null,
    saving: false,
    saveError: null,
  });
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [budget, setBudget] = useState('');
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [budgetFrom, setBudgetFrom] = useState('');
  const [budgetTo, setBudgetTo] = useState('');
  const [budgetRangeError, setBudgetRangeError] = useState<string | null>(null);
  const [isExternal, setIsExternal] = useState(false);
  const [hourlyRate, setHourlyRate] = useState('');
  const [hourlyRateError, setHourlyRateError] = useState<string | null>(null);
  const [namespaceOptions, setNamespaceOptions] = useState<ProjectNamespaceOption[]>([]);
  const [namespaceLoading, setNamespaceLoading] = useState(false);
  const [namespaceError, setNamespaceError] = useState<string | null>(null);
  const [selectedNamespaceName, setSelectedNamespaceName] = useState<string | null>(null);
  const [selectedNamespaceId, setSelectedNamespaceId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('general');
  }, [isOpen, project.id]);

  useEffect(() => {
    if (!isOpen) return;
    setDetailState(prev => ({ ...prev, loading: true, error: null, saveError: null }));
    getProjects()
      .then(list => {
        const match = list.find(item => item.id === project.id) ?? null;
        if (!match) {
          setDetailState({ loading: false, error: 'Nepodařilo se načíst detail projektu.', saving: false, saveError: null });
          setProjectDetail(null);
          return;
        }
        setProjectDetail(match);
        setName(match.name);
        setNameError(null);
        setBudget(match.budget !== null && match.budget !== undefined ? String(match.budget) : '');
        setBudgetError(null);
        setBudgetFrom(match.budgetFrom ?? '');
        setBudgetTo(match.budgetTo ?? '');
        setBudgetRangeError(null);
        setSelectedNamespaceId(match.namespaceId ?? null);
        setSelectedNamespaceName(match.namespaceName ?? null);
        setIsExternal(match.isExternal ?? false);
        setHourlyRate(match.hourlyRateCzk != null ? String(match.hourlyRateCzk) : '');
        setHourlyRateError(null);
        setDetailState({ loading: false, error: null, saving: false, saveError: null });
      })
      .catch(err => {
        const error = err as ErrorResponse;
        const message = error?.error?.message ?? 'Nepodařilo se načíst detail projektu.';
        setDetailState({ loading: false, error: message, saving: false, saveError: null });
      });
  }, [isOpen, project.id]);

  useEffect(() => {
    if (!isOpen) return;
    setNamespaceLoading(true);
    setNamespaceError(null);
    getRepositoryNamespaces()
      .then(list => setNamespaceOptions(list))
      .catch(err => {
        const error = err as ErrorResponse;
        setNamespaceError(error?.error?.message ?? 'Nepodařilo se načíst namespaces.');
      })
      .finally(() => setNamespaceLoading(false));
  }, [isOpen]);

  const effectiveNamespaceOptions = useMemo(() => {
    if (!selectedNamespaceName) return namespaceOptions;
    const exists = namespaceOptions.some(opt => opt.namespaceName === selectedNamespaceName);
    if (exists) return namespaceOptions;
    return [...namespaceOptions, { namespaceId: selectedNamespaceId, namespaceName: selectedNamespaceName }].sort((a, b) =>
      a.namespaceName.localeCompare(b.namespaceName, 'cs'),
    );
  }, [namespaceOptions, selectedNamespaceId, selectedNamespaceName]);

  function handleSelectNamespace(value: string) {
    if (!value) {
      setSelectedNamespaceId(null);
      setSelectedNamespaceName(null);
      return;
    }
    const option = namespaceOptions.find(opt => opt.namespaceName === value) ?? null;
    setSelectedNamespaceId(option?.namespaceId ?? selectedNamespaceId ?? null);
    setSelectedNamespaceName(value);
  }

  async function handleSaveGeneral() {
    if (!projectDetail) return;
    setDetailState(prev => ({ ...prev, saving: true, saveError: null }));
    setBudgetError(null);
    setBudgetRangeError(null);
    setHourlyRateError(null);
    const validation = validateName(name);
    if (!validation.ok) {
      setNameError(validation.error);
      setDetailState(prev => ({ ...prev, saving: false }));
      return;
    }
    setNameError(null);

    const parsedBudget = parseBudget(budget);
    if (!parsedBudget.ok) {
      setBudgetError(parsedBudget.error);
      setDetailState(prev => ({ ...prev, saving: false }));
      return;
    }

    const normalizedFrom = normaliseDate(budgetFrom);
    const normalizedTo = normaliseDate(budgetTo);
    if (normalizedFrom && normalizedTo && normalizedFrom > normalizedTo) {
      setBudgetRangeError('Datum "od" nesmí být později než datum "do".');
      setDetailState(prev => ({ ...prev, saving: false }));
      return;
    }

    let parsedHourlyRate: number | null = null;
    if (isExternal) {
      if (!hourlyRate.trim()) {
        setHourlyRateError('Hodinová sazba je povinná pro externí projekt.');
        setDetailState(prev => ({ ...prev, saving: false }));
        return;
      }
      const parsedRate = Number(hourlyRate);
      if (!Number.isFinite(parsedRate) || parsedRate < 0) {
        setHourlyRateError('Hodinová sazba musí být nezáporné číslo.');
        setDetailState(prev => ({ ...prev, saving: false }));
        return;
      }
      parsedHourlyRate = parsedRate;
    }

    const payload: ProjectBudgetPayload = {
      name: validation.value,
      budget: parsedBudget.value,
      budgetFrom: normalizedFrom,
      budgetTo: normalizedTo,
      namespaceId: selectedNamespaceName ? selectedNamespaceId ?? null : null,
      namespaceName: selectedNamespaceName ?? null,
      isExternal,
      hourlyRateCzk: isExternal ? parsedHourlyRate : null,
    };

    try {
      const updated = await updateProject(projectDetail.id, payload);
      setProjectDetail(updated);
      setIsExternal(updated.isExternal ?? false);
      setHourlyRate(updated.hourlyRateCzk != null ? String(updated.hourlyRateCzk) : '');
      setHourlyRateError(null);
      const overview: ProjectOverviewDTO = {
        id: project.id,
        name: updated.name,
        budget: updated.budget,
        budgetFrom: updated.budgetFrom,
        budgetTo: updated.budgetTo,
        reportedCost: project.reportedCost,
        teamMembers: project.teamMembers,
        openIssues: project.openIssues,
        isExternal: updated.isExternal,
        hourlyRateCzk: updated.hourlyRateCzk,
      };
      onProjectUpdated(overview);
      onClose();
    } catch (error) {
      setDetailState(prev => ({ ...prev, saveError: error as ErrorResponse, saving: false }));
      return;
    }
    setDetailState(prev => ({ ...prev, saving: false }));
  }

  const generalFooter = (
    <div className="projectSettings__footer">
      <button type="button" className="btn" onClick={onClose} disabled={detailState.saving}>Zavřít</button>
      <button
        type="button"
        className="btn btn--primary"
        onClick={handleSaveGeneral}
        disabled={detailState.saving || detailState.loading}
      >
        Uložit
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Nastavení projektu - ${project.name}`}
      className="modal--wide projectSettingsModal"
      bodyClassName="modal__body--settings"
    >
      <div className="projectSettings">
        <nav className="projectSettings__nav" aria-label="Sekce nastavení projektu">
          <button
            type="button"
            className={`projectSettings__navItem ${activeTab === 'general' ? 'projectSettings__navItem--active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            Obecné
          </button>
          <button
            type="button"
            className={`projectSettings__navItem ${activeTab === 'team' ? 'projectSettings__navItem--active' : ''}`}
            onClick={() => setActiveTab('team')}
          >
            Tým
          </button>
          <button
            type="button"
            className={`projectSettings__navItem ${activeTab === 'repositories' ? 'projectSettings__navItem--active' : ''}`}
            onClick={() => setActiveTab('repositories')}
          >
            Repozitáře
          </button>
        </nav>
        <div className="projectSettings__content">
          {activeTab === 'general' && (
            <section className="projectSettings__section" aria-label="Obecné nastavení projektu">
              {detailState.loading ? (
                <div className="inline-status"><span className="spinner" /> Načítám detail projektu…</div>
              ) : detailState.error ? (
                <div className="card-summary card-summary--error">
                  <b className="error">Chyba</b>
                  <p>{detailState.error}</p>
                </div>
              ) : projectDetail ? (
                <>
                  <div className="field">
                    <label htmlFor="project-settings-name">Název projektu</label>
                    <input
                      id="project-settings-name"
                      type="text"
                      value={name}
                      onChange={event => setName(event.target.value)}
                      placeholder="Zadejte název"
                      autoFocus
                    />
                    {nameError && <div className="errorText">{nameError}</div>}
                  </div>
                  <div className="field">
                    <label htmlFor="project-settings-budget">Rozpočet (CZK)</label>
                    <input
                      id="project-settings-budget"
                      type="number"
                      min="0"
                      step="1"
                      value={budget}
                      onChange={event => setBudget(event.target.value)}
                      placeholder="Např. 250000"
                    />
                    {budgetError && <div className="errorText">{budgetError}</div>}
                  </div>
                  <div className="field field--checkbox">
                    <label htmlFor="project-settings-is-external">
                      <input
                        id="project-settings-is-external"
                        type="checkbox"
                        checked={isExternal}
                        onChange={event => {
                          setIsExternal(event.target.checked);
                          if (!event.target.checked) {
                            setHourlyRate('');
                            setHourlyRateError(null);
                          }
                        }}
                      />
                      {' '}Je projekt externí?
                    </label>
                  </div>
                  {isExternal && (
                    <div className="field">
                      <label htmlFor="project-settings-hourly-rate">Hodinová sazba (CZK/h)</label>
                      <input
                        id="project-settings-hourly-rate"
                        type="number"
                        min="0"
                        step="1"
                        value={hourlyRate}
                        onChange={event => {
                          setHourlyRate(event.target.value);
                          setHourlyRateError(null);
                        }}
                        placeholder="Např. 1200"
                      />
                      {hourlyRateError && <div className="errorText">{hourlyRateError}</div>}
                    </div>
                  )}
                  <div className="field field--inline">
                    <div>
                      <label htmlFor="project-settings-budget-from">Rozpočet od</label>
                      <input
                        id="project-settings-budget-from"
                        type="date"
                        value={budgetFrom}
                        onChange={event => setBudgetFrom(event.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="project-settings-budget-to">Rozpočet do</label>
                      <input
                        id="project-settings-budget-to"
                        type="date"
                        value={budgetTo}
                        onChange={event => setBudgetTo(event.target.value)}
                      />
                    </div>
                  </div>
                  {budgetRangeError && <div className="errorText">{budgetRangeError}</div>}
                  <div className="field">
                    <label htmlFor="project-settings-namespace">Namespace (volitelné)</label>
                    <select
                      id="project-settings-namespace"
                      value={selectedNamespaceName ?? ''}
                      onChange={event => handleSelectNamespace(event.target.value)}
                      disabled={namespaceLoading}
                    >
                      <option value="">Bez namespace</option>
                      {effectiveNamespaceOptions.map(opt => (
                        <option key={opt.namespaceName} value={opt.namespaceName}>
                          {opt.namespaceName}
                        </option>
                      ))}
                    </select>
                    {namespaceLoading && (
                      <div className="inline-status"><span className="spinner" /> Načítám namespaces…</div>
                    )}
                    {namespaceError && <div className="errorText">{namespaceError}</div>}
                  </div>
                  {detailState.saveError && (
                    <div className="errorText">
                      {detailState.saveError.error.message} (kód: {detailState.saveError.error.code})
                    </div>
                  )}
                  {generalFooter}
                </>
              ) : null}
            </section>
          )}
          {activeTab === 'team' && (
            <ProjectSettingsTeamSection
              projectId={project.id}
              projectName={project.name}
              isOpen={isOpen}
              onClose={onClose}
              onSaved={() => {
                onTeamUpdated();
                onClose();
              }}
            />
          )}
          {activeTab === 'repositories' && (
            <ProjectSettingsRepositoriesSection
              projectId={project.id}
              projectName={project.name}
              isOpen={isOpen}
              onClose={onClose}
              onSaved={onClose}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

type TeamSectionProps = {
  projectId: number;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function ProjectSettingsTeamSection({ projectId, projectName, isOpen, onClose, onSaved }: TeamSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [interns, setInterns] = useState<ProjectInternAssignmentDTO[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [internCache, setInternCache] = useState<Map<number, ProjectInternAssignmentDTO>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ErrorResponse | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [invalidWorkloads, setInvalidWorkloads] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    const handle = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(handle);
  }, [search, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setSaveError(null);
    getProjectInterns(projectId, debouncedSearch)
      .then(result => {
        const normalised = result.map(item => ({
          ...item,
          includeInReportedCost: item.includeInReportedCost !== false,
        }));
        setInterns(normalised);
        setInternCache(prev => {
          const next = new Map(prev);
          normalised.forEach(item => next.set(item.id, item));
          return next;
        });
        const preset = new Set<number>();
        normalised.forEach(entry => { if (entry.assigned) preset.add(entry.id); });
        setSelected(preset);
        setInvalidWorkloads(new Set());
      })
      .catch(err => setError(err as ErrorResponse))
      .finally(() => setLoading(false));
  }, [isOpen, projectId, debouncedSearch]);

  useEffect(() => {
    if (isOpen) return;
    setInterns([]);
    setSelected(new Set());
    setLoading(false);
    setError(null);
    setSaveError(null);
    setLocalError(null);
    setSearch('');
    setDebouncedSearch('');
    setInternCache(new Map());
    setInvalidWorkloads(new Set());
  }, [isOpen]);

  const allSelected = useMemo(
    () => interns.length > 0 && interns.every(intern => selected.has(intern.id)),
    [interns, selected],
  );

  const assignedList = useMemo(() => {
    const items: ProjectInternAssignmentDTO[] = [];
    selected.forEach(id => {
      const entry = internCache.get(id);
      if (entry) items.push(entry);
    });
    return items.sort((a, b) => {
      const labelA = `${a.lastName} ${a.firstName}`.trim();
      const labelB = `${b.lastName} ${b.firstName}`.trim();
      return labelA.localeCompare(labelB, 'cs');
    });
  }, [selected, internCache]);

  function toggleIntern(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setInvalidWorkloads(prevInvalid => {
          const nextInvalid = new Set(prevInvalid);
          nextInvalid.delete(id);
          return nextInvalid;
        });
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll(next: boolean) {
    if (next) {
      setSelected(prev => {
        const merged = new Set(prev);
        interns.forEach(i => merged.add(i.id));
        return merged;
      });
    } else {
      setSelected(prev => {
        const reduced = new Set(prev);
        interns.forEach(i => reduced.delete(i.id));
        setInvalidWorkloads(prevInvalid => {
          const nextInvalid = new Set(prevInvalid);
          interns.forEach(i => nextInvalid.delete(i.id));
          return nextInvalid;
        });
        return reduced;
      });
    }
  }

  function removeIntern(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setInvalidWorkloads(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function updateWorkload(id: number, value: string) {
    setLocalError(null);
    setInternCache(prev => {
      const existing = prev.get(id);
      if (!existing) return prev;
      const next = new Map(prev);
      let workload: number | null = null;
      let invalid = false;
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0) {
          invalid = true;
        } else {
          workload = parsed;
        }
      }
      const updated: ProjectInternAssignmentDTO = { ...existing, workloadHours: workload };
      next.set(id, updated);
      setInvalidWorkloads(prevInvalid => {
        const nextInvalid = new Set(prevInvalid);
        if (invalid) nextInvalid.add(id); else nextInvalid.delete(id);
        return nextInvalid;
      });
      setInterns(prevList => prevList.map(item => (item.id === id ? updated : item)));
      return next;
    });
  }

  function updateIncludeInCost(id: number, include: boolean) {
    setInternCache(prev => {
      const existing = prev.get(id);
      if (!existing) return prev;
      const next = new Map(prev);
      const updated: ProjectInternAssignmentDTO = { ...existing, includeInReportedCost: include };
      next.set(id, updated);
      setInterns(prevList => prevList.map(item => (item.id === id ? updated : item)));
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setLocalError(null);
    if (invalidWorkloads.size > 0) {
      setSaving(false);
      setLocalError('Opravte prosím neplatné hodnoty úvazku.');
      return;
    }
    try {
      const payload: ProjectInternUpdatePayload[] = Array.from(selected).map(id => {
        const entry = internCache.get(id);
        const include = entry?.includeInReportedCost !== false;
        return {
          internId: id,
          workloadHours: entry?.workloadHours ?? null,
          includeInReportedCost: include,
        };
      });
      await updateProjectInterns(projectId, payload);
      onSaved();
    } catch (err) {
      setSaveError(err as ErrorResponse);
    } finally {
      setSaving(false);
    }
  }

  function renderSubtitle(intern: ProjectInternAssignmentDTO) {
    const groupLabels = intern.groups?.map(g => g.label).filter(Boolean) ?? [];
    const groupText = groupLabels.length > 0 ? groupLabels.join(', ') : 'Žádné';
    return (
      <span className="teamItem__details">
        <span>Úroveň: {intern.levelLabel}</span>
        <span>Skupiny: {groupText}</span>
      </span>
    );
  }

  return (
    <section className="projectSettings__section" aria-label={`Správa týmu - ${projectName}`}>
      <div className="teamManager">
        <section className="teamManager__assigned">
          <div>
            <h3>Přiřazení stážisti</h3>
            <p className="teamHint">Kliknutím na křížek odeberete stážistu z projektu.</p>
          </div>
          <div className="teamAssignedList">
            {assignedList.length === 0 ? (
              <p className="teamHint">Žádný stážista není přiřazen.</p>
            ) : (
              assignedList.map(intern => (
                <div key={intern.id} className="teamAssignedItem">
                  <div className="teamAssignedItem__meta">
                    <span className="teamAssignedItem__name">{intern.firstName} {intern.lastName} ({intern.username})</span>
                    {renderSubtitle(intern)}
                  </div>
                  <div className="teamAssignedItem__controls">
                    <div className="teamAssignedItem__workload">
                      <label htmlFor={`workload-${intern.id}`} className="teamAssignedItem__workloadLabel">Úvazek na projektu</label>
                      <input
                        id={`workload-${intern.id}`}
                        type="number"
                        min="0"
                        step="0.5"
                        value={intern.workloadHours ?? ''}
                        onChange={e => updateWorkload(intern.id, e.target.value)}
                        placeholder="Úvazek (h)"
                        className={invalidWorkloads.has(intern.id) ? 'invalid' : ''}
                      />
                      <span className="teamAssignedItem__workloadUnit">h</span>
                      {invalidWorkloads.has(intern.id) && (
                        <div className="errorText">Zadejte nezáporné číslo.</div>
                      )}
                    </div>
                    <label className="teamAssignedItem__include">
                      <input
                        type="checkbox"
                        checked={intern.includeInReportedCost}
                        onChange={event => updateIncludeInCost(intern.id, event.target.checked)}
                      />
                      <span>Započítat výdaje do vykázaných nákladů projektu</span>
                    </label>
                  </div>
                  <button
                    type="button"
                    className="teamAssignedRemove"
                    onClick={() => removeIntern(intern.id)}
                    aria-label={`Odebrat stážistu ${intern.firstName} ${intern.lastName}`}
                  >
                    x
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="teamManager__available">
          {loading ? (
            <div className="inline-status">
              <span className="spinner" />
              <span>Načítám seznam stážistů</span>
            </div>
          ) : error ? (
            <div className="card-summary card-summary--error">
              <b className="error">Chyba</b>
              <p>
                {error.error.message}
                <br />
                <small>kód: {error.error.code}</small>
              </p>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="intern-filter">Filtr</label>
                <input
                  id="intern-filter"
                  type="search"
                  placeholder="Hledat podle jména nebo uživatelského jména"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {interns.length === 0 ? (
                <p className="teamHint">
                  {debouncedSearch.trim()
                    ? 'Žádný stážista neodpovídá zadanému filtru.'
                    : 'Žádní stážisti nejsou k dispozici.'}
                </p>
              ) : (
                <div className="teamList">
                  <label className={`teamItem ${allSelected ? 'teamItem--selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={e => selectAll(e.target.checked)}
                    />
                    <div className="teamItem__meta">
                      <span className="teamItem__name">Vybrat všechny</span>
                      <span className="teamHint">Označte nebo zrušte označení všech stážistů v seznamu.</span>
                    </div>
                  </label>
                  {interns.map(intern => {
                    const checked = selected.has(intern.id);
                    return (
                      <label key={intern.id} className={`teamItem ${checked ? 'teamItem--selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleIntern(intern.id)}
                        />
                        <div className="teamItem__meta">
                          <span className="teamItem__name">{intern.firstName} {intern.lastName} ({intern.username})</span>
                          {renderSubtitle(intern)}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {saveError && (
        <div className="errorText">{saveError.error.message} (kód: {saveError.error.code})</div>
      )}
      {localError && <div className="errorText">{localError}</div>}
      <div className="projectSettings__footer">
        <button type="button" className="btn" onClick={onClose} disabled={saving}>Zavřít</button>
        <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving || loading || !!error}>
          Uložit
        </button>
      </div>
    </section>
  );
}

type RepositorySectionProps = {
  projectId: number;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function ProjectSettingsRepositoriesSection({ projectId, projectName, isOpen, onClose, onSaved }: RepositorySectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [repositories, setRepositories] = useState<RepositoryAssignmentDTO[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ErrorResponse | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [repoCache, setRepoCache] = useState<Map<number, RepositoryAssignmentDTO>>(new Map());

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setSaveError(null);
    getProjectRepositories(projectId, debouncedSearch)
      .then(list => {
        setRepositories(list);
        setRepoCache(prev => {
          const next = new Map(prev);
          list.forEach(item => next.set(item.id, item));
          return next;
        });
        const preset = new Set<number>();
        list.forEach(r => { if (r.assigned) preset.add(r.id); });
        setSelected(preset);
      })
      .catch(err => { setError(err as ErrorResponse); })
      .finally(() => setLoading(false));
  }, [isOpen, projectId, debouncedSearch]);

  useEffect(() => {
    if (isOpen) return;
    setRepositories([]);
    setSelected(new Set());
    setLoading(false);
    setError(null);
    setSaveError(null);
    setSearch('');
    setDebouncedSearch('');
    setRepoCache(new Map());
  }, [isOpen]);

  const allSelected = useMemo(
    () => repositories.length > 0 && repositories.every(r => selected.has(r.id)),
    [repositories, selected],
  );

  const assignedList = useMemo(() => {
    const items: RepositoryAssignmentDTO[] = [];
    selected.forEach(id => {
      const info = repoCache.get(id);
      if (info) items.push(info);
    });
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [selected, repoCache]);

  function toggleRepository(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll(next: boolean) {
    if (next) {
      setSelected(prev => {
        const merged = new Set(prev);
        repositories.forEach(r => merged.add(r.id));
        return merged;
      });
    } else {
      setSelected(prev => {
        const reduced = new Set(prev);
        repositories.forEach(r => reduced.delete(r.id));
        return reduced;
      });
    }
  }

  function removeRepository(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateProjectRepositories(projectId, Array.from(selected));
      onSaved();
    } catch (err) {
      setSaveError(err as ErrorResponse);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="projectSettings__section" aria-label={`Správa repozitářů - ${projectName}`}>
      <div className="repoManager">
        <section className="repoManager__assigned">
          <div>
            <h3>Přiřazené repozitáře</h3>
            <p className="repoItem__details">Kliknutím na křížek odeberete repozitář z projektu.</p>
          </div>
          <div className="assignedList">
            {assignedList.length === 0 ? (
              <p className="repoItem__details">Žádný repozitář není přiřazen.</p>
            ) : (
              assignedList.map(repo => (
                <div key={repo.id} className="assignedItem">
                  <div className="assignedItem__meta">
                    <span className="assignedItem__name">{repo.name}</span>
                    <span className="assignedItem__details">{repo.nameWithNamespace}</span>
                  </div>
                  <button
                    type="button"
                    className="assignedRemove"
                    onClick={() => removeRepository(repo.id)}
                    aria-label={`Odebrat repozitář ${repo.name}`}
                  >
                    x
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="repoManager__available">
          {loading ? (
            <div className="inline-status">
              <span className="spinner" />
              <span>Načítám dostupné repozitáře</span>
            </div>
          ) : error ? (
            <div className="card-summary card-summary--error">
              <b className="error">Chyba</b>
              <p>
                {error.error.message}
                <br />
                <small>kód: {error.error.code}</small>
              </p>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="repo-filter">Filtr</label>
                <input
                  id="repo-filter"
                  type="search"
                  placeholder="Hledat podle názvu nebo name_with_namespace"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {repositories.length === 0 ? (
                <p className="repoItem__details">
                  {debouncedSearch.trim()
                    ? 'Žádný repozitář neodpovídá zadanému filtru.'
                    : 'Žádné repozitáře nejsou k dispozici. Nejprve spusťte synchronizaci repozitáře.'}
                </p>
              ) : (
                <div className="repoList">
                  <label className={`repoItem ${allSelected ? 'repoItem--selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={e => selectAll(e.target.checked)}
                    />
                    <div className="repoItem__meta">
                      <span className="repoItem__name">Vybrat všechny</span>
                      <span className="repoItem__details">Označte nebo zrušte označení všech repozitářů v seznamu.</span>
                    </div>
                  </label>
                  {repositories.map(repo => {
                    const checked = selected.has(repo.id);
                    return (
                      <label key={repo.id} className={`repoItem ${checked ? 'repoItem--selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRepository(repo.id)}
                        />
                        <div className="repoItem__meta">
                          <span className="repoItem__name">{repo.name}</span>
                          <span className="repoItem__details">
                            {repo.nameWithNamespace}
                            {typeof repo.gitlabRepoId === 'number' ? ` - GitLab ID: ${repo.gitlabRepoId}` : ''}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {saveError && (
        <div className="errorText">{saveError.error.message} (kód: {saveError.error.code})</div>
      )}
      <div className="projectSettings__footer">
        <button type="button" className="btn" onClick={onClose} disabled={saving}>Zavřít</button>
        <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving || loading || !!error}>
          Uložit
        </button>
      </div>
    </section>
  );
}
