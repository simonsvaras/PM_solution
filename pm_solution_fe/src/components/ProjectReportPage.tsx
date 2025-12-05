import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import './ProjectReportPage.css';
import TeamReportTable from './TeamReportTable';
import type { ProjectOverviewDTO, SyncSummary, TeamReportTeam, ErrorResponse, ProjectCapacityReport } from '../api';
import { getProjectCapacity, getReportTeams, syncProjectReportsAsync, syncProjectMilestones, syncProjectIssues } from '../api';
import BudgetBurnIndicator from './BudgetBurnIndicator';
import ProjectSettingsModal from './ProjectSettingsModal';

type ProjectReportPageProps = {
  project: ProjectOverviewDTO;
  namespaceId: number | null;
  namespaceName: string | null;
  onShowDetail: () => void;
  onProjectUpdated: (next: ProjectOverviewDTO) => void;
};

/**
 * Page displaying project level metrics together with the controls for triggering
 * report synchronisation.
 */
export default function ProjectReportPage({
  project,
  namespaceId,
  namespaceName,
  onShowDetail,
  onProjectUpdated,
}: ProjectReportPageProps) {
  const [sinceLast, setSinceLast] = useState(true);
  const [fromValue, setFromValue] = useState('');
  const [toValue, setToValue] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ processed: number; total: number } | null>(null);
  const [issueSinceLast, setIssueSinceLast] = useState(true);
  const [issueSinceValue, setIssueSinceValue] = useState('');
  const [issueFullHistory, setIssueFullHistory] = useState(false);
  const [issueSyncing, setIssueSyncing] = useState(false);
  const [issueSyncError, setIssueSyncError] = useState<string | null>(null);
  const [issueSyncSummary, setIssueSyncSummary] = useState<SyncSummary | null>(null);
  const [team, setTeam] = useState<TeamReportTeam | null>(null);
  const [teamStatus, setTeamStatus] = useState<'idle' | 'loading' | 'loaded'>('idle');
  const [teamError, setTeamError] = useState<ErrorResponse | null>(null);
  const [teamReloadToken, setTeamReloadToken] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentProject, setCurrentProject] = useState<ProjectOverviewDTO>(project);
  const [milestoneSyncing, setMilestoneSyncing] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [milestoneSummary, setMilestoneSummary] = useState<SyncSummary | null>(null);
  const [capacityReport, setCapacityReport] = useState<ProjectCapacityReport | null>(null);
  const [capacityStatus, setCapacityStatus] = useState<'idle' | 'loading' | 'loaded'>('idle');
  const [capacityError, setCapacityError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentProject(project);
  }, [project]);

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    [],
  );
  const dateTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'short', timeStyle: 'short' }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setCapacityStatus('loading');
    setCapacityError(null);
    setCapacityReport(null);

    getProjectCapacity(project.id)
      .then(report => {
        if (cancelled) return;
        setCapacityReport(report);
        setCapacityStatus('loaded');
      })
      .catch(err => {
        if (cancelled) return;
        const error = err as ErrorResponse;
        const httpStatus = error?.error?.httpStatus;
        if (httpStatus === 404) {
          // No status has been reported for the project yet – treat as empty state.
          setCapacityReport(null);
          setCapacityStatus('loaded');
          return;
        }
        setCapacityError(error?.error?.message ?? 'Aktuální stav kapacit se nepodařilo načíst.');
        setCapacityStatus('loaded');
      });

    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const capacityReportedAt = (() => {
    if (!capacityReport?.reportedAt) return null;
    const date = new Date(capacityReport.reportedAt);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  })();
  const capacityReportedAtLabel = capacityReportedAt ? dateTimeFormatter.format(capacityReportedAt) : null;
  const capacityStatuses = capacityReport?.statuses ?? [];

  useEffect(() => {
    let cancelled = false;
    setTeamStatus('loading');
    setTeamError(null);
    setTeam(null);

    getReportTeams()
      .then(teams => {
        if (cancelled) return;
        const matchedTeam = teams.find(item => item.projectId === project.id) ?? null;
        setTeam(matchedTeam);
        setTeamStatus('loaded');
        if (matchedTeam) {
          setCurrentProject(prev =>
            prev.id === project.id
              ? { ...prev, teamMembers: matchedTeam.interns.length }
              : prev,
          );
        }
      })
      .catch(err => {
        if (cancelled) return;
        setTeamError(err as ErrorResponse);
        setTeamStatus('loaded');
      });

    return () => {
      cancelled = true;
    };
  }, [project.id, teamReloadToken]);

  const teamTitle = team?.projectName ?? currentProject.name;
  const teamErrorMessage = teamError?.error?.message ?? 'Report týmu se nepodařilo načíst.';

  const teamCard = (() => {
    if (teamStatus !== 'loaded') {
      return (
        <article className="teamReport" aria-busy="true" aria-label={`Tým ${teamTitle}`}>
          <header className="teamReport__header">
            <h2>{teamTitle}</h2>
          </header>
          <div className="teamReport__tableWrapper">
            <p className="teamReport__message">Načítám složení týmu…</p>
          </div>
        </article>
      );
    }

    if (teamError) {
      return (
        <article className="teamReport" role="alert" aria-label={`Tým ${teamTitle}`}>
          <header className="teamReport__header">
            <h2>{teamTitle}</h2>
          </header>
          <div className="teamReport__tableWrapper">
            <p className="teamReport__message teamReport__message--error">{teamErrorMessage}</p>
          </div>
        </article>
      );
    }

    if (team) {
      return <TeamReportTable team={team} />;
    }

    return (
      <article className="teamReport" aria-label={`Tým ${teamTitle}`}>
        <header className="teamReport__header">
          <h2>{teamTitle}</h2>
        </header>
        <div className="teamReport__tableWrapper">
          <p className="teamReport__message">V projektu nejsou přiřazení žádní stážisté.</p>
        </div>
      </article>
    );
  })();

  function toIsoOrUndefined(value: string): string | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  }

  // Validates the current form state and triggers the backend synchronisation endpoint.
  async function handleSync() {
    setSyncError(null);
    setSyncSummary(null);
    setSyncProgress(null);
    if (!sinceLast && !fromValue) {
      setSyncError('Vyplňte datum "Od" nebo synchronizujte od poslední synchronizace.');
      return;
    }
    if (!sinceLast && fromValue && toValue) {
      const fromDate = new Date(fromValue);
      const toDate = new Date(toValue);
      if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime()) && toDate < fromDate) {
        setSyncError('Datum "Do" nesmí být dříve než datum "Od".');
        return;
      }
    }

    setSyncing(true);
    try {
      const payload = {
        sinceLast,
        from: sinceLast ? undefined : toIsoOrUndefined(fromValue),
        to: sinceLast ? undefined : toIsoOrUndefined(toValue),
      };
      const result = await syncProjectReportsAsync(project.id, payload, (processed, total) => {
        setSyncProgress({ processed, total });
      });
      setSyncSummary(result);
    } catch (err) {
      const error = err as ErrorResponse;
      const message = error?.error?.message || 'Synchronizaci se nepodařilo dokončit.';
      setSyncError(message);
    } finally {
      setSyncProgress(null);
      setSyncing(false);
    }
  }

  async function handleIssueSync() {
    setIssueSyncError(null);
    setIssueSyncSummary(null);
    let sinceIso: string | undefined;
    if (!issueFullHistory) {
      if (!issueSinceLast && !issueSinceValue) {
        setIssueSyncError('Vyplňte datum "Od" pro synchronizaci issues.');
        return;
      }
      sinceIso = issueSinceLast ? undefined : toIsoOrUndefined(issueSinceValue);
      if (!issueSinceLast && !sinceIso) {
        setIssueSyncError('Datum "Od" musí být ve správném formátu.');
        return;
      }
    }
    setIssueSyncing(true);
    try {
      const summary = await syncProjectIssues(project.id, {
        sinceLast: issueFullHistory ? false : issueSinceLast,
        since: issueFullHistory ? undefined : sinceIso,
      });
      setIssueSyncSummary(summary);
    } catch (err) {
      const error = err as ErrorResponse;
      const message = error?.error?.message ?? 'Synchronizaci issues se nepodařilo dokončit.';
      setIssueSyncError(message);
    } finally {
      setIssueSyncing(false);
    }
  }

  // When toggling the "since last" switch we clear the manual range to avoid inconsistent UI state.
  function handleToggleSinceLast(event: ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked;
    setSinceLast(checked);
    if (checked) {
      setFromValue('');
      setToValue('');
    }
  }

  function handleToggleIssueSinceLast(event: ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked;
    setIssueSinceLast(checked);
    if (checked) {
      setIssueSinceValue('');
    }
  }

  function handleToggleIssueFullHistory(event: ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked;
    setIssueFullHistory(checked);
    if (checked) {
      setIssueSinceValue('');
      setIssueSinceLast(false);
    }
  }

  function handleProjectSettingsSaved(next: ProjectOverviewDTO) {
    setCurrentProject(next);
    onProjectUpdated(next);
  }

  function handleTeamUpdated() {
    setTeamReloadToken(token => token + 1);
  }

  async function handleMilestoneSync() {
    if (namespaceId == null) {
      setMilestoneError('Projekt nemá přiřazený namespace pro synchronizaci milníků.');
      return;
    }
    setMilestoneError(null);
    setMilestoneSummary(null);
    setMilestoneSyncing(true);
    try {
      const summary = await syncProjectMilestones(namespaceId);
      setMilestoneSummary(summary);
    } catch (err) {
      const error = err as ErrorResponse;
      const message = error?.error?.message ?? 'Synchronizaci milníků se nepodařilo dokončit.';
      setMilestoneError(message);
    } finally {
      setMilestoneSyncing(false);
    }
  }

  const milestoneNamespaceMessage = namespaceName
    ? `Milestones pro projekt jsou z namespace ${namespaceName}.`
    : 'Projekt nemá přiřazený namespace pro synchronizaci milníků.';

  return (
    <>
      <div className="projectReport__toolbar">
        <div className="projectReport__toolbarActions">
          <button type="button" className="projectReport__detailButton" onClick={onShowDetail}>
            Zobrazit detailní report
          </button>
          <button
            type="button"
            className="projectReport__settingsButton"
            onClick={() => setIsSettingsOpen(true)}
          >
            Nastavení projektu
          </button>
        </div>
      </div>
      <div className="projectReportPage">
        <div className="projectReportPage__sidebar">
          {teamCard}
          <section className="projectReport__card projectReport__milestoneCard" aria-label="Synchronizace milníků">
            <h2>Milníky</h2>
            <p className="projectReport__milestoneDescription">{milestoneNamespaceMessage}</p>
            {milestoneError ? (
              <p className="projectReport__status projectReport__status--error">{milestoneError}</p>
            ) : null}
            {milestoneSummary ? (
              <p className="projectReport__status projectReport__status--success">
                Načteno {milestoneSummary.fetched} milníků, vloženo {milestoneSummary.inserted}, aktualizováno{' '}
                {milestoneSummary.updated}, přeskočeno {milestoneSummary.skipped}. Trvalo {milestoneSummary.durationMs} ms.
              </p>
            ) : null}
            <button
              type="button"
              className="projectReport__syncButton"
              onClick={handleMilestoneSync}
              disabled={milestoneSyncing || namespaceId == null}
            >
              {milestoneSyncing ? 'Synchronizuji…' : 'Synchronizovat milníky'}
            </button>
          </section>
           <section className="projectReport__card projectReport__issuesCard" aria-label="Synchronizace issues">

            <h2>Issues</h2>

            <p className="projectReport__issueDescription">

              Sputť synchronizaci, která z GitLabu načte aktuální stav issues pro všechny repozitáře projektu.

            </p>

            <label className="projectReport__checkbox">

              <input type="checkbox" checked={issueFullHistory} onChange={handleToggleIssueFullHistory} />

              Synchronizovat veškerou historii

            </label>

            <label className="projectReport__checkbox">

              <input

                type="checkbox"

                checked={issueSinceLast}

                onChange={handleToggleIssueSinceLast}

                disabled={issueFullHistory}

              />

              Synchronizovat jen issues změněně od poslední synchronizace

            </label>

            <div className="projectReport__range projectReport__range--single" aria-disabled={issueSinceLast || issueFullHistory}>

              <label>

                <span>Od</span>

                <input

                  type="datetime-local"

                  value={issueSinceValue}

                  onChange={event => setIssueSinceValue(event.target.value)}

                  disabled={issueSinceLast || issueFullHistory}

                />

              </label>

            </div>

            {issueSyncError ? <p className="projectReport__status projectReport__status--error">{issueSyncError}</p> : null}

            {issueSyncSummary ? (

              <p className="projectReport__status projectReport__status--success">

                Načteno {issueSyncSummary.fetched} issues, vloženo {issueSyncSummary.inserted}, aktualizováno{' '}

                {issueSyncSummary.updated}.

              </p>

            ) : null}

            <button

              type="button"

              className="projectReport__syncButton"

              onClick={handleIssueSync}

              disabled={issueSyncing}

            >

              {issueSyncing ? 'Synchronizuji?' : 'Synchronizovat issues'}

            </button>

          </section>

       </div>
        <section className="projectReport" aria-label={`Report projektu ${currentProject.name}`}>
          <div className="projectReport__card projectReport__overviewCard">
            <div className="projectReport__overviewHeader">
              <h2>Otevřené issue</h2>
              <p className="projectReport__metric">{currentProject.openIssues}</p>
            </div>
            <BudgetBurnIndicator
              budget={currentProject.budget}
              reportedCost={currentProject.reportedCost}
              currencyFormatter={currencyFormatter}
            />
          </div>
          <div className="projectReport__card projectReport__syncCard">
            <div className="projectReport__syncHeader">
              <h2>Synchronizace výkazů</h2>
              <p className="projectReport__syncDescription">
                Spusť synchronizaci, která načte timelogy ze všech repozitářů přiřazených k projektu a uloží je do databáze.
              </p>
              <p className="projectReport__note">Výkazy se synchronizují jen pro uživatele, kteří jsou v systému vytvořeni.</p>
            </div>
            <label className="projectReport__checkbox">
              <input type="checkbox" checked={sinceLast} onChange={handleToggleSinceLast} />
              Synchronizovat data jen od poslední synchronizace
            </label>
            <div className="projectReport__range" aria-disabled={sinceLast}>
              <label>
                <span>Od</span>
                <input
                  type="datetime-local"
                  value={fromValue}
                  onChange={event => setFromValue(event.target.value)}
                  disabled={sinceLast}
                />
              </label>
              <label>
                <span>Do</span>
                <input
                  type="datetime-local"
                  value={toValue}
                  onChange={event => setToValue(event.target.value)}
                  disabled={sinceLast}
                />
              </label>
            </div>
            {syncError ? <p className="projectReport__status projectReport__status--error">{syncError}</p> : null}
            {syncing && syncProgress && syncProgress.total > 0 ? (
              <p className="projectReport__status projectReport__status--info">
                Synchronizuji repozit??e: {syncProgress.processed}/{syncProgress.total}
              </p>
            ) : null}
            {syncSummary ? (
              <p className="projectReport__status projectReport__status--success">
                Načteno {syncSummary.fetched} záznamů, vloženo {syncSummary.inserted}, přeskočeno {syncSummary.skipped}. Trvalo{' '}
                {syncSummary.durationMs} ms.
              </p>
            ) : null}
            {syncSummary && syncSummary.missingUsernames.length > 0 ? (
              <div className="projectReport__missing">
                <p className="projectReport__missingTitle">
                  Výkazy se nepodařilo uložit pro tyto uživatele (nenalezeni v systému):
                </p>
                <ul className="projectReport__missingList">
                  {syncSummary.missingUsernames.map(username => (
                    <li key={username}>{username}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button
              type="button"
              className="projectReport__syncButton"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? 'Synchronizuji…' : 'Synchronizovat výkazy'}
            </button>
          </div>
          <div className="projectReport__card projectReport__capacityCard">
            <div className="projectReport__capacityHeader">
              <h2>Aktuální stav kapacit</h2>
              {capacityReport && capacityReportedAtLabel ? (
                <p className="projectReport__capacityMeta">
                  Naposledy hlášeno {capacityReportedAtLabel}
                </p>
              ) : null}
            </div>
            {capacityStatus === 'loading' ? (
              <p className="projectReport__capacityLoading">Načítám aktuální stav…</p>
            ) : null}
            {capacityError ? (
              <p className="projectReport__status projectReport__status--error">{capacityError}</p>
            ) : null}
            {!capacityError && capacityStatus === 'loaded' && !capacityReport ? (
              <p className="projectReport__capacityEmpty">Pro projekt zatím není nahlášen žádný stav kapacit.</p>
            ) : null}
            {capacityReport ? (
              <>
                <ul className="projectReport__capacityStatusList">
                  {capacityStatuses.length > 0 ? (
                    capacityStatuses.map(status => (
                      <li key={status.code} className="projectReport__capacityStatus">
                        {status.label}
                      </li>
                    ))
                  ) : (
                    <li className="projectReport__capacityStatus projectReport__capacityStatus--empty">
                      Stav nebyl specifikován.
                    </li>
                  )}
                </ul>
                {capacityReport.note ? <p className="projectReport__capacityNote">{capacityReport.note}</p> : null}
              </>
            ) : null}
          </div>
        </section>
        <ProjectSettingsModal
          project={currentProject}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onProjectUpdated={handleProjectSettingsSaved}
          onTeamUpdated={handleTeamUpdated}
        />
      </div>
    </>
  );
}
