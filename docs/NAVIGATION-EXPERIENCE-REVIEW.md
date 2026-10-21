# Navigation experience review

Review date: 2026-10-21. Independent reviewer. Browser work used headless Chromium only. Analysis status was stubbed and analysis requests were blocked. No provider inference was invoked.

## Baseline

The public app was inspected at 1440 × 1000, 390 × 844 and 320 × 844. The sweep covered Explore a question, Income, Provincial GDP outlook, Trade & prices, Follow the dollar, Energy futures, Oil & the economy, Well atlas, Find a well, Closure budget, Carrier quotes and Cost experiment. Screenshot and measurement artifacts are in `.data-cache/navigation-review/`.

All 36 initial view/viewport combinations fit the document width. No JavaScript page errors were captured. The first desktop atlas screenshot caught loading, so atlas behavior is evaluated through the separate record-ready walkthrough.

The main navigation has three domain tabs. Economy adds a seven-destination horizontally scrolling account row. Several views add another result or chapter tab row. These layers use different active styles, and the account row mixes observed accounts, future projections and experiments without explaining their relationship.

On a 390px screen, Explore's heading begins at 200px. Income, Energy futures and Oil & the economy begin at 258px. GDP outlook begins at 262px. Follow the dollar begins at 306px. The separate Ask row adds 58px before most economy pages, and Follow the dollar adds 48px from its outer layout. Several economy destinations remain off-screen in the account row.

### Findings sent to implementation

1. Replace the competing top-level and account bars with one current-location control and a grouped destination list. Keep local chapter and result tabs beside the content they control.
2. Put Ask with the compact shared navigation actions. Do not leave a separate mostly empty row above the content.
3. Give related tasks visible context without adding explanatory paragraphs. Preserve URL state and browser Back when switching destinations.
4. Closure budget's default costs are invalid HTML input values. Both 75,000 and 150,000 conflict with `min=1` and `step=5000`, which produces a red invalid border before interaction. Align the input step with valid values and keep positive-value domain validation.
5. Remove the remaining Closure budget and Cost experiment eyebrows. The heading and labelled inputs already communicate the task.

### Navigation alternatives

The recommended option is a compact location switcher with all destinations grouped in a native dialog. It removes a full navigation row, exposes every destination without sideways scrolling and preserves chart width. A persistent desktop rail with a mobile drawer also makes the hierarchy visible, but consumes chart width and adds a different desktop/mobile navigation model. The compact switcher better fits the requested subtraction.

### Baseline click-through

A second 390px session used actual controls to traverse all seven economy accounts, all six Explore chapters, Income map/table/bars, the atlas province picker and all three arrangements, Sources, Find a well search/reset/record inspection, Closure budget map/details and repricing, all three carrier stages, receipt Evidence, Cost experiment, browser Back and return to Economy. The session captured no JavaScript errors. Browser Back restored the carrier view and returning to Economy preserved its last account. The closure default input validity issue was reproduced through `HTMLInputElement.validity.stepMismatch`.

Trade still repeats the commodity/year across the selectors, context line and result heading. Removing one redundant context line is an optional subtraction, while retaining the source units and selected year where they support the visual.

## Candidate acceptance

The candidate at `http://127.0.0.1:4204/` replaces the competing navigation strips with a current-location button and grouped native dialog. All 12 destinations remain available. Local chart/chapter controls remain beside their results. Ask and Share stay in the header.

A 48-screen sweep covered the same 12 destinations at 1440 × 1000, 390 × 844, 320 × 844 and 844 × 390. Every page was awaited through its actual result or record controls. No document overflow or JavaScript page errors occurred. At 390px, Income moved from 258px to 133px and Explore from 200px to 133px before the page heading. These measurements compare the same state and viewport. The final Follow the dollar adjustment moved its heading from 181px to 133px, matching its siblings without introducing overflow.

The complete mobile walkthrough passed using the new navigation menu. It traversed every destination and repeated the baseline interactions, including record search, atlas arrangements, budget repricing, carrier stages, browser Back and retained selections. Closure budget's default input values are now valid and its duplicate eyebrows are gone.

The first keyboard pass reproduced focus escaping the last native-dialog control toward browser chrome. The implementation added explicit Tab wrapping. A second pass passed all 16 keyboard/navigation checks across all four viewports. Opening the menu focuses the current destination, all 12 destinations remain reachable, Tab stays within the dialog, Escape restores the location button, Evidence restores its trigger, Ask restores the header trigger, navigation resets the page to the top and focuses its main container, and browser Back retains the selected province.

Desktop and mobile screenshots were visually inspected, including the 320px menu and short landscape menu. The grouped menu fits its viewport and scrolls internally when necessary. The current view is visible without horizontally scrolling a navigation strip.

The final deep control pass passed eight interaction groups, four each at 1440px and 390px. It exercised forecast map keyboard selection, province comparison, table/outlook switching and all forecast Evidence tabs; trade network focus, next connection, all three guided scenario stages, price adjustment, return to connections, matrix/partners and Sources; all three Follow the dollar outcomes, province/demand/household-spending inputs, Evidence and reload; and Energy futures indicator/year/scenario controls plus Oil history/experiment switching and shock duration. No JavaScript errors were captured. Initial test-selector mistakes were corrected after inspecting the controls: Matrix is labelled Partners on mobile, and the oil shock is a select. These were harness errors, not application defects.

**Verdict: approved for release.** The navigation simplification removes the competing account bars, preserves the tested journeys and fixes the observed default input-validity bug. No blocking findings remain in the exercised scope.

## Scope limits

This review covered all 12 destinations and representative interactions in each. It did not enumerate every possible combination of province, year, model parameter and saved-state version. Live inference was deliberately blocked. Data freshness, model accuracy and paid provider availability were not reassessed in this UI review. The final CSS-only spacing adjustment received a focused browser check; the preceding 48-screen sweep and keyboard review used the same navigation behavior.

## Principles applied

Subtract Before You Add informed removing duplicate navigation rows before adding another component. Prove It Works informed checking actual rendered pages, validity states and navigation behavior with a headless browser.
