pm_solution_fe - Frontend
=========================

Overview
--------
React + TypeScript single-page app providing UI for:
- synchronising GitLab data (On-demand page),
- managing local projects and their repositories,
- managing interns (groups, full CRUD and timeline of level changes).

Prerequisites
-------------
- Node.js 18+
- Backend running on `http://localhost:8081` (adjust via `VITE_API_BASE_URL` in `.env`).

Scripts
-------
```bash
npm install        # first time only
npm run dev        # start Vite dev server on http://localhost:5173
npm run build      # production build
npm run preview    # serve built assets locally
```

Key modules
-----------
- **Synchronizace** – triggers GitLab sync jobs, displays progress/result cards a panel pro údržbu reportů. Lze vybrat konkrétní
  projekty, pro které se výkazy smažou (nebo ponechat výběr prázdný pro kompletní vyčištění před novou synchronizací).
- **Projekty / Správa projektů** – create, edit, delete projects and open the repository assignment modal.
- **Stážisti** – full CRUD over interns. Samostatný modál "Nastavit úroveň" umožňuje spravovat historii úrovní včetně dat od-do a mazání položek. Skupiny se vybírají pomocí zaškrtávacích políček. Validace zobrazuje reakce backendu.
- **Reporty / Přehled** – vyberte projekt, zobrazte souhrn otevřených issue a z tlačítka „Zobrazit detailní report“ otevřete kontingenční
  tabulku s hodinami podle issue × stážista za zvolené období.
- **Stážisti** – full CRUD over interns. Radio buttons set the level, checkboxes assign any number of groups. Validation/messages mirror backend responses.
- **Přehled stážistů** – card-based overview of every intern with total tracked hours and project workload breakdown accessible via modal detail.

API usage
---------
Frontend talks to the backend via helper functions in `src/api.ts`.
- Project helpers (`getProjects`, `createProjectByName`, `updateProjectName`, `deleteProject`, etc.).
- Intern helpers (`listInterns`, `createIntern`, `updateIntern`, `deleteIntern`, `getLevels`, `getGroups`, `getInternLevelHistory`).
- Sync helpers for repositories/issues.

Styling
-------
- Component-specific CSS lives next to `.tsx` files (e.g. `InternsPage.css`).
- Shared modal styles updated in `Modal.css` to give consistent contrast for primary/secondary buttons.

Accessibility & UX notes
------------------------
- Buttons have clear hover/disabled states and sufficient contrast for dark text on light backgrounds.
- Forms provide inline error messages plus backend validation hints when available.
- Table views keep headers sticky for easier scanning of long lists.

