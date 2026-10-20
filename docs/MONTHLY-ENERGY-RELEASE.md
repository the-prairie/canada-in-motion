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

Deployment and public-site checks pending at this commit. The follow-up receipt will record the GitHub run, deployed content identity and public browser results.

## Design choices

Model the Domain kept monthly production separate from annual monetary accounts and forecast inputs. Prove It Works required independent official-source comparisons and background end-to-end tests. Detail remains expandable to avoid making the primary views busier.
