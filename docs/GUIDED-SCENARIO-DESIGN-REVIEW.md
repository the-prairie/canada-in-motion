# Guided trade scenarios

This review recommends an in-place scenario for a selected energy-trade connection. The user changes a price, sees the exchange value change, and then examines the separate provincial and household estimates. It preserves the map selection throughout the explanation.

## What the reference contributes

I inspected [Emily Lai's Follow the Money](https://followthemoney.emilylai.com/#tap) in headless Chromium on 20 October 2026. I scrolled through the payment stages, changed both funding choices, opened the [calculator](https://followthemoney.emilylai.com/calculator), and checked the 390-pixel mobile layout. Screenshots, page text and the reproducible inspection scripts are in the ignored `.data-cache/guided-design/` directory. No foreground browser was opened.

The story keeps one $100 purchase visible while the explanation changes. Large amounts, a stable object, and short stage labels establish continuity. The calculator makes related assumptions separately adjustable. Its fee calculation and its capital-timing calculation remain separate, with their accounting limits beside the results. The mobile presentation retains the same subject and hierarchy.

The useful borrowing is that explanatory structure. Canada in Motion will use its own map, typography, copy and data. The reference's branded artwork, company logos and page text are not part of the design. A long sequence controlled only by scrolling would make repeated province comparisons harder, so the recommended design uses explicit stage controls.

## Chosen design

The guide begins from the selected map or matrix connection. Its persistent header states the commodity, seller, buyer, trade year and price change. A native range control updates the price without moving focus or advancing the stage. Reset returns to no price change.

Three stages answer different questions.

1. **Exchange.** What happens to the value of this connection at fixed quantities? Show the original value, revised value, and equal changes to the seller's receipts and buyer's purchase cost. The direction and province names stay visible. These are gross transaction values, not GDP or household income.
2. **Provincial economy.** What does the same commodity-price assumption imply for the two provinces under the available models? Present whole-province trade exposure, published budget sensitivities, and supported GDP responses as separate quantities. Never sum them. A result that failed historical screening remains labelled exploratory or unavailable.
3. **Household spending.** What does the available benchmark-to-retail model imply for household spending in each province? Show the spending reference and the model's supported outcome. An explicit retail-price scenario has its own control and starts at zero. Choosing that alternative must not imply that the upstream price change passes through fully.

The guide remains below the selected relationship rather than opening a separate dashboard. A visible Back or Next action supports a linear explanation. All stages also remain directly selectable. Small source details, validation tables and formulas live in disclosures, while the price basis and the scope of each main result stay beside its number.

A single connection is the narrative subject, not a causal instrument. Changing Alberta-to-British-Columbia electricity trade does not identify the GDP or household effect of that connection. The province-wide models use the same chosen commodity-price assumption, with their own baseline periods and validation limits.

## Alternatives considered

A full-screen scroll story could turn the selected transaction into an introductory lesson. Its persistent scene would resemble the reference most closely. It would also hide the comparison controls and require repeated scrolling for routine analysis. It remains suitable for a separate introductory tour, not the primary analytical path.

A permanent map and a three-column impact dashboard would make simultaneous comparison faster for expert users. It would repeat the current clutter problem, particularly on mobile, and encourage readers to treat unrelated dollar figures as one additive waterfall. The stage design instead keeps one question primary at a time.

The in-place guide preserves the map's context and supports repeated experiments. It uses the same selected connection and source snapshots as the existing workspace, so saving, reopening and exporting can reproduce the result.

## Interaction requirements

The [W3C guidance on input changes](https://www.w3.org/WAI/WCAG22/Understanding/on-input.html) supports updating results in place without unexpectedly moving focus or changing the user's context. Price changes therefore do not trigger navigation, scrolling or automatic stage changes.

The [W3C slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/) specifies keyboard increments and Home/End behavior. A native range input supplies those controls. Its accessible name includes the price basis, and the visible value states the percentage. A number field or direct preset buttons provide an alternative to dragging.

The [W3C guidance on interaction animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) recommends respecting reduced-motion preferences and avoiding unnecessary movement. Scene transitions must not carry information unavailable in the static result. No animated currency particles may imply a calibrated GDP or household allocation.

At mobile widths the connection header, control, stages and results stack in reading order. The primary figures must fit without horizontal scrolling. Each province has a readable heading. Missing estimates use explanatory text rather than a zero or an empty chart.

## Acceptance checklist

The independent UI review will exercise these behaviors on the built app.

- Select a connection by map, matrix and keyboard. Confirm that the guide uses that exact seller, buyer, commodity, year and published value.
- Move the price through negative, zero and positive values. Confirm equal receipt and purchase-cost changes at fixed quantities.
- Change stages with the keyboard. Confirm that the price and selected connection remain unchanged.
- Inspect both provincial outcomes and their evidence. Confirm that forecast, conditional price response, budget sensitivity and gross trade value remain distinct.
- Inspect supported and unsupported household cases. Confirm that changing to a retail scenario starts from its own assumption and never silently adopts the upstream percentage.
- Change the commodity, year, province selection and connection. Confirm that no stale outcome survives an incompatible selection.
- Save, export, reopen and undo a scenario. Confirm that the restored inputs reproduce the results.
- Check 390-pixel and narrow desktop layouts, reduced motion, visible focus, and browser errors.
- Block AI endpoints during the test. The deterministic guide must remain usable without quota or provider access.

Experience First shaped the choice of one compact guide over another permanent dashboard. Prove It Works requires the later review to exercise the rendered app and inspect its actual numbers. The implementation review below records the checks actually completed.

## Independent implementation review

The candidate was exercised in headless Chromium at `http://127.0.0.1:4201/`. The reviewer did not write the production implementation. Review scripts and screenshots remain in `.data-cache/guided-design/`.

The first pass found three issues that the implementation owner repaired.

- Footer stage navigation left the new heading above the viewport. On a 390-pixel display, the household heading was 773 pixels above the visible area. Explicit stage navigation now brings the heading into view. Price updates retain focus and do not scroll.
- The controlled number field rejected temporary empty and minus-sign edits. Replacing 10 with -10 by typing could produce +20. The repaired field accepts incomplete edits and commits a bounded value on blur or Enter.
- The calculation disclosure mixed rounded billions and millions. It displayed $1.4B times 10% as $136.2M. The repaired disclosure uses million-CAD inputs and results with consistent precision.

The second pass verified real keyboard entry of negative values, range Home and End, zero and positive changes, both footer transitions, and separate commodity and retail inputs. It also verified the Alberta and British Columbia oil results, unsupported gas and electricity pass-through, saved snapshot restore, URL reload, Undo, export arithmetic, source failure and recovery, and layout containment from 320 to 1440 pixels. Matrix and map selection were exercised with the keyboard. No inference request or browser error occurred.

The final pass found that opening or closing the guide removed the focused button and left focus on the page body. The implementation owner repaired this before acceptance. A headless keyboard retest confirmed that explicit entry focuses the guide heading, both exit actions restore the selected connection's Follow control, and price changes retain the slider focus. Empty historical-model disclosures are also omitted for explicit retail scenarios.

The screenshot files `accepted-exchange-desktop.png`, `accepted-households-mobile.png`, `accepted-gas-retail-mobile.png` and `accepted-electricity-retail-mobile.png` show the reviewed layouts. The full-element mobile capture can include the existing offscreen skip link because the screenshot enlarges the captured area. A normal viewport check confirmed that the unfocused link remains at -100 pixels and does not overlay the live viewport.

The final candidate passes this independent UX review. All three acceptance scripts passed again after the focus repair, with no browser errors or inference requests. The review covers Chromium and the tested viewport sizes. It is not a claim of a complete screen-reader or cross-browser accessibility audit.

## Public acceptance

The independent public check passed after deployment run 39523679441 for commit `231998d`. Both public health and build-manifest responses reported code version `34c15e420377a940b542`. The health response reported release ID `933b6d91755ff8b06c67`.

The headless check selected Alberta to British Columbia crude-oil trade in 2024, opened the guide by keyboard, and loaded all three stages from the public data. Typing a -10% commodity change produced the expected negative transaction delta. The unsupported Alberta GDP estimate remained suppressed. The retail scenario started at zero, and changing it to +7% left the commodity assumption at -10%. The 390-pixel mobile layout fit the viewport. Explicit entry and exit retained meaningful keyboard focus. No inference request or browser error occurred. The receipt is `.data-cache/guided-design/public-acceptance.json`.
