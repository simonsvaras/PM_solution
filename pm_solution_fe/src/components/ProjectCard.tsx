import './ProjectCard.css';
import { useMemo } from 'react';
import type { ProjectDTO } from '../api';

export type ProjectCardProps = {
  project: ProjectDTO;
  onEdit: (p: ProjectDTO) => void;
  onDelete: (p: ProjectDTO) => void;
  onManageRepos: (p: ProjectDTO) => void;
  onManageTeam: (p: ProjectDTO) => void;
};

export default function ProjectCard({ project, onEdit, onDelete, onManageRepos, onManageTeam }: ProjectCardProps) {
  const numberFormatter = useMemo(() => new Intl.NumberFormat('cs-CZ'), []);

  function formatDate(value: string | null | undefined) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('cs-CZ');
  }

  const budgetLabel = project.budget != null ? `${numberFormatter.format(project.budget)} Kč` : 'Neuvedeno';
  const fromText = formatDate(project.budgetFrom);
  const toText = formatDate(project.budgetTo);
  const periodLabel = fromText || toText ? `${fromText ?? '—'} – ${toText ?? '—'}` : 'Bez omezení';

  return (
    <div className="projectCard" aria-label={`Projekt ${project.name}`}>
      <h3 className="projectCard__title">{project.name}</h3>
      <div className="projectCard__meta">
        {typeof project.gitlabProjectId === 'number' && <div>GitLab ID: {project.gitlabProjectId}</div>}
        <div>Rozpočet: {budgetLabel}</div>
        <div>Období rozpočtu: {periodLabel}</div>
      </div>
      <div className="projectCard__actions">
        <button className="btn btn--danger" onClick={() => onDelete(project)}>Smazat</button>
        <button className="btn" onClick={() => onEdit(project)}>Editovat</button>
        <button className="btn btn--primary" onClick={() => onManageRepos(project)}>Správa repozitářů</button>
        <button className="btn" onClick={() => onManageTeam(project)}>Správa tým</button>
      </div>
    </div>
  );
}
