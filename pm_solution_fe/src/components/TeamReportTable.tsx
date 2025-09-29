import type { TeamReportTeam } from "../api";
import "./TeamReportTable.css";

type TeamReportTableProps = {
  team: TeamReportTeam;
};

function formatGroups(labels: string[]): string {
  if (labels.length === 0) return "—";
  return labels.join(", ");
}

function formatWorkload(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

export default function TeamReportTable({ team }: TeamReportTableProps) {
  const hasInterns = team.interns.length > 0;

  return (
    <article className="teamReport" aria-label={`Tým ${team.projectName}`}>
      <header className="teamReport__header">
        <h2>{team.projectName}</h2>
      </header>
      <div className="teamReport__tableWrapper">
        <table className="teamReport__table">
          <thead>
            <tr>
              <th scope="col">Stážista</th>
              <th scope="col">Úroveň</th>
              <th scope="col">Skupiny</th>
              <th scope="col" className="teamReport__numeric">Úvazek (h)</th>
            </tr>
          </thead>
          <tbody>
            {hasInterns ? (
              team.interns.map(intern => {
                const fullName = `${intern.firstName} ${intern.lastName}`.trim();
                const groups = intern.groups.map(group => group.label);
                return (
                  <tr key={intern.id}>
                    <th scope="row">{fullName || intern.username}</th>
                    <td>{intern.levelLabel}</td>
                    <td>{formatGroups(groups)}</td>
                    <td className="teamReport__numeric">{formatWorkload(intern.workloadHours)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="teamReport__empty">V týmu nejsou přiřazení žádní stážisté.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
