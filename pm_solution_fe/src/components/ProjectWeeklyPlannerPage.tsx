import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import './ProjectWeeklyPlannerPage.css';
import Modal from './Modal';
import WeeklySummaryPanel from './WeeklySummaryPanel';
import {
  type CarryOverTasksPayload,
  type ErrorResponse,
  type ProjectOverviewDTO,
  type WeeklyPlannerTask,
  type WeeklyPlannerWeek,
  type WeeklyPlannerSettings,
  type WeeklySummary,
  closeProjectWeek,
  carryOverWeeklyTasks,
  getProjectWeekSummary,
  getProjectWeeklyPlannerWeek,
  getWeeklyPlannerSettings,
  listProjectWeeklyPlannerWeeks,
  updateWeeklyPlannerSettings,
} from '../api';

type ProjectWeeklyPlannerPageProps = {
  project: ProjectOverviewDTO;
};

type CarryOverContext = {
  sourceWeek: WeeklyPlannerWeek;
  targetWeekStart: string;
  targetWeekId: number | null;
};

const WEEK_FETCH_LIMIT = 20;
const dayNames = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
const dateFormatter = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
const hoursFormatter = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

function getDayLabel(dayOfWeek: number | null, weekStartDay = 1): string {
  if (!dayOfWeek || dayOfWeek < 1 || dayOfWeek > dayNames.length) {
    return 'Bez dne';
  }
  const offset = ((weekStartDay - 1) % dayNames.length + dayNames.length) % dayNames.length;
  const index = (offset + (dayOfWeek - 1)) % dayNames.length;
  return dayNames[index];
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start || !end) {
    return '—';
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return '—';
  }
  return `${dateFormatter.format(startDate)} – ${dateFormatter.format(endDate)}`;
}

function formatDate(start: string | null): string {
  if (!start) return '—';
  const value = new Date(start);
  if (Number.isNaN(value.getTime())) {
    return '—';
  }
  return dateFormatter.format(value);
}

function formatPlannedHours(hours: number | null): string {
  if (hours === null || Number.isNaN(hours)) {
    return 'Neplánováno';
  }
  return `${hoursFormatter.format(hours)} h`;
}

function isIssueClosed(task: WeeklyPlannerTask): boolean {
  const state = task.issueState ?? '';
  return state.trim().toLowerCase() === 'closed';
}

export default function ProjectWeeklyPlannerPage({ project }: ProjectWeeklyPlannerPageProps) {
  const [weeksLoading, setWeeksLoading] = useState(false);
  const [weeksError, setWeeksError] = useState<ErrorResponse | null>(null);
  const [weeks, setWeeks] = useState<WeeklyPlannerWeek[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<WeeklyPlannerWeek | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekError, setWeekError] = useState<ErrorResponse | null>(null);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<ErrorResponse | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closingWeek, setClosingWeek] = useState(false);
  const [closeError, setCloseError] = useState<ErrorResponse | null>(null);
  const [carryOverModalOpen, setCarryOverModalOpen] = useState(false);
  const [carryOverContext, setCarryOverContext] = useState<CarryOverContext | null>(null);
  const [carryOverSelection, setCarryOverSelection] = useState<number[]>([]);
  const [carryOverSubmitting, setCarryOverSubmitting] = useState(false);
  const [carryOverError, setCarryOverError] = useState<ErrorResponse | null>(null);
  const [carriedAudit, setCarriedAudit] = useState<Record<number, string>>({});
  const [roles, setRoles] = useState<string[]>([]);
  const [weekStartDay, setWeekStartDay] = useState<number>(1);
  const [weekSettings, setWeekSettings] = useState<WeeklyPlannerSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<ErrorResponse | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState<ErrorResponse | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedWeekIdForForm, setSelectedWeekIdForForm] = useState<number | null>(null);

  const loadSettings = useCallback(() => {
    setSettingsLoading(true);
    setSettingsError(null);
    getWeeklyPlannerSettings(project.id)
      .then(settingsResponse => {
        setWeekSettings(settingsResponse);
        setWeekStartDay(settingsResponse.weekStartDay);
        setSettingsSaveError(null);
      })
      .catch(err => setSettingsError(err as ErrorResponse))
      .finally(() => setSettingsLoading(false));
  }, [project.id]);

  const loadWeeks = useCallback(() => {
    setWeeksLoading(true);
    setWeeksError(null);
    listProjectWeeklyPlannerWeeks(project.id, { limit: WEEK_FETCH_LIMIT, offset: 0 })
      .then(collection => {
        setWeeks(collection.weeks);
        setRoles(collection.metadata.roles);
        setWeekStartDay(collection.metadata.weekStartDay);
        setWeekSettings(prev =>
          prev ? { ...prev, weekStartDay: collection.metadata.weekStartDay } : { weekStartDay: collection.metadata.weekStartDay },
        );
        setSelectedWeekId(prev => {
          if (prev !== null) return prev;
          if (collection.metadata.currentWeekId !== null) {
            return collection.metadata.currentWeekId;
          }
          return collection.weeks[0]?.id ?? null;
        });
      })
      .catch(err => setWeeksError(err as ErrorResponse))
      .finally(() => setWeeksLoading(false));
  }, [project.id]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadWeeks();
  }, [loadWeeks]);

  const fetchWeek = useCallback(
    (weekId: number) => {
      setWeekLoading(true);
      setWeekError(null);
      getProjectWeeklyPlannerWeek(project.id, weekId)
        .then(data => {
          setSelectedWeek(data.week);
          setRoles(data.metadata.roles);
          setWeekStartDay(data.metadata.weekStartDay);
          setWeekSettings(prev =>
            prev ? { ...prev, weekStartDay: data.metadata.weekStartDay } : { weekStartDay: data.metadata.weekStartDay },
          );
          setWeeks(prev => {
            const exists = prev.findIndex(week => week.id === data.week.id);
            if (exists >= 0) {
              const updated = [...prev];
              updated[exists] = data.week;
              return updated;
            }
            return [...prev, data.week].sort((a, b) => {
              const aTime = new Date(a.weekStart).getTime();
              const bTime = new Date(b.weekStart).getTime();
              return bTime - aTime;
            });
          });
        })
        .catch(err => setWeekError(err as ErrorResponse))
        .finally(() => setWeekLoading(false));

      setSummaryLoading(true);
      setSummaryError(null);
      getProjectWeekSummary(project.id, weekId)
        .then(setSummary)
        .catch(err => setSummaryError(err as ErrorResponse))
        .finally(() => setSummaryLoading(false));
    },
    [project.id],
  );

  useEffect(() => {
    if (selectedWeekId === null) {
      setSelectedWeek(null);
      setSummary(null);
      return;
    }
    fetchWeek(selectedWeekId);
  }, [selectedWeekId, fetchWeek]);

  useEffect(() => {
    if (selectedWeekId === null) {
      closeCreateTaskModal();
    }
  }, [selectedWeekId, closeCreateTaskModal]);

  useEffect(() => {
    if (!isCreateModalOpen && selectedWeekId !== selectedWeekIdForForm) {
      setSelectedWeekIdForForm(selectedWeekId);
    }
  }, [isCreateModalOpen, selectedWeekId, selectedWeekIdForForm]);

  const weekStartOptions = useMemo(
    () => dayNames.map((name, index) => ({ value: index + 1, label: `${index + 1} – ${name}` })),
    [],
  );

  const currentWeekStartDay = weekSettings?.weekStartDay ?? weekStartDay;

  const isClosed = summary?.isClosed ?? selectedWeek?.isClosed ?? false;
  const hasPmRole = useMemo(
    () =>
      roles.some(role => {
        const normalized = role.trim().toLowerCase();
        return (
          normalized === 'pm' ||
          normalized === 'project_manager' ||
          normalized === 'project-manager' ||
          normalized.includes('project manager')
        );
      }),
    [roles],
  );
  const canCloseWeek = useMemo(() => {
    if (summary && summary.permissions) {
      if (!summary.permissions.canCloseWeek) {
        return false;
      }
      return roles.length === 0 ? true : hasPmRole;
    }
    if (roles.length > 0) {
      return hasPmRole;
    }
    return false;
  }, [summary, roles, hasPmRole]);

  const closeButtonVisible = canCloseWeek && selectedWeekId !== null;
  const closeButtonDisabled = closingWeek || isClosed;
  const tasks = selectedWeek?.tasks ?? [];

  const headerRange = formatDateRange(selectedWeek?.weekStart ?? summary?.weekStart ?? null, selectedWeek?.weekEnd ?? summary?.weekEnd ?? null);

  const closeModalFooter = (
    <div className="projectWeeklyPlanner__modalFooter">
      <button
        type="button"
        className="projectWeeklyPlanner__modalButton projectWeeklyPlanner__modalButton--secondary"
        onClick={() => setCloseModalOpen(false)}
        disabled={closingWeek}
      >
        Zpět
      </button>
      <button
        type="button"
        className="projectWeeklyPlanner__modalButton projectWeeklyPlanner__modalButton--primary"
        onClick={handleConfirmCloseWeek}
        disabled={closeButtonDisabled}
      >
        {closingWeek ? 'Uzavírám…' : 'Uzavřít týden'}
      </button>
    </div>
  );

  const carryOverFooter = (
    <div className="projectWeeklyPlanner__modalFooter">
      <button
        type="button"
        className="projectWeeklyPlanner__modalButton projectWeeklyPlanner__modalButton--secondary"
        onClick={() => {
          if (!carryOverSubmitting) {
            setCarryOverModalOpen(false);
            setCarryOverContext(null);
            setCarryOverError(null);
          }
        }}
        disabled={carryOverSubmitting}
      >
        Zavřít
      </button>
      <button
        type="button"
        className="projectWeeklyPlanner__modalButton projectWeeklyPlanner__modalButton--primary"
        onClick={handleConfirmCarryOver}
        disabled={carryOverSubmitting || carryOverSelection.length === 0 || !carryOverContext}
      >
        {carryOverSubmitting ? 'Přenáším…' : 'Přenést vybrané'}
      </button>
    </div>
  );

  function handleWeekChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = Number.parseInt(event.target.value, 10);
    if (Number.isNaN(value)) {
      setSelectedWeekId(null);
      return;
    }
    setSelectedWeekId(value);
    loadWeeks();
  }

  const openCreateTaskModal = useCallback(
    (weekId: number | null) => {
      if (weekId === null) {
        return;
      }
      setSelectedWeekIdForForm(weekId);
      setIsCreateModalOpen(true);
    },
    [],
  );

  const closeCreateTaskModal = useCallback(() => {
    setIsCreateModalOpen(false);
    setSelectedWeekIdForForm(null);
  }, []);

  function handleOpenCloseModal() {
    setCloseError(null);
    setCloseModalOpen(true);
  }

  function handleConfirmCloseWeek() {
    if (selectedWeekId === null || !selectedWeek) return;
    setCloseError(null);
    setClosingWeek(true);
    closeProjectWeek(project.id, selectedWeekId)
      .then(response => {
        setClosingWeek(false);
        setCloseModalOpen(false);
        setRoles(response.metadata.roles);
        setWeekStartDay(response.metadata.weekStartDay);
        setWeekSettings(prev =>
          prev ? { ...prev, weekStartDay: response.metadata.weekStartDay } : { weekStartDay: response.metadata.weekStartDay },
        );
        const targetWeekStart = response.metadata.currentWeekStart ?? response.week.weekStart;
        const targetWeekId = response.metadata.currentWeekId ?? null;
        const incompleteTasks = response.week.tasks.filter(task => !isIssueClosed(task));
        setCarryOverSelection(incompleteTasks.map(task => task.id));
        setCarryOverContext({ sourceWeek: response.week, targetWeekStart, targetWeekId });
        setCarryOverModalOpen(true);
        setWeeks(prev => {
          const exists = prev.findIndex(week => week.id === response.week.id);
          if (exists >= 0) {
            const updated = [...prev];
            updated[exists] = response.week;
            return updated;
          }
          return [...prev, response.week];
        });
        if (targetWeekId !== null) {
          setSelectedWeekId(targetWeekId);
        } else {
          fetchWeek(response.week.id);
        }
        loadWeeks();
      })
      .catch(err => {
        setCloseError(err as ErrorResponse);
        setClosingWeek(false);
      });
  }

  function handleWeekStartDayChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = Number.parseInt(event.target.value, 10);
    if (Number.isNaN(value) || value < 1 || value > dayNames.length) {
      return;
    }
    const currentValue = weekSettings?.weekStartDay ?? weekStartDay;
    if (value === currentValue) {
      return;
    }
    setSettingsSaveError(null);
    setSettingsSaving(true);
    updateWeeklyPlannerSettings(project.id, { weekStartDay: value })
      .then(updatedSettings => {
        setSettingsSaving(false);
        setWeekSettings(updatedSettings);
        setWeekStartDay(updatedSettings.weekStartDay);
        setSettingsError(null);
        setSettingsSaveError(null);
        loadWeeks();
        if (selectedWeekId !== null) {
          fetchWeek(selectedWeekId);
        }
      })
      .catch(err => {
        setSettingsSaving(false);
        setSettingsSaveError(err as ErrorResponse);
      });
  }

  function toggleCarryOverSelection(taskId: number) {
    setCarryOverSelection(prev => {
      if (prev.includes(taskId)) {
        return prev.filter(id => id !== taskId);
      }
      return [...prev, taskId];
    });
  }

  function handleConfirmCarryOver() {
    if (!carryOverContext) {
      setCarryOverModalOpen(false);
      return;
    }
    const payload: CarryOverTasksPayload = {
      targetWeekStart: carryOverContext.targetWeekStart,
      taskIds: carryOverSelection,
    };
    setCarryOverSubmitting(true);
    setCarryOverError(null);
    carryOverWeeklyTasks(project.id, carryOverContext.sourceWeek.id, payload)
      .then(newTasks => {
        setCarryOverSubmitting(false);
        setCarryOverModalOpen(false);
        setCarryOverContext(null);
        setCarryOverSelection([]);
        if (newTasks.length > 0) {
          setCarriedAudit(prev => {
            const updates = { ...prev };
            for (const task of newTasks) {
              updates[task.id] = carryOverContext.sourceWeek.weekStart;
            }
            return updates;
          });
        }
        if (carryOverContext.targetWeekId !== null) {
          fetchWeek(carryOverContext.targetWeekId);
        }
        loadWeeks();
      })
      .catch(err => {
        setCarryOverSubmitting(false);
        setCarryOverError(err as ErrorResponse);
      });
  }

  const carryOverTasks = carryOverContext?.sourceWeek.tasks.filter(task => !isIssueClosed(task)) ?? [];
  const createTaskDisabled = selectedWeekId === null || isCreateModalOpen;

  function renderCreateTaskButton(extraClassName = '', options?: { ariaLabel?: string }) {
    const ariaLabel = options?.ariaLabel;
    return (
      <button
        type="button"
        className={`projectWeeklyPlanner__createButton ${extraClassName}`.trim()}
        onClick={() => openCreateTaskModal(selectedWeekId)}
        disabled={createTaskDisabled}
        aria-label={ariaLabel}
      >
        <span className="projectWeeklyPlanner__createButtonIcon" aria-hidden="true">
          +
        </span>
        <span>New task</span>
      </button>
    );
  }

  return (
    <section className="projectWeeklyPlanner" aria-labelledby="project-weekly-planner-title">
      <header className="projectWeeklyPlanner__header">
        <div className="projectWeeklyPlanner__headingGroup">
          <p className="projectWeeklyPlanner__eyebrow">Týdenní plánování</p>
          <div className="projectWeeklyPlanner__headingRow">
            <h2 id="project-weekly-planner-title" className="projectWeeklyPlanner__title">
              {headerRange}
            </h2>
            <span
              className={`projectWeeklyPlanner__statusBadge ${isClosed ? 'projectWeeklyPlanner__statusBadge--closed' : 'projectWeeklyPlanner__statusBadge--open'}`}
            >
              {isClosed ? 'Uzavřený týden' : 'Aktivní týden'}
            </span>
          </div>
          {weeksError && (
            <p className="projectWeeklyPlanner__status projectWeeklyPlanner__status--error">
              Týdny se nepodařilo načíst. {weeksError.error.message}
            </p>
          )}
        </div>
        <div className="projectWeeklyPlanner__controls">
          <label className="projectWeeklyPlanner__weekSelect">
            <span>Vybraný týden</span>
            <select value={selectedWeekId ?? ''} onChange={handleWeekChange} disabled={weeksLoading}>
              <option value="" disabled>
                Vyberte týden
              </option>
              {weeks.map(week => (
                <option key={week.id} value={week.id}>
                  {formatDateRange(week.weekStart, week.weekEnd)} {week.isClosed ? '• Uzavřený' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="projectWeeklyPlanner__secondaryActions">
            <button type="button" disabled title="Coming soon">
              Export PDF/CSV
            </button>
            <button type="button" disabled title="Coming soon">
              Notifikace
            </button>
          </div>
          <div className="projectWeeklyPlanner__createAction">
            {renderCreateTaskButton('projectWeeklyPlanner__createButton--inline')}
          </div>
          {closeButtonVisible && (
            <button
              type="button"
              className="projectWeeklyPlanner__closeButton"
              onClick={handleOpenCloseModal}
              disabled={closeButtonDisabled}
            >
              {closingWeek ? 'Uzavírám…' : 'Uzavřít týden'}
            </button>
          )}
        </div>
      </header>

      <section className="projectWeeklyPlanner__settings" aria-labelledby="project-week-settings-title">
        <div className="projectWeeklyPlanner__settingsHeader">
          <div>
            <h3 id="project-week-settings-title" className="projectWeeklyPlanner__settingsTitle">
              Nastavení týdne
            </h3>
            <p className="projectWeeklyPlanner__settingsHint">Určete, který den je považován za začátek týdne.</p>
          </div>
          {(settingsSaving || settingsLoading) && (
            <span className="projectWeeklyPlanner__settingsStatus" aria-live="polite">
              {settingsSaving ? 'Ukládám…' : 'Načítám…'}
            </span>
          )}
        </div>
        <div className="projectWeeklyPlanner__settingsControls">
          <label className="projectWeeklyPlanner__settingsField">
            <span>První den týdne</span>
            <select
              value={String(currentWeekStartDay)}
              onChange={handleWeekStartDayChange}
              disabled={settingsLoading || settingsSaving}
            >
              {weekStartOptions.map(option => (
                <option key={option.value} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {settingsError && (
            <p className="projectWeeklyPlanner__settingsError" role="alert">
              Nastavení se nepodařilo načíst. {settingsError.error.message}{' '}
              <button
                type="button"
                className="projectWeeklyPlanner__settingsRetry"
                onClick={loadSettings}
                disabled={settingsLoading}
              >
                Zkusit znovu
              </button>
            </p>
          )}
          {settingsSaveError && !settingsError && (
            <p className="projectWeeklyPlanner__settingsError" role="alert">
              Nastavení se nepodařilo uložit. {settingsSaveError.error.message}
            </p>
          )}
        </div>
      </section>

      <WeeklySummaryPanel
        summary={summary}
        isLoading={summaryLoading}
        error={summaryError}
        onRetry={() => {
          if (selectedWeekId !== null) {
            fetchWeek(selectedWeekId);
          }
        }}
      />

      {weekLoading && (
        <p className="projectWeeklyPlanner__status" role="status">
          Načítám detail týdne…
        </p>
      )}
      {weekError && !weekLoading && (
        <p className="projectWeeklyPlanner__status projectWeeklyPlanner__status--error" role="alert">
          Týden se nepodařilo načíst. {weekError.error.message}
        </p>
      )}

      {!weekLoading && !weekError && (
        <>
          <div className="projectWeeklyPlanner__tasksHeader">
            <h3 className="projectWeeklyPlanner__tasksTitle">Plán úkolů</h3>
            <div className="projectWeeklyPlanner__tasksHeaderAction">
              {renderCreateTaskButton()}
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="projectWeeklyPlanner__empty" role="status">
              <p>V tomto týdnu zatím nejsou naplánovány žádné úkoly. Přidejte první, abyste mohli sdílet priority.</p>
            </div>
          ) : (
            <div className="projectWeeklyPlanner__tasks" role="list">
              {tasks.map(task => {
                const carriedFrom = task.carriedOverFromWeekStart ?? carriedAudit[task.id] ?? null;
                const headline = task.issueTitle ?? task.note ?? 'Bez názvu';
                return (
                  <article key={task.id} className="projectWeeklyPlanner__taskCard" role="listitem">
                    <div className="projectWeeklyPlanner__taskHeader">
                      <span className="projectWeeklyPlanner__taskDay">{getDayLabel(task.dayOfWeek, currentWeekStartDay)}</span>
                      {carriedFrom && (
                        <span className="projectWeeklyPlanner__taskBadge">Carried over from week {formatDate(carriedFrom)}</span>
                      )}
                    </div>
                    <h3 className="projectWeeklyPlanner__taskTitle">{headline}</h3>
                    <p className="projectWeeklyPlanner__taskMeta">
                      <span>{task.internName ?? 'Nepřiřazeno'}</span>
                      <span aria-hidden="true">•</span>
                      <span>{formatPlannedHours(task.plannedHours)}</span>
                    </p>
                    {task.note && task.note !== task.issueTitle && (
                      <p className="projectWeeklyPlanner__taskNote">{task.note}</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {renderCreateTaskButton('projectWeeklyPlanner__floatingActionButton', { ariaLabel: 'New task' })}

      <Modal
        isOpen={closeModalOpen}
        onClose={() => {
          if (!closingWeek) {
            setCloseModalOpen(false);
          }
        }}
        title="Uzavřít týden"
        footer={closeModalFooter}
      >
        <div className="projectWeeklyPlanner__modalBody">
          <p>
            Opravdu chcete uzavřít týden <strong>{headerRange}</strong>? Všechny navázané issue budou označené jako uzavřené a
            termíny se přesunou na konec týdne.
          </p>
          {closeError && (
            <p className="projectWeeklyPlanner__modalError" role="alert">
              Uzavření se nezdařilo. {closeError.error.message}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={carryOverModalOpen}
        onClose={() => {
          if (!carryOverSubmitting) {
            setCarryOverModalOpen(false);
            setCarryOverContext(null);
            setCarryOverError(null);
          }
        }}
        title="Přenést nehotové úkoly"
        footer={carryOverFooter}
        bodyClassName="projectWeeklyPlanner__modalScrollableBody"
      >
        <div className="projectWeeklyPlanner__modalBody">
          {carryOverContext && (
            <p>
              Vyberte úkoly k přenosu do týdne začínajícího <strong>{formatDate(carryOverContext.targetWeekStart)}</strong>.
            </p>
          )}
          {carryOverTasks.length === 0 ? (
            <p>Všechny úkoly z uplynulého týdne jsou hotové. Není potřeba nic přenášet.</p>
          ) : (
            <ul className="projectWeeklyPlanner__carryOverList">
              {carryOverTasks.map(task => (
                <li key={task.id}>
                  <label className="projectWeeklyPlanner__carryOverItem">
                    <input
                      type="checkbox"
                      checked={carryOverSelection.includes(task.id)}
                      onChange={() => toggleCarryOverSelection(task.id)}
                      disabled={carryOverSubmitting}
                    />
                    <span>
                      <strong>{task.issueTitle ?? task.note ?? 'Bez názvu'}</strong>
                      <small>
                        {getDayLabel(task.dayOfWeek, currentWeekStartDay)} • {task.internName ?? 'Nepřiřazeno'} • {formatPlannedHours(task.plannedHours)}
                      </small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {carryOverError && (
            <p className="projectWeeklyPlanner__modalError" role="alert">
              Přenos úkolů se nezdařil. {carryOverError.error.message}
            </p>
          )}
        </div>
      </Modal>
    </section>
  );
}
