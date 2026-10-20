# Independent journey and interaction audit

Reviewed 20 October 2026 by an agent separate from the UI implementer. This is a heuristic and functional audit, not a user study or a claim of exhaustive accessibility certification.

The baseline was the public app at [Canada in Motion](https://the-prairie.github.io/canada-in-motion/). The candidate was the local production build on port 4188, based on commit `416328fc9bc55b305c96c6a96f5586d86849725c` plus the current uncommitted changes. Forecast snapshot: `156c3939d0a89df609ba`. Build files changed during review; findings below distinguish the baseline from the first candidate. A final release needs the same checks against the exact published build.

All browser activity used headless Chromium. Desktop viewport: 1440 × 1000. Mobile viewport: 390 × 844. Reduced motion was enabled. Public AI inference POSTs were blocked; no provider calls or charges were made. The public data and actual UI were used for ordinary journeys. A local 503 response was injected for one forecast-data failure check.

## Findings requiring action

| Priority | Observed problem | Consequence | Concrete change |
| --- | --- | --- | --- |
| P1 | In the live **Find a well** view, Alberta + Active says **0 matching records**, **No matching records** and **0 loaded well records**. Atlas separately and correctly shows 153,348 operating licences, including 56,998 active and 96,350 marginal. | The same province has conflicting apparent answers. The list path still treats a status outside the mapped source as an observed zero. | Share the atlas coverage logic with the list and map summary. Show **Active wells are not mapped by this source**, retain the province-wide total, and offer a clear-status action. This was sent to a second reviewer for repair and verification. |
| P1 | Closure budget inputs lose keyboard focus after a changed field is left with Tab. Rapidly editing the next input can drop an edit when the panel is replaced. | A user can believe a low-cost assumption changed when the previous value remains. A sampled rapid edit produced 50–133; explicit blur and delay produced the correct 50–100 for $10M / $100k–$200k. | Keep the input nodes stable while updating results. Preserve ordinary Tab navigation and test consecutive keyboard edits, not only isolated input events. |
| P1 | The first candidate's selected **Trade value** button had white text on a pale grey-green background. | The selected state looks disabled and is difficult to read. | Set selected foreground and background together, using the same high-contrast selected treatment as other controls. |
| P2 | On the live desktop Trade page the first matrix rows start near the bottom of a 1000px viewport. The first candidate improves this but the result heading is still around y=626 desktop and y=920 mobile. | Users encounter several navigation and administrative rows before seeing a result. | Put Energy, year and region scope together; move Saved investigations into Save & export; remove the duplicated context/heading; reduce vertical gaps. Keep the selected result visible while switching views. |
| P2 | Live Income and Futures start with a large open question composer. | A user arriving to read existing data must pass a second, unrelated task. | The candidate's collapsed composer fixes the immediate reading path. Keep an obvious Ask action; preserve direct controls when AI is unavailable. |
| P2 | The candidate's **All views** option wraps onto a separate row on mobile. | An infrequent layout choice takes as much space as a primary action. | Make it a secondary action or compact option. Named Trade value / Physical transfers / Price exposure controls are clearer than a generic Focus control. |
| P2 | A failed forecast snapshot displays “This dataset could not load. Reload to try again.” without a Retry button. | Recovery is described but not offered in the application. | Add an inline Retry control and keep other pages usable. A failed dataset must never leave a previous estimate presented as the current one. |
| P2 | Futures shows repeated baseline text plus a multi-sentence warning before its charts. Its first chart heading was around y=883 on the candidate mobile view. | The primary comparison is delayed even after removing the composer. | Keep scenario, year, unit and the fact that these are conditional projections visible. Put the detailed bundled-assumption explanation in one named disclosure. |

These are observed defects or explicit design judgments, not evidence that the underlying numerical methods are wrong. Forecast uncertainty and source scope must remain accessible even when prose is reduced.

## Journey coverage

“Checked” means the interaction was performed in a headless browser during this review. It does not mean every possible record, province, input combination or external source was checked.

| Journey | Checked in this review | Not checked / limits |
| --- | --- | --- |
| Atlas geography | Loaded the full published atlas; Geography → Compare inventories → Table; searched and selected Alberta; map keyboard pan/zoom and area selection; empty province search; Escape closes picker and restores focus; mobile rendering. | Every geographical record, pointer lasso precision, WebGL failure fallback and all browser engines. |
| Atlas comparisons | Source inventory/status table; selected-province scope; Alberta province-wide active/marginal summary separate from mapped records. | The complete provincial source reconciliation is a data audit, not established by these UI checks. |
| Find a well | Province/status filters; Alberta Active false-zero reproduction; nonsense search and reset; loaded BC well detail; Original source fields; Next record and back; focus returns to selected record. | Every source's raw field schema and every source link. |
| Events | BC abandonment event filter; selected 2026; observed 380 matching records and an 87-year event-bar series. The chart explicitly counts recorded events. | Event completeness and all event types/provinces. The first harness attempt used a wrong option value; the corrected interaction passed. |
| Transport costs | Opened shipment assumptions; changed volume to 2,000 barrels; observed $26,109 carrier subtotal; changed to Coastal GasLink and saw a clear unavailable-rate state; calculation/source dialog; Escape dismissal; gas layer toggle. | Carrier acceptance, current capacity, route engineering accuracy, and every benchmark tariff. |
| Cost experiment | Toll +30%, assumed government fee 2 CAD/m³, unavailable-corridor toggle and reset; calculation responded. | Monetary claim validation beyond the selected arithmetic, and all saved-scenario combinations. |
| Closure budget | Budget/cost changes; eligible SK record cohort; eligibility disclosure; inspect eligible records; keyboard focus defect reproduced; correct 50–100 range with settled inputs. | A budget scenario is not a forecast of completed reclamation. Real cleanup costs and every eligible record were not verified here. |
| Income | Ranking, map and table; Alberta selection; source year and basic-price GDP labels retained; desktop/mobile layouts. | Statistical refresh coverage outside the supplied dataset. |
| Trade & prices | Electricity selection; Alberta → BC matrix cell and history; Map and Table; pin baseline; change price to −10%; Undo; candidate named views and All views; matrix ArrowRight/Enter; mobile seller/partner list and map. | All 156 cells, all year pairs, and every restored investigation. Existing saved-record tests were inspected but are not counted as executed here. |
| Follow the dollar | $250M demand; induced effects toggle; PE oil-sands missing multiplier state; desktop/mobile. Missing values stayed **Not published**. | Causal validity of input-output multipliers and hypothetical substitution effects. |
| Energy futures | Higher scenario, 2040, electricity-price view and Alberta selection; desktop/mobile; visible indices distinguish relative scenario prices from bills. | Every CER series, all years and every province. |
| Oil & the economy | −20% national shock, two-quarter duration; historical −40% episode search; one-year horizon; episode selection; desktop/mobile. | Treating historical co-movement as causal was not tested or authorized. The UI keeps that distinction. |
| Provincial outlook | 2026/2027; range/table switch; Nunavut unavailable indicator state; Québec 2027 detail; historical backtest disclosure; JSON export with selection/result/full source snapshot; desktop/mobile. | Future accuracy cannot be established by a UI audit. Numerical validation is documented separately. |
| Sources / coverage | Both global dialogs opened; visible source scope; Escape closes them; labels and dates inspected. | Every external URL and all legal/source documents. |
| Failure / loading | Initial atlas loading state observed; forecast-data 503 produces a dataset-unavailable message; other navigation remains present. | Live provider outages, rate limits, Turnstile interactions, malformed streamed AI output and paid API paths. No live inference was sent. |
| Mobile / keyboard | Every main view rendered at 390px without horizontal document overflow; atlas picker Escape/focus; map keyboard selection; matrix arrow navigation; well back focus; form Tab defect. | Screen-reader output, 200% browser zoom, switch control, real touch devices, Safari/Firefox, and a full WCAG conformance audit. |

No JavaScript page errors were recorded in the completed baseline and candidate interaction runs. A temporary local preview returned “File unavailable” while its build was being replaced; those checks were repeated after the preview restarted and are not classified as application defects.

## Research and design implications

Microsoft's CHI 2019 guidelines emphasize visible capability limits, task-relevant information, easy invocation/dismissal/correction, and cautious adaptation. For this app, an answer should show its interpreted province, measure, period and scenario; those choices should remain editable without regenerating the entire page. Keep Undo and a return to ordinary data browsing. A model-selected view should not unexpectedly replace the user's active controls. [Amershi et al., Guidelines for Human–AI Interaction](https://www.microsoft.com/en-us/research/wp-content/uploads/2019/01/Guidelines-for-Human-AI-Interaction-camera-ready.pdf)

Progressive disclosure requires choosing what users frequently need and making the route to secondary options obvious. Hiding everything is not the principle. Here, units, period, observed/projected status, missingness and the main input belong with the result. Full coefficient tables, source fields, model history, export tools and the saved library can be secondary. Disclosure labels should name their contents, such as **How this forecast performed**, rather than **More**. [Nielsen, Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)

The ACL 2026 generative-interface paper uses structured UI representations and iterative refinement for exploratory tasks. It motivates a question generating an editable comparison, not merely prose followed by a long dashboard. Its experimental preference results do not prove that this app's implementation is better; task success, correction effort and evidence comprehension still need to be measured here. [Chen et al., Generative Interfaces for Language Models](https://aclanthology.org/2026.findings-acl.74/)

Google's A2UI v0.9 explicitly accommodates an existing component catalog, client validation, data synchronization and error handling. The useful production pattern here is to let the model select validated panels and parameters, while code owns numeric calculations, sources and rendering. A framework migration is unnecessary just to achieve this separation. Arbitrary generated JavaScript, invented chart values and hidden default assumptions would weaken the current evidence model. [A2UI v0.9](https://developers.googleblog.com/en/a2ui-v0-9-generative-ui/)

Google Research's generative UI work explores task-specific interactive experiences. Its reported preference evaluation explicitly sets generation speed aside, which matters for a public app with free models and variable latency. Preserve immediate native browsing and let generated interfaces augment it. A loading state should describe the pending task and allow cancellation while existing results remain usable. [Google Research, Generative UI](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)

## Recommended interaction contract

1. Start with a useful result, not a blank prompt. Retain ordinary navigation by task.
2. A question chooses an appropriate primary result and a small number of named related views. The model chooses from the existing validated component catalog.
3. Keep the interpreted measure, geography, year and assumptions beside the result. Changes update deterministic calculations and sources together.
4. Reveal secondary evidence on request. Never hide “not published,” an estimated status, an incomplete source scope, or a change in units behind a generic info icon.
5. Preserve the user's viewport, focused control and selected record when data or AI status arrives. Undo must undo the interpretation as well as the displayed controls.
6. Keep the last successful answer available during a retry; clearly distinguish it from a new pending answer. Do not present stale results as current.
7. Prefer an inline chart, map or sortable comparison to repeated prose. Let users switch representation without asking the model again.

## Recheck before release

- Reproduce and resolve Alberta Active in both atlas and list/map paths.
- Tab through consecutive budget/cost edits without losing focus or values.
- Check named result tabs for selected contrast, mobile wrapping, and reliable return from All views.
- Confirm the primary result is reachable without first scrolling past administrative controls. As an audit target, aim for the first meaningful result within one screen; this is a design budget, not a literature-derived threshold.
- Re-run the exact production build's fixture-driven AI tests, persistence/export tests and error handling. This review did not bill a live model request.
- Run the deployment smoke check on the final public URL, including downloaded forecast version and fresh source dates.

## Reproducibility

Headless scripts and detailed observations are in `.data-cache/ux-review/`: `inventory.mjs`, `interactions.mjs`, `followup.mjs`, `components.mjs` and their JSON output. Screenshots there include the live baseline and first candidate at both viewport sizes. These local review artifacts are not part of the public app. The report is deliberately explicit about untested areas rather than calling the entire app “fully tested.”

## Candidate recheck and disposition

A second, tightened candidate was reviewed on 20 October after the findings above were sent to the implementer. The findings table records the original observations; this section is their current disposition, before public deployment.

| Recommendation | Disposition and verification |
| --- | --- |
| One primary Trade result with named related views | Accepted. Trade value, Physical transfers and Price exposure each show only their corresponding result. All views is now in the action menu; selecting Trade value returns to a single panel. All four transitions were exercised. |
| Reduce the pre-result administrative stack | Accepted. The Trade result heading moved from about 626px to 448px on desktop, and 920px to 691px at 390px width, compared with the first candidate. The saved library is after the result, controls are more compact, and All views no longer occupies a separate mobile row. |
| Fix selected-tab contrast | Accepted. Computed selected colours changed to dark green `rgb(22,63,51)` on pale `rgb(228,233,225)`; the screenshot now reads as a selected control rather than disabled white text. |
| Collapse the initial question composer | Accepted. Ordinary Income, Futures, Trade and Outlook views start with data; the composer remains available through a named disclosure/action. This audit does not certify a live billed AI response. |
| Focus Futures on a selected indicator | Accepted. One chart is rendered. Selecting WTI, Higher, 2040 produces 91.75 (2025 US$/barrel), and the indicator and value survive URL reload. The mobile chart heading moved from about 883px to 748px. The scenario explanation is below the chart. |
| Inline retry for unavailable data | Accepted and exercised. A forced 503 shows Retry data; restoring the response and pressing Retry data renders Provincial GDP outlook without reloading the page. |
| Alberta Active false zero | Implemented and independently verified by the separate validation agent against a frozen production-build snapshot with the repaired app module. Checks included list/map/dock unavailable status, separate AER totals, totals retry, clear-status preserving Alberta, Saskatchewan unsupported Active, and a genuine empty BC search retaining zero. Final built-artifact/public recheck remains the release owner's responsibility. |
| Closure input focus | Implemented and independently verified by that validation agent. Actual keyboard Tab moves Budget → Low cost → High cost → Inspect, preserves 10M/100k/200k, produces 50–100, survives URL reload and recovers from an invalid range. |
| Replace ordinary navigation with prompt-only navigation | Rejected. This would make basic exploration depend on service latency/availability and force users to phrase choices that a visible control can make directly. The primary literature supports task-specific interaction and correction, not removal of reliable direct controls. |

The tightened candidate had no recorded page errors or horizontal document overflow in the eight desktop/mobile reading-path checks. Subsequent named-view navigation, indicator reload and retry tests also completed without page errors. Mobile Transport's Details/Map switch was rechecked after awaiting full initialization: both panels became visible as expected. The earlier premature switch observation was a test timing issue, not a confirmed product defect.

The release owner subsequently applied the remaining Futures polish: shared numeric precision for the headline and chart value, no duplicate Current Measures legend, and removal of the redundant chart-scale sentence. Written analysis and citations are also collapsed beside an interactive answer, with the result’s units, uncertainty and coverage still visible. Final build checks are recorded in the release receipt.

The recheck script/output are `.data-cache/ux-review/recheck.mjs` and `recheck.json`; screenshots start `tightened-`. The separate validation agent's focused scripts are `tests/e2e/well-scope.mjs` and `tests/e2e/scenario-keyboard.mjs`. Their exact paths should be confirmed in the final release test list rather than inferring successful public deployment from local results.

## Public release verification

The release owner deployed the reviewed frontend in [workflow 39390412567](https://github.com/the-prairie/canada-in-motion/actions/runs/39390412567) and confirmed public code version `3e924a5f60f4be2a8503`. All nine headless browser suites listed in `docs/FORECAST-UX-RELEASE-VERIFICATION.json` passed against the public URL. This includes the repaired well scope and keyboard editing without module overrides, focused views, inline retry, forecast exports, saved investigations and late-response focus preservation.

AI browser tests intercepted provider calls and exercised the real analyzer and UI. A separate live Cloudflare/Jev forecast call passed after exposing forecast-specific years and regional coverage to the decision model. This is not a claim that the production Turnstile challenge was completed by a browser test. The journey coverage limits above still apply.

The next generative-UI iteration should support explicit edits to the current investigation: “add Québec,” “compare the downside,” or “explain that outlier.” Show the proposed parameter/panel changes, preserve the current selection and source snapshot, and make the edit undoable. Evaluate task completion, correction effort, evidence comprehension and latency against the direct controls before expanding the component vocabulary. This is a proposed next step, not shipped behavior in this release.
