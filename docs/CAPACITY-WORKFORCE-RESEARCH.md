# Alberta workforce scenario research

Retrieved 21 October 2026. Primary recommendation: model **RN registrations and registration persistence**, not employer hiring or bedside capacity. Actual annual Alberta flows exist, including the latest 2025 snapshot. Employer reports supply useful context but not a comparable organization-wide gross-hire/exit series.

## Reproduce and provenance

Run `python3 pipeline/capacity_workforce_extract.py` from the repository root. It uses only Python's standard library and the cached official workbook under `.data-cache/capacity-workforce/`. Add `--refresh` to download the current file at the same URL. The output records a SHA-256 digest, source URLs, publication/retrieval dates, worksheet and individual cell coordinates. Assertions check the four required rows and every stock-flow transition.

[CIHI Nursing in Canada 2016–2025 tables](https://www.cihi.ca/sites/default/files/document/nursing-in-canada-2016-2025-data-tables-en.xlsx), published 23 July 2026, Table 3a: RN Alberta supply row 870; inflow row 882; outflow row 887; renewal row 892. Columns E:N cover 2016–2025. [Methodology](https://www.cihi.ca/sites/default/files/document/nursing-in-canada-2025-meth-notes-en.pdf) explains definitions on printed pages 9–16 and 22, and Alberta limitations on 36 and 40.

| Year | Supply | Entered registration | Outflow to next year | Renewed |
|---|---:|---:|---:|---:|
| 2016 | 34,992 | 2,467 | 2,153 | 32,525 |
| 2017 | 35,448 | 2,609 | 2,163 | 32,839 |
| 2018 | 35,691 | 2,406 | 2,243 | 33,285 |
| 2019 | 35,907 | 2,459 | 2,101 | 33,448 |
| 2020 | 36,394 | 2,588 | 2,496 | 33,806 |
| 2021 | 36,288 | 2,390 | 2,577 | 33,898 |
| 2022 | 36,302 | 2,591 | 2,608 | 33,711 |
| 2023 | 37,202 | 3,508 | 2,291 | 33,694 |
| 2024 | 42,694 | 7,783 | 3,331 | 34,911 |
| 2025 | 44,799 | 5,436 | unavailable | 39,363 |

Supply includes eligible registrants who are not employed. Inflows include graduates, migrants and returners. Outflow in year t means registrants in t who did not renew in t+1; it cannot be observed until the following registration snapshot. Secondary registrations are excluded. A valid identity is:

`Supply[t+1] = Supply[t] − Outflow[t] + Inflow[t+1]`.

All nine transitions reconcile exactly. This is an accounting check using observed future flows, **not evidence of forecast accuracy**.

## Conditional scenario

Start at 44,799 registrants in 2025. Illustrative baseline uses 5,575.67 entrants/year (2023–2025 mean) and 7.082738% annual outflow (pooled 2022–2024 outflow divided by supply). These recent rates include the changed registration regime and are assumptions about persistence, not official projections.

`S[t+1] = S[t] × (1 − max(0, q − retentionImprovementPP/100)) + I + extraEntrants[t+1−delay]`.

Usability bounds: additional registrations 0–3,000/year, registration-retention improvement 0–2 percentage points, delay 0–3 years (default 1). Defaults for the two intervention amounts should be zero. Bounds are illustrative, not estimated recruitment feasibility or program effectiveness. Apply no extra entries before the explicit lag. Retention operates on the existing stock at the next snapshot; never subtract exits below zero.

Never translate the result into employed nurses, clinical FTEs, staffed beds, procedures, waits or fiscal cost without separately sourced relationships. Recruitment/registration and actually starting a job are separate events. Regional distribution, hours, specialties, skill mix and placements remain unknown.

## Forecast check with a held-out time period

The retrospective check freezes parameters before the held-out period:

- Origin: 2020 supply, 36,394.
- Entrants: mean 2016–2020 = 2,505.8/year.
- Exits: pooled 2016–2019 = 8,660 / 142,038 = 6.09695997%. Exclude 2020 outflow because it requires 2021 registration data.
- Recursively predict 2021–2025 with no observed holdout values or flows fed into the model.
- Compare with fixed-origin no-change and linear-drift benchmarks over the same five years.

| Model | MAE (people) | RMSE (people) | MAPE |
|---|---:|---:|---:|
| Frozen registration stock-flow | 2,686.16 | 3,976.99 | 6.22% |
| Fixed 2020 supply | 3,142.20 | 4,711.83 | 7.25% |
| Linear drift fitted 2016–2020 | 2,608.70 | 3,718.67 | 6.08% |

The stock-flow forecast **does not beat the simple linear benchmark**. Its 2025 forecast is 37,663.80, versus 44,799 actual, an underprediction of 7,135.20. The 2024 registration-process change was not anticipated. Five annual outcomes are too few for robust accuracy certification or causal policy validation.

This is a **retrospective chronological holdout with July 2026 revised data**, not a real-time vintage backtest: historical data publication/revision availability at the 2020 origin has not been reconstructed. Training/holdout dates are enforced, and the one-year exit observation lag is respected.

## Employer hiring and retention context

The [AHS 2024–25 annual report](https://www.albertahealthservices.ca/assets/about/publications/ahs-pub-pr-2024-25-q4.pdf) records staff headcounts on p10, vacancies on p15/24 and paid-hours FTE on p51. [2021–22 quick facts](https://www.albertahealthservices.ca/assets/About/publications/ahs-ar-2022/ahs-numbers.html) extends staff headcounts to 2018–19. Both are captured in JSON separately from CIHI.

Staff headcount: 102,717; 103,340; 108,689; 112,373; 111,159; 113,897; 115,464 for 2018–19 through 2024–25. The latest count includes **10,580 Recovery Alberta employees** (p11 footnote). It must not be mixed with AHS-only vacancy/FTE populations. Current AHS is a different organizational scope after restructuring.

AHS-only vacancy rates for 2021–22 through 2024–25 are 14.2%, 14.8%, 11.8%, 11.3%. Vacancy is vacant positions divided by filled-plus-vacant positions. It is not staff turnover. Declining vacancies do not identify hires or departures.

Paid-hours FTE fell from 89,324 in 2023–24 to 87,062 in 2024–25, primarily because staff transferred to Recovery Alberta and overtime fell. Denominators also differ: 2,030.5 vs 2,022.75 annual hours. This is not a loss of 2,262 individual workers.

AHS reports 208 internationally educated nurses hired (p51), and over 600 offers accepted versus over 200 arrivals and work starts through the IEN initiative (p22). These subset/cohort counts demonstrate why starts cannot be equated with offers; their ratio is not an estimated completion rate or duration. Surgical RN one-year retention of 67% on p31 is a specialty-specific measure with insufficient cohort definition for use as an organization-wide retention parameter.

A separate employer sensitivity could accept extra hires who actually start and extra existing staff retained as **assumed counts**, with explicitly assumed persistence and lag. It must not invent gross flows from changes in headcount or substitute RN registration attrition for AHS attrition. The production recommendation is to keep the statistically stronger registration stock-flow scenario and disclose this employment limitation.

## Remaining material limitations

CIHI suppresses RN employment/direct-care data from 2024 because voluntary employment reporting causes significant under-coverage. CIHI attributes the large 2024 supply increase to more registration pathways. 2021 contains only part of pandemic return-to-practice registrations. The exact stock-flow identity and historical fit establish accounting consistency and forecast limitations, not that any funding, migration, retention or recruitment policy caused observed changes.
