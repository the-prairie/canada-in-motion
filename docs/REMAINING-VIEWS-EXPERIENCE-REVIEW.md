# Remaining views experience review

Independent review of Income, Energy futures, and Oil & the economy. The public baseline was inspected on October 21, 2026, in headless Chromium at 1440 × 1000, 390 × 844, and 320 × 844. All browser work remained in the background. No live analysis request was made.

## Baseline findings

Income shows the selected province's 2022 current-dollar energy GDP, its 2025 real growth, and three monthly production cards before the province comparison. On a phone, the main comparison starts more than a screen below the headline. The monthly information is valid context, but its placement interrupts the comparison. Ranking, map, and table already share selection correctly. Keyboard selection on the map works, and the selected province and display survive reload.

Energy futures already limits the main chart to one indicator. It still repeats the same selected-year value in the headline and above the chart. Scenario, year, measure group, and indicator controls occupy separate rows. Three monthly production cards follow the annual scenario, followed by separate source and assumption disclosures. A selected WTI series is shown under "Alberta in 2040", although it is a common benchmark series. The benchmark's geographic scope needs an explicit label. Changing a scenario does not change monthly observations, as expected.

Oil & the economy presents a national sensitivity calculation and a provincial historical investigation as two full pages stacked together. Their oil-price controls both default to +10%, which makes a relationship easy to infer even though they have independent state and different meanings. A province selector remains visible over the national calculation, while its introductory copy says provincial historical responses are available elsewhere. The historical chart is already on this page. Model, matching, and source details have several destinations.

The historical chart has a visible defect. In the default 2007 episode, Alberta and Ontario end at nearly the same value and their endpoint labels overlap. Its 740-unit SVG scales all text down on phones, so the labels and years become hard to read. The table provides exact values but does not make the chart readable. The SVG screen transform yields 5.74px text at 390px and 4.61px at 320px. Text bounding boxes confirm that AB and ON overlap at every tested width. Futures text also falls to 8.88px at 320px.

The Oil header download has a reproduced functional defect. After changing the national sensitivity to -20% and Two quarters, Download saves `oil-history-and-validation.json`. That file contains the independent +10% historical selection and no national sensitivity result. The header action routes every oil download to the historical component's export button. It therefore does not preserve the calculation prominently displayed above it.

The shared Sources dialog opens and restores focus after Escape, but its content is generic. Income sources include CER scenarios, price indices, the national oil experiment, and a broad stakeholder discussion. A single source destination is useful only when it explains the active question.

## Design judgment

The previous connected-view cleanup supplies a suitable pattern. Each question gets one primary visual, one selected result, and one evidence destination. Essential interpretation stays beside the number.

Experience First changes the mobile reading order and chart geometry. The selected place and comparison need to remain adjacent, and chart labels must remain legible at phone widths. Subtract Before You Add removes repeated selected values and separate source disclosures before adding more controls. Prove It Works requires actual selection, export, evidence, and reload checks against the candidate, followed by screenshot inspection.

## Alternatives

| View | Preferred approach | Alternative and tradeoff |
| --- | --- | --- |
| Income | Put a province map or ranking directly beside the selected province's compact GDP result. Keep Map, Ranking, and Table as alternate representations of one selection. Move monthly detail and date definitions into the same contextual evidence destination. | A guided sequence through value, growth, and activity would teach the measures explicitly, but adds navigation state to an existing comparison task. |
| Energy futures | One large annual chart compares the selected CER scenario with Current Measures. Put indicator, scenario, and year controls beside that chart. Show the selected value once. Keep electricity-price comparison as an alternate measure view and move monthly observations into evidence. | A scenario matrix would compare all four cases at once, but increases line and legend load. It is less suitable for the current place-and-indicator question. |
| Oil & the economy | Explicit National sensitivity and Historical episodes views. Each owns its relevant controls and one chart. Share a single evidence destination that follows the active mode. | Keep both visible as a long report with separate sections. This avoids a mode switch but preserves the duplicated controls and long mobile separation that caused the confusion. |

For Income, retain the 2022 current-dollar label beside the GDP amount and the 2025 real-growth label beside the growth figure. Monthly production must retain its own month and units. It is not GDP, sales, or a revision to the annual value.

For futures, retain "conditional projection" beside projected results and show each indicator's actual observed-through year. WTI and Henry Hub are benchmark assumptions, not province-specific prices. Electricity indices compare each province with its own Current Measures case. They do not rank actual bills across provinces.

For oil, the national model is a first- and second-year sensitivity on the Finance Canada baseline. Nominal and real GDP need visibly distinct encodings. Historical province paths include every economic influence and do not establish the effect of oil prices. Switching modes should preserve each mode's selection without implying that the models are linked.

## Candidate acceptance criteria

1. The active question, selected place or national scope, and primary visual are identifiable without a disclosure.
2. Income places its comparison next to the selected result. Map, ranking, and table preserve the selection.
3. The 2022 current-dollar amount, 2025 real growth, and monthly production remain distinguishable in labels and exports.
4. Futures shows one selected result and a readable annual comparison. Scenario and year updates change the appropriate series and retain the conditional-scenario qualifier.
5. Benchmark scope and electricity-index basis remain explicit. Unavailable values do not become zero.
6. Oil exposes national sensitivity and historical associations as different questions. Its exports match the active calculation and include the state and source evidence needed to reproduce it.
7. Historical chart labels are readable at 390px and 320px. Coincident lines do not produce overlapping endpoint text.
8. Each question has one contextual evidence destination. Sources, methods, exact values, monthly context, and model validation remain reachable there.
9. Selected state survives navigation, a shared URL, and reload. Dialog Escape, close, keyboard focus, reduced motion, and narrow or short layouts preserve the task.
10. Deterministic interactions produce no page errors or live inference requests.

## Baseline evidence

Artifacts are retained in `.data-cache/remaining-views-review/`.

- `baseline.mjs` and `baseline.json` capture the public page text, controls, disclosure labels, document heights, and nine screenshots.
- `clickthrough.mjs` and `clickthrough.json` cover income ranking, map keyboard selection, table selection, evidence focus, reload, futures scenario and indicator changes, electricity indices, national oil controls, historical controls, and an actual download.
- `chart-metrics.mjs` and `baseline-chart-metrics.json` measure rendered SVG text size and text-box intersections at all three widths.
- `oil-header-download.json` is the downloaded historical payload after the visible national experiment was changed to -20% for Two quarters.
- `before-oil-desktop.png` and `before-oil-mobile.png` show the overlapping endpoint labels and scaled-down mobile chart text.

The baseline reports no page-level JavaScript errors, no document-level horizontal overflow, and no inference requests. Those checks do not establish visual quality or full application correctness.

## Candidate review

The candidate has a clearer reading path. Income puts the province comparison before a compact production strip. Its 2022 dollar amount and 2025 real-growth figures remain separately dated. Futures uses one combined indicator selector and one annual chart. The selected value appears once, global benchmark scope is explicit, and the scenario qualification remains beside the chart. Oil now has separate Price experiment and Historical record views, each with its own controls and evidence.

The first independent acceptance pass found two defects, both repaired and retested. Historical controls overflowed the 390px viewport. The repaired controls fit without squeezing the labels into narrow columns. The national oil chart correctly calculated Canada while its evidence and export still used the saved province. With Alberta saved, that exported an unavailable result and no years. The repaired download uses canonical Canada calculation state and preserves the province in the app. The actual -20% Two quarters download contains the same national years shown in the chart and the complete source snapshot.

The independent functional and layout suite passes 150 checks. It covers income map keyboard selection, ranking and table state, scoped evidence, exact exported data, annual and monthly definitions, benchmark scope, scenario and year changes, unavailable production, national and historical oil exports, forecast restrictions, independent mode selections, URL reload, focus restoration, desktop, phone, narrow phone, and short landscape layouts. No page-level JavaScript errors or inference requests were recorded.

The first strict geometry check measured 11.53px chart text at 844px landscape against a 11.9px harness threshold. The final chart width subtracts computed horizontal padding. A focused follow-up passes all four widths and now measures at least 12px text, with no label collisions or overflow. Live resize preserves the selected value through 390px, 320px, 844px, and 1440px. The Year selector now shows the full year. The narrow Scenario selector has more room, with the full selected scenario also visible in the chart legend.

The refreshed screenshots show readable history labels at 390px and 320px. Province names are in a separate legend, so coincident line endpoints no longer collide. Exact historical values remain available through Table, and model validation remains in Evidence. The source dialogs are readable on mobile and restore focus after Escape, including after changing evidence tabs.

Candidate artifacts include `acceptance.mjs`, `acceptance.json`, twelve `accepted-*` screenshots, `final-visual.mjs`, `final-visual.json`, evidence-dialog screenshots, and live-resize screenshots. The initial failing national download is retained as `candidate-national-export.json`.

The final focused evidence is `polish-followup.json` with four `polished-futures-*` screenshots. These checks supersede the single geometry failure retained in the initial acceptance output.

Release verdict: accepted for Income, Energy futures, and Oil & the economy, subject to the release owner’s public deployment check. All observed data and interaction defects were repaired and retested. This review used headless Chromium and does not claim physical-device or cross-browser coverage. No live AI provider calls were made.
