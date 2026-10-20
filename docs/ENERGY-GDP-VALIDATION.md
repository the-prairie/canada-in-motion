# Independent validation of monthly energy inputs in provincial GDP forecasts

Review date is 20 October 2026. The task is to determine whether monthly physical energy activity improves forecasts of annual provincial real GDP growth. This is a predictive exercise. It does not identify the effect of changing an energy price.

## Protocol frozen before the outer results

The outer evaluation targets are 2023, 2024 and 2025. This reviewer proposed these checks before seeing the augmentation's scores, and the implementation owner accepted them before running the final evaluation.

The comparator is the complete existing forecasting policy, including its historical-mean fallback and its choice among employment and autoregressive models. A comparison only against a historical mean would not establish improvement over the app users already have.

All fitted outcomes, selection outcomes and error-calibration outcomes must have `targetYear < originYear`. Each historical origin refits its model and selects its policy using only those earlier outcomes. Current-year and next-year forecasts have separate selection histories and release decisions.

The accepted candidate construction is fixed before the outer evaluation. It fits separate ridge regressions of incumbent forecast errors against oil, gas and electricity growth. The equal-energy candidate averages the available corrections from those fitted regressions. The ridge penalty is the training count multiplied by one. The correction removes the province’s mean training residual, so only the slope times the deviation of current energy growth from its training mean remains. That increment is capped at one percentage point in either direction, then half is added to the incumbent forecast. The training minimum is five distinct completed target years, with at least four provinces each having five training years. The inner selection gate requires at least three earlier paired target years, at least 5% lower MAE, and no higher RMSE than the incumbent. No alternative penalties, blend weights, caps or geography exclusions may be selected using the outer results.

The outer release gate requires all of the following, separately for each horizon.

- At least 5% lower mean absolute error across the full ten-province policy on the same target years.
- Root mean squared error no higher than the incumbent.
- Mean absolute error no higher in at least two of the three target years.
- No province's held-out MAE worsens by more than 0.25 percentage points.

These are explicit engineering release thresholds. The literature does not make them a test of statistical significance. The thirty province-year rows contain only three shared economic years. They must not be represented as thirty independent macroeconomic experiments. Report per-province and per-year errors, the eligible subset, and the number of forecasts actually changed by energy. A fallback is useful protection, but an unchanged forecast is not evidence that energy helped.

A candidate that fails the gate remains an inspectable experiment. It must not change the live point forecast or silently widen its range to claim success.

## Data definition and availability

The annual target is all-industry real GDP at basic prices from Statistics Canada table 36-10-0711-01. Preliminary provincial industry GDP is published in the spring after the reference year and revised in the fall. The 2025 release was published on 1 May 2026. A historical October origin may therefore use prior-year GDP, but not current-year GDP. This is different from the later-release provincial income and expenditure accounts discussed in some nowcasting papers. [Statistics Canada release](https://www150.statcan.gc.ca/n1/daily-quotidien/260501/dq260501a-eng.htm), [survey methodology](https://www23.statcan.gc.ca/imdb/p2SV.pl?Function=getSurvey&Id=1570354&wbdisable=true).

The October exercise uses employment through September and energy through July. These cutoffs are held constant at every historical origin. The current energy release was published on 29 September 2026 and concerns July. This is a conservative simulated three-calendar-month lag, not an archive proving that every historical release had exactly that timing. [Energy statistics, July 2026](https://www150.statcan.gc.ca/n1/daily-quotidien/260929/dq260929c-eng.htm).

Energy growth is `100 × (sum of January–July current-year levels / sum of January–July prior-year levels − 1)`. It is not an average of monthly growth rates, and it is not annualized. Every month on both sides must be published and the prior-year total must be positive. Confidential, missing and unreliable observations cannot become zeros. Published zeros remain zeros; a zero prior-year total cannot produce a growth feature.

| Signal | Source and exact selection | Normalized unit | Independently downloaded history |
| --- | --- | --- | --- |
| Oil | 25-10-0063-01, crude oil production, cubic metres. Excludes equivalent products. | m³ | January 2016 to July 2026 |
| Natural gas | 25-10-0086-01, marketable production, supply, gigajoules. | GJ, source values multiplied by 1,000 | January 2016 to July 2026 |
| Electricity | 25-10-0015-01, all producer classes and all generation types. | MWh | January 2008 to July 2026 |

Source tables are [oil](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510006301), [gas](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510008601) and [electricity](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510001501).

This reviewer downloaded the three source archives independently and parsed them without importing the production parser. The retained audit inputs and independent YTD totals are in `.data-cache/energy-gdp-validation/`. The independently selected source rows number 1,143 for oil, 1,778 for gas and 3,122 for electricity. The oil count includes the separately published Atlantic aggregate, which must not be assigned to an individual province. The current month has no disclosed Ontario oil value. Nova Scotia gas growth is undefined after production reaches zero. Those facts constrain the available predictors, not the existence of the economies being forecast.

The active gas table was introduced in 2026 and carries revised historical observations. A historical-period cutoff does not recover the exact values originally available to forecasters. This entire evaluation uses latest-vintage data with simulated release timing. It must not be called a true real-time forecast record. The table also documents a 2026 unit-heading correction, reinforcing the need to validate the scalar rather than infer it from a display label. [Table notes](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510008601).

## Research implications

The Bank of Canada's provincial mixed-frequency research supports testing timely monthly indicators against annual outcomes. It does not establish that three energy series alone improve this app's existing model. It also uses a broader information set and a different implementation. [Chernis, Velasco and Cheung, 2017](https://www.bankofcanada.ca/2017/06/staff-discussion-paper-2017-8/).

Forecast combinations can reduce dependence on one model, but the benefit varies with horizon and model diversity. That supports a fixed conservative blend evaluated against the incumbent. It does not justify searching many blend weights on three holdout years. [Granziera, Luu and St-Amant, 2013](https://www.bankofcanada.ca/wp-content/uploads/2013/08/boc-review-summer13-granziera.pdf).

Research comparing real-time and revised-data nowcasts finds that data revisions matter to model rankings and forecast performance. The app's evaluation therefore needs the revised-data caveat beside its accuracy result, not only in a source appendix. [Chernis and Webley, 2022](https://www.bankofcanada.ca/2022/05/staff-discussion-paper-2022-12/), [Zheng and Rossiter, 2006](https://www.bankofcanada.ca/2006/08/working-paper-2006-26/).

Electricity generation includes industrial self-generation, and weather can move hydroelectric supply without moving the rest of an economy similarly. Oil and gas production omit prices, investment and much of the service economy. The model must learn a predictive relationship; it cannot translate physical percentage growth directly into GDP percentage growth.

The electricity survey expanded its target population in January 2016. The feature comparing 2016 with 2015 is therefore excluded; the source’s metadata documents that coverage break.

Fixed 2022 nominal energy shares would leak future information into earlier folds. Chained-dollar industry levels cannot be treated as additive nominal weights. Neither weighting shortcut is allowed in this experiment.

## Independent implementation checks

The independent reproduction imports neither the implementation nor the prototype. It derives one- and two-variable ridge coefficients using direct linear algebra, reconstructs the incumbent model-selection policy, and computes energy totals from separately downloaded archives. All 350 reconstructed incumbent forecasts, 326 energy corrections and 350 inner selections matched. The check contains 1,660 numeric assertions.

| Horizon | Held-out province-years | Incumbent MAE | Energy-policy MAE | MAE change | Forecasts actually changed |
| --- | --- | --- | --- | --- | --- |
| Current year | 30 | 0.892776 pp | 0.886576 pp | 0.695% lower | 3 |
| Next year | 30 | 0.933249 pp | 0.933249 pp | No change | 0 |

Current-year RMSE fell from 1.408606 to 1.393355 percentage points. Next-year RMSE stayed 1.372052 percentage points. All three changed current-year forecasts are for 2025. Newfoundland and Labrador improves, while New Brunswick and Manitoba worsen. Both horizons fail the frozen 5% improvement threshold. The result does not support changing the public GDP forecasts. The small pooled gain is a descriptive result, not evidence of a reliable new forecasting advantage.

The durable independent audit is [tests/review/energy-forecast-independent-audit.py](../tests/review/energy-forecast-independent-audit.py). It does not import the production source parser or regression model. It reconstructs the incumbent and challenger from the raw source archives and the retained annual GDP and employment history.

The production artifact passed 3,556 numeric comparisons. All 410 feature records, 350 historical forecast rows, candidate predictions, inner selections, aggregate errors and release decisions agreed with the independent implementation. All 20 public point forecasts and their upper and lower bounds matched independently reconstructed incumbent forecasts. The three source archive hashes matched separately downloaded copies.

Reproduce the audit after downloading the three source ZIP archives into the supplied directory.

```sh
python3 tests/review/energy-forecast-independent-audit.py \
  --raw-dir .data-cache/energy-gdp-validation \
  --output .data-cache/energy-gdp-validation/artifact-audit.json
```

Separate mutation checks ran against the actual production module.

- Multiplying every August–December energy observation by 1,000,000 left every January–July feature unchanged.
- Multiplying all energy observations from 2024 onward by 1,000,000 left predictions and selections through the 2023 origin unchanged.
- Multiplying all GDP outcomes from 2025 onward by 1,000,000 left predictions and selections through the 2025 origin unchanged. The 2025 outcome was not available at that origin.
- Suppressing Alberta’s July 2026 readings made its features unavailable and preserved all incumbent public forecasts.
- A September 30 origin and an employment cutoff before September both returned an explicit outside-tested-cutoff status.

Mutation results and the first production comparison are retained locally in `.data-cache/energy-gdp-validation/production-audit.json`. The published-artifact audit is retained in `artifact-audit.json` there.

## Review verdict

Approved for shipping the source features, reproducible evaluation and visible decision to retain the incumbent. No blocking numerical or temporal findings remain in that scope. The review does not approve changing provincial GDP point forecasts or ranges from this experiment. The observed gain is below the frozen release threshold and confined to three changed cases in one year. A future numeric gate pass still requires independent admission; the production module cannot silently promote a model.
