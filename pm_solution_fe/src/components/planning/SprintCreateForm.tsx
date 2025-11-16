import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import './SprintCreateForm.css';
import {
  createProjectSprint,
  type CreateProjectSprintPayload,
  type ErrorResponse,
  type ProjectSprint,
} from '../../api';
import { getCurrentSprintQueryKey, getProjectWeeksQueryKey } from './queryKeys';

export type SprintCreateFormProps = {
  projectId: number;
  onSuccess?: (sprint: ProjectSprint) => void;
};

function normalisePayload(values: { name: string; deadline: string }): CreateProjectSprintPayload {
  const trimmedName = values.name.trim();
  const deadline = values.deadline.trim();
  return {
    name: trimmedName,
    deadline: deadline.length > 0 ? deadline : null,
  };
}

export default function SprintCreateForm({ projectId, onSuccess }: SprintCreateFormProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<ErrorResponse | null>(null);

  const mutation = useMutation<ProjectSprint, ErrorResponse, CreateProjectSprintPayload>({
    mutationFn: payload => createProjectSprint(projectId, payload),
    onMutate: () => {
      setError(null);
    },
    onSuccess: sprint => {
      setName('');
      setDeadline('');
      setTouched(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: getCurrentSprintQueryKey(projectId) });
      queryClient.invalidateQueries({ queryKey: getProjectWeeksQueryKey(projectId, null) });
      queryClient.invalidateQueries({ queryKey: getProjectWeeksQueryKey(projectId, sprint.id ?? null) });
      onSuccess?.(sprint);
    },
    onError: err => {
      setError(err);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (name.trim().length === 0 || mutation.isPending) {
      return;
    }
    void mutation.mutateAsync(normalisePayload({ name, deadline }));
  }

  const showNameError = touched && name.trim().length === 0;

  return (
    <form className="sprintCreateForm" onSubmit={handleSubmit} noValidate>
      <div className="sprintCreateForm__header">
        <h3 className="sprintCreateForm__title">Začněte novým sprintem</h3>
        <p className="sprintCreateForm__description">
          Sprint sjednotí plánování týdnů i přehled úkolů. Stačí pojmenovat aktuální období a případně nastavit deadline.
        </p>
      </div>
      <div className="sprintCreateForm__fields">
        <label className="sprintCreateForm__field">
          <span>Název sprintu*</span>
          <input
            type="text"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Např. Q1 fokus"
            aria-invalid={showNameError}
            aria-describedby="sprint-name-error"
            required
          />
          {showNameError && (
            <span id="sprint-name-error" className="sprintCreateForm__error" role="alert">
              Název sprintu je povinný.
            </span>
          )}
        </label>
        <label className="sprintCreateForm__field">
          <span>Deadline (volitelné)</span>
          <input
            type="date"
            value={deadline}
            onChange={event => setDeadline(event.target.value)}
          />
        </label>
      </div>
      {error && (
        <p className="sprintCreateForm__error sprintCreateForm__error--inline" role="alert">
          Sprint se nepodařilo vytvořit. {error.error?.message ?? ''}
        </p>
      )}
      <div className="sprintCreateForm__actions">
        <button type="submit" className="sprintCreateForm__submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Vytvářím…' : 'Vytvořit sprint'}
        </button>
      </div>
    </form>
  );
}
