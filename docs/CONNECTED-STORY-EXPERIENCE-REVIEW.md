# Connected storytelling independent acceptance

Reviewed October 21, 2026 against the rebuilt local preview at `http://127.0.0.1:4206/`.

**Result: accepted. No remaining blocking defects found in the reviewed scope.** Two concrete defects were reported to the parent, fixed, and independently rechecked before acceptance.

## Scope and method

Independent headless Chromium review at 1440×1000, 390×844, 320×700, and 740×360. All browser work stayed in the background. Analysis endpoints were intercepted with an unavailable response; no inference was performed. The independent scripts live in `.data-cache/independent-connected-review/` and production files were not modified by this reviewer.

The review used direct UI interactions, ordinary mouse-wheel scrolling, keyboard navigation, DOM geometry checks, and manual inspection of representative screenshots across chapters and viewports. It supplemented the implementers' tests; it did not simply rerun those tests as the independent assessment.

## Verified behavior

- All six Explore chapters render with a shared map and readable account boundaries. Desktop presents map and account together; narrow screens stack them without horizontal overflow. Short landscape remains scrollable.
- Scenario editing changes commodity/province/comparison; keyboard activation of a map province updates selection. Native modal behavior keeps background controls inert and Escape closes the scenario editor.
- All 24 forward/wrap Explore transitions (six chapters at four viewports) now place the active chapter navigation button in focus and reveal the connected scene. The new chapter no longer opens at the old account's bottom.
- Trade-map keyboard selection of Alberta → British Columbia persists into “Follow this trade.” The guide's stage buttons and footer controls put the active heading in view and into keyboard focus. Returning to connections restores focus to the selected connection's entry action.
- Ordinary wheel scrolling advances exchange → provincial economy → household spending at all four viewports. The map readings and stage state follow the reader. The sticky map is usable on narrow portrait screens; short landscape removes stickiness so content remains reachable.
- Independent retail assumptions stay independent: a +10% retail scenario produced +$346/year and +$241/year for the reviewed AB/QC pair, and changing the commodity-price assumption to −20% did not change those retail results.
- Unavailable gas/electricity response models remain unavailable. A separately selected zero retail-price scenario produces a genuine $0 change. Explore's uncalibrated national response stays missing even at zero shock. Published trade-table zero values remain explicitly marked available.
- Visible copy distinguishes receipts from GDP/profit, historical associations from causal estimates, and province-wide scenarios from effects attributable to one trade. Overlapping effects are explicitly non-additive. Household output is labeled a spending equivalent, with the relevant model limitations nearby.
- No JavaScript page errors or horizontal page overflow were recorded in the four-viewport sweep.

## Findings resolved before acceptance

### P2 — Explore footer navigation retained the previous account's scroll position

Before repair, “Next account” from Sales left the Trading partners heading above the viewport by 128px at 390×844, 289px at 320×700, and 527px at 740×360. The map was entirely above the viewport and keyboard focus stayed on the footer action. This skipped the connected scene and opening explanation.

The repaired chapter navigation reveals the chapter controls and focuses the active chapter. All six forward/wrap transitions passed at all four requested dimensions. Evidence: `progression-recheck.json` and `explore-progress-fixed-*.png`.

### P2 — An unavailable provincial GDP model was described as having failed historical checks

Electricity → Provincial GDP for PE/NB showed “Historical checks not passed” in the map while the account correctly explained that no common calibrated electricity benchmark existed. This conflated unavailable and failed-validation states.

The repaired scene uses “No calibrated provincial response” for unavailable models, retaining failed-check language only for exploratory models. The regression script asserts both the corrected text and the absence of the misleading text. Evidence: `missing-model.mjs` and `explore-unavailable-model.png`.

## Evidence and limits

Primary independent artifacts: `review.mjs`, `review.json`, `deep-review.mjs`, `deep-review.json`, `progression-recheck.mjs`, `progression-recheck.json`, `missing-model.mjs`, and their screenshots under `.data-cache/independent-connected-review/`.

This acceptance covers the connected UI behavior, displayed interpretation, and representative missing/zero and price-independence cases. It does not constitute a new external audit of the source statistics or a change to the existing calculation models. No live deployment was performed by this reviewer.
