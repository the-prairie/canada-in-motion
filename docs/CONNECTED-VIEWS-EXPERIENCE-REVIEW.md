# Connected views experience review

Independent review of GDP outlook, well atlas, transport, and shared page structure. Public baseline inspected on October 21, 2026, using headless Chromium at 1440 × 1000 and 390 × 844. No live analysis requests were made.

## Baseline findings

The screenshot's clutter comes from repeated content ownership, not excessive disclosure size. The trade workspace appends source, saved-work, and method sections. The economy page then appends analysis, debate, and coverage sections. Collapsing those sections still leaves several competing destinations with unclear differences.

The public GDP page repeats province selection and the forecast figure. The range chart, inspection picker, selected-province result, history table, monthly energy cards, and audit disclosures form a long report. On mobile, the user leaves the main comparison far behind while reading the selected province's evidence. Clicking Ontario updates the forecast and monthly data correctly. Year selection and historical checks work, but the reading path does not connect their meanings.

The well atlas keeps its geography, comparison, and table states connected to the same filters. The mobile layout delays Alberta's identity and inventory context until after the national map. Alberta's province-wide operating count and mapped abandoned-well inventory are separate facts, but two large totals compete for attention. The status legend, status buttons, record count, source disclosures, and preview list repeat context. The map remains at national extent when Alberta is selected. A province-focused map would make that selection easier to interpret.

Transport separates its map and costs on mobile. The user must switch between Details and Map to relate a route to its charge. Origin, corridor, and destination controls change camera position but do not advance the cost explanation. Desktop duplicates route identity in the map header, detail panel, route selector, and dock. The footer shows well-record coverage while the user is inspecting transport.

A public transport defect reproduced twice. Navigating to the origin stage from another view can show a blank map at a 200 m scale. Clicking the corridor stage restores the route. Clicking the destination then works. This appears to be a hidden-map initialization or camera-sizing problem. The data is present.

## Design judgment

[Jakub's essay](https://jakub.kr/writing/less-is-more) argues that simplicity requires deciding what deserves to exist. Moving every secondary feature into an accordion preserves the same decisions for the user. The stronger response removes repeated explanations and gives each remaining action one destination.

Subtract Before You Add changes the shared page structure. Remove duplicated method rows and the empty saved-library section before adding connected charts. Experience First changes mobile order. Show the selected place and the evidence together rather than preserving a desktop sidebar order. Prove It Works requires actual desktop and mobile interactions, including history, source failures, focus restoration, and shared links.

## Structural alternatives

### Well atlas

**Preferred. One selection, linked views.** Put the province picker, mapped-record count, and source scope directly above the map. Keep Geography, Compare, and Table as alternate representations of that selection. Status controls carry their own counts and colors, so a separate status legend becomes unnecessary. On mobile, keep a compact selected-place strip adjacent to the map, then show record actions. Put the Alberta operating summary in a small, clearly separate province-wide context block. Remove the first-record preview because Find a well already owns browsing records.

This keeps the current canvas renderer, map selection, filters, and URL state. It removes duplicate labels and avoids a new story state machine. Preserve a short visible scope label such as "Mapped abandoned-well records". The full source dates and definitions belong in one evidence destination.

**Alternative. Guided inventory stages.** Use Locate, Compare, and Inspect stages with the same map remaining visible. Locate owns province choice, Compare owns status counts, and Inspect owns a short record list. This gives novice users a stronger sequence, but it adds navigation state and can slow frequent filtering. It is less suitable than linked representations for the existing atlas.

### Transport

**Preferred. Route, price, and conditions as one connected sequence.** Show a compact route map on mobile and keep it visible beside the active stage on desktop. A route stage establishes endpoints, a carrier-cost stage reveals editable shipment volume and the known subtotal, and a comparison stage shows other destinations from the same service and schedule. Reuse the route selection and receipt calculations. Mark the selected route on every stage. Keep "Schematic route" visible and retain government-charge missingness beside the subtotal.

Avoid moving particles unless they explain direction. Shipment volume must not change animation speed or imply actual observed throughput. A route with no sourced toll must show that missingness, not a zero charge or an invented price stage.

**Alternative. Route inspector without stages.** A persistent route map sits above a concise route picker and one receipt. A destination comparison replaces the receipt when explicitly requested. This is simpler for returning users and has fewer navigation states, but it gives less help to someone learning how the route, carrier, and charge relate.

### Shared sources and actions

**Preferred. One scoped evidence dialog and a compact action row.** Ask opens the question form. Save and export owns saving, downloads, and the saved library. Sources opens evidence for the active result, with its definitions and period. Delete the generic authored-workspace explanation. Place provider and implementation details only in the privacy or app information destination. The debate should be an explicit subject destination rather than a disclosure appended to every screen.

Essential interpretation remains beside the value. That includes incomplete coverage, schematic routes, forecast uncertainty, and unsupported estimates. Consolidation must not hide those facts in the source dialog.

**Alternative. Dedicated evidence page.** A single page shows source periods, coverage, and methods for every topic, reached from a persistent Sources link. This is easy to cite but can lose the connection to the selected result and requires a clear return path. A scoped dialog is better for this app's interactive comparisons.

## Baseline evidence

Artifacts are in `.data-cache/connected-views-review/`.

- `baseline.mjs` and `baseline.json` capture public screen text, disclosure labels, overflow, and eight desktop or mobile screenshots. The first desktop atlas frame captured loading, so `atlas-desktop-ready.png` is the accepted loaded baseline.
- `clickthrough.mjs` and `clickthrough.json` record 14 interaction states. They cover atlas arrangements, status filtering, province search, transport stages, route change, mobile map and shipment inputs, GDP year, province, and historical checks.
- `transport-origin-desktop.png` shows the blank-map defect. `transport-corridor-desktop.png` shows recovery after selecting the corridor.
- `before-outlook-mobile.png`, `before-atlas-mobile.png`, and `before-transport-mobile.png` show the mobile reading-order problems.

The baseline captures reported no page-level JavaScript errors and no document-level horizontal overflow. That does not establish usability or complete application correctness.

## Candidate acceptance criteria

The independent candidate pass will check the following behavior.

1. The selected place or route is identifiable without opening a disclosure.
2. A map, comparison, and result update from the same selection on desktop and mobile.
3. Shared evidence and saved work have one destination each. The reported tail of repeated accordions no longer exists.
4. GDP uncertainty, record coverage, route scope, and missing prices remain visible beside the affected evidence.
5. Mobile navigation does not hide the only main visualization or require switching between two disconnected screens to understand one result.
6. Region, year, route, and stage changes preserve URL state and restore meaning after reload.
7. Keyboard focus, dialog close, narrow screens, short landscape, and reduced motion preserve the task.
8. No live analysis provider is invoked by these deterministic interactions.

## Candidate review

The rebuilt candidate now has a coherent primary view. GDP connects a province map to observed growth and two forecast years. Its estimate, measured historical error range, and revised-data qualifier remain visible. The atlas places the selected jurisdiction and mapped-source scope before the map. Alberta operating licences remain a separate province-wide statistic. Transport shows one shipment stage beside a persistent route map. The repeated page-tail disclosures are removed.

The independent functional pass passes 90 checks at desktop and mobile widths. It covers province and year selection, comparison and table navigation, source evidence, territory missingness, Escape and focus restoration, atlas statuses and Alberta counts, matching-record inspection, route and volume changes, missing tolls, saved work, reload, and narrow or short layouts. There were no page-level JavaScript errors and no inference provider calls. The separate map-fit probe passes both endpoint labels inside the map in six states, including desktop-to-mobile and landscape resizing.

The first candidate pass found several issues that implementation fixed before this result.

- The mobile atlas lost the selected province after resizing. Refitting from the final canvas dimensions restored it.
- The transport map initialized or resized using stale dimensions. Container observation now keeps both endpoints inside the route map.
- The selected GDP year card had white text on a pale background. Its explicit foreground color restores contrast.
- The fixed desktop SVG made mobile year labels unreadable. Responsive chart geometry retains readable labels.
- The guide still had a second Sources disclosure after toolbar consolidation. That duplicate is removed.
- Economy account navigation wrapped across three mobile rows. The single scrollable row keeps the active account visible.

Targeted code review found two more regressions, both repaired. The receipt download action and additive component breakdown are restored in Sources & calculation. A real browser download preserves the 2,000 m³ input, the exact 164,219.6 CAD carrier charge, the fixed and variable rates, and source identifiers. Government charges remain unknown and the all-in total remains null. Atlas automatic fitting now stops after keyboard panning and Fit Canada, matching pointer panning and zooming. The final headless browser pass verifies that each action changes the map and that subsequent status filtering preserves the chosen camera. All eight focused receipt and camera checks pass with no page errors.

Two final runtime defects were independently reproduced, repaired, and retested.

- A dismissed Ask error dialog reopened when delayed context data arrived. A mocked 503 response reproduced this without calling a provider. The repaired dialog remains closed after Escape and the late response.
- A journey opened with old oil=false and gas=false preferences displayed its charge but no route or endpoints. The selected transport route now appears independently of inventory layer preferences. Both endpoints render with those preferences restored.

The final six-state map probe confirms both endpoint labels remain inside the map after initial load, stage changes, returning from GDP, and mobile, landscape, and desktop resizing. Refreshed desktop and mobile screenshots show readable GDP labels, the province context above the atlas map, and the transport map beside its active stage. No new release-blocking issue was found in the focused code review.

Release verdict: accepted for the reviewed journeys, subject to the release owner's final artifact and public deployment checks. This is a headless Chromium review, not physical-device or cross-browser certification. No live AI provider calls were made. The remaining record preview in the atlas is a defensible direct inspection shortcut; removing it can be considered later if user testing shows it duplicates Find a well rather than helping map exploration.

Review artifacts include acceptance.json (90 checks), map-fit.json (six navigation and resize states), dialog-lifecycle.json (late-response dismissal), hidden-route.png, receipt-export.json, final-repairs.json (eight focused receipt and camera checks), and the refreshed candidate desktop and mobile screenshots. Deterministic checks and visual inspection complement one another; passing interaction checks alone would not have detected the earlier contrast and mobile-label problems.

## Public deployment verification

The deployed app was independently checked on October 21, 2026. Its health response confirms code version `62401d85d27534f946ff`. The same 90-check suite passes against `https://the-prairie.github.io/canada-in-motion/` at desktop, mobile, narrow-phone, and short-landscape sizes. GDP, atlas, transport, and shared actions retain the reviewed behavior. The repeated sources, saved-work, methods, and analysis footer stack is absent. Public screenshots were inspected after the run. There were no page-level JavaScript errors and no inference requests. The released experience is accepted within the review scope.

Public evidence is retained under `.data-cache/connected-views-review/public/`, including `health.json`, `acceptance.json`, and screenshots of all reviewed views.
