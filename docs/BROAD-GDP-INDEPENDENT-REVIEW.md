# Independent numerical review of broader GDP predictors

Reviewed October 20, 2026. The independent reviewer did not author the broader-model prototype or its candidate-selection protocol. The reviewer previously implemented the source loader and therefore separately reparsed the original Statistics Canada ZIP archives for this check. The model author had already independently verified that loader's observations.

## Decision

Retain the current public forecasts at both horizons. The broader current-year policy reduced average error over 2015–2025 but increased error over 2022–2025, violating a frozen admission rule. The broader next-year policy increased overall error and worsened its uncertainty intervals. The full-period current-year improvement is useful research evidence; it does not override the precommitted recent-period requirement.

| Measure | Current-year incumbent | Current-year broader policy | Next-year incumbent | Next-year broader policy |
| --- | ---: | ---: | ---: | ---: |
| Forecasts evaluated | 110 | 110 | 110 | 110 |
| MAE, percentage points | 1.742924 | 1.429973 | 2.124454 | 2.190299 |
| RMSE, percentage points | 2.600509 | 2.035346 | 3.063184 | 3.118432 |
| MAE improvement | — | 17.96% | — | −3.10% |
| Empirical interval coverage | 84.55% | 86.36% | 66.67% | 64.44% |
| Mean interval score | 11.287038 | 9.268180 | 14.784498 | 15.033467 |
| Meets all admission rules | — | No | — | No |

Next-year interval scoring uses 90 matched forecasts; the first two evaluation years lack enough earlier calibration outcomes. Point scoring includes all 110 forecasts per horizon. The target interval level is 80%, but its actual coverage is empirical, not guaranteed. In particular, the incumbent's next-year interval coverage in this sample is only 66.67%. That limitation should remain visible in methods and future calibration work rather than being presented as an assured probability.

## What was independently reproduced

- 22,110 monthly manufacturing, CPI, employment and unemployment observations, extracted directly from the official source ZIPs with exact series dimensions, units and withheld-value handling.
- 280 province/origin feature rows, including percentage-point unemployment changes and fixed matched-period windows.
- All 350 available forecast records, including the current-origin forecasts for all ten provinces at both horizons.
- The complete incumbent policy, fitted independently rather than copied from the prototype output.
- All five fixed broader candidates, their previous-outcome selection scores, chosen models, point estimates and policy-specific error ranges.
- Provincial and annual MAE/RMSE, pooled scores, interval scores and every frozen admission condition.
- Training, selection and interval-calibration target-year cutoffs; all fitted provinces have at least ten eligible training target years.

The review made 32,236 numerical comparisons, with an absolute/relative tolerance of `1e-9`. No mismatch remained.

The numerical implementation deliberately uses a different path: augmented least-squares ridge instead of solving the penalized normal equations, and singular-value decomposition instead of an eigendecomposition for the two principal components. It does not import the prototype or the production forecasting modules.

Two mutation checks also passed. Changing all source months after each fixed publication cutoff did not alter the features. Changing GDP outcomes in 2020 or later did not alter predictions, selection or ranges for forecasts issued through 2020. These checks supplement, rather than replace, the explicit earlier-target eligibility checks.

## Reproduction and source identity

Run:

```sh
.venv/bin/python tests/review/broad-forecast-independent-audit.py --check
```

The original raw-source receipt is [independent-review.json](../research/broad-gdp-2026-10/independent-review.json). The durable [research package](../research/broad-gdp-2026-10/README.md) contains the frozen protocol, exact compressed inputs, prototype, nine behavioral checks and results. Default independent replay verifies package hashes and repeats 10,126 numerical comparisons from those exact inputs; optional `--raw-dir` reparses the original archive vintage and repeats the source comparisons too. The script requires Python 3.11 or later and NumPy 2.3.4. It does not overwrite the frozen receipts.

| Table | Archive SHA-256 |
| --- | --- |
| Manufacturing, 16-10-0048 | `7acefec69daad7033390ac760f761727995f2e92670ba3aab6ba6abebee0e2ed` |
| CPI, 18-10-0004 | `7852a5ea863a62129c7733059ba031c661348b8b3d38a3744d77e9053d10a390` |
| Labour force, 14-10-0287 | `c1cfb244022b8ed68840e53adc4afbe0b0d2ac231a592fe451e95ec57bc5922c` |

The public forecasts were not modified by this review.

## Durable experiment packaging

The experiment is now preserved in [research/broad-gdp-2026-10](../research/broad-gdp-2026-10/README.md), approximately 1.6 MB including exact compressed inputs. The package passes complete author replay, all nine behavioral checks and the independent numerical replay. It implements the following reproducibility requirements; prospective receipts remain future work:

1. The frozen protocol and its date, source selection definitions, source hashes, feature windows, penalties, selection policy and admission rules.
2. The prototype and independent review programs under separate research/review paths, with a pinned NumPy version and a documented command that runs both.
3. Compressed selected source observations, with dates, vectors, statuses and units, plus the frozen GDP/incumbent source snapshot. These small selected-series snapshots allow exact replay after Statistics Canada revises its download archives. Retain full archive receipts; fetching the current URL alone cannot reproduce an old data vintage.
4. A compact machine-readable result containing every evaluated prediction and calibration range, all province/year/period scores, candidate scores and failed admission rules. A checksum should bind it to the inputs and protocol.
5. A regression check that fails if the report's admission result, comparison set, outcome cutoff or retained-production decision drifts.
6. A separate immutable receipt for future forecasts, written when the forecast is issued. Score subsequent outcomes against the original receipt without overwriting it.

Keep failed candidates in the research package. Do not silently select the best candidate after inspecting these same historical outcomes, and do not describe 2023–2025 as an untouched holdout. The evaluation is retrospective, uses latest revised values and includes only eleven shared annual macroeconomic outcomes. Any later protocol revision should disclose that those outcomes have already been examined.
