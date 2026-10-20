# Data freshness release

## Outcome

Show the latest observed energy activity next to the latest detailed current-dollar contribution. Refresh avoidably old comparisons and make new visits follow the latest available data. Keep explicitly shared historical selections.

## Data shape

`gdp` retains current-dollar value added, provincial shares and additive national totals. `gdpActivity` carries a separate latest common consecutive year pair for real energy-sector and all-industry GDP in all 13 jurisdictions. It retains source vectors, status flags and both levels used for each growth calculation. Chained levels are never summed or used to calculate sector shares. Canada displays the jurisdiction comparison rather than an invented aggregate.

## Verification sequence

1. Verify the publisher's available periods and inspect the visible app behavior.
2. Extract and validate nominal and real observations independently.
3. Present dated contribution and growth together, with detailed basis under disclosure.
4. Audit other data against primary releases and implement supported freshness fixes.
5. Run source, model, UI and independent review checks.
6. Deploy and verify the public artifact before reporting completion.

## Throughput checkpoint

The parser and freshness investigation have separate owners. The main agent owns JS models, UI and integration. One fresh reviewer checks the combined change. Existing release and headless browser harnesses provide the release gates. No foreground browser tests or paid inference are required.

## Decisions

Keep 2022 nominal dollars. The source has no later complete current-dollar year. Add 2025 real activity and 2024-to-2025 growth from the same official table. Do not splice observations into the CER scenario vintage or relabel a retrieval date as an observation year.
