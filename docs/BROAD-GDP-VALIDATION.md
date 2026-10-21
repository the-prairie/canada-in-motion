# Broader monthly GDP predictors and validation

This review concerns forecasts of annual provincial real GDP growth. Monthly retail sales, manufacturing sales and other activity indicators may carry information beyond employment and physical energy production. Their usefulness must be measured against the forecasting policy already in the app.

## Interpretation of the evaluation

The 2023–2025 outcomes have already been inspected in the energy-only experiment. They are not a fresh or untouched holdout. The proposed broader evaluation is a precommitted retrospective rolling exercise over target years 2015–2025. Its forecasts can respect historical information cutoffs while the overall development process still benefits from having seen the outcomes. Any performance advantage therefore needs future prospective validation.

Training, inner model selection and interval calibration must exclude every outcome whose target year is the forecast-origin year or later. Current-year and next-year forecasts have separate histories. At the October information cutoff, employment may run through September and newly added indicators through July. This uses conservative simulated publication timing. Latest revised source values are not original real-time vintages.

Province-year observations share national shocks. The evaluation has eleven annual outcome years, not 110 independent macroeconomic experiments. The report must show annual and provincial errors, results during 2020–2021 and 2022–2025, the number of forecasts actually changed, and unavailable-feature fallbacks.

## Primary research and model scope

Canadian provincial mixed-frequency research includes retail sales, manufacturing, employment and building permits among its provincial indicators. It also uses national and international signals. This supports broadening the evidence set, but does not establish that the app's smaller model will improve. Some provincial source indicators are nominal; using them as predictors does not turn them into real GDP measurements. [Chernis, Velasco and Cheung, 2017](https://www.bankofcanada.ca/wp-content/uploads/2017/06/sdp2017-8.pdf).

Canadian bridge-model research links monthly activity indicators to lower-frequency GDP outcomes and evaluates forecast performance as information arrives. It also shows that rankings can change between real-time and latest-available data. This is why historical publication cutoffs and the revised-data qualification remain part of the experiment. [Zheng and Rossiter, 2006](https://www.bankofcanada.ca/2006/08/working-paper-2006-26/).

Regularization and factors are reasonable candidates when correlated signals outnumber the genuinely independent periods. Nonlinear models can capture different relationships, but a larger search does not create more annual observations. Bank of Canada guidance stresses matching methods and validation to the research problem. The first broader experiment should keep its candidate families and tuning choices limited and fixed. [Desai, 2023](https://www.bankofcanada.ca/2023/10/staff-analytical-note-2023-16/).

Point accuracy and uncertainty calibration answer different questions. Research on Canadian density combinations evaluates them separately and highlights the effects of data revisions. The app should likewise score the intervals of the actual selected forecasting policy rather than attach old error bands to new point estimates. [Chernis and Webley, 2022](https://www.bankofcanada.ca/2022/05/staff-discussion-paper-2022-12/).

## Frozen candidate set

The implementation owner and this independent reviewer agreed on this contract before looking at broader model performance.

The long-history core contains lagged annual GDP growth, employment growth, unemployment-rate change, nominal manufacturing-sales growth and CPI inflation. The monthly predictors have two fixed windows. Employment and unemployment use January–September and July–September. Manufacturing and CPI use January–July and May–July. Unemployment changes are percentage-point changes in matched-window mean rates. Other growth features compare matched-window totals or means year over year.

The five candidates are fixed.

- Province-centred pooled ridge regression with a penalty equal to the training count multiplied by one.
- The same pooled ridge with a penalty equal to the training count multiplied by ten.
- Two principal components of training-standardized monthly features, with lagged GDP retained directly, followed by ridge with a penalty equal to the training count.
- Additive quadratic ridge with a penalty equal to ten times the training count. Standardized inputs are clipped at ±5 before squaring. Province centering after feature expansion uses training rows only.
- The equal average of all four candidate predictions. It cannot select an outcome-dependent subset.

Each direct model needs at least ten distinct completed training years for the forecast province. The pool uses eligible provinces. Province centres, scaling and factor loadings are estimated only from eligible training rows. A missing or suppressed source month cannot become zero. Features require every month in the fixed current and prior windows and a positive prior-year level for growth calculations.

The active retail source begins in 2017. It is retained as current activity context, not spliced into older series or admitted into the long-history core. The earlier energy experiment also remains separate. Adding short-history predictors to the core would remove the long validation history without demonstrating a forecasting gain.

The complete incumbent is the comparison policy. The inner selector needs at least five earlier paired target years. A candidate must beat the incumbent's earlier MAE by at least 5%, with no higher RMSE. The qualifying candidate with lowest earlier MAE is selected. If none qualifies or the current source information is incomplete, retain the incumbent. No hyperparameters, region exclusions or blend weights are chosen after inspecting the outer score.

## Frozen admission checks

For each horizon, the full policy should satisfy all of the following over the same 2015–2025 province-year rows.

- At least 5% lower pooled MAE than the incumbent.
- Pooled RMSE no higher.
- MAE no higher in at least seven of the eleven years.
- No province's MAE worsens by more than 0.25 percentage points.
- No aggregate deterioration during 2020–2021 or 2022–2025.

A changed policy's interval must be recalibrated from its own earlier out-of-sample errors, using the same strict target-year eligibility rule. For an 80% interval, report empirical coverage and the interval score, which combines width with a penalty for misses. The interval gates are coverage no more than two percentage points below the incumbent and no increase in mean interval score. Increasing interval width alone is not evidence of a better forecast.

These are engineering admission checks, not statistical-significance claims. A retrospectively successful model should also have an immutable prospective forecast receipt, including its source hashes, information cutoff, parameters, predictions and ranges. Subsequent GDP releases should be scored against that original receipt without rewriting it.

## Source verification and prototype results

The separate source audit downloaded the selected archives and reconstructed their rows without importing the ingestion code. All 11,080 retail, manufacturing and CPI observations matched the ingestion artifact, including their values, units, dates and source statuses. It also independently parsed 12,180 employment and unemployment observations. Retail remains outside the forecast core.

The reviewer who designed this protocol subsequently became the numerical prototype author. The following results are prototype measurements. They still require another agent's independent numerical reproduction before any production integration. Source verification against the ingestion code remains independent.

Both horizon policies fail their frozen admission checks. The current-year policy improves overall accuracy, but worsens MAE in the recent 2022–2025 period. The next-year policy worsens overall accuracy. Neither finding supports replacing the public forecasts.

| Horizon | Incumbent MAE | Broader policy MAE | Incumbent RMSE | Broader policy RMSE | MAE improvement | Changed forecasts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Current year | 1.743 pp | 1.430 pp | 2.601 pp | 2.035 pp | 17.96% | 106 of 110 |
| Next year | 2.124 pp | 2.190 pp | 3.063 pp | 3.118 pp | −3.10% | 33 of 110 |

The table evaluates the complete selection policy, including its incumbent fallbacks. Each horizon includes all ten provinces in all eleven target years.

| Period | Current-year incumbent MAE | Current-year broader MAE | Next-year incumbent MAE | Next-year broader MAE |
| --- | ---: | ---: | ---: | ---: |
| 2015–2019 | 1.300 pp | 1.118 pp | 1.417 pp | 1.422 pp |
| 2020–2021 | 3.922 pp | 2.519 pp | 5.070 pp | 5.240 pp |
| 2022–2025 | 1.208 pp | 1.276 pp | 1.536 pp | 1.626 pp |

The current-year recent-period deterioration is 5.64%. The full-period average must not conceal it. The next-year policy worsens MAE in each of these three periods.

All five fixed families had complete predictions for the 110 evaluation rows in each horizon. Their full-period scores are reported for transparency. These scores cannot be used to choose a new winner after seeing the evaluation outcomes.

| Fixed candidate | Current-year MAE | Current-year RMSE | Next-year MAE | Next-year RMSE |
| --- | ---: | ---: | ---: | ---: |
| Pooled ridge, penalty n | 1.303 pp | 1.918 pp | 2.320 pp | 3.184 pp |
| Pooled ridge, penalty 10n | 1.664 pp | 2.445 pp | 2.187 pp | 3.102 pp |
| Two monthly factors plus lag GDP | 1.455 pp | 2.099 pp | 2.229 pp | 3.157 pp |
| Additive quadratic ridge | 1.680 pp | 2.403 pp | 2.137 pp | 3.082 pp |
| Equal average of four models | 1.458 pp | 2.117 pp | 2.210 pp | 3.117 pp |

For current-year predictions, empirical 80% interval coverage rises from 84.55% to 86.36%, with mean interval score improving from 11.287 to 9.268. For next-year predictions, coverage falls from 66.67% to 64.44%, and interval score worsens from 14.784 to 15.033. The next-year interval comparison has 90 matched observations because 2015 and 2016 lack five earlier eligible calibration outcomes. Both point comparisons retain all 110 observations. These empirical intervals do not guarantee future coverage.

## Completed prototype checks and independent review

Nine author-side behavioral checks passed. They verify exact result reproduction, feature arithmetic against the separate source parser, training and selection cutoffs, percentage-point unemployment changes, current and historical missing-data handling, and three temporal mutation cases. Altering GDP in or after 2020 does not change forecasts issued through 2020. Altering monthly values from 2021 onward does not change forecasts issued through 2020. Altering monthly observations after each fixed publication cutoff does not change any forecast.

One implementation error was corrected before reporting the results above. The first prototype mistakenly limited direct-model training to rows that already had incumbent out-of-sample forecasts. Direct models now use all complete source-feature rows with an eligible observed GDP target, as the frozen protocol requires. This restored the intended training history and complete candidate coverage. No candidate family, feature, penalty, selection rule or admission threshold changed.

The portable, frozen experiment is in [`research/broad-gdp-2026-10/`](../research/broad-gdp-2026-10/README.md). It includes the exact compressed input observations, protocol, predictions, source hashes, candidate scores, behavioral checks and independent review receipt. Research uses NumPy 2.3.4; the production refresh has no new dependency.

A separate reviewer reproduced all 350 forecast records, selection decisions, interval calibration and reported scores without importing the prototype or production model implementation. The full raw-source review passed 32,236 numerical comparisons. Both admission decisions were independently confirmed; the existing public forecast model remains in place. See the [independent review](BROAD-GDP-INDEPENDENT-REVIEW.md). A later experiment must declare a new protocol and acknowledge these inspected outcomes. Prospective scoring of immutable future forecast receipts remains necessary.
