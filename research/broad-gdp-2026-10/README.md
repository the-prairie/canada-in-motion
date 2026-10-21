# Broader provincial GDP indicators — October 2026 experiment

**Decision: do not promote either horizon.** This is a frozen, independently reviewed research experiment. It does not change the app's forecasts or its live forecast refresh.

The current-year policy reduced full-period MAE by 17.96%, but worsened MAE over 2022–2025 and failed its precommitted admission rule. The next-year policy increased full-period MAE by 3.10% and also failed its interval checks. Read [the protocol and results discussion](../../docs/BROAD-GDP-VALIDATION.md) and [the independent review](../../docs/BROAD-GDP-INDEPENDENT-REVIEW.md).

## Reproduce

From the repository root, use Python 3.11 or later and the pinned research dependency:

```sh
python3.12 -m venv .venv-research
.venv-research/bin/python -m pip install -r research/broad-gdp-2026-10/requirements.txt
.venv-research/bin/python research/broad-gdp-2026-10/prototype.py --check
.venv-research/bin/python research/broad-gdp-2026-10/check_prototype.py
.venv-research/bin/python tests/review/broad-forecast-independent-audit.py --check
```

If the existing repository `.venv` already has NumPy 2.3.4, its Python can run the last three commands directly. No network access, API key or live service is needed after installing NumPy. Keep any new virtual environment outside commits.

`prototype.py --check` regenerates the complete result and requires exact equality with `results.json`. The nine author checks cover source-window arithmetic, missing observations, training/selection/calibration cutoffs, future-outcome mutations, publication cutoffs and unemployment units. The independent program uses a separate full-incumbent implementation, augmented least-squares ridge, SVD principal components and independent policy selection/range calibration. It compares all 350 forecast records, all 220 outer evaluation cases and both failed admission decisions at a numerical tolerance of `1e-9`.

The default commands do not overwrite frozen data or receipts. To save a new execution result or receipt separately:

```sh
.venv-research/bin/python research/broad-gdp-2026-10/prototype.py --check --output /tmp/broad-gdp-replay.json
.venv-research/bin/python research/broad-gdp-2026-10/check_prototype.py --receipt /tmp/broad-gdp-behavior-checks.json
.venv-research/bin/python tests/review/broad-forecast-independent-audit.py --check --receipt /tmp/broad-gdp-independent-replay.json
```

The author prototype reuses the already reviewed incumbent replay function in [`tests/review/energy-forecast-independent-audit.py`](../../tests/review/energy-forecast-independent-audit.py). The separate broad-model reviewer does not import that function or any prototype/production model code. `manifest.json` records the frozen package file hashes and the two reviewer code dependencies.

## Exact inputs and source receipts

The gzip files preserve the original JSON bytes; gzip timestamps are fixed to zero. They contain public Statistics Canada data and model evidence only.

| File | Purpose |
| --- | --- |
| `inputs/selected-series.json.gz` | Exact monthly retail, manufacturing, CPI, employment and unemployment observations with source IDs, vectors, periods, status and symbol flags. Retail is retained but excluded from the core model. |
| `inputs/incumbent-before.json.gz` | Frozen public forecast snapshot, GDP and labour history, and existing model evidence. |
| `inputs/independent-features.json.gz` | Source reviewer's independently calculated monthly windows for the author-side arithmetic check. |
| `protocol.json` | Frozen candidate families, feature windows, minimum training history, selector and admission rules. |
| `results.json` | Complete prototype output: features, forecasts, candidate scores, selected policy, ranges and all reported performance breakdowns. |
| `source-audit.json` | Original independently downloaded source archive hashes, exact dimensions' units/scalars, periods and row counts. |
| `independent-review.json` | Original second review receipt, including 32,236 numerical comparisons and independent raw-source parsing. |
| `prototype-checks.json` | Original nine-check author test receipt. |

Default independent replay verifies packaged file hashes and reuses the frozen selected observations. It does **not** claim to redownload or revalidate the original raw archives. Its numerical comparison count is consequently lower than the original raw-source review receipt. To repeat the raw-source parser too, supply the exact original archives:

```sh
.venv-research/bin/python tests/review/broad-forecast-independent-audit.py --check --raw-dir /path/to/original-archives
```

That directory must contain `16100048-eng.zip`, `18100004-eng.zip` and `14100287-eng.zip`, matching the hashes in the receipt. The program rejects revised archives rather than silently treating current downloads as the original vintage. Full raw archives are deliberately not bundled.

Statistics Canada sources: [retail trade 20-10-0056](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2010005601), [manufacturing 16-10-0048](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1610004801), [CPI 18-10-0004](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000401), and [labour force 14-10-0287](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410028701). Contains information licensed under the [Statistics Canada Open Licence](https://www.statcan.gc.ca/en/reference/licence). This is a derived research package, not an official Statistics Canada forecast.

## Limits and future work

These are retrospective forecasts built from the latest revised observations with simulated release lags. The 2023–2025 outcomes were already inspected during earlier model development; they are not an untouched holdout. There are eleven shared annual economic outcomes, not 110 independent experiments per horizon.

Any later model change needs a new named protocol and research directory. Do not edit this experiment to replace its failed admission outcome or retrospectively choose a different winner. Future predictions should receive immutable source/parameter/forecast receipts and be scored as later GDP releases arrive. Research dependencies and snapshots stay separate from the production app.
