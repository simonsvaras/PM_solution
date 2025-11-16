import type { QueryKey } from '@tanstack/react-query';

export function getCurrentSprintQueryKey(projectId: number): QueryKey {
  return ['projects', projectId, 'sprints', 'current'];
}

export function getProjectWeeksQueryKey(projectId: number): QueryKey {
  return ['projects', projectId, 'weekly-planner', 'weeks'];
}
