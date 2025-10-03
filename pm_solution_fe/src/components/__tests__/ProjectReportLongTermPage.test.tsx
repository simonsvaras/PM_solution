import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ProjectOverviewDTO } from '../../api';
import { getProjectLongTermReport } from '../../api';
import ProjectReportLongTermPage from '../ProjectReportLongTermPage';

vi.mock('../../api', () => ({
  getProjectLongTermReport: vi.fn(),
}));

const mockedGetProjectLongTermReport = vi.mocked(getProjectLongTermReport);

const baseProject: ProjectOverviewDTO = {
  id: 1,
  name: 'Projekt Orion',
  budget: 250000,
  budgetFrom: null,
  budgetTo: null,
  reportedCost: 0,
  teamMembers: 0,
  openIssues: 0,
  isExternal: false,
  hourlyRateCzk: null,
};

function formatDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('ProjectReportLongTermPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders filters with default range for the current year', async () => {
    mockedGetProjectLongTermReport.mockResolvedValue({ project: baseProject, buckets: [] });

    render(<ProjectReportLongTermPage project={baseProject} />);

    await waitFor(() => expect(mockedGetProjectLongTermReport).toHaveBeenCalled());

    const now = new Date();
    const expectedFrom = formatDateValue(new Date(now.getFullYear(), 0, 1));
    const expectedTo = formatDateValue(new Date(now.getFullYear(), 11, 31));

    expect(screen.getByLabelText('Období od')).toHaveValue(expectedFrom);
    expect(screen.getByLabelText('Období do')).toHaveValue(expectedTo);
  });

  it('renders combined chart and summary when data is available', async () => {
    mockedGetProjectLongTermReport.mockResolvedValue({
      project: { ...baseProject, budget: 120000 },
      buckets: [
        { month: '2025-01', hours: 24, cost: 18000 },
        { month: '2025-02', hours: 32, cost: 22000 },
      ],
    });

    render(<ProjectReportLongTermPage project={{ ...baseProject, budget: 120000 }} />);

    await waitFor(() => expect(screen.getByRole('img', { name: /Dlouhodobý report projektu Projekt Orion/ })).toBeInTheDocument());

    const hoursSummary = screen.getByText('Celkem hodin').closest('div');
    expect(hoursSummary).toHaveTextContent('56');
    expect(screen.getByText('Kumulativní vyčerpání rozpočtu')).toBeInTheDocument();
  });

  it('shows empty state and budget fallback when months contain no data', async () => {
    mockedGetProjectLongTermReport.mockResolvedValue({
      project: { ...baseProject, budget: null },
      buckets: [
        { month: '2025-01', hours: 0, cost: 0 },
        { month: '2025-02', hours: 0, cost: 0 },
      ],
    });

    render(<ProjectReportLongTermPage project={{ ...baseProject, budget: null }} />);

    await waitFor(() => expect(mockedGetProjectLongTermReport).toHaveBeenCalled());

    expect(await screen.findByText('Za zvolené období nejsou dostupná data.')).toBeInTheDocument();
    expect(screen.getByText(/Rozpočet projektu není nastaven/)).toBeInTheDocument();
  });

  it('renders error message when the API request fails', async () => {
    mockedGetProjectLongTermReport.mockRejectedValue({
      error: {
        code: 'ERR',
        message: 'Chyba načítání',
        httpStatus: 500,
      },
    });

    render(<ProjectReportLongTermPage project={baseProject} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chyba načítání');
  });
});
