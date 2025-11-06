import { type ChangeEvent, useMemo, useState } from 'react';
import type { WeeklyTask, WeeklyTaskStatus } from '../api';
import {
  formatAssigneeLabel,
  formatIssueLabel,
  getTaskStatusLabel,
  isTaskCompletedStatus,
} from './WeeklyTaskTypes';
import type { WeeklyTaskStatusOption } from './WeeklyTaskTypes';
import './WeeklyTaskCard.css';

type WeeklyTaskCardProps = {
  task: WeeklyTask;
  statusOptions: WeeklyTaskStatusOption[];
  onEdit: (task: WeeklyTask) => void;
  onChangeStatus: (task: WeeklyTask, status: WeeklyTaskStatus) => void;
  onMove: (task: WeeklyTask) => void;
  isStatusUpdating?: boolean;
};

const dateFormatter = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium' });

function formatDeadline(deadline: string | null): { text: string; tooltip: string | null } {
  if (!deadline) {
    return { text: 'Bez termínu', tooltip: null };
  }
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) {
    return { text: deadline, tooltip: null };
  }
  return {
    text: dateFormatter.format(parsed),
    tooltip: parsed.toISOString().slice(0, 10),
  };
}

function isTaskOverdue(task: WeeklyTask): boolean {
  if (!task.deadline || isTaskCompletedStatus(task.status)) {
    return false;
  }
  const deadline = new Date(task.deadline);
  if (Number.isNaN(deadline.getTime())) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);
  return deadline.getTime() < today.getTime();
}

export default function WeeklyTaskCard({
  task,
  statusOptions,
  onEdit,
  onChangeStatus,
  onMove,
  isStatusUpdating = false,
}: WeeklyTaskCardProps) {
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const overdue = useMemo(() => isTaskOverdue(task), [task]);
  const statusLabel = useMemo(() => getTaskStatusLabel(task.status, statusOptions), [task.status, statusOptions]);
  const deadlineInfo = useMemo(() => formatDeadline(task.deadline), [task.deadline]);

  function handleStatusSelect(event: ChangeEvent<HTMLSelectElement>) {
    const nextStatus = event.target.value as WeeklyTaskStatus;
    setStatusPickerOpen(false);
    if (nextStatus && nextStatus !== task.status) {
      onChangeStatus(task, nextStatus);
    }
  }

  return (
    <article className={`weeklyTaskCard${overdue ? ' weeklyTaskCard--overdue' : ''}`}>
      <header className="weeklyTaskCard__header">
        <div className="weeklyTaskCard__titleGroup">
          <h3 className="weeklyTaskCard__title">{task.name}</h3>
          <span className="weeklyTaskCard__status" aria-label={`Status: ${statusLabel}`}>
            {statusLabel}
          </span>
          <div className="weeklyTaskCard__badges">
            {overdue && (
              <span
                className="weeklyTaskCard__badge weeklyTaskCard__badge--overdue"
                title={deadlineInfo.tooltip ?? undefined}
              >
                Po termínu
              </span>
            )}
            {task.carriedOverFrom && (
              <span className="weeklyTaskCard__badge weeklyTaskCard__badge--carried">
                Přeneseno z {task.carriedOverFrom}
              </span>
            )}
          </div>
        </div>
        <div className="weeklyTaskCard__statusControls">
          {statusPickerOpen ? (
            <select
              className="weeklyTaskCard__statusSelect"
              value={task.status}
              onChange={handleStatusSelect}
              disabled={isStatusUpdating}
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              className="weeklyTaskCard__statusButton"
              onClick={() => setStatusPickerOpen(true)}
              disabled={isStatusUpdating}
            >
              Změnit status
            </button>
          )}
        </div>
      </header>
      <div className="weeklyTaskCard__body">
        {task.description ? (
          <p className="weeklyTaskCard__description">{task.description}</p>
        ) : (
          <p className="weeklyTaskCard__description weeklyTaskCard__description--muted">Bez popisu</p>
        )}
        <dl className="weeklyTaskCard__meta">
          <div className="weeklyTaskCard__metaRow">
            <dt>Deadline</dt>
            <dd title={deadlineInfo.tooltip ?? undefined}>{deadlineInfo.text}</dd>
          </div>
          <div className="weeklyTaskCard__metaRow">
            <dt>Přiřazeno</dt>
            <dd>{formatAssigneeLabel(task.assignee)}</dd>
          </div>
          <div className="weeklyTaskCard__metaRow">
            <dt>Issue</dt>
            <dd>{formatIssueLabel(task.issue)}</dd>
          </div>
        </dl>
      </div>
      <footer className="weeklyTaskCard__actions">
        <button type="button" className="weeklyTaskCard__action" onClick={() => onEdit(task)}>
          Upravit
        </button>
        <button
          type="button"
          className="weeklyTaskCard__action"
          onClick={() => onMove(task)}
          disabled={isStatusUpdating}
        >
          Přesunout…
        </button>
      </footer>
    </article>
  );
}
