import './SimpleProjectCard.css';
import type { ProjectOverviewDTO } from '../api';

type SimpleProjectCardProps = {
  project: ProjectOverviewDTO;
  onSelect: (project: ProjectOverviewDTO) => void;
};

export default function SimpleProjectCard({ project, onSelect }: SimpleProjectCardProps) {
  return (
    <article className="simpleProjectCard">
      <button
        type="button"
        className="simpleProjectCard__button"
        onClick={() => onSelect(project)}
        aria-label={`Zobrazit report projektu ${project.name}`}
      >
        <span className="simpleProjectCard__name">{project.name}</span>
      </button>
    </article>
  );
}
