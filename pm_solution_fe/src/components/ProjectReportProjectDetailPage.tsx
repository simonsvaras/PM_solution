import type { ProjectOverviewDTO } from '../api';
import ProjectReportPlaceholderPage from './ProjectReportPlaceholderPage';

type ProjectReportProjectDetailPageProps = {
  project: ProjectOverviewDTO;
  onBack: () => void;
  onCloseDetail: () => void;
};

export default function ProjectReportProjectDetailPage({
  project,
  onBack,
  onCloseDetail,
}: ProjectReportProjectDetailPageProps) {
  return (
    <ProjectReportPlaceholderPage
      project={project}
      onBack={onBack}
      onCloseDetail={onCloseDetail}
      title="Detail projektu"
      message="Detail projektu bude dostupný v budoucí verzi."
    />
  );
}
