import { useEffect, useMemo, useState } from 'react';
import './InternPerformancePage.css';
import {
  getGroups,
  getInternPerformance,
  listAllInterns,
  type ErrorResponse,
  type GroupOption,
  type Intern,
  type InternPerformanceParams,
  type InternPerformanceResponse,
} from '../api';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type ChartDatum = {
  username: string;
  label: string;
} & Record<string, number | string>;

const BAR_COLORS = ['#2563eb', '#ea580c', '#16a34a', '#7c3aed', '#ef4444'];

export default function InternPerformancePage() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [periods, setPeriods] = useState(2);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [interns, setInterns] = useState<Intern[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [referenceError, setReferenceError] = useState<ErrorResponse | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set());
  const [selectedInternIds, setSelectedInternIds] = useState<Set<number>>(new Set());
  const [selectAllInterns, setSelectAllInterns] = useState(true);
  const [internSearch, setInternSearch] = useState('');
  const [performance, setPerformance] = useState<InternPerformanceResponse | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState<ErrorResponse | null>(null);

  useEffect(() => {
    setReferenceLoading(true);
    setReferenceError(null);
    Promise.all([
      getGroups(),
      listAllInterns('last_name,asc'),
    ])
      .then(([groupOptions, internList]) => {
        setGroups(groupOptions);
        setInterns(internList);
      })
      .catch(err => setReferenceError(err as ErrorResponse))
      .finally(() => setReferenceLoading(false));
  }, []);

  const groupFilteredInterns = useMemo(() => {
    if (selectedGroupIds.size === 0) return interns;
    const allowed = selectedGroupIds;
    return interns.filter(intern => intern.groups.some(group => allowed.has(group.id)));
  }, [interns, selectedGroupIds]);

  useEffect(() => {
    if (selectAllInterns) return;
    const allowed = new Set(groupFilteredInterns.map(intern => intern.id));
    setSelectedInternIds(prev => {
      let changed = false;
      const next = new Set<number>();
      prev.forEach(id => {
        if (allowed.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [groupFilteredInterns, selectAllInterns]);

  const filteredInterns = useMemo(() => {
    const term = internSearch.trim().toLowerCase();
    if (!term) return groupFilteredInterns;
    return groupFilteredInterns.filter(intern => {
      const haystack = `${intern.firstName} ${intern.lastName} ${intern.username}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [groupFilteredInterns, internSearch]);

  const selectedInternIdList = useMemo(() => {
    return Array.from(selectedInternIds).sort((a, b) => a - b);
  }, [selectedInternIds]);

  const selectedGroupIdList = useMemo(() => {
    return Array.from(selectedGroupIds).sort((a, b) => a - b);
  }, [selectedGroupIds]);

  useEffect(() => {
    if (referenceLoading || referenceError) {
      return;
    }
    if (!selectAllInterns && selectedInternIdList.length === 0) {
      setPerformance(null);
      setPerformanceError(null);
      setPerformanceLoading(false);
      return;
    }
    const payload: InternPerformanceParams = { period, periods };
    if (!selectAllInterns && selectedInternIdList.length > 0) {
      payload.internIds = selectedInternIdList;
    }
    if (selectedGroupIdList.length > 0) {
      payload.groupIds = selectedGroupIdList;
    }
    setPerformanceLoading(true);
    setPerformanceError(null);
    getInternPerformance(payload)
      .then(data => {
        setPerformance(data);
      })
      .catch(err => setPerformanceError(err as ErrorResponse))
      .finally(() => setPerformanceLoading(false));
  }, [period, periods, selectAllInterns, selectedInternIdList, selectedGroupIdList, referenceLoading, referenceError]);

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2, minimumFractionDigits: 0 }),
    [],
  );

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!performance) return [];
    return performance.interns.map(intern => {
      const entry: ChartDatum = {
        username: intern.username,
        label: buildInternLabel(intern.firstName, intern.lastName, intern.username),
      };
      performance.buckets.forEach((_, index) => {
        entry[`period${index}`] = intern.hours[index] ?? 0;
      });
      return entry;
    });
  }, [performance]);

  const hasAnyHours = useMemo(() => {
    if (!performance) return false;
    return performance.interns.some(intern => intern.hours.some(value => value > 0));
  }, [performance]);

  const controlsDisabled = referenceLoading;
  const groupFilterActive = selectedGroupIds.size > 0;
  const internSelectionCount = selectAllInterns ? groupFilteredInterns.length : selectedInternIds.size;
  const selectionSummary = selectAllInterns
    ? `Všichni (${groupFilteredInterns.length})`
    : `${internSelectionCount} z ${groupFilteredInterns.length}`;
  const periodLabel = period === 'week' ? 'týdny' : 'měsíce';

  function handlePeriodChange(next: 'week' | 'month') {
    setPeriod(next);
  }

  function handlePeriodsChange(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(Math.round(parsed), 2), 5);
    setPeriods(clamped);
  }

  function toggleGroup(id: number) {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function clearGroupFilter() {
    setSelectedGroupIds(new Set());
  }

  function toggleIntern(id: number) {
    setSelectedInternIds(prev => {
      if (selectAllInterns) {
        const next = new Set<number>();
        groupFilteredInterns.forEach(intern => {
          if (intern.id !== id) {
            next.add(intern.id);
          }
        });
        setSelectAllInterns(false);
        return next;
      }
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) {
          return next;
        }
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSelectAllInterns() {
    setSelectAllInterns(true);
    setSelectedInternIds(new Set());
  }

  function handleClearInternSelection() {
    setSelectAllInterns(false);
    setSelectedInternIds(new Set());
  }

  function formatHours(value: number): string {
    return `${numberFormatter.format(value)} h`;
  }

  return (
    <div className="internPerformance">
      <section className="internPerformance__controlsCard">
        <header className="internPerformance__sectionHeader">
          <div>
            <h2 className="internPerformance__title">Nastavení zobrazení</h2>
            <p className="internPerformance__subtitle">
              Vyberte, jaká období a stážisty chcete porovnat. Data se načítají automaticky při změně filtrů.
            </p>
          </div>
        </header>
        {referenceError ? (
          <div className="internPerformance__error" role="alert">
            <p>Nepodařilo se načíst referenční data. Zkuste prosím akci opakovat později.</p>
            <pre>{referenceError.error?.message ?? 'Neznámá chyba.'}</pre>
          </div>
        ) : null}
        <div className="internPerformance__grid">
          <fieldset className="internPerformance__fieldset" disabled={controlsDisabled}>
            <legend>Typ období</legend>
            <div className="internPerformance__radioGroup">
              <label>
                <input
                  type="radio"
                  name="performance-period"
                  value="week"
                  checked={period === 'week'}
                  onChange={() => handlePeriodChange('week')}
                />
                Týdny
              </label>
              <label>
                <input
                  type="radio"
                  name="performance-period"
                  value="month"
                  checked={period === 'month'}
                  onChange={() => handlePeriodChange('month')}
                />
                Měsíce
              </label>
            </div>
          </fieldset>

          <div className="internPerformance__inputGroup">
            <label htmlFor="performance-periods">Počet období</label>
            <input
              id="performance-periods"
              type="number"
              min={2}
              max={5}
              value={periods}
              onChange={event => handlePeriodsChange(event.target.value)}
              disabled={controlsDisabled}
            />
            <p className="internPerformance__hint">
              Porovnává se posledních {periods} {periodLabel} včetně aktuálního.
            </p>
          </div>

          <fieldset className="internPerformance__fieldset" disabled={controlsDisabled}>
            <legend>Skupiny</legend>
            <div className="internPerformance__groupActions">
              <span className="internPerformance__filterSummary">
                {groupFilterActive ? `${selectedGroupIds.size} vybraných skupin` : 'Všechny skupiny'}
              </span>
              <button
                type="button"
                className="internPerformance__textButton"
                onClick={clearGroupFilter}
                disabled={!groupFilterActive}
              >
                Zrušit filtr
              </button>
            </div>
            <div className="internPerformance__groupList">
              {groups.length === 0 ? (
                <p className="internPerformance__placeholder">
                  {referenceLoading ? 'Načítám dostupné skupiny…' : 'Žádné skupiny nejsou k dispozici.'}
                </p>
              ) : (
                groups.map(group => {
                  const checked = selectedGroupIds.has(group.id);
                  return (
                    <label key={group.id} className="internPerformance__checkboxLabel">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGroup(group.id)}
                      />
                      <span>{group.label}</span>
                    </label>
                  );
                })
              )}
            </div>
          </fieldset>

          <fieldset className="internPerformance__fieldset internPerformance__fieldset--interns" disabled={controlsDisabled}>
            <legend>Stážisti</legend>
            <div className="internPerformance__internHeader">
              <span className="internPerformance__filterSummary">{selectionSummary}</span>
              <div className="internPerformance__internActions">
                <button
                  type="button"
                  className="internPerformance__textButton"
                  onClick={handleSelectAllInterns}
                  disabled={selectAllInterns || groupFilteredInterns.length === 0}
                >
                  Vybrat všechny
                </button>
                <button
                  type="button"
                  className="internPerformance__textButton"
                  onClick={handleClearInternSelection}
                  disabled={!selectAllInterns && selectedInternIds.size === 0}
                >
                  Vymazat výběr
                </button>
              </div>
            </div>
            <label className="internPerformance__searchLabel" htmlFor="performance-search">
              <span className="internPerformance__searchCaption">Hledat stážistu</span>
              <input
                id="performance-search"
                type="search"
                placeholder="Jméno nebo username"
                value={internSearch}
                onChange={event => setInternSearch(event.target.value)}
                disabled={controlsDisabled}
              />
            </label>
            <div className="internPerformance__internList" role="group" aria-label="Výběr stážistů">
              {filteredInterns.length === 0 ? (
                <p className="internPerformance__placeholder">
                  {groupFilteredInterns.length === 0
                    ? 'Žádní stážisti neodpovídají zvoleným skupinám.'
                    : 'Nenalezeni žádní stážisti podle zadaného hledání.'}
                </p>
              ) : (
                filteredInterns.map(intern => {
                  const isChecked = selectAllInterns || selectedInternIds.has(intern.id);
                  return (
                    <label key={intern.id} className="internPerformance__checkboxLabel">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleIntern(intern.id)}
                      />
                      <span>
                        {buildInternLabel(intern.firstName, intern.lastName, intern.username)}
                        <small>@{intern.username}</small>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </fieldset>
        </div>
      </section>

      <section className="internPerformance__chartCard">
        <header className="internPerformance__sectionHeader">
          <div>
            <h2 className="internPerformance__title">Porovnání výkonu</h2>
            <p className="internPerformance__subtitle">
              Sloupce na ose X reprezentují jednotlivé stážisty. Každé období je znázorněno samostatnou barvou.
            </p>
          </div>
        </header>
        {performanceLoading ? (
          <p className="internPerformance__status">Načítám data…</p>
        ) : performanceError ? (
          <div className="internPerformance__error" role="alert">
            <p>Nepodařilo se načíst data o výkonech stážistů.</p>
            <pre>{performanceError.error?.message ?? 'Neznámá chyba.'}</pre>
          </div>
        ) : !performance ? (
          <p className="internPerformance__status">Vyberte alespoň jednoho stážistu pro zobrazení grafu.</p>
        ) : chartData.length === 0 ? (
          <p className="internPerformance__status">Žádná data pro zobrazení.</p>
        ) : hasAnyHours ? (
          <div className="internPerformance__chartWrapper">
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 8 }} barGap={12}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="username" tickFormatter={value => `@${value as string}`} interval={0} angle={-15} dy={10} />
                <YAxis tickFormatter={value => numberFormatter.format(value as number)} />
                <Tooltip
                  formatter={(value, name) => [
                    formatHours(typeof value === 'number' ? value : Number(value)),
                    name as string,
                  ]}
                  labelFormatter={value => `@${value as string}`}
                />
                <Legend />
                {performance.buckets.map((bucket, index) => (
                  <Bar
                    key={bucket.index}
                    dataKey={`period${index}`}
                    name={bucket.label}
                    fill={BAR_COLORS[index % BAR_COLORS.length]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="internPerformance__status">
            Stážisti nemají v posledních {periods} {periodLabel} vykázané žádné hodiny.
          </p>
        )}
        {performance && performance.buckets.length > 0 ? (
          <ul className="internPerformance__bucketList">
            {performance.buckets.map(bucket => (
              <li key={bucket.index}>
                <span className="internPerformance__bucketSwatch" style={{ backgroundColor: BAR_COLORS[bucket.index % BAR_COLORS.length] }} />
                <span>{bucket.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function buildInternLabel(firstName: string, lastName: string, username: string): string {
  const combined = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return combined.length > 0 ? combined : `@${username}`;
}
