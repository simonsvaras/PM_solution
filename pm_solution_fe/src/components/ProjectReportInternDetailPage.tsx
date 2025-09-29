import type { ProjectOverviewDTO } from '../api';
import ProjectReportPlaceholderPage from './ProjectReportPlaceholderPage';

type ProjectReportInternDetailPageProps = {
  project: ProjectOverviewDTO;
  onBack: () => void;
  onCloseDetail: () => void;
};

export default function ProjectReportInternDetailPage({
  project,
  onBack,
  onCloseDetail,
}: ProjectReportInternDetailPageProps) {
  return (
    <ProjectReportPlaceholderPage
      project={project}
      onBack={onBack}
      onCloseDetail={onCloseDetail}
      title="Detail stážisty"
      message="Detail stážisty bude dostupný v budoucí verzi."
    />
  );
}
