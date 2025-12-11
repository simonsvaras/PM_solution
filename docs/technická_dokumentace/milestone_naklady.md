# Milestone naklady

Tento dokument vysvetluje, jak backend pocita souhrnny naklad milniku, proc byl odstranen filtr podle `project.budget_from` / `project.budget_to` a jak je reseno materializovani pohledu `milestone_report_cost`.

## Souhrn zmeny

- Milnikove naklady se pocitaji ze vsech reportu navazanych na issue prirazene k milniku bez ohledu na rozsah rozpoctu projektu.
- Migrace `V10__remove_budget_window_from_milestone_cost.sql` odstranila casove omezeni a re-definovala SQL dotaz pro `milestone_report_cost`.
- Migrace `V11__materialize_milestone_cost_view.sql` znovu vytvari objekt jako materializovany view, aby bylo mozne pouzivat `REFRESH MATERIALIZED VIEW milestone_report_cost` beze zmeny aplikační logiky.
- Ciste instalace ziskaji toto chovani pri spusteni cele sady migraci (V1 az V11), neni tedy nutne menit `V1__baseline.sql`.

## Jak se castka pocita

1. Pohled spojuje tabulky `milestone`, `project`, `projects_to_repositorie`, `issue` a `report`.
2. Reporty se pridruzuji pouze podle `repository_id` a `iid`, navic se hlida shoda `issue.milestone_title` s nazvem milniku.
3. Hodiny (`report.time_spent_hours`) se nasobi hodinovou sazbou. Pokud ji definuje projekt (`project.hourly_rate_czk`), ma prednost, jinak se pouzije sazba z reportu (`report.hourly_rate_czk`).
4. Soucet se zaokrouhli na dve desetinna mista pres `round(..., 2)` a ulozi se jako `total_cost`.

Vysledny agregat slouzi jako zdroj pro endpointy `/milestones/costs`, `/milestones/{id}/detail` i pro dalsi UI casti, ktere potrebuji zobrazit cenu milniku.

## Materializovany pohled

- Synchronizace reportu vola `REFRESH MATERIALIZED VIEW milestone_report_cost`, proto musi byt databazovy objekt materializovan.
- `V11__materialize_milestone_cost_view.sql` nejdrive zrusi pripadny standardni view, vytvori materializovany view se stejnou definici (bez rozpoctovych filtru) a nastavi prava pro role `anon`, `authenticated` a `service_role`.
- Po aplikaci migrace je vhodne provest prvni `REFRESH MATERIALIZED VIEW milestone_report_cost`, aby se napocitala data podle nove logiky.

## Duvody zruseni budget filtru

- Stakeholderi potrebuji videt kompletni naklady milniku, i kdyz issue presahuje aktualne nastavene rozpoctove obdobi.
- Vylouceni reportu mimo budget vedlo k podhodnoceni milniku pri delsi realizaci a ztizilo porovnavani s realnym stavem.
- Rozpoctove intervaly zustavaji k dispozici pro jine vypocty (napr. sumarizace projektu), ale pro milniky dává smysl transparentni model bez casoveho rezu.

## Nasazeni

1. Spustte nove migrace (`V10`, `V11`), aby databaze pouzivala aktualni definici materializovaneho pohledu.
2. Po deployi zavolejte `REFRESH MATERIALIZED VIEW milestone_report_cost` (napr. pres stavajici synchronizacni proces), aby cache odrazela zmenenou definici.
