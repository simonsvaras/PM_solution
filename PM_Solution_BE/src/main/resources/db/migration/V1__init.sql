-- V1__init.sql
-- Schema for intern/project cost & assignment dashboard (PostgreSQL)

-- 0) Extensions (for date-range overlap protection on history)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) Core reference tables
CREATE TABLE project (
                         id               BIGSERIAL PRIMARY KEY,
                         name             TEXT NOT NULL
);

-- Úrovně (Zkušební, junior, medior, senior, externí, zaměstnanec) + mzda
CREATE TABLE level (
                       id               BIGSERIAL PRIMARY KEY,
                       code             TEXT NOT NULL UNIQUE,         -- např. 'trial','junior','medior','senior','external','employee'
                       label            TEXT NOT NULL,                -- zobrazený název (CZ)
                       hourly_rate_czk  NUMERIC(12,2) NOT NULL CHECK (hourly_rate_czk >= 0)
);

-- Skupiny (Frontend, Backend, Analýza, PM)
CREATE TABLE "group" (
                         id               BIGSERIAL PRIMARY KEY,
                         code             TEXT NOT NULL UNIQUE,         -- např. 'fe','be','analysis','pm'
                         label            TEXT NOT NULL                 -- zobrazený název (CZ)
);

-- 2) Interns (stážisti)
CREATE TABLE intern (
                        id               BIGSERIAL PRIMARY KEY,
                        first_name       TEXT NOT NULL,
                        last_name        TEXT NOT NULL,
                        username         TEXT NOT NULL UNIQUE          -- interní/GitLab username (unikátní klíč)
);

-- Historie úrovní stážisty (s platností od-do, bez překryvů)
CREATE TABLE intern_level_history (
                                      id               BIGSERIAL PRIMARY KEY,
                                      intern_id        BIGINT NOT NULL REFERENCES intern(id) ON DELETE CASCADE,
                                      level_id         BIGINT NOT NULL REFERENCES level(id),
                                      valid_from       DATE   NOT NULL,
                                      valid_to         DATE   NULL,
                                      CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- Zabrání překryvu období pro jednoho stážistu:
-- (vyžaduje btree_gist) – každému stážistovi může běžet vždy max 1 úroveň v daný den
CREATE INDEX IF NOT EXISTS intern_level_hist_excl_idx
    ON intern_level_history
    USING GIST (intern_id, daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]'));

-- 3) Vazby stážista <-> skupina (1:n, fakticky m:n přes tuto tabulku)
CREATE TABLE intern_group (
                              intern_id        BIGINT NOT NULL REFERENCES intern(id) ON DELETE CASCADE,
                              group_id         BIGINT NOT NULL REFERENCES "group"(id) ON DELETE RESTRICT,
                              PRIMARY KEY (intern_id, group_id)
);

-- 4) Vazby stážista <-> projekt (1..n projektů pro stážistu)
CREATE TABLE intern_project (
                                intern_id        BIGINT NOT NULL REFERENCES intern(id) ON DELETE CASCADE,
                                project_id       BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
                                PRIMARY KEY (intern_id, project_id)
);

-- 5) Repositories (z GitLab API), každý repozitář patří právě jednomu projektu
CREATE TABLE repository (
                            id                   BIGSERIAL PRIMARY KEY,
                            project_id           BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
                            gitlab_repo_id       BIGINT UNIQUE,            -- pokud chceš uchovat GitLab id (volitelné)
                            name                 TEXT NOT NULL,
                            name_with_namespace  TEXT NOT NULL,
                            namespace_id         BIGINT,
                            namespace_name       TEXT,
                            root_repo            BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_repository_project ON repository(project_id);

-- 6) Issues (z GitLab API)
-- Pozn.: udržujeme jak globální GitLab issue id (gitlab_issue_id), tak iid (číslo v rámci projektu)
CREATE TABLE issue (
                       id                         BIGSERIAL PRIMARY KEY,
                       project_id                 BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
                       repository_id              BIGINT NULL REFERENCES repository(id) ON DELETE SET NULL,
                       gitlab_issue_id            BIGINT UNIQUE,        -- GitLab globální ID
                       iid                        BIGINT NOT NULL,      -- číslo issue v rámci projektu
                       title                      TEXT NOT NULL,
                       state                      TEXT NOT NULL,        -- 'opened' | 'closed' (případně další)
                       assignee_id                BIGINT,               -- GitLab user id (pokud ukládáš)
                       assignee_username          TEXT,                 -- lze spárovat na intern(username)
                       author_name                TEXT,
                       labels                     TEXT[],               -- PostgreSQL array
                       due_date                   DATE,
                       time_estimate_seconds      INTEGER,              -- GitLab time estimate (sec)
                       total_time_spent_seconds   INTEGER,              -- GitLab total time spent (sec, všichni dohromady)
                       updated_at                 TIMESTAMPTZ,
                       UNIQUE (project_id, iid)                         -- iid je unikátní v rámci projektu
);
CREATE INDEX idx_issue_project ON issue(project_id);
CREATE INDEX idx_issue_repo ON issue(repository_id);
CREATE INDEX idx_issue_assignee_username ON issue(assignee_username);
CREATE INDEX idx_issue_updated_at ON issue(updated_at);

-- 7) Report (worklog-like agregace jednotlivých záznamů času)
-- Dle požadavku: id, iid, projectId, spentAt, timeSpent, username
-- - iid + project_id identifikují issue (FK přes (project_id, iid))
-- - username lze svázat s intern(username)
CREATE TABLE report (
                        id                    BIGSERIAL PRIMARY KEY,
                        project_id            BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
                        iid                   BIGINT NOT NULL,
                        spent_at              TIMESTAMPTZ NOT NULL,     -- kdy byl čas zapsán/odpracován
                        time_spent_seconds    INTEGER NOT NULL CHECK (time_spent_seconds <> 0),
                        time_spent_hours      NUMERIC(12,6) NOT NULL,
                        username              TEXT NOT NULL,
    -- Volitelné FK: na issue přes (project_id, iid)
                        CONSTRAINT fk_report_issue
                            FOREIGN KEY (project_id, iid)
                                REFERENCES issue(project_id, iid)
                                ON DELETE CASCADE
);
-- Propojení na stážistu přes username (pokud username v 'intern' je jediný zdroj pravdy)
ALTER TABLE report
    ADD CONSTRAINT fk_report_intern_username
        FOREIGN KEY (username)
            REFERENCES intern(username)
            ON UPDATE CASCADE
            ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX idx_report_issue ON report(project_id, iid);
CREATE INDEX idx_report_username ON report(username);
CREATE INDEX idx_report_spent_at ON report(spent_at);

-- 8) Uživatelsky příjemné pohledy (volitelné)
-- Souhrn per stážista: počet přiřazených issues, součet času, součet nákladů (počítáno mimo – potřeba join na level dle období)
-- V MVP zatím bez nákladů (počítat můžeš v aplikaci přes current level rate).
-- Níže základní view sumy času per stážista:
CREATE VIEW intern_time_summary AS
SELECT
    i.id            AS intern_id,
    i.username      AS intern_username,
    COALESCE(SUM(r.time_spent_seconds), 0) AS seconds_spent_total,
    COALESCE(SUM(r.time_spent_hours), 0)   AS hours_spent_total
FROM intern i
         LEFT JOIN report r
                   ON r.username = i.username
GROUP BY i.id, i.username;

-- 9) (Volitelné) Seed hodnot – odkomentuj, pokud chceš rovnou naplnit
-- INSERT INTO level (code, label, hourly_rate_czk) VALUES
--   ('trial','Zkušební úroveň', 0),
--   ('junior','Junior', 200),
--   ('medior','Medior', 350),
--   ('senior','Senior', 600),
--   ('external','Externí', 400),
--   ('employee','Zaměstnanec', 0);

-- INSERT INTO "group" (code, label) VALUES
--   ('fe','Frontend'),
--   ('be','Backend'),
--   ('analysis','Analýza'),
--   ('pm','PM');
