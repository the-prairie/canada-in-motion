# Canada in Motion

A free, noncommercial Canadian energy atlas, approved for publication as an explicitly incomplete public beta. Compare provincial energy GDP, official energy futures, published pipeline tolls and regulator well records. National completeness remains false.

Public address: https://the-prairie.github.io/canada-in-motion/

## Run

Use Node 22 and Python 3.12. Create a virtual environment and install `pipeline/requirements.txt`, then run:

```sh
python pipeline/refresh.py
python pipeline/refresh_context.py
python pipeline/refresh_bcer.py
python pipeline/refresh_economy.py
python pipeline/refresh_monthly_energy.py
npm test
python -m unittest discover -s pipeline -p 'test_*.py'
node scripts/beta-release-gate.mjs
npm run build
npm run preview
```

Initial acquisition requires network access and takes several minutes. Full CER histories download about 430 MB before reduction to dated reference snapshots. Historical geometry, benchmarks and BC permit geometry load only when requested. The Atlas opens with well indexes; detailed source records load on demand.

## Coverage and meaning

The October 18, 2026 release contains 317,936 well source records across all 13 provinces and territories. Coverage remains partial. BASIN supplies historical records for Québec, New Brunswick, Prince Edward Island, Newfoundland and Labrador, Northwest Territories and Nunavut. Nova Scotia includes a current onshore inventory and a historical offshore inventory. BC adds 6,144 pipeline permit segments, 11,717 facility permit points and 27 separate orphan-pipeline rows. Permits collected since July 2016 are not a complete operating inventory. These counts are kept separate from well counts.

Read the in-app Coverage register and `data/national-coverage.json` before interpreting a count. Orphan designation, wellbore abandonment and site reclamation are independent facts. Missing data never means zero wells or zero charges. CanVec geometry and CER benchmarks retain observation dates and do not establish current operations or quotes. Dated transport schedules are available only for their verified date; government charges remain separately identified as unknown where unsupported.

AER material is attributed and is not an official AER version or endorsement. Every other dataset retains its own licence. Source-code licensing grants no additional data rights. Restricted datasets remain excluded.

## Updates and publication

Daily well and economic refresh and weekly context/BC acquisition run in GitHub Actions. A successful refresh triggers the approved beta deployment workflow, which reacquires/verifies data and checks rights, integrity, freshness and disclosed coverage before publication. Failures retain the last deployed site. GitHub schedules may be delayed; see `docs/OPERATIONS.md` and `docs/LAUNCH-STATUS.md` for evidence and limitations.

`node scripts/beta-release-gate.mjs` governs the approved incomplete beta. `npm run gate:public` remains the stricter national-completeness check and is expected to fail until national coverage is established. Do not disable it to manufacture completeness.

No visitor account is required. Scenarios stay in browser storage. There is no app analytics, advertising or server-side search collection. The host may retain access logs.

Design work applies progressive disclosure, comparable scales and accessible interaction from [interactive-visualization-creator](https://github.com/oysteinkrog/dotfiles/tree/master/.claude/skills/interactive-visualization-creator), adapted to native JavaScript and Leaflet.

## Atlas interaction

The same source records appear as geographic points, province status comparisons and an exact-count table. A selected area filters the inspector, existing record list and CSV together. Shared links retain the area and filters. Province comparisons describe the loaded inventories, whose scopes and dates differ; they do not rank provincial closure performance.

The point renderer uses WebGL, with Canvas and HTML fallbacks. Keyboard controls support area selection and navigation. Reduced motion skips the arrangement transition. The existing transport calculations, benchmarks, scenarios and source dialogs share the redesigned shell.

See [design and research](docs/FRONTIER-DESIGN.md), [review and repairs](docs/FRONTIER-REVIEW.md) and [decision trail](docs/FRONTIER-DECISIONS.tsv).

## Energy economy

The Trade & prices map links provincial geography to a seller–buyer diagram. Selecting a connection highlights both views and shows its exact source values and history. Focus, year, commodity and selected connection persist in view links, Undo and saved investigations. Five built-in comparisons run locally without using the AI allowance; free-form questions show their quota reset time when limited. See the [linked-map release and audit](docs/LINKED-MAP-RELEASE.md).

The opening investigation connects an oil, gas or electricity price assumption with provincial trade, international sales, published budget sensitivities and the supported national oil-price illustration. Select a province, compare a partner and follow one question through six chapters. Controls and current explanations update locally without an inference call. Domestic and international valuations stay separate. A portable JSON export includes the exact input snapshots and recomputable results.

The provincial outlook chapter now compares benchmark-price changes using historically tested provincial GDP relationships. The People & costs chapter estimates oil-to-motor-fuel spending equivalents and offers explicit gas/electricity retail-price scenarios. Failed models remain exploratory, and monthly retail-price validation does not establish annual bill accuracy. Both snapshots refresh in the scheduled data workflow. See [models, independent review and release checks](docs/PRICE-IMPACTS-RELEASE.md).

The Data views menu retains the detailed accounts and existing shared links. The Income account reports observed energy-sector GDP for all 13 jurisdictions using the latest common current-price year in the acquired Statistics Canada table, currently 2022. The ranked comparison, map and table share a province selection. GDP measures value added, not gross sales or a net benefit to residents.

Monthly activity appears in Income, Energy Futures, Provincial outlook and Explore a question. The three Statistics Canada series currently cover July 2026, with province selection, year-over-year change, 24-month charts/tables and source-preserving downloads. Oil is crude oil production alone; gas uses the active 25-10-0086 table in GJ; electricity includes utilities and industrial producers. All 13 jurisdictions and Canada are represented, with confidential, missing and absent observations kept distinct. The daily workflow reacquires and validates each independently dated series. These observations do not silently change annual GDP or forecast inputs. See [independent verification](docs/MONTHLY-ENERGY-VERIFICATION.md) and [release checks](docs/MONTHLY-ENERGY-RELEASE.md).

The Provincial outlook also evaluates January–July oil, gas and electricity production as additional forecast inputs. The frozen 2023–2025 test found only a 0.695% current-year error reduction and no next-year improvement, below the precommitted 5% threshold. Existing point forecasts and ranges remain unchanged. The expandable monthly energy test shows national and provincial error comparisons, annual test outcomes, inputs and provenance. Each scheduled forecast refresh rebuilds the experiment after the monthly source refresh; passing future numerical gates cannot silently promote a model. See [protocol](docs/ENERGY-GDP-PLAN.md), [research](docs/ENERGY-GDP-RESEARCH.md) and [independent validation](docs/ENERGY-GDP-VALIDATION.md). Run `python pipeline/refresh_monthly_energy.py` before `npm run refresh:forecasts` to acquire full source histories.

A separate broader-indicator experiment tested monthly employment, unemployment, manufacturing and CPI with regularized linear, factor and nonlinear models. Independent historical validation rejected both horizons: the current-year average gain did not hold in recent years, and next-year accuracy worsened. The production model remains unchanged. The [frozen research package](research/broad-gdp-2026-10/README.md) includes exact inputs and independent replay.

Energy Futures compares annual CER 2026 scenario series through 2050. International price assumptions and regional production/use appear in separate groups. Residential electricity indices compare each jurisdiction with its own same-year Current Measures case. They cannot compare absolute electricity bills between provinces. The oil-price experiment uses Finance Canada's national 2026 sensitivity; it does not estimate provincial GDP or jobs.

The analyst selects supported inputs and explains checked calculations with citations. The Cloudflare Worker adds Turnstile and persistent daily/monthly quotas for public use while GitHub Pages continues serving the website and refreshed data. The deployment package includes a free Workers AI model with no automatic paid fallback. The free AI service is live, with encrypted secrets and no paid fallback. Its four-case evaluation and a public-browser question through Turnstile passed; see the launch verification record for scope and limits. OpenAI funding is not required for the selected free route. See [AI launch and exact remaining steps](docs/AI-HOSTING.md). For private local testing, build and run `npm run start:ai`. See [experience redesign](docs/ENERGY-EXPERIENCE.md) for the economic views and [connected investigation verification](docs/ENERGY-INVESTIGATION-RELEASE.md) for this release.
