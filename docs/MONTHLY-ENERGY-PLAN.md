# Monthly activity alongside annual accounts

## Objective

Publish the newest official monthly crude oil production, marketable natural gas production and electricity generation beside annual GDP and forecasts, without changing the dates or meaning of those annual measures. Ship to the public app after independent source verification and background browser acceptance.

## Domain and contract

`data/monthly-energy.json` is a separately versioned observed dataset. It holds Canada and all 13 provinces/territories; three independently dated metrics; 36 consecutive reference months per metric; exact source units, scaling, vectors and status; source release/retrieval dates and raw hashes. Canada's row is published, never a provincial sum. Oil is crude oil alone. Gas uses the active 25-10-0086 series, not its archived predecessor. Missing and confidential observations remain null. Year-over-year changes require two published observations and a positive prior value.

Monthly observations are supporting context, not inputs retroactively added to the annual forecast. Annual nominal GDP, annual real GDP growth, monthly actuals and scenario projections retain their separate dates and definitions. Monthly comparisons are not seasonally adjusted.

## Work sequence

1. Independent researcher downloads and checks all official rows and publication metadata.
2. Build refresh pipeline, strict parser tests, shared monthly summary model and validation.
3. Add a compact monthly panel to Income, Energy futures, Provincial outlook and Explore a question. Place selection drives observations. Reveal trends, comparisons and sources on demand; allow a reproducible download. Retain graceful retry if this supporting dataset fails.
4. Wire scheduled refresh, release validation and public assets. Test missing data, zero baselines, source scaling, changing months and province navigation.
5. Independent agent compares retained observations and growth against a separately written extractor, then reviews implementation risks. Run headless desktop/mobile end-to-end flows and the regression suite.
6. Deploy and verify the actual public artifact and interactions. Record the release receipt.

## Throughput checkpoint

Independent research and pipeline implementation can run in parallel with UI work after agreeing on this contract. Max two subagents; no overlapping file ownership. No paid inference, new hosting or foreground browser testing is required.

## Principles applied

Model the Domain keeps observations, missingness, publication dates and forecasts separate. Prove It Works requires independent official-data comparisons and live browser acceptance, not only unit fixtures. Maintain the existing annual models and avoid adding a new AI planning topic merely to display source observations.
