# Explore and Follow the dollar experience review

Independent review of Explore a question and Follow the dollar. The public baseline was inspected on October 21, 2026, in headless Chromium at 1440 × 1000, 390 × 844, and 320 × 844. All browser work remained in the background. No live analysis request was made.

## Baseline findings

Explore puts monthly production between the scenario controls and the chapter selection. With Alberta and Ontario selected, chapters start 1,203 pixels down the 390px page and 1,230 pixels down the 320px page. The sales chart starts at 1,525 and 1,593 pixels respectively. Monthly production does not respond to the price experiment. Its placement delays both the question choice and the answer.

The main answer repeats the domestic sales change above the two sales charts. Public revenue, national GDP, and household spending also repeat the selected value in the answer and result cards. The household chapter is 3,854 pixels tall at 390px with the two provinces selected. The population basis, range, fixed-consumption assumption, and failed-validation status are essential. Repetition and annual validation statistics compete with those interpretations.

Explore has several evidence destinations. Price-experiment assumptions, monthly definitions, chapter evidence, budget calibration, historical checks, the independent forecast, and the generic Sources dialog all sit separately. Save & share duplicates the page's Share view action. Follow-up controls also repeat actions already available through chapters and the comparison selector.

The chapter named Provincial outlook primarily shows the historical GDP price response. The separate provincial forecast is inside a disclosure. The label should describe the visible question and retain the distinction between a conditional historical relationship and the independent forecast. The national chapter keeps provincial selectors above a Canada-wide answer. Its geographic scope needs to remain explicit.

Follow the dollar has two province selectors, a header Download action, and an Export calculation button. The GDP hero repeats all three values in the default table immediately below it. Reference year and induced effects are model assumptions, but their controls are separated. On phones, the principal GDP result follows a long sequence of headings and full-width controls.

The Follow the dollar Sources dialog has a reproduced contextual error. It lists GDP, CER scenarios, Finance Canada, and stakeholder references but omits the input-output multiplier source for this calculation. The local Sources & model assumptions disclosure has the correct source. The header download is correct. Changing final demand to $200M and the origin to Ontario exports those selections, the calculated result, and the source snapshot.

No page-level JavaScript errors, document-level horizontal overflow, or inference requests were recorded in these baseline interactions. All six Explore chapters were inspected at all three widths. Missing data remained distinct from zero in the observed pages.

## Design judgment

Experience First changes the reading order. Scenario controls, the active chapter, and its result need to stay adjacent at every width. Subtract Before You Add removes duplicate amounts, actions, and evidence destinations before adding controls. Prove It Works requires a candidate review of actual calculations, exports, saved state, keyboard behavior, and narrow layouts.

The preferred Explore path is scenario, chapter, chapter result, then contextual evidence. Keep the fixed-quantity basis beside trade values. Keep fiscal years and benchmark names beside budget sensitivities. Keep Canada-wide scope beside national GDP. Keep conditional association, failed checks, and uncertainty beside provincial responses. Keep the household price basis and spending-equivalent qualifier beside household results. Monthly production belongs in evidence because it is observed context that does not respond to the experiment.

The preferred Follow the dollar path is origin, industry, demand, then a single selected measure split between the originating province and the rest of Canada. GDP, labour income, and jobs can be alternate measures of that calculation. Exact values, stages, reference year, induced effects, sources, and limitations need one predictable destination. The current effect basis must remain visible whenever the evidence is closed. Labour income is part of GDP. Jobs are positions supported and are not necessarily full-time or permanent.

A compact always-visible table is a valid alternative for Follow the dollar. It minimizes view state and supports direct numerical comparison, but repeats the hero if both stay visible. The selected-measure chart is preferable only if it replaces that repeated table rather than supplementing it.

For Explore, a chapter selector could replace six tabs on narrow screens. The existing tabs remain viable if they move above the result and retain readable targets. A new guided wizard would add state without resolving an observed need.

## Candidate acceptance criteria

1. The active scenario, chapter, and primary result appear in one continuous reading path.
2. Explore retains all six supported questions and their distinct accounting bases.
3. The fixed-quantity trade result, benchmark sensitivities, Canada-wide GDP, historical association, independent forecast, and household spending equivalent remain distinguishable.
4. Failed checks, unsupported models, suppressed values, and missing values remain explicit. None become zero or an apparently supported estimate.
5. Evidence follows the active view and chapter. It includes the actual source, dates, assumptions, validation, and exact values needed to understand the result.
6. Follow the dollar has one origin selector. Its reference year, selected measure, final demand, and induced-effect basis remain apparent and survive a shared URL and reload.
7. Exports reproduce the visible result and preserve the selected state and source snapshot. Explore export import preserves its saved snapshot and rejects malformed files without destroying the current state.
8. Comparison selection, commodity selection, positive and negative shocks, zero, duration, response horizon, retail scenarios, and map or table selection behave consistently.
9. Dialog close and Escape restore focus. Keyboard selection, reduced motion, narrow layouts, and short landscape layouts preserve the task without document overflow.
10. Source failures have a usable retry path. Direct deterministic interactions cause no inference request or page error.

## Baseline evidence

Artifacts are retained in `.data-cache/explore-dollar-review/`.

- `baseline.mjs` and `baseline.json` capture both default pages at all three widths.
- `baseline-flow.mjs` and `baseline-flow.json` capture all six chapters with Alberta and Ontario selected, reading positions, evidence text, and the actual Follow the dollar export.
- Six `before-*` screenshots show the default pages.
- Eighteen `chapter-*` screenshots show every Explore chapter at all three widths.
- `baseline-supply-header-export.json` preserves the downloaded Ontario $200M calculation.

## Candidate review

The candidate puts the Explore chapter selection directly after the scenario controls. With Alberta and Ontario selected at 390px, the chapters now start at 557 pixels and the sales chart starts at 746 pixels. The baseline positions were 1,203 and 1,525 pixels. This change comes from removing monthly context and the repeated answer from the main path. The household chapter falls from 3,854 to 2,162 pixels while retaining the spending basis, uncertainty, population definition, and bill-forecast limitation.

The chapter labels now describe the visible results. The separate annual provincial forecast is a direct link that preserves the selected places. Budget calibration, failed-model details, historical observations, and sources are in the active chapter's Evidence dialog. The Save dialog provides export, import, and pin actions. A malformed import keeps the Save dialog open and shows the error inside it without replacing the current investigation. A successful import closes the dialog.

Follow the dollar has one origin selector, one selected measure, and one evidence destination. The GDP, labour-income, and jobs views share the scenario and survive reload. The main view states the reference year and induced-effect basis. Evidence includes all four measures, stage values, the multiplier source, and the interpretation limits. The source mismatch in the old global dialog is gone.

The independent functional suite passes 99 checks. It covers source-backed amounts, scaling, zero demand, induced effects, missing industry coverage, territory selection, saved measures, both exported models, saved investigation replay, malformed import, map keyboard selection, directional trade, fiscal calibration, national duration, historical validation, household retail scenarios, evidence focus, and the contextual question handoff. The recovery suite passes 24 checks for failed core and optional source loads, retry state preservation, and invalid shared selections. Neither suite recorded a page-level JavaScript error or an inference request.

The visual pass checks all six chapters and Follow the dollar at 1440 × 1000, 390 × 844, 320 × 844, and 844 × 390. All tested pages and dialogs fit. The first candidate still rendered trade-map labels at 5.11px to 9.25px. Monthly Evidence also omitted the latest readings and selected comparison, although its download retained them. The Follow the dollar exact table exposed a binary rounding remainder as `$8,020.000000000001M` for a $10,000M Newfoundland and Labrador electricity-construction scenario. All three defects were repaired. Map labels now render at 13px. An initial repair exposed collisions among the Atlantic electricity partners, so the final placement checks nearby positions and adds a straight leader line when a label moves. The focused follow-up passes 99 checks. It covers all 13 provinces and territories for all three commodities at 320px, confirms that labels do not overlap or leave the map, and checks default labels at all four viewport sizes. The Newfoundland and Labrador, Prince Edward Island, Nova Scotia, and New Brunswick geometry is included in the evidence.

Monthly Evidence now shows the latest month, the selected province's reading, and the comparison province's availability status. The Alberta and Ontario screenshot preserves Ontario's Confidential result and states that observed production is unchanged by the price experiment. The corrected supply table displays `$8,020M`; the underlying calculation and export remain unchanged. The updated screenshots were inspected directly.

Candidate evidence is in `acceptance.mjs`, `acceptance.json`, `failures.mjs`, `failures.json`, `visual.mjs`, `visual.json`, the `candidate-*` screenshots, and the two `accepted-*-export.json` downloads. The scripts run in headless Chromium. This review does not claim physical-device or cross-browser coverage.


The final repair evidence is `followup.mjs`, `followup.json`, the `accepted-trade-*` screenshots, `accepted-monthly-narrow.png`, `accepted-supply-evidence-narrow.png`, and `accepted-atlantic-narrow.png`. The earlier `atlantic-overlap.png` shows the repaired collision. The focused follow-up supersedes the four map-label failures retained in `visual.json`.

The final orientation follow-up passes 71 checks. Active account tabs stay visible through desktop, phone, narrow phone, short landscape, desktop again, and phone again. Both view roots and their open Evidence dialogs stay mounted. Selections remain unchanged, an imported source snapshot survives, and the Atlantic labels remain readable without overlap. These checks are recorded in `resize.mjs` and `resize.json`. A separate seven-check pass confirms the malformed-import error remains visible inside the Save dialog, preserves the full selection, and restores focus after Escape. Its evidence is `save-error.json` and `accepted-invalid-import-narrow.png`.

The release verdict is accepted for Explore a question and Follow the dollar, subject to the release owner's public deployment check. The observed source, display, and interaction issues were repaired and retested. No live provider calls were made.
