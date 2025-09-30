import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import ProjectCard from './ProjectCard';
import ManageRepositoriesModal from './ManageRepositoriesModal';
import ManageProjectInternsModal from './ManageProjectInternsModal';
import {
  API_BASE,
  createProjectByName,
  deleteProject,
  getProjects,
  getRepositoryNamespaces,
  updateProject,
  type ErrorResponse,
  type ProjectDTO,
  type ProjectBudgetPayload,
  type ProjectNamespaceOption,
} from '../api';

/**
 * Validates user-provided project names.
 */
function validateName(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = (raw || '').trim();
  if (!value) return { ok: false, error: 'Název je povinný.' };
  if (value.length > 200) return { ok: false, error: 'Název je příliš dlouhý (max 200 znaků).' };
  return { ok: true, value };
}

/**
 * Page component rendering the project management experience (create/edit/delete, repo modal).
 */
export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorResponse | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [budget, setBudget] = useState('');
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [budgetFrom, setBudgetFrom] = useState('');
  const [budgetTo, setBudgetTo] = useState('');
  const [budgetRangeError, setBudgetRangeError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ErrorResponse | null>(null);
  const [justCreated, setJustCreated] = useState<ProjectDTO | null>(null);
  const [editing, setEditing] = useState<ProjectDTO | null>(null);
  const [manageProject, setManageProject] = useState<ProjectDTO | null>(null);
  const [manageTeamProject, setManageTeamProject] = useState<ProjectDTO | null>(null);
  const [namespaceOptions, setNamespaceOptions] = useState<ProjectNamespaceOption[]>([]);
  const [namespaceLoading, setNamespaceLoading] = useState(false);
  const [namespaceError, setNamespaceError] = useState<string | null>(null);
  const [selectedNamespaceName, setSelectedNamespaceName] = useState<string | null>(null);
  const [selectedNamespaceId, setSelectedNamespaceId] = useState<number | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const list = await getProjects();
      setProjects(list);
    } catch (e) {
      setError(e as ErrorResponse);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    async function loadNamespaces() {
      setNamespaceLoading(true);
      setNamespaceError(null);
      try {
        const list = await getRepositoryNamespaces();
        setNamespaceOptions(list);
      } catch (e) {
        const err = e as ErrorResponse;
        setNamespaceError(err?.error?.message ?? 'Nepodařilo se načíst namespaces.');
      } finally {
        setNamespaceLoading(false);
      }
    }
    void loadNamespaces();
  }, []);

  const sorted = useMemo(() => (projects || []).slice().sort((a, b) => a.name.localeCompare(b.name)), [projects]);
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    [],
  );
  const effectiveNamespaceOptions = useMemo(() => {
    if (!selectedNamespaceName) return namespaceOptions;
    const exists = namespaceOptions.some(opt => opt.namespaceName === selectedNamespaceName);
    if (exists) return namespaceOptions;
    return [...namespaceOptions, { namespaceId: selectedNamespaceId, namespaceName: selectedNamespaceName }].sort((a, b) =>
      a.namespaceName.localeCompare(b.namespaceName, 'cs'),
    );
  }, [namespaceOptions, selectedNamespaceId, selectedNamespaceName]);

  // Open modal for creating a fresh project
  function openModal() {
    setIsOpen(true);
    setName('');
    setNameError(null);
    setBudget('');
    setBudgetError(null);
    setBudgetFrom('');
    setBudgetTo('');
    setBudgetRangeError(null);
    setCreateError(null);
    setJustCreated(null);
    setEditing(null);
    setSelectedNamespaceId(null);
    setSelectedNamespaceName(null);
  }

  async function onCreate() {
    setCreateError(null);
    setBudgetError(null);
    setBudgetRangeError(null);
    const v = validateName(name);
    if (!v.ok) { setNameError(v.error); return; }
    setNameError(null);

    let parsedBudget: number | null = null;
    if (budget.trim().length > 0) {
      const num = Number(budget);
      if (!Number.isFinite(num) || num < 0) {
        setBudgetError('Rozpočet musí být nezáporné číslo.');
        return;
      }
      parsedBudget = num;
    }

    const normalizedFrom = budgetFrom.trim() || null;
    const normalizedTo = budgetTo.trim() || null;
    if (normalizedFrom && normalizedTo && normalizedFrom > normalizedTo) {
      setBudgetRangeError('Datum "od" nesmí být později než datum "do".');
      return;
    }

    const payload: ProjectBudgetPayload = {
      name: v.value,
      budget: parsedBudget,
      budgetFrom: normalizedFrom,
      budgetTo: normalizedTo,
      namespaceId: selectedNamespaceName ? selectedNamespaceId ?? null : null,
      namespaceName: selectedNamespaceName ?? null,
    };

    setCreating(true);
    try {
      if (editing) {
        const updated = await updateProject(editing.id, payload);
        setJustCreated(updated);
      } else {
        const created = await createProjectByName(payload);
        setJustCreated(created);
      }
      setIsOpen(false);
      setName('');
      setBudget('');
      setBudgetFrom('');
      setBudgetTo('');
      await reload();
    } catch (e) {
      setCreateError(e as ErrorResponse);
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(p: ProjectDTO) {
    if (!confirm(`Opravdu smazat projekt "${p.name}" (ID ${p.id})?`)) return;
    try {
      await deleteProject(p.id);
      await reload();
    } catch (e) {
      setError(e as ErrorResponse);
    }
  }

  // Prefill modal for editing an existing project
  function onEdit(p: ProjectDTO) {
    setEditing(p);
    setIsOpen(true);
    setName(p.name);
    setNameError(null);
    setBudget(p.budget !== null && p.budget !== undefined ? String(p.budget) : '');
    setBudgetFrom(p.budgetFrom ?? '');
    setBudgetTo(p.budgetTo ?? '');
    setBudgetError(null);
    setBudgetRangeError(null);
    setCreateError(null);
    setSelectedNamespaceId(p.namespaceId ?? null);
    setSelectedNamespaceName(p.namespaceName ?? null);
  }

  function onManageRepos(p: ProjectDTO) {
    setManageProject(p);
  }

  function onManageTeam(p: ProjectDTO) {
    setManageTeamProject(p);
  }

  return (
    <>
      <section className="panel">
        <div className="panel__body">
          <div className="actions">
            <button className="btn btn--primary" onClick={openModal}>+ Vytvořit projekt</button>
          </div>

          {justCreated && (
            <div className="card-summary">
              <b>Projekt vytvořen</b>
              <p>
                ID: {justCreated.id} • Název: <b>{justCreated.name}</b>
                <br />
                Namespace: {justCreated.namespaceName ? (
                  <>
                    <b>{justCreated.namespaceName}</b>
                    {typeof justCreated.namespaceId === 'number' ? ` (ID ${justCreated.namespaceId})` : ''}
                  </>
                ) : '—'}
                <br />
                Rozpočet: {justCreated.budget !== null ? `${justCreated.budget.toLocaleString('cs-CZ')} Kč` : 'neuveden'}
                <br />
                Období: {justCreated.budgetFrom ?? '—'} – {justCreated.budgetTo ?? '—'}
                <br />
                Vykázané náklady: {currencyFormatter.format(justCreated.reportedCost ?? 0)}
              </p>
            </div>
          )}

          {loading && (
            <div className="inline-status"><span className="spinner" /> Načítám projekty…</div>
          )}
          {error && (
            <div className="card-summary card-summary--error">
              <b className="error">Chyba</b>
              <p>{error.error.message}<br /><small>kód: {error.error.code}</small></p>
            </div>
          )}

          {/* Seznam projektů bude renderován mimo panel__body níže */}

          <div className="panel__footer">
            <small>API: {API_BASE}</small>
          </div>
        </div>

        <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editing ? 'Upravit projekt' : 'Vytvořit projekt'}>
          <div className="field">
            <label htmlFor="project-name">Název projektu</label>
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Zadejte název"
              autoFocus
            />
            {nameError && <div className="errorText">{nameError}</div>}
          </div>
          <div className="field">
            <label htmlFor="project-budget">Rozpočet (CZK)</label>
            <input
              id="project-budget"
              type="number"
              min="0"
              step="1"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              placeholder="Např. 250000"
            />
            {budgetError && <div className="errorText">{budgetError}</div>}
          </div>
          <div className="field field--inline">
            <div>
              <label htmlFor="project-budget-from">Rozpočet od</label>
              <input
                id="project-budget-from"
                type="date"
                value={budgetFrom}
                onChange={e => setBudgetFrom(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="project-budget-to">Rozpočet do</label>
              <input
                id="project-budget-to"
                type="date"
                value={budgetTo}
                onChange={e => setBudgetTo(e.target.value)}
              />
            </div>
          </div>
          {budgetRangeError && <div className="errorText">{budgetRangeError}</div>}
          <div className="field">
            <label htmlFor="project-namespace">Namespace (volitelné)</label>
            <select
              id="project-namespace"
              value={selectedNamespaceName ?? ''}
              onChange={e => {
                const value = e.target.value;
                if (!value) {
                  setSelectedNamespaceId(null);
                  setSelectedNamespaceName(null);
                  return;
                }
                const option = namespaceOptions.find(opt => opt.namespaceName === value) ?? null;
                setSelectedNamespaceId(option?.namespaceId ?? selectedNamespaceId ?? null);
                setSelectedNamespaceName(value);
              }}
              disabled={namespaceLoading}
            >
              <option value="">Bez namespace</option>
              {effectiveNamespaceOptions.map(opt => (
                <option key={opt.namespaceName} value={opt.namespaceName}>
                  {opt.namespaceName}
                </option>
              ))}
            </select>
            {namespaceLoading && <div className="inline-status"><span className="spinner" /> Načítám namespaces…</div>}
            {namespaceError && <div className="errorText">{namespaceError}</div>}
          </div>
          {createError && (
            <div className="errorText">
              {createError.error.message} (kód: {createError.error.code})
            </div>
          )}
          <div className="modal__footer">
            <button className="btn" onClick={() => setIsOpen(false)} disabled={creating}>Zrušit</button>
            <button className="btn btn--primary" onClick={onCreate} disabled={creating || !!nameError}>{editing ? 'Uložit' : 'Vytvořit'}</button>
          </div>
        </Modal>
      </section>

      {/* Seznam karet projektů mimo panel__body a pod existující panel */}
      {!loading && !error && (
        <div className="cardsGrid">
          {sorted.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              onEdit={onEdit}
              onDelete={onDelete}
              onManageRepos={onManageRepos}
              onManageTeam={onManageTeam}
            />
          ))}
          {sorted.length === 0 && <div className="card-summary">Žádné projekty.</div>}
        </div>
      )}
      <ManageRepositoriesModal
        project={manageProject}
        onClose={() => setManageProject(null)}
        onSaved={() => {
          setJustCreated(null);
          reload();
        }}
      />
      <ManageProjectInternsModal
        project={manageTeamProject}
        onClose={() => setManageTeamProject(null)}
        onSaved={() => {
          setJustCreated(null);
          reload();
        }}
      />
    </>
  );
}




