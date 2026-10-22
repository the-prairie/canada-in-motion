# Alberta capacity model — independent review

Review date: 2026-10-21. Scope: source interpretation, independent arithmetic, model invariants, consolidated data and historical-test claims. Ready within this reviewed scope, provided the stated interpretation limits remain visible. Rendered UI and deployment are outside this review.

## Acceptance criteria

The defensible deliverable is a **conditional scenario simulator with historical checks**, not an empirically established estimate of policy effects. Separate three evidence classes:

1. **Observed history:** attributed values, measurement dates, units, populations, source vintage and revisions.
2. **Accounting or policy-rule replay:** recomputation from known inputs. An exact match tests implementation and data alignment; it does not demonstrate forecasting skill.
3. **Forecast evaluation:** predictions made without evaluation-period outcomes or flows. Compare with a persistence baseline, display every held-out year and disclose the training cutoff, sample size, horizon and data vintage. Historical forecasts originally published by an authority are preferable when available.

For retrospectively constructed tests using a recent workbook, say “retrospective holdout using the [vintage] dataset.” Do not call these contemporaneous forecasts or claim that all inputs were publicly available at the historical forecast origin. A future-date split alone does not establish historical publication availability. Report MAE and signed error in meaningful units; do not imply significance from a few annual observations. A baseline that loses to persistence should be presented as a weak projection, not a validated model.

These requirements follow the distinction between fitted residuals and unseen forecast errors in [Hyndman and Athanasopoulos, evaluating accuracy](https://otexts.com/fpp3/accuracy.html), the prior-observations-only rule in [time-series cross-validation](https://otexts.com/fpp3/toolbox.html), and the use of real-time vintages and benchmark forecasts in [Bank of Canada working paper 2018-52](https://www.bankofcanada.ca/2018/10/staff-working-paper-2018-52/).

## Nursing stock and flows

[CIHI’s 2025 methodology notes](https://www.cihi.ca/sites/default/files/document/nursing-in-canada-2025-meth-notes-en.pdf), page 22, define inflow from preceding-year registration and outflow from following-year nonrenewal. This independently confirms the same definitions in the previous vintage. Consequently:

`Supply[t+1] = Supply[t] − Outflow[t] + Inflow[t+1]`.

At a retrospective 2020 observation cutoff, inflows through 2020 and outflows through 2019 are usable. Outflow 2020 uses 2021 information and must not train a forecast of 2021. Even these permitted rows do not prove real-time publication availability.

The same source, pages 36 and 40, attributes Alberta’s 2024 RN supply increase to registration-process changes and states that workforce and employment elements have been suppressed since 2024 because voluntary employment reporting produced significant under-coverage. Registration supply therefore cannot be renamed hires, direct-care workforce, FTE, beds staffed, patient access or health outcomes. A retention control is nonrenewal reduction in this series; no estimated causal response to pay, spending or another intervention is established.

New registrants must enter only once. Retention cannot exceed 100%; exits cannot exceed starting stock. Zero inflow and zero exits preserve stock; zero inflow with positive exits reduces it. Reducing exits must not lower stock when other assumptions are fixed. Future scenarios should not treat 2024’s registration jump as a stable annual trend without explicit warning.

## Schools and funding

Keep school-board scope and school-year labels. Do not combine all-student headcount, funded FTE and eligible enrolment without an explicit crosswalk. For funding year t, preserve which inputs are past actuals, current estimates and budget projections. Calculate alternative weights on identical eligible counts. A change in weighted enrolment is neither a grant-dollar estimate nor a net funding change when rates or other programs change.

Published enrolment projections may be checked against later actuals only if definitions match. Persist source issue date, forecast horizon, reference date and actual-count definition for each pair. An average of a few board forecast errors does not validate workforce, construction or province-wide outcomes.

## Construction and effective capacity

Separate announcement, approval, funded start, construction start and operational opening. A planned opening is a forecast, not a completion. Existing pipeline and new scenario starts must not be counted twice. Completions occur after the stated lag; increasing a lag must not raise cumulative completions at a fixed date. End-of-horizon uncompleted projects remain in a pipeline rather than disappearing.

Physical places, funded places and staff-supported places are different quantities. Any conversion from staff to places is a disclosed user assumption or an independently sourced staffing rule, not a fitted causal coefficient. If effective capacity is defined as the minimum of physical, staffing and operating-funding constraints, show each binding input and preserve all units. Capital dollars do not automatically purchase recurring staffing or operational capacity.

No historical construction-performance claim is acceptable without matched project cohorts, pre-outcome schedule vintages, operational completion dates and inclusion of delayed/uncompleted projects. A collection of successful openings is vulnerable to selection bias.

## Required implementation checks

- Independent known-input calculations, not assertions that reuse the production helper.
- Every displayed historical error agrees with the source pair and a separate calculation.
- No scenario input changes historical observations or fitted parameters unless the UI explicitly describes that action.
- No uncertainty/confidence band generated from an arbitrary sensitivity range; label it sensitivity instead.
- Missing, suppressed and unavailable observations remain missing, not zero.
- Invalid numeric inputs cannot create NaN/Infinity, negative stocks, retention above 100%, or negative delivery lags.
- Sensitivity controls show their units and default provenance. Calculated scenario outcomes remain identified as conditional.

## Review status

**Ready within reviewed scope.** No unresolved numerical or information-leakage blocker was found in `capacity-model.mjs` and `capacity-data.json`. Run `node tests/capacity-independent.mjs` to reproduce the independent checks. It uses source-checked literal observations and closed-form geometric stock solutions, independently of the production recurrence.

### Evidence independently checked

- All 40 RN stock, inflow, outflow and renewal observations match raw XML in the official [CIHI 2016–2025 workbook](https://www.cihi.ca/sites/default/files/document/nursing-in-canada-2016-2025-data-tables-en.xlsx), Table 3a rows 870/882/887/892. Latest outflow is missing, not zero. Workbook SHA-256 is `be8d62a7c7581028dfa559223626364d9706ef87cb2aad7c2c2f64488d5140bc`. The [release landing page](https://www.cihi.ca/en/registered-nurses) is dated July 23, 2026.
- RN stock-flow accounting reconciles nine transitions exactly. The retrospective 2020-origin holdout predicts 2021–2025 using mean entrants 2,505.8 and outflow rate `8660/142038`. MAE is **2,686.16 registrants**, versus **3,142.20** for same-origin no-change and **2,608.70** for same-origin linear drift. The stock-flow model loses to the latter. Its 2025 prediction is 37,663.80 against 44,799 observed. Five outcomes do not establish robust predictive performance.
- CBE eligible Grade 1–12 counts and column headings were visually checked in [2023 budget p34](https://cbe.ab.ca/about-us/budget-and-finance/Documents/Budget-2023-24.pdf), [2024 budget p34](https://cbe.ab.ca/about-us/budget-and-finance/Documents/cbe-budget-report-2024-2025.pdf), and [2024–25 financial results PDF p131](https://cbe.ab.ca/about-us/budget-and-finance/Documents/Financial-Results-2024-25.pdf). The last is an information-only student schedule, outside the audited financial statements; it explicitly distinguishes actual 2025/26 132,853 from budget 137,195. Three published forecast errors are −100, +4,559 and +4,342 FTE: MAE **3,000.33**, versus **4,066.33** for each vintage's prior-count baseline. These evaluate the board's forecasts, not simulator-created forecasts.
- [Alberta’s official funding weights](https://www.alberta.ca/k-to-12-education-funding-model) independently match 20/30/50 and 30/70. At 2025/26's published inputs, the two-year result is **135,607.1**, versus **133,729.3** for the old weights; difference **1,877.8**. These are reconstructed weighted eligible counts, not net grants or observed final funded counts.
- The five construction projects' approval dates, planned dates and approved capacities match the [March 2022 capital-plan table, PDF p6](https://www.cbe.ab.ca/FormsManuals/Three-Year-School-Capital-Plan-2023-2026.pdf). Four opening dates are in the [June 2023 agenda, PDF p114 / Attachment I p1](https://cbe.ab.ca/about-us/board-of-trustees/BoardofTrusteeDocuments/20230613-public-agenda-regular-meeting.pdf); [CBE's opening article](https://www.cbe.ab.ca/news/prairie-sky-school-north-trail-high-school-celebrate-official-openings-1773688984626) confirms North Trail opened in September 2023, before its ceremonial opening. Total approved design capacity is **4,800 places**. Schedule errors are **0, 0, +1, +7, −12 months**, with mean absolute error **4 months**. The capital-plan table includes a sixth project with a TBD opening: the selected five are not an exhaustive delivery-performance sample.

### Independent production checks passed

The script confirms that perturbing every post-2020 stock/inflow/outflow and the 2020 outflow leaves historical predictions unchanged. It checks the future baseline and a combined delayed-entrant/retention scenario against closed-form solutions, unchanged observations, zero-intervention identity, decomposition totals and entry timing. One complete waiting year means first additional entrants in 2027 from the 2025 origin.

The consolidated adapter preserves source records and reproduces eligible-count fixtures, forecast metrics, cumulative construction totals and schedule errors. Delaying every selected project by 12 months loses **57,600 design place-months**, with no claim about staffed availability. Fourteen malformed-data mutations are rejected: missing/duplicate years, invalid stocks/flows/sources, invalid eligible counts, post-outcome forecasts/plans, mismatched prior counts, negative design places and post-opening approvals. Non-finite opening shifts are rejected.

Final metadata recheck: the 2024/25 CBE budget approval date is **May 28, 2024**, independently verified on the signed certification at PDF p26. The consolidated vintage now uses `2024-05-28`; the actual-opening source locator now correctly points to PDF p114 / Attachment I p1 of3. Consolidated funding and construction records exactly match the corrected research JSON. The independent script passed again after these corrections; model hash and numerical results are unchanged.

Reviewed consolidated data SHA-256: `bb07a41faf6d60f13b909820e1b093a0da45e3fc428d47106ba7b165cd8686eb`.

Reviewed production model SHA-256: `2123eec76f94c01eddcf53e3a3fbdf58d68780196154785e91d7e592f2eed0be`.

Remaining limits are substantive: recent RN calibration includes the registration-process surge; CBE observations cover one board; construction is a selected historical cohort; no fiscal cost, staffed capacity, class size, wait-time, achievement or causal policy effect is estimated. Rendered control behavior, copy, accessible chart presentation and deployed build still require the implementation team's checks.
