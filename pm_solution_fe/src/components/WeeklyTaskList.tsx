import { useMemo } from 'react';
import { useQuery, type QueryClient, type QueryKey } from '@tanstack/react-query';
import './WeeklyTaskList.css';
import { getProjectWeeklyPlannerWeek, type ErrorResponse, type WeeklyPlannerTask } from '../api';
import { formatDate, formatPlannedHours, getDayLabel } from './weeklyPlannerUtils';

export type WeeklyTasksQueryData = {
  weekTasks: WeeklyPlannerTask[];
  unscheduledTasks: WeeklyPlannerTask[];
  statusCounts: Record<'OPENED' | 'CLOSED', number>;
};

function normaliseStatus(status: WeeklyPlannerTask['status']): 'OPENED' | 'CLOSED' {
  return status === 'CLOSED' ? 'CLOSED' : 'OPENED';
}

function normaliseWeekAssignment(task: WeeklyPlannerTask, fallbackWeekId: number | null): WeeklyPlannerTask {
  const hasValidWeek = typeof task.weekId === 'number' && Number.isFinite(task.weekId);
  if (hasValidWeek || task.weekId === null) {
    return task;
  }
  return { ...task, weekId: fallbackWeekId };
}

function createWeeklyTasksQueryData(
  tasks: WeeklyPlannerTask[],
  options?: { defaultWeekId?: number | null },
): WeeklyTasksQueryData {
  const counts: WeeklyTasksQueryData['statusCounts'] = { OPENED: 0, CLOSED: 0 };
  const weekTasks: WeeklyPlannerTask[] = [];
  const unscheduledTasks: WeeklyPlannerTask[] = [];
  const fallbackWeekId = options?.defaultWeekId ?? null;

  for (const task of tasks) {
    const mapped = normaliseWeekAssignment(task, fallbackWeekId);
    if (mapped.weekId === null) {
      unscheduledTasks.push(mapped);
      continue;
    }
    weekTasks.push(mapped);
    counts[normaliseStatus(mapped.status)] += 1;
  }

  return { weekTasks, unscheduledTasks, statusCounts: counts };
}

function buildWeeklyTasksQueryData(
  weekTasks: WeeklyPlannerTask[],
  unscheduledTasks: WeeklyPlannerTask[],
): WeeklyTasksQueryData {
  const counts: WeeklyTasksQueryData['statusCounts'] = { OPENED: 0, CLOSED: 0 };
  for (const task of weekTasks) {
    counts[normaliseStatus(task.status)] += 1;
  }
  return { weekTasks, unscheduledTasks, statusCounts: counts };
}

function dedupeTasks(tasks: WeeklyPlannerTask[]): WeeklyPlannerTask[] {
  const seen = new Set<number>();
  const result: WeeklyPlannerTask[] = [];
  for (const task of tasks) {
    if (!seen.has(task.id)) {
      seen.add(task.id);
      result.push(task);
    }
  }
  return result;
}

export function getWeeklyTasksQueryKey(projectId: number, weekId: number | null): QueryKey {
  return ['weekly-tasks', projectId, weekId];
}

export function setWeeklyTasksQueryData(
  queryClient: QueryClient,
  projectId: number,
  weekId: number,
  tasks: WeeklyPlannerTask[],
): WeeklyTasksQueryData {
  const data = createWeeklyTasksQueryData(tasks, { defaultWeekId: weekId });
  queryClient.setQueryData<WeeklyTasksQueryData>(getWeeklyTasksQueryKey(projectId, weekId), data);
  return data;
}

export function prependWeeklyTask(
  queryClient: QueryClient,
  projectId: number,
  weekId: number,
  task: WeeklyPlannerTask,
): WeeklyTasksQueryData | undefined {
  const key = getWeeklyTasksQueryKey(projectId, weekId);
  const previous = queryClient.getQueryData<WeeklyTasksQueryData>(key);
  const currentTasks = previous?.weekTasks ?? [];
  const unscheduledTasks = previous?.unscheduledTasks ?? [];
  const nextTask = normaliseWeekAssignment(task, weekId);
  const nextTasks = dedupeTasks([nextTask, ...currentTasks]);
  const next = buildWeeklyTasksQueryData(nextTasks, unscheduledTasks);
  queryClient.setQueryData(key, next);
  return previous;
}

export function replaceWeeklyTask(
  queryClient: QueryClient,
  projectId: number,
  weekId: number,
  task: WeeklyPlannerTask,
  matchId?: number,
): WeeklyTasksQueryData | undefined {
  const key = getWeeklyTasksQueryKey(projectId, weekId);
  const previous = queryClient.getQueryData<WeeklyTasksQueryData>(key);
  const currentTasks = previous?.weekTasks ?? [];
  const unscheduledTasks = previous?.unscheduledTasks ?? [];
  const targetId = typeof matchId === 'number' ? matchId : task.id;
  let replaced = false;
  const mapped = currentTasks.map((existing: WeeklyPlannerTask) => {
    if (existing.id === targetId) {
      replaced = true;
      return normaliseWeekAssignment(task, weekId);
    }
    return existing;
  });
  const fallbackTask = normaliseWeekAssignment(task, weekId);
  const nextTasks = replaced ? dedupeTasks(mapped) : dedupeTasks([fallbackTask, ...mapped]);
  const next = buildWeeklyTasksQueryData(nextTasks, unscheduledTasks);
  queryClient.setQueryData(key, next);
  return previous;
}

export type WeeklyTaskListProps = {
  projectId: number;
  weekId: number | null;
  weekStartDay: number;
  carriedAudit: Record<number, string>;
  initialTasks?: WeeklyPlannerTask[];
  isClosed: boolean;
  isWeekLoading: boolean;
  weekError: ErrorResponse | null;
  onRetryWeek: () => void;
  onEditTask?: (task: WeeklyPlannerTask) => void;
  mutationError: ErrorResponse | null;
  onDismissMutationError?: () => void;
};

export default function WeeklyTaskList({
  projectId,
  weekId,
  weekStartDay,
  carriedAudit,
  initialTasks,
  isClosed,
  isWeekLoading,
  weekError,
  onRetryWeek,
  onEditTask,
  mutationError,
  onDismissMutationError,
}: WeeklyTaskListProps) {
  const queryKey = useMemo(() => getWeeklyTasksQueryKey(projectId, weekId), [projectId, weekId]);
  const initialData = useMemo(() => {
    if (!initialTasks || weekId === null) return undefined;
    return createWeeklyTasksQueryData(initialTasks, { defaultWeekId: weekId });
  }, [initialTasks, weekId]);

  const {
    data,
    error,
    isPending,
    isFetching,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      if (weekId === null) {
        return createWeeklyTasksQueryData([]);
      }
      const detail = await getProjectWeeklyPlannerWeek(projectId, weekId);
      return createWeeklyTasksQueryData(detail.week.tasks, { defaultWeekId: weekId });
    },
    enabled: weekId !== null,
    initialData,
  });

  const tasks = data?.weekTasks ?? [];
  const statusCounts = data?.statusCounts ?? { OPENED: 0, CLOSED: 0 };
  const combinedError = weekError ?? (error as ErrorResponse | null);
  const loading = isWeekLoading || isPending;
  const showEmptyState = !loading && !combinedError && tasks.length === 0;

  function handleRetry() {
    onRetryWeek();
    if (weekId !== null) {
      refetch();
    }
  }

  if (weekId === null) {
    return (
      <div className="projectWeeklyPlanner__empty" role="status">
        <p>Vyberte týden pro zobrazení úkolů.</p>
      </div>
    );
  }

  return (
    <div aria-busy={loading || isFetching}>
      {mutationError && (
        <div className="projectWeeklyPlanner__status projectWeeklyPlanner__status--error weeklyTaskList__statusMessage" role="alert">
          Úkol se nepodařilo uložit. {mutationError.error.message}
          {onDismissMutationError && (
            <button type="button" className="weeklyTaskList__dismissButton" onClick={onDismissMutationError}>
              Skrýt
            </button>
          )}
        </div>
      )}

      {combinedError && !loading && (
        <div className="projectWeeklyPlanner__status projectWeeklyPlanner__status--error" role="alert">
          Týden se nepodařilo načíst. {combinedError.error.message}{' '}
          <button type="button" className="projectWeeklyPlanner__settingsRetry" onClick={handleRetry}>
            Zkusit znovu
          </button>
        </div>
      )}

      {loading && (
        <p className="projectWeeklyPlanner__status" role="status">
          Načítám detail týdne…
        </p>
      )}

      {!loading && !combinedError && (
        <div className="weeklyTaskList__summary" role="status">
          <span className="weeklyTaskList__summaryItem">
            <strong>{statusCounts.OPENED}</strong> otevřených
          </span>
          <span className="weeklyTaskList__summaryItem">
            <strong>{statusCounts.CLOSED}</strong> uzavřených
          </span>
          <span className="weeklyTaskList__summaryItem">
            <strong>{tasks.length}</strong> celkem
          </span>
        </div>
      )}

      {showEmptyState && (
        <div className="projectWeeklyPlanner__empty" role="status">
          <p>V tomto týdnu zatím nejsou naplánovány žádné úkoly. Přidejte první, abyste mohli sdílet priority.</p>
        </div>
      )}

      {!showEmptyState && !loading && !combinedError && (
        <div className="projectWeeklyPlanner__tasks" role="list">
          {tasks.map(task => {
            const carriedFrom = task.carriedOverFromWeekStart ?? carriedAudit[task.id] ?? null;
            const headline = task.issueTitle ?? task.note ?? 'Bez názvu';
            return (
              <article key={task.id} className="projectWeeklyPlanner__taskCard" role="listitem">
                <div className="projectWeeklyPlanner__taskHeader">
                  <span className="projectWeeklyPlanner__taskDay">{getDayLabel(task.dayOfWeek, weekStartDay)}</span>
                  <div className="weeklyTaskList__taskHeaderActions">
                    {carriedFrom && (
                      <span className="projectWeeklyPlanner__taskBadge">Carried over from week {formatDate(carriedFrom)}</span>
                    )}
                    {onEditTask && (
                      <button
                        type="button"
                        className="weeklyTaskList__editButton"
                        onClick={() => onEditTask(task)}
                        disabled={isClosed}
                      >
                        Upravit
                      </button>
                    )}
                  </div>
                </div>
                <h3 className="projectWeeklyPlanner__taskTitle">{headline}</h3>
                <p className="projectWeeklyPlanner__taskMeta">
                  <span>{task.internName ?? 'Nepřiřazeno'}</span>
                  <span aria-hidden="true">•</span>
                  <span>{formatPlannedHours(task.plannedHours)}</span>
                </p>
                {task.note && task.note !== task.issueTitle && (
                  <p className="projectWeeklyPlanner__taskNote">{task.note}</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
