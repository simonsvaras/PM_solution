pm_solution_fe - Frontend
=========================

Overview
--------
React + TypeScript single-page app providing UI for:
- synchronising GitLab data (On-demand page),
- managing local projects and their repositories,
- managing interns (levels, groups, CRUD).

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
- **Synchronizace** – triggers GitLab sync jobs, displays progress and result cards.
- **Projekty / Správa projektů** – create, edit, delete projects and open the repository assignment modal.
- **Stážisti** – full CRUD over interns. Radio buttons set the level, checkboxes assign any number of groups. Validation/messages mirror backend responses.
- **Přehled stážistů** – card-based overview of every intern with total tracked hours and project workload breakdown accessible via modal detail.

API usage
---------
Frontend talks to the backend via helper functions in `src/api.ts`.
- Project helpers (`getProjects`, `createProjectByName`, `updateProjectName`, `deleteProject`, etc.).
- Intern helpers (`listInterns`, `createIntern`, `updateIntern`, `deleteIntern`, `getLevels`, `getGroups`).
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

