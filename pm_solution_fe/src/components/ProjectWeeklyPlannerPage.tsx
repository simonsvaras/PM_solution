import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import './ProjectWeeklyPlannerPage.css';
import type {
  ProjectOverviewDTO,
  ProjectInternAssignmentDTO,
  WeeklyPlannerWeek,
  WeeklyPlannerMetadata,
  WeeklyPlannerIssueOption,
  WeeklyTask,
  WeeklyTaskIssue,
  WeeklyTaskStatus,
} from '../api';
import {
  listWeeklyPlannerWeeks,
  getWeeklyPlannerWeek,
  createWeeklyTask,
  updateWeeklyTask,
  changeWeeklyTaskStatus,
  carryOverWeeklyTasks,
  getWeeklyPlannerIssues,
  getProjectInterns,
} from '../api';
import WeeklyTaskList from './WeeklyTaskList';
import WeeklyTaskFormModal, {
  type WeeklyTaskFormDraft,
  type WeeklyTaskFormErrors,
} from './WeeklyTaskFormModal';
import type {
  WeeklyTaskAssigneeOption,
  WeeklyTaskStatusOption,
} from './WeeklyTaskTypes';
import {
  formatAssigneeLabel,
  formatIssueLabel,
  getTaskStatusLabel,
  mergeStatusOptions,
} from './WeeklyTaskTypes';
import Modal from './Modal';

const DEFAULT_STATUS_OPTIONS: WeeklyTaskStatusOption[] = [
  { value: 'todo', label: 'Naplánováno' },
  { value: 'opened', label: 'Otevřeno' },
  { value: 'in_progress', label: 'Rozpracováno' },
  { value: 'blocked', label: 'Blokováno' },
  { value: 'review', label: 'Kontrola' },
  { value: 'done', label: 'Hotovo' },
  { value: 'closed', label: 'Uzavřeno' },
];

const dateFormatter = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium' });

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatWeekRange(week: WeeklyPlannerWeek): string {
  const start = parseDateOnly(week.weekStart);
  const end = parseDateOnly(week.weekEnd);
  if (!start || !end) {
    return `${week.weekStart} – ${week.weekEnd}`;
  }
  return `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`;
}

function computeNextWeekStart(week: WeeklyPlannerWeek | null): string | null {
  if (!week) {
    return null;
  }
  const start = parseDateOnly(week.weekStart);
  if (!start) {
    return null;
  }
  start.setUTCDate(start.getUTCDate() + 7);
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(
    start.getUTCDate(),
  ).padStart(2, '0')}`;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error) {
    const apiError = error as { error?: { message?: string; details?: unknown } };
    const message = apiError.error?.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim();
    }
    const details = apiError.error?.details;
    if (typeof details === 'string' && details.trim().length > 0) {
      return details.trim();
    }
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return fallback;
}

function parseFormErrors(error: unknown, fallback: string): { fieldErrors: WeeklyTaskFormErrors; message: string } {
  const fieldErrors: WeeklyTaskFormErrors = {};
  if (error && typeof error === 'object' && 'error' in error) {
    const apiError = error as { error?: { message?: string; details?: unknown } };
    const message = extractErrorMessage(error, fallback);
    const details = apiError.error?.details;
    if (details && typeof details === 'object' && !Array.isArray(details)) {
      const record = details as Record<string, unknown>;
      Object.entries(record).forEach(([key, value]) => {
        if (typeof value === 'string') {
          fieldErrors[key as keyof WeeklyTaskFormDraft] = value;
        }
      });
    }
    return { fieldErrors, message };
  }
  return { fieldErrors, message: fallback };
}

function mapAssigneeOptions(list: ProjectInternAssignmentDTO[]): WeeklyTaskAssigneeOption[] {
  return list.map(intern => {
    const fullName = [intern.firstName, intern.lastName]
      .map(part => (part && part.trim().length > 0 ? part.trim() : ''))
      .filter(Boolean)
      .join(' ');
    const name = fullName.length > 0 ? fullName : intern.username;
    return {
      id: intern.id,
      name,
      username: intern.username,
    };
  });
}

function buildIssueFromOptions(
  issueId: number | null,
  options: WeeklyPlannerIssueOption[],
): WeeklyTaskIssue | null {
  if (issueId === null) {
    return null;
  }
  const option = options.find(item => item.id === issueId);
  if (!option) {
    return null;
  }
  return {
    id: option.id,
    title: option.title,
    reference: option.reference,
    status: option.status ?? undefined,
    dueDate: option.dueDate ?? undefined,
  };
}

function buildAssigneeFromOptions(
  assigneeId: number | null,
  options: WeeklyTaskAssigneeOption[],
): WeeklyTaskAssigneeOption | null {
  if (assigneeId === null) {
    return null;
  }
  return options.find(option => option.id === assigneeId) ?? null;
}

type PlannerBanner = { tone: 'success' | 'error' | 'warning'; text: string } | null;

type MoveModalState = {
  task: WeeklyTask | null;
  targetWeekStart: string;
  error: string | null;
  submitting: boolean;
};
export default function ProjectWeeklyPlannerPage({ project }: { project: ProjectOverviewDTO }) {
  const [weeks, setWeeks] = useState<WeeklyPlannerWeek[]>([]);
  const [_metadata, setMetadata] = useState<WeeklyPlannerMetadata | null>(null);
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [currentWeek, setCurrentWeek] = useState<WeeklyPlannerWeek | null>(null);
  const [tasks, setTasks] = useState<WeeklyTask[]>([]);
  const [statusOptions, setStatusOptions] = useState<WeeklyTaskStatusOption[]>(DEFAULT_STATUS_OPTIONS);
  const [issueOptions, setIssueOptions] = useState<WeeklyPlannerIssueOption[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<WeeklyTaskAssigneeOption[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingWeekDetail, setLoadingWeekDetail] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [weeksError, setWeeksError] = useState<string | null>(null);
  const [weekError, setWeekError] = useState<string | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [banner, setBanner] = useState<PlannerBanner>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingTask, setEditingTask] = useState<WeeklyTask | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<WeeklyTaskFormErrors>({});
  const [statusUpdatingTaskId, setStatusUpdatingTaskId] = useState<number | null>(null);
  const [moveModal, setMoveModal] = useState<MoveModalState>({ task: null, targetWeekStart: '', error: null, submitting: false });

  const weekOptions = useMemo(() => {
    return weeks
      .slice()
      .sort((a, b) => {
        const aDate = parseDateOnly(a.weekStart)?.getTime() ?? 0;
        const bDate = parseDateOnly(b.weekStart)?.getTime() ?? 0;
        return bDate - aDate;
      })
      .map(week => ({
        id: week.id,
        label: formatWeekRange(week),
        weekStart: week.weekStart,
      }));
  }, [weeks]);

  useEffect(() => {
    let cancelled = false;
    setLoadingWeeks(true);
    setWeeksError(null);
    listWeeklyPlannerWeeks(project.id)
      .then(data => {
        if (cancelled) return;
        setWeeks(data.weeks);
        setMetadata(data.metadata);
        setStatusOptions(prev => mergeStatusOptions(prev, data.weeks.flatMap(week => week.tasks)));
        setSelectedWeekId(prev => {
          if (prev) {
            return prev;
          }
          if (data.metadata.currentWeekId) {
            return data.metadata.currentWeekId;
          }
          return data.weeks[0]?.id ?? null;
        });
      })
      .catch(error => {
        if (cancelled) return;
        setWeeksError(extractErrorMessage(error, 'Nepodařilo se načíst seznam týdnů.'));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingWeeks(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;
    setLoadingOptions(true);
    setOptionsError(null);
    Promise.all([getWeeklyPlannerIssues(project.id), getProjectInterns(project.id)])
      .then(([issues, interns]) => {
        if (cancelled) return;
        setIssueOptions(issues);
        setAssigneeOptions(mapAssigneeOptions(interns));
      })
      .catch(error => {
        if (cancelled) return;
        setOptionsError(extractErrorMessage(error, 'Nepodařilo se načíst možnosti pro formulář.'));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingOptions(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    if (selectedWeekId === null) {
      setCurrentWeek(null);
      setTasks([]);
      return;
    }
    let cancelled = false;
    const cached = weeks.find(week => week.id === selectedWeekId) ?? null;
    if (cached) {
      setCurrentWeek(cached);
      setTasks(cached.tasks);
      setStatusOptions(prev => mergeStatusOptions(prev, cached.tasks));
    } else {
      setCurrentWeek(null);
      setTasks([]);
    }
    setWeekError(null);
    setLoadingWeekDetail(!cached);
    getWeeklyPlannerWeek(project.id, selectedWeekId)
      .then(({ week, metadata: nextMetadata }) => {
        if (cancelled) return;
        setCurrentWeek(week);
        setTasks(week.tasks);
        setMetadata(nextMetadata);
        setStatusOptions(prev => mergeStatusOptions(prev, week.tasks));
      })
      .catch(error => {
        if (cancelled) return;
        setWeekError(extractErrorMessage(error, 'Nepodařilo se načíst detail týdne.'));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingWeekDetail(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, selectedWeekId, weeks]);
  const handleCreateTask = useCallback(() => {
    setEditingTask(null);
    setFormErrors({});
    setFormMode('create');
    setFormOpen(true);
    setBanner(null);
  }, []);

  const handleEditTask = useCallback((task: WeeklyTask) => {
    setEditingTask(task);
    setFormErrors({});
    setFormMode('edit');
    setFormOpen(true);
    setBanner(null);
  }, []);

  const closeForm = useCallback(
    (force = false) => {
      if (formSubmitting && !force) {
        return;
      }
      setFormOpen(false);
      setEditingTask(null);
      setFormErrors({});
    },
    [formSubmitting],
  );

  const refreshAfterMutation = useCallback(async () => {
    if (selectedWeekId === null) {
      return;
    }
    try {
      const { week, metadata: nextMetadata } = await getWeeklyPlannerWeek(project.id, selectedWeekId);
      setCurrentWeek(week);
      setTasks(week.tasks);
      setMetadata(nextMetadata);
      setStatusOptions(prev => mergeStatusOptions(prev, week.tasks));
    } catch (error) {
      setWeekError(extractErrorMessage(error, 'Aktualizace týdne selhala.'));
    }
    try {
      const data = await listWeeklyPlannerWeeks(project.id);
      setWeeks(data.weeks);
      setMetadata(data.metadata);
      setStatusOptions(prev => mergeStatusOptions(prev, data.weeks.flatMap(week => week.tasks)));
    } catch (error) {
      setWeeksError(extractErrorMessage(error, 'Aktualizace seznamu týdnů selhala.'));
    }
  }, [project.id, selectedWeekId]);

  async function attemptCarryOver(taskId: number, customTargetStart?: string | null): Promise<boolean> {
    if (selectedWeekId === null) {
      return false;
    }
    const targetStart = customTargetStart ?? computeNextWeekStart(currentWeek);
    if (!targetStart) {
      return false;
    }
    try {
      await carryOverWeeklyTasks(project.id, selectedWeekId, {
        targetWeekStart: targetStart,
        taskIds: [taskId],
      });
      return true;
    } catch (error) {
      setBanner({ tone: 'error', text: extractErrorMessage(error, 'Přenesení úkolu selhalo.') });
      return false;
    }
  }

  async function handleFormSubmit(draft: WeeklyTaskFormDraft) {
    if (selectedWeekId === null) {
      return;
    }
    setFormSubmitting(true);
    setFormErrors({});
    setBanner(null);
    const previousTasks = tasks;

    if (formMode === 'create') {
      const optimisticId = Date.now() * -1;
      const optimisticTask: WeeklyTask = {
        id: optimisticId,
        name: draft.name.trim() || 'Bez názvu',
        description: draft.description.trim().length > 0 ? draft.description.trim() : null,
        status: draft.status,
        deadline: draft.deadline && draft.deadline.length > 0 ? draft.deadline : null,
        issue: buildIssueFromOptions(draft.issueId, issueOptions),
        assignee: buildAssigneeFromOptions(draft.assigneeId, assigneeOptions),
        carriedOverFrom: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        dayOfWeek: null,
        plannedHours: null,
      };
      setTasks(prev => [optimisticTask, ...prev]);
      setStatusOptions(prev => mergeStatusOptions(prev, [optimisticTask]));
      try {
        const created = await createWeeklyTask(project.id, selectedWeekId, {
          name: draft.name,
          description: draft.description,
          status: draft.status,
          deadline: draft.deadline || null,
          issueId: draft.issueId,
          assigneeId: draft.assigneeId,
          carryOver: draft.carryOver,
        });
        setTasks(prev => prev.map(task => (task.id === optimisticId ? created : task)));
        setStatusOptions(prev => mergeStatusOptions(prev, [created]));
        if (draft.carryOver) {
          await attemptCarryOver(created.id);
          setBanner({ tone: 'success', text: 'Úkol byl vytvořen a přenesen do dalšího týdne.' });
        } else {
          setBanner({ tone: 'success', text: 'Úkol byl vytvořen.' });
        }
        closeForm(true);
        await refreshAfterMutation();
      } catch (error) {
        setTasks(previousTasks);
        const { fieldErrors, message } = parseFormErrors(error, 'Vytvoření úkolu selhalo.');
        setFormErrors({ ...fieldErrors, general: message });
        setBanner({ tone: 'error', text: message });
      } finally {
        setFormSubmitting(false);
      }
      return;
    }

    if (editingTask) {
      const optimisticTask: WeeklyTask = {
        ...editingTask,
        name: draft.name.trim() || 'Bez názvu',
        description: draft.description.trim().length > 0 ? draft.description.trim() : null,
        status: draft.status,
        deadline: draft.deadline && draft.deadline.length > 0 ? draft.deadline : null,
        issue: buildIssueFromOptions(draft.issueId, issueOptions),
        assignee: buildAssigneeFromOptions(draft.assigneeId, assigneeOptions),
        updatedAt: new Date().toISOString(),
      };
      setTasks(prev => prev.map(task => (task.id === editingTask.id ? optimisticTask : task)));
      setStatusOptions(prev => mergeStatusOptions(prev, [optimisticTask]));
      try {
        const updated = await updateWeeklyTask(project.id, selectedWeekId, editingTask.id, {
          name: draft.name,
          description: draft.description,
          status: draft.status,
          deadline: draft.deadline || null,
          issueId: draft.issueId,
          assigneeId: draft.assigneeId,
          carryOver: draft.carryOver,
        });
        setTasks(prev => prev.map(task => (task.id === updated.id ? updated : task)));
        setStatusOptions(prev => mergeStatusOptions(prev, [updated]));
        if (draft.carryOver) {
          await attemptCarryOver(updated.id);
          setBanner({ tone: 'success', text: 'Úkol byl upraven a přenesen do dalšího týdne.' });
        } else {
          setBanner({ tone: 'success', text: 'Úkol byl upraven.' });
        }
        closeForm(true);
        await refreshAfterMutation();
      } catch (error) {
        setTasks(previousTasks);
        const { fieldErrors, message } = parseFormErrors(error, 'Úprava úkolu selhala.');
        setFormErrors({ ...fieldErrors, general: message });
        setBanner({ tone: 'error', text: message });
      } finally {
        setFormSubmitting(false);
      }
    }
  }

  async function handleStatusChange(task: WeeklyTask, status: WeeklyTaskStatus) {
    if (selectedWeekId === null) {
      return;
    }
    const previousTasks = tasks;
    setStatusUpdatingTaskId(task.id);
    setTasks(prev => prev.map(item => (item.id === task.id ? { ...item, status } : item)));
    try {
      const updated = await changeWeeklyTaskStatus(project.id, selectedWeekId, task.id, { status });
      setTasks(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      setStatusOptions(prev => mergeStatusOptions(prev, [updated]));
      setBanner({ tone: 'success', text: 'Status úkolu byl změněn.' });
      await refreshAfterMutation();
    } catch (error) {
      setTasks(previousTasks);
      setBanner({ tone: 'error', text: extractErrorMessage(error, 'Změna statusu selhala.') });
    } finally {
      setStatusUpdatingTaskId(null);
    }
  }
  const handleMoveTask = useCallback((task: WeeklyTask) => {
    setMoveModal({ task, targetWeekStart: '', error: null, submitting: false });
  }, []);

  const closeMoveModal = useCallback(() => {
    setMoveModal({ task: null, targetWeekStart: '', error: null, submitting: false });
  }, []);

  async function confirmMove() {
    if (!moveModal.task || selectedWeekId === null) {
      return;
    }
    if (!moveModal.targetWeekStart) {
      setMoveModal(prev => ({ ...prev, error: 'Vyberte cílový týden.' }));
      return;
    }
    setMoveModal(prev => ({ ...prev, submitting: true, error: null }));
    try {
      await carryOverWeeklyTasks(project.id, selectedWeekId, {
        targetWeekStart: moveModal.targetWeekStart,
        taskIds: [moveModal.task.id],
      });
      setBanner({
        tone: 'success',
        text: `Úkol „${moveModal.task.name}“ byl přenesen do týdne ${moveModal.targetWeekStart}.`,
      });
      closeMoveModal();
      await refreshAfterMutation();
    } catch (error) {
      setMoveModal(prev => ({ ...prev, error: extractErrorMessage(error, 'Přenesení úkolu selhalo.'), submitting: false }));
    }
  }

  const filteredMoveTargets = useMemo(() => {
    return weekOptions.filter(option => option.id !== selectedWeekId);
  }, [selectedWeekId, weekOptions]);
  const defaultDeadline = currentWeek?.weekEnd ?? null;

  function handleWeekChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    setSelectedWeekId(value ? Number(value) : null);
  }

  return (
    <section className="projectWeeklyPlanner" aria-labelledby="project-weekly-planner-title">
      <header className="projectWeeklyPlanner__header">
        <h2 id="project-weekly-planner-title">Týdenní plánování</h2>
        <p className="projectWeeklyPlanner__subtitle">
          Plánujte priority projektu {project.name} a sledujte stav úkolů pro jednotlivé týdny.
        </p>
      </header>

      <div className="projectWeeklyPlanner__controls">
        <label className="projectWeeklyPlanner__weekLabel" htmlFor="project-weekly-week-select">
          Vybraný týden
        </label>
        <select
          id="project-weekly-week-select"
          className="projectWeeklyPlanner__weekSelect"
          value={selectedWeekId ?? ''}
          onChange={handleWeekChange}
          disabled={loadingWeeks || weekOptions.length === 0}
        >
          {weekOptions.length === 0 ? (
            <option value="">Nebyly nalezeny žádné týdny</option>
          ) : (
            weekOptions.map(option => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))
          )}
        </select>
      </div>

      {weeksError && <p className="projectWeeklyPlanner__status projectWeeklyPlanner__status--error">{weeksError}</p>}
      {loadingOptions && (
        <p className="projectWeeklyPlanner__status projectWeeklyPlanner__status--warning">
          Načítám dostupné issues a stážisty…
        </p>
      )}
      {optionsError && <p className="projectWeeklyPlanner__status projectWeeklyPlanner__status--warning">{optionsError}</p>}
      {banner && (
        <p className={`projectWeeklyPlanner__status projectWeeklyPlanner__status--${banner.tone}`}>
          {banner.text}
        </p>
      )}
      {weekError && <p className="projectWeeklyPlanner__status projectWeeklyPlanner__status--error">{weekError}</p>}

      <WeeklyTaskList
        tasks={tasks}
        statusOptions={statusOptions}
        onCreate={handleCreateTask}
        onEdit={handleEditTask}
        onChangeStatus={handleStatusChange}
        onMove={handleMoveTask}
        isLoading={loadingWeekDetail}
        statusUpdatingTaskId={statusUpdatingTaskId}
        createDisabled={loadingOptions || selectedWeekId === null}
      />

      <WeeklyTaskFormModal
        isOpen={formOpen}
        mode={formMode}
        defaultDeadline={defaultDeadline}
        task={editingTask}
        statusOptions={statusOptions}
        issueOptions={issueOptions}
        assigneeOptions={assigneeOptions}
        isSubmitting={formSubmitting}
        errors={formErrors}
        onClose={closeForm}
        onSubmit={handleFormSubmit}
      />

      <Modal
        isOpen={moveModal.task !== null}
        onClose={closeMoveModal}
        title={moveModal.task ? `Přesunout úkol „${moveModal.task.name}“` : 'Přesunout úkol'}
        footer={
          <div className="projectWeeklyPlanner__moveFooter">
            <button type="button" onClick={closeMoveModal} className="projectWeeklyPlanner__moveButton" disabled={moveModal.submitting}>
              Zrušit
            </button>
            <button
              type="button"
              onClick={confirmMove}
              className="projectWeeklyPlanner__moveButton projectWeeklyPlanner__moveButton--primary"
              disabled={moveModal.submitting}
            >
              {moveModal.submitting ? 'Přenáším…' : 'Přenést úkol'}
            </button>
          </div>
        }
      >
        {moveModal.task && (
          <div className="projectWeeklyPlanner__moveBody">
            <p className="projectWeeklyPlanner__moveDescription">
              Vyberte cílový týden, do kterého se má úkol <strong>{moveModal.task.name}</strong> přenést.
            </p>
            <label htmlFor="project-weekly-move-target" className="projectWeeklyPlanner__moveLabel">
              Cílový týden
            </label>
            <select
              id="project-weekly-move-target"
              className="projectWeeklyPlanner__moveSelect"
              value={moveModal.targetWeekStart}
              onChange={event =>
                setMoveModal(prev => ({ ...prev, targetWeekStart: event.target.value, error: null }))
              }
              disabled={moveModal.submitting || filteredMoveTargets.length === 0}
            >
              <option value="">Vyberte…</option>
              {filteredMoveTargets.map(option => (
                <option key={option.id} value={option.weekStart}>
                  {option.label}
                </option>
              ))}
            </select>
            {moveModal.error && <p className="projectWeeklyPlanner__status projectWeeklyPlanner__status--error">{moveModal.error}</p>}
            <dl className="projectWeeklyPlanner__moveSummary">
              <div>
                <dt>Status</dt>
                <dd>{getTaskStatusLabel(moveModal.task.status, statusOptions)}</dd>
              </div>
              <div>
                <dt>Přiřazeno</dt>
                <dd>{formatAssigneeLabel(moveModal.task.assignee)}</dd>
              </div>
              <div>
                <dt>Issue</dt>
                <dd>{formatIssueLabel(moveModal.task.issue)}</dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>
    </section>
  );
}
