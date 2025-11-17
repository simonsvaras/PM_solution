import { type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { WeeklyPlannerTask } from '../api';

export type BacklogTasksQueryData = WeeklyPlannerTask[];

export function getBacklogTasksQueryKey(projectId: number, sprintId: number | null): QueryKey {
  return ['planner', projectId, sprintId, 'backlog'];
}

function normaliseBacklogTasks(tasks: WeeklyPlannerTask[]): WeeklyPlannerTask[] {
  const seen = new Set<number>();
  const normalised: WeeklyPlannerTask[] = [];
  for (const task of tasks) {
    if (seen.has(task.id)) {
      continue;
    }
    seen.add(task.id);
    if (task.weekId !== null || !task.isBacklog) {
      normalised.push({ ...task, weekId: null, isBacklog: true });
      continue;
    }
    normalised.push(task);
  }
  return normalised;
}

export function setBacklogTasksQueryData(
  queryClient: QueryClient,
  projectId: number,
  sprintId: number | null,
  tasks: WeeklyPlannerTask[],
): WeeklyPlannerTask[] {
  const next = normaliseBacklogTasks(tasks);
  queryClient.setQueryData<BacklogTasksQueryData>(getBacklogTasksQueryKey(projectId, sprintId), next);
  return next;
}
