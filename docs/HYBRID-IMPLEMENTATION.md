# Question-driven energy workspace

Implemented 19 October 2026. The release uses OpenUI 1.0.1 with a custom React component library mounted inside the existing application.

## Throughput checkpoint

1. Blocking gates: agree on the finite panel contract; validate source scopes and units; exercise OpenUI with the production content-security policy.
2. Independent work: one backend owner handles planning, Jev decisions, data resolution and durable spend reservations. The parent owns the component library, existing-app integration, build and browser verification.
3. Shared state: the backend owns `server/` and Worker configuration. The parent owns the frontend contract, package files and release build. Source data stays read-only. Credentials are read only by explicitly authorized local tests or encrypted deployment setup.
4. Smallest safe decomposition: one backend workstream, one frontend workstream, then one independent release review. No full application framework migration.

## Data and interaction contract

The LLM chooses regions, topics and approved measures. Jev proposes a presentation and evidence decision in one batch. Code checks capabilities and retrieves numbers from the existing source snapshots. The server returns at most six typed panels with period, unit, source IDs and answer/context roles. OpenUI receives only a compiler-produced layout of registered components and verified panel IDs. It receives no executable model code, arbitrary network destinations or authoritative model-written chart numbers.

The question is intentionally ephemeral. Province selection, sorting, chart/table view and map inspection run locally without another inference call. A reset returns to the submitted plan; a JSON export includes the exact workspace, source records and local selection. This version does not promise persistent share links or a historical-release archive.

## Visual contract

- GDP: a national province map uses energy's percentage of local GDP, avoiding a misleading total-value choropleth. A linked zero-baseline bar comparison uses current-dollar value added. Neither measure identifies the ultimate income recipient.
- Scenarios: paired bars and a complete table compare the same unit, region and year against Current Measures. Published scenario differences are not isolated price-shock forecasts. Missing observations remain missing.
- Infrastructure: an overview map uses the existing indicative corridors and approximate facilities. Geometry establishes location only; it does not encode measured flow or volume. Every such panel carries that statement visibly.
- Oil sensitivity: the existing published national calculation retains its Canadian scope and documented range. No provincial allocation is inferred.
- Mobile: panels become one column, with touch-sized controls and a table alternative. The map does not capture page scroll. Keyboard-operable province selectors duplicate map picking. Source details stay beside the associated measure.
- No animation encodes an unsupported quantity. A cached local basemap avoids external tile requests. The map reuses the application's Canadian projection and explicitly tests known-place alignment.

## Release proof required

Contract rejection, truthful missing-data handling, calculation consistency, Jev timeout/budget fallback, atomic spend reservation, independent review, desktop/mobile browser use, cancellation/retry, export and release allowlist checks. Live test calls share the existing US$1 benchmark authorization; recurring paid Jev service is not silently enabled.


## Completed verification

- 114 application tests and 18 edge-runtime tests passed. The beta release gate passed, the public artifact contains 438 files, and the dependency audit reports no known vulnerabilities. The scripted live development report is in `HYBRID-LIVE-EVALUATION.json`; it is not a held-out accuracy benchmark.

- Live Cloudflare planning → Jev decision → source resolution → OpenUI rendering exercised in the real browser. GDP, electricity and missing-flow regression cases passed with one LLM call each. The latest scripted run took 2.7–2.9 seconds per case; this small development sample is not a performance guarantee.
- Province selection, comparison measure, table view, scenario/year changes, undo, export, cancellation and unsupported-price recovery exercised in the browser. The 390px phone viewport had no horizontal overflow or console errors.
- Independent review found seven integration/release defects. All were fixed: clean CI generation of the bundle; linked infrastructure selection; national scope preservation; visible oil assumptions; isolated infrastructure failures; required-topic retention; pinned infrastructure records in exports.
- Live testing found false shipment-gap classifications and a contradictory legacy text answer. The workspace now produces both charts and written findings from the same resolved data. A second LLM text-selection call is unnecessary and has been removed for workspace mode.
- The independent reviewer also checked mixed GDP/electricity dates and unsupported historical GDP years after a narrow clause-binding repair.
- The renderer is loaded only when an answer contains a workspace. The compressed bundle is approximately 168 KiB. No OpenUI hosted gateway, telemetry transport or external JavaScript CDN is used.

## Deployment and budget

The existing GitHub Pages frontend and free Cloudflare Worker remain the hosting setup. `WORKSPACE_ENABLED=1` enables question-driven source-backed panels. `JEV_ENABLED=0` and `JEV_BUDGET_MICRO_USD=0` keep paid Jev inference off in production until a budget is approved. The app uses standard presentation rules in that state. The LLM still selects the question's topics, regions and published scenarios.

To enable Jev, store `TYPESAFE_API_KEY` as an encrypted Worker secret, set `JEV_ENABLED=1`, and set a positive lifetime cap in micro-US dollars. The Durable Object reserves 2,688 micro-US dollars before each attempt and never automatically resets or refunds that reservation. Failure, timeout or exhaustion retains the same source-backed views with the standard presentation order. The cap is based on the checked provider tariff and is not an account-wide billing control.

The existing admission limits remain in place: 10 admitted questions per UTC day, 100 per UTC month, three per network per day, and at most two concurrent analyses. Turnstile and exact-origin validation protect the public endpoint. Questions, answers and raw client IP addresses are not logged by the app.

Jev advises presentation and reports an evidence assessment; it is not an economic accuracy oracle. Measured interprovincial flows, ultimate income recipients and arbitrary provincial price-to-GDP effects still require additional data or calibrated models. The UI makes those gaps visible instead of substituting a location map or an observed GDP total.

## Reproduce

Run `npm ci`, `npm test`, `npm run test:ai:edge`, `npm run build`, and `node scripts/beta-release-gate.mjs`. Run `node scripts/test-hybrid-live.mjs` for a no-call preview of the live test. `--run` executes three fixtures using the existing secure local credentials and persistent testing ledger. `--serve` exposes a loopback-only browser test server on port 4182. Never run these modes without the applicable inference budget. The public build allowlist excludes all credentials, development reports and test servers.
