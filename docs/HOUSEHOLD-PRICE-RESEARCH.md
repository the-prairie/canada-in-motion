# Household energy price estimates

The household model provides conditional oil-to-motor-fuel estimates for ten provinces. It also supplies separate arithmetic for an explicit all-in retail price scenario. Natural gas benchmark models failed the release rule. The app must not display those estimates as accepted results.

## Model choice

[Chacra’s Bank of Canada working paper](https://publications.gc.ca/collections/collection_2014/banque-bank-canada/FB3-2-102-38-eng.pdf) uses an error-correction approach and compares retail-energy forecasts with autoregressive and random-walk alternatives. It also documents different price transmission across gasoline, natural gas and electricity. This implementation uses a smaller monthly distributed-lag model in log changes. It does not reuse the paper’s historical coefficients or claim to replicate its model.

[Bank of Canada’s gasoline explanation](https://www.bankofcanada.ca/2024/06/what-you-pay-for-at-the-pump/) identifies crude costs, exchange rates, refining, retailing and taxes as relevant components. The model converts monthly WTI to Canadian dollars. Scenario calculations hold the exchange rate fixed.

Direct utility tariff calculation remains preferable for a specified customer and utility. The [Ontario Energy Board’s electricity description](https://www.oeb.ca/consumer-information-and-protection/electricity-rates/understanding-your-electricity-bill) separates energy, fixed and variable delivery charges, regulation and rebates. Its [gas description](https://oeb.ca/consumer-information-and-protection/natural-gas-rates/understanding-your-natural-gas-bill) explains quarterly supply-cost approvals, storage, delivery and fixed customer charges. A wholesale price change cannot be applied proportionally to the whole bill.

The retail scenario therefore changes the all-in consumer price index explicitly. It does not model a utility commodity tariff or infer a wholesale-to-retail response. This distinction applies to electricity and to rejected gas estimates.

## Data and population

[StatCan 18-10-0004-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000401) supplies provincial monthly CPI for gasoline, natural gas, electricity and fuel oil. The snapshot retains monthly observations, vectors and source flags from 1999 onward. Current calibration ends at the latest common complete month.

[StatCan 11-10-0222-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1110022201) supplies 2023 average expenditure per household. The population includes zero-spending households. A province-wide mean is not a median family or a typical connected customer. This interpretation follows the [2023 SHS user guide](https://www150.statcan.gc.ca/n1/pub/62f0026m/62f0026m2025001-eng.htm). Territories are not in the spending table.

The motor-fuel category covers gas and other fuels for all vehicles and tools. Gasoline CPI is an explicitly identified proxy. Other household fuel spending also includes wood, so it is not relabelled as heating-oil spending. Four Atlantic provinces have no usable natural-gas CPI path. Newfoundland and Labrador and PEI spending is suppressed. Nova Scotia and New Brunswick have reported spending but no CPI basis for updating it. All original observations remain in the snapshot.

Published spending is updated to a trailing twelve-month average CPI. It remains a fixed-quantity spending equivalent. It does not account for changed consumption, home efficiency, vehicle ownership, household composition, utility-specific contracts or benefits.

Monthly benchmarks come from [EIA WTI](https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RWTC&f=M) and [Henry Hub](https://www.eia.gov/dnav/ng/hist/rngwhhdm.htm). Currency conversion uses [Bank of Canada historical monthly USD/CAD](https://www.bankofcanada.ca/valet/observations/IEXM0101/json?start_date=1990-01-01) through 2016 and monthly averages of [daily USD/CAD](https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?start_date=2017-01-01) from 2017. The noon-to-daily-average series transition is retained in the source definitions.

## Validation and release rule

Each monthly fit uses only prior observations. The model contains one own-price-change lag, month indicators and contemporaneous through lagged benchmark changes. Contemporaneous benchmark prices are treated as observed. These are conditional historical checks, not advance commodity-price forecasts or causal experiments. All data are the latest published vintage.

Oil uses three monthly lags fixed before inspection. Gas compares three, six and twelve lags using 2015–2019 monthly mean absolute error. The release rule requires at least sixty monthly checks and at least 10% lower error than the seasonal autoregressive comparator in both 2015–2019 and 2020–2025. It also requires a stable autoregressive coefficient and positive first-year response. The six estimated gas models fail this rule.

A separate annual check refits each January through the previous December and predicts twelve future CPI levels conditional on the observed benchmark path. It compares the annual-average predicted CPI with the observed annual average. This check is disclosed separately and does not determine acceptance. It does not validate household dollar bills.

| Province | Monthly audit MAE improvement | Annual audit CPI error | Earlier annual CPI error improvement |
|---|---:|---:|---:|
| NL | 37.6% | 3.34% | -18.4% |
| PE | 35.4% | 4.06% | 2.4% |
| NS | 39.5% | 4.54% | 20.4% |
| NB | 37.3% | 3.79% | 29.5% |
| QC | 37.1% | 3.14% | 36.2% |
| ON | 36.2% | 3.97% | -15.3% |
| MB | 30.9% | 5.79% | -30.8% |
| SK | 33.7% | 3.09% | 15.0% |
| AB | 25.4% | 5.77% | -31.8% |
| BC | 29.9% | 3.75% | -21.5% |

A negative value in the final column means that the model performed worse than its comparator in that earlier annual check. Alberta is one such case. A passing monthly model does not establish accurate annual household-bill forecasts.

The snapshot contains every monthly and annual prediction, actual value, comparator and training end date. The audit covers 72 monthly observations and six calendar-year averages per accepted province. The annual errors can be large relative to a modest scenario effect.

## Scenario calculation

For each month, the fitted model produces an elasticity of the retail price level to the benchmark level. The scenario transforms the specified percentage change through the log response, then averages the first twelve monthly retail-price effects. The average multiplied by updated annual household spending gives the annual price-only spending change. The monthly equivalent divides that result by twelve. It is not a forecast of any particular month’s bill.

The primary experience uses a persistent benchmark change over twelve months. The stored temporary path reverses the benchmark level after six months. That path is distinct from the national GDP scenario’s timing assumptions.

The parameter band uses 160 reproducible circular residual-block bootstrap draws, with twelve-month blocks. It reports the fifth and ninety-fifth percentiles of the resulting scenario effects. This band excludes future shocks, tax changes, survey sampling error, model choice and misspecification. It must be labelled a parameter-sensitivity range, not a 90% prediction interval for bills.

## Reproducibility

`pipeline/refresh_household_energy.py` downloads the six sources, records their hashes, recalibrates, and writes `data/household-energy-costs.json` atomically. The offline option requires matching cached source hashes. `pipeline/test_household_energy.py` checks release criteria, time ordering, signs, zero scenarios, missing-month behavior, suppression and dollar scaling.

Current data version is `f40b574bd2c8c815bfbe`. The source retrieval time is `2026-10-20T18:59:00Z`. No inference provider or paid API is used.

Model the Domain kept benchmark transmission separate from retail arithmetic. Prove It Works required actual downloaded observations, chronological checks, retained predictions and tests of suppressed values.
