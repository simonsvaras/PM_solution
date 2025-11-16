import { useMemo, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import './BacklogTaskColumn.css';
import type { ErrorResponse, WeeklyPlannerTask } from '../api';
import WeeklyTaskFormModal, { type WeeklyTaskFormValues } from './WeeklyTaskFormModal';
import { formatPlannedHours } from './weeklyPlannerUtils';

type BacklogTaskColumnProps = {
  projectId: number;
  sprintId: number | null;
  tasks: WeeklyPlannerTask[];
  isLoading?: boolean;
  error?: ErrorResponse | null;
  onRetry?: () => void;
  onCreateTask?: (values: WeeklyTaskFormValues) => Promise<void>;
  isInteractionDisabled?: boolean;
};

type BacklogTaskCardProps = {
  task: WeeklyPlannerTask;
  isInteractionDisabled?: boolean;
};

function BacklogTaskCard({ task, isInteractionDisabled }: BacklogTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { taskId: task.id, weekId: null },
    disabled: isInteractionDisabled,
  });

  const style = transform
    ? { transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` }
    : undefined;
  const cardClassName = ['backlogTaskColumn__card'];
  if (isDragging) {
    cardClassName.push('backlogTaskColumn__card--dragging');
  }
  if (isInteractionDisabled) {
    cardClassName.push('backlogTaskColumn__card--disabled');
  }

  return (
    <li
      ref={setNodeRef}
      className={cardClassName.join(' ')}
      style={style}
      {...listeners}
      {...attributes}
    >
      <p className="backlogTaskColumn__cardTitle">{task.issueTitle ?? task.note ?? 'Bez názvu'}</p>
      <p className="backlogTaskColumn__cardMeta">
        <span>{task.internName ?? 'Nepřiřazeno'}</span>
        <span aria-hidden="true">•</span>
        <span>{formatPlannedHours(task.plannedHours)}</span>
      </p>
      {task.note && task.note !== task.issueTitle && (
        <p className="backlogTaskColumn__cardNote">{task.note}</p>
      )}
    </li>
  );
}

export default function BacklogTaskColumn({
  projectId,
  sprintId,
  tasks,
  isLoading = false,
  error = null,
  onRetry,
  onCreateTask,
  isInteractionDisabled = false,
}: BacklogTaskColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'backlog-drop-zone',
    data: { weekId: null },
    disabled: isInteractionDisabled,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const hasTasks = tasks.length > 0;
  const emptyStateLabel = useMemo(() => {
    if (isLoading) {
      return 'Načítám backlog…';
    }
    if (error) {
      return 'Backlog se nepodařilo načíst.';
    }
    if (isInteractionDisabled) {
      return 'Sprint je uzavřený. Backlog je pouze pro čtení.';
    }
    if (sprintId === null) {
      return 'Backlog je dostupný až po vytvoření sprintu.';
    }
    return 'Backlog je prázdný. Přidejte první úkol a přetáhněte ho do konkrétního týdne, jakmile budete mít jasno.';
  }, [error, isInteractionDisabled, isLoading, sprintId]);

  const handleCreateClick = () => {
    if (isInteractionDisabled) {
      return;
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  async function handleFormSubmit(values: WeeklyTaskFormValues) {
    if (!onCreateTask) {
      throw new Error('Backlog zatím nepodporuje vytváření úkolů.');
    }
    await onCreateTask(values);
    setIsModalOpen(false);
  }

  const columnClassName = ['backlogTaskColumn'];
  if (isOver) {
    columnClassName.push('backlogTaskColumn--dropActive');
  }
  if (isInteractionDisabled) {
    columnClassName.push('backlogTaskColumn--disabled');
  }

  return (
    <section ref={setNodeRef} className={columnClassName.join(' ')} aria-live="polite">
      <header className="backlogTaskColumn__header">
        <div>
          <p className="backlogTaskColumn__eyebrow">Sprint backlog</p>
          <h3 className="backlogTaskColumn__title">Nenařazené úkoly</h3>
        </div>
        <button
          type="button"
          className="backlogTaskColumn__createButton"
          onClick={handleCreateClick}
          disabled={!onCreateTask || isInteractionDisabled}
        >
          + Nový úkol
        </button>
      </header>

      {error && !isLoading && (
        <div className="backlogTaskColumn__alert" role="alert">
          {error.error.message}
          {onRetry && (
            <button type="button" className="backlogTaskColumn__retry" onClick={onRetry}>
              Zkusit znovu
            </button>
          )}
        </div>
      )}

      <div className="backlogTaskColumn__body">
        {isLoading && <p className="backlogTaskColumn__status">Načítám backlog…</p>}
        {!isLoading && hasTasks && (
          <ul className="backlogTaskColumn__list">
            {tasks.map(task => (
              <BacklogTaskCard key={task.id} task={task} isInteractionDisabled={isInteractionDisabled} />
            ))}
          </ul>
        )}
        {!isLoading && !hasTasks && <p className="backlogTaskColumn__status">{emptyStateLabel}</p>}
      </div>

      <WeeklyTaskFormModal
        isOpen={isModalOpen}
        mode="create"
        projectId={projectId}
        weekId={null}
        week={null}
        onSubmit={handleFormSubmit}
        onCancel={handleCloseModal}
      />
    </section>
  );
}
