# Monthly indicators for broader provincial GDP forecasts

Source research and acquisition completed on 2026-10-20. This work establishes the inputs. It does not establish forecast improvement or authorize a candidate model’s promotion.

The retained observations are keyed by metric, province and month. Each record preserves its value, source vector, publication-status flag and revision symbol. Sources carry the exact series selectors, units, adjustment basis, publication date, retrieval time and archive hashes. This data shape follows Model the Domain. Direct archive parsing and source-qualified tests follow Prove It Works.

Throughput checkpoint. Acquire and validate sources first. Freeze candidate models and admission rules before calculating performance. Independently reconstruct their inputs and historical predictions afterward.

## Selected sources

| Metric | Official table | Provincial history acquired | Latest month | Publication date | Unit | Seasonal adjustment |
| --- | --- | --- | --- | --- | --- | --- |
| Retail sales | [20-10-0056-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2010005601) | January 2017 onward | July 2026 | 2026-09-24 | Thousand current CAD | Adjusted |
| Manufacturing sales | [16-10-0048-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1610004801) | January 1992 onward | August 2026 | 2026-10-15 | Thousand current CAD | Adjusted |
| All-items CPI | [18-10-0004-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000401) | September 1978 onward | September 2026 | 2026-10-19 | Index, 2002=100 | Unadjusted |

Each series contains all ten provinces. The extracted histories contain 1,150 retail, 4,160 manufacturing and 5,770 CPI observations. All selected observations are currently published, with no missing or confidential entries. The parser still preserves withheld values as null if a future source release contains them. Published zero sales remain zero. A zero CPI index is rejected.

Only provincial totals are retained. Canada, municipalities, metropolitan areas and territories are excluded from this forecast input contract. No provincial total is reconstructed by summing industries or municipalities.

Exact selectors are fixed in `pipeline/broad_forecast_sources.py`.

| Metric | Selectors |
| --- | --- |
| Retail | `North American Industry Classification System (NAICS) = Retail trade [44-45]`; `Sales = Total retail sales`; `Adjustments = Seasonally adjusted` |
| Manufacturing | `North American Industry Classification System (NAICS) = Manufacturing [31-33]`; `Principal statistics = Sales of goods manufactured (shipments)`; `Seasonal adjustment = Seasonally adjusted` |
| CPI | `Products and product groups = All-items` |

Sales retain the source’s thousand-dollar amounts without multiplying by 1,000. They are nominal sales, not real output or value added. CPI remains a separate inflation indicator. Dividing sales by the all-items CPI would not create an official real-sales series or a sector-specific deflator.

## History constraints

The active retail table starts in 2017. It replaces an archived table, but this implementation does not join their different classifications or scopes. By 2026, that leaves fewer than ten completed annual growth observations. Retail therefore cannot enter a model that requires ten own-province training years unless that requirement is explicitly reconsidered before evaluation.

The active building-permits table [34-10-0292-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410029201) was also checked. Its metadata begins in January 2018, so it does not solve the short-history constraint. Earlier permits tables also use different seasonal-adjustment methods. The current scope prioritizes manufacturing and CPI rather than appending archived permits data.

Manufacturing has sufficient history for longer rolling evaluations. Its source notes describe reconciliation changes, industry classification updates and revised seasonal estimates. Staying within one active table avoids an ad hoc splice but does not remove all historical revisions or structural changes. Broad manufacturing sales remain a partial indicator of the economy. They do not measure service-sector output, wages or GDP directly.

CPI’s unadjusted monthly observations should be compared over matched calendar months, such as January–July against the same months a year earlier. Its price movements must not be described as observed real activity. Its base-year index level is not itself a growth percentage.

## Research implications

[Bank of Canada research on provincial nowcasting](https://www.bankofcanada.ca/2017/06/staff-discussion-paper-2017-8/) uses multiple timely provincial, national and international indicators and combines monthly, quarterly and annual information. This motivates testing a broader information set. It does not establish that a particular implementation will beat the app’s incumbent forecast.

[Bank of Canada research on nowcasting in an uncertain environment](https://www.bankofcanada.ca/2018/08/staff-discussion-paper-2018-9/) evaluates combinations across model classes. This supports a limited, predeclared comparison of simple models and combinations. More parameters and additional indicators are hypotheses to test, not evidence of improvement.

The [ECB’s short-term forecasting framework](https://www.ecb.europa.eu/press/economic-bulletin/articles/2020/html/ecb.ebart202002_02~47da9ba4f7.en.html) describes bridge equations, mixed-frequency approaches, publication delays and revised observations. Training-only transformations are required for PCA or other dimensionality reduction. An indicator observed after a historical assessment date must not enter that assessment’s feature vector, even if it appears in today’s archive.

The existing pipeline already extracts employment and unemployment from Labour Force Survey table 14-10-0287. The broader loader does not duplicate labour acquisition. The parent model can combine these histories using the exact provincial and monthly keys.

## Vintage limitations

These archives contain the latest revised histories. Their present publication dates verify the current refresh, not the release date of each historical observation. Historical tests using them remain retrospective tests with simulated availability.

[Statistics Canada’s real-time data documentation](https://www.statcan.gc.ca/en/developers/real-time-data-tables) describes separate vintage tables, including provincial manufacturing table 16-10-0119 and retail table 20-10-0081. Some related tables are now inactive. A consistent historical-vintage evaluation would need to verify coverage and compatibility across every predictor and the annual GDP target. This loader does not claim to have reconstructed that panel. It also does not claim vintage data are unavailable.

## Production interface and checks

`load_broad_sources(cache_dir, offline=False, as_of=None)` returns `schemaVersion`, `asOf`, `sources` and `series`. The named series are `retail`, `manufacturing` and `cpi`. Each observation contains `region`, `month`, `value`, `status`, `vector`, `sourceStatus`, `sourceSymbol` and `sourceId`.

Online loading downloads each full table and its WDS metadata. Cached loading verifies the archive and metadata hashes against their retrieval receipt. Retrievals older than eight days or later than the assessment date are rejected. The loader rejects changed columns, units, scalar factors, inactive tables, invalid monthly periods, duplicated province-month observations and unknown status flags. It checks minimum historical coverage and requires each province to reach the published ending month.

Focused tests cover exact selector exclusions, source-unit preservation, confidentiality flags with numeric payloads, missing values versus genuine zeros, malformed metadata, schema changes, duplicate rows, outdated receipts and cache tampering. Run `python3 -m unittest discover -s pipeline -p 'test_broad_forecast_sources.py'`.

Replay the acquired sources with `python3 pipeline/broad_forecast_sources.py --offline --output .data-cache/broad-gdp-research/sources.json`. Omit `--offline` to refresh. The raw archives, metadata and original retrieval receipts remain in `.data-cache/broad-gdp-research/`.

| Raw table archive | SHA-256 |
| --- | --- |
| 20100056 | `eb3ba0e000bb96c321de3bb28b3269671c44e0f04010a75a41f510a8eb978e2b` |
| 16100048 | `7acefec69daad7033390ac760f761727995f2e92670ba3aab6ba6abebee0e2ed` |
| 18100004 | `7852a5ea863a62129c7733059ba031c661348b8b3d38a3744d77e9053d10a390` |
