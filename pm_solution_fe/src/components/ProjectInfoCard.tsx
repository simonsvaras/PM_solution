import { useMemo } from 'react';
import './ProjectInfoCard.css';
import type { ProjectOverviewDTO } from '../api';

type ProjectInfoCardProps = {
  project: ProjectOverviewDTO;
};

export default function ProjectInfoCard({ project }: ProjectInfoCardProps) {
  const numberFormatter = useMemo(() => new Intl.NumberFormat('cs-CZ'), []);
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }),
    [],
  );

  const budgetLabel = project.budget != null ? currencyFormatter.format(project.budget) : 'Neuvedeno';

  return (
    <article className="projectInfoCard" aria-label={`Projekt ${project.name}`}>
      <header className="projectInfoCard__header">
        <h2>{project.name}</h2>
      </header>
      <dl className="projectInfoCard__stats">
        <div className="projectInfoCard__stat">
          <dt>Členové týmu</dt>
          <dd>{numberFormatter.format(project.teamMembers)}</dd>
        </div>
        <div className="projectInfoCard__stat">
          <dt>Rozpočet</dt>
          <dd>{budgetLabel}</dd>
        </div>
        <div className="projectInfoCard__stat">
          <dt>Otevřené issue</dt>
          <dd>{numberFormatter.format(project.openIssues)}</dd>
        </div>
      </dl>
    </article>
  );
}
