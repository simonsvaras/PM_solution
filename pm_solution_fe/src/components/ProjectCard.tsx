import './ProjectCard.css';
import type { ProjectDTO } from '../api';

export type ProjectCardProps = {
  project: ProjectDTO;
  onEdit: (p: ProjectDTO) => void;
  onDelete: (p: ProjectDTO) => void;
  onManageRepos: (p: ProjectDTO) => void;
  onManageTeam: (p: ProjectDTO) => void;
};

export default function ProjectCard({ project, onEdit, onDelete, onManageRepos, onManageTeam }: ProjectCardProps) {
  return (
    <div className="projectCard" aria-label={`Projekt ${project.name}`}>
      <h3 className="projectCard__title">{project.name}</h3>
      {typeof project.gitlabProjectId === 'number' && (
        <div className="projectCard__meta">GitLab ID: {project.gitlabProjectId}</div>
      )}
      <div className="projectCard__actions">
        <button className="btn btn--danger" onClick={() => onDelete(project)}>Smazat</button>
        <button className="btn" onClick={() => onEdit(project)}>Editovat</button>
        <button className="btn btn--primary" onClick={() => onManageRepos(project)}>Správa repozitářů</button>
        <button className="btn" onClick={() => onManageTeam(project)}>Správa tým</button>
      </div>
    </div>
  );
}
