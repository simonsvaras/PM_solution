import { type ChangeEvent, type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import Modal from './Modal';
import './WeeklyTaskFormModal.css';
import {
  getProjectInterns,
  getProjectIssues,
  type ProjectInternAssignmentDTO,
  type ProjectIssue,
  type WeeklyPlannerWeek,
} from '../api';
import { useQuery } from '../hooks/useQuery';

export type WeeklyTaskFormMode = 'create' | 'edit';

export type WeeklyTaskFormValues = {
  title: string;
  description: string;
  status: 'OPENED' | 'CLOSED';
  deadline: string | null;
  issueId: number | null;
  assignedInternId: number | null;
};

export type WeeklyTaskFormInitialTask = Partial<WeeklyTaskFormValues>;

export type WeekSelectOption = {
  id: number | null;
  label: string;
};

export type WeeklyTaskFormModalProps = {
  isOpen: boolean;
  mode: WeeklyTaskFormMode;
  projectId: number;
  weekId: number | null;
  week: WeeklyPlannerWeek | null;
  initialTask?: WeeklyTaskFormInitialTask | null;
  onSubmit: (values: WeeklyTaskFormValues) => Promise<void> | void;
  onCancel: () => void;
  weekOptions?: WeekSelectOption[];
  selectedWeekId?: number | null;
  onSelectWeek?: (weekId: number | null) => void;
};

type FieldErrors = Partial<Record<keyof WeeklyTaskFormValues, string>>;

type SubmitError = string | null;

const statusOptions: Array<{ value: WeeklyTaskFormValues['status']; label: string }> = [
  { value: 'OPENED', label: 'Otevřeno' },
  { value: 'CLOSED', label: 'Uzavřeno' },
];

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toISOString().slice(0, 10);
}

function formatIssueOption(issue: ProjectIssue): string {
  const reference = issue.reference ? `#${issue.reference}` : '';
  const state = issue.state ? ` • ${issue.state.toUpperCase()}` : '';
  return `${reference ? `${reference} ` : ''}${issue.title}${state}`.trim();
}

function formatInternOption(intern: ProjectInternAssignmentDTO): string {
  const fullName = `${intern.lastName} ${intern.firstName}`.trim();
  const username = intern.username ? ` (${intern.username})` : '';
  return `${fullName}${username}`;
}

function extractErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const maybeResponse = (error as { response?: { data?: { message?: string } } }).response;
  if (maybeResponse?.data && typeof maybeResponse.data.message === 'string') {
    return maybeResponse.data.message;
  }
  if ('message' in error && typeof (error as { message?: string }).message === 'string') {
    return (error as { message?: string }).message ?? null;
  }
  return null;
}

export default function WeeklyTaskFormModal({
  isOpen,
  mode,
  projectId,
  weekId,
  week,
  initialTask,
  onSubmit,
  onCancel,
  weekOptions,
  selectedWeekId,
  onSelectWeek,
}: WeeklyTaskFormModalProps) {
  const formId = useId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<WeeklyTaskFormValues['status']>('OPENED');
  const [deadline, setDeadline] = useState('');
  const [issueId, setIssueId] = useState<number | null>(null);
  const [assignedInternId, setAssignedInternId] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<SubmitError>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultDeadline = useMemo(() => toDateInputValue(week?.weekEnd ?? null), [week?.weekEnd]);

  const issuesQuery = useQuery(
    () => getProjectIssues(projectId),
    [projectId],
    { enabled: isOpen && projectId > 0 },
  );

  const internsQuery = useQuery(
    () => getProjectInterns(projectId),
    [projectId],
    { enabled: isOpen && projectId > 0 },
  );

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialTask?.title ?? '');
    setDescription(initialTask?.description ?? '');
    setStatus(initialTask?.status ?? 'OPENED');
    const nextDeadline = initialTask?.deadline ?? defaultDeadline;
    setDeadline(nextDeadline ? toDateInputValue(nextDeadline) : '');
    setIssueId(initialTask?.issueId ?? null);
    setAssignedInternId(initialTask?.assignedInternId ?? null);
    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(false);
  }, [isOpen, initialTask, defaultDeadline]);

  useEffect(() => {
    if (isOpen) {
      return;
    }
    setTitle('');
    setDescription('');
    setStatus('OPENED');
    setDeadline('');
    setIssueId(null);
    setAssignedInternId(null);
    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(false);
  }, [isOpen, week?.id]);

  const issueOptions = issuesQuery.data ?? [];
  const internOptions = internsQuery.data ?? [];

  function clearFieldError(field: keyof WeeklyTaskFormValues) {
    setFieldErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function handleTitleChange(event: ChangeEvent<HTMLInputElement>) {
    clearFieldError('title');
    setTitle(event.target.value);
  }

  function handleDescriptionChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setDescription(event.target.value);
  }

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    setStatus(event.target.value as WeeklyTaskFormValues['status']);
  }

  function handleDeadlineChange(event: ChangeEvent<HTMLInputElement>) {
    clearFieldError('deadline');
    setDeadline(event.target.value);
  }

  function handleIssueChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    if (value === '' || value.startsWith('__')) {
      setIssueId(null);
      return;
    }
    const parsed = Number(value);
    setIssueId(Number.isNaN(parsed) ? null : parsed);
  }

  function handleInternChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    if (value === '' || value.startsWith('__')) {
      setAssignedInternId(null);
      return;
    }
    const parsed = Number(value);
    setAssignedInternId(Number.isNaN(parsed) ? null : parsed);
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (title.trim().length === 0) {
      errors.title = 'Název je povinný.';
    }
    const trimmedDeadline = deadline.trim();
    if (trimmedDeadline.length > 0) {
      const formatted = toDateInputValue(trimmedDeadline);
      if (!formatted) {
        errors.deadline = 'Zadejte platné datum.';
      } else {
        const weekStart = toDateInputValue(week?.weekStart ?? null);
        const weekEnd = toDateInputValue(week?.weekEnd ?? null);
        if (weekStart && weekEnd && (formatted < weekStart || formatted > weekEnd)) {
          errors.deadline = 'Deadline musí spadat do vybraného týdne.';
        }
      }
    }
    return errors;
  }

  function handleCancel() {
    if (isSubmitting) return;
    onCancel();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const payload: WeeklyTaskFormValues = {
      title: title.trim(),
      description: description.trim(),
      status,
      deadline: deadline.trim().length > 0 ? deadline : null,
      issueId,
      assignedInternId,
    };

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      await onSubmit(payload);
      setIsSubmitting(false);
    } catch (error) {
      setIsSubmitting(false);
      setSubmitError(extractErrorMessage(error) ?? 'Formulář se nepodařilo uložit.');
    }
  }

  const modalTitle = mode === 'create' ? 'Nový úkol' : 'Upravit úkol';
  const submitLabel = mode === 'create' ? 'Vytvořit úkol' : 'Uložit změny';

  const resolvedWeekId = selectedWeekId ?? week?.id ?? weekId ?? null;
  const showWeekSelect = Array.isArray(weekOptions) && weekOptions.length > 0;
  const showBacklogHint = mode === 'create' && weekId === null;

  function toWeekSelectValue(id: number | null): string {
    return id === null ? '__backlog__' : String(id);
  }

  function handleWeekSelectChange(event: ChangeEvent<HTMLSelectElement>) {
    if (!onSelectWeek) {
      return;
    }
    const value = event.target.value;
    if (value === '__backlog__') {
      onSelectWeek(null);
      return;
    }
    const parsed = Number.parseInt(value, 10);
    onSelectWeek(Number.isNaN(parsed) ? null : parsed);
  }

  const footer = (
    <div className="weeklyTaskFormModal__footer">
      <button
        type="button"
        className="weeklyTaskFormModal__button weeklyTaskFormModal__button--secondary"
        onClick={handleCancel}
        disabled={isSubmitting}
      >
        Zrušit
      </button>
      <button
        type="submit"
        className="weeklyTaskFormModal__button weeklyTaskFormModal__button--primary"
        form={formId}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Ukládám…' : submitLabel}
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title={modalTitle} footer={footer} bodyClassName="weeklyTaskFormModal__body">
      {submitError && (
        <div className="weeklyTaskFormModal__alert" role="alert">
          {submitError}
        </div>
      )}
      {showBacklogHint && (
        <p className="weeklyTaskFormModal__hint" role="status">
          Nový úkol je uložen do backlogu, přiřaďte ho do týdne z boardu.
        </p>
      )}
      <form id={formId} className="weeklyTaskFormModal__form" onSubmit={handleSubmit} noValidate>
        {showWeekSelect && (
          <div className="weeklyTaskFormModal__field">
            <label htmlFor={`${formId}-week`} className="weeklyTaskFormModal__label">
              Týden
            </label>
            <select
              id={`${formId}-week`}
              value={toWeekSelectValue(resolvedWeekId)}
              onChange={handleWeekSelectChange}
              className="weeklyTaskFormModal__select"
              disabled={isSubmitting || !onSelectWeek}
            >
              {weekOptions?.map(option => (
                <option key={toWeekSelectValue(option.id)} value={toWeekSelectValue(option.id)}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="weeklyTaskFormModal__field">
          <label htmlFor={`${formId}-title`} className="weeklyTaskFormModal__label">
            Název úkolu<span aria-hidden="true">*</span>
          </label>
          <input
            id={`${formId}-title`}
            type="text"
            value={title}
            onChange={handleTitleChange}
            className="weeklyTaskFormModal__input"
            placeholder="Např. Připravit podklady pro meeting"
            required
            disabled={isSubmitting}
          />
          {fieldErrors.title && (
            <p className="weeklyTaskFormModal__error" role="alert">
              {fieldErrors.title}
            </p>
          )}
        </div>

        <div className="weeklyTaskFormModal__field">
          <label htmlFor={`${formId}-description`} className="weeklyTaskFormModal__label">
            Popis
          </label>
          <textarea
            id={`${formId}-description`}
            value={description}
            onChange={handleDescriptionChange}
            className="weeklyTaskFormModal__textarea"
            placeholder="Upřesněte, co je cílem úkolu."
            disabled={isSubmitting}
          />
        </div>

        <div className="weeklyTaskFormModal__field">
          <label htmlFor={`${formId}-status`} className="weeklyTaskFormModal__label">
            Stav
          </label>
          <select
            id={`${formId}-status`}
            value={status}
            onChange={handleStatusChange}
            className="weeklyTaskFormModal__select"
            disabled={isSubmitting}
          >
            {statusOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="weeklyTaskFormModal__field">
          <label htmlFor={`${formId}-deadline`} className="weeklyTaskFormModal__label">
            Deadline
          </label>
          <input
            id={`${formId}-deadline`}
            type="date"
            value={deadline}
            onChange={handleDeadlineChange}
            className="weeklyTaskFormModal__input"
            disabled={isSubmitting}
            min={toDateInputValue(week?.weekStart ?? null) || undefined}
            max={toDateInputValue(week?.weekEnd ?? null) || undefined}
          />
          {fieldErrors.deadline && (
            <p className="weeklyTaskFormModal__error" role="alert">
              {fieldErrors.deadline}
            </p>
          )}
        </div>

        <div className="weeklyTaskFormModal__field">
          <label htmlFor={`${formId}-issue`} className="weeklyTaskFormModal__label">
            Navázané issue
          </label>
          <select
            id={`${formId}-issue`}
            value={issueId === null ? '' : String(issueId)}
            onChange={handleIssueChange}
            className="weeklyTaskFormModal__select"
            disabled={isSubmitting || issuesQuery.isLoading}
            aria-busy={issuesQuery.isLoading}
          >
            <option value="">Bez issue</option>
            {issuesQuery.isLoading && (
              <option value="__loading" disabled>
                Načítám issue…
              </option>
            )}
            {!issuesQuery.isLoading && Boolean(issuesQuery.error) && (
              <option value="__error" disabled>
                Issue se nepodařilo načíst
              </option>
            )}
            {!issuesQuery.isLoading && !issuesQuery.error && issueOptions.length === 0 && (
              <option value="__empty" disabled>
                Žádné issue k dispozici
              </option>
            )}
            {issueOptions.map(issue => (
              <option key={issue.id} value={issue.id}>
                {formatIssueOption(issue)}
              </option>
            ))}
          </select>
        </div>

        <div className="weeklyTaskFormModal__field">
          <label htmlFor={`${formId}-intern`} className="weeklyTaskFormModal__label">
            Přiřazený stážista
          </label>
          <select
            id={`${formId}-intern`}
            value={assignedInternId === null ? '' : String(assignedInternId)}
            onChange={handleInternChange}
            className="weeklyTaskFormModal__select"
            disabled={isSubmitting || internsQuery.isLoading}
            aria-busy={internsQuery.isLoading}
          >
            <option value="">Nepřiřazeno</option>
            {internsQuery.isLoading && (
              <option value="__loading" disabled>
                Načítám stážisty…
              </option>
            )}
            {!internsQuery.isLoading && Boolean(internsQuery.error) && (
              <option value="__error" disabled>
                Stážisty se nepodařilo načíst
              </option>
            )}
            {!internsQuery.isLoading && !internsQuery.error && internOptions.length === 0 && (
              <option value="__empty" disabled>
                Žádní stážisti nejsou k dispozici
              </option>
            )}
            {internOptions.map(intern => (
              <option key={intern.id} value={intern.id}>
                {formatInternOption(intern)}
              </option>
            ))}
          </select>
        </div>
      </form>
    </Modal>
  );
}
