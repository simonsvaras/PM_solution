import './ProjectReportPlaceholderPage.css';
import type { ProjectOverviewDTO } from '../api';

type ProjectReportPlaceholderPageProps = {
  project: ProjectOverviewDTO;
  title: string;
  message?: string;
};

export default function ProjectReportPlaceholderPage({
  project,
  title,
  message,
}: ProjectReportPlaceholderPageProps) {
  return (
    <section className="projectReportPlaceholder" aria-label={`${title} projektu ${project.name}`}>
      <div className="projectReportPlaceholder__body">
        <div className="panel panel--placeholder">
          <div className="panel__body">
            <p>{message ?? 'Na obsahu této stránky se pracuje.'}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
