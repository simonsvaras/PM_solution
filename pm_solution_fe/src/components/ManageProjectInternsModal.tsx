import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import './ManageProjectInternsModal.css';
import {
  getProjectInterns,
  updateProjectInterns,
  type ErrorResponse,
  type ProjectDTO,
  type ProjectInternAssignmentDTO,
} from '../api';

export type ManageProjectInternsModalProps = {
  project: ProjectDTO | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function ManageProjectInternsModal({ project, onClose, onSaved }: ManageProjectInternsModalProps) {
  const isOpen = project !== null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [interns, setInterns] = useState<ProjectInternAssignmentDTO[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [internCache, setInternCache] = useState<Map<number, ProjectInternAssignmentDTO>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ErrorResponse | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const initialised = useRef(false);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (!isOpen || !project) return;
    setLoading(true);
    setError(null);
    setSaveError(null);
    getProjectInterns(project.id, debouncedSearch)
      .then(result => {
        setInterns(result);
        setInternCache(prev => {
          const next = new Map(prev);
          result.forEach(item => next.set(item.id, item));
          return next;
        });
        if (!initialised.current) {
          const preset = new Set<number>();
          result.forEach(entry => { if (entry.assigned) preset.add(entry.id); });
          setSelected(preset);
          initialised.current = true;
        }
      })
      .catch(err => setError(err as ErrorResponse))
      .finally(() => setLoading(false));
  }, [isOpen, project, debouncedSearch]);

  useEffect(() => {
    if (!isOpen) {
      setInterns([]);
      setSelected(new Set());
      setLoading(false);
      setError(null);
      setSaveError(null);
      setSearch('');
      setDebouncedSearch('');
      setInternCache(new Map());
      initialised.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!project) return;
    initialised.current = false;
    setSearch('');
    setDebouncedSearch('');
    setInternCache(new Map());
  }, [project?.id]);

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
      if (next.has(id)) next.delete(id); else next.add(id);
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
  }

  async function handleSave() {
    if (!project) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateProjectInterns(project.id, Array.from(selected));
      onSaved();
      onClose();
    } catch (e) {
      setSaveError(e as ErrorResponse);
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

  const footer = (
    <>
      <div className="spacer" />
      <button className="btn" onClick={onClose} disabled={saving}>Zavřít</button>
      <button className="btn btn--primary" onClick={handleSave} disabled={saving || loading || !!error}>Uložit</button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={project ? `Správa tým - ${project.name}` : 'Správa tým'}
      className="modal--wide"
      bodyClassName="modal__body--repos"
      footer={footer}
    >
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
    </Modal>
  );
}

