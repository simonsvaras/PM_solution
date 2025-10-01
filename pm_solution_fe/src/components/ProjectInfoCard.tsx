import { type MouseEvent, useMemo } from 'react';
import './ProjectInfoCard.css';
import type { ProjectOverviewDTO } from '../api';
import BudgetBurnIndicator from './BudgetBurnIndicator';

type ProjectInfoCardProps = {
  project: ProjectOverviewDTO;
  onSelect?: (project: ProjectOverviewDTO) => void;
};

export default function ProjectInfoCard({ project, onSelect }: ProjectInfoCardProps) {
  const numberFormatter = useMemo(() => new Intl.NumberFormat('cs-CZ'), []);
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    [],
  );

  const budgetLabel = project.budget != null ? currencyFormatter.format(project.budget) : 'Neuvedeno';
  const reportsOverviewLink = `?module=projects&submodule=projects-overview&projectId=${project.id}`;

  function handleDetailClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!onSelect) {
      return;
    }
    event.preventDefault();
    onSelect(project);
  }

  return (
    <article className="projectInfoCard" aria-label={`Projekt ${project.name}`}>
      <header className="projectInfoCard__header">
        <h2>{project.name}</h2>
        <a
          className="projectInfoCard__detailLink"
          href={reportsOverviewLink}
          onClick={onSelect ? handleDetailClick : undefined}
        >
          Zobrazit detail
        </a>
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
        <div className="projectInfoCard__stat projectInfoCard__stat--progress">
          <dt>Vykázané náklady</dt>
          <dd>
            <BudgetBurnIndicator
              budget={project.budget}
              reportedCost={project.reportedCost}
              currencyFormatter={currencyFormatter}
              className="budgetBurn--compact"
              label={null}
            />
          </dd>
        </div>
        <div className="projectInfoCard__stat">
          <dt>Otevřené issue</dt>
          <dd>{numberFormatter.format(project.openIssues)}</dd>
        </div>
      </dl>
    </article>
  );
}
