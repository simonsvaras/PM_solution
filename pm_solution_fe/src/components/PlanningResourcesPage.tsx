import { useEffect, useId, useMemo, useState } from 'react';
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

type ChartPoint = {
  month: number;
  value: number;
};

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
      const total = interns.reduce((sum, intern) => sum + intern.normalizedCapacity[index], 0);
      return total / interns.length;
    });
  }, [interns]);

  const chartPoints: ChartPoint[] = useMemo(
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
          a&nbsp;ostatní hodnoty se přepočítají na procenta. Do výpočtu se zahrnují pouze stážisti, kteří nemají úroveň
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
        <div className="panel__body planning-resources__chart">
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
            Procentuální hodnoty odpovídají poměru vůči individuálnímu maximu každého stážisty {selectedYearText}. Do tabulky se
            zahrnují pouze stážisti, kteří nemají úroveň „zaměstnanec“.
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

function NormalizedCapacityChart({ data, year }: { data: ChartPoint[]; year: number | null }) {
  const titleId = useId();
  const descriptionId = useId();

  const chartWidth = 860;
  const chartHeight = 360;
  const padding = { top: 24, right: 32, bottom: 56, left: 64 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const yearLabel = typeof year === 'number' ? year.toString() : null;
  const yearDescription = yearLabel ? `v roce ${yearLabel}` : 've vybraném období';
  const tooltipYear = yearLabel ?? 'vybraném období';

  const path = data.reduce((acc, point, index) => {
    const position = getPointPosition(point, innerWidth, innerHeight, padding);
    const command = `${index === 0 ? 'M' : 'L'} ${position.x} ${position.y}`;
    return acc ? `${acc} ${command}` : command;
  }, '');

  const yTicks = [0, 25, 50, 75, 100];

  return (
    <figure className="planning-resources__chartFigure">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        className="planning-resources__chartSvg"
      >
        <title id={titleId}>Průměrná normalizovaná kapacita stážistů {yearDescription}</title>
        <desc id={descriptionId}>
          Linie zobrazuje průměr normalizovaných hodin za jednotlivé měsíce {yearDescription}. Základní osa ukazuje měsíce a
          svislá osa procenta.
        </desc>
        <g className="planning-resources__chartGrid">
          {yTicks.map(tick => {
            const y = padding.top + (1 - tick / 100) * innerHeight;
            return <line key={tick} x1={padding.left} x2={padding.left + innerWidth} y1={y} y2={y} />;
          })}
        </g>
        <line
          className="planning-resources__chartAxis"
          x1={padding.left}
          y1={padding.top + innerHeight}
          x2={padding.left + innerWidth}
          y2={padding.top + innerHeight}
        />
        <line className="planning-resources__chartAxis" x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + innerHeight} />
        <g className="planning-resources__chartTicks planning-resources__chartTicks--y">
          {yTicks.map(tick => {
            const y = padding.top + (1 - tick / 100) * innerHeight;
            return (
              <g key={tick} transform={`translate(${padding.left - 12}, ${y})`}>
                <text x={-8} y={4} textAnchor="end">
                  {tick}
                </text>
              </g>
            );
          })}
        </g>
        <g className="planning-resources__chartTicks planning-resources__chartTicks--x">
          {data.map(point => {
            const { x } = getPointPosition(point, innerWidth, innerHeight, padding);
            return (
              <g key={point.month} transform={`translate(${x}, ${padding.top + innerHeight + 24})`}>
                <text textAnchor="middle">{point.month}</text>
              </g>
            );
          })}
        </g>
        {path ? <path className="planning-resources__chartLine" d={path} /> : null}
        <g className="planning-resources__chartPoints">
          {data.map(point => {
            const { x, y } = getPointPosition(point, innerWidth, innerHeight, padding);
            return (
              <circle key={point.month} cx={x} cy={y} r={6}>
                <title>
                  {`Měsíc ${point.month}/${tooltipYear}: ${percentageFormatter.format(point.value)} %`}
                </title>
              </circle>
            );
          })}
        </g>
      </svg>
      <figcaption className="planning-resources__chartCaption">
        Hodnoty vyjadřují průměrnou relativní kapacitu napříč všemi stážisty ({yearDescription}; 100&nbsp;% = jejich osobní
        maximum v daném roce).
      </figcaption>
    </figure>
  );
}

function getPointPosition(point: ChartPoint, innerWidth: number, innerHeight: number, padding: {
  top: number;
  right: number;
  bottom: number;
  left: number;
}) {
  const monthRatio = dataToRatio(point.month, MONTHS[0], MONTHS[MONTHS.length - 1]);
  const x = padding.left + monthRatio * innerWidth;
  const valueClamped = Math.min(Math.max(point.value, 0), 100);
  const y = padding.top + (1 - valueClamped / 100) * innerHeight;
  return { x, y };
}

function dataToRatio(value: number, min: number, max: number) {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

export default PlanningResourcesPage;
