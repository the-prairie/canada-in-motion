# Energy economy redesign

The redesigned app opens with an economic answer and keeps its geography, period and source beside it. Three destinations organize the work: Economy, Well atlas and Transport. Contextual tools replace the former five-way navigation. Existing shared links remain valid.

## Research and decisions

Two independent designers used reference products and the actual candidate before implementation. A separate reviewer tests the integrated result. Local research and browser evidence are retained in the workspace under `work/energy-redesign`.

- [Our World in Data energy explorer](https://ourworldindata.org/explorers/energy) informed shared analytical state, direct labels and chart/table alternatives.
- [IEA Energy Sankey](https://www.iea.org/data-and-statistics/data-tools/energy-sankey) informed account boundaries and focused drill-down. The app does not draw an unmeasured national flow network.
- [FT Visual Vocabulary](https://ft-interactive.github.io/visual-vocabulary/) informed the separation of spatial patterns, quantities, shares and flows.
- [Observable Plot exploration](https://observablehq.com/@observablehq/plot-exploration-penguins) informed inspectable evidence and coordinated questions.
- [Mapbox interaction guidance](https://docs.mapbox.com/mapbox-gl-js/guides/user-interactions/gestures/) informed explicit map controls. Scrolling the document no longer zooms the corridor map.
- [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/) informed keyboard, focus, reflow and target checks. This work is not a full conformance audit.

## What changed

Income puts observed energy GDP and its share of the selected economy first. Ranking, map and table retain the same selection. Dollar amounts and shares remain distinct. Small jurisdictions use millions, large ones billions.

Energy futures separates international price assumptions from regional production and use. Annual published series have visible scales. The electricity comparison shows each jurisdiction relative to its own same-year baseline, not absolute bills across provinces.

Oil price effects uses the national Finance Canada calibration. Observed provincial GDP, coherent CER scenarios and isolated national sensitivity stay separate. Negative-price cases have neutral explanatory copy and do not display negative zero.

The dated debate evidence is available without AI. It distinguishes institutional analysis from named stakeholder positions and links every note to its primary sources. It includes producer, worker, consumer, electricity-system, environmental and Indigenous perspectives without implying a single provincial or Indigenous position.

Well comparisons preserve the full published inventory as their denominator. Matching records appear within that baseline; a filtered status no longer becomes 100% by definition. The exact-count table remains keyboard operable. Find a well puts the count and search first, with status definitions and source coverage in disclosures.

Transport uses the same light map language. Missing-rate coverage opens a corridor-specific explanation. Published quotes and user cost experiments have separate destinations. Government charges remain separate from carrier tolls.

Committed province and account selections create browser history entries. Map camera movement replaces the current entry. Shared economic state includes account, chart representation, region, scenario and horizon. The observed GDP period does not change with a future horizon.

## Data and inference boundaries

Observed energy and total GDP use Statistics Canada table 36-10-0711-01 and the common 2022 current-price observation. CER Energy Futures 2026 supplies twelve price and quantity metrics through 2050. The refresh validates units, source hashes, accounting identities and the Finance Canada calibration before replacing a snapshot. Daily scheduled acquisition uses the same validation.

The private analyst selects bounded model inputs and explains deterministic evidence with checked numeric placeholders and source IDs. It preserves previous answers during a request and cancels stale client results. The calculation and evidence are downloadable. Mechanical validation does not prove every qualitative sentence or unit interpretation.

GitHub Pages serves the deterministic app. Live AI requires a separate same-origin server deployment and abuse controls. The local API credential is excluded from Git and the public build. See [AI hosting](AI-HOSTING.md).

National bilateral physical flows, provincial causal GDP and employment forecasts, ownership income and household distribution remain incomplete. Well coverage remains partial. The redesigned interface does not turn those gaps into zeros or inferred forecasts.

## Verification

The integrated candidate is checked through real desktop and mobile browser journeys, keyboard selection, Back/Forward, fresh shared links, source inspection and CSV export. Automated checks cover model arithmetic, state normalization, source provenance, public packaging, HTTP boundaries, quotas and provider failures. Release evidence is recorded in `ENERGY-VERIFICATION.json` after the final independent review.
