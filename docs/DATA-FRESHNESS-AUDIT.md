# Data freshness audit

Checked on 20 October 2026. This audit compares the public app, its refresh code, and primary publisher evidence. It distinguishes the period measured from the date downloaded. A successful download does not establish that an old observation is current.

The investigation reviewed every main data family. It did not independently revalidate every well, pipeline, tariff condition, or provincial economic publication. Raw audit evidence is in the ignored `.data-cache/freshness-audit/` directory. Live JSON checks and twelve Statistics Canada metadata responses are preserved there.

## Confirmed findings

| Area | Finding before this change | Evidence and response |
| --- | --- | --- |
| Energy GDP | The income view showed only 2022 current-dollar energy GDP, although the same table includes 2025 chained-dollar activity. | [Table 36-10-0711-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610071101) was released 1 May 2026 and ends in 2025. The parent implementation adds activity and growth without replacing the 2022 nominal contribution or treating chained-dollar components as additive. |
| Default reference years | `normalizeEconomyState` supplied 2024 for trade and 2022 for income multipliers. Both mount paths retain an available explicit year. New users would remain on those old defaults after a newer release entered the rolling dataset. | The parent implementation removes the fixed defaults and resolves an absent year from the relevant dataset. Explicit historical selections must remain reproducible. |
| Nova Scotia external outlook | The comparison used the February budget's 1.5% growth for both 2026 and 2027. | The [24 September forecast update](https://notices.novascotia.ca/files/budget-forecast-notices/budget-forecast-update-september-2026.pdf), printed page 6, publishes 1.4% for 2026 and 1.3% for 2027. Both comparison rows, the document date, locator, size, hash, and snapshot identity are updated. These figures remain external comparisons, not inputs to the app's model. |
| Saskatchewan external outlook | The comparison used the March budget’s private-sector average of 1.6% for 2026 and 2.0% for 2027. | The [27 August first-quarter report](https://publications.saskatchewan.ca/api/v1/products/129712/formats/156618/download), PDF page 4, table 2, reports 1.5% and 2.1% from the July 29 private-sector survey. Both comparison rows, publication date, locator, document size, hash, and snapshot identity are updated. The original PDF was acquired from the provincial publications API. |
| Other curated outlooks | The comparison registry contains a mixture of spring budgets and later updates. It is not an automatically refreshed national forecast service. | Alberta, British Columbia, and Manitoba already cite August or September updates. Prince Edward Island’s [28 September fiscal and economic update](https://www.princeedwardisland.ca/en/news/first-quarter-update-provides-early-results-shows-resilient-economy) publishes fiscal and year-to-date indicators but no replacement annual real GDP growth forecast. Its [fiscal updates publication index](https://www.princeedwardisland.ca/en/publication/fiscal-and-economic-updates) still links the December 2025 report. The April 2026 GDP forecast is retained with its original date. |

## Source lags that are not ingestion failures

These periods match the live publisher metadata checked on 20 October. Statistics Canada metadata was obtained from `POST https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata`, with each eight-digit table identifier as `productId`.

| App data family | Latest retained reference period | Publisher release | Finding |
| --- | --- | --- | --- |
| [Provincial input-output multipliers, 36-10-0595-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610059501) | 2022 | 19 November 2025 | The source itself ends in 2022. The parser keeps its latest three years. A 2025 multiplier cannot be inferred from 2025 GDP. |
| [Interprovincial trade values, 36-10-0709-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610070901) | 2024 | 6 November 2025 | The source itself ends in 2024. These modelled transactions are distinct from physical shipments. |
| [Electricity annual receipts and deliveries, 25-10-0021-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510002101) | 2025 | 16 October 2026 | The public app includes the latest annual release. |
| [Electricity monthly receipts and deliveries, 25-10-0016-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510001601) | July 2026 | 7 October 2026 | The public app includes the latest published month. |
| [Oil and gas net provincial energy transfers, 25-10-0029-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510002901) | 2024 | 13 November 2025 | The annual energy balance ends in 2024. No artificial allocation into bilateral physical routes is justified. |
| [GDP at market prices, 36-10-0222-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610022201) | 2024 | 6 November 2025 | Historical price-response models use this longer expenditure-based series. Basic-price industry GDP is a different target and should not be spliced into it. |
| [GDP at basic prices, 36-10-0711-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610071101) | 2025 real GDP | 1 May 2026 | The app's separate provincial forecast already uses 2025 GDP. The income view had hidden this newer activity evidence. |
| [Labour Force Survey, 14-10-0287-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410028701) | September 2026 | 9 October 2026 | The forecast uses September employment. The 2026 and 2027 outputs are model forecasts, not observations. |
| [Household spending, 11-10-0222-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1110022201) | 2023 | 18 September 2026 | The latest survey is 2023. The parser selects the maximum source year. The recent publication is a revision, not a 2026 spending survey. |
| [Consumer Price Index, 18-10-0004-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000401) | September 2026 | 19 October 2026 | The household spending reference uses the latest complete twelve months, October 2025 to September 2026. The price adjustment does not make the underlying household spending survey a current bill sample. |

## Scenarios, inventories, and transport

| Area | Review result | Remaining limit |
| --- | --- | --- |
| CER scenarios | The pipeline imports [Energy Futures 2026](https://www.cer-rec.gc.ca/en/data-analysis/canada-energy-future/2026/). It distinguishes 2024 historical oil and gas production and benchmark prices from 2023 historical electricity and end-use series. Values through 2050 are scenario projections. | These are the historical inputs to a named scenario edition. More recent monthly production data would be a separate observed series. It would not update the scenario model automatically. |
| Household model validation | The fit uses observations through September 2026. The declared historical audit remains 2020 through 2025, with development in 2015 through 2019. | This fixed evaluation period is intentional. It is not evidence that all observations after 2025 were ignored, nor validation of future household bills. |
| Alberta well status | The public status aggregate was fetched on 20 October and reports a 2026 monthly snapshot. The [AER source](https://www.aer.ca/data-and-performance-reports/information-hub/well-status) does not supply the snapshot month in the export. | Preserve year-only precision. The aggregate's active and marginal categories do not provide current individual well coordinates. |
| Well atlas | Fourteen publisher feeds refresh in the daily candidate workflow. The public catalog was retrieved on 20 October. The audit reviewed adapters and source limitations. | The AER abandoned-well ZIP reports a January 2025 modification date. Atlantic and northern BASIN records remain historical and partial. The Nova Scotia offshore directory has uncertain 2020/2022 currency. A fresh retrieval does not resolve these source limitations. |
| BC infrastructure permits | The manifest reports an 18 October retrieval. The pipeline reacquires the group when seven days old. | A permit record does not establish current operation. No complete national operating-infrastructure inventory is claimed. |
| CanVec infrastructure | The historical layer retains feature dates. Pipeline dates range from 1948 to October 2002. Refineries are dated 2016. | Keep it explicitly historical. A fresh archive download cannot support a claim that its geometry or operations are current. |
| CER benchmark tolls | The snapshot selects the latest dated observation at or before acquisition for each of 25 systems. Most dates are in 2026. Wascana's newest retained observation is 30 June 2016. | These are dated references with `eligibleForQuote: false`. The audit did not review every carrier's subsequent filing. |
| Trans Mountain calculator | The [carrier's current-tariff page](https://www.transmountain.com/tolls-tariffs) still lists Interim Tariff 123, effective 1 May 2026. The app's four rates cite that tariff. The [CER settlement page](https://cer-rec.gc.ca/en/applications-hearings/view-applications-projects/trans-mountain-application-interim-tolls/) confirms the September 2026 decision. | Future settlement rates require their own effective dates and service conditions. No rate is extended merely because its source was checked recently. |
| Budget sensitivities | The app verifies the exact 2026 budget documents used for Alberta, British Columbia, and Saskatchewan sensitivities. | These are illustrations on named budget assumptions. Newer fiscal outlooks do not automatically establish replacement sensitivity coefficients. |

## Verification and follow-up

The public app's economic JSON files were read directly. They confirm 2024 trade, 2025 annual electricity, July 2026 monthly electricity, 2023 household spending, September 2026 CPI, and September 2026 forecast employment. The daily publication workflow refreshes the supported economic sources before build. Context and BC permit groups refresh after seven days.

Nova Scotia's replacement PDF contains 334,085 bytes. Its SHA-256 is `02e858798d6d5b92f4e4f22196409646804925e89318fc9f2ae48104c50a2297`. The updated outlook registry has data version `7552446365cb90decef2`. All six tests in `node --test tests/provincial-forecast.test.mjs` pass after the replacement.

Saskatchewan’s replacement PDF contains 428,442 bytes. Its SHA-256 is `2f6f74246dde5c890f9a34913bda6faa44d4690c80271b8ed4a6fd5776c5368b`. The province’s publications catalog identifies product 129712, format 156618, and a publication date of 27 August 2026. The PDF’s real GDP row was checked against its July 29 survey note.

The bounded PEI review did not locate a newer annual real GDP forecast table. Other spring-budget comparison rows remain explicitly dated. This audit does not certify them as the newest publication from every government.
