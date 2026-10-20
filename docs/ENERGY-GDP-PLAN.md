# Monthly energy and provincial GDP forecast experiment

## Ground

The incumbent forecasts annual whole-economy real GDP growth at basic prices for ten provinces and two horizons. It chooses among a mean, autoregression, own-province employment bridge and pooled employment bridge using only earlier known annual outcomes. Territories retain unavailable forecasts. The monthly energy feed is currently supporting context, with full official history available in its source archives.

## Sketch and agree

Freeze the following protocol before examining the 2023–2025 final evaluation. Independent research and adversarial validation agents have separate scripts and output directories. The parent owns production integration.

The domain shape is a monthly-energy augmentation record alongside each unchanged incumbent forecast: source-derived YTD predictors with their reference months, candidate predictions, historical comparison records, training/selection cutoffs, current adoption status and reason, and historical error ranges. A dataset-level evaluation records both horizons, every province and year, source provenance and release-gate decisions. There is no user-adjustable model coefficient or price-to-GDP causal interpretation.

Candidates are pooled, province-centred ridge corrections to the incumbent's genuine historical prediction errors. Features are one exact oil, gas or electricity YTD growth measure, with a fourth equal-weight available-correction candidate. Fixed ridge penalty is n×1. Cap fitted residual corrections at ±1 GDP percentage point and apply 50% to the incumbent. No 2022 exposure weights enter earlier folds. Electricity's 2016 coverage-break growth is excluded. Missing or confidential energy is never zero.

Fit each correction using at least five distinct earlier target years, at least four eligible provinces with five own years, and targets strictly before the origin. Candidate selection uses at least three earlier paired forecast years for the province and requires at least 5% lower MAE and non-worse RMSE than the full incumbent. The unchanged incumbent is always the fallback. All feature transformations, scaling, fitting, selection and error calibration use only eligible preceding observations.

At October origins, use January–July energy observations, applying a conservative three-calendar-month release lag, and the incumbent's January–September employment. Current runs also respect actual source release dates. The exercise uses revised source history with simulated publication timing. It is not a historical-vintage real-time evaluation.

Final outer evaluation uses target years 2023–2025 separately for each horizon. Promotion requires at least 5% lower MAE for the complete ten-province policy, non-worse RMSE, non-worse MAE in at least two of three years, and no provincial MAE regression above 0.25 percentage points. Report all province/year differences and eligible-only results, not only winners. These are frozen engineering thresholds, not a claim of statistical significance from three independent macroeconomic years. Do not change candidates or thresholds after opening the outer results.

## Implement

1. Research and compare the frozen models using full official monthly archives and the incumbent history.
2. Implement reproducible energy-source loading and the frozen selection/evaluation policy. Maintain backward compatibility for saved forecasts.
3. Show whether monthly energy was admitted, the source cutoff, the incumbent comparison and held-out errors in expandable forecast evidence. Forecast exports and AI workspaces retain the same verified snapshot.
4. Independent review verifies raw feature sums, source flags, temporal boundaries, model arithmetic and promotion results. Mutation tests must show that future GDP and energy observations cannot change earlier predictions.
5. Run focused and regression tests, headless desktop/mobile flows, then publish and verify the live release.

## Scrap condition

If the fixed final comparison fails, retain incumbent point forecasts and ship the validated energy-evaluation capability and visible evidence. Do not call a failed or inconclusive model an accuracy improvement. Future promotion requires new evidence under the same policy or a newly documented experiment with a fresh evaluation period.

## Throughput checkpoint

Two independent agents cover modelling research and temporal/evaluation audit while the parent prepares the integration boundary. Writes do not overlap. Publication and review remain sequential. No paid inference or foreground browser testing.

## Principles

Model the Domain separates candidate evidence, admission and production prediction. Explain the Number requires matched outcomes and full-policy comparisons, including non-winners. Prove It Works requires independent arithmetic checks, temporal mutation tests and actual public-app acceptance.
