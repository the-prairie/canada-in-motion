# Linked trade map and question recovery — October 2026

The trade map now links geography to a seller–buyer diagram. Selecting a connection in either view highlights both, shows its value, and opens the published history. Province focus, next/previous connection, commodity and year controls share one selection. Saved investigations, exports, Undo and view links preserve that selection. The existing complete matrix and table remain available.

These are modelled interprovincial trade values, not measured shipments along the drawn curves. The default view shows the twelve largest positive relationships and reports their share of published positive trade. A selected smaller connection remains visible. Unpublished records and published zeros stay distinct. Optional animation communicates direction only; reduced-motion settings disable it.

Five built-in comparisons now open directly from the app's published datasets without an AI request. They remain available when the AI service is offline or its allowance has been used. Free-form AI questions retain the existing limits and provider configuration. Quota responses include a reset timestamp; the interface displays local time, disables premature retries and preserves the cooldown after reload. Failed requests retain the previous answer and question draft. No provider or spending limit was increased.

## Independent review and corrections

The independent journey review covered the Economy sections, well atlas and records, closure budget, transport, source dialogs, sharing, saved investigations, error recovery and mobile layouts. See the [journey audit](APP-JOURNEY-AUDIT.md) for tested interactions and exclusions.

The review found and verified corrections for ineffective quota retries, false AI attribution on built-in comparisons, misleading shared-link fallback wording, a Clear focus action that did not clear the province, and incompatible map focus after a comparison changed. Mobile labels were separated and the full comparison total was labelled explicitly.

The new map was independently checked against source records for all nine commodity/year combinations. Review included suppressed and zero records, exact exports, saved-state restoration, keyboard operation, reduced motion, mobile and landscape layouts. Browser tests used headless windows and mocked AI endpoints; no inference was charged.

## Forecast research decision

Independent agents acquired and validated broader monthly indicators, implemented a fixed set of regularized linear, factor, nonlinear and combined models, and independently reproduced the historical results. The current-year policy reduced overall mean absolute error by 17.96%, but worsened it by 5.64% over 2022–2025. Next-year error worsened by 3.10%. Both policies failed their precommitted admission rules. The existing production forecast model remains unchanged.

The [frozen research package](../research/broad-gdp-2026-10/README.md) includes exact inputs, protocol, source receipts, predictions and independent replay scripts. These retrospective tests use revised data and simulated release lags; they are not historical-vintage or untouched prospective tests.

## Design principles applied

Model the Domain kept economic transactions separate from physical routes and measured observations separate from forecasts. Explain the Number kept exact values, dates, scope and omitted-connection accounting available beside the visualization. Prove It Works required independent source comparisons, temporal model checks and headless journey tests before release.

Publication and public verification are recorded in `LINKED-MAP-VERIFICATION.json` after deployment.
