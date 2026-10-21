# Provincial outlook experience

The outlook now opens on one province's observed GDP growth and two forecast years. The map, province buttons, selected year, chart, and headline share the same selection. Compare and Table replace the main view rather than append another section.

## Design decision

Two structures were considered. Keeping the national range chart first and adding history below preserves the existing hierarchy, but still stacks two explanations. A selected-province history-to-outlook view provides a clearer starting point. The national comparison remains one action away.

The primary view has no accordion or eyebrow. A single Evidence button opens context for the selected province and year. Historical checks, inputs, dated provincial outlooks, and monthly observations have distinct tabs. The export includes the same complete source snapshot as before. The evidence dialog restores focus on close.

This applies Subtract Before You Add by removing the repeated province picker, table, headings, audit summaries, and appended monthly panel from the initial view. Model the Domain keeps the observed and forecast points separate in `forecast-story-model.mjs`. Prove It Works is enforced through source-value tests and actual desktop and mobile flows.

## Data boundaries

Forecast values, error ranges, model selection, and exports still come from the validated `provincial-forecasts.json` snapshot. This change introduces no model or new inference. Hollow forecast points and error whiskers remain separate from solid observed points. Changing the selected forecast year does not change the chart scale.

The primary view reports measured historical range coverage and identifies the use of revised data. Territories retain observed GDP history and explicitly show no forecast. The model still estimates whole-economy GDP at basic prices, not the causal effect of energy prices. Rejected monthly-energy experiments remain visible in Evidence and cannot replace production estimates.

## Verification

- `node --test tests/forecast-story.test.mjs tests/provincial-forecast.test.mjs` passed 9 tests.
- `tests/e2e/provincial-forecast.mjs` passed on the public build at `http://127.0.0.1:4201/`. It checks source-backed values, both years, keyboard map selection, territorial missingness, historical coverage, late async stability, focus restoration, URL reload, export, and 320px and 390px layouts.
- `tests/e2e/energy-forecast.mjs` passed for all ten provinces and both horizons. Frozen monthly-energy test scores, source inputs, rejected challenger values, legacy snapshots, and exports remain intact.
- `tests/e2e/forecast-ai.mjs` passed. Source-pinned OpenUI comparisons, undo, saved investigations, full reload, source links, and unsupported national, territory, and causal-price requests remain intact. The test intercepted five analysis requests and made zero provider calls.
- Desktop and mobile screenshots were inspected at `/tmp/cim-forecast-desktop.png` and `/tmp/cim-forecast-mobile.png`.
- Independent experience review found selected-card contrast and undersized mobile chart labels. Both were corrected and verified in browser tests. The reviewer inspected the updated desktop and mobile screenshots and reported no remaining GDP visual blocker.
