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
- All 131 Python tests passed after the model and source-recovery changes. The deployed application commit also passed all 130 tests then defined in GitHub Actions.
- All 23 Worker edge tests passed.
- Headless energy-forecast acceptance passed every province and both horizons, data exports, missing territorial coverage, saved URL selection, legacy snapshots and 390/320px layouts.
- Existing provincial-forecast, AI forecast workspace and monthly-energy headless flows passed. No provider calls or foreground browser testing were used.
- Desktop and mobile evidence panels were visually inspected. All data and plots remain inside the existing progressive disclosure structure.

## Design choices

Model the Domain kept energy experiments separate from published forecasts. Explain the Number required full-policy error comparisons and the number of changed predictions. Prove It Works required independent reconstruction, temporal mutation tests and live acceptance before claiming shipment.

## Public acceptance

The first deployment stopped when the unrelated AER well-status CSV returned HTTP 403 to GitHub. The existing verified snapshot was less than 24 hours old. The deployment workflow can now reuse that intact daily snapshot without rewriting its bytes or retrieval date. Scheduled source refreshes still require an online download. Future-dated, stale or hash-mismatched snapshots cannot qualify. An independent review approved the policy, and tests cover the 24-hour boundary and unchanged-file behavior.

Published by [GitHub Actions run 39507387332](https://github.com/the-prairie/canada-in-motion/actions/runs/39507387332) from application commit `12e142f0aeead7539cb7dfa2b03204f36d0169cc`. The subsequent malformed-cache recovery fix changes only the next refresh attempt, not the published app assets.

- Public app: https://the-prairie.github.io/canada-in-motion/
- Application code version: `c3e30f24a0bc00aab576`
- Public release: `ed6c7ae8a18df5cbe066`, built at 22:26:30 UTC on 20 October 2026.
- Published forecast snapshot: `85fe7f74fcf3682fc348`.
- All three official monthly sources were downloaded again between 22:23:04 and 22:23:07 UTC. Their source hashes match the independently acquired archives. The published forecast file's SHA-256 matches the public build manifest.
- The independent audit passed all 3,556 numeric assertions against the actual public artifact. It reproduced the same 0.694518% current-year gain and zero next-year gain. Both release thresholds failed.
- All 20 public point forecasts and ranges are numerically identical to the pre-release public snapshot.
- Both the new energy-forecast and existing provincial-forecast headless flows passed against the public URL. This covered all ten provinces and both years, evidence tables, exports, missing territorial coverage, saved links, old snapshots and mobile layouts. No browser runtime errors.
- The AI Worker deployed successfully as version `e9d6242d-1d95-4dc6-bb8e-b52b3862aa40`. Its health endpoint returned HTTP 200 with availability true after publication. Providers and spending limits were unchanged. Browser tests stubbed AI availability and made no billed inference calls.

No remaining blocker for this evaluation release. The evidence does not justify claiming an improvement in the production forecasts.
