# Independent app journey audit

Audit date: October 20, 2026. Tested the public app at https://the-prairie.github.io/canada-in-motion/ and the pending release build at http://127.0.0.1:4201/. Final independent acceptance covers the AI recovery changes and linked trade network on the local build; it does not attest that this release has been deployed publicly.

## Result

The tested navigation, calculations, filters, map interactions, saved investigations, exports and recovery paths completed without unhandled browser errors. The pending build lets all five built-in comparisons open without an AI request, including after the network's AI allowance is exhausted. It preserves the previous answer on a failed request, displays the reset time, disables premature resubmission and retains that cooldown after reload.

The public build's exhausted-allowance recovery was a real usability problem: it offered **Try again** without explaining when another request could succeed. The pending build addresses that behavior. The local-comparison attribution, clipboard fallback and temporary-busy message were also corrected and verified in the rendered interface. A second independent review checked the linked trade map, seller/buyer diagram and their persisted state. All material findings from that review were repaired and retested.

This is a journey audit, not a claim to have clicked every well record, province/year permutation or matrix cell. External source sites, actual provider inference, account authorizations and screen-reader speech were not exercised. All browser windows were headless. AI POSTs were mocked or blocked; no public questions or paid inference were consumed.

## Findings

| Severity | Finding | Reproduction and evidence | Required correction |
| --- | --- | --- | --- |
| P1 | An exhausted daily AI allowance offers an ineffective retry in the public build. | Submit a question against a mocked `visitor_limit` response. The existing UI shows **Try again** although the daily allowance cannot reset immediately. Public read-only status confirms configured limits of 3 questions per network/day, 10 shared/day and 100 shared/month. | Show the precise recovery time; prevent retry until that time; keep ordinary data comparisons available. Independently verified in the pending build. |
| P2 | A new browser-only comparison claims that a language model selected its topics and regions. | Open **Provincial contributions**, then **How this workspace was assembled**. The initial pending build displayed model-selection language even though the comparison used rules and zero model requests. | Identify these as built-in comparisons with fixed view rules. Verified: the methods disclosure now explicitly says “No language model or Jev request was made.” |
| P2 | Clipboard fallback overpromises what a shared link restores. | Open **Provincial contributions**, deny clipboard access, select header **Share view**. Dialog says it will reopen “this view with the same settings”; its URL contains the original Explore state rather than the displayed question workspace. `navigation-extras.json` records the exact dialog and parsed shared state. | Verified: the fallback says the link opens the original data view and directs users to Export data to preserve the question workspace. |
| P2 | A temporary busy response was described as an exhausted allowance. | A mocked temporary `rate_limit` response used the allowance-used badge. | Verified: the badge now reads **AI busy**; quota resets and ordinary retry behavior remain distinct. |

These are interface and recovery findings. No new blocker was found in the tested numeric calculations, supported data filters or persisted scenario inputs. Unavailable source coverage remains a substantive product limitation; it is not a browser fault and was not converted into a numerical zero during these tests.

## Coverage

| Journey | Actual interactions checked |
| --- | --- |
| Explore a question | Oil/gas/electricity changes; province and comparison; keyboard price slider; Undo; unchanged-price case; all six chapters; trade map selection and keyboard selection; directional table; household and provincial-model gaps; price-duration changes; compare handoffs; pin/restore; export/reopen; malformed import; browser back; source-load retry; mobile layouts from 320 to 1440 pixels. |
| Income | Initial ranking and source dates; latest activity; province selection through other verified journeys; contextual map/table data; four mobile data views and composer behavior. |
| Provincial outlook | Forecast rendering; current/horizon context; unavailable region; historical evidence and source-method disclosures through story and forecast workflows; failed forecast file and inline retry; linked forecast handoff preserving both provinces and year. |
| Trade & prices | Result tabs; one-result focus and All views reversal; URL reload; directional matrix cell and linked map; price change; pinned baseline; reference-year robustness; save/reload original source snapshot; responsive matrix containment; exact link direction, value and coverage for all nine commodity/year combinations in the linked network; focus/clear, incompatible-selection normalization, save/restore, Undo, export/reload, keyboard activation and 320/390-pixel mobile layouts. |
| Follow the dollar | Published multiplier value; changed and zero final demand; year and URL persistence; induced-effects toggle; unavailable province/industry; matching province control; mobile layout. |
| Oil & the economy | National duration; historical episode selection; historical horizon; persistent URL; explanatory model-admission disclosure; mobile layout. |
| Energy futures | Single selected indicator; scenario and year; consistent displayed precision and legend; reload preservation; mobile layout. |
| Well atlas | Province search picker with keyboard selection; geography, comparison and table; zoom, pan, keyboard area selection and clear; status filter/reset; Alberta province totals; CSV export; handoff to matching records; mobile table and geography. |
| Find a well | Search; detail and return; pagination from 30 to 60; reset; unsupported active-well scope; supported empty search; Alberta totals load failure/retry; totals handoff; province retained after status reset; mobile keyboard action. |
| Closure budget | Sequential keyboard input and focus; valid and invalid cost ranges; computed ranges; reload; save/name/reset/restore; JSON export; mobile layout. |
| Transport | Shipment amount and unit; destination change; source/calculation modal; origin/corridor/destination map focus; all 25 benchmark-system options present and final option selected; cost adjustment; government-fee assumption; corridor closure and reset; mobile Details/Map switching. |
| Shared controls | Coverage, Sources and About modal open/Tab/Escape; map zoom and fit; oil/gas/facility/historical/BC-permit layer toggles; mobile navigation scroll reset; denied-clipboard copyable-link fallback; isolated browser saved-state storage. |
| AI and local comparisons | Real read-only public status; five local comparisons with zero AI POSTs; synthetic 429; reset-time display; disabled Analyse; absent premature retry; prior answer retained; reload cooldown; local comparison available while limited; data-file failure and retry; mobile keyboard activation. |

## Reproducible evidence

Private audit artifacts are under `.data-cache/app-audit/`:

- `route-inventory.json`, `entry-inventory.txt`: rendered route and control inventories.
- `interactions.json`: eight groups of additional atlas, records, modal, scenario, transport and mobile actions; no page errors or failed requests.
- `local-ai-review.json`: eleven checks for the pending local-comparison and quota-recovery implementation; one mocked AI POST, zero real provider calls.
- `navigation-extras.json`: mobile map/layer/navigation checks and shared-link fallback evidence.
- `public-ai-status.json`: public service configuration obtained with an allowed Origin header; this is configuration, not evidence of how much of a particular visitor's allowance remains.
- `focused-views.log`, `scenario-keyboard.log`, `well-scope.log`, `energy-story.log`, `economic-research.log`, `investigations.log`: six executed existing end-to-end suites, all passed against the public app.
- `cim-network-independent.mjs`, `cim-network-independent-receipt.json`, `cim-network-independent-export.json`: twelve independent network check groups, direct comparisons with source JSON, exported original values, no browser errors and zero inference POSTs.
- `network-final-mobile-review.json`: final 390/320-pixel label bounds, touch targets, viewport overflow and skip-link focus checks. The four `network-final-*-viewport.png` screenshots capture the actual map and diagram viewport at those sizes.
- Desktop/mobile screenshots: entry, six Economy sections, well records, atlas/table, closure, transport/benchmarks, local quota recovery and clipboard fallback.

Audit scripts are `inventory.mjs`, `route-inventory.mjs`, `interaction-audit.mjs`, `local-ai-review.mjs` and `navigation-extras.mjs`. Early selector mistakes were corrected and the affected interactions rerun; those failures were not counted as application defects. The initial inventory used an incorrect `.ra-shell` selector; the actual `.ra-workspace` journey subsequently passed.

## Independent linked-network review

The reviewer calculated expected edge labels, directions, top-twelve ordering and displayed coverage directly from `data/energy-flows.json`, without using the network rendering helper. Oil, gas and electricity each passed for 2022, 2023 and 2024. These relationships describe the source’s economic trade values, not measured physical pipeline routes. The selected Alberta-to-British Columbia electricity relationship displayed $60.2M; its export retained the exact original number and selected direction.

| Finding during review | Repair and final verification |
| --- | --- |
| Clear focus used two updates from the same old state, restoring the former focus. | One atomic update now clears focus and the selected connection. Retested successfully. |
| A province focus outside a newly selected comparison could produce an empty network beside a positive total. | Initialization, updates and saved-investigation restoration normalize focus and connection against the available links. The previously failing Saskatchewan/Ontario comparison now shows its positive relationship. |
| Mobile diagram names were too small and some nodes too short for touch. | Larger wrapped labels, taller nodes and inward column positions pass at 390 and 320 pixels. Actual node heights are approximately 61 and 49 pixels respectively; Saskatchewan no longer clips. |
| Maritime map labels overlapped. | Separate New Brunswick, Nova Scotia and Prince Edward Island callouts have non-overlapping bounds at both mobile widths. |
| The total could be mistaken for the focused province’s value. | It now says **Full comparison**. |

Save/restore, Undo, URL reload and JSON export preserved the chosen commodity, year, province focus and relationship. Keyboard Space selected a diagram edge. Reduced-motion mode suppressed direction animation. Neither 320/390-pixel portrait nor 844-by-390 landscape testing found horizontal overflow. Published-zero relationships remained available in the table while drawing no positive edge. An injected suppressed/null value remained unpublished and distinct from a published zero in both the aggregate and table.

The final viewport screenshots were visually inspected at 390 and 320 pixels. A **Skip to controls and records** link seen in a full-element screenshot was a capture artifact: its actual unfocused rectangle is above the viewport at `top: -100px`. Keyboard focus deliberately moves it to `top: 12px`, and Tab away hides it again. The accessible skip link therefore needs no removal or layout change.

All network tests used a headless browser with inference requests blocked. There were no real provider requests or unhandled browser errors. The separate numerical forecast review is recorded in `BROAD-GDP-INDEPENDENT-REVIEW.md`; this interface audit does not substitute for that model validation.

## Further usability work

The next improvement should shorten the distance from a user's question to its answer. On the default story, monthly activity competes with the price-experiment result even though the two describe different things. Keep the answer and its essential qualification together; make current activity a contextual expansion or clearly secondary section. This is a design recommendation, not a demonstrated calculation defect.

The interface also has three persistence concepts—view links, saved scenarios, and exported investigations. Their capabilities differ. Explain the distinction at the action itself, especially when a link cannot reproduce a question-generated workspace. This is more useful than adding a general warning elsewhere on the page.

## Public acceptance after deployment

An independent reviewer retested the deployed release at 00:15 UTC on 21 October 2026. Public source JSON reports 2024 AB→BC electricity trade of $60.209 million; the map correctly rounds it to $60.2M. Province focus and Clear focus passed. Desktop and 320px screenshots showed no clipping, overflow or skip-link overlay. The built-in Energy trade comparison opened with AI mocked offline. No browser errors or inference requests occurred. See [the public verification receipt](LINKED-MAP-VERIFICATION.json).
