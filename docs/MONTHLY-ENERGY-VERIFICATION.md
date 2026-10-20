# Monthly energy data verification

Independent data review on 2026-10-20. The reviewer downloaded the three Statistics Canada tables directly, without using the application's parser or cached inputs. The generated snapshot and application calculations pass the independent comparison.

Throughput checkpoint: n/a, read-only investigation.

## Latest published month

All three tables end in July 2026. The [September 29 energy release](https://www150.statcan.gc.ca/n1/daily-quotidien/260929/dq260929c-eng.htm) confirms the latest reference month. Its data are not seasonally adjusted. The [September 23 natural gas release](https://www150.statcan.gc.ca/n1/daily-quotidien/260923/dq260923f-eng.htm) published the gas table earlier.

The reviewer also queried Statistics Canada's `getCubeMetadata` API. It returned `cubeEndDate` of `2026-07-01` for all three tables. The dates below are publication dates, separate from the July observation period and the October retrieval date.

| Measure | Official table | Release date | Exact selected dimensions | Source unit |
| --- | --- | --- | --- | --- |
| Crude oil production | [25-10-0063-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510006301) | 2026-09-29 | `Supply and disposition = Crude oil production`; `Units of measure = Cubic metres` | Cubic metres, units |
| Marketable natural gas production | [25-10-0086-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510008601) | 2026-09-23 | `Supply and disposition = Marketable production, supply`; `Unit of measure = Gigajoules` | Gigajoules, thousands |
| Electricity generation | [25-10-0015-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510001501) | 2026-09-29 | `Class of electricity producer = Total all classes of electricity producer`; `Type of electricity generation = Total all types of electricity generation` | Megawatt hours, units |

The raw archives and API metadata are retained locally in `.data-cache/monthly-independent/`. Each CSV includes series vectors and status symbols.

| Raw archive | SHA-256 |
| --- | --- |
| [25100063-eng.zip](https://www150.statcan.gc.ca/n1/tbl/csv/25100063-eng.zip) | `ab865eb6fba188119be03b954eaf119e6bc3862b4745b1e6a67c226414213273` |
| [25100086-eng.zip](https://www150.statcan.gc.ca/n1/tbl/csv/25100086-eng.zip) | `f9119875318ae35b31aae1a25ebabf6f4a82a97d6d2fd517d157e33834d6d225` |
| [25100015-eng.zip](https://www150.statcan.gc.ca/n1/tbl/csv/25100015-eng.zip) | `4242b5a03daf9056716622b66136d2ba6c4f64b780d9e503518607646d8d818a` |

## July 2026 source checks

The year-over-year changes below are independently calculated from the same series in July 2025. The oil measure is crude oil alone. Statistics Canada's broader crude-and-equivalent headline also adds condensate and pentanes plus.

| Jurisdiction | Crude oil, m³ | Year over year | Marketable gas, thousand GJ | Year over year | Electricity, MWh | Year over year |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Canada | 24,876,835 | 2.27% | 720,483.1 | 4.18% | 54,205,473 | 8.38% |
| Newfoundland and Labrador | 1,287,153 | 15.66% | Not available | Not available | 2,394,577 | -6.97% |
| Prince Edward Island | Not reported | Not available | Not available | Not available | 43,610 | 11.90% |
| Nova Scotia | Not reported | Not available | 0.0 | Undefined from zero | 600,969 | 2.10% |
| New Brunswick | Not reported | Not available | 0.0 | Undefined from zero | 755,232 | -22.05% |
| Quebec | Not reported | Not available | 364.1 | -0.68% | 13,920,689 | -0.96% |
| Ontario | Suppressed | Not available | 321.9 | 41.99% | 16,027,215 | 3.89% |
| Manitoba | 196,747 | 0.36% | Not available | Not available | 3,659,197 | 119.51% |
| Saskatchewan | 2,096,284 | 0.23% | 5,763.2 | -1.63% | 2,311,043 | 8.66% |
| Alberta | 21,225,414 | 1.84% | 451,358.6 | 3.68% | 7,322,207 | 0.90% |
| British Columbia | 54,459 | -12.08% | 262,573.9 | 5.17% | 7,069,572 | 36.35% |
| Yukon | Not reported | Not available | Not available | Not available | 32,653 | -37.01% |
| Northwest Territories | Suppressed | Not available | 101.3 | -18.17% | 39,067 | -20.73% |
| Nunavut | Not reported | Not available | Not available | Not available | 29,442 | 12.81% |

## Meaning and comparison limits

- Oil uses one published production series. Equivalent products remain a different series. The Canadian crude oil value differs from the release's crude-and-equivalent headline for this reason. Adding missing or suppressed provincial equivalents as zero would invent data.
- Gas uses the active 25-10-0086 table. Its metadata says it replaces tables 25-10-0055, 25-10-0057, 25-10-0058, and 25-10-0059. Historical revisions now occur in 25-10-0086. Marketable production deducts reinjection, field use, processing shrinkage, plant use, and losses.
- Electricity includes utilities and industrial producers. The source expanded renewable coverage in January 2016. The new recent-month comparison does not cross that break.
- `x` means suppressed for confidentiality. `..` means unavailable for the reference period. An absent geographic series is not a published zero. Nova Scotia and New Brunswick gas values are explicit zeros. A zero prior-year denominator has no percentage growth rate.
- Year-over-year change compares the same month in consecutive years. It reduces regular seasonal differences but does not remove weather, maintenance, leap-year, or working-day effects. It is not an annual forecast or a seasonally adjusted trend.
- National values use Canada's published rows. Provincial sums can differ because of confidential entries, coverage, conversion, or rounding. The oil table's Atlantic regional aggregate must not be counted again alongside its provinces.
- The annual GDP and forecast dates remain separate. A July 2026 production reading does not update the 2025 real GDP observation, the 2022 nominal GDP contribution, or a model's annual forecast vintage.

## Independent checks

The local `extract.py` script reads the independently downloaded CSVs and writes `expected.json`. It selects the exact dimensions above and asserts unique geography-month keys. It retains raw values, scaling, vectors, status, revision symbols, and independently calculated year-over-year changes.

The `Prove It Works` principle determined the review method. Actual published rows and metadata provide the checks. Application-generated fixtures do not establish source accuracy.


## Application comparison result

The independently downloaded raw archives match all three archive hashes in snapshot `bc33daac7ade7de311b2`. All three publication dates match the separately acquired API metadata.

The reviewer compared every retained observation against the original CSV. Checks include the normalized value, source scale, series vector, source status, source revision symbol, region, and month.

| Metric | Published observations | Suppressed | Unavailable | Absent series | Total retained |
| --- | ---: | ---: | ---: | ---: | ---: |
| Crude oil | 274 | 14 | 0 | 216 | 504 |
| Marketable gas | 341 | 0 | 163 | 0 | 504 |
| Electricity | 504 | 0 | 0 | 0 | 504 |
| Total | 1,119 | 14 | 163 | 216 | 1,512 |

All 1,512 observations match. The reviewer called the application's `monthlyObservation` function for each observation and compared the result with separate calculations. All 692 calculated year-over-year rates match within `1e-10` percentage points. All 820 unavailable rates remain null, including zero denominators and prior periods outside the retained window. The display uses the most recent 24 months, whose prior-year observations are present in the 36-month snapshot.

The local verification command is `python3 .data-cache/monthly-independent/compare_snapshot.py`. Its result is retained in `.data-cache/monthly-independent/comparison-result.json`. The independent extraction reads official CSVs directly and does not import the application's parser.

## Implementation review

The reviewer checked `pipeline/refresh_monthly_energy.py`, `monthly-energy-model.mjs`, `ui/monthly-energy.jsx`, the four page integrations, and the deployment refresh steps.

One validation gap was found and fixed before approval. The original browser validator accepted source confidentiality flags without checking their agreement with numeric availability. The revised validator checks both source status and source symbol against the observation's availability. The source parser retains these two fields separately, including electricity revision markers.

No remaining data-correctness blocker was found in the reviewed implementation. The parser selects exact series, validates units, preserves missing values, and fails on changed dimensions. The latest month is independent for each commodity. The release build requires recent source retrievals. Forecast models retain their original inputs, and the UI identifies the monthly panel as observed context. The pipeline refreshes the new table during both deployment and scheduled refresh.

Browser acceptance and public deployment are recorded by the parent task. This report establishes independent source accuracy and calculation verification; it does not claim that browser or deployment checks ran in this review.
