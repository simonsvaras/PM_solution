# Milestone náklady

Tento dokument popisuje, jak backend počítá souhrnný náklad milníků a proč už není aplikován filtr podle `project.budget_from` / `project.budget_to`.

## Souhrn změny

- Milníkové náklady se nyní počítají ze všech reportů navázaných na issue přiřazené k milníku, bez ohledu na nastavené rozpočtové období projektu.
- Změna je doručena migrací `V10__remove_budget_window_from_milestone_cost.sql`, která znovu vytvoří pohled `milestone_report_cost` bez podmínky na `r.spent_at`.
- Čisté instalace získají stejné chování po spuštění celé sady migrací (V1 + … + V10), takže není potřeba ručně upravovat baseline.

## Jak se částka počítá

1. Pohled `milestone_report_cost` spojuje tabulky `milestone`, `project`, `projects_to_repositorie`, `issue` a `report`.
2. Reporty se připojují pouze podle `repository_id` a `iid`; jedinou další podmínkou je shoda `issue.milestone_title` s názvem milníku.
3. Hodiny (`report.time_spent_hours`) se násobí hodinovou sazbou. Pokud ji definuje samotný projekt (`project.hourly_rate_czk`), má přednost, jinak se použije sazba uložená v reportu (`report.hourly_rate_czk`).
4. Součet se zaokrouhlí na dvě desetinná místa (`round(..., 2)`) a vrátí jako `total_cost`.

Tyto agregace využívají všechny endpointy poskytující náklady milníků (`/milestones/costs`, `/milestones/{id}/detail` a další), takže změnu automaticky přeberou i UI komponenty.

## Důvody zrušení budget filtru

- Stakeholdeři chtějí vidět kompletní náklady milníku i v případě, že issue zasahuje mimo aktuálně nastavené období rozpočtu.
- Vyloučení reportů mimo budget vedlo k podhodnocení milníků během delších realizací, což komplikovalo porovnávání se skutečným stavem.
- Projektové rozpočty mohou nadále využívat `budget_from` / `budget_to` v jiných výpočtech (např. sumarizace projektu), ale pro milníky dává větší smysl transparentní model bez časového řezu.

## Nasazení

1. Při deployi spusťte migrace, aby se aplikovala změna `V10`.
2. Pokud je `milestone_report_cost` materializovaný (synchronizační job ho po importu reportů refreshuje), doporučuje se refresh po nasazení, aby cache obsahovala data podle nové definice.
