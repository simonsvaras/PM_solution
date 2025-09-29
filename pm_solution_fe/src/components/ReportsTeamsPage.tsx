import { useEffect, useState } from "react";
import "./ReportsTeamsPage.css";
import TeamReportTable from "./TeamReportTable";
import { getReportTeams, type ErrorResponse, type TeamReportTeam } from "../api";

type AsyncState = "idle" | "loading" | "loaded";

export default function ReportsTeamsPage() {
  const [teams, setTeams] = useState<TeamReportTeam[]>([]);
  const [status, setStatus] = useState<AsyncState>("idle");
  const [error, setError] = useState<ErrorResponse | null>(null);

  useEffect(() => {
    setStatus("loading");
    setError(null);
    getReportTeams()
      .then(data => {
        setTeams(data);
        setStatus("loaded");
      })
      .catch(err => {
        setError(err as ErrorResponse);
        setStatus("loaded");
      });
  }, []);

  if (status !== "loaded") {
    return (
      <section className="reportsTeams">
        <p className="reportsTeams__status">Načítám složení týmů…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="reportsTeams">
        <div className="reportsTeams__error" role="alert">
          <h2>Reporty týmů se nepodařilo načíst.</h2>
          <p>{error.error.message}</p>
        </div>
      </section>
    );
  }

  if (teams.length === 0) {
    return (
      <section className="reportsTeams">
        <p className="reportsTeams__status">Zatím nejsou vytvořené žádné týmy s přiřazenými stážisty.</p>
      </section>
    );
  }

  return (
    <section className="reportsTeams" aria-label="Reporty týmů">
      <div className="reportsTeams__grid">
        {teams.map(team => (
          <TeamReportTable key={team.projectId} team={team} />
        ))}
      </div>
    </section>
  );
}
