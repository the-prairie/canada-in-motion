# Alberta public services — independent experience review

Reviewed 2026-10-21 against the final locally served production preview at `http://127.0.0.1:4207/`. This review was performed independently of the UI implementation and source-verification work. No application source, build output, or deployment was changed by this reviewer.

## Decision

**Pass for release of this story, within the tested scope.** Earlier responsive layout failures and the rounded-endpoint Canada spending percentage mismatch were reported, repaired by the implementer, and verified again against the rebuilt preview. No unresolved release blocker remains in the tested story.

## Rendered experience

Headless Chromium only; no foreground browser was opened. Tested desktop 1440×1000, phones 390×844 and 320×740, and short landscape 740×360. At each viewport, visited Population, Schools, Health and Housing, then clicked every available evidence-measure selector: eight distinct chapter/measure states per viewport, 32 total. Captured all states and the Evidence dialog at each viewport. Inspected screenshots directly, including the previously failing Schools layout at 320 and 740 pixels.

The final served build has no page-level horizontal overflow, chart-panel escape, unexpected chapter change during measure selection, or clipped chart notes in its supported visible-note layouts. Exact endpoint values, dates, units and change labels remain visible. Forecast hospital spending is labelled in the legend and visually distinguished with dashed bars. The 740×360 layout keeps all controls and observations onscreen; detailed notes are available through Evidence. Portrait phones dedicate substantial screen space to the sticky evidence scene, but the narrative remains reachable through native scrolling and chapter controls. The chapter hierarchy, restrained chart palette and single Evidence surface keep the main experience simple.

Evidence tables intentionally scroll horizontally inside the modal on narrow phones. They do not expand the page. Keyboard-focusable table regions provide access to the remaining columns.

## Interaction verification

The independent checks cover:

- Keyboard chapter activation, focus transfer to the chapter heading and visible focus outline.
- Browser Back/Forward, reload from a chapter deep link, and an externally changed hash.
- Native forward and reverse page scrolling updating the current chapter.
- Modal keyboard traversal without reaching an interactive background element; native browser chrome can temporarily receive focus at the Tab boundary.
- Evidence Close and Escape restoring focus to the opener.
- Downloading evidence with the current stage/measure, complete calculated result and an exact copy of the local source snapshot.
- The visible 2025 forecast label and the published Canada hospital-spending change of **43.1%**.
- Leaving through global navigation, scrolling/resizing while the story is hidden, and returning without the hidden story altering retained route state.

The global location control is above the scrolled story. Returning to that control can naturally change the active story chapter through scrolling before navigating away; the hidden-host test records the chapter after leaving, then verifies that it remains stable. The `getClientRects()` visibility guard appropriately prevents hidden sections from updating story state on later page scroll/resize events.

The renderer reported zero page errors and zero inference requests. Both `/api/analysis` and `/api/analysis/status` were intercepted; inference was blocked and status was marked unavailable. No paid AI calls were made.

## Independent arithmetic and interpretation

Recomputed all two-endpoint changes and percentage changes independently from the local dataset, plus the three derived school ratios. Results agree with the model:

| Calculation | Independent result |
| --- | ---: |
| Real instructional compensation per student, 2022–23 to 2023–24 | −0.3861% |
| Students per educator, same period | +0.5825% |
| Alberta school-board spending relative to comparable Canada average | −14.2434% |
| Emergency stay change | +0.5 hours |
| Hip surgery within benchmark | +7.7 percentage points |
| Calgary new-tenant rent | −4.7224% |
| Edmonton new-tenant rent | +2.5641% |

CIHI’s published Canada hospital-spending change is 43.1%; dividing the rounded displayed dollar endpoints instead gives about 43.1646%. The model correctly preserves the published percentage and exports its basis. Population and bed indexes also preserve the published percentage changes rather than inventing exact underlying counts.

The source limitations are represented honestly: different observation periods; real compensation versus nominal total school-board spending; educator counts versus class size; the comparable Canada spending average excluding NB, NL and the territories while including Alberta; 2025 hospital spending forecast; emergency waits at busiest sites; scheduled hip surgeries; and new-tenant two-bedroom purpose-built CMA rents rather than all households or Alberta-wide rent. The 2025–26 funding-rule change is identified as later than the school observations. Primary-source verification is the separate data reviewer’s responsibility; this report does not claim an additional external source audit.

The demand/money/capacity/outcomes distinction is an appropriate limited application of the systems-thinking request. The main scene explicitly calls it a conceptual framework, not a causal estimate. The Evidence explanation distinguishes money flows, service capacity, delays and observed outcomes and cites Meadows. Neither the model nor the visuals estimate how much migration, funding or policy caused the changes; there is no inferred annual path between endpoints. School-growth measures span demand, resources and capacity even though the grouped panel highlights Capacity, so the indicator should be read as a thematic category rather than an exhaustive classification.

## Evidence and reproducibility

All independent artifacts are under `.data-cache/alberta-services-independent/`:

- `review.mjs`: independent 32-state responsive render and measure-control exercise.
- `render-review.json`: final served-build geometry, visible chart text, modal checks, page errors and inference-call evidence.
- `1440-*.png`, `390-*.png`, `320-*.png`, `740-*.png`: final served-build screenshots.
- `interaction.mjs` and `interaction.json`: keyboard, history, deep-link, modal, export and hidden-host checks.
- `arithmetic.mjs` and `arithmetic.json`: independent endpoint/ratio verification and limitations.
- `export.json`: downloaded evidence snapshot from the mobile render exercise.
- `initial-render-review.json`: original failing geometry retained for comparison.
- `local-css/`: intermediate verification using the implementer’s newest CSS before rebuild; **not** the release acceptance evidence.

The review scripts use the bundled Playwright module and an explicit local headless Chromium executable. Browser/font/device differences outside the four tested viewport configurations, assistive-technology announcements, and 200% zoom were not separately tested. Those limits do not negate the completed desktop/mobile acceptance checks.
