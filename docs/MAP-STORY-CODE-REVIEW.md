# Connected guide map: independent implementation review

Reviewed 2026-10-20 by an independent agent. Production files were read, not edited. Browser checks used headless Chromium against the local production build on port 4201. No model inference was requested.

## Findings

1. **Resolved — failure state looked like continued loading.** When guided JSON sources failed, the stage offered Retry sources but the map endpoints continued showing Loading. The implementation now receives the load status, shows Unavailable on failure and disables endpoint buttons when their corresponding result cards do not exist. Reproduced the failure, then verified the repaired state in the browser.
2. **Resolved — compact map made province labels unreadable.** A 620×360 SVG displayed at 124px high reduced 15-unit labels to approximately 5.2 CSS pixels. The ResizeObserver implementation now fits the geometry to the actual SVG dimensions; browser inspection confirmed a 354×124 viewBox at a 390px viewport. Labels retain their intended screen size.
3. **Resolved — neighboring labels overlapped another endpoint.** In the first compact NS→PE map, NS's label occupied PE's marker position because both labels used the same upward offset. Pair-aware placement now puts the lower endpoint label below its marker when anchors are close. Independently checked actual DOM label and marker bounds for AB/BC, QC/NB, NS/PE, YT/NT and NT/NU at 390px and 320px: no collisions in all ten cases. The fixed Maritime screenshot was also inspected visually.
4. **Resolved — delta labels were ambiguous.** The map displayed changes under Sales receipts, Purchase costs and Real GDP level. It now names them Receipts change, Costs change and Real GDP change. Household values also explicitly say change. These labels preserve the economic interpretation with less prose.

## Verification

- Audited projection geometry for all 156 directed province/territory pairs, with 101 curve samples each (15,756 points). No sampled connection clipped the 620×360 scene. Both endpoint anchors retained at least 35.5 pixels of edge clearance in that configuration.
- Compared 108 endpoint values covering oil, gas and electricity; negative, zero and positive shocks; three guide stages; and benchmark/retail household bases. Every value matched the existing guided economic result. No exploratory GDP value appeared as a supported result.
- Confirmed that the selected path remains identical when moving from Exchange to Provincial economy and that the animation disappears on the latter stage. Map endpoint activation moved keyboard focus to the matching province article and highlighted its geographic boundary.
- Confirmed the motion hook starts animation when visible, pauses on the control, pauses when the map is below the viewport, stops and disables the control after a live reduced-motion preference change, and resumes when that preference is removed. The listener updates are asynchronous; checks waited for the settled rendered state.
- At 390×844, the stage heading was fully visible below the 223px sticky map after navigation and there was no horizontal overflow. At 844×390, both map and map column used static positioning.
- Source-failure check: both endpoints said Unavailable and both inspect buttons were disabled. The stage retained Retry sources. Retrying successfully restored values and enabled the targets. A focused BC result stayed selected after temporarily hovering AB and moving the pointer away, confirming separate keyboard-focus and hover ownership.
- No browser runtime errors in the traversed exchange, provincial and household paths.

## Semantic boundaries

The map is a presentation of existing computed results. It introduces no economic coefficient, independent price assumption, forecast or persistent filter. Moving marks mean direction only, with fixed styling independent of price. A static connection remains contextual in provincial and household stages, which explicitly label the results as separate province-wide estimates. GDP support checks and household spending-equivalent caveats remain in the detailed results. The retail assumption remains separate from the commodity-price shock.

## Evidence

Local review artifacts are in `.data-cache/map-story-code-review/`: mobile and Maritime screenshots, source-failure state observations, and settled motion behavior. Geometry and value checks were independently executed from the published local source data rather than copied from implementation tests. The final candidate resolves all four review findings. No blocking implementation or semantic defects remain in the reviewed scope. The parent still owns full regression tests and deployment verification.
