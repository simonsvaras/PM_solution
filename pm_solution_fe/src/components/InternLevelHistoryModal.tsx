import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import './InternLevelHistoryModal.css';
import { type ErrorResponse, type LevelOption } from '../api';
import { normalizeLevelHistoryDraft, type LevelHistoryDraft } from './internLevelHistory';

type FormState = { levelId: number | null; validFrom: string; validTo: string };

const emptyForm: FormState = { levelId: null, validFrom: '', validTo: '' };

type InternLevelHistoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  value: LevelHistoryDraft[];
  onChange: (next: LevelHistoryDraft[]) => void;
  levels: LevelOption[];
  loading?: boolean;
  error?: ErrorResponse | null;
};

export default function InternLevelHistoryModal({
  isOpen,
  onClose,
  value,
  onChange,
  levels,
  loading = false,
  error = null,
}: InternLevelHistoryModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setForm(emptyForm);
      setEditingIndex(null);
      setLocalError(null);
      return;
    }
    if (levels.length > 0) {
      setForm(current => ({
        levelId: current.levelId ?? levels[0].id,
        validFrom: current.validFrom,
        validTo: current.validTo,
      }));
    }
  }, [isOpen, levels]);

  const sorted = useMemo(() => [...value].sort((a, b) => a.validFrom.localeCompare(b.validFrom)), [value]);
  const display = useMemo(() => [...sorted].reverse(), [sorted]);

  function resetForm() {
    setForm(prev => ({ levelId: levels[0]?.id ?? prev.levelId ?? null, validFrom: '', validTo: '' }));
    setEditingIndex(null);
    setLocalError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const nextEntry: LevelHistoryDraft = {
      levelId: form.levelId,
      validFrom: form.validFrom,
      validTo: form.validTo ? form.validTo : null,
    };
    const base = editingIndex !== null ? sorted.map((item, idx) => (idx === editingIndex ? nextEntry : item)) : [...sorted, nextEntry];
    const { error: validationError, sorted: normalized } = normalizeLevelHistoryDraft(base);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    onChange(normalized);
    resetForm();
  }

  function handleEdit(displayIndex: number) {
    const actualIndex = sorted.length - 1 - displayIndex;
    const entry = sorted[actualIndex];
    setEditingIndex(actualIndex);
    setForm({
      levelId: entry.levelId,
      validFrom: entry.validFrom,
      validTo: entry.validTo ?? '',
    });
    setLocalError(null);
  }

  function handleDelete(displayIndex: number) {
    const actualIndex = sorted.length - 1 - displayIndex;
    const next = sorted.filter((_, idx) => idx !== actualIndex);
    if (next.length === 0) {
      onChange([]);
      setLocalError('Přidejte alespoň jednu úroveň.');
      resetForm();
      return;
    }
    const { error: validationError, sorted: normalized } = normalizeLevelHistoryDraft(next);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    onChange(normalized);
    resetForm();
  }

  function handleCancelEdit() {
    resetForm();
  }

  const footer = (
    <div className="intern-level-history__footer">
      <button type="button" className="btn btn-secondary" onClick={onClose}>
        Hotovo
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Historie úrovní" footer={footer} className="intern-level-history-modal">
      <div className="intern-level-history">
        {loading && <div className="notice">Načítání historie…</div>}
        {!loading && error && <div className="errorText">{error.error.message}</div>}
        {!loading && !error && (
          <>
            <form className="intern-level-history__form" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="history-level">Úroveň</label>
                <select
                  id="history-level"
                  value={form.levelId ?? ''}
                  onChange={e => setForm(current => ({ ...current, levelId: e.target.value ? Number(e.target.value) : null }))}
                  disabled={levels.length === 0}
                >
                  {levels.length === 0 && <option value="">Žádné úrovně</option>}
                  {levels.map(level => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="history-from">Datum od</label>
                <input
                  id="history-from"
                  type="date"
                  value={form.validFrom}
                  onChange={e => setForm(current => ({ ...current, validFrom: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="history-to">Datum do</label>
                <input
                  id="history-to"
                  type="date"
                  value={form.validTo}
                  onChange={e => setForm(current => ({ ...current, validTo: e.target.value }))}
                />
                <span className="hint">Prázdné = aktuální úroveň</span>
              </div>
              <div className="field buttons">
                <button type="submit" className="btn btn-primary">
                  {editingIndex !== null ? 'Uložit změny' : 'Přidat období'}
                </button>
                {editingIndex !== null && (
                  <button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>
                    Zrušit úpravu
                  </button>
                )}
              </div>
            </form>
            {localError && <div className="errorText">{localError}</div>}
            <div className="intern-level-history__list">
              {display.length === 0 && <div className="notice">Zatím není nastavena žádná historie.</div>}
              {display.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Úroveň</th>
                      <th>Platí od</th>
                      <th>Platí do</th>
                      <th aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {display.map((entry, index) => {
                      const level = levels.find(l => l.id === entry.levelId);
                      return (
                        <tr key={`${entry.levelId}-${entry.validFrom}-${entry.validTo ?? 'open'}`}>
                          <td>{level ? level.label : entry.levelId}</td>
                          <td>{entry.validFrom}</td>
                          <td>{entry.validTo ?? 'aktuálně'}</td>
                          <td className="intern-level-history__actions">
                            <button type="button" className="link-button" onClick={() => handleEdit(index)}>
                              Upravit
                            </button>
                            <button type="button" className="link-button link-button--danger" onClick={() => handleDelete(index)}>
                              Smazat
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
