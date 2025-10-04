import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProjectOverviewDTO } from '../../api';
import { getProjectLongTermReport, getProjectMilestoneCostSummary } from '../../api';
import ProjectReportLongTermPage from '../ProjectReportLongTermPage';

vi.mock('../../api', () => ({
  getProjectLongTermReport: vi.fn(),
  getProjectMilestoneCostSummary: vi.fn(),
}));

const mockedGetProjectLongTermReport = vi.mocked(getProjectLongTermReport);
const mockedGetProjectMilestoneCostSummary = vi.mocked(getProjectMilestoneCostSummary);

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

/**
 * Formats a native Date object to the YYYY-MM-DD string representation expected by the form inputs.
 */
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

  const milestoneCosts = [
    {
      milestoneId: 10,
      milestoneIid: 1,
      title: 'Milestone A',
      state: 'active',
      dueDate: '2025-03-01',
      totalCost: 12000,
    },
    {
      milestoneId: 11,
      milestoneIid: 2,
      title: 'Milestone B',
      state: 'closed',
      dueDate: '2025-04-01',
      totalCost: 8000,
    },
  ];

  it('renders filters with default range for the current year', async () => {
    mockedGetProjectLongTermReport.mockResolvedValue({
      meta: null,
      totalHours: 0,
      totalCost: 0,
      months: [],
    });
    mockedGetProjectMilestoneCostSummary.mockResolvedValue(milestoneCosts);

    render(<ProjectReportLongTermPage project={baseProject} />);

    await waitFor(() => expect(mockedGetProjectLongTermReport).toHaveBeenCalled());
    await waitFor(() => expect(mockedGetProjectMilestoneCostSummary).toHaveBeenCalled());

    const now = new Date();
    const expectedFrom = formatDateValue(new Date(now.getFullYear(), 0, 1));
    const expectedTo = formatDateValue(new Date(now.getFullYear(), 11, 31));

    expect(screen.getByLabelText('Období od')).toHaveValue(expectedFrom);
    expect(screen.getByLabelText('Období do')).toHaveValue(expectedTo);
  });

  it('renders combined chart and summary when data is available', async () => {
    mockedGetProjectLongTermReport.mockResolvedValue({
      meta: { budget: 120000, budgetFrom: null, budgetTo: null, hourlyRate: null },
      totalHours: 56,
      totalCost: 40000,
      months: [
        {
          monthStart: '2025-01-01T00:00:00Z',
          hours: 24,
          cost: 18000,
          cumulativeHours: 24,
          cumulativeCost: 18000,
          burnRatio: 0.15,
        },
        {
          monthStart: '2025-02-01T00:00:00Z',
          hours: 32,
          cost: 22000,
          cumulativeHours: 56,
          cumulativeCost: 40000,
          burnRatio: 0.3333,
        },
      ],
    });
    mockedGetProjectMilestoneCostSummary.mockResolvedValue(milestoneCosts);

    render(<ProjectReportLongTermPage project={{ ...baseProject, budget: 120000 }} />);

    await waitFor(() => expect(screen.getByRole('img', { name: /Dlouhodobý report projektu Projekt Orion/ })).toBeInTheDocument());
    await waitFor(() => expect(mockedGetProjectMilestoneCostSummary).toHaveBeenCalled());

    const hoursSummary = screen.getByText('Celkem hodin').closest('div');
    expect(hoursSummary).toHaveTextContent('56,0');
    expect(screen.getByText('Kumulativní vyčerpání rozpočtu')).toBeInTheDocument();
    expect(screen.getByText('24,0 h')).toBeInTheDocument();
    expect(screen.getByText('100 %')).toBeInTheDocument();
  });

  it('shows empty state and budget fallback when months contain no data', async () => {
    mockedGetProjectLongTermReport.mockResolvedValue({
      meta: { budget: null, budgetFrom: null, budgetTo: null, hourlyRate: null },
      totalHours: 0,
      totalCost: 0,
      months: [
        {
          monthStart: '2025-01-01T00:00:00Z',
          hours: 0,
          cost: 0,
          cumulativeHours: 0,
          cumulativeCost: 0,
          burnRatio: null,
        },
        {
          monthStart: '2025-02-01T00:00:00Z',
          hours: 0,
          cost: 0,
          cumulativeHours: 0,
          cumulativeCost: 0,
          burnRatio: null,
        },
      ],
    });
    mockedGetProjectMilestoneCostSummary.mockResolvedValue(milestoneCosts);

    render(<ProjectReportLongTermPage project={{ ...baseProject, budget: null }} />);

    await waitFor(() => expect(mockedGetProjectLongTermReport).toHaveBeenCalled());
    await waitFor(() => expect(mockedGetProjectMilestoneCostSummary).toHaveBeenCalled());

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
    mockedGetProjectMilestoneCostSummary.mockResolvedValue([]);

    render(<ProjectReportLongTermPage project={baseProject} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chyba načítání');
  });

  it('renders milestone comparison controls and selects all milestones by default', async () => {
    mockedGetProjectLongTermReport.mockResolvedValue({
      meta: null,
      totalHours: 0,
      totalCost: 0,
      months: [],
    });
    mockedGetProjectMilestoneCostSummary.mockResolvedValue(milestoneCosts);

    render(<ProjectReportLongTermPage project={baseProject} />);

    const heading = await screen.findByRole('heading', { name: 'Srovnání milestones' });
    expect(heading).toBeInTheDocument();

    await waitFor(() => {
      const select = screen.getByLabelText('Vyberte milníky') as HTMLSelectElement;
      const selectedValues = Array.from(select.selectedOptions).map(option => option.value);
      expect(new Set(selectedValues)).toEqual(new Set(['10', '11']));
    });
  });

  it('allows toggling milestone selection with simple clicks', async () => {
    mockedGetProjectLongTermReport.mockResolvedValue({
      meta: null,
      totalHours: 0,
      totalCost: 0,
      months: [],
    });
    mockedGetProjectMilestoneCostSummary.mockResolvedValue(milestoneCosts);

    render(<ProjectReportLongTermPage project={baseProject} />);

    const select = (await screen.findByLabelText('Vyberte milníky')) as HTMLSelectElement;
    const optionA = await screen.findByRole('option', { name: '#1 — Milestone A' });

    fireEvent.mouseDown(optionA);

    await waitFor(() => {
      const selectedValues = Array.from(select.selectedOptions).map(option => option.value);
      expect(selectedValues).toEqual(['11']);
    });

    fireEvent.mouseDown(optionA);

    await waitFor(() => {
      const selectedValues = Array.from(select.selectedOptions).map(option => option.value);
      expect(new Set(selectedValues)).toEqual(new Set(['10', '11']));
    });
  });
});
