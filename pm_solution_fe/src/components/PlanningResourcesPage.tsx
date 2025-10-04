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
  const [year] = useState(() => new Date().getFullYear());
  const [rows, setRows] = useState<InternMonthlyHoursRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

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

  const interns = useMemo<InternNormalizedRow[]>(() => {
    const map = new Map<number, InternHoursAccumulator>();
    rows.forEach(row => {
      const month = Number.parseInt(row.monthStart.slice(5, 7), 10);
      if (Number.isNaN(month) || month < 1 || month > 12) {
        return;
      }
      const existing = map.get(row.internId);
      const monthlyHours = existing?.monthlyHours ?? Array(12).fill(0);
      monthlyHours[month - 1] += row.hours;
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
  }, [rows]);

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

  const hasData = rows.length > 0;

  return (
    <div className="planning-resources">
      <p className="planning-resources__intro">
        Normalizovaná kapacita vyjadřuje poměr vykázaných hodin v daném měsíci vůči nejvyššímu počtu hodin,
        které stážista v&nbsp;roce {year} zaznamenal. Pro každého stážistu se tedy nejvytíženější měsíc bere jako 100&nbsp;%
        a&nbsp;ostatní hodnoty se přepočítají na procenta. Graf zobrazuje průměr těchto hodnot napříč stážisty.
      </p>

      <section className="panel">
        <div className="panel__body planning-resources__chart">
          <h2 className="planning-resources__sectionTitle">Průměrná normalizovaná kapacita</h2>
          {loading ? (
            <p className="planning-resources__status">Načítám data…</p>
          ) : error ? (
            <p className="planning-resources__error" role="alert">
              {error}
            </p>
          ) : hasData ? (
            <NormalizedCapacityChart data={chartPoints} />
          ) : (
            <p className="planning-resources__status">Pro zadané období zatím nejsou k&nbsp;dispozici žádné záznamy.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel__body planning-resources__tableWrapper">
          <h2 className="planning-resources__sectionTitle">Vykázané hodiny podle stážistů</h2>
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
                        const title = hasHours
                          ? `Měsíc ${index + 1}: ${hoursFormatter.format(hours)} h (${percentageFormatter.format(percent)} %)`
                          : `Měsíc ${index + 1}: bez vykázaných hodin`;
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
            <p className="planning-resources__status">Tabulka se zobrazí po načtení dat.</p>
          )}
          <p className="planning-resources__note">
            Procentuální hodnoty odpovídají poměru vůči individuálnímu maximu každého stážisty v&nbsp;roce {year}.
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

function NormalizedCapacityChart({ data }: { data: ChartPoint[] }) {
  const titleId = useId();
  const descriptionId = useId();

  const chartWidth = 860;
  const chartHeight = 360;
  const padding = { top: 24, right: 32, bottom: 56, left: 64 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

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
        <title id={titleId}>Průměrná normalizovaná kapacita stážistů dle měsíců</title>
        <desc id={descriptionId}>
          Linie zobrazuje průměr normalizovaných hodin za jednotlivé měsíce. Základní osa ukazuje měsíce a svislá osa procenta.
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
                  {`Měsíc ${point.month}: ${percentageFormatter.format(point.value)} %`}
                </title>
              </circle>
            );
          })}
        </g>
      </svg>
      <figcaption className="planning-resources__chartCaption">
        Hodnoty vyjadřují průměrnou relativní kapacitu napříč všemi stážisty (100&nbsp;% = jejich osobní maximum v daném roce).
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
