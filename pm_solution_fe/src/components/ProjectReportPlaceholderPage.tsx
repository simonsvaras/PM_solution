import './ProjectReportPlaceholderPage.css';
import type { ProjectOverviewDTO } from '../api';

type ProjectReportPlaceholderPageProps = {
  project: ProjectOverviewDTO;
  onBack: () => void;
  onCloseDetail: () => void;
  title: string;
  message?: string;
};

export default function ProjectReportPlaceholderPage({
  project,
  onBack,
  onCloseDetail,
  title,
  message,
}: ProjectReportPlaceholderPageProps) {
  return (
    <section className="projectReportPlaceholder" aria-label={`${title} projektu ${project.name}`}>
      <div className="projectReportPlaceholder__nav">
        <button type="button" className="projectReportPlaceholder__backButton" onClick={onBack}>
          ← Zpět na projekty
        </button>
        <button type="button" className="projectReportPlaceholder__link" onClick={onCloseDetail}>
          ← Zpět na souhrn
        </button>
      </div>
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
