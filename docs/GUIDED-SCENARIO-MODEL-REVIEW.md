# Guided trade and price scenario model review

Review date is 20 October 2026 in America/Edmonton.

**Model verdict.** Accept the guided scenario calculation with separate transaction, province-wide and household channels. The review found no numerical blocker in `summarizeGuidedConnection`. This is not acceptance of a causal simulation, a personal bill forecast, or a forecast of provincial household income. Browser acceptance and deployment evidence belong in the release report.

The subsequent production review covered `ui/guided-scenario.jsx`, the workspace boundary, source loading, selection normalization, and investigation persistence. Twelve additional regression tests in `tests/guided-scenario.test.mjs` pass. They include unsafe source URLs, invalid horizons and shocks, aborted and failed loads, scope changes, source-pinned replay, and separation of retail assumptions. No remaining model, state or provenance blocker was found in the reviewed code. This code review does not replace browser interaction tests.

The production review requested three presentation corrections. The guide now visibly describes GDP as a historical association rather than an identified causal effect. Household results show the named commodity benchmark and exchange-rate basis. When retail arithmetic lacks a spending or CPI reference, the guide states that missing-data reason instead of describing a failed commodity-to-retail model.

## What the connection means

The selected connection supplies an origin, destination, commodity, year and published trade value. It identifies the two regions whose separate results appear in the guide. It does not determine the GDP or household model coefficients.

| Channel | Quantity displayed | Permitted interpretation |
| --- | --- | --- |
| Selected exchange | Change in annual transaction value in current Canadian dollars | Published value multiplied by the chosen price change with quantities and product mix fixed. The seller's additional receipts equal the buyer's additional cost. |
| Province's domestic trade | Sales, purchases and balance across all other provinces and territories | A price-only revaluation of all domestic trade. It is not the selected connection's profit, GDP, resident income or net welfare. |
| Public finances | Change in the named budget revenue or fiscal outcome | A published fiscal-year sensitivity under that province's own benchmark and assumptions. |
| Provincial GDP | Relative fitted real GDP level difference | A conditional historical association that passed the stated screen. It is not annual growth in percentage points or an adjustment to the separate GDP forecast. |
| Household benchmark scenario | First-year price-only spending change | A sustained commodity-price assumption transmitted through a fitted retail-price model at a fixed exchange rate and fixed consumption. |
| Household retail scenario | Spending reference multiplied by an explicit retail-price change | Separate arithmetic using an all-in consumer-price assumption. The app does not infer this assumption from the commodity price. |

The transaction uses Statistics Canada's modelled trade values at basic prices, excluding taxes and transportation costs. It is neither a metered pipeline movement nor a retail bill. The source is [table 36-10-0709-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610070901).

The guide must not add trade receipts, public revenue, GDP and household spending into a total benefit. These measures overlap economically and use different periods and valuation bases. Dollar ribbons must not imply that the transaction is divided into provincial GDP or household income.

## Price and time bases stay explicit

The common slider expresses a set of price assumptions. It does not estimate how one benchmark passes through to every other benchmark.

Oil GDP models use annual nominal US-dollar WTI. Gas GDP models use annual nominal US-dollar Henry Hub. Household oil calibration uses monthly WTI converted into Canadian dollars and holds the exchange rate fixed in the scenario. Alberta gas fiscal sensitivity uses the Alberta Reference Price. British Columbia uses plant-inlet gas prices. These are different prices.

GDP horizon 0 compares the price-change year with the preceding year. Horizon 1 compares the level through the following year with the year before the price change. Later energy prices are unconditioned. The latter must not be called the next year's annual growth rate or a two-year persistent-shock forecast.

Household benchmark scenarios sustain the price-level change for twelve months. The annual spending result averages the first twelve monthly retail-price responses. Dividing it by twelve gives a monthly equivalent, not a forecast for a particular month's bill.

The reference spending is observed in 2023 and repriced using the October 2025 to September 2026 CPI average. It is not newly observed 2026 expenditure. The [2023 Survey of Household Spending guide](https://www150.statcan.gc.ca/n1/pub/62f0026m/62f0026m2025001-eng.htm) defines household spending and notes differences between provincial and territorial-capital coverage. The app uses the average across all households, including households with no spending in the category. Motor-fuel spending includes more than gasoline, so gasoline CPI remains a proxy.

## Independent reconstruction

The reviewer wrote `tests/review/guided-scenario-independent-audit.py` without importing production fit functions. It uses NumPy least-squares SVD with explicit region intercept columns. Production GDP estimation uses a different solver and within-province centering.

The audit passed 24,438 numerical and contract checks plus 28 guided invariance assertions. The largest absolute numerical disagreement was approximately `2.47e-12`.

| Reconstructed object | Count |
| --- | ---: |
| Provincial GDP models | 52 |
| Conditional historical GDP predictions | 779 |
| Monthly household retail-price predictions | 2,112 |
| Recursive annual-average retail-price checks | 176 |
| Survey spending references and CPI repricing | 30 |
| Guided scenario combinations | 36 |

The audit reconstructs chronological model selection, mean and autoregressive baselines, fitted coefficients, historical outcomes, acceptance criteria, monthly impulse responses, and household spending arithmetic. GDP training and selection outcomes end before each evaluation year. Household monthly fits use only earlier CPI observations. Annual CPI checks refit before January and recursively advance the predicted CPI without inserting future retail outcomes.

Public output functions were separately compared with independently calculated expectations at price changes of −20%, −10%, 0%, +10% and +20%. This covers all 13 jurisdictions, all three commodities, both GDP horizons and both household price bases. Parameter-range transformations were checked for positive and negative price changes. This audit checks the stored bootstrap draws and bounds when transformed into scenario outputs; it does not regenerate every bootstrap draw.

The review uses the current source observations bundled in the snapshots. It does not download or reparse every publisher file again. The earlier [independent scientific review](PRICE-IMPACTS-MODEL-REVIEW.md) contains raw-source and bootstrap reconstruction evidence for these unchanged model-data versions.

## Historical screens and limits

Eight of the 52 GDP models pass the fixed application screen. Same-year oil results pass in Québec, Manitoba, Saskatchewan and British Columbia. The following-year oil results pass in Manitoba and British Columbia. Gas results pass for Québec in the price-change year and British Columbia through the following year. The guided model suppresses point estimates and parameter ranges for every failed fit.

Alberta's same-year oil fit remains exploratory. Its sign stability is 15 of 19 historical origins, below the fixed 80% requirement. The guide does not relax the requirement to produce a more satisfying Alberta result. Electricity has no supported provincial GDP model.

Ten oil-to-retail household models pass the monthly screen. Six estimable natural-gas models fail it. The four Atlantic gas histories are unavailable. There is no electricity benchmark-to-household transmission model. Gas and electricity can use explicit retail-price arithmetic only when the spending and CPI reference is available. A missing estimate remains unavailable, including at a zero shock.

Historical checks condition on realized commodity prices and current revised data. They are not forecasts issued before those prices were known. The same history informed model design, so chronological fitting does not create a fresh independent research holdout. No result identifies whether a price movement came from supply, demand, exchange rates or another cause.

The household monthly screen is not a successful validation of annual dollar bills. Alberta's separate 2020–2025 annual-average CPI audit MAE is 5.77%, compared with 10.12% for the comparator. In 2015–2019, its annual error is 4.91% versus 3.73%, so the earlier annual check is worse. These limitations must remain visible beside the household dollar estimate.

For scale, the Alberta oil model translates a sustained 10% benchmark decline into a first-year average retail-price change of about −5.12%. Against the repriced annual spending reference of $3,461.66, this is approximately −$177.18 over twelve months. The annual CPI audit error is larger than the illustrative price effect. The guide may describe this as a price-only spending comparison, not validated annual savings.

GDP parameter ranges omit model-selection, structural-identification and future-outcome uncertainty. Household parameter ranges also omit survey uncertainty, future taxes, individual usage, contracts and household composition. They are not prediction intervals for future GDP or an individual's bill.

## Guided-model invariants

The independent integration audit verifies the following properties.

1. Doubling the selected bilateral value doubles its repricing result and leaves province-wide fiscal, GDP and household results unchanged.
2. Reversing the selected connection changes roles but not each province's separate model result.
3. Changing the benchmark slider does not change an explicit retail-price scenario with its own fixed slider value.
4. An unavailable supporting snapshot leaves the known trade result visible and makes unsupported channels unavailable.
5. A suppressed trade value stays unavailable, rather than becoming zero.
6. International pairs, price changes outside ±20% and unsupported horizons are rejected.
7. Failed GDP fits do not expose point estimates or parameter ranges in the guided result.
8. The guide contains no GDP forecast input and cannot alter the separate provincial forecast.

## Research interpretation

The [Bank of Canada's production-network study](https://www.bankofcanada.ca/2020/11/staff-working-paper-2020-44/) models commodity-price propagation through input-output links and international exports. It supports richer network modelling as a research direction. It does not provide a validated bilateral provincial coefficient that this app can apply to one selected connection.

The Bank's [regional oil-shock study](https://www.bankofcanada.ca/2018/11/staff-working-paper-2018-56/) includes regional trade, government redistribution and consumer fuel spending. These are reasons to show several channels, not reasons to allocate gross receipts to residents in proportion to a map link. The Bank's [gasoline-price explanation](https://www.bankofcanada.ca/2024/06/what-you-pay-for-at-the-pump/) also identifies exchange rates, refining, transport and taxes as relevant to the price paid by consumers. The guide keeps these distinctions instead of treating crude and retail prices as interchangeable.

## Reproduce the review

Run the following command from the repository root with NumPy installed in the research environment.

```sh
.venv/bin/python tests/review/guided-scenario-independent-audit.py
```

The script prints its counts, maximum disagreement and SHA-256 identity for every input snapshot. It uses no paid model call, changes no application data, and does not refresh publisher sources.

| Snapshot | Reviewed data version |
| --- | --- |
| Trade flows | `eaa874e962ee1870e336` |
| Published fiscal sensitivities | `a8b38429a8a6db24fabc` |
| Conditional GDP price models | `a36f1473cf546e21156b` |
| Household price models and spending | `f40b574bd2c8c815bfbe` |

**Model the Domain** kept transaction accounting separate from province-wide model outputs. **Explain the Number** required monthly and annual errors beside household estimates. **Prove It Works** led to an independent replay from source observations and explicit tests that a selected link cannot manufacture downstream effects.
