import { useEffect, useId, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import './PlanningResourcesPage.css';
import { getInternMonthlyHours, type InternMonthlyHoursRow } from '../api';

type InternNormalizedRow = {
  id: number;
  username: string;
  name: string;
  monthlyHours: number[];
  normalizedCapacity: number[];
  maxHours: number;
};

type InternHoursAccumulator = {
  id: number;
  username: string;
  name: string;
  monthlyHours: number[];
};

type MonthlyCapacity = {
  month: number;
  value: number;
};

type AcademicBand = { from: number; to: number; color: string; alpha?: number };

type CapacityChartProps = {
  data: MonthlyCapacity[];
  bands?: AcademicBand[];
  baseline?: number;
  color?: string;
  showArea?: boolean;
  year?: number | null;
};

const DEFAULT_CHART_COLOR = '#1e40af';
const DEFAULT_BANDS: AcademicBand[] = [
  { from: 1, to: 2, color: '#fde68a', alpha: 0.2 },
  { from: 7, to: 9, color: '#bbf7d0', alpha: 0.18 },
];
const DEFAULT_BASELINE = 50;

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

const hoursFormatter = new Intl.NumberFormat('cs-CZ', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const percentageFormatter = new Intl.NumberFormat('cs-CZ', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Page that visualises the normalised intern capacity over a calendar year.
 *
 * The component loads the month-bucketed hours for each intern, normalises the
 * values per intern (their busiest month = 100 %) and renders both a line
 * chart with the averaged capacities and a detailed table with the raw data.
 */
function PlanningResourcesPage() {
  const [rows, setRows] = useState<InternMonthlyHoursRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(() => new Date().getFullYear());

  const { from, to, requestedYears } = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    return {
      from: `${previousYear}-01-01`,
      to: `${currentYear}-12-31`,
      requestedYears: [previousYear, currentYear],
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getInternMonthlyHours(from, to)
      .then(data => {
        if (cancelled) return;
        setRows(data);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Nepodařilo se načíst měsíční hodiny stážistů', err);
        if (err && typeof err === 'object' && 'error' in err) {
          const apiError = err as { error: { message?: string } };
          setError(apiError.error.message || 'Načtení měsíčních hodin stážistů selhalo.');
        } else {
          setError('Načtení měsíčních hodin stážistů selhalo.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    rows.forEach(row => {
      if (Number.isFinite(row.year)) {
        yearSet.add(row.year);
      }
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [rows]);

  const sortedYearsAsc = useMemo(() => [...availableYears].sort((a, b) => a - b), [availableYears]);

  useEffect(() => {
    if (availableYears.length === 0) {
      return;
    }
    setSelectedYear(prev => {
      if (prev && availableYears.includes(prev)) {
        return prev;
      }
      return availableYears[0];
    });
  }, [availableYears]);

  const rowsByYear = useMemo(() => {
    const map = new Map<number, InternMonthlyHoursRow[]>();
    rows.forEach(row => {
      if (!Number.isFinite(row.year)) {
        return;
      }
      const bucket = map.get(row.year) ?? [];
      bucket.push(row);
      map.set(row.year, bucket);
    });
    return map;
  }, [rows]);

  const rowsForSelectedYear = useMemo(
    () => (selectedYear != null ? rowsByYear.get(selectedYear) ?? [] : []),
    [rowsByYear, selectedYear],
  );

  const eligibleRowsForSelectedYear = useMemo(
    () => rowsForSelectedYear.filter(row => !isEmployeeLevel(row)),
    [rowsForSelectedYear],
  );

  const interns = useMemo<InternNormalizedRow[]>(() => {
    const map = new Map<number, InternHoursAccumulator>();
    eligibleRowsForSelectedYear.forEach(row => {
      const monthIndex = Number.isFinite(row.month) ? row.month - 1 : -1;
      if (Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
        return;
      }
      const existing = map.get(row.internId);
      const monthlyHours = existing?.monthlyHours ?? Array(12).fill(0);
      monthlyHours[monthIndex] = row.hours;
      const intern: InternHoursAccumulator = existing ?? {
        id: row.internId,
        username: row.username,
        name: buildInternName(row),
        monthlyHours,
      };
      map.set(row.internId, intern);
    });

    return Array.from(map.values())
      .map(intern => {
        const maxHours = intern.monthlyHours.reduce((max, value) => (value > max ? value : max), 0);
        const normalizedCapacity = intern.monthlyHours.map(value =>
          maxHours > 0 ? (value / maxHours) * 100 : 0,
        );
        return {
          ...intern,
          maxHours,
          normalizedCapacity,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  }, [eligibleRowsForSelectedYear]);

  const averageNormalizedCapacity = useMemo(() => {
    if (interns.length === 0) {
      return MONTHS.map(() => 0);
    }
    return MONTHS.map((_, index) => {
      const values = interns
        .map(intern => intern.normalizedCapacity[index])
        .filter(value => value > 0);
      if (values.length === 0) {
        return 0;
      }
      const total = values.reduce((sum, value) => sum + value, 0);
      return total / values.length;
    });
  }, [interns]);

  const chartPoints: MonthlyCapacity[] = useMemo(
    () =>
      MONTHS.map((month, index) => ({
        month,
        value: Number(averageNormalizedCapacity[index].toFixed(2)),
      })),
    [averageNormalizedCapacity],
  );

  const hasData = selectedYear != null && interns.length > 0;

  const selectedYearLabel = typeof selectedYear === 'number' ? selectedYear.toString() : null;
  const yearRangeDescription = sortedYearsAsc.length === 0
    ? 'poslední dva roky'
    : sortedYearsAsc.length === 1
      ? `rok ${sortedYearsAsc[0]}`
      : `roky ${sortedYearsAsc[0]}–${sortedYearsAsc[sortedYearsAsc.length - 1]}`;
  const yearOptions = availableYears.length > 0 ? availableYears : requestedYears;
  const disableYearButtons = availableYears.length === 0;
  const displayYearLabel = selectedYearLabel ?? '—';
  const selectedYearText = selectedYearLabel ? `v roce ${selectedYearLabel}` : 've vybraném období';

  return (
    <div className="planning-resources">
      <div className="planning-resources__introRow">
        <p className="planning-resources__intro">
          Normalizovaná kapacita vyjadřuje poměr vykázaných hodin v&nbsp;daném měsíci vůči nejvyššímu počtu hodin,
          které stážista ve vybraném roce zaznamenal. Pro každého stážistu se tedy nejvytíženější měsíc bere jako 100&nbsp;%
          a&nbsp;ostatní hodnoty se přepočítají na procenta. Měsíce bez vykázaných hodin se do průměru nezapočítávají. Do výpočtu se zahrnují pouze stážisti, kteří nemají úroveň
          „zaměstnanec“. Data jsou k&nbsp;dispozici za {yearRangeDescription}.
          Pomocí přepínače vpravo zvolte rok, pro který chcete kapacitu zobrazit.
        </p>
        <div className="planning-resources__yearSelector" role="group" aria-label="Výběr roku">
          {yearOptions.map(yearOption => {
            const isActive = selectedYear === yearOption;
            return (
              <button
                key={yearOption}
                type="button"
                className={`planning-resources__yearButton${isActive ? ' planning-resources__yearButton--active' : ''}`}
                onClick={() => setSelectedYear(yearOption)}
                aria-pressed={isActive}
                disabled={disableYearButtons}
              >
                {yearOption}
              </button>
            );
          })}
        </div>
      </div>

      <section className="panel">
        <div className="panel__body">
          <h2 className="planning-resources__sectionTitle">
            Průměrná normalizovaná kapacita {selectedYearLabel ? `(${selectedYearLabel})` : ''}
          </h2>
          {loading ? (
            <p className="planning-resources__status">Načítám data…</p>
          ) : error ? (
            <p className="planning-resources__error" role="alert">
              {error}
            </p>
          ) : hasData ? (
            <NormalizedCapacityChart data={chartPoints} year={selectedYear} />
          ) : (
            <p className="planning-resources__status">
              Pro vybraný rok zatím nejsou k&nbsp;dispozici žádné záznamy pro stážisty s&nbsp;úrovní odlišnou od „zaměstnanec“.
            </p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel__body planning-resources__tableWrapper">
          <h2 className="planning-resources__sectionTitle">
            Vykázané hodiny podle stážistů {selectedYearLabel ? `(${selectedYearLabel})` : ''}
          </h2>
          {loading ? (
            <p className="planning-resources__status">Načítám data…</p>
          ) : error ? (
            <p className="planning-resources__error" role="alert">
              {error}
            </p>
          ) : hasData ? (
            <div className="planning-resources__tableScroll" role="region" aria-live="polite">
              <table className="planning-resources__table">
                <thead>
                  <tr>
                    <th scope="col">Stážista</th>
                    {MONTHS.map(month => (
                      <th key={month} scope="col">
                        {month}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {interns.map(intern => (
                    <tr key={intern.id}>
                      <th scope="row">
                        <span className="planning-resources__internName">{intern.name}</span>
                        <span className="planning-resources__internMeta">{intern.username}</span>
                      </th>
                      {intern.monthlyHours.map((hours, index) => {
                        const percent = intern.normalizedCapacity[index];
                        const hasHours = hours > 0;
                        const monthLabel = index + 1;
                        const title = hasHours
                          ? `Měsíc ${monthLabel}/${displayYearLabel}: ${hoursFormatter.format(hours)} h (${percentageFormatter.format(percent)} %)`
                          : `Měsíc ${monthLabel}/${displayYearLabel}: bez vykázaných hodin`;
                        return (
                          <td key={index} title={title}>
                            {hasHours ? (
                              <span className="planning-resources__cellValue">
                                <span>{hoursFormatter.format(hours)}&nbsp;h</span>
                                <span className="planning-resources__cellValueSecondary">
                                  {percentageFormatter.format(percent)} %
                                </span>
                              </span>
                            ) : (
                              <span className="planning-resources__cellPlaceholder">–</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="planning-resources__status">
              Pro vybraný rok zatím nejsou k&nbsp;dispozici žádné záznamy pro stážisty s&nbsp;úrovní odlišnou od „zaměstnanec“.
            </p>
          )}
          <p className="planning-resources__note">
            Procentuální hodnoty odpovídají poměru vůči individuálnímu maximu každého stážisty {selectedYearText}; měsíce bez
            vykázaných hodin se do průměru nezapočítávají. Do tabulky se zahrnují pouze stážisti, kteří nemají úroveň „zaměstnanec“.
          </p>
        </div>
      </section>
    </div>
  );
}

function buildInternName(row: InternMonthlyHoursRow): string {
  const parts: string[] = [];
  if (row.firstName) parts.push(row.firstName);
  if (row.lastName) parts.push(row.lastName);
  if (parts.length > 0) {
    return parts.join(' ');
  }
  return row.username;
}

function normaliseLower(value: string | null | undefined, locale: string): string {
  return value ? value.toLocaleLowerCase(locale) : '';
}

function isEmployeeLevel(row: InternMonthlyHoursRow): boolean {
  const levelCode = normaliseLower(row.levelCode, 'en');
  if (levelCode === 'employee') {
    return true;
  }
  const levelLabel = normaliseLower(row.levelLabel, 'cs');
  return levelLabel === 'zaměstnanec' || levelLabel === 'zamestnanec';
}

function NormalizedCapacityChart({
  data,
  year,
  bands = DEFAULT_BANDS,
  baseline = DEFAULT_BASELINE,
  color = DEFAULT_CHART_COLOR,
  showArea = true,
}: CapacityChartProps) {
  const titleId = useId();
  const descriptionId = useId();
  const gradientId = useId();

  const chartData = useMemo(() => data.map(item => ({ ...item })), [data]);
  const dotsEnabled = chartData.length <= 24;
  const yearLabel = typeof year === 'number' ? year.toString() : null;
  const yearDescription = yearLabel ? `v roce ${yearLabel}` : 've vybraném období';

  const tooltipFormatter = (value: ValueType): [string, NameType] => {
    const numeric = typeof value === 'number' ? value : Number(value);
    const safeNumber = Number.isFinite(numeric) ? numeric : 0;
    return [`${Math.round(safeNumber)} %`, 'Kapacita'];
  };

  const tooltipLabelFormatter = (label: ValueType): string => {
    const numeric = typeof label === 'number' ? label : Number(label);
    const safeNumber = Number.isFinite(numeric) ? numeric : 0;
    return `Měsíc ${safeNumber}`;
  };

  return (
    <figure className="planning-resources__chartFigure">
      <div
        className="planning-resources__chartCanvas"
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <span id={titleId} className="planning-resources__srOnly">
          Průměrná normalizovaná kapacita stážistů {yearDescription}
        </span>
        <span id={descriptionId} className="planning-resources__srOnly">
          Čára ukazuje průměr procentuální kapacity napříč měsíci, osa X představuje měsíce 1 až 12 a osa Y rozsah 0 až 100 procent.
        </span>
        <div className="planning-resources__chartFrame">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
              <defs>
                {showArea ? (
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                ) : null}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.35)" />
              <XAxis
                dataKey="month"
                tickFormatter={(month: number) => `${month}`}
                tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                axisLine={{ stroke: 'rgba(148, 163, 184, 0.6)' }}
                tickLine={{ stroke: 'rgba(148, 163, 184, 0.6)' }}
                padding={{ left: 8, right: 8 }}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(value: number) => `${value}%`}
                tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                axisLine={{ stroke: 'rgba(148, 163, 184, 0.6)' }}
                tickLine={{ stroke: 'rgba(148, 163, 184, 0.6)' }}
                allowDecimals={false}
              />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)',
                }}
              />
              {bands.map(band => (
                <ReferenceArea
                  key={`${band.from}-${band.to}-${band.color}`}
                  x1={band.from}
                  x2={band.to}
                  y1={0}
                  y2={100}
                  fill={band.color}
                  fillOpacity={band.alpha ?? 0.18}
                />
              ))}
              {typeof baseline === 'number' ? (
                <ReferenceLine y={baseline} stroke="#94a3b8" strokeDasharray="4 4" />
              ) : null}
              {showArea ? (
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  fill={`url(#${gradientId})`}
                  strokeWidth={3}
                  dot={false}
                  isAnimationActive={false}
                />
              ) : null}
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={3}
                dot={dotsEnabled ? { r: 3, stroke: '#fff', strokeWidth: 2 } : false}
                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <figcaption className="planning-resources__chartCaption">
        Hodnoty vyjadřují průměrnou relativní kapacitu napříč všemi stážisty ({yearDescription}; 100&nbsp;% = jejich osobní
        maximum v daném roce) a nezahrnují měsíce bez vykázaných hodin.
      </figcaption>
    </figure>
  );
}

export default PlanningResourcesPage;
