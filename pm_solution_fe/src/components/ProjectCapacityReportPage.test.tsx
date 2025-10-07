import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectCapacityReportPage from './ProjectCapacityReportPage';
import type { ProjectCapacityReport, ProjectOverviewDTO } from '../api';

vi.mock('../api', async original => {
  const actual = await original();
  return {
    ...actual,
    getProjectCapacity: vi.fn(),
    reportProjectCapacity: vi.fn(),
  };
});

const { getProjectCapacity, reportProjectCapacity } = await import('../api');
const mockedGetProjectCapacity = vi.mocked(getProjectCapacity);
const mockedReportProjectCapacity = vi.mocked(reportProjectCapacity);

const baseProject: ProjectOverviewDTO = {
  id: 123,
  name: 'Projekt Test',
  budget: null,
  budgetFrom: null,
  budgetTo: null,
  reportedCost: 0,
  teamMembers: 0,
  openIssues: 0,
  isExternal: false,
  hourlyRateCzk: null,
};

function createReport(statusCodes: string[]): ProjectCapacityReport {
  return {
    id: 99,
    projectId: baseProject.id,
    reportedAt: '2024-01-02T12:34:56.000Z',
    note: null,
    statuses: statusCodes.map(code => ({ code, label: code, severity: 50 })),
  };
}

describe('ProjectCapacityReportPage', () => {
  beforeEach(() => {
    mockedGetProjectCapacity.mockReset();
    mockedReportProjectCapacity.mockReset();
  });

  it('submits multiple statuses and returns to idle state', async () => {
    mockedGetProjectCapacity.mockRejectedValue({ error: { httpStatus: 404 } });
    mockedReportProjectCapacity.mockResolvedValue(createReport(['LACK_FE', 'LACK_BE']));

    const user = userEvent.setup();

    render(<ProjectCapacityReportPage project={baseProject} />);

    await waitFor(() => expect(mockedGetProjectCapacity).toHaveBeenCalledTimes(1));

    const lackFe = await screen.findByLabelText('Nedostatek FE');
    const lackBe = await screen.findByLabelText('Nedostatek BE');

    await user.click(lackFe);
    await user.click(lackBe);

    const submitButton = screen.getByRole('button', { name: /odeslat report/i });
    await user.click(submitButton);

    await waitFor(() =>
      expect(mockedReportProjectCapacity).toHaveBeenCalledWith(baseProject.id, {
        statusCodes: ['LACK_FE', 'LACK_BE'],
        note: null,
      }),
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /odeslat report/i })).toBeEnabled());

    expect(lackFe).toBeChecked();
    expect(lackBe).toBeChecked();
  });
});
