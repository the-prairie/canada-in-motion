# Simplify Explore and Follow the dollar

Explore owns one normalized story selection and source snapshot. Its chapter chooses the result; commodity, province, comparison and price change apply to that result. Follow the dollar owns a final-demand scenario and a selected outcome. Model calculations remain in their existing modules.

## Reading paths

Explore moves from the controls directly to one chapter result. Remove the repeated answer paragraph, monthly report before the answer, promotional next steps, generic source panel and duplicated AI form. Chapters describe sales, partners, public revenue, national GDP, provincial GDP and household costs. One contextual Evidence dialog contains relevant methods, sources, historical checks and monthly history. Imported snapshots never mix in current monthly observations. Save, undo and contextual AI handoff remain available as explicit actions. The independent GDP forecast has a direct link rather than a second report embedded in the price-response chapter.

Follow the dollar shows one selected measure and its allocation to the originating province and the rest of Canada. Remove the second province picker, repeated GDP table and source accordions. Keep final demand, industry, coefficient year and induced spending controls visible. Store the selected measure in the URL and exported selection. Evidence holds exact totals, stages, assumptions and the multiplier source.

## Implementation and tradeoffs

Reuse the existing React, HTML and SVG renderers. No new dependency or inference is needed. Each view has one native evidence dialog; opening it restores focus on exit. Numeric values, missingness and model qualifiers remain visible without hover. Existing model and source contracts remain unchanged; `incomeMeasure` adds a bounded presentation choice to economy state.

A guided sequence would add navigation to already independent questions. A default full table would repeat the main result and delay the comparison on a phone. Use alternate outcomes and contextual evidence instead. Subtract Before You Add removes repeated reports. Model the Domain keeps presentation state explicit. Prove It Works requires source-derived numerical checks, real browser interactions and public-build verification.

## Work and verification

Parent owns Explore and shared navigation/state. A bounded implementation agent owns Follow the dollar. A fresh reviewer owns the desktop/mobile review. Files are disjoint. Use the existing headless browser harness at 1440, 390 and 320 pixels, plus short landscape where needed. Check URL/reload/back, keyboard focus, exact exports, malformed imports, induced effects, zero/missing values, late responses, source failures and AI handoff with mocks only. Run the JavaScript/pipeline gates, publish through the existing Pages workflow and verify the live artifact.
