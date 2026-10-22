# School capacity and funding evidence

Reviewed 21 October 2026. The scope is **Calgary Board of Education (CBE)**, not every Alberta school division. `capacity-schools-research.json` contains source URLs, dates, observations and diagnostics. Rebuild with `python3 pipeline/capacity_schools_extract.py`. Optional `--fetch` downloads primary PDFs, saves SHA-256 hashes and extracts review text; use a Python environment with pypdf. Tables with image-only content remain manually transcribed and visually verified.

## Funding comparison: eligible enrolment, not all students

[Alberta's model description](https://www.alberta.ca/k-to-12-education-funding-model) gives weights 20/30/50 for 2020/21–2024/25, and 30/70 beginning 2025/26. For target year t, the inputs are t−2 actual, t−1 current estimate, and the published projection for t. Here each CBE budget itself reports the current September count as **Actual**, so the inputs do not use later data in place of an unavailable estimate.

Use **eligible Grade 1–12 FTE only**. Exclude ECS, home education and ineligible students. Do not mix the total-headcount chart with the funding table. The information-only student statistics in the financial report are explicitly outside the audited financial statements.

| Budget vintage | Target school year | t−2 actual | t−1 actual published in budget | Published target forecast | Later target actual |
|---|---|---:|---:|---:|---:|
| 30 May 2023 | 2023/24 | 115,102 | 120,654 | 127,706 | 127,806 |
| 28 May 2024 | 2024/25 | 120,654 | 127,806 | 136,461 | 131,902 |
| 27 May 2025 | 2025/26 | 127,806 | 131,902 | 137,195 | 132,853 |

Sources: [2023 budget PDF p34](https://cbe.ab.ca/about-us/budget-and-finance/Documents/Budget-2023-24.pdf), [2024 budget PDF p34](https://cbe.ab.ca/about-us/budget-and-finance/Documents/cbe-budget-report-2024-2025.pdf), [2025 budget PDF p32, printed p31](https://www.cbe.ab.ca/about-us/budget-and-finance/Documents/Budget-Report-2025-2026.pdf), [2024/25 financial results PDF p131](https://cbe.ab.ca/about-us/budget-and-finance/Documents/Financial-Results-2024-25.pdf). Budget approval dates are in the signed/certified submission pages. Every actual is on the September-count basis specified in the table notes.

On exactly the same vintage inputs, two-year minus three-year weighted eligible FTE is 2,520.8, 3,161.4 and 1,877.8 respectively. These are **reconstructed rule calculations**, not observed final funding allocations. A 100%-of-target-projection option is a clearly hypothetical rule. Applying 100% of later actual would be an ex-post benchmark unavailable at budget time and must be labelled separately.

The three published forecasts have errors of −100, +4,559 and +4,342 FTE (forecast minus actual), MAE 3,000.33. The no-growth comparator, using each budget's current actual count, has MAE 4,066.33. This is a small, genuine vintage-forecast evaluation. It evaluates the board forecasts, **not** the causal effects or predictive validity of our policy simulator. The short sample includes rapid growth followed by flattening; it cannot support narrow confidence intervals or a reliable universal growth rate.

No net dollar impact is calculated. The 2025/26 change coincided with removal of the Supplemental Enrolment Growth Grant, while other rates/programs also changed. Grade-specific rates and eligibility further prevent a single total-dollar-per-student conversion. The [2024/25 financial discussion, printed p19](https://cbe.ab.ca/about-us/budget-and-finance/Documents/Financial-Results-2024-25.pdf) explains the grant removal. Additional funding is not by itself proof of additional hired staff or delivered classrooms.

## Construction: known projects, dated openings

The [capital plan approved 29 March 2022](https://www.cbe.ab.ca/FormsManuals/Three-Year-School-Capital-Plan-2023-2026.pdf), PDF p6, records approval dates, approved capacities and then-planned openings. Compare those dates with the [13 June 2023 construction status report](https://cbe.ab.ca/about-us/board-of-trustees/BoardofTrusteeDocuments/20230613-public-agenda-regular-meeting.pdf), PDF p114, Attachment I p1 of3, and the [North Trail/Prairie Sky opening article](https://www.cbe.ab.ca/news/prairie-sky-school-north-trail-high-school-celebrate-official-openings-1773688984626). The latter explicitly distinguishes opening to students from subsequent ceremonial openings.

| School | Construction approval | Approved design places | Plan at March 2022 | Actual opening | Difference in months |
|---|---|---:|---|---|---:|
| Mahogany | March 2018 | 600 | September 2022 | 1 September 2022 | 0 |
| Bayside | 1 November 2019 | 600 | September 2022 | 1 September 2022 | 0 |
| Lakeshore | 1 November 2019 | 900 | September 2022 | 11 October 2022 | +1 |
| Prairie Sky | March 2018 | 900 | September 2022 | 3 April 2023 | +7 |
| North Trail | 1 November 2019 | 1,800 | September 2024 | September 2023 | −12 |

Lakeshore and North Trail had design-only approval in March 2018, distinct from full construction funding in November 2019. The capital table gives March 22, 2018 while the subsequent narrative gives March 23; month precision avoids pretending this one-day discrepancy is resolved.

**4,800 approved design places are associated with these five subsequently opened projects.** This is not 4,800 verified staffed seats or net system capacity. Actual provincial capacity measures differ: for example, the 2023 report records North Trail at 1,891 and Prairie Sky at 813. The JSON retains [2023](https://cbe.ab.ca/FormsManuals/School-Enrolment-Report-2023-2024.pdf) and [2024](https://cbe.ab.ca/FormsManuals/School-Enrolment-Report-2024-2025.pdf) provincial-capacity observations separately; do not splice them into the approved-design series. Provincial utilization also uses weighted enrolment (including severe-disability and Kindergarten weights), not raw headcount. District-wide ratios would need matching weighted demand and capacity.

For the fixed cohort, mean absolute published-plan timing error is 4 months, with errors 0, 0, +1, +7, −12 months; median full-construction-approval-to-opening duration is 46 months. This is a descriptive schedule check, not a fitted out-of-sample construction forecast. Five completed projects exclude cancellations and still-unfinished projects and cannot establish a representative delay distribution. [CBE guidance](https://www.cbe.ab.ca/school-capital-construction-projects) says elementary/middle delivery generally takes 3–4 years and high-school delivery 4–5 years from provincial approval, but that guidance is not a guarantee.

A defensible simulator moves these known opening dates by a user-selected number of months and reports cumulative **approved design places in opened projects**, or incremental design place-months. It must not count projects before their opening, call a pipeline delivered, or imply that an arbitrary budget increase causally buys an acceleration. The current provincial project register lists North Trail's estimated cost as $65.1 million; it is not a final cost outturn and is deliberately not converted into marginal cost per place.

## Review and remaining limits

The core eligible-FTE tables were visually inspected and independently checked by the model-review agent. The school project approvals were checked against the original capital plan and openings against subsequent district reports. The extract script checks grade-group sums and computes errors deterministically.

This research supports a bounded historical replay and transparent rule scenarios. It does not support a validated Alberta-wide service-capacity forecast, net-dollar counterfactual, hiring response estimate, classroom-size prediction or causal policy-effect claim.
