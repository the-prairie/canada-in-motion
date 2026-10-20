# Provincial price responses and household spending

The connected investigation now carries a price assumption into conditional provincial GDP comparisons and household energy-spending estimates. Open **Explore a question**, choose the provinces and price change, then select **Provincial outlook** or **People & costs**. The calculations run locally without a model-provider request.

## What is included

- Provincial oil and gas relationships at two horizons, with chronological historical evaluation against mean and autoregressive baselines. Eight of 52 comparisons pass the initial evidence screen. Failed comparisons remain inspectable as exploratory. Alberta oil is one of those failures; its sign-stability threshold was not lowered.
- Oil-to-motor-fuel spending equivalents for all ten provinces. The model converts WTI to CAD, estimates monthly retail-price transmission, and applies the first twelve months to a price-adjusted household spending reference. The reference averages all households, including those with zero spending.
- Explicit retail-price scenarios for motor fuel, gas and electricity where a usable spending reference exists. These apply an all-in retail-price assumption directly. They do not infer a bill change from a wholesale commodity price.
- Historical charts, complete results tables, parameter ranges, annual CPI errors, shared selections, undo, portable exports and recovery from a failed source download.

The separate provincial GDP forecast is unchanged by the price slider. Conditional historical relationships do not identify causal impacts. Passing monthly CPI tests does not establish accurate annual household bills. Annual CPI errors remain visible next to the spending result, including cases where the model loses to a simpler comparator.

Electricity-to-GDP remains unsupported. No gas wholesale-to-retail model passes the screen. Territories lack the household spending reference used here. Nova Scotia and New Brunswick publish gas spending but lack the CPI path required to update it; Newfoundland and Labrador and PEI gas spending is suppressed. These cases stay distinct from zero.

The AI workspace directs unsupported causal-impact questions to these separately tested views. It does not generate the new numeric results inside an AI answer or treat them as causal estimates. Provider settings and spending caps are unchanged.

## Evidence and review

The [GDP research](PROVINCIAL-PRICE-RESEARCH.md) and [household research](HOUSEHOLD-PRICE-RESEARCH.md) document published literature, official sources, model selection, failed alternatives and limitations.

An [independent scientific reviewer](PRICE-IMPACTS-MODEL-REVIEW.md) reconstructed every GDP fit, 779 held-out GDP predictions, 2,112 monthly household predictions and 176 annual CPI paths using a different linear-algebra implementation. Observations, currency conversions, source hashes and selected bootstrap ranges also agreed. No future GDP outcomes entered historical training or model selection.

An [independent UI reviewer](PRICE-IMPACTS-UI-REVIEW.md) exercised the built application in headless Chromium. Expected values were computed directly from stored coefficients and response paths. The review covered both signs and zero, both horizons, comparison provinces, explicit retail mode, missing evidence, 320/390-pixel layouts, reload persistence and source-failure recovery.

Regression verification includes the JavaScript and Python suites, Worker tests, the full connected-investigation browser suite, and focused price-impact and retry browser suites. Browser inference endpoints are mocked; no paid inference was used.

## Reproduction and refresh

The scheduled data-refresh and deployment workflows run both new pipelines after refreshing the underlying GDP/oil history. Builds reject stale verification dates, invalid model paths, changed scores and failed acceptance metadata. A failed refresh does not replace the live artifact.

```sh
python pipeline/refresh_dynamic_price.py
python pipeline/refresh_price_response.py
python pipeline/refresh_household_energy.py
npm test
python -m unittest discover -s pipeline -p 'test_*.py'
npm run test:ai:edge
npm run build
```

The independently authored browser checks are `tests/e2e/price-impacts.mjs` and `tests/e2e/price-impacts-retry.mjs`. They accept `TEST_URL`, `PLAYWRIGHT_MODULE` and `TEST_BROWSER_PATH`. The original connected-investigation suite is `tests/e2e/energy-story.mjs`. All launch browsers headlessly.

The independent numerical checks are preserved under `tests/research/`. They require NumPy in the audit environment, but NumPy is not a production-pipeline dependency. Run the household refresh with `--cache .data-cache/household-price-research` to prepare their expected public-source cache; the other two refresh commands above prepare the remaining inputs. Then run `tests/research/uncertainty.py` and `tests/research/benchmark_inputs.py`. The first also runs the complete fit reconstruction. Reports are written to `.data-cache/price-impact-review/`.

Initial snapshot versions: GDP `a36f1473cf546e21156b`; household `f40b574bd2c8c815bfbe`. Later successful refreshes can change the observations, model selections and screening outcomes.

## Decisions

Model the Domain kept benchmark transmission, retail arithmetic, GDP associations and independent forecasts in separate result channels. Prove It Works required reconstruction from official observations and checks of the built interface. Sequence Work into Verifiable Units put the model checks ahead of UI integration and public deployment.

## Public verification, 20 October 2026

[Deployment 39482050605](https://github.com/the-prairie/canada-in-motion/actions/runs/39482050605) published application commit `73aa01d`. Production CI passed 340 JavaScript tests and 101 Python tests, rebuilt both models from downloaded official sources, and passed the beta publication gate. The separate Worker suite passed 23 tests locally before deployment.

The published application version is `102aa28158eb65c0c6dc`, with release `f2a4529e69bcfb915654`. The refreshed GDP snapshot is `4dcfd55c8fc0c34aa532`; the household snapshot is `e3ef47e343ea2a5f5967`. All parsed histories, selected models and scenario parameters agree with the independently reviewed snapshots within `1.6e-12`. Snapshot hashes differ after the fresh download and cross-platform recalculation; the accepted-screen counts remain eight GDP comparisons and ten household oil models.

All three browser suites passed against [the public app](https://the-prairie.github.io/canada-in-motion/), including export/reimport, reactive values, keyboard controls, source-failure recovery, and mobile layouts. They reported no runtime errors. The AI handoff uses a mocked provider response in the browser suite; no paid inference was used.

Worker deployment `e5eb3bd7-c4b1-48c4-9e82-9a94f56dcf3f` publishes the revised coverage guidance. Its live status returned HTTP 200 with analysis and the existing hybrid enabled. The provider configuration and US$1 Jev lifetime cap were preserved.
