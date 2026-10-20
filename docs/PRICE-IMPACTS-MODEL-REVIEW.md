# Independent scientific acceptance review

Verdict on 20 October 2026. Accept the conditional historical model and price-only household spending calculation for publication with the reviewed labels and failure states. No remaining numerical or interpretation blocker was found in this review. This acceptance does not cover causal GDP impacts, future household bills, browser usability, or deployment success.

## Independent reconstruction

The reviewer did not import the pipeline estimation functions or rerun their implementation tests as the basis for acceptance. `tests/research/reconstruct.py` uses NumPy least-squares SVD and explicit province dummy variables to reconstruct the GDP estimates. The production implementation uses a hand-written linear solver and within-province centering. The different implementations agree within `1e-8`.

The reconstruction checked these inputs and outputs.

- 572 GDP observations against the downloaded Statistics Canada CSV, including the chained 2017-dollar basis and millions scalar.
- 11,655 monthly CPI observations against the downloaded Statistics Canada CSV.
- 30 household spending references against the source CSV, including suppressed values and the all-household expenditure statistic.
- 666 monthly benchmark prices and CAD conversions against independently parsed EIA HTML and Bank of Canada observations.
- All 52 GDP models, their final coefficients, and 779 conditional historical predictions. The check independently selected own-province, pooled, and blended models using earlier eligible predictions.
- All 2,112 stored monthly household predictions and 176 recursive annual-average CPI predictions for the 16 estimable province-commodity pairs.
- Household repricing from the original expenditure year to the trailing twelve-month CPI average and the first-year response calculation.
- Three GDP bootstrap ranges from 400 resamples each. Cases were Alberta oil in the price-change year, Québec oil in that year, and British Columbia gas through the following year.
- All 160 Alberta oil household bootstrap paths, each spanning 24 months.
- All ten source-file hashes used by the two snapshots.

The largest numerical disagreement in the reconstruction was approximately `2.5e-12`. The stored GDP version was `a36f1473cf546e21156b`. The household version was `f40b574bd2c8c815bfbe`.

## Time ordering and model selection

For each GDP origin, every training outcome ended before the price-change year. Every observation used to select the pooled or own-province variant also had an outcome year before that origin. Following-year targets correctly accumulate GDP growth from the preceding year through the following year. They are not one-year growth rates.

The historical GDP comparison conditions on the realized contemporaneous annual commodity price. It uses current revised GDP observations. The pipeline and interface identify both facts. This is not a historical real-time forecasting experiment. An outcome having ended does not mean its GDP release was available at the start of that year.

The annual sample is small. The same history informed the candidate family and the final evidence screen, so nested chronological selection does not eliminate research-design reuse. The published methodology states that limitation. Passing the screen is an application rule, not evidence that a supply or demand shock has been identified.

Household monthly training ends before the predicted CPI month. Gas lag selection uses the 2015–2019 development period. The later 2020–2025 monthly audit remains separate. Oil uses a fixed three-lag specification. The annual check refits through the previous December and recursively advances retail CPI for twelve months. It does not feed future retail CPI into the recursive path.

## Units, population, and uncertainty

The GDP response calculation correctly transforms a log-price change into a relative fitted GDP-level difference. It does not add the result to the independent provincial forecast. The observed values and historical errors are ordinary cumulative GDP percentage changes after the exponential transformation. The initially incorrect log-change chart label was corrected during review.

The household baseline is average spending across all households, including zero-spending households. It is neither a typical connected customer nor a median household. This interpretation agrees with the [Survey of Household Spending user guide](https://www150.statcan.gc.ca/n1/pub/62f0026m/62f0026m2025001-eng.htm). The category for motor fuels is broader than gasoline alone. The implementation identifies gasoline CPI as a proxy.

The source tables are [11-10-0222-01 for household expenditure](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1110022201) and [36-10-0222-01 for provincial GDP](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610022201). Missing spending and missing CPI coverage remain unavailable. Nova Scotia and New Brunswick gas rows now state that spending was published but a usable CPI repricing path was absent.

Bootstrap ranges are parameter-sensitivity ranges conditional on the selected model. They do not include future shocks, model selection, structural identification, individual billing variation, or household-survey error. The interface now distinguishes GDP parameter ranges from the separate outcome-error band and discloses achieved historical coverage. British Columbia's following-year gas outcome band covered four of seven eligible outcomes, so its nominal 80% target cannot be presented as achieved future coverage.

## Household annual validation is a material limit

A passing monthly retail-price model does not establish an accurate annual household-bill forecast. Five provinces have worse annual CPI errors than their simpler comparator in the earlier development period. This remains in the research report and annual audit note.

An independently reconstructed Alberta example illustrates the size of the limitation. A sustained 10% oil-price decline gives a first-year average retail-price response of `−5.11837%`. Applied to the repriced spending reference of `$3,461.66`, it gives a price-only spending equivalent of `−$177.18` over twelve months, or `−$14.77` as a monthly equivalent. Alberta's annual CPI audit mean absolute percentage error is `5.76607%`. That error is larger than the magnitude of this illustrative retail-price response. The monthly equivalent is not the predicted bill for a particular month.

The reviewed interface now places the annual CPI error and comparator beside the household estimate. It also states that the output is a price-only spending equivalent rather than a validated annual bill forecast. This corrected a release-blocking presentation risk in the initial draft.

The [Bank of Canada paper on retail energy prices](https://publications.gc.ca/collections/collection_2014/banque-bank-canada/FB3-2-102-38-eng.pdf) uses a richer error-correction framework. It supports investigating dynamic retail transmission, but does not validate this app's coefficients. The research document makes that distinction.

## Accepted corrections

1. The GDP historical chart now labels ordinary percentage changes correctly.
2. Annual household CPI error and the bill-forecast limitation are visible beside the dollar result.
3. A failed GDP screen is described as a failed historical check. Failure of predictive improvement is no longer automatically called instability.
4. Missing gas CPI coverage in Nova Scotia and New Brunswick is distinguished from unpublished spending.

## Coverage limits

Eight of 52 GDP region-commodity-horizon models pass the stated screen. Alberta oil remains exploratory. The criteria were not relaxed to promote it. Electricity-to-GDP remains unsupported. The model uses nominal US-dollar WTI and Henry Hub changes. It does not identify an isolated CAD-price, AECO-price, exchange-rate, or utility-tariff intervention.

Ten oil-to-retail household models pass the monthly screen. Six natural-gas models fail it, and four Atlantic gas histories are unavailable. Separate retail-price arithmetic is available where a spending reference can be repriced. That arithmetic is an explicit all-in retail-price assumption, not an inferred effect of wholesale prices. Territories lack a comparable provincial spending baseline in this implementation.

No new paid inference was used. No application files were edited by this reviewer. Browser checks and release verification remain with the parent agent.

The Prove It Works principle required reconstruction from source observations rather than agreement with implementation tests. Explain the Number required separate monthly and annual checks, units, comparison errors, and parameter versus outcome uncertainty.

## Reproduction artifacts

- `tests/research/reconstruct.py` and `numerical-results.json` contain the independent observation, fit, chronological-selection, and response checks.
- `tests/research/uncertainty.py` and `uncertainty-results.json` contain source hashes and independent bootstrap reconstruction.
- `tests/research/benchmark_inputs.py` and `benchmark-input-results.json` contain independent HTML parsing and currency conversion checks.

The scripts use the bundled Python runtime with NumPy and the existing verified source cache. They do not download private data or call a model provider.
