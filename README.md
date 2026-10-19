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

The opening account reports observed energy-sector GDP for all 13 jurisdictions using the latest common current-price year in the acquired Statistics Canada table, currently 2022. The ranked comparison, map and table share a province selection. GDP measures value added, not gross sales or a net benefit to residents.

Energy Futures compares annual CER 2026 scenario series through 2050. International price assumptions and regional production/use appear in separate groups. Residential electricity indices compare each jurisdiction with its own same-year Current Measures case. They cannot compare absolute electricity bills between provinces. The oil-price experiment uses Finance Canada's national 2026 sensitivity; it does not estimate provincial GDP or jobs.

The private local analyst selects supported inputs and explains checked calculations with citations. Run `npm run start:ai` after building. The API key stays server-side. The public GitHub Pages site supports all deterministic views but does not execute AI. See [AI hosting](docs/AI-HOSTING.md) and [experience redesign](docs/ENERGY-EXPERIENCE.md).
