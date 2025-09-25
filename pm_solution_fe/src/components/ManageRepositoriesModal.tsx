import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import './ManageRepositoriesModal.css';
import {
  getProjectRepositories,
  updateProjectRepositories,
  type ErrorResponse,
  type ProjectDTO,
  type RepositoryAssignmentDTO,
} from '../api';

export type ManageRepositoriesModalProps = {
  project: ProjectDTO | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function ManageRepositoriesModal({ project, onClose, onSaved }: ManageRepositoriesModalProps) {
  const isOpen = project !== null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [repositories, setRepositories] = useState<RepositoryAssignmentDTO[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ErrorResponse | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const initialised = useRef(false);
  const [repoCache, setRepoCache] = useState<Map<number, RepositoryAssignmentDTO>>(new Map());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!isOpen || !project) return;
    setLoading(true);
    setError(null);
    setSaveError(null);
    getProjectRepositories(project.id, debouncedSearch)
      .then(list => {
        setRepositories(list);
        setRepoCache(prev => {
          const next = new Map(prev);
          list.forEach(item => next.set(item.id, item));
          return next;
        });
        if (!initialised.current) {
          const preset = new Set<number>();
          list.forEach(r => { if (r.assigned) preset.add(r.id); });
          setSelected(preset);
          initialised.current = true;
        }
      })
      .catch(err => { setError(err as ErrorResponse); })
      .finally(() => setLoading(false));
  }, [isOpen, project, debouncedSearch]);

  useEffect(() => {
    if (!isOpen) {
      setRepositories([]);
      setSelected(new Set());
      setLoading(false);
      setError(null);
      setSaveError(null);
      setSearch('');
      setDebouncedSearch('');
      initialised.current = false;
      setRepoCache(new Map());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!project) return;
    initialised.current = false;
    setSearch('');
    setDebouncedSearch('');
    setRepoCache(new Map());
  }, [project?.id]);

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
    if (!project) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateProjectRepositories(project.id, Array.from(selected));
      onSaved();
      onClose();
    } catch (e) {
      setSaveError(e as ErrorResponse);
    } finally {
      setSaving(false);
    }
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
      title={project ? `Správa repozitářů - ${project.name}` : 'Správa repozitářů'}
      className="modal--wide"
      bodyClassName="modal__body--repos"
      footer={footer}
    >
      <div className="repoManager">
        <section className="repoManager__assigned">
          <div>
            <h3>Přiřazené repozitáře</h3>
            <p className="repoItem__details">Kliknutím na křížek odeberete repozitář z projektu.</p>
          </div>
          <div className="assignedList">
            {assignedList.length === 0 ? (
              <p className="repoItem__details">Žándý repozitář není přiřazen.</p>
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
                <small>k�d: {error.error.code}</small>
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
                      <span className="repoItem__details">Označte nebo zrušte označení všech repozitátářů v seznamu.</span>
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
        <div className="errorText">{saveError.error.message} (kod: {saveError.error.code})</div>
      )}
    </Modal>
  );
}
