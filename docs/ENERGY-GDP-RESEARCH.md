# Monthly energy inputs for provincial GDP forecasts

Independent research and prototype completed on 2026-10-20. The tested augmentation does not clear its predeclared accuracy gate. Keep the incumbent GDP forecasts in production. Publish the monthly inputs and experiment evidence, and retain the promotion gate for later data releases.

## Research basis

[Chernis, Velasco and Cheung (Bank of Canada, 2017)](https://www.bankofcanada.ca/2017/06/staff-discussion-paper-2017-8/) show that timely mixed-frequency indicators can improve provincial GDP nowcasts. Their wider dynamic-factor system uses many provincial, national and international indicators. That result does not establish that these three energy series improve this app’s smaller annual model.

[The ECB’s short-term forecasting framework (2020)](https://www.ecb.europa.eu/press/economic-bulletin/articles/2020/html/ecb.ebart202002_02~47da9ba4f7.en.html) supports parsimonious bridge equations, explicit publication delays, and model combinations. It also identifies revisions, weather and structural breaks as practical risks. [Chernis and Webley (Bank of Canada, 2022)](https://www.bankofcanada.ca/2022/05/staff-discussion-paper-2022-12/) provide a useful basis for evaluating forecast combinations and uncertainty separately.

This experiment uses a pooled residual bridge instead of a large dynamic-factor model. Oil and gas each provide only nine historical January–July growth observations through 2025. A complex province-specific model would have too few annual outcomes. Province centering and a fixed ridge penalty reduce overfitting. The experiment does not claim to replicate those papers.

## Frozen experiment

The prototype uses records keyed by commodity, province and month. It derives January–July cumulative production growth against the same months of the preceding year. Its target is annual all-industry real GDP growth at basic prices. A missing month, suppressed value, absent series or zero prior-year sum makes that predictor unavailable. Gas units cancel in the growth ratio; the underlying thousand-GJ scale remains recorded.

The design was frozen before first inspection of holdout metrics or predictions. Target years 2015–2022 form the development sample. Target years 2023–2025 form the fixed final holdout. The two horizons predict the origin year and the following year. Outcomes can train, select or calibrate only when their target year is strictly before the forecast origin.

The incumbent keeps its complete expanding-origin model selection procedure and September employment cutoff. Energy predictors stop at July at every October assessment, a conservative three-calendar-month publication allowance. This compares the extra energy signal against the same existing information set. It does not give the candidate later annual outcomes or change the incumbent’s ten-row training requirement.

Four candidates were fixed in advance. Each commodity supplies a pooled correction to the incumbent’s earlier out-of-sample residuals. The fourth averages the available commodity corrections. The regression centers both predictor and residual within each province. The penalty is the number of training rows times one. The predicted correction subtracts the province’s training residual mean, so it responds to the energy deviation without adding an unrelated residual intercept correction. The correction is clipped at ±1 percentage point and then multiplied by 0.5. Its maximum effect is ±0.5 percentage points.

A pooled fit requires at least five distinct prior target years and four provinces with five own training rows. The forecast province must also have five rows. A candidate needs three earlier paired forecast outcomes for that province, at least 5% lower prior MAE than the full incumbent, and no increase in prior RMSE. The candidate with lowest eligible prior MAE is selected; otherwise the incumbent is used. All of these thresholds were fixed before the holdout result was read.

The horizon-level release gate requires at least 5% lower holdout MAE, no worse holdout RMSE, no worse MAE in at least two of the three holdout years, and no province’s holdout MAE worsening by more than 0.25 percentage points. These are conservative engineering gates, not tests of statistical significance.

## Data and source history

| Predictor | Official table | Available history | Relevant break |
| --- | --- | --- | --- |
| Crude oil production | [25-10-0063-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510006301) | January 2016–July 2026 | No inactive predecessor is appended. |
| Marketable natural gas, energy content | [25-10-0086-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510008601) | January 2016–July 2026 | Uses the active table’s revised history only. |
| Electricity generation | [25-10-0015-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510001501) | January 2008–July 2026 | 2016 growth crosses expanded renewable coverage and is excluded. |

The prototype independently selects the exact source dimensions from the official raw archives. It does not import the monthly production parser. It uses the already validated GDP and employment histories retained in the published forecast snapshot. All 20 current incumbent forecasts and all 220 incumbent historical evaluation predictions reproduce to within 1e-12 percentage points.

Province centering accounts for persistent differences in provinces’ typical energy growth and forecast residuals. Fixed 2022 GDP exposure shares are not applied to earlier origins. Doing so would introduce future information. A true exposure-weighted model would require comparable nominal industry shares from each prior release year, with an explicit extra publication lag. This version does not approximate those unavailable historical weights with current shares.

## Final holdout results

MAE and RMSE are in percentage points of annual real GDP growth. Each horizon has 30 province-year outcomes but only three distinct annual shocks. The provinces are not 30 independent time replications.

| Horizon | Method | MAE | RMSE | MAE change versus incumbent |
| --- | --- | ---: | ---: | ---: |
| Current year | Incumbent | 0.8928 | 1.4086 | +0.00% |
| Current year | Full energy-selection policy | 0.8866 | 1.3934 | +0.69% |
| Current year | Historical mean | 0.9141 | 1.3068 | -2.39% |
| Next year | Incumbent | 0.9332 | 1.3721 | +0.00% |
| Next year | Full energy-selection policy | 0.9332 | 1.3721 | +0.00% |
| Next year | Historical mean | 0.9732 | 1.3414 | -4.29% |

Neither horizon passes the 5% MAE gate. Both pass the RMSE, annual consistency and province-regression checks. The final holdout shows a 0.70% current-year improvement and no next-year improvement for the complete policy. That is insufficient evidence to change public forecasts.

On the development sample, the selection policy remains exactly the incumbent. Earlier evidence never qualifies a correction. Oil and gas only obtain enough history for late evaluations, so the apparent performance of an always-on correction should not be mistaken for a historically available selection policy.

### Province results

Each province has three holdout outcomes per horizon. The table compares the complete selection policy, not the best candidate chosen after observing outcomes.

| Province | Current-year incumbent MAE / RMSE | Current-year policy MAE / RMSE | Next-year incumbent MAE / RMSE | Next-year policy MAE / RMSE |
| --- | ---: | ---: | ---: | ---: |
| NL | 2.7075 / 3.5332 | 2.5554 / 3.4446 | 2.6095 / 3.2103 | 2.6095 / 3.2103 |
| PE | 0.6740 / 0.6959 | 0.6740 / 0.6959 | 1.0250 / 1.1339 | 1.0250 / 1.1339 |
| NS | 0.3006 / 0.3872 | 0.3006 / 0.3872 | 0.7225 / 0.9008 | 0.7225 / 0.9008 |
| NB | 0.3298 / 0.3645 | 0.3350 / 0.3687 | 0.7651 / 0.8498 | 0.7651 / 0.8498 |
| QC | 1.3970 / 1.6691 | 1.3970 / 1.6691 | 0.9566 / 1.0634 | 0.9566 / 1.0634 |
| ON | 0.6972 / 0.6996 | 0.6972 / 0.6996 | 0.6534 / 0.7467 | 0.6534 / 0.7467 |
| MB | 0.7667 / 0.8984 | 0.8518 / 0.9974 | 0.6375 / 0.6421 | 0.6375 / 0.6421 |
| SK | 0.6249 / 0.7197 | 0.6249 / 0.7197 | 1.0498 / 1.6468 | 1.0498 / 1.6468 |
| AB | 0.4422 / 0.5862 | 0.4422 / 0.5862 | 0.1611 / 0.2281 | 0.1611 / 0.2281 |
| BC | 0.9878 / 1.2835 | 0.9878 / 1.2835 | 0.7519 / 0.9139 | 0.7519 / 0.9139 |

The current-year policy changes only three holdout forecasts. It improves Newfoundland and Labrador but worsens Manitoba and New Brunswick. Other provinces remain on the incumbent. No next-year forecast qualifies for a correction during the holdout. The territories remain outside the GDP forecast model because comparable employment inputs are unavailable.

### Candidate diagnostics

These rows apply each fixed correction whenever it can be fit, without selecting it after observing the holdout. They are diagnostics, not alternative release decisions. The all-province numbers include the incumbent fallback where a candidate is unavailable.

| Horizon | Candidate | All-province MAE | All-province RMSE | Eligible province-years | Eligible-only incumbent MAE | Eligible-only candidate MAE |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Current year | oil-residual | 0.8919 | 1.3583 | 18 | 1.0377 | 1.0363 |
| Current year | gas-residual | 0.8879 | 1.4059 | 18 | 0.7465 | 0.7383 |
| Current year | electricity-residual | 0.8932 | 1.4109 | 30 | 0.8928 | 0.8932 |
| Current year | equal-energy-residual | 0.8826 | 1.3729 | 30 | 0.8928 | 0.8826 |
| Next year | oil-residual | 0.9194 | 1.3664 | 12 | 0.8824 | 0.8478 |
| Next year | gas-residual | 0.9322 | 1.3716 | 12 | 0.8507 | 0.8480 |
| Next year | electricity-residual | 0.9344 | 1.3717 | 30 | 0.9332 | 0.9344 |
| Next year | equal-energy-residual | 0.9281 | 1.3689 | 30 | 0.9332 | 0.9281 |

Electricity worsens holdout MAE in both horizons. The always-on oil and gas corrections make small average gains, but neither the independent candidates nor the equal-energy blend establishes a robust deployment improvement. The current inner rule would propose a +0.5-point oil correction for Newfoundland and Labrador in 2026. The failed outer gate prevents its promotion.

### Recession sensitivity

| Sample | Horizon | Incumbent MAE | Policy MAE | Incumbent RMSE | Policy RMSE | Outcomes |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Development 2015–2022 | Current year | 2.0617 | 2.0617 | 2.9248 | 2.9248 | 80 |
| Development 2015–2022 | Next year | 2.5712 | 2.5712 | 3.4922 | 3.4922 | 80 |
| Pandemic 2020 | Current year | 4.8191 | 4.8191 | 5.3081 | 5.3081 | 10 |
| Pandemic 2020 | Next year | 6.5038 | 6.5038 | 6.7129 | 6.7129 | 10 |
| 2015–2025 excluding 2020–2021 | Current year | 1.2588 | 1.2567 | 1.9914 | 1.9878 | 90 |
| 2015–2025 excluding 2020–2021 | Next year | 1.4699 | 1.4699 | 2.1641 | 2.1641 | 90 |

The 2020 current-year errors are about 4.82 percentage points and the next-year errors about 6.50. This small bounded energy adjustment does not solve crisis forecasting. Oil and gas were not yet eligible for correction in that episode.

## Limits and recommendation

This is a latest-vintage pseudo-real-time exercise. Historical source values have been revised. A three-month availability rule recreates a conservative monthly cutoff; it does not recover the exact original release vintage, actual historic release delays or what forecasters knew then. Electricity is affected by weather and maintenance. Oil and gas quantities do not measure household prices or causal price-to-GDP effects. Current-year inputs should be expected to help nowcasts more than the following year, but that expectation is not a measured improvement.

Keep the public numerical GDP forecasts unchanged. Ship the reproducible energy experiment, source-qualified inputs, paired historical comparison and explicit promotion gate. Save monthly source vintages from this point onward so future testing can measure real-time revisions. Further gains should be tested with independently specified models and new holdout years, not by repeatedly tuning this same three-year holdout.

## Reproduction and verification

The local research artifacts are in `.data-cache/energy-gdp-research/`. Run `python3 .data-cache/energy-gdp-research/prototype.py` and then `python3 .data-cache/energy-gdp-research/audit.py`. `protocol.json` records the frozen choices. `results.json` contains all forecast origins, candidate corrections, eligibility, training cutoffs, selection cutoffs and scores. `audit.json` records exact incumbent reproduction and temporal checks. These are research artifacts; production implementation belongs to the parent task.

The Model the Domain principle led to explicit commodity–province–month observations and unavailable predictors. Prove It Works led to direct CSV extraction, exact incumbent reproduction and cutoff assertions. The benchmark checklist was applied to accuracy rather than runtime. No speed claim is made; the limits are short annual histories, revised inputs and only three holdout years.
