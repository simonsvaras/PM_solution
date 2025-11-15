import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  ErrorResponse,
  ProjectOverviewDTO,
  WeeklyPlannerWeek,
  WeeklyPlannerWeekCollection,
  WeeklyPlannerWeekWithMetadata,
  WeeklySummary,
} from '../api';
import ProjectWeeklyPlannerPage from './ProjectWeeklyPlannerPage';

vi.mock('@tanstack/react-query', () => import('../testUtils/reactQueryMock'));
vi.mock('./WeeklyTaskList', () => ({ __esModule: true, default: () => <div data-testid="weekly-task-list" /> }));

vi.mock('../api', async original => {
  const actual = await original();
  return {
    ...actual,
    getWeeklyPlannerSettings: vi.fn(),
    listProjectWeeklyPlannerWeeks: vi.fn(),
    getProjectWeeklyPlannerWeek: vi.fn(),
    getProjectWeekSummary: vi.fn(),
    generateProjectWeeklyPlannerWeeks: vi.fn(),
    updateWeeklyPlannerSettings: vi.fn(),
    createWeeklyTask: vi.fn(),
    updateWeeklyTask: vi.fn(),
    carryOverWeeklyTasks: vi.fn(),
    closeProjectWeek: vi.fn(),
  };
});

const {
  getWeeklyPlannerSettings,
  listProjectWeeklyPlannerWeeks,
  getProjectWeeklyPlannerWeek,
  getProjectWeekSummary,
  generateProjectWeeklyPlannerWeeks,
  updateWeeklyPlannerSettings,
  createWeeklyTask,
  updateWeeklyTask,
  carryOverWeeklyTasks,
  closeProjectWeek,
} = await import('../api');

const mockedGetWeeklyPlannerSettings = vi.mocked(getWeeklyPlannerSettings);
const mockedListProjectWeeklyPlannerWeeks = vi.mocked(listProjectWeeklyPlannerWeeks);
const mockedGetProjectWeeklyPlannerWeek = vi.mocked(getProjectWeeklyPlannerWeek);
const mockedGetProjectWeekSummary = vi.mocked(getProjectWeekSummary);
const mockedGenerateProjectWeeklyPlannerWeeks = vi.mocked(generateProjectWeeklyPlannerWeeks);
const mockedUpdateWeeklyPlannerSettings = vi.mocked(updateWeeklyPlannerSettings);
const mockedCreateWeeklyTask = vi.mocked(createWeeklyTask);
const mockedUpdateWeeklyTask = vi.mocked(updateWeeklyTask);
const mockedCarryOverWeeklyTasks = vi.mocked(carryOverWeeklyTasks);
const mockedCloseProjectWeek = vi.mocked(closeProjectWeek);

const baseWeek: WeeklyPlannerWeek = {
  id: 10,
  projectId: 42,
  sprintId: null,
  weekStart: '2025-01-06',
  weekEnd: '2025-01-12',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  closedAt: null,
  isClosed: false,
  tasks: [],
};

const newWeek: WeeklyPlannerWeek = {
  id: 11,
  projectId: 42,
  sprintId: null,
  weekStart: '2025-01-13',
  weekEnd: '2025-01-19',
  createdAt: '2025-01-08T00:00:00Z',
  updatedAt: '2025-01-08T00:00:00Z',
  closedAt: null,
  isClosed: false,
  tasks: [],
};

const project: ProjectOverviewDTO = {
  id: 42,
  name: 'Demo project',
  budget: null,
  budgetFrom: null,
  budgetTo: null,
  reportedCost: 0,
  teamMembers: 0,
  openIssues: 0,
  isExternal: false,
  hourlyRateCzk: null,
};

const baseMetadata = {
  projectId: 42,
  weekStartDay: 1,
  today: '2025-01-08',
  currentWeekStart: baseWeek.weekStart,
  currentWeekEnd: baseWeek.weekEnd,
  currentWeekId: baseWeek.id,
  roles: [] as string[],
  sprintId: null,
  sprintName: null,
  sprintStatus: null,
  sprintDeadline: null,
};

const newMetadata = {
  ...baseMetadata,
  currentWeekStart: newWeek.weekStart,
  currentWeekEnd: newWeek.weekEnd,
  currentWeekId: newWeek.id,
};

function createSummary(week: WeeklyPlannerWeek): WeeklySummary {
  return {
    projectWeekId: week.id,
    taskCount: 0,
    totalHours: null,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    state: null,
    isClosed: false,
    completedAt: null,
    metrics: {
      totalTasks: null,
      completedTasks: null,
      completedPercentage: null,
      carriedOverTasks: null,
      carriedOverPercentage: null,
      newTasks: null,
      inProgressTasks: null,
    },
    permissions: { canCloseWeek: false, canCarryOver: false },
  };
}

function setupSuccessfulMocks() {
  mockedGetWeeklyPlannerSettings.mockResolvedValue({ weekStartDay: 1 });
  let loadCount = 0;
  mockedListProjectWeeklyPlannerWeeks.mockImplementation(async (): Promise<WeeklyPlannerWeekCollection> => {
    loadCount += 1;
    if (loadCount === 1) {
      return { weeks: [baseWeek], metadata: baseMetadata };
    }
    return { weeks: [newWeek, baseWeek], metadata: newMetadata };
  });
  mockedGetProjectWeeklyPlannerWeek.mockImplementation(async (_projectId: number, weekId: number): Promise<WeeklyPlannerWeekWithMetadata> => {
    if (weekId === newWeek.id) {
      return { week: newWeek, metadata: newMetadata };
    }
    return { week: baseWeek, metadata: baseMetadata };
  });
  mockedGetProjectWeekSummary.mockImplementation(async (_projectId: number, weekId: number) => {
    return createSummary(weekId === newWeek.id ? newWeek : baseWeek);
  });
  mockedGenerateProjectWeeklyPlannerWeeks.mockResolvedValue({ weeks: [newWeek], metadata: newMetadata });
  mockedUpdateWeeklyPlannerSettings.mockResolvedValue({ weekStartDay: 1 });
  mockedCreateWeeklyTask.mockImplementation(async () => {
    throw new Error('createWeeklyTask should not be called in tests');
  });
  mockedUpdateWeeklyTask.mockImplementation(async () => {
    throw new Error('updateWeeklyTask should not be called in tests');
  });
  mockedCarryOverWeeklyTasks.mockResolvedValue([]);
  mockedCloseProjectWeek.mockResolvedValue({ week: baseWeek, metadata: baseMetadata });
}

function resetMocks() {
  mockedGetWeeklyPlannerSettings.mockReset();
  mockedListProjectWeeklyPlannerWeeks.mockReset();
  mockedGetProjectWeeklyPlannerWeek.mockReset();
  mockedGetProjectWeekSummary.mockReset();
  mockedGenerateProjectWeeklyPlannerWeeks.mockReset();
  mockedUpdateWeeklyPlannerSettings.mockReset();
  mockedCreateWeeklyTask.mockReset();
  mockedUpdateWeeklyTask.mockReset();
  mockedCarryOverWeeklyTasks.mockReset();
  mockedCloseProjectWeek.mockReset();
}

function renderPlanner(onShowToast = vi.fn()) {
  return render(<ProjectWeeklyPlannerPage project={project} onShowToast={onShowToast} />);
}

beforeEach(() => {
  resetMocks();
  setupSuccessfulMocks();
});

describe('ProjectWeeklyPlannerPage', () => {
  it('creates the next week when the create button is clicked', async () => {
    const toastSpy = vi.fn();
    const user = userEvent.setup();
    renderPlanner(toastSpy);

    await waitFor(() => expect(mockedListProjectWeeklyPlannerWeeks).toHaveBeenCalledTimes(1));
    const button = await screen.findByRole('button', { name: 'Vytvořit nový týden' });

    await user.click(button);

    await waitFor(() => expect(mockedGenerateProjectWeeklyPlannerWeeks).toHaveBeenCalledTimes(1));
    expect(mockedGenerateProjectWeeklyPlannerWeeks).toHaveBeenCalledWith(42, {
      from: '2025-01-13',
      to: '2025-01-13',
    });
    await waitFor(() => expect(mockedListProjectWeeklyPlannerWeeks).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockedGetProjectWeeklyPlannerWeek).toHaveBeenCalledWith(42, newWeek.id));
    expect(toastSpy).toHaveBeenCalledWith('success', 'Nový týden byl vytvořen.');
  });

  it('shows an error message when creating a week fails', async () => {
    const error: ErrorResponse = {
      error: {
        code: 'create_failed',
        message: 'Testovací chyba',
        details: undefined,
        httpStatus: 500,
        requestId: undefined,
      },
    };
    mockedGenerateProjectWeeklyPlannerWeeks.mockRejectedValueOnce(error);
    const user = userEvent.setup();
    renderPlanner();

    await waitFor(() => expect(mockedListProjectWeeklyPlannerWeeks).toHaveBeenCalledTimes(1));
    const button = await screen.findByRole('button', { name: 'Vytvořit nový týden' });

    await user.click(button);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Testovací chyba'));
    expect(mockedGenerateProjectWeeklyPlannerWeeks).toHaveBeenCalledTimes(1);
  });
});
