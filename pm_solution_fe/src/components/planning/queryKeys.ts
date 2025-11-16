import type { QueryKey } from '@tanstack/react-query';

export function getCurrentSprintQueryKey(projectId: number): QueryKey {
  return ['projects', projectId, 'sprints', 'current'];
}

export function getProjectWeeksQueryKey(projectId: number, sprintId: number | null): QueryKey {
  return ['planner', projectId, sprintId];
}
