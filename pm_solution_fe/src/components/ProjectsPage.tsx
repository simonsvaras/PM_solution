import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import ProjectCard from './ProjectCard';
import ManageRepositoriesModal from './ManageRepositoriesModal';
import {
  API_BASE,
  createProjectByName,
  deleteProject,
  getProjects,
  updateProjectName,
  type ErrorResponse,
  type ProjectDTO,
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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ErrorResponse | null>(null);
  const [justCreated, setJustCreated] = useState<ProjectDTO | null>(null);
  const [editing, setEditing] = useState<ProjectDTO | null>(null);
  const [manageProject, setManageProject] = useState<ProjectDTO | null>(null);

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

  const sorted = useMemo(() => (projects || []).slice().sort((a, b) => a.name.localeCompare(b.name)), [projects]);

  // Open modal for creating a fresh project
  function openModal() {
    setIsOpen(true);
    setName('');
    setNameError(null);
    setCreateError(null);
    setJustCreated(null);
    setEditing(null);
  }

  async function onCreate() {
    setCreateError(null);
    const v = validateName(name);
    if (!v.ok) { setNameError(v.error); return; }
    setNameError(null);
    setCreating(true);
    try {
      if (editing) {
        const updated = await updateProjectName(editing.id, v.value);
        setJustCreated(updated);
      } else {
        const created = await createProjectByName(v.value);
        setJustCreated(created);
      }
      setIsOpen(false);
      setName('');
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
    setCreateError(null);
  }

  function onManageRepos(p: ProjectDTO) {
    setManageProject(p);
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
            <ProjectCard key={p.id} project={p} onEdit={onEdit} onDelete={onDelete} onManageRepos={onManageRepos} />
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
    </>
  );
}




