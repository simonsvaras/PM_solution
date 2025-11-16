import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import './SprintHeader.css';
import {
  closeSprint,
  getSprintSummary,
  type ErrorResponse,
  type Sprint,
  type SprintStatus,
  type SprintSummary,
} from '../../api';
import { formatDate } from '../weeklyPlannerUtils';

export function getSprintSummaryQueryKey(projectId: number, sprintId: number | null) {
  return ['sprint-summary', projectId, sprintId];
}

function normaliseStatus(value: string | null | undefined): SprintStatus | null {
  if (!value) {
    return null;
  }
  const upper = value.trim().toUpperCase();
  if (upper === 'CLOSED') {
    return 'CLOSED';
  }
  if (upper === 'OPEN') {
    return 'OPEN';
  }
  return null;
}

const STATUS_LABELS: Record<SprintStatus, string> = {
  OPEN: 'Aktivní sprint',
  CLOSED: 'Uzavřený sprint',
};

type SprintHeaderProps = {
  projectId: number;
  sprintId: number | null;
  initialName?: string | null;
  initialDeadline?: string | null;
  initialStatus?: string | null;
  onShowToast?: (type: 'success' | 'warning' | 'error', text: string) => void;
  onSprintClosed?: (sprint: Sprint) => void;
};

export default function SprintHeader({
  projectId,
  sprintId,
  initialName,
  initialDeadline,
  initialStatus,
  onShowToast,
  onSprintClosed,
}: SprintHeaderProps) {
  const queryClient = useQueryClient();
  const [buttonError, setButtonError] = useState<ErrorResponse | null>(null);
  const queryKey = useMemo(() => getSprintSummaryQueryKey(projectId, sprintId), [projectId, sprintId]);
  const isQueryEnabled = typeof sprintId === 'number' && Number.isFinite(sprintId);

  useEffect(() => {
    setButtonError(null);
  }, [sprintId]);

  const { data, isPending, isFetching, error } = useQuery<SprintSummary, ErrorResponse>({
    queryKey,
    queryFn: () => getSprintSummary(projectId, sprintId as number),
    enabled: isQueryEnabled,
  });

  const closeSprintMutation = useMutation<Sprint, ErrorResponse, void>({
    mutationFn: async () => {
      if (!isQueryEnabled) {
        throw {
          error: {
            code: 'sprint_missing',
            message: 'Sprint není k dispozici.',
            httpStatus: 400,
          },
        } as ErrorResponse;
      }
      return closeSprint(projectId, sprintId as number);
    },
    onMutate: () => {
      setButtonError(null);
    },
    onSuccess: sprint => {
      queryClient.setQueryData<SprintSummary | undefined>(queryKey, previous => {
        if (!previous || previous.id !== sprint.id) {
          return previous;
        }
        return { ...previous, status: sprint.status };
      });
      void queryClient.invalidateQueries({ queryKey });
      onShowToast?.('success', 'Sprint byl uzavřen.');
      onSprintClosed?.(sprint);
    },
    onError: err => {
      setButtonError(err);
    },
  });

  if (!isQueryEnabled) {
    return (
      <section className="sprintHeader sprintHeader--empty" aria-live="polite">
        <p className="sprintHeader__eyebrow">Aktuální sprint</p>
        <h2 className="sprintHeader__title">Žádný aktivní sprint</h2>
        <p className="sprintHeader__description">Pro projekt zatím není otevřený sprint.</p>
      </section>
    );
  }

  const summary = data ?? null;
  const isLoading = isPending || isFetching;
  const summaryError = error ?? null;
  const summaryStatus = summary?.status ?? null;
  const fallbackStatus = normaliseStatus(initialStatus);
  let currentStatus: SprintStatus | null = null;
  if (summaryStatus === 'CLOSED' || fallbackStatus === 'CLOSED') {
    currentStatus = 'CLOSED';
  } else {
    currentStatus = summaryStatus ?? fallbackStatus ?? null;
  }

  const sprintName = summary?.name ?? initialName ?? '—';
  const deadlineValue = summary?.deadline ?? initialDeadline ?? null;
  const deadlineLabel = formatDate(deadlineValue);

  const taskSummary = summary?.taskSummary ?? null;
  const totalTasks = taskSummary?.totalTasks ?? 0;
  const closedTasks = taskSummary?.closedTasks ?? 0;
  const progressPercentage = totalTasks > 0 ? Math.round((closedTasks / totalTasks) * 100) : 0;
  const progressLabel = taskSummary
    ? `${closedTasks}/${totalTasks} úkolů hotovo${totalTasks > 0 ? ` (${progressPercentage} %)` : ''}`
    : isLoading
      ? 'Načítám souhrn…'
      : '—';

  const showCloseButton = currentStatus === 'OPEN';
  const allTasksClosed = Boolean(taskSummary && totalTasks === closedTasks);
  const closeDisabled = !allTasksClosed || isLoading || closeSprintMutation.isPending || Boolean(summaryError);

  function handleCloseClick() {
    if (closeDisabled) {
      return;
    }
    closeSprintMutation.mutateAsync().catch(() => {
      /* error handled in onError */
    });
  }

  const badgeClassName = ['sprintHeader__badge'];
  if (currentStatus === 'OPEN') {
    badgeClassName.push('sprintHeader__badge--open');
  } else if (currentStatus === 'CLOSED') {
    badgeClassName.push('sprintHeader__badge--closed');
  }

  return (
    <section className="sprintHeader" aria-live="polite">
      <div className="sprintHeader__row">
        <div>
          <p className="sprintHeader__eyebrow">Aktuální sprint</p>
          <h2 className="sprintHeader__title">{sprintName}</h2>
        </div>
        {currentStatus && <span className={badgeClassName.join(' ')}>{STATUS_LABELS[currentStatus]}</span>}
      </div>

      <div className="sprintHeader__meta">
        <div>
          <p className="sprintHeader__deadlineLabel">Deadline</p>
          <p className="sprintHeader__deadlineValue">{deadlineLabel}</p>
        </div>
        <div className="sprintHeader__progress">
          <p className="sprintHeader__progressLabel">{progressLabel}</p>
          <div
            className="sprintHeader__progressBar"
            role="progressbar"
            aria-valuenow={progressPercentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Procento uzavřených úkolů ve sprintu"
          >
            <div className="sprintHeader__progressBarFill" style={{ width: `${progressPercentage}%` }} />
          </div>
        </div>
        {showCloseButton && (
          <div className="sprintHeader__actions">
            <button type="button" className="sprintHeader__closeButton" onClick={handleCloseClick} disabled={closeDisabled}>
              {closeSprintMutation.isPending ? 'Closing…' : 'Close sprint'}
            </button>
            {buttonError && (
              <p className="sprintHeader__error" role="alert">
                {buttonError.error?.message ?? 'Sprint se nepodařilo uzavřít.'}
              </p>
            )}
            {!buttonError && !allTasksClosed && taskSummary && (
              <p className="sprintHeader__hint">Pro uzavření musí být všechny úkoly uzavřené.</p>
            )}
          </div>
        )}
      </div>

      {summaryError && (
        <p className="sprintHeader__error" role="alert">
          Souhrn sprintu se nepodařilo načíst. {summaryError.error?.message ?? ''}
        </p>
      )}
    </section>
  );
}
