import { useMemo, useState } from 'react';
import type { WeeklyTask, WeeklyTaskStatus } from '../api';
import WeeklyTaskCard from './WeeklyTaskCard';
import {
  getTaskStatusLabel,
  mergeStatusOptions,
  normalizeTaskStatus,
} from './WeeklyTaskTypes';
import type { WeeklyTaskStatusOption } from './WeeklyTaskTypes';
import './WeeklyTaskList.css';

type WeeklyTaskListProps = {
  tasks: WeeklyTask[];
  statusOptions: WeeklyTaskStatusOption[];
  onCreate: () => void;
  onEdit: (task: WeeklyTask) => void;
  onChangeStatus: (task: WeeklyTask, status: WeeklyTaskStatus) => void;
  onMove: (task: WeeklyTask) => void;
  isLoading?: boolean;
  statusUpdatingTaskId?: number | null;
  createDisabled?: boolean;
};

const ALL_FILTER = '__all__';

type StatusFilter = {
  value: string;
  label: string;
  count: number;
};

export default function WeeklyTaskList({
  tasks,
  statusOptions,
  onCreate,
  onEdit,
  onChangeStatus,
  onMove,
  isLoading = false,
  statusUpdatingTaskId = null,
  createDisabled = false,
}: WeeklyTaskListProps) {
  const [activeFilter, setActiveFilter] = useState<string>(ALL_FILTER);

  const effectiveStatusOptions = useMemo(() => mergeStatusOptions(statusOptions, tasks), [statusOptions, tasks]);

  const filters = useMemo<StatusFilter[]>(() => {
    const counts = new Map<string, number>();
    tasks.forEach(task => {
      const key = normalizeTaskStatus(task.status);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const items: StatusFilter[] = Array.from(counts.entries()).map(([value, count]) => ({
      value,
      count,
      label: getTaskStatusLabel(value, effectiveStatusOptions),
    }));
    items.sort((a, b) => a.label.localeCompare(b.label, 'cs'));
    return [{ value: ALL_FILTER, count: tasks.length, label: `Vše (${tasks.length})` }, ...items];
  }, [effectiveStatusOptions, tasks]);

  const filteredTasks = useMemo(() => {
    if (activeFilter === ALL_FILTER) {
      return tasks;
    }
    return tasks.filter(task => normalizeTaskStatus(task.status) === activeFilter);
  }, [activeFilter, tasks]);

  const emptyStateMessage = activeFilter === ALL_FILTER ? 'Zatím zde nejsou žádné úkoly.' : 'Žádné úkoly s vybraným statusem.';

  return (
    <div className="weeklyTaskList">
      <div className="weeklyTaskList__toolbar">
        <div className="weeklyTaskList__filters" role="tablist" aria-label="Filtr úkolů podle statusu">
          {filters.map(filter => (
            <button
              key={filter.value || 'none'}
              type="button"
              role="tab"
              className={`weeklyTaskList__filterButton${activeFilter === filter.value ? ' weeklyTaskList__filterButton--active' : ''}`}
              onClick={() => setActiveFilter(filter.value)}
              aria-selected={activeFilter === filter.value}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="weeklyTaskList__create"
          onClick={onCreate}
          disabled={createDisabled}
        >
          Přidat úkol
        </button>
      </div>
      {isLoading ? (
        <div className="weeklyTaskList__placeholder" role="status">
          <span>Načítám úkoly…</span>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="weeklyTaskList__placeholder" role="status">
          <span>{emptyStateMessage}</span>
        </div>
      ) : (
        <div className="weeklyTaskList__grid">
          {filteredTasks.map(task => (
            <WeeklyTaskCard
              key={task.id}
              task={task}
              statusOptions={effectiveStatusOptions}
              onEdit={onEdit}
              onChangeStatus={onChangeStatus}
              onMove={onMove}
              isStatusUpdating={statusUpdatingTaskId === task.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
