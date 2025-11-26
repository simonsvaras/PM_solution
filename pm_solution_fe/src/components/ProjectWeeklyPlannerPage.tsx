import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import './ProjectWeeklyPlannerPage.css';
import Modal from './Modal';
import WeeklyTaskFormModal, {
  type WeekSelectOption,
  type WeeklyTaskFormInitialTask,
  type WeeklyTaskFormMode,
  type WeeklyTaskFormValues,
} from './WeeklyTaskFormModal';
import WeeklySummaryPanel from './WeeklySummaryPanel';
import WeeklyTaskList, {
  getWeeklyTasksQueryKey,
  prependWeeklyTask,
  removeWeeklyTask,
  replaceWeeklyTask,
  setWeeklyTasksQueryData,
  type WeeklyTasksQueryData,
} from './WeeklyTaskList';
import BacklogTaskColumn from './BacklogTaskColumn';
import { getBacklogTasksQueryKey, setBacklogTasksQueryData } from './backlogTasksQuery';
import SprintHeader from './planning/SprintHeader';
import PlannerBoard from './planning/PlannerBoard';
import { dayNames, formatDate, formatDateRange, formatPlannedHours, getDayLabel } from './weeklyPlannerUtils';
import {
  type CarryOverTasksPayload,
  type ErrorResponse,
  type ProjectOverviewDTO,
  type Sprint,
  type WeeklyPlannerMetadata,
  type WeeklyPlannerTask,
  type WeeklyPlannerWeek,
  type WeeklyPlannerWeekCollection,
  type WeeklyPlannerWeekGenerationPayload,
  type WeeklySummary,
  type WeeklyTaskPayload,
  carryOverWeeklyTasks,
  closeProjectWeek,
  createWeeklyTask,
  generateProjectWeeklyPlannerWeeks,
  getCurrentProjectSprint,
  getSprintSummary,
  getProjectWeekSummary,
  getProjectWeeklyPlannerWeek,
  listProjectWeeklyPlannerWeeks,
  updateWeeklyTask,
  updateWeeklyTaskWeek,
} from '../api';
import SprintCreateForm from './planning/SprintCreateForm';
import { getCurrentSprintQueryKey } from './planning/queryKeys';

type ToastKind = 'success' | 'warning' | 'error';

type ProjectWeeklyPlannerPageProps = {
  project: ProjectOverviewDTO;
  onShowToast?: (type: ToastKind, text: string) => void;
};

type CarryOverContext = {
  sourceWeek: WeeklyPlannerWeek;
  targetWeekStart: string;
  targetWeekId: number | null;
};

type SprintMetadataState = {
  id: number | null;
  name: string | null;
  status: string | null;
  deadline: string | null;
};

const WEEK_FETCH_LIMIT = 20;

type TaskMutationContext = {
  queryKey: ReturnType<typeof getWeeklyTasksQueryKey>;
  previous: WeeklyTasksQueryData | undefined;
  weekId: number;
  sprintId: number | null;
  optimisticId?: number;
};

type CreateTaskVariables = { weekId: number; dayOfWeek: number; values: WeeklyTaskFormValues };
type UpdateTaskVariables = { weekId: number; taskId: number; dayOfWeek: number; values: WeeklyTaskFormValues };
type MoveTaskVariables = { taskId: number; fromWeekId: number | null; toWeekId: number | null | undefined };
type MoveTaskContext = {
  previousTasks: WeeklyPlannerTask[];
  sourceWeek?: WeeklyTasksQueryData;
  targetWeek?: WeeklyTasksQueryData;
  sprintId: number | null;
  backlogTasks?: WeeklyPlannerTask[];
};

function normaliseDestinationWeekId(value: number | null | undefined): number | null {
  if (typeof value === 'number') {
    return value;
  }
  return null;
}

type BacklogTaskMutationContext = {
  sprintTasksKey: [string, number, number | null];
  backlogTasksKey: ReturnType<typeof getBacklogTasksQueryKey>;
  previousSprintTasks: WeeklyPlannerTask[];
  previousBacklogTasks: WeeklyPlannerTask[];
  optimisticId: number;
  sprintId: number;
};

let optimisticTaskIdCounter = -1;

function nextOptimisticTaskId(): number {
  optimisticTaskIdCounter -= 1;
  return optimisticTaskIdCounter;
}

function normaliseDateToUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function alignToWeekStart(date: Date, weekStartDay: number): Date {
  const normalised = normaliseDateToUTC(date);
  const target = ((weekStartDay % dayNames.length) + dayNames.length) % dayNames.length;
  const current = normalised.getUTCDay();
  const diff = (current - target + dayNames.length) % dayNames.length;
  return addDays(normalised, -diff);
}

function formatIsoDate(date: Date): string {
  return normaliseDateToUTC(date).toISOString().slice(0, 10);
}

function normaliseWeekStart(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return formatIsoDate(new Date(parsed));
}

function parsePlannerDate(value: string | null | undefined): number {
  if (!value) {
    return Number.NaN;
  }
  const isoString = value.includes('T') ? value : `${value}T00:00:00Z`;
  const parsed = Date.parse(isoString);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function getWeekSortValue(week: WeeklyPlannerWeek): number {
  const start = parsePlannerDate(week.weekStart);
  if (!Number.isNaN(start)) {
    return start;
  }
  const end = parsePlannerDate(week.weekEnd);
  if (!Number.isNaN(end)) {
    return end;
  }
  return 0;
}

function findNextWeekStart(
  weeks: WeeklyPlannerWeek[],
  weekStartDay: number,
  fallbackWeekStart: string | null,
): string {
  const existingStarts = new Set(
    weeks
      .map(week => normaliseWeekStart(week.weekStart))
      .filter((value): value is string => value !== null),
  );

  let baseDate: Date | null = null;
  const latestTimestamp = weeks.reduce<number>((latest, week) => {
    const parsed = Date.parse(week.weekStart);
    if (Number.isNaN(parsed)) {
      return latest;
    }
    return Math.max(latest, parsed);
  }, Number.NEGATIVE_INFINITY);

  if (Number.isFinite(latestTimestamp) && latestTimestamp !== Number.NEGATIVE_INFINITY) {
    baseDate = addDays(normaliseDateToUTC(new Date(latestTimestamp)), 7);
  }

  if (!baseDate && fallbackWeekStart) {
    const parsed = Date.parse(fallbackWeekStart);
    if (!Number.isNaN(parsed)) {
      baseDate = addDays(normaliseDateToUTC(new Date(parsed)), 7);
    }
  }

  if (!baseDate) {
    baseDate = alignToWeekStart(new Date(), weekStartDay);
  }

  let candidate = baseDate;
  let candidateIso = formatIsoDate(candidate);
  let guard = 0;
  while (existingStarts.has(candidateIso) && guard < 500) {
    candidate = addDays(candidate, 7);
    candidateIso = formatIsoDate(candidate);
    guard += 1;
  }

  return candidateIso;
}

const WEEK_DAYS_COUNT = dayNames.length;

function normaliseTaskDayOfWeek(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 1;
  }
  const rounded = Math.trunc(value);
  if (rounded < 1) {
    return 1;
  }
  if (rounded > WEEK_DAYS_COUNT) {
    return WEEK_DAYS_COUNT;
  }
  return rounded;
}

function mapFormValuesToPayload(values: WeeklyTaskFormValues, options?: { dayOfWeek?: number | null }): WeeklyTaskPayload {
  const trimmedTitle = values.title.trim();
  const trimmedDescription = values.description.trim();
  const dayOfWeek = normaliseTaskDayOfWeek(options?.dayOfWeek ?? null);
  return {
    dayOfWeek,
    deadline: values.deadline ?? null,
    issueId: values.issueId ?? null,
    internId: values.assignedInternId ?? null,
    note: trimmedDescription.length > 0 ? trimmedDescription : trimmedTitle,
    plannedHours: null,
  };
}

function createOptimisticTaskFromForm(
  values: WeeklyTaskFormValues,
  overrides?: Partial<WeeklyPlannerTask>,
): WeeklyPlannerTask {
  const now = new Date().toISOString();
  const status = values.status === 'CLOSED' ? 'CLOSED' : 'OPENED';
  const optimisticId = overrides?.id ?? nextOptimisticTaskId();
  const trimmedTitle = values.title.trim();
  const trimmedDescription = values.description.trim();
  const inferredWeekId = overrides?.weekId ?? null;
  const isBacklog = overrides?.isBacklog ?? inferredWeekId === null;
  return {
    id: optimisticId,
    weekId: inferredWeekId,
    isBacklog,
    dayOfWeek: overrides?.dayOfWeek ?? null,
    note: overrides?.note ?? (trimmedDescription.length > 0 ? trimmedDescription : trimmedTitle),
    plannedHours: overrides?.plannedHours ?? null,
    internId: values.assignedInternId ?? overrides?.internId ?? null,
    internName: overrides?.internName ?? null,
    issueId: values.issueId ?? overrides?.issueId ?? null,
    issueTitle: overrides?.issueTitle ?? trimmedTitle,
    issueState: status === 'CLOSED' ? 'closed' : 'opened',
    status,
    deadline: values.deadline ?? overrides?.deadline ?? null,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    carriedOverFromWeekStart: overrides?.carriedOverFromWeekStart ?? null,
    carriedOverFromWeekId: overrides?.carriedOverFromWeekId ?? null,
  };
}

function isIssueClosed(task: WeeklyPlannerTask): boolean {
  return task.status === 'CLOSED';
}

export default function ProjectWeeklyPlannerPage({ project, onShowToast }: ProjectWeeklyPlannerPageProps) {
  const [weeksLoading, setWeeksLoading] = useState(false);
  const [weeksError, setWeeksError] = useState<ErrorResponse | null>(null);
  const [weeks, setWeeks] = useState<WeeklyPlannerWeek[]>([]);
  const orderedWeeks = useMemo(
    () => [...weeks].sort((first, second) => getWeekSortValue(first) - getWeekSortValue(second)),
    [weeks],
  );
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<WeeklyPlannerWeek | null>(null);
  const [weekError, setWeekError] = useState<ErrorResponse | null>(null);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<ErrorResponse | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closingWeek, setClosingWeek] = useState(false);
  const [closeError, setCloseError] = useState<ErrorResponse | null>(null);
  const [carryOverModalOpen, setCarryOverModalOpen] = useState(false);
  const [carryOverContext, setCarryOverContext] = useState<CarryOverContext | null>(null);
  const [carryOverSelection, setCarryOverSelection] = useState<number[]>([]);
  const [carryOverSubmitting, setCarryOverSubmitting] = useState(false);
  const [carryOverError, setCarryOverError] = useState<ErrorResponse | null>(null);
  const [carriedAudit, setCarriedAudit] = useState<Record<number, string>>({});
  const [roles, setRoles] = useState<string[]>([]);
  const [weekStartDay, setWeekStartDay] = useState<number>(1);
  const [createWeekError, setCreateWeekError] = useState<ErrorResponse | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedWeekIdForForm, setSelectedWeekIdForForm] = useState<number | null>(null);
  const [taskFormMode, setTaskFormMode] = useState<WeeklyTaskFormMode>('create');
  const [taskFormInitial, setTaskFormInitial] = useState<WeeklyTaskFormInitialTask | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTaskWeekId, setEditingTaskWeekId] = useState<number | null>(null);
  const [taskMutationError, setTaskMutationError] = useState<ErrorResponse | null>(null);
  const [taskFormDayOfWeek, setTaskFormDayOfWeek] = useState<number>(1);
  const [sprintMetadata, setSprintMetadata] = useState<SprintMetadataState>({
    id: null,
    name: null,
    status: null,
    deadline: null,
  });

  const queryClient = useQueryClient();
  const fetchCurrentSprint = useCallback(() => getCurrentProjectSprint(project.id), [project.id]);
  const {
    data: currentSprintData,
    error: currentSprintError,
    isPending: sprintLoading,
    refetch: refetchSprint,
  } = useQuery({
    queryKey: getCurrentSprintQueryKey(project.id),
    queryFn: fetchCurrentSprint,
  });
  const currentSprint = currentSprintData ?? null;
  const sprintError = currentSprintError as ErrorResponse | null;
  const currentSprintId = currentSprint?.id ?? null;
  const plannerSprintId = sprintMetadata.id ?? currentSprintId;
  const sprintStatus = sprintMetadata.status ?? currentSprint?.status ?? null;
  const isSprintOpen = (sprintStatus ?? '').toUpperCase() === 'OPEN';

  const {
    data: sprintTasksData,
    error: sprintTasksError,
    isPending: sprintTasksLoading,
    refetch: refetchSprintTasks,
  } = useQuery({
    queryKey: ['project-sprint-tasks', project.id, currentSprintId],
    queryFn: async () => {
      if (currentSprintId === null) {
        return [];
      }
      const summary = await getSprintSummary(project.id, currentSprintId);
      return summary.tasks;
    },
    enabled: currentSprintId !== null,
  });
  const sprintTasks = sprintTasksData ?? [];
  const backlogTasks = useMemo(
    () => sprintTasks.filter(task => task.isBacklog || task.weekId === null),
    [sprintTasks],
  );
  useEffect(() => {
    if (currentSprintId === null) {
      return;
    }
    setBacklogTasksQueryData(queryClient, project.id, currentSprintId, backlogTasks);
  }, [backlogTasks, currentSprintId, project.id, queryClient]);
  const backlogQueryKey = useMemo(
    () => getBacklogTasksQueryKey(project.id, currentSprintId),
    [project.id, currentSprintId],
  );
  const { data: backlogQueryTasks } = useQuery({
    queryKey: backlogQueryKey,
    enabled: currentSprintId !== null,
    queryFn: async () => queryClient.getQueryData<WeeklyPlannerTask[]>(backlogQueryKey) ?? [],
    initialData: () => queryClient.getQueryData<WeeklyPlannerTask[]>(backlogQueryKey) ?? backlogTasks,
  });
  const backlogColumnTasks = currentSprintId === null ? [] : backlogQueryTasks ?? backlogTasks;
  const sprintWeekTasks = useMemo(() => {
    const map = new Map<number, WeeklyPlannerTask[]>();
    sprintTasks.forEach(task => {
      if (task.weekId === null) {
        return;
      }
      const bucket = map.get(task.weekId);
      if (bucket) {
        bucket.push(task);
        return;
      }
      map.set(task.weekId, [task]);
    });
    return map;
  }, [sprintTasks]);
  const sprintTasksErrorTyped = sprintTasksError as ErrorResponse | null;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const applySprintMetadata = useCallback((metadata: WeeklyPlannerMetadata) => {
    setSprintMetadata({
      id: metadata.sprintId ?? null,
      name: metadata.sprintName ?? null,
      status: metadata.sprintStatus ?? null,
      deadline: metadata.sprintDeadline ?? null,
    });
  }, []);

  const openCreateTaskModal = useCallback(
    (weekId: number | null) => {
      if (weekId === null) {
        return;
      }
      setTaskFormMode('create');
      setEditingTaskId(null);
      setTaskFormInitial(null);
      setSelectedWeekIdForForm(weekId);
      setEditingTaskWeekId(weekId);
      setTaskMutationError(null);
      setTaskFormDayOfWeek(1);
      setIsCreateModalOpen(true);
    },
    [],
  );

  const closeCreateTaskModal = useCallback(() => {
    setIsCreateModalOpen(false);
    setTaskFormInitial(null);
    setSelectedWeekIdForForm(null);
    setEditingTaskId(null);
    setEditingTaskWeekId(null);
    setTaskFormMode('create');
    setTaskMutationError(null);
    setTaskFormDayOfWeek(1);
  }, []);

  const loadWeeks = useCallback(() => {
    setWeeksLoading(true);
    setWeeksError(null);
    listProjectWeeklyPlannerWeeks(project.id, { limit: WEEK_FETCH_LIMIT, offset: 0 })
      .then(collection => {
        setWeeks(collection.weeks);
        const metadataSprintId = collection.metadata.sprintId ?? plannerSprintId;
        collection.weeks.forEach(week => {
          setWeeklyTasksQueryData(queryClient, project.id, metadataSprintId, week.id, week.tasks);
        });
        setRoles(collection.metadata.roles);
        setWeekStartDay(collection.metadata.weekStartDay);
        applySprintMetadata(collection.metadata);
        setSelectedWeekId(prev => {
          if (prev !== null) return prev;
          if (collection.metadata.currentWeekId !== null) {
            return collection.metadata.currentWeekId;
          }
          return collection.weeks[0]?.id ?? null;
        });
      })
      .catch(err => setWeeksError(err as ErrorResponse))
      .finally(() => setWeeksLoading(false));
  }, [applySprintMetadata, plannerSprintId, project.id, queryClient]);

  useEffect(() => {
    if (currentSprintId === null) {
      setWeeks([]);
      setSelectedWeek(null);
      setSelectedWeekId(null);
      setSummary(null);
      return;
    }
    loadWeeks();
  }, [loadWeeks, currentSprintId]);

  const fetchWeek = useCallback(
    (weekId: number) => {
      setWeekError(null);
      getProjectWeeklyPlannerWeek(project.id, weekId)
        .then(data => {
          const metadataSprintId = data.metadata.sprintId ?? plannerSprintId;
          setWeeklyTasksQueryData(queryClient, project.id, metadataSprintId, data.week.id, data.week.tasks);
          setSelectedWeek(data.week);
          setRoles(data.metadata.roles);
          setWeekStartDay(data.metadata.weekStartDay);
          applySprintMetadata(data.metadata);
          setWeeks(prev => {
            const exists = prev.findIndex(week => week.id === data.week.id);
            if (exists >= 0) {
              const updated = [...prev];
              updated[exists] = data.week;
              return updated;
            }
            return [...prev, data.week].sort((a, b) => {
              const aTime = new Date(a.weekStart).getTime();
              const bTime = new Date(b.weekStart).getTime();
              return bTime - aTime;
            });
          });
        })
        .catch(err => setWeekError(err as ErrorResponse));

      setSummaryLoading(true);
      setSummaryError(null);
      getProjectWeekSummary(project.id, weekId)
        .then(setSummary)
        .catch(err => setSummaryError(err as ErrorResponse))
        .finally(() => setSummaryLoading(false));
    },
    [applySprintMetadata, plannerSprintId, project.id, queryClient],
  );

  useEffect(() => {
    if (currentSprintId === null) {
      setSelectedWeek(null);
      setSummary(null);
      return;
    }
    if (selectedWeekId === null) {
      setSelectedWeek(null);
      setSummary(null);
      return;
    }
    fetchWeek(selectedWeekId);
  }, [selectedWeekId, fetchWeek, currentSprintId]);

  useEffect(() => {
    if (!isCreateModalOpen && selectedWeekId !== selectedWeekIdForForm) {
      setSelectedWeekIdForForm(selectedWeekId);
    }
  }, [isCreateModalOpen, selectedWeekId, selectedWeekIdForForm]);

  useEffect(() => {
    if (taskFormMode === 'create' && isCreateModalOpen && selectedWeekIdForForm !== selectedWeekId) {
      closeCreateTaskModal();
    }
  }, [
    closeCreateTaskModal,
    isCreateModalOpen,
    selectedWeekId,
    selectedWeekIdForForm,
    taskFormMode,
  ]);

  const notify = useCallback(
    (type: ToastKind, text: string) => {
      onShowToast?.(type, text);
    },
    [onShowToast],
  );

  const handleBacklogRetry = useCallback(() => {
    if (currentSprintId !== null) {
      refetchSprintTasks();
    }
  }, [currentSprintId, refetchSprintTasks]);

  const boardError = weeksError ?? weekError;
  const boardErrorLabel = weeksError
    ? 'Týdny se nepodařilo načíst.'
    : weekError
      ? 'Detail vybraného týdne se nepodařilo načíst.'
      : undefined;
  const handleWeeksBoardRetry = useCallback(() => {
    if (weeksError) {
      loadWeeks();
      return;
    }
    if (weekError && selectedWeekId !== null) {
      fetchWeek(selectedWeekId);
    }
  }, [weeksError, weekError, loadWeeks, fetchWeek, selectedWeekId]);

  const handleSprintCreated = useCallback(() => {
    notify('success', 'Sprint byl vytvořen.');
  }, [notify]);

  const createTaskMutation = useMutation<WeeklyPlannerTask, ErrorResponse, CreateTaskVariables, TaskMutationContext>({
    mutationFn: async ({ weekId, values, dayOfWeek }: CreateTaskVariables) => {
      const payload = mapFormValuesToPayload(values, { dayOfWeek });
      return createWeeklyTask(project.id, weekId, payload);
    },
    onMutate: async ({ weekId, values, dayOfWeek }: CreateTaskVariables) => {
      const queryKey = getWeeklyTasksQueryKey(project.id, plannerSprintId, weekId);
      await queryClient.cancelQueries({ queryKey });
      const optimisticTask = createOptimisticTaskFromForm(values, { dayOfWeek, weekId, isBacklog: false });
      const optimisticId = optimisticTask.id;
      const previous = prependWeeklyTask(queryClient, project.id, plannerSprintId, weekId, optimisticTask);
      setTaskMutationError(null);
      return { queryKey, previous, weekId, optimisticId, sprintId: plannerSprintId } satisfies TaskMutationContext;
    },
    onError: (error: ErrorResponse, _variables: CreateTaskVariables | undefined, context: TaskMutationContext | undefined) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      setTaskMutationError(error);
    },
    onSuccess: (
      task: WeeklyPlannerTask,
      _variables: CreateTaskVariables | undefined,
      context: TaskMutationContext | undefined,
    ) => {
      if (context) {
        replaceWeeklyTask(
          queryClient,
          project.id,
          context.sprintId,
          context.weekId,
          task,
          context.optimisticId,
        );
      }
      setTaskMutationError(null);
      closeCreateTaskModal();
      notify('success', 'Úkol byl vytvořen.');
    },
    onSettled: (
      _result: WeeklyPlannerTask | undefined,
      _error: ErrorResponse | null,
      _variables: CreateTaskVariables | undefined,
      context: TaskMutationContext | undefined,
    ) => {
      if (context) {
        queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
    },
  });

  const backlogTaskMutation = useMutation<
    WeeklyPlannerTask,
    ErrorResponse,
    WeeklyTaskFormValues,
    BacklogTaskMutationContext | undefined
  >({
    mutationFn: async (values: WeeklyTaskFormValues) => {
      if (currentSprintId === null) {
        throw new Error('Backlog je dostupný až po vytvoření sprintu.');
      }
      const payload = mapFormValuesToPayload(values, { dayOfWeek: null });
      return createWeeklyTask(project.id, null, payload);
    },
    onMutate: async (values: WeeklyTaskFormValues) => {
      if (currentSprintId === null) {
        return undefined;
      }
      const sprintTasksKey: [string, number, number | null] = ['project-sprint-tasks', project.id, currentSprintId];
      const backlogTasksKey = getBacklogTasksQueryKey(project.id, currentSprintId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: sprintTasksKey }),
        queryClient.cancelQueries({ queryKey: backlogTasksKey }),
      ]);
      const optimisticTask = createOptimisticTaskFromForm(values, { weekId: null, dayOfWeek: null, isBacklog: true });
      const previousSprintTasks = queryClient.getQueryData<WeeklyPlannerTask[]>(sprintTasksKey) ?? [];
      const previousBacklogTasks = queryClient.getQueryData<WeeklyPlannerTask[]>(backlogTasksKey) ?? [];
      queryClient.setQueryData<WeeklyPlannerTask[]>(sprintTasksKey, [optimisticTask, ...previousSprintTasks]);
      setBacklogTasksQueryData(queryClient, project.id, currentSprintId, [optimisticTask, ...previousBacklogTasks]);
      return {
        sprintTasksKey,
        backlogTasksKey,
        previousSprintTasks,
        previousBacklogTasks,
        optimisticId: optimisticTask.id,
        sprintId: currentSprintId,
      } satisfies BacklogTaskMutationContext;
    },
    onError: (_error: ErrorResponse, _values: WeeklyTaskFormValues | undefined, context: BacklogTaskMutationContext | undefined) => {
      if (context) {
        queryClient.setQueryData(context.sprintTasksKey, context.previousSprintTasks);
        setBacklogTasksQueryData(queryClient, project.id, context.sprintId, context.previousBacklogTasks);
      }
    },
    onSuccess: (task: WeeklyPlannerTask, _values: WeeklyTaskFormValues | undefined, context: BacklogTaskMutationContext | undefined) => {
      if (context) {
        queryClient.setQueryData<WeeklyPlannerTask[]>(context.sprintTasksKey, old => {
          if (!old) {
            return old;
          }
          return old.map(existing => (existing.id === context.optimisticId ? task : existing));
        });
        const currentBacklog = queryClient.getQueryData<WeeklyPlannerTask[]>(context.backlogTasksKey) ?? [];
        const nextBacklog = currentBacklog.map(existing =>
          existing.id === context.optimisticId ? { ...task, weekId: null, isBacklog: true } : existing,
        );
        setBacklogTasksQueryData(queryClient, project.id, context.sprintId, nextBacklog);
      }
      notify('success', 'Úkol byl přidán do backlogu.');
    },
    onSettled: (_result, _error, _values, context) => {
      if (context) {
        queryClient.invalidateQueries({ queryKey: context.sprintTasksKey });
        queryClient.invalidateQueries({ queryKey: context.backlogTasksKey });
      }
    },
  });

  const handleBacklogTaskSubmit = useCallback(
    async (values: WeeklyTaskFormValues) => {
      await backlogTaskMutation.mutateAsync(values);
    },
    [backlogTaskMutation],
  );

  const generateWeekMutation = useMutation<WeeklyPlannerWeekCollection, ErrorResponse, WeeklyPlannerWeekGenerationPayload>({
    mutationFn: (payload: WeeklyPlannerWeekGenerationPayload) =>
      generateProjectWeeklyPlannerWeeks(project.id, payload),
  });

  const updateTaskMutation = useMutation<WeeklyPlannerTask, ErrorResponse, UpdateTaskVariables, TaskMutationContext>({
    mutationFn: async ({ weekId, taskId, values, dayOfWeek }: UpdateTaskVariables) => {
      const payload = mapFormValuesToPayload(values, { dayOfWeek });
      return updateWeeklyTask(project.id, weekId, taskId, payload);
    },
    onMutate: async ({ weekId, taskId, values, dayOfWeek }: UpdateTaskVariables) => {
      const queryKey = getWeeklyTasksQueryKey(project.id, plannerSprintId, weekId);
      await queryClient.cancelQueries({ queryKey });
      const current = queryClient.getQueryData<WeeklyTasksQueryData>(queryKey);
      const existing =
        current?.weekTasks.find(task => task.id === taskId) ??
        current?.unscheduledTasks.find(task => task.id === taskId);
      const optimisticTask = createOptimisticTaskFromForm(
        values,
        existing ?? { id: taskId, dayOfWeek, weekId, isBacklog: false },
      );
      const previous = replaceWeeklyTask(queryClient, project.id, plannerSprintId, weekId, optimisticTask, taskId);
      setTaskMutationError(null);
      return { queryKey, previous, weekId, optimisticId: taskId, sprintId: plannerSprintId } satisfies TaskMutationContext;
    },
    onError: (error: ErrorResponse, _variables: UpdateTaskVariables | undefined, context: TaskMutationContext | undefined) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      setTaskMutationError(error);
    },
    onSuccess: (
      task: WeeklyPlannerTask,
      variables: UpdateTaskVariables | undefined,
      context: TaskMutationContext | undefined,
    ) => {
      if (context) {
        replaceWeeklyTask(
          queryClient,
          project.id,
          context.sprintId,
          context.weekId,
          task,
          variables?.taskId ?? context.optimisticId,
        );
      }
      setTaskMutationError(null);
      closeCreateTaskModal();
      notify('success', 'Úkol byl upraven.');
    },
    onSettled: (
      _result: WeeklyPlannerTask | undefined,
      _error: ErrorResponse | null,
      _variables: UpdateTaskVariables | undefined,
      context: TaskMutationContext | undefined,
    ) => {
      if (context) {
        queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
    },
  });

  const moveTaskMutation = useMutation<WeeklyPlannerTask, ErrorResponse, MoveTaskVariables, MoveTaskContext>({
    mutationFn: async ({ taskId, toWeekId }: MoveTaskVariables) => {
      const destinationWeekId = normaliseDestinationWeekId(toWeekId);
      return updateWeeklyTaskWeek(project.id, taskId, destinationWeekId);
    },
    onMutate: async ({ taskId, fromWeekId, toWeekId }: MoveTaskVariables) => {
      const destinationWeekId = normaliseDestinationWeekId(toWeekId);
      const queryKey = ['project-sprint-tasks', project.id, currentSprintId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<WeeklyPlannerTask[]>(queryKey) ?? [];
      const mapped = previous.map(existing =>
        existing.id === taskId
          ? { ...existing, weekId: destinationWeekId, isBacklog: destinationWeekId === null }
          : existing,
      );
      queryClient.setQueryData(queryKey, mapped);

      let sourceWeek: WeeklyTasksQueryData | undefined;
      let targetWeek: WeeklyTasksQueryData | undefined;
      let backlogTasksSnapshot: WeeklyPlannerTask[] | undefined;
      if (plannerSprintId !== null) {
        const backlogKey = getBacklogTasksQueryKey(project.id, plannerSprintId);
        backlogTasksSnapshot = queryClient.getQueryData<WeeklyPlannerTask[]>(backlogKey) ?? [];
        let backlogNext = backlogTasksSnapshot;
        if (fromWeekId === null) {
          backlogNext = backlogNext.filter(task => task.id !== taskId);
        }
        if (destinationWeekId === null) {
          const optimisticTask =
            mapped.find(task => task.id === taskId) ?? previous.find(task => task.id === taskId);
          if (optimisticTask) {
            backlogNext = [{ ...optimisticTask, weekId: null, isBacklog: true }, ...backlogNext.filter(task => task.id !== taskId)];
          }
        }
        setBacklogTasksQueryData(queryClient, project.id, plannerSprintId, backlogNext);
      }

      if (typeof fromWeekId === 'number') {
        sourceWeek = removeWeeklyTask(queryClient, project.id, plannerSprintId, fromWeekId, taskId);
      }
      if (typeof destinationWeekId === 'number') {
        const optimisticTask = mapped.find(task => task.id === taskId) ?? previous.find(task => task.id === taskId);
        if (optimisticTask) {
          targetWeek = prependWeeklyTask(
            queryClient,
            project.id,
            plannerSprintId,
            destinationWeekId,
            { ...optimisticTask, isBacklog: false },
          );
        }
      }

      setSelectedWeek(current => {
        if (!current) {
          return current;
        }
        if (typeof fromWeekId === 'number' && current.id === fromWeekId) {
          return { ...current, tasks: current.tasks.filter(task => task.id !== taskId) };
        }
        if (typeof destinationWeekId === 'number' && current.id === destinationWeekId) {
          const optimisticTask = mapped.find(task => task.id === taskId) ?? previous.find(task => task.id === taskId);
          if (!optimisticTask) {
            return current;
          }
          const without = current.tasks.filter(task => task.id !== taskId);
          return { ...current, tasks: [{ ...optimisticTask, isBacklog: false }, ...without] };
        }
        return current;
      });

      setTaskMutationError(null);
      return {
        previousTasks: previous,
        sourceWeek,
        targetWeek,
        sprintId: plannerSprintId,
        backlogTasks: backlogTasksSnapshot,
      } satisfies MoveTaskContext;
    },
    onError: (error: ErrorResponse, variables: MoveTaskVariables | undefined, context: MoveTaskContext | undefined) => {
      const queryKey = ['project-sprint-tasks', project.id, currentSprintId];
      queryClient.setQueryData(queryKey, context?.previousTasks ?? []);
      const contextSprintId = context?.sprintId ?? plannerSprintId;
      if (typeof variables?.fromWeekId === 'number' && context?.sourceWeek) {
        queryClient.setQueryData(
          getWeeklyTasksQueryKey(project.id, contextSprintId, variables.fromWeekId),
          context.sourceWeek,
        );
      }
      const destinationWeekId = normaliseDestinationWeekId(variables?.toWeekId);
      if (typeof destinationWeekId === 'number' && context?.targetWeek) {
        queryClient.setQueryData(
          getWeeklyTasksQueryKey(project.id, contextSprintId, destinationWeekId),
          context.targetWeek,
        );
      }
      if (context?.backlogTasks && contextSprintId !== null) {
        setBacklogTasksQueryData(queryClient, project.id, contextSprintId, context.backlogTasks);
      }
      setTaskMutationError(error);
    },
    onSuccess: (task: WeeklyPlannerTask) => {
      const queryKey = ['project-sprint-tasks', project.id, currentSprintId];
      queryClient.setQueryData<WeeklyPlannerTask[]>(queryKey, old => {
        if (!old) {
          return old;
        }
        return old.map(existing => (existing.id === task.id ? task : existing));
      });
      if (typeof task.weekId === 'number') {
        replaceWeeklyTask(queryClient, project.id, plannerSprintId, task.weekId, task);
      }
      if (plannerSprintId !== null) {
        const backlogKey = getBacklogTasksQueryKey(project.id, plannerSprintId);
        const currentBacklog = queryClient.getQueryData<WeeklyPlannerTask[]>(backlogKey) ?? [];
        if (task.weekId === null) {
          const nextBacklog = [{ ...task, weekId: null, isBacklog: true }, ...currentBacklog.filter(existing => existing.id !== task.id)];
          setBacklogTasksQueryData(queryClient, project.id, plannerSprintId, nextBacklog);
        } else {
          const nextBacklog = currentBacklog.filter(existing => existing.id !== task.id);
          setBacklogTasksQueryData(queryClient, project.id, plannerSprintId, nextBacklog);
        }
      }
    },
    onSettled: () => {
      const queryKey = ['project-sprint-tasks', project.id, currentSprintId];
      queryClient.invalidateQueries({ queryKey });
      if (plannerSprintId !== null) {
        queryClient.invalidateQueries({ queryKey: getBacklogTasksQueryKey(project.id, plannerSprintId) });
      }
    },
  });

  const weekSelectOptions = useMemo<WeekSelectOption[]>(() => {
    const options = orderedWeeks.map(week => ({
      id: week.id,
      label: `${formatDateRange(week.weekStart, week.weekEnd)}${week.isClosed ? ' • Uzavřený' : ''}`.trim(),
    }));
    return [{ id: null, label: 'Backlog' }, ...options];
  }, [orderedWeeks]);

  const currentWeekStartDay = weekStartDay;

  const isClosed = summary?.isClosed ?? selectedWeek?.isClosed ?? false;
  const hasPmRole = useMemo(
    () =>
      roles.some(role => {
        const normalized = role.trim().toLowerCase();
        return (
          normalized === 'pm' ||
          normalized === 'project_manager' ||
          normalized === 'project-manager' ||
          normalized.includes('project manager')
        );
      }),
    [roles],
  );
  const canCloseWeek = useMemo(() => {
    if (summary && summary.permissions) {
      if (!summary.permissions.canCloseWeek) {
        return false;
      }
      return roles.length === 0 ? true : hasPmRole;
    }
    if (roles.length > 0) {
      return hasPmRole;
    }
    return false;
  }, [summary, roles, hasPmRole]);

  const closeButtonVisible = canCloseWeek && selectedWeekId !== null;
  const closeButtonDisabled = closingWeek || isClosed;
  const formWeek = useMemo(() => {
    if (selectedWeekIdForForm === null) {
      return null;
    }
    if (selectedWeek && selectedWeek.id === selectedWeekIdForForm) {
      return selectedWeek;
    }
    return weeks.find(week => week.id === selectedWeekIdForForm) ?? null;
  }, [selectedWeekIdForForm, selectedWeek, weeks]);

  const headerRange = formatDateRange(selectedWeek?.weekStart ?? summary?.weekStart ?? null, selectedWeek?.weekEnd ?? summary?.weekEnd ?? null);

  const closeModalFooter = (
    <div className="projectWeeklyPlanner__modalFooter">
      <button
        type="button"
        className="projectWeeklyPlanner__modalButton projectWeeklyPlanner__modalButton--secondary"
        onClick={() => setCloseModalOpen(false)}
        disabled={closingWeek}
      >
        Zpět
      </button>
      <button
        type="button"
        className="projectWeeklyPlanner__modalButton projectWeeklyPlanner__modalButton--primary"
        onClick={handleConfirmCloseWeek}
        disabled={closeButtonDisabled}
      >
        {closingWeek ? 'Uzavírám…' : 'Uzavřít týden'}
      </button>
    </div>
  );

  const carryOverFooter = (
    <div className="projectWeeklyPlanner__modalFooter">
      <button
        type="button"
        className="projectWeeklyPlanner__modalButton projectWeeklyPlanner__modalButton--secondary"
        onClick={() => {
          if (!carryOverSubmitting) {
            setCarryOverModalOpen(false);
            setCarryOverContext(null);
            setCarryOverError(null);
          }
        }}
        disabled={carryOverSubmitting}
      >
        Zavřít
      </button>
      <button
        type="button"
        className="projectWeeklyPlanner__modalButton projectWeeklyPlanner__modalButton--primary"
        onClick={handleConfirmCarryOver}
        disabled={carryOverSubmitting || carryOverSelection.length === 0 || !carryOverContext}
      >
        {carryOverSubmitting ? 'Přenáším…' : 'Přenést vybrané'}
      </button>
    </div>
  );

  function handleWeekChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = Number.parseInt(event.target.value, 10);
    if (Number.isNaN(value)) {
      setSelectedWeekId(null);
      return;
    }
    setSelectedWeekId(value);
    loadWeeks();
  }

  const handleEditTask = useCallback(
    (task: WeeklyPlannerTask) => {
      if (selectedWeekId === null) {
        return;
      }
      setTaskFormMode('edit');
      setEditingTaskId(task.id);
      setSelectedWeekIdForForm(task.weekId ?? selectedWeekId);
      setEditingTaskWeekId(task.weekId ?? selectedWeekId);
      setTaskFormInitial({
        title: task.issueTitle ?? task.note ?? '',
        description: task.note ?? '',
        status: task.status,
        deadline: task.deadline,
        issueId: task.issueId ?? null,
        assignedInternId: task.internId ?? null,
      });
      setTaskFormDayOfWeek(normaliseTaskDayOfWeek(task.dayOfWeek));
      setTaskMutationError(null);
      setIsCreateModalOpen(true);
    },
    [selectedWeekId],
  );

  const handleTaskFormSubmit = useCallback(
    async (values: WeeklyTaskFormValues) => {
      const normalisedDayOfWeek = normaliseTaskDayOfWeek(taskFormDayOfWeek);
      setTaskFormDayOfWeek(normalisedDayOfWeek);
      if (taskFormMode === 'edit') {
        if (editingTaskId === null) {
          throw new Error('Úkol není k dispozici pro úpravu.');
        }
        const currentWeekId = editingTaskWeekId ?? selectedWeekIdForForm ?? selectedWeekId;
        if (currentWeekId === null) {
          throw new Error('Úkol není přiřazen k žádnému týdnu.');
        }
        const targetWeekId = selectedWeekIdForForm;
        if (targetWeekId === null) {
          await updateTaskMutation.mutateAsync({
            weekId: currentWeekId,
            taskId: editingTaskId,
            values,
            dayOfWeek: normalisedDayOfWeek,
          });
          await moveTaskMutation.mutateAsync({
            taskId: editingTaskId,
            fromWeekId: currentWeekId,
            toWeekId: null,
          });
          return;
        }
        if (targetWeekId !== currentWeekId) {
          await moveTaskMutation.mutateAsync({
            taskId: editingTaskId,
            fromWeekId: currentWeekId,
            toWeekId: targetWeekId,
          });
          await updateTaskMutation.mutateAsync({
            weekId: targetWeekId,
            taskId: editingTaskId,
            values,
            dayOfWeek: normalisedDayOfWeek,
          });
          return;
        }
        await updateTaskMutation.mutateAsync({
          weekId: currentWeekId,
          taskId: editingTaskId,
          values,
          dayOfWeek: normalisedDayOfWeek,
        });
        return;
      }
      const activeWeekId = selectedWeekIdForForm ?? selectedWeekId;
      if (activeWeekId === null) {
        throw new Error('Vyberte týden pro uložení úkolu.');
      }
      await createTaskMutation.mutateAsync({ weekId: activeWeekId, values, dayOfWeek: normalisedDayOfWeek });
    },
    [
      createTaskMutation,
      editingTaskId,
      editingTaskWeekId,
      moveTaskMutation,
      selectedWeekId,
      selectedWeekIdForForm,
      taskFormDayOfWeek,
      taskFormMode,
      updateTaskMutation,
    ],
  );

  useEffect(() => {
    if (selectedWeekId === null) {
      closeCreateTaskModal();
    }
  }, [selectedWeekId, closeCreateTaskModal]);

  useEffect(() => {
    setTaskMutationError(null);
  }, [selectedWeekId]);

  function handleOpenCloseModal() {
    setCloseError(null);
    setCloseModalOpen(true);
  }

  function handleConfirmCloseWeek() {
    if (selectedWeekId === null || !selectedWeek) return;
    setCloseError(null);
    setClosingWeek(true);
    closeProjectWeek(project.id, selectedWeekId)
      .then(response => {
        setClosingWeek(false);
        setCloseModalOpen(false);
        setRoles(response.metadata.roles);
        setWeekStartDay(response.metadata.weekStartDay);
        const targetWeekStart = response.metadata.currentWeekStart ?? response.week.weekStart;
        const targetWeekId = response.metadata.currentWeekId ?? null;
        const incompleteTasks = response.week.tasks.filter(task => !isIssueClosed(task));
        setCarryOverSelection(incompleteTasks.map(task => task.id));
        setCarryOverContext({ sourceWeek: response.week, targetWeekStart, targetWeekId });
        setCarryOverModalOpen(true);
        const metadataSprintId = response.metadata.sprintId ?? plannerSprintId;
        setWeeklyTasksQueryData(queryClient, project.id, metadataSprintId, response.week.id, response.week.tasks);
        setWeeks(prev => {
          const exists = prev.findIndex(week => week.id === response.week.id);
          if (exists >= 0) {
            const updated = [...prev];
            updated[exists] = response.week;
            return updated;
          }
          return [...prev, response.week];
        });
        if (targetWeekId !== null) {
          setSelectedWeekId(targetWeekId);
        } else {
          fetchWeek(response.week.id);
        }
        loadWeeks();
      })
      .catch(err => {
        setCloseError(err as ErrorResponse);
        setClosingWeek(false);
      });
  }

  function toggleCarryOverSelection(taskId: number) {
    setCarryOverSelection(prev => {
      if (prev.includes(taskId)) {
        return prev.filter(id => id !== taskId);
      }
      return [...prev, taskId];
    });
  }

  function handleConfirmCarryOver() {
    if (!carryOverContext) {
      setCarryOverModalOpen(false);
      return;
    }
    const payload: CarryOverTasksPayload = {
      targetWeekStart: carryOverContext.targetWeekStart,
      taskIds: carryOverSelection,
    };
    setCarryOverSubmitting(true);
    setCarryOverError(null);
    carryOverWeeklyTasks(project.id, carryOverContext.sourceWeek.id, payload)
      .then(newTasks => {
        setCarryOverSubmitting(false);
        setCarryOverModalOpen(false);
        setCarryOverContext(null);
        setCarryOverSelection([]);
        if (newTasks.length > 0) {
          setCarriedAudit(prev => {
            const updates = { ...prev };
            for (const task of newTasks) {
              updates[task.id] = carryOverContext.sourceWeek.weekStart;
            }
            return updates;
          });
        }
        if (carryOverContext.targetWeekId !== null) {
          fetchWeek(carryOverContext.targetWeekId);
        }
        loadWeeks();
      })
      .catch(err => {
        setCarryOverSubmitting(false);
        setCarryOverError(err as ErrorResponse);
      });
  }

  const carryOverTasks = carryOverContext?.sourceWeek.tasks.filter(task => !isIssueClosed(task)) ?? [];
  const createTaskDisabled = selectedWeekId === null || isCreateModalOpen || !isSprintOpen;
  const createWeekPending = generateWeekMutation.isPending;
  const createWeekButtonDisabled = createWeekPending || weeksLoading || !isSprintOpen;
  const selectedWeekStart = selectedWeek?.weekStart ?? null;
  const handleSprintClosed = useCallback((closedSprint: Sprint) => {
    setSprintMetadata(prev => {
      if (prev.id !== null && prev.id !== closedSprint.id) {
        return prev;
      }
      return {
        id: closedSprint.id,
        name: closedSprint.name,
        status: closedSprint.status,
        deadline: closedSprint.deadline ?? null,
      };
    });
  }, []);

  const handleCreateNextWeek = useCallback(async () => {
    if (generateWeekMutation.isPending || !isSprintOpen) {
      return;
    }
    const nextWeekStart = findNextWeekStart(weeks, currentWeekStartDay, selectedWeekStart);
    setCreateWeekError(null);
    try {
      const response = await generateWeekMutation.mutateAsync({ from: nextWeekStart, to: nextWeekStart });
      const createdWeek = response.weeks.find(week => normaliseWeekStart(week.weekStart) === nextWeekStart);
      if (createdWeek) {
        setSelectedWeekId(createdWeek.id);
        fetchWeek(createdWeek.id);
      }
      loadWeeks();
      notify('success', 'Nový týden byl vytvořen.');
    } catch (error) {
      setCreateWeekError(error as ErrorResponse);
    }
  }, [
    generateWeekMutation,
    weeks,
    currentWeekStartDay,
    selectedWeekStart,
    fetchWeek,
    loadWeeks,
    notify,
    isSprintOpen,
  ]);

  const showCreateWeekCta =
    currentSprintId !== null &&
    weeks.length === 0 &&
    sprintTasks.length === 0 &&
    !weeksLoading &&
    !boardError;
  const plannerEmptyState = showCreateWeekCta ? (
    <div>
      <h3>Vytvoř první týden</h3>
      <p>Zatím nemáte žádné úkoly ani týdny. Začněte prvním týdenním plánem.</p>
      <button
        type="button"
        className="plannerBoard__ctaButton"
        onClick={handleCreateNextWeek}
        disabled={createWeekButtonDisabled}
        title={!isSprintOpen ? 'Sprint je uzavřený. Nejprve ho otevřete.' : undefined}
      >
        {createWeekPending ? 'Vytvářím…' : 'Vytvořit týden'}
      </button>
    </div>
  ) : null;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!isSprintOpen) {
        return;
      }
      const taskId = event.active?.data?.current?.taskId;
      if (typeof taskId !== 'number') {
        return;
      }
      const fromWeekId = (event.active?.data?.current?.weekId ?? null) as number | null;
      const over = event.over;
      if (!over) {
        return;
      }
      const overId = over.id;
      let toWeekId = (over.data?.current?.weekId ?? undefined) as number | null | undefined;
      if (typeof toWeekId === 'undefined') {
        if (overId === 'backlog-drop-zone') {
          toWeekId = null;
        } else if (typeof overId === 'string' && overId.startsWith('week-drop-')) {
          const parsed = Number.parseInt(overId.replace('week-drop-', ''), 10);
          if (!Number.isNaN(parsed)) {
            toWeekId = parsed;
          }
        }
      }
      if (typeof toWeekId === 'undefined') {
        return;
      }
      const targetWeekId = toWeekId ?? null;
      if (targetWeekId === fromWeekId) {
        return;
      }
      moveTaskMutation.mutate({ taskId, fromWeekId, toWeekId: targetWeekId });
    },
    [isSprintOpen, moveTaskMutation],
  );

  function renderCreateTaskButton(extraClassName = '', options?: { ariaLabel?: string }) {
    const ariaLabel = options?.ariaLabel;
    return (
      <button
        type="button"
        className={`projectWeeklyPlanner__createButton ${extraClassName}`.trim()}
        onClick={() => openCreateTaskModal(selectedWeekId)}
        disabled={createTaskDisabled}
        aria-label={ariaLabel}
        title={!isSprintOpen ? 'Sprint je uzavřený. Úkoly nelze měnit.' : undefined}
      >
        <span className="projectWeeklyPlanner__createButtonIcon" aria-hidden="true">
          +
        </span>
        <span>New task</span>
      </button>
    );
  }

  if (sprintLoading) {
    return (
      <section className="projectWeeklyPlanner" aria-labelledby="project-weekly-planner-title">
        <p className="projectWeeklyPlanner__status" role="status">
          Načítám sprint…
        </p>
      </section>
    );
  }

  if (sprintError) {
    return (
      <section className="projectWeeklyPlanner" aria-labelledby="project-weekly-planner-title">
        <div className="projectWeeklyPlanner__status projectWeeklyPlanner__status--error" role="alert">
          Aktuální sprint se nepodařilo načíst. {sprintError.error?.message ?? ''}
          <button type="button" className="projectWeeklyPlanner__settingsRetry" onClick={() => refetchSprint()}>
            Zkusit znovu
          </button>
        </div>
      </section>
    );
  }

  if (currentSprintId === null) {
    return (
      <section className="projectWeeklyPlanner" aria-labelledby="project-weekly-planner-title">
        <div className="projectWeeklyPlanner__emptyStateCard">
          <p className="projectWeeklyPlanner__eyebrow">Týdenní plánování</p>
          <h2 className="projectWeeklyPlanner__emptyStateTitle">Vytvořte první sprint</h2>
          <p className="projectWeeklyPlanner__emptyStateDescription">
            Sprint drží všechny týdenní plány pohromadě. Nejprve ho vytvořte, poté se zpřístupní plánování jednotlivých týdnů.
          </p>
        </div>
        <div className="projectWeeklyPlanner__sprintFormWrapper">
          <SprintCreateForm projectId={project.id} onSuccess={handleSprintCreated} />
        </div>
      </section>
    );
  }

  return (
    <section className="projectWeeklyPlanner" aria-labelledby="project-weekly-planner-title">
      <SprintHeader
        projectId={project.id}
        sprintId={sprintMetadata.id}
        initialName={sprintMetadata.name}
        initialDeadline={sprintMetadata.deadline}
        initialStatus={sprintMetadata.status}
        onShowToast={notify}
        onSprintClosed={handleSprintClosed}
      />
      <header className="projectWeeklyPlanner__header">
        <div className="projectWeeklyPlanner__headingGroup">
          <p className="projectWeeklyPlanner__eyebrow">Týdenní plánování</p>
          <div className="projectWeeklyPlanner__headingRow">
            <h2 id="project-weekly-planner-title" className="projectWeeklyPlanner__title">
              {headerRange}
            </h2>
            <span
              className={`projectWeeklyPlanner__statusBadge ${isClosed ? 'projectWeeklyPlanner__statusBadge--closed' : 'projectWeeklyPlanner__statusBadge--open'}`}
            >
              {isClosed ? 'Uzavřený týden' : 'Aktivní týden'}
            </span>
          </div>
          {weeksError && (
            <p className="projectWeeklyPlanner__status projectWeeklyPlanner__status--error">
              Týdny se nepodařilo načíst. {weeksError.error?.message ?? ''}
            </p>
          )}
        </div>
        <div className="projectWeeklyPlanner__controls">
          <label className="projectWeeklyPlanner__weekSelect">
            <span>Vybraný týden</span>
            <select value={selectedWeekId ?? ''} onChange={handleWeekChange} disabled={weeksLoading}>
              <option value="" disabled>
                Vyberte týden
              </option>
              {orderedWeeks.map(week => (
                <option key={week.id} value={week.id}>
                  {formatDateRange(week.weekStart, week.weekEnd)} {week.isClosed ? '• Uzavřený' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="projectWeeklyPlanner__secondaryActions">
            <button type="button" disabled title="Coming soon">
              Export PDF/CSV
            </button>
            <button type="button" disabled title="Coming soon">
              Notifikace
            </button>
          </div>
          <div className="projectWeeklyPlanner__createAction">
            {renderCreateTaskButton('projectWeeklyPlanner__createButton--inline')}
          </div>
          {closeButtonVisible && (
            <button
              type="button"
              className="projectWeeklyPlanner__closeButton"
              onClick={handleOpenCloseModal}
              disabled={closeButtonDisabled}
            >
              {closingWeek ? 'Uzavírám…' : 'Uzavřít týden'}
            </button>
          )}
        </div>
      </header>

      {createWeekError && (
        <p className="projectWeeklyPlanner__status projectWeeklyPlanner__status--error" role="alert">
          Nový týden se nepodařilo vytvořit. {createWeekError.error?.message ?? ''}
        </p>
      )}

      <WeeklySummaryPanel
        summary={summary}
        isLoading={summaryLoading}
        error={summaryError}
        onRetry={() => {
          if (selectedWeekId !== null) {
            fetchWeek(selectedWeekId);
          }
        }}
      />

      <div className="projectWeeklyPlanner__tasksHeader">
        <h3 className="projectWeeklyPlanner__tasksTitle">Plán úkolů</h3>
        <div className="projectWeeklyPlanner__tasksHeaderAction">{renderCreateTaskButton()}</div>
      </div>

      <PlannerBoard
        sensors={sensors}
        onDragEnd={handleDragEnd}
        backlogColumn={
          <BacklogTaskColumn
            projectId={project.id}
            sprintId={currentSprintId}
            tasks={backlogColumnTasks}
            isLoading={sprintTasksLoading}
            error={sprintTasksErrorTyped}
            onRetry={handleBacklogRetry}
            onCreateTask={currentSprintId === null || !isSprintOpen ? undefined : handleBacklogTaskSubmit}
            isInteractionDisabled={!isSprintOpen}
          />
        }
        weeksColumn={
          <WeeklyTaskList
            weeks={orderedWeeks}
            weekTasks={sprintWeekTasks}
            weekStartDay={currentWeekStartDay}
            carriedAudit={carriedAudit}
            isLoading={weeksLoading}
            error={boardError}
            errorLabel={boardErrorLabel}
            onRetry={handleWeeksBoardRetry}
            onEditTask={handleEditTask}
            mutationError={taskMutationError}
            onDismissMutationError={() => setTaskMutationError(null)}
            selectedWeekId={selectedWeekId}
            onSelectWeek={setSelectedWeekId}
            onCreateWeek={currentSprintId !== null ? handleCreateNextWeek : undefined}
            canCreateWeek={currentSprintId !== null}
            isCreateWeekLoading={createWeekPending}
            isInteractionDisabled={!isSprintOpen}
          />
        }
        emptyState={plannerEmptyState}
      />

      {renderCreateTaskButton('projectWeeklyPlanner__floatingActionButton', { ariaLabel: 'New task' })}

      <WeeklyTaskFormModal
        isOpen={isCreateModalOpen}
        mode={taskFormMode}
        projectId={project.id}
        weekId={selectedWeekIdForForm}
        week={formWeek}
        initialTask={taskFormInitial ?? undefined}
        onSubmit={handleTaskFormSubmit}
        onCancel={closeCreateTaskModal}
        weekOptions={taskFormMode === 'edit' ? weekSelectOptions : undefined}
        selectedWeekId={selectedWeekIdForForm}
        onSelectWeek={setSelectedWeekIdForForm}
      />

      <Modal
        isOpen={closeModalOpen}
        onClose={() => {
          if (!closingWeek) {
            setCloseModalOpen(false);
          }
        }}
        title="Uzavřít týden"
        footer={closeModalFooter}
      >
        <div className="projectWeeklyPlanner__modalBody">
          <p>
            Opravdu chcete uzavřít týden <strong>{headerRange}</strong>? Všechny navázané issue budou označené jako uzavřené a
            termíny se přesunou na konec týdne.
          </p>
          {closeError && (
            <p className="projectWeeklyPlanner__modalError" role="alert">
              Uzavření se nezdařilo. {closeError.error?.message ?? ''}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={carryOverModalOpen}
        onClose={() => {
          if (!carryOverSubmitting) {
            setCarryOverModalOpen(false);
            setCarryOverContext(null);
            setCarryOverError(null);
          }
        }}
        title="Přenést nehotové úkoly"
        footer={carryOverFooter}
        bodyClassName="projectWeeklyPlanner__modalScrollableBody"
      >
        <div className="projectWeeklyPlanner__modalBody">
          {carryOverContext && (
            <p>
              Vyberte úkoly k přenosu do týdne začínajícího <strong>{formatDate(carryOverContext.targetWeekStart)}</strong>.
            </p>
          )}
          {carryOverTasks.length === 0 ? (
            <p>Všechny úkoly z uplynulého týdne jsou hotové. Není potřeba nic přenášet.</p>
          ) : (
            <ul className="projectWeeklyPlanner__carryOverList">
              {carryOverTasks.map(task => (
                <li key={task.id}>
                  <label className="projectWeeklyPlanner__carryOverItem">
                    <input
                      type="checkbox"
                      checked={carryOverSelection.includes(task.id)}
                      onChange={() => toggleCarryOverSelection(task.id)}
                      disabled={carryOverSubmitting}
                    />
                    <span>
                      <strong>{task.issueTitle ?? task.note ?? 'Bez názvu'}</strong>
                      <small>
                        {getDayLabel(task.dayOfWeek, currentWeekStartDay)} • {task.internName ?? 'Nepřiřazeno'} • {formatPlannedHours(task.plannedHours)}
                      </small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {carryOverError && (
            <p className="projectWeeklyPlanner__modalError" role="alert">
              Přenos úkolů se nezdařil. {carryOverError.error?.message ?? ''}
            </p>
          )}
        </div>
      </Modal>
    </section>
  );
}
