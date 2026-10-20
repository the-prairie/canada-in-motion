# Independent provincial GDP forecast validation

Reviewed snapshot: `156c3939d0a89df609ba`, as of October 20, 2026.

The production forecasts are numerically reproducible. An independently written implementation reproduced all 20 current forecasts and all 220 published historical forecasts, including candidate predictions, current regression coefficients, chronological model selection and historical-error ranges. It made **2,380 checks and 2,340 numerical comparisons**, with a maximum absolute difference of **1.78 × 10⁻¹⁵**. No future target leakage was found in training, model selection or range calibration.

The independent fitter uses explicit one- and two-variable ridge algebra. It imports no production forecasting functions. It separately reconstructs GDP growth, January–September employment growth, province-centered training data and past-only model-selection samples.

## Reproduce

From the repository root:

```sh
python3 tests/review/provincial-forecast-audit.py
```

This reads the checked-in forecast snapshot and writes `.data-cache/forecast-review/PRODUCTION-AUDIT.json`. The original independent review receipt is saved as `docs/PROVINCIAL-FORECAST-INDEPENDENT-AUDIT.json`.

The underlying source audit independently matched **377 GDP observations and 6,699 monthly employment observations** against the downloaded Statistics Canada CSV archives. Every selected value, vector, period, jurisdiction and status matched. Both archive SHA-256 hashes matched the source registry. This verified source extraction and units, not historical-release vintages.

## Historical performance

Each simulated forecast uses annual GDP outcomes only through the preceding year and employment through the same displayed month cutoff. The assessment below includes target years 2015–2025; it evaluates the full adaptive selection procedure, including its simple-model fallback.

| Target | Province-year forecasts | Model MAE | Historical-mean MAE |
|---|---:|---:|---:|
| Current year | 110 | 1.743 percentage points | 2.093 percentage points |
| Next year | 110 | 2.124 percentage points | 2.141 percentage points |

The improvement is stronger for current-year estimates. Next-year forecasts often use historical mean growth because richer models did not consistently improve prior prediction errors. These province-year observations share economic shocks; they are not 110 independent years of evidence.

Provincial performance is uneven. Current-year MAE improves by roughly 47% in Nova Scotia, 35% in Ontario and 26% in Quebec, but only 7% in Alberta and 2% in Saskatchewan. Next-year New Brunswick, Ontario and Nova Scotia slightly underperform their simple baselines. The app must preserve these results rather than describe the model as uniformly superior.

## Range failures and release conditions

The ranges use an adjusted empirical quantile of earlier forecast errors. They are **historical-error ranges**, not guaranteed 80% confidence or prediction bands. Historical coverage varies materially:

| Province and target | Outcomes inside range |
|---|---:|
| Prince Edward Island, current year | 6 of 11 |
| Quebec, next year | 3 of 9 |
| British Columbia, next year | 4 of 9 |
| Ontario, next year | 5 of 9 |

The interface should show measured provincial coverage with the range audit. A pooled coverage figure must not stand in for a province-specific assessment. The displayed Wilson interval is a descriptive small-sample summary; dependent annual errors prevent treating it as a validated future-coverage guarantee.

The numerical review also identified a defensive validation gap: the initial JavaScript validator checked historical training and calibration cutoffs, but omitted selection cutoffs and current-fit cutoffs. The reviewed data itself was clean. The JavaScript validator now rejects snapshots with future training, selection or calibration targets and source publication dates later than the snapshot date. Regression tests cover these guards and pass.

## Scope

- The target is annual real GDP growth at basic prices. It is distinct from market-price GDP and energy-industry GDP elsewhere in the app.
- Forecasts use a single consistent provincial GDP series and published employment data. They do not splice GDP concepts or infer territories from provincial indicators.
- The historical exercise uses currently revised data with simulated release timing. It is not a reconstruction of original historical data releases.
- Model selection uses earlier resolved forecasts only; richer candidates require at least five prior cases and at least a 5% improvement over the mean baseline. The same rule is evaluated historically.
- Ranges use earlier resolved forecast errors only. Next-year outcomes are delayed before becoming available to selection and calibration.
- Forecasts are predictive estimates of economic growth. They do not identify the causal GDP effect of changing oil, gas or electricity prices.
- Territories remain without forecasts because comparable monthly indicator coverage is insufficient. Provincial chained-dollar levels are not summed into a Canada forecast.

## Literature informing the independent review

[Hyndman and Athanasopoulos, *Forecasting: Principles and Practice*](https://otexts.com/fpp3/toolbox.html) supports temporal validation, explicit baselines and evaluation at the requested horizon. [Gibbs and Candès (2024)](https://jmlr.org/papers/v25/22-1218.html) and [Zaffran et al. (2022)](https://proceedings.mlr.press/v162/zaffran22a.html) address adaptive uncertainty under temporal dependence and distribution shift. These works do not validate this app's forecasts or establish a guaranteed coverage rate for its short provincial series.

## Published snapshot verification

The public release rebuilt the same inputs on GitHub's Linux runner. Its forecast version is `85ade6d95bf18ee72515`. Source histories and nonnumeric fields match the reviewed local snapshot; floating-point arithmetic differs by at most 5.12 × 10⁻¹³, changing the content fingerprint without changing displayed estimates.

The independent fitter was rerun against the downloaded public JSON: all 2,380 checks and 2,340 numeric comparisons passed, with maximum error 1.38 × 10⁻¹⁴. The receipt is `docs/PUBLIC-FORECAST-INDEPENDENT-AUDIT.json`. To reproduce against a downloaded snapshot, use `python3 tests/review/provincial-forecast-audit.py --input /path/to/provincial-forecasts.json --output /path/to/audit.json`.
