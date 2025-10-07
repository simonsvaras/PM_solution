# Reportování kapacit pro projekty

Tento dokument shrnuje návrh rozšíření backendu modulu `projects-overview` o možnost reportovat a sledovat stav kapacit na projektech.

## Potřeby
- Produktový manažer chce u každého projektu evidovat aktuální stav kapacit (např. saturováno, chybí backend apod.).
- Je nutné uchovávat historii změn stavu, aby bylo možné zpětně dohledat vývoj.
- Stav se má zobrazovat v přehledu projektů (aktuální hodnota) i v detailu projektu (historie).
- Každý záznam uchovává čas vytvoření a volitelnou poznámku.
- Aktuální stav může obsahovat více vybraných statusů současně (např. nedostatek BE i FE).

## Datový model
1. **Referenční tabulka stavů** – nové ENUM-like schéma v relační databázi:
   ```sql
   CREATE TABLE capacity_status (
       code TEXT PRIMARY KEY,
       label TEXT NOT NULL,
       severity SMALLINT NOT NULL CHECK (severity BETWEEN 0 AND 100)
   );
   ```
  - `code` – strojově čitelné hodnoty (`SATURATED`, `SURPLUS_BE`, `SURPLUS_FE`, `SURPLUS_ANALYSIS`, `LACK_BE`, `LACK_FE`, `LACK_ANALYSIS`, `CRITICAL`).
   - `label` – lokalizovaný název pro FE.
   - `severity` – číslo pro řazení/filtry (např. 0 = saturováno, 100 = kritické).
   - Tabulka se naplní seed daty ve Flyway migraci.

2. **Historie stavů projektu** – nová tabulka napojená na `project` s vazební tabulkou pro více statusů:
   ```sql
   CREATE TABLE project_capacity_report (
       id BIGSERIAL PRIMARY KEY,
       project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
       reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       note TEXT NULL
   );

   CREATE TABLE project_capacity_report_status (
       report_id BIGINT NOT NULL REFERENCES project_capacity_report(id) ON DELETE CASCADE,
       status_code TEXT NOT NULL REFERENCES capacity_status(code),
       PRIMARY KEY (report_id, status_code)
   );

   CREATE INDEX idx_project_capacity_report_project ON project_capacity_report(project_id, reported_at DESC);
   CREATE INDEX idx_project_capacity_report_status_report ON project_capacity_report_status(report_id);
   ```
   - Každý report může zahrnovat více stavů – kombinace `report_id + status_code` je unikátní.
   - `reported_at` slouží k určení aktuálního stavu (poslední záznam).
   - Volitelná `note` umožní vysvětlit detail (např. "čekáme na nástup nového BE").

3. **Materializovaný pohled / cache** – pro rychlý přístup v přehledu lze přidat sloupec `current_capacity_status_code` do tabulky `project` a udržovat jej DB triggerem nebo ve službě při zápisu. Alternativně lze v dotazu vybírat `DISTINCT ON (project_id)` s `ORDER BY reported_at DESC`.

## Flyway migrace
- `V24__capacity_status.sql`
  - vytvoří tabulku `capacity_status` a vloží základní statusy.
  - přidá tabulku `project_capacity_report`.
  - doplní indexy a případně materializovaný sloupec/cache.
- Migrace bude idempotentní a bude respektovat stávající naming conventions (prefix `Vxx__`).
- `V31__project_capacity_surplus_statuses.sql`
  - přidá nové přebytkové statusy (`SURPLUS_BE`, `SURPLUS_FE`, `SURPLUS_ANALYSIS`) pro disciplíny s dostupnou kapacitou.
  - používá `INSERT ... ON CONFLICT DO UPDATE`, aby při opakovaném nasazení sjednotila labely a severity.

## REST API
### Endpoints
1. `GET /api/projects/{projectId}/capacity` – vrátí aktuální stav:
   ```json
   {
     "projectId": 123,
     "reportedAt": "2024-03-05T09:15:00Z",
     "note": "Potřebujeme 0.5 FTE senior BE",
     "statuses": [
   {
     "code": "LACK_BE",
     "label": "Chybí kapacita na backend",
     "severity": 60
   },
   {
     "code": "LACK_FE",
     "label": "Chybí kapacita na frontend",
     "severity": 60
   }
 ]
}
  ```
  - Implementace: repository vybere poslední report a agreguje všechny stavy přes `project_capacity_report_status`.
  - Mezi podporované kódy patří i přebytkové varianty `SURPLUS_*`, takže lze zaznamenat např. „Přebytek BE“ i „Chybí kapacity na FE“ v jednom reportu.

2. `GET /api/projects/{projectId}/capacity/history?from=&to=&page=&size=` – stránkovaná historie pro detail projektu.
   - Dotaz vybírá z `project_capacity_report` s filtrem na časové období.
   - Odpověď obsahuje metadata pro FE (autor, label statusu, poznámka).

3. `POST /api/projects/{projectId}/capacity`
   - Payload: `{ "statusCodes": ["LACK_BE", "LACK_FE"], "note": "..." }`.
   - Endpoint očekává validního uživatele z API klienta (např. service account); konkrétní jméno se již neukládá.
   - Servisní vrstva ověří existenci projektu, všech statusů a délku poznámky, poté vloží záznam i vazební řádky.
   - Po uložení endpoint vrací vytvořený záznam (201 Created).

4. Volitelně `DELETE /api/projects/{projectId}/capacity/{reportId}` – pouze pro oprávněné role (např. admin), nastaví `DELETE`.

## Implementace v kódu
- **DAO vrstva (`ProjectCapacityRepository`)**
  - Repo je nově umístěno v balíčku `czm.pm_solution_be.projects.capacity` a zapouzdřuje veškeré SQL dotazy na tabulky `project_capacity_report`, `project_capacity_report_status` a `capacity_status`.
  - V kódu jsou doplněny technické komentáře popisující využití indexů, agregaci více stavů a důvod řazení podle závažnosti.
  - Repository také poskytuje metody `projectExists` a `statusExists`, aby servisní vrstva mohla vracet čitelné chyby.
- **Service (`ProjectCapacityService`)**
  - Obsluhuje validaci vstupů, mapování do DTO a logování kapacitních změn. Konstanty `DEFAULT_PAGE`, `MAX_SIZE` a `MAX_NOTE_LENGTH` jsou doplněny o inline komentáře.
  - Metoda `reportCapacity` obsahuje TODO poznámku pro napojení na centralizovaný audit log. Paginační logika je okomentována (ochrana proti overflow a záporným hodnotám).
  - Servisní vrstva normalizuje kolekci stavů (odstraňuje duplicity, kontroluje prázdné hodnoty) ještě před vložením do DB.
- **Controller (`ProjectCapacityController`)**
  - REST rozhraní je zdokumentováno JavaDocem pro každý endpoint a vysvětluje, jak posílat více statusů v jedné žádosti.
  - Odpověď vrací kolekci stavů včetně závažnosti; poznámka v kódu popisuje mapování na DTO pro FE.
- **Validace**
  - Před vložením nového záznamu se ověřuje existence projektu a platnost všech status kódů. Chyby se mapují na `ApiException` s konkrétními kódy pro FE.
  - Poznámka se řeže na 1 000 znaků – důvod je uveden v komentáři přímo v metodě `validateNoteLength`.

## Plán prvních implementačních kroků
1. **Migrace datového modelu**
   - Vytvořit Flyway skript `V24__project_capacity_reporting.sql`.
   - Postupně definovat tabulky: nejdříve `capacity_status`, následně `project_capacity_report`.
   - Do sekce `INSERT` přidat seed data s technickými komentáři vysvětlujícími význam závažností:
     ```sql
     -- severity 0 = bez problému, 100 = kritické kapacitní riziko
     INSERT INTO capacity_status (code, label, severity) VALUES
     ('SATURATED', 'Všechny pozice saturovány', 0),
     ('SURPLUS_BE', 'Přebytek BE', 10),
     ('SURPLUS_FE', 'Přebytek FE', 10),
     ('SURPLUS_ANALYSIS', 'Přebytek Analysis', 10),
     ('LACK_BE', 'Chybí kapacity na backend', 60),
     ('LACK_FE', 'Chybí kapacity na frontend', 60),
     ('LACK_ANALYSIS', 'Chybí kapacity na analýzu', 50),
     ('CRITICAL', 'Kritický nedostatek kapacit', 100);
     ```
   - Do migrace doplnit `COMMENT ON COLUMN`, aby bylo zřejmé, že `reported_at` představuje okamžik vytvoření záznamu.

2. **Repository vrstva (`ProjectCapacityRepository`)**
  - Implementace již používá `JdbcTemplate` a společný mapper `ProjectCapacityRow`; do budoucna je možné přidat `RowMapper` pro custom projekce.
  - Kód obsahuje příklady technických komentářů (např. vysvětlení `idx_project_capacity_report_project`).

3. **Servisní vrstva (`ProjectCapacityService`)**
  - Validace projektu a statusů probíhá přímo v metodách služby – zůstává TODO na integraci audit trailu.
  - Kolekce statusů se převádí na interní DTO s kódem, názvem a závažností.

4. **Controller (`ProjectCapacityController`)**
  - Handler `reportCapacity` zůstává zdokumentován a popisuje očekávanou kolekci `statusCodes` v payloadu.
  - Historie vrací stránkované výsledky a v technické poznámce se zmiňuje doporučená velikost stránky (20).

5. **Integrace do `projects-overview`**
  - Rozšířit query builder v existující implementaci tak, aby se joinoval výsledek z `project_capacity_report` (aktuální záznam).
  - V místě, kde se mapuje DTO, uvést komentář popisující mapování závažnosti na barevnou škálu (pro FE).
  - Přidat TODO pro napojení na cache, jakmile bude dostupná vrstva se Spring Cache.

6. **Dokumentace a technické poznámky**
  - README bude odkazovat na tento dokument (doplněno TODO níže) a každá třída v balíčku má JavaDoc.
  - V `ProjectCapacityService` zůstává poznámka, že unit testy se doplní po stabilizaci API kontraktu – inline komentář je již součástí zdrojového kódu.

## Dokumentace a technické poznámky
- **Technická dokumentace** je součástí zdrojového kódu – JavaDoc komentáře shrnují zodpovědnost tříd a metody vysvětlují parametry.
- **Poznámky k výkonu**
  - Historie využívá index `idx_project_capacity_report_project` a stránkování `LIMIT/OFFSET`. Pokud by bylo potřeba, lze doplnit cursor-based přístup.
  - `COUNT(*)` dotaz používá stejné filtry jako `SELECT`, takže čísla sedí i při omezení `from/to`.
- **Bezpečnost**
  - Volání endpointu může být omezeno na interní klienty (např. Basic Auth / API key); konkrétní identita reportéra se zatím neukládá.
  - Servisní vrstva vrací popisné chyby přes `ApiException` pro FE – kódy jsou dokumentovány v JavaDocu controlleru.
- **Rozšiřitelnost**
  - Formát odpovědi lze rozšířit o další metadata stavů (např. barvy) bez breaking změn – kolekce statusů je již strukturovaná.
  - Nové statusy se přidávají jednoduše doplněním řádku do tabulky `capacity_status`; severity určuje jejich pořadí.
- **Testování**
  - Unit testy budou přidány v další iteraci. V kódu je TODO poznámka, aby se na ně nezapomnělo, a dokumentace uvádí doporučení pro testovací scénáře (validace vstupů, stránkování, integrace s autentizací).

## Napojení na Projects Overview
- Aktualizovat SQL v `SyncDao.listProjectOverview()` tak, aby se připojila tabulka `project_capacity_report` (poslední záznam na projekt) a přes vazební tabulku vrátila kolekci statusů s `code + label + severity`. To umožní FE zobrazit více štítků a seřadit projekty dle závažnosti.
- FE může pro detail projektu vyvolat `GET /capacity/history` a zobrazit timeline.

## Audit & historie
- Historické reporty jsou uloženy nezávisle, takže není potřeba extra audit trail.
- Pro případné úpravy lze přidat sloupce `updated_at`, `updated_by` a soft delete (`deleted_at`). Pro MVP stačí tvrdé mazání pouze administrátorem.

## Budoucí rozšíření
- Při potřebě více stavů lze statusy spravovat přes admin UI (CRUD nad tabulkou `capacity_status`).
- Do tabulky lze přidat `color_hex` pro konzistentní barvy na FE.
- Pokud bude potřeba evidovat autora reportu, lze do tabulky `project_capacity_report` doplnit sloupce `reported_by`/`reported_by_name`.
