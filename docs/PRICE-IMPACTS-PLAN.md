# Provincial prices and household energy costs

## Workflow

- [x] Read the Principles section of poteto-mode.
- [x] Phase A: Frame.
- [x] Phase B: Design the workflow.
- [x] Phase C: Run the loop.
- [x] Phase D: Keep the audit trail.
- [ ] Phase E: Verify and hand back.

## Outcome and acceptance

The connected investigation will show evidence-backed provincial GDP price responses and household energy-cost responses where the available history supports them. Users can change the price assumption, compare provinces, inspect historical performance, and export the calculation and source evidence.

Acceptance requires reproducible official-source inputs, explicit price and outcome definitions, time-ordered historical evaluation against a simpler comparator, uncertainty and failure states carried into the interface, independent model review, meaningful unit and browser checks, and verification of the public deployment. No association will be presented as an identified causal effect. Unsupported regions or commodities must remain distinct from zero.

## Throughput checkpoint

Two independent researchers work on separate unknowns. One evaluates provincial GDP responses. The other evaluates retail energy prices and household spending. Each owns an ignored research directory for literature, downloaded sources and candidate experiments. The parent owns the shared calculation contract, integration and release.

The riskiest step is model validity, before interface construction. Candidate models will be tested with training data that precedes each test outcome. Benchmarks, evaluation periods, price conventions and limitations will be recorded before choosing a production model. Latest-vintage historical tests will be described as such.

## Proposed data structure

An immutable source snapshot will hold source hashes, observed history, price definitions, fitted response parameters, historical validation records, uncertainty and per-region availability. A pure model will turn a bounded price change and selected region into GDP and household result channels. The existing story selection will remain the shared UI state. Production calculation must not depend on a billed model call.

## Sequence

1. Research published approaches and reproduce candidate historical checks.
2. Select the supported models and document rejected alternatives.
3. Build refreshable source snapshots and deterministic validation gates.
4. Add pure calculation and export contracts with boundary tests.
5. Integrate focused GDP and household panels into the existing investigation.
6. Independently review the model and exercise the interface in headless browsers.
7. Publish through the existing release gates and verify the public artifact.

## Baseline

Application version `520c8d7f4d887e46bcac` has connected trade, budget and national oil illustrations. Provincial GDP forecasts do not respond to price changes. Household bills are uncalibrated. The existing 329 JavaScript tests, 83 Python tests and story browser suite are regression baselines.

No provider credentials, budgets or public AI spending caps will change. Browser testing stays in the background.

## Review outcome

Both independent reviews accepted the implementation after corrections to annual bill wording, GDP chart units, failed-screen descriptions, missing CPI coverage and transient loading failures. Full numerical and browser evidence is recorded in `PRICE-IMPACTS-RELEASE.md` and the linked review receipts. Public deployment verification remains the final step.
