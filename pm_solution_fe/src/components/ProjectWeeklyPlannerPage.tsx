import './ProjectWeeklyPlannerPage.css';
import type { ProjectOverviewDTO } from '../api';

type ProjectWeeklyPlannerPageProps = {
  project: ProjectOverviewDTO;
};

export default function ProjectWeeklyPlannerPage({ project }: ProjectWeeklyPlannerPageProps) {
  return (
    <section className="projectWeeklyPlanner" aria-labelledby="project-weekly-planner-title">
      <header className="projectWeeklyPlanner__header">
        <h2 id="project-weekly-planner-title">Týdenní plánování</h2>
        <p className="projectWeeklyPlanner__subtitle">
          Zobrazení pro plánování priorit projektu {project.name} bude brzy k dispozici.
        </p>
      </header>
      <div className="projectWeeklyPlanner__placeholder" role="status">
        <p>
          Připravujeme nástroj pro plánování aktivit v rámci projektu. Mezitím můžete sdílet tuto adresu URL s parametrem
          <code>tab=planning</code> pro rychlý návrat na tuto záložku.
        </p>
      </div>
    </section>
  );
}
