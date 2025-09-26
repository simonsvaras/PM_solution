import './ProjectReportPage.css';
import type { ProjectOverviewDTO } from '../api';

type ProjectReportPageProps = {
  project: ProjectOverviewDTO;
  onBack: () => void;
};

export default function ProjectReportPage({ project, onBack }: ProjectReportPageProps) {
  return (
    <section className="projectReport" aria-label={`Report projektu ${project.name}`}>
      <button type="button" className="projectReport__backButton" onClick={onBack}>
        ← Zpět na projekty
      </button>
      <div className="projectReport__card">
        <h2>Otevřené issue</h2>
        <p className="projectReport__metric">{project.openIssues}</p>
      </div>
    </section>
  );
}
