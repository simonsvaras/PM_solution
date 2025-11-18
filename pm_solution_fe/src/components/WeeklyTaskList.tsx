import { useDroppable, useDraggable } from '@dnd-kit/core';
import { type QueryClient, type QueryKey } from '@tanstack/react-query';
import './WeeklyTaskList.css';
import type { ErrorResponse, WeeklyPlannerTask, WeeklyPlannerWeek } from '../api';
import { formatDate, formatPlannedHours } from './weeklyPlannerUtils';

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
  if (hasValidWeek) {
    return task.isBacklog ? { ...task, isBacklog: false } : task;
  }
  if (task.weekId === null) {
    return task.isBacklog ? task : { ...task, isBacklog: true };
  }
  const resolvedWeekId = fallbackWeekId;
  const isBacklog = resolvedWeekId === null;
  return { ...task, weekId: resolvedWeekId, isBacklog };
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

export function getWeeklyTasksQueryKey(projectId: number, sprintId: number | null, weekId: number | null): QueryKey {
  return ['planner', projectId, sprintId, 'week', weekId];
}

export function setWeeklyTasksQueryData(
  queryClient: QueryClient,
  projectId: number,
  sprintId: number | null,
  weekId: number,
  tasks: WeeklyPlannerTask[],
): WeeklyTasksQueryData {
  const data = createWeeklyTasksQueryData(tasks, { defaultWeekId: weekId });
  queryClient.setQueryData<WeeklyTasksQueryData>(getWeeklyTasksQueryKey(projectId, sprintId, weekId), data);
  return data;
}

export function prependWeeklyTask(
  queryClient: QueryClient,
  projectId: number,
  sprintId: number | null,
  weekId: number,
  task: WeeklyPlannerTask,
): WeeklyTasksQueryData | undefined {
  const key = getWeeklyTasksQueryKey(projectId, sprintId, weekId);
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
  sprintId: number | null,
  weekId: number,
  task: WeeklyPlannerTask,
  matchId?: number,
): WeeklyTasksQueryData | undefined {
  const key = getWeeklyTasksQueryKey(projectId, sprintId, weekId);
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

export function removeWeeklyTask(
  queryClient: QueryClient,
  projectId: number,
  sprintId: number | null,
  weekId: number,
  taskId: number,
): WeeklyTasksQueryData | undefined {
  const key = getWeeklyTasksQueryKey(projectId, sprintId, weekId);
  const previous = queryClient.getQueryData<WeeklyTasksQueryData>(key);
  if (!previous) {
    return undefined;
  }
  const filtered = previous.weekTasks.filter(task => task.id !== taskId);
  const next = buildWeeklyTasksQueryData(filtered, previous.unscheduledTasks);
  queryClient.setQueryData(key, next);
  return previous;
}

type WeekLaneProps = {
  week: WeeklyPlannerWeek;
  tasks: WeeklyPlannerTask[];
  carriedAudit: Record<number, string>;
  onEditTask?: (task: WeeklyPlannerTask) => void;
  isSelected: boolean;
  onSelectWeek?: (weekId: number) => void;
  isInteractionDisabled?: boolean;
};

function WeekLane({ week, tasks, carriedAudit, onEditTask, isSelected, onSelectWeek, isInteractionDisabled }: WeekLaneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `week-drop-${week.id}`,
    data: { weekId: week.id },
    disabled: isInteractionDisabled,
  });
  const openTasks = tasks.filter(task => task.status !== 'CLOSED').length;
  const closedTasks = tasks.length - openTasks;
  const headline = `${formatDate(week.weekStart)} – ${formatDate(week.weekEnd)}`;
  const laneClassName = ['weekLane'];
  if (isSelected) {
    laneClassName.push('weekLane--active');
  }
  if (isOver) {
    laneClassName.push('weekLane--dropActive');
  }
  if (isInteractionDisabled) {
    laneClassName.push('weekLane--readonly');
  }

  return (
    <section
      ref={setNodeRef}
      className={laneClassName.join(' ')}
      role="listitem"
      aria-label={`Týden od ${formatDate(week.weekStart)}`}
    >
      <header className="weekLane__header">
        <div>
          <p className="weekLane__eyebrow">{week.isClosed ? 'Uzavřený týden' : 'Plánovaný týden'}</p>
          <button type="button" className="weekLane__titleButton" onClick={() => onSelectWeek?.(week.id)}>
            <span className="weekLane__title">{headline}</span>
          </button>
        </div>
        <div className="weekLane__stats">
          <span>{openTasks} otevřených</span>
          <span aria-hidden="true">•</span>
          <span>{closedTasks} uzavřených</span>
        </div>
      </header>
      <ul className="weekLane__tasks">
        {tasks.length === 0 && <li className="weekLane__empty">Přetáhněte sem první úkol</li>}
        {tasks.map(task => (
          <WeekTaskCard
            key={task.id}
            weekId={week.id}
            task={task}
            carriedAudit={carriedAudit}
            onEditTask={onEditTask}
            isClosed={week.isClosed}
            isInteractionDisabled={isInteractionDisabled}
          />
        ))}
      </ul>
    </section>
  );
}

type WeekTaskCardProps = {
  weekId: number;
  task: WeeklyPlannerTask;
  carriedAudit: Record<number, string>;
  onEditTask?: (task: WeeklyPlannerTask) => void;
  isClosed: boolean;
  isInteractionDisabled?: boolean;
};

function WeekTaskCard({ weekId, task, carriedAudit, onEditTask, isClosed, isInteractionDisabled }: WeekTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `week-task-${task.id}`,
    data: { taskId: task.id, weekId },
    disabled: isClosed || isInteractionDisabled,
  });
  const carriedFrom = task.carriedOverFromWeekStart ?? carriedAudit[task.id] ?? null;
  const headline = task.issueTitle ?? task.note ?? 'Bez názvu';
  const style = transform
    ? { transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` }
    : undefined;
  const cardClassName = ['weekLane__taskCard'];
  if (isDragging) {
    cardClassName.push('weekLane__taskCard--dragging');
  }
  if (isInteractionDisabled || isClosed) {
    cardClassName.push('weekLane__taskCard--disabled');
  }

  return (
    <li
      ref={setNodeRef}
      className={cardClassName.join(' ')}
      style={style}
      {...listeners}
      {...attributes}
    >
      <div className="weekLane__taskHeader">
        <div className="weekLane__taskActions">
          {carriedFrom && <span className="weekLane__badge">Carried over {formatDate(carriedFrom)}</span>}
          {onEditTask && (
            <button
              type="button"
              className="weeklyTaskList__editButton"
              onClick={() => onEditTask(task)}
              disabled={isClosed || Boolean(isInteractionDisabled)}
            >
              Upravit
            </button>
          )}
        </div>
      </div>
      <h4 className="weekLane__taskTitle">{headline}</h4>
      <p className="weekLane__taskMeta">
        <span>{task.internName ?? 'Nepřiřazeno'}</span>
        <span aria-hidden="true">•</span>
        <span>{formatPlannedHours(task.plannedHours)}</span>
      </p>
      {task.note && task.note !== task.issueTitle && <p className="weekLane__taskNote">{task.note}</p>}
    </li>
  );
}

export type WeeklyTaskListProps = {
  weeks: WeeklyPlannerWeek[];
  weekTasks: Map<number, WeeklyPlannerTask[]>;
  carriedAudit: Record<number, string>;
  isLoading: boolean;
  error: ErrorResponse | null;
  errorLabel?: string;
  onRetry?: () => void;
  onEditTask?: (task: WeeklyPlannerTask) => void;
  mutationError: ErrorResponse | null;
  onDismissMutationError?: () => void;
  selectedWeekId: number | null;
  onSelectWeek?: (weekId: number) => void;
  onCreateWeek?: () => void;
  canCreateWeek?: boolean;
  isCreateWeekLoading?: boolean;
  isInteractionDisabled?: boolean;
};

function AddWeekLane({ disabled, onClick }: { disabled?: boolean; onClick?: () => void }) {
  if (!onClick) {
    return null;
  }
  return (
    <button type="button" className="weekLane__addButton" onClick={onClick} disabled={disabled}>
      + Týden
    </button>
  );
}

export default function WeeklyTaskList({
  weeks,
  weekTasks,
  carriedAudit,
  isLoading,
  error,
  errorLabel,
  onRetry,
  onEditTask,
  mutationError,
  onDismissMutationError,
  selectedWeekId,
  onSelectWeek,
  onCreateWeek,
  canCreateWeek = false,
  isCreateWeekLoading = false,
  isInteractionDisabled = false,
}: WeeklyTaskListProps) {
  const hasWeeks = weeks.length > 0;
  return (
    <div className="weeklyTaskList" aria-live="polite">
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
      {error && !isLoading && (
        <div className="projectWeeklyPlanner__status projectWeeklyPlanner__status--error" role="alert">
          {errorLabel ?? 'Týdny se nepodařilo načíst.'} {error.error.message}
          {onRetry && (
            <button type="button" className="projectWeeklyPlanner__settingsRetry" onClick={onRetry}>
              Zkusit znovu
            </button>
          )}
        </div>
      )}
      {isLoading && <p className="projectWeeklyPlanner__status">Načítám přehled týdnů…</p>}
      {!isLoading && isInteractionDisabled && (
        <p className="projectWeeklyPlanner__status weeklyTaskList__statusReadonly" role="status">
          Sprint je uzavřený. Úkoly můžete jen prohlížet.
        </p>
      )}
      {!isLoading && !hasWeeks && !error && (
        <div className="projectWeeklyPlanner__empty" role="status">
          <p>Zatím nemáte vytvořený žádný týden. Přidejte první a začněte plánovat.</p>
        </div>
      )}
      {hasWeeks && (
        <div className="weeklyTaskList__lanesWrapper">
          <div className="weeklyTaskList__lanes" role="list" aria-label="Seznam týdnů">
            {weeks.map(week => (
              <WeekLane
                key={week.id}
                week={week}
                tasks={weekTasks.get(week.id) ?? []}
                carriedAudit={carriedAudit}
                onEditTask={onEditTask}
                isSelected={selectedWeekId === week.id}
                onSelectWeek={onSelectWeek}
                isInteractionDisabled={isInteractionDisabled}
              />
            ))}
            {canCreateWeek && (
              <AddWeekLane
                disabled={isCreateWeekLoading || isLoading || isInteractionDisabled}
                onClick={onCreateWeek}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
