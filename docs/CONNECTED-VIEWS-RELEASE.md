# Connected views release

The GDP outlook, well atlas and transport now keep selection, visual and result together. The repeated page footer of sources, methods, saved investigations, AI questions and debate disclosures has been removed.

## Changes

- GDP outlook starts with one province's observed growth and forecast. The map and direct province controls update the same chart. Compare and Table replace the main view. Forecast uncertainty and measured historical coverage remain beside the estimate. One Evidence dialog holds historical checks, monthly observations, inputs and export.
- Well atlas puts place, mapped-record count and source scope before the map. Alberta's province-wide operating licences remain a separate measure. Selecting a matching record opens its details while retaining the map and filters. Province fitting follows layout changes until the user manually moves the camera.
- Transport keeps a route map visible on desktop and mobile. Shipment, Carrier charge and Destination each show their own controls and result. The selected route is independent of old inventory layer preferences. Source conditions, additive components and receipt export share one calculation dialog.
- Sources and methods have one contextual destination. Saved investigations live in Save & export. Ask opens a deliberate task; dismissing it stays respected when background data arrives. Mobile economy navigation occupies one horizontally scrollable row.

## Verification before publication

395 JavaScript tests and 139 pipeline tests passed. The approved public-beta gate passed. Technical readiness reported no outstanding decisions or errors; national data coverage remains incomplete.

Sixteen headless browser suites passed: provincial-forecast, energy-forecast, forecast-ai, focused-views, analysis-recovery, investigations, investigation-review, map-story, guided-scenarios, well-scope, alberta-table, research-late-status, connected-views, dialog-dismissal, monthly-energy and energy-story. Provider routes were mocked or blocked; tests made no inference calls.

The independent experience review exercised desktop, 390px, 320px and short landscape layouts. It found and drove fixes to stale map dimensions, forecast contrast and labels, repeated source sections, receipt export, modal dismissal, manual camera movement and old route-layer settings. See CONNECTED-VIEWS-EXPERIENCE-REVIEW.md for its final verdict and artifact paths.

No forecast model, energy-price model, AI provider, spending cap or data licence changed. Transport connections remain schematic. Source-record counts remain distinct from provincial licence totals. Estimates remain distinct from observations.

Publication receipt will be added after the GitHub Pages deployment and public acceptance checks complete.
