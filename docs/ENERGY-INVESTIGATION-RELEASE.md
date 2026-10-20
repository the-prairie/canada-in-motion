# Connected energy investigation

## Release status

Local candidate `520c8d7f4d887e46bcac` is verified. Public deployment is pending.

The first deployment was cancelled before publication after a final check found navigation overflow at intermediate widths. The repair and expanded responsive check passed locally.

## User experience

The default economy view now opens a question-led investigation. Oil, gas and electricity share a province, comparison, price change, reference year and six focused chapters.

- Domestic and international sales keep their different valuation bases.
- A schematic map and directional table identify the selected province's trading partners.
- Published budget sensitivities retain their own benchmark prices and fiscal years.
- The national oil illustration stays Canada-wide.
- Provincial GDP outlooks remain independent of the price experiment.
- Explanations, charts and comparisons update together.
- Undo, pin, shared selection links and portable source-snapshot exports support continued investigation.
- Existing detailed views and explicit shared links remain available.

The connected controls do not make inference requests. Broader questions continue through the existing AI service. OpenUI answers now include current-selection findings and editable national oil assumptions.

## Verification

- 329 JavaScript tests passed.
- 23 local Worker tests passed.
- The connected-investigation browser suite passed at the deployed-artifact preview origin.
- Existing provincial forecast, forecast AI fixture and Alberta well-table browser suites passed.
- The expanded layout test passed at widths of 320, 390, 768, 1024, 1101, 1200 and 1440 pixels for the original Income view and the new investigation.
- The [independent review](ENERGY-INVESTIGATION-REVIEW.md) identified three defects, each repaired and independently retested.
- The production AI status endpoint returned HTTP 200 with Cloudflare, OpenUI workspaces and Jev enabled. This is a configuration check, not a new provider-inference test.

AI browser tests use explicit provider fixtures. They exercise the real planner-output contract, calculations, renderer and local controls without billing inference. No provider budget or deployment secret changed.

Run the committed browser suite against a built artifact or the public site:

```sh
TEST_URL=http://127.0.0.1:4191/ node tests/e2e/energy-story.mjs
```

Set `PLAYWRIGHT_MODULE` and `TEST_BROWSER_PATH` when Playwright or Chromium is supplied outside the project. Browser work runs headlessly.

## Interpretation

These are connected but separate calculations. Trade repricing holds historical quantities fixed. Budget sensitivities use their published local assumptions. National GDP effects are bounded linear illustrations. A provincial forecast is not the causal GDP effect of a commodity-price intervention.

Household bills, jobs, ultimate income recipients, environmental costs and arbitrary provincial price-to-GDP effects remain uncalibrated here. No missing effect is presented as zero, and absence from this app is not proof that evidence has never been published.

Experience First guided the focused chapters and reversible interaction. Model the Domain kept the accounts separate. Prove It Works required source-backed model checks, an independent browser review and verification of the published artifact.
