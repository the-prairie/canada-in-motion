# Alberta capacity simulator acceptance

Reviewed October 21, 2026. Candidate code version `df16cf648df73dbb2bb2`.

## Delivered

The Alberta public-services story now has Observed change and Test capacity views. The simulator has three source-backed conditional comparisons:

- Alberta RN registration supply: annual extra entrants, lower non-renewal rates, entry delays and projection horizon. Ten annual observations through 2025 remain fixed. Eligible registrants are not employer hires, employed FTE or staffed beds.
- Five completed Calgary Board of Education projects: shift historical opening months and compare cumulative approved design places with the 2022 plan and actual openings. Physical design capacity is not staffed capacity. The cohort excludes projects without known openings and cannot establish representative construction performance.
- CBE eligible Grade 1–12 FTE: compare 20/30/50, 30/70 and full-projection weights using three original budget vintages. Altering a scenario never alters historical forecast validation. Rule results are not net grant dollars.

The UI preserves selections in shared URLs, provides source and validation tables through Evidence, and exports the selected scenario, calculations and complete source snapshot. Data load lazily and can be retried after failure. All calculations run locally without model-provider calls.

## Historical evidence

Independent source review and literal-fixture tests are recorded in `CAPACITY-MODEL-REVIEW.md`. RN retrospective holdout MAE is 2,686 versus 2,609 for a simple trend: no claim of predictive improvement. CBE original enrolment forecasts have MAE 3,000.33 eligible FTE versus 4,066.33 for no growth across three years. Five known school openings differ from their 2022 planned months by four months on average. None establishes a causal effect of spending or policy.

## Verification

- 433 JavaScript tests pass, including independently transcribed source observations, no future-outcome leakage, closed-form nursing calculations, construction invariants, funding formulas, malformed-data rejection and normalized URL-state round trips.
- 139 Python pipeline tests pass.
- Public beta release gate and production build pass; the unchanged national release is `6e50f5b7fe67a57c00ce` with 317,942 records and original retrieval date retained.
- Capacity E2E passes desktop, 390px, 320px and 740×360 landscape: all topics and controls, model-versus-displayed/exported values, keyboard controls, modal focus, topic-specific source tables, shared reload and return to observed story. Zero runtime exceptions or inference calls.
- Load/retry test confirms no capacity request in Observed change, recovery after a simulated 503, and reuse of the validated snapshot across view switches.
- Existing Alberta story E2E passes all four chapters and measures, scroll/navigation, evidence, export, narrow phones, landscape and shared state.
- Whole-app navigation E2E passes all 13 destinations at four viewport sizes, keyboard, Back/Forward, share reload, province context and supported Ask scope.

## Release

Independent experience review accepted final build `df16cf648df73dbb2bb2` after nine topic/viewport states and the topic-specific Evidence fix. Deployment and live verification pending. Curated capacity snapshots are deliberately not described as automatically refreshed. Updating requires rerunning the source extractors, source review and validation before rebuilding `capacity-data.json`.
