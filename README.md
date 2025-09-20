PM Solution — Docker Compose

Run the whole stack (DB + Backend + Frontend) with one command.

Prerequisites
- Docker and Docker Compose v2
- GitLab token with `read_api` scope

Quick start
1) Create `.env` in repo root with your token (and optional overrides):

   GITLAB_TOKEN=your_token_here
   # GITLAB_API=https://gitlab.fel.cvut.cz/api/v4

2) Build and run all services:

   docker compose up --build

Services
- Postgres: localhost:5432 (db=issueviz, user=issueviz, pass=issueviz)
- Backend (Spring Boot): localhost:8080
- Frontend (Nginx): localhost:5173

Notes
- Frontend proxies `/api/*` to backend inside the compose network, so no CORS is needed in Docker.
- For local dev outside Docker, frontend uses `VITE_API_BASE_URL` from `pm_solution_fe/.env` (defaults to same-origin if unset).

