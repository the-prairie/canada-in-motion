# Monthly activity release — 2026-10-20

## Delivered

Income, Energy futures, Provincial outlook and Explore a question now show the latest monthly energy observations for the selected province. The question view follows its commodity and comparison province. Annual scenarios and price experiments cannot rewrite the observed readings. Replayed investigations omit live monthly context, preserving their original snapshots.

Each metric has its own observation month and release date. A compact reading and year-over-year change lead to expandable 24-month charts, accessible data tables, source definitions and a download containing the full 36-month source snapshot. Missing, confidential and absent series remain distinct from explicit zero. The panel can retry a failed fetch without blocking annual data.

Monthly production remains separate from annual GDP, prices and forecast inputs. This release adds supporting observed context; it does not claim improved GDP forecast accuracy or a new monthly AI planning capability.

## Independent evidence

Source snapshot `bc33daac7ade7de311b2` contains 1,512 observations. An independent agent acquired the three official archives separately and checked every value, status, vector and unit, plus 692 numeric and 820 unavailable year-over-year results. See [verification report](MONTHLY-ENERGY-VERIFICATION.md).

Latest observations: July 2026. Gas publication: September 23, 2026. Oil and electricity publication: September 29, 2026. The scheduled daily refresh and publication workflows now reacquire all three tables. A changed schema, unit, source status or inconsistent metadata blocks publication. Release validation requires source verification within eight days; failed refreshes retain the last public build.

## Local acceptance

- 359 JavaScript tests passed, including ten new monthly-domain checks.
- 121 Python tests passed, including fifteen monthly-source acquisition and parsing checks.
- Monthly browser acceptance passed all eight groups: all 14 jurisdictions/three metrics; zero and missingness; charts/tables/export; scenario isolation; forecast selection; question comparison and URL reload; 390/320px layouts; failed-feed retry.
- Existing data-freshness, provincial-forecast and connected-investigation headless flows passed. The connected-investigation flow also verified AI handoff using one mocked provider call, export replay, back navigation and loading recovery.
- No browser runtime errors. No billed inference or foreground browser testing.

The saved-investigation test now waits for asynchronous file parsing before asserting malformed-file feedback. Its earlier immediate assertion read the previous success notice. No import-validation change was required.

## Public acceptance

Published successfully on 2026-10-20 at 21:49 UTC by [GitHub Actions run 39502355964](https://github.com/the-prairie/canada-in-motion/actions/runs/39502355964), application commit `9fed8fb547439541ee12326dd6e12a267bf051e8`.

- Public app: https://the-prairie.github.io/canada-in-motion/
- Application code version: `c2bddddfe4c82cad6117`
- Public release: `dc383f400d057ada3414`
- Monthly source snapshot: `bc33daac7ade7de311b2`
- The deployment independently reacquired the three sources at 21:44 UTC. All monthly observations and metric definitions match the locally reviewed snapshot. The published data file's SHA-256 matches the public build manifest.
- The full eight-group monthly headless acceptance flow passed against the public URL, including every jurisdiction, scenario isolation, question comparisons, downloads, mobile layouts, and failed-fetch recovery. No browser runtime errors.
- The existing six-group annual-GDP freshness flow also passed against the public URL. It still shows 2022 current-dollar GDP alongside 2025 real growth.
- AI service health returned HTTP 200 and available. The Worker and its spending settings did not change. Browser checks stubbed only AI availability; monthly data and application code came from the actual public site.

No remaining blocker for this monthly-activity release. It does not resolve confidential or unpublished provincial source values, add monthly readings to the forecast's trained inputs, or change the app's incomplete public-beta coverage.

## Design choices

Model the Domain kept monthly production separate from annual monetary accounts and forecast inputs. Prove It Works required independent official-source comparisons and background end-to-end tests. Detail remains expandable to avoid making the primary views busier.
