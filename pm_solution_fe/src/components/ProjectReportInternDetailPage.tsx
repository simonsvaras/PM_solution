import type { ProjectOverviewDTO } from '../api';
import ProjectReportPlaceholderPage from './ProjectReportPlaceholderPage';

type ProjectReportInternDetailPageProps = {
  project: ProjectOverviewDTO;
};

export default function ProjectReportInternDetailPage({ project }: ProjectReportInternDetailPageProps) {
  return (
    <ProjectReportPlaceholderPage
      project={project}
      title="Detail stážisty"
      message="Detail stážisty bude dostupný v budoucí verzi."
    />
  );
}
