# Provincial price and GDP research

The app now has reproducible provincial GDP comparisons for annual oil and natural-gas price changes. They are conditional historical associations. They do not estimate a causal intervention, predict an entire provincial economy from an energy price, or modify the separate provincial GDP forecast.

## Why this model

An energy-price change can reflect supply disruption, global demand, exchange rates or several causes together. Kilian’s [published decomposition of oil-price shocks](https://www.aeaweb.org/articles?id=10.1257/aer.99.3.1053) explains why those causes matter and why a single oil-price coefficient can vary across periods. The app therefore labels its new quantity as a comparison within a fitted historical model.

The Bank of Canada’s [local-projection study](https://www.bankofcanada.ca/2019/07/staff-discussion-paper-2019-6/) first identifies structural supply shocks before estimating macroeconomic responses. Our price slider does not supply that identification. We use annual horizon-specific regressions to answer a narrower question that the available inputs support.

A structural production-network model is the stronger long-term route to mechanism-specific scenarios. The Bank’s [2020 production-network paper](https://www.bankofcanada.ca/2020/11/staff-working-paper-2020-44/) models input-output links and adjustment in a commodity-exporting economy. Implementing its Canadian national calibration as a provincial simulator would also require regional sector shares, substitution and investment responses, cross-border ownership, public-sector behaviour, and provincial validation. We did not invent these parameters or turn the app’s static trade repricing into a structural GDP model.

The Bank’s [regional oil-shock study](https://www.bankofcanada.ca/2018/11/staff-working-paper-2018-56/) identifies trade and redistribution as channels through which producing and other regions are linked. This supports testing shared information across regions, but does not establish the coefficients used here. Those coefficients are estimated from the app’s published histories.

## Sources and units

- [Statistics Canada table 36-10-0222-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610022201). Real GDP at market prices in millions of chained 2017 Canadian dollars. Provincial observations begin in 1981. Nunavut and the current Northwest Territories series begin in 1999.
- [EIA WTI annual spot prices](https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RWTC&f=A). Nominal US dollars per barrel.
- [EIA Henry Hub annual spot prices](https://www.eia.gov/dnav/ng/hist/rngwhhdA.htm). Nominal US dollars per million Btu. Henry Hub is a US wholesale benchmark. It is not AECO or a provincial household tariff.
- [EIA Henry Hub monthly spot prices](https://www.eia.gov/dnav/ng/hist/rngwhhdM.htm). The retrieved annual source omits 2013. All twelve monthly observations are present. Their mean, 3.728333333 US$/MMBtu, is retained as an explicitly labelled fallback. No missing year is treated as zero.

The snapshot retains source URLs and SHA-256 hashes, source retrieval dates, GDP observations, annual prices and the monthly gas observations. It includes the original dynamic-history data version. No third-party model API is required.

## Estimation and historical checks

Each jurisdiction has two outcomes.

1. Real GDP during the price-change year relative to the preceding year.
2. Real GDP through the following year relative to the year preceding the price change.

The regression outcome is `100 × log(GDP(t+h) / GDP(t−1))`. Regressors are an intercept, the preceding annual GDP log change and the contemporaneous annual energy-price log change.

The second outcome spans two years. It does not assume that the original price change persists. Future energy prices are unconditioned, so the existing persistent/temporary national scenario control does not change this model.

The candidate family contains own-province ordinary least squares, pooled peer-group slopes with province intercepts, and an equal blend of the two. Oil-producing peers are Alberta, Saskatchewan and Newfoundland and Labrador. Gas-producing peers are Alberta, British Columbia and Saskatchewan. Other provinces form the other peer group. Territories retain their own regressions. Groups are fixed by economic role rather than GDP fit scores.

At every historical origin, the pipeline refits using outcomes that end strictly before that price-change year. It selects the candidate with the lowest error over earlier evaluations whose outcomes have ended. The first five evaluations use the own-province model. The no-price autoregression chooses its pooling variant separately by the same earlier-error rule.

Every price model is compared against both that no-price autoregression and a historical mean. Oil requires 18 initial training observations; gas requires 12. Evaluation begins no earlier than 2006. The full snapshot contains every prediction, selected candidate, baseline prediction, training end year and selection end year.

**The held-out price-change year’s energy price is treated as observed. These are conditional historical tests, not forecasts that could have been issued at the start of that year.** GDP uses the latest available vintage. Researching the candidate family on this history introduces design reuse even though per-origin fitting and selection exclude future outcomes. Neither the historical tests nor the ranges establish causality.

The production evidence screen requires all of these conditions.

- At least 12 held-out origins.
- At least 5% lower mean absolute error than both no-price baselines.
- Root mean squared error no worse than either no-price baseline.
- A positive error improvement after excluding outcome windows that include 2020 or 2021.
- A nonnegative error improvement for origins from 2015 onward.
- At least 80% of historically selected coefficients have the same sign as the final fitted coefficient.

These are application criteria, not thresholds claimed by the cited papers. Failed models stay available for inspection. Their point estimates are exploratory and do not become headline forecasts.

## Results in the initial release

These results use GDP outcomes through 2024. Mean absolute errors are percentage points of the observed cumulative real GDP change. “No-price MAE” is the better of the historical mean and separately selected autoregression on the same held-out origins.

| Benchmark | Province | Outcome | Held-out origins | Model MAE | No-price MAE | Improvement | Screen |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| WTI | Québec | Price-change year | 19 | 1.219 | 1.433 | 15.0% | Pass |
| WTI | Manitoba | Price-change year | 19 | 1.092 | 1.250 | 12.6% | Pass |
| WTI | Saskatchewan | Price-change year | 19 | 2.817 | 3.018 | 6.7% | Pass |
| WTI | British Columbia | Price-change year | 19 | 1.450 | 1.533 | 5.4% | Pass |
| WTI | Manitoba | Through next year | 18 | 1.990 | 2.185 | 8.9% | Pass |
| WTI | British Columbia | Through next year | 18 | 2.267 | 2.390 | 5.1% | Pass |
| Henry Hub | Québec | Price-change year | 15 | 1.281 | 1.592 | 19.5% | Pass |
| Henry Hub | British Columbia | Through next year | 13 | 1.617 | 1.893 | 14.6% | Pass |
| WTI | Alberta | Price-change year | 19 | 2.904 | 3.305 | 12.2% | Exploratory |

Alberta’s current same-year oil fit has a positive coefficient. Its conditional GDP comparison for a 10% price increase is approximately +0.54%, with an 80% bootstrap parameter range of +0.28% to +0.77%. The model’s coefficient was negative in four early held-out origins and positive in the remaining fifteen. Its 78.9% sign stability fails the fixed 80% screen. We did not lower the threshold to promote it.

The full own-province, pooled and blended experiments remain in the research cache. Simple ridge variants were also tested. They did not resolve Alberta’s early sign instability. The shipped pipeline evaluates the nested pooling rule rather than retrospectively assigning each province its best-performing model.

## What the ranges mean

The parameter range uses 400 deterministic moving-block pairs resamples. Each block contains three consecutive years. Peer provinces are resampled with the same years, which preserves their contemporaneous relationship. The range holds the selected model variant fixed. It excludes model-selection uncertainty, structural identification uncertainty and future GDP shocks.

The separate outcome-error range targets 80% coverage using earlier conditional prediction errors. Its coverage is evaluated sequentially. Small samples make that coverage uncertain. For example, the British Columbia following-year gas model covered four of seven eligible later outcomes, or 57.1%, despite its lower average error. The app must not describe its parameter range as an 80% range for future GDP.

To compare a price change with the same model’s unchanged-price path, the client uses:

```text
GDP-level difference (%) = 100 × expm1(coefficient × log1p(priceChangePct / 100))
```

It transforms both parameter endpoints and sorts them, because a negative price change reverses their order. A zero price change produces exactly zero difference. This percentage is not an amount of GDP, a change in annual growth percentage points, or an addition to the independently generated provincial forecast.

## Electricity

There is no common Canadian wholesale electricity price that represents every province. [AESO publishes Alberta pool prices](https://www.aeso.ca/market/market-and-system-reporting/), while regulated tariffs, market rules and generation conditions differ elsewhere. The [CER’s electricity material](https://www.cer-rec.gc.ca/en/data-analysis/energy-commodities/electricity/) distinguishes commodity statistics and residential bills.

The current electricity control therefore does not generate a provincial GDP coefficient. Household electricity costs can be studied from provincial retail-price histories without claiming that those histories identify an electricity-to-GDP response. A future GDP model needs an explicit provincial market or tariff intervention, industrial exposure, generation availability and suitable historical variation.

## Reproduction and integration

```sh
python3 pipeline/refresh_price_response.py
python3 -m unittest discover -s pipeline -p 'test_price_response.py' -v
```

Use `--offline` after a successful online acquisition to reproduce from the verified cache. The generated artifact is `data/provincial-price-response.json`. The refresh has no nonstandard Python dependencies.

The **Model the Domain** principle led to distinct benchmark, horizon, conditional fit, parameter range and historical error fields. **Explain the Number** required publication of the baseline errors, failed screens, pandemic sensitivity, selection timing and range coverage alongside the more favourable results.
