# Guided trade scenarios

Selecting **Follow this trade** opens a three-stage guide for the chosen seller, buyer, commodity and year. Users can change prices, compare provincial outcomes and inspect household spending without making an AI request. The guide uses the same workspace selection as the map and matrix. Undo, shared links, saved investigations and exports retain its controls.

The design takes inspiration from [Follow the Money](https://followthemoney.emilylai.com/#tap): keep one transaction visible while explaining its consequences in stages. The app uses an in-place guide rather than a long scrolling introduction. It shows one stage at a time, with sources, formulas and historical tests in disclosures.

## What the results mean

The exchange stage reprices the selected trade at fixed quantities. Seller receipts and buyer costs change by the same amount. Those amounts are gross transaction values, not profit or household income.

The provincial stage shows separate, province-wide GDP relationships and published budget sensitivities. Each uses its own benchmark and period. GDP estimates describe conditional historical associations, not identified causal effects. Failed models remain unavailable, and these scenarios do not modify the separate GDP forecasts.

The household stage applies supported benchmark-to-retail relationships to an average spending reference. Annual CPI errors remain beside the dollar results. These spending equivalents are not validated personal bill forecasts. A separate retail-price scenario starts at zero and never silently inherits the commodity-price assumption. This permits explicit gas and electricity comparisons where a spending reference exists but benchmark transmission has not validated.

The source datasets load when the guide opens. Saves and exports remain disabled until those datasets are verified. Saved investigations retain the actual snapshots, and exports include the derived results, source metadata and data versions. A failed load leaves the exchange usable and offers a retry for the remaining stages.

## Verification

The [independent model review](GUIDED-SCENARIO-MODEL-REVIEW.md) reproduced 24,438 numerical and contract checks and 28 guided invariance assertions. It covered historical GDP and retail-CPI predictions as well as public scenario arithmetic. The refresh and deployment workflows rerun this independent audit after refreshing the source datasets. It does not claim that conditional models identify causal impacts or validate individual bills.

The [independent design review](GUIDED-SCENARIO-DESIGN-REVIEW.md) inspected the reference and tested the rendered guide. Review findings led to editable negative-price inputs, stage navigation that reveals the new heading on mobile, named household benchmarks, and an exact calculation disclosure beneath rounded headline values.

The candidate passed 388 JavaScript tests, 139 pipeline tests and 23 Worker tests. The new headless journey test covers all stages, oil, gas, electricity, independent retail controls, unsupported results, exports, source-pinned restore, source failures and retry. It also checks 320- and 390-pixel layouts, negative-number typing and mobile footer navigation. The existing linked-map test passes. All browser tests run in the background with AI requests blocked or mocked.

The public deployment succeeded in [run 39523679441](https://github.com/the-prairie/canada-in-motion/actions/runs/39523679441). The public code version is `34c15e420377a940b542`. Both public browser suites and an independent public walkthrough passed. The refreshed data passed all 24,438 numerical checks with a maximum difference of 2.25 × 10⁻¹². Exact assets, data versions and test receipts appear in [GUIDED-SCENARIO-VERIFICATION.json](GUIDED-SCENARIO-VERIFICATION.json).

The older investigation browser test used a previous preview port and map selector. Its setup now targets the current app, blocks inference and passes its comparison, saved-state and mobile checks. The final scoped code review also removed an empty model-details disclosure from retail scenarios. No unresolved review blockers remain.
