import { useEffect, useState } from 'react';
import './ReportsOverviewPage.css';
import SimpleProjectCard from './SimpleProjectCard';
import { getProjectsOverview, type ErrorResponse, type ProjectOverviewDTO } from '../api';

type ReportsOverviewPageProps = {
  onSelectProject: (project: ProjectOverviewDTO) => void;
};

/**
 * Shows all projects available for reporting and exposes a simple click-through to the detail view.
 */
export default function ReportsOverviewPage({ onSelectProject }: ReportsOverviewPageProps) {
  const [projects, setProjects] = useState<ProjectOverviewDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorResponse | null>(null);

  // Load the project overview once the component mounts.
  useEffect(() => {
    setLoading(true);
    setError(null);
    getProjectsOverview()
      .then(data => setProjects(data))
      .catch(err => setError(err as ErrorResponse))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="reportsOverview">
        <p className="reportsOverview__status">Načítám projekty…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="reportsOverview">
        <div className="reportsOverview__error" role="alert">
          <h2>Projekty se nepodařilo načíst.</h2>
          <p>{error.error.message}</p>
        </div>
      </section>
    );
  }

  if (projects.length === 0) {
    return (
      <section className="reportsOverview">
        <p className="reportsOverview__status">Zatím nejsou vytvořené žádné projekty.</p>
      </section>
    );
  }

  return (
    <section className="reportsOverview" aria-label="Přehled projektových reportů">
      <div className="reportsOverview__grid">
        {projects.map(project => (
          <SimpleProjectCard key={project.id} project={project} onSelect={onSelectProject} />
        ))}
      </div>
    </section>
  );
}
