# A connected energy investigation

## Workflow

- [x] Read the Principles section of the poteto-mode skill.
- [x] Phase A: Frame.
- [x] Phase B: Design the workflow.
- [x] Phase C: Run the loop.
- [x] Phase D: Keep the audit trail.
- [ ] Phase E: Verify and hand back.

## Outcome

A visitor can investigate an energy price change, identify the selected province's trading partners, compare another province, distinguish domestic and international sales, inspect published budget sensitivities and see a correctly scoped national oil-price calculation. Changing a control updates the explanation and the figures together. Sources, periods, unknown effects, comparison and export remain available without requiring an AI call.

The existing AI workspace remains available for broader questions. This release does not invent a causal provincial GDP model or change provider spending permissions.

## Definition of done

1. A shared, normalized investigation state controls commodity, province, comparison, price change, trade year and the selected explanatory chapter.
2. Domestic trade, international trade, fiscal sensitivity and national GDP results preserve their distinct units, periods and interpretations.
3. The main result, comparison, map and written explanation agree after every supported control change.
4. A user can navigate by keyboard, use a narrow touch screen, undo a change, share the selected state and export the evidence.
5. Missing data and unsupported effects remain distinct from zero. Loading failure offers recovery.
6. Existing data views and shared links remain usable.
7. Independent review, model tests, browser checks and public deployment verification pass.

## Throughput checkpoint

The first unknown is whether the existing evidence can support a connected explanation. Two read-only agents inspect the design and economic contracts. The parent owns application integration and the responsive interface. A separate model implementer will own a new pure calculation module and its tests. Writers will not share files.

The sequence is model and contract verification, interface integration, browser proof, independent acceptance, repair, deployment and public recheck. Existing observed data and published model calibrations supply the calculations. No new provider expenditure is required for direct exploration.

## Design alternatives

The independent design review compares an editorial investigation with focused chapters against a persistent map and inspector. The chosen design must show a useful answer before a dense national table, preserve the selected question, and work as a reading sequence on a phone.

## Verification

The prior public build is code version `0c3dbca33ad7e34c0a58`. Baseline screenshots are in `.data-cache/experience-review`. The trade view places Alberta's principal customer row near the bottom of the first desktop screen. The oil view shows a national calculation while Alberta remains selected in the global place control.

Tests will assert actual answers, control changes, source scopes, exported values, URL recovery, keyboard focus and missing-data behavior. Browser tests run headlessly.

## Implemented design

The default economy view now opens a connected investigation. Existing explicit section links retain their destinations. A shared selection drives six focused chapters. Detailed datasets remain available through Data views.

The interface exposes domestic and international sales on separate valuation bases, selected trading partners, budget sensitivities, a national oil-price illustration, independent provincial forecasts and household modelling limits. Current explanations derive from calculated results. Existing OpenUI answers also have current-selection findings and editable national oil assumptions.

The pure model owns normalization, calculation channels, source attribution and portable exports. The React component owns presentation and reversible selection history. The existing economy controller owns URL state, data loading and navigation.

Independent acceptance found and retested three defects. Zero-flow copy now follows actual values; forecast drill-down carries the displayed year and comparison; missing calibration is labelled as an app coverage gap. Subsequent parent verification covered focused-first fiscal ordering, action-menu dismissal, bounded shared-state fields and non-preset oil values.

## Release checks

Local candidate `11528aa38f98a3584f29` passed 329 JavaScript tests, 23 local Worker tests, the full connected-investigation browser flow, the provincial forecast browser flow, the forecast AI fixture flow and the Alberta well-table regression. Tests use headless Chromium. AI response fixtures verify interface integration without billed inference.

The new browser harness is `tests/e2e/energy-story.mjs`. It checks source-backed values, local recomputation, keyboard interaction, URL restore, export replay, missing data, recovery, responsive containment, scoped forecast handoff and current OpenUI findings.

Public deployment and verification are recorded in `ENERGY-INVESTIGATION-RELEASE.md` when complete.
