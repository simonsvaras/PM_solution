import { useEffect, useState } from 'react';
import './ProjectsOverviewPage.css';
import ProjectInfoCard from './ProjectInfoCard';
import { getProjectsOverview, type ErrorResponse, type ProjectOverviewDTO } from '../api';

type ProjectsOverviewPageProps = {
  onSelectProject?: (project: ProjectOverviewDTO) => void;
};

export default function ProjectsOverviewPage({ onSelectProject }: ProjectsOverviewPageProps) {
  const [projects, setProjects] = useState<ProjectOverviewDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorResponse | null>(null);

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
      <section className="projectsOverview">
        <p className="projectsOverview__status">Načítám projekty…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="projectsOverview">
        <div className="projectsOverview__error" role="alert">
          <h2>Projekty se nepodařilo načíst.</h2>
          <p>{error.error.message}</p>
        </div>
      </section>
    );
  }

  if (projects.length === 0) {
    return (
      <section className="projectsOverview">
        <p className="projectsOverview__status">Zatím nejsou vytvořené žádné projekty.</p>
      </section>
    );
  }

  return (
    <section className="projectsOverview" aria-label="Přehled projektů">
      <div className="projectsOverview__grid">
        {projects.map(project => (
          <ProjectInfoCard key={project.id} project={project} onSelectProject={onSelectProject} />
        ))}
      </div>
    </section>
  );
}
