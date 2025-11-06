import { useEffect, useMemo, useState } from 'react';
import type { WeeklyTask } from '../api';
import Modal from './Modal';
import './WeeklyTaskFormModal.css';
import type {
  WeeklyTaskAssigneeOption,
  WeeklyTaskIssueOption,
  WeeklyTaskStatusOption,
} from './WeeklyTaskTypes';
import { getTaskStatusLabel } from './WeeklyTaskTypes';

export type WeeklyTaskFormDraft = {
  name: string;
  description: string;
  status: string;
  deadline: string;
  issueId: number | null;
  assigneeId: number | null;
  carryOver: boolean;
};

export type WeeklyTaskFormErrors = Partial<Record<keyof WeeklyTaskFormDraft | 'general', string>>;

type WeeklyTaskFormModalProps = {
  isOpen: boolean;
  mode: 'create' | 'edit';
  defaultDeadline?: string | null;
  task?: WeeklyTask | null;
  statusOptions: WeeklyTaskStatusOption[];
  issueOptions: WeeklyTaskIssueOption[];
  assigneeOptions: WeeklyTaskAssigneeOption[];
  isSubmitting?: boolean;
  errors?: WeeklyTaskFormErrors;
  onClose: () => void;
  onSubmit: (draft: WeeklyTaskFormDraft) => void;
};

function toDraft(
  task: WeeklyTask | null | undefined,
  defaultDeadline: string | null | undefined,
  statusOptions: WeeklyTaskStatusOption[],
): WeeklyTaskFormDraft {
  const fallbackStatus = statusOptions[0]?.value ?? 'todo';
  return {
    name: task?.name ?? '',
    description: task?.description ?? '',
    status: task?.status ?? fallbackStatus,
    deadline: task?.deadline ?? defaultDeadline ?? '',
    issueId: task?.issue?.id ?? null,
    assigneeId: task?.assignee?.id ?? null,
    carryOver: false,
  };
}

export default function WeeklyTaskFormModal({
  isOpen,
  mode,
  defaultDeadline = null,
  task = null,
  statusOptions,
  issueOptions,
  assigneeOptions,
  isSubmitting = false,
  errors,
  onClose,
  onSubmit,
}: WeeklyTaskFormModalProps) {
  const [draft, setDraft] = useState<WeeklyTaskFormDraft>(() => toDraft(task, defaultDeadline, statusOptions));

  useEffect(() => {
    if (isOpen) {
      setDraft(toDraft(task, defaultDeadline, statusOptions));
    }
  }, [isOpen, task, defaultDeadline, statusOptions]);

  const statusLabel = useMemo(() => getTaskStatusLabel(draft.status, statusOptions), [draft.status, statusOptions]);

  function updateDraft<T extends keyof WeeklyTaskFormDraft>(key: T, value: WeeklyTaskFormDraft[T]) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(draft);
  }

  const footer = (
    <div className="weeklyTaskForm__footer">
      <button type="button" className="weeklyTaskForm__button" onClick={onClose} disabled={isSubmitting}>
        Zrušit
      </button>
      <button type="submit" className="weeklyTaskForm__button weeklyTaskForm__button--primary" disabled={isSubmitting}>
        {isSubmitting ? 'Ukládám…' : mode === 'create' ? 'Vytvořit úkol' : 'Uložit změny'}
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'create' ? 'Nový úkol' : 'Upravit úkol'} footer={footer}>
      <form className="weeklyTaskForm" onSubmit={handleSubmit} noValidate>
        {errors?.general && <p className="weeklyTaskForm__error weeklyTaskForm__error--general">{errors.general}</p>}
        <div className="weeklyTaskForm__field">
          <label htmlFor="weekly-task-name" className="weeklyTaskForm__label">
            Název
          </label>
          <input
            id="weekly-task-name"
            name="name"
            type="text"
            className="weeklyTaskForm__input"
            value={draft.name}
            onChange={event => updateDraft('name', event.target.value)}
            required
            disabled={isSubmitting}
          />
          {errors?.name && <span className="weeklyTaskForm__error">{errors.name}</span>}
        </div>
        <div className="weeklyTaskForm__field">
          <label htmlFor="weekly-task-description" className="weeklyTaskForm__label">
            Popis
          </label>
          <textarea
            id="weekly-task-description"
            name="description"
            className="weeklyTaskForm__textarea"
            value={draft.description}
            onChange={event => updateDraft('description', event.target.value)}
            rows={4}
            disabled={isSubmitting}
          />
          {errors?.description && <span className="weeklyTaskForm__error">{errors.description}</span>}
        </div>
        <div className="weeklyTaskForm__field weeklyTaskForm__field--inline">
          <div className="weeklyTaskForm__inlineGroup">
            <label htmlFor="weekly-task-status" className="weeklyTaskForm__label">
              Status ({statusLabel})
            </label>
            <select
              id="weekly-task-status"
              name="status"
              className="weeklyTaskForm__select"
              value={draft.status}
              onChange={event => updateDraft('status', event.target.value)}
              disabled={isSubmitting}
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors?.status && <span className="weeklyTaskForm__error">{errors.status}</span>}
          </div>
          <div className="weeklyTaskForm__inlineGroup">
            <label htmlFor="weekly-task-deadline" className="weeklyTaskForm__label">
              Deadline
            </label>
            <input
              id="weekly-task-deadline"
              name="deadline"
              type="date"
              className="weeklyTaskForm__input"
              value={draft.deadline ?? ''}
              onChange={event => updateDraft('deadline', event.target.value)}
              disabled={isSubmitting}
            />
            {errors?.deadline && <span className="weeklyTaskForm__error">{errors.deadline}</span>}
          </div>
        </div>
        <div className="weeklyTaskForm__field weeklyTaskForm__field--inline">
          <div className="weeklyTaskForm__inlineGroup">
            <label htmlFor="weekly-task-issue" className="weeklyTaskForm__label">
              Issue
            </label>
            <select
              id="weekly-task-issue"
              name="issueId"
              className="weeklyTaskForm__select"
              value={draft.issueId ?? ''}
              onChange={event => updateDraft('issueId', event.target.value ? Number(event.target.value) : null)}
              disabled={isSubmitting}
            >
              <option value="">Bez issue</option>
              {issueOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.reference ? `${option.reference} · ${option.title}` : option.title}
                </option>
              ))}
            </select>
            {errors?.issueId && <span className="weeklyTaskForm__error">{errors.issueId}</span>}
          </div>
          <div className="weeklyTaskForm__inlineGroup">
            <label htmlFor="weekly-task-assignee" className="weeklyTaskForm__label">
              Přiřazeno
            </label>
            <select
              id="weekly-task-assignee"
              name="assigneeId"
              className="weeklyTaskForm__select"
              value={draft.assigneeId ?? ''}
              onChange={event => updateDraft('assigneeId', event.target.value ? Number(event.target.value) : null)}
              disabled={isSubmitting}
            >
              <option value="">Nepřiřazeno</option>
              {assigneeOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.username && option.username.trim().length > 0
                    ? `${option.name} (${option.username})`
                    : option.name}
                </option>
              ))}
            </select>
            {errors?.assigneeId && <span className="weeklyTaskForm__error">{errors.assigneeId}</span>}
          </div>
        </div>
        <label className="weeklyTaskForm__checkboxLabel">
          <input
            type="checkbox"
            name="carryOver"
            checked={draft.carryOver}
            onChange={event => updateDraft('carryOver', event.target.checked)}
            disabled={isSubmitting}
          />
          Přenést do dalšího týdne po uložení
        </label>
      </form>
    </Modal>
  );
}
