# Latest activity alongside dollar contribution

Income now pairs the latest complete current-dollar energy contribution with the latest inflation-adjusted energy and whole-economy growth. The source currently supplies 2022 nominal dollars and 2025 real activity, with growth measured against 2024. All 13 provinces and territories are covered. Rankings, tables, question-driven comparisons and exported source snapshots retain both dates.

Canada's current-dollar total remains additive. The real-activity view compares jurisdictions without summing chained levels or constructing shares from them. The dated nominal map remains unchanged. Source definitions and real GDP levels sit under a disclosure.

The parser selects the latest complete consecutive-year pair on every data refresh. New trade and multiplier visits resolve to the dataset's latest year. Explicit years in shared views remain fixed. The AI planner receives the nominal year, real activity year and growth interval before choosing a view.

## Freshness audit

The audit checked publisher metadata, public data files and refresh code across GDP, income multipliers, trade, physical balances, household spending, price indices, forecasts, wells, infrastructure and tolls. Nova Scotia's comparison now uses its September 24 forecast. Saskatchewan's uses its August 27 first-quarter report. Both retain verified document hashes and locators.

Some older reference periods are still the publisher's newest data. The input-output multipliers end in 2022, the household spending survey in 2023, and annual trade accounts in 2024. CER projections retain their named edition and historical boundary. Historical infrastructure and incomplete well inventories remain labelled. Details and remaining limits are in DATA-FRESHNESS-AUDIT.md.

## Verification

- 349 JavaScript tests passed.
- 106 Python tests passed.
- 23 Worker tests passed.
- The independent reviewer downloaded the official source and reconciled all 52 real GDP levels.
- New headless browser tests covered all 13 regions, nominal and real dates, negative growth, the unchanged map basis, shared links, 390/320-pixel layouts, question-generated comparisons, real-level disclosure and export.
- The approved public-beta readiness check passed with no errors. The stricter national-completeness gate remains unmet by the pre-existing coverage gaps.
- AI browser tests exercised the actual planning/grounding/rendering code with provider calls mocked. No paid inference was used, and provider configuration and spending caps remain unchanged.

## Design decisions

Model the Domain kept nominal contribution and real activity as independent datasets with explicit periods and units. Prove It Works required source reconciliation, independent counterexample testing and the actual browser flows. Scoped diff review and headless Playwright replaced unavailable Cursor-specific review and UI helpers.


## Public verification, 20 October 2026

[Deployment 39498030347](https://github.com/the-prairie/canada-in-motion/actions/runs/39498030347) published application commit `c6f2ff9`. Production CI passed all 349 JavaScript tests and 106 Python tests, downloaded the GDP source again, and produced 2022 nominal GDP plus 2025 activity for all 13 jurisdictions. The approved beta publication gate passed.

The public application code version is `57888c51f97eb86faf85`, release `5ab71846785600f158fb`. The published nominal and real GDP records exactly match the reviewed observations. The NS/SK outlook registry is `7552446365cb90decef2`.

Both new headless browser suites passed against [the public app](https://the-prairie.github.io/canada-in-motion/). They verified every jurisdiction, the dated map and table, narrow mobile layouts, real-growth question handling, real GDP disclosure and complete source-snapshot export. No runtime errors occurred. Provider endpoints were mocked for the question-driven test; no paid inference was used. The existing connected-investigation and economic-research suites also passed against the final local build.

Worker version `f50ef8b6-4153-460d-9b1a-5dfbc8a01b3f` was deployed after the site update. Its public status returned HTTP 200 with the existing Cloudflare model, dynamic workspace and Jev integration enabled. The free hosting setup and US$1 Jev lifetime cap were preserved. Temporary preview servers created for this release were stopped after verification.
