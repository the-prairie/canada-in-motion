# Monthly energy forecast evaluation — 20 October 2026

## Release decision

The app now tests monthly physical energy production as an additional predictor of provincial annual real GDP growth. The experiment did not earn promotion. All 20 existing point forecasts and uncertainty ranges remain unchanged.

On the frozen 2023–2025 outcomes, current-year mean absolute error fell from 0.892776 to 0.886576 percentage points: a 0.695% reduction, below the precommitted 5% requirement. Next-year error was unchanged at 0.933249 percentage points. Only three current-year forecasts changed, all for 2025. Newfoundland and Labrador improved; New Brunswick and Manitoba worsened. These thirty province-year rows span only three shared macroeconomic years.

## Delivered

The Provincial outlook has an expandable **Monthly energy test**. It compares existing and experimental errors for all provinces and the selected province, then exposes each test-year outcome and January–July source inputs. Experimental current predictions are labelled unadopted. Exports and saved AI workspaces retain the same evidence snapshot. Earlier saved snapshots remain readable.

The production pipeline acquires full histories from the same official oil, gas and electricity sources used by the monthly context panel. It computes January–July growth, replays the incumbent, fits and selects energy corrections using earlier GDP outcomes, and records all candidates and admission checks. Model admission requires a separate review; a revised source cannot silently change the published forecasting policy. Unsupported information cutoffs return an explicit untested status. The experiment cannot silently inherit a different ridge setting from a later incumbent retune.

Both scheduled refresh and deployment run a separate numerical reproduction after eligible experiments. The independently implemented auditor reconstructs source totals, forecasts, selection, error scores and current incumbent ranges. Source-definition, temporal, arithmetic or admission inconsistencies block publication.

## Independent review

See the [frozen protocol](ENERGY-GDP-PLAN.md), [research findings](ENERGY-GDP-RESEARCH.md) and [independent validation](ENERGY-GDP-VALIDATION.md).

Two independent agents reviewed modelling and implementation. The numerical audit passed 3,556 assertions, reproducing 350 forecast rows, 410 feature records, and all 20 current points and ranges. It parsed independently downloaded official source archives without importing the production model or parser. Mutation tests confirmed that post-July observations and future GDP/energy cannot change earlier eligible predictions.

These are latest-vintage historical tests with simulated release delays, not exact historical-vintage forecasts. Physical production is not a causal energy-price intervention. The result establishes no reliable accuracy gain.

## Local acceptance

- 363 JavaScript tests passed, including evidence arithmetic, tamper rejection and saved-snapshot compatibility.
- The 127-test Python suite passed; the subsequent ridge-setting guard and all seven focused energy tests passed (128 total Python tests now defined).
- All 23 Worker edge tests passed.
- Headless energy-forecast acceptance passed every province and both horizons, data exports, missing territorial coverage, saved URL selection, legacy snapshots and 390/320px layouts.
- Existing provincial-forecast, AI forecast workspace and monthly-energy headless flows passed. No provider calls or foreground browser testing were used.
- Desktop and mobile evidence panels were visually inspected. All data and plots remain inside the existing progressive disclosure structure.

## Design choices

Model the Domain kept energy experiments separate from published forecasts. Explain the Number required full-policy error comparisons and the number of changed predictions. Prove It Works required independent reconstruction, temporal mutation tests and live acceptance before claiming shipment.

## Public acceptance

Pending deployment verification.
