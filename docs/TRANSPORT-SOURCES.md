# National transport source research

Follow-up implementation: NRCan CanVec historical pipeline/refinery geometry, CER dated benchmark snapshots across 25 systems and 26 pipeline attribute records are now integrated under OGL Canada. See OPEN-TRANSPORT-SOURCES.md for full acquisition evidence and limitations. The Trans Mountain monitor now fetches the official tariff 123 PDF and is paired with CER reference monitors. All 15 monitors succeeded in hosted run 39102260809. These additions do not establish current national infrastructure or current all-in prices.

Checked October 17, 2026. This is a source registry and implementation assessment. No source was imported into the app, no publisher was contacted, and no public release was made.

## What can ship honestly

A free public atlas can show every province with explicit coverage states. It cannot claim complete national infrastructure or complete province-pair shipping costs from the public sources examined. Missing data is not a zero charge or an absence of infrastructure. No public source examined provides the required complete, current national register across all these domains.

The accompanying `transport-source-registry.json` records 13 official sources, endpoints, update methods, licences and publication gates. The historical facility extracts are evidence of the source's limitations. They are not launch data.

## Pipeline geography

The [CER interactive map](https://www.cer-rec.gc.ca/en/safety-environment/industry-performance/interactive-pipeline/index.html) expressly restricts reproduction, publication, distribution and transfer of its pipeline data. This restriction is not cured by the resource being free and noncommercial. Its documented coverage is mostly federal pipelines, with approximate locations. Do not copy its pipeline geometry into the app.

Two explicitly open provincial candidates are [BCER pipeline segment permits](https://open.canada.ca/data/en/dataset/ecf567ea-4901-4f51-a5b0-35959ca96c47) and [New Brunswick major transmission pipelines](https://open.canada.ca/data/en/dataset/4188dacc-07c5-f72c-cfb1-cd505fcd4eb4). BC records update nightly and cover permitted centrelines collected from July 11, 2016. New Brunswick provides GeoJSON. Their coverage does not establish a national network. Neither is an engineering location service.

[AER spatial data](https://www.aer.ca/data-and-performance-reports/activity-and-data/spatial-data) offers pipeline ZIPs with shapefiles and CSVs. Its [layout](https://static.aer.ca/prd/data/pipeline/EnhancedPipeline_Layout.pdf) excludes low-pressure distribution lines and separates unmapped CSV records. The [catalogue](https://www1.aer.ca/ProductCatalogue/PIPE.html) bars unauthorized commercial exploitation. The parent task has separately verified general attributed noncommercial reproduction for this free public resource. Keep the licence evidence with the specific download and do not assume it covers a later commercial product.

## Refineries and LNG

Official Open Government API responses explicitly license the [NACEI refinery dataset](https://open.canada.ca/data/en/dataset/57e7bc4c-680b-4640-9fa1-ded7ce186fab) and [NACEI LNG dataset](https://open.canada.ca/data/en/dataset/e08eec16-7c7a-4253-9bee-ea640d400a54) under the Open Government Licence Canada. The saved catalogue JSON and live ArcGIS metadata preserve that evidence.

The actual Canada queries returned 21 refinery/upgrader records with source period 2016 and one LNG terminal with period 201707. Both layers identify August 2017 in their copyright metadata. The refinery count includes different facility types and is not a count of current conventional refineries. These are historical layers, even though their web endpoints still work. Loading them as current data would regress accuracy.

A production facility register needs stable facility identities, type, operating status, commissioning and closure evidence, capacity units, and separate timestamps for each fact. Reconcile regulator data with operator announcements. For example, the [NRCan LNG overview](https://natural-resources.canada.ca/energy-sources/fossil-fuels/canadian-liquified-natural-gas-projects?wbdisable=true) still contains future-looking 2025 wording. A recent crawl date does not make its statements current.

## Carrier tariffs

The correct [Trans Mountain index](https://www.transmountain.com/tolls-tariffs) lists Interim Tariff 123, effective May 1, 2026, and Rules 122, effective February 1, 2026. Preserve the present dated quote restriction until subsequent filings and settlement applicability are resolved. The [CER proceeding](https://www.rec-cer.gc.ca/en/applications-hearings/view-applications-projects/trans-mountain-application-interim-tolls/) records a settlement approval on September 28, 2026. Index monitoring alone must not silently replace validated rate semantics.

The [Enbridge current tariff index](https://www.enbridge.com/Projects-and-Infrastructure/For-Shippers/Tariffs/Enbridge-Mainline-GP-Inc-Enbridge-Canadian-Mainline-LP-Canadian-Mainline-Tariffs) is suitable for a change monitor. It lists CER 10 local tolls and CER 11 international joint rates effective October 1, 2026. CER 10 covers Canadian movement only. Its conditions distinguish commodity classes, receipt and delivery tankage, and an in-kind allowance. A Canadian segment rate must not become an all-in Edmonton-to-Sarnia quote. Raw PDF links and replacement identifiers are in the registry. No general right to republish complete carrier PDFs was established.

[TC Energy Mainline](https://www.tccustomerexpress.com/mainline.html) supplies PDF and XLS toll data, seasonal fuel ratios, surcharges and rate riders. Its [tariff index](https://www.tccustomerexpress.com/891.html) says filed CER documents control if the site differs. The [operator overview](https://www.tcenergy.com/operations/natural-gas/canadian-mainline/) describes the current fixed-toll settlement as ending December 31, 2026. This requires a gas-specific applicability model. Oil volume multiplication is not adequate.

A safe update process detects changed indexes and file hashes, stores immutable evidence, and queues new rates for schema and applicability review. It must retain the last approved snapshot, flag stale coverage and withdraw invalid quotes. A successful HTTP request is not evidence that a rate remains applicable.

## Government charges and all-goods shipping

The [federal internal-trade explanation](https://www.canada.ca/en/intergovernmental-affairs/services/internal-trade/federal-investments-internal-trade.html) states that governments do not impose tariffs for crossing internal borders. Regulatory requirements and administrative costs still exist. Economic estimates of tariff-equivalent barriers are not amounts payable to a province.

[CRA freight guidance](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-specific-situations/freight-carriers.html) provides a tractable government-charge component. Ordinary domestic freight generally follows destination GST/HST, with important continuous-movement and interlining exceptions. The [current rate table](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html) supplies all provinces and territories. GST/HST alone is not the complete tax or government-fee total. Do not automatically apply the general PST table to freight services.

The [Canadian Transportation Agency](https://otc-cta.gc.ca/eng/publication/freight-rail-service-and-rates-a-guide?wbdisable=true) confirms that public rail tariffs coexist with confidential negotiated contracts. A complete actual all-goods shipping-price matrix cannot be reconstructed from public data. Prices require a carrier, service, commodity, shipment size, origin and destination points, date and contract terms. Province pairs are only a browsing dimension.

## Concrete launch gates

1. Obtain or explicitly exclude restricted national pipeline geometry. Clear each provincial layer separately.
2. Replace current-looking historical facility data with a verified facility register. Keep historical material labelled by source period.
3. Keep unverified carrier rates unavailable. Implement explicit source, date, currency, unit, service and additional-charge semantics before enabling more quotes.
4. Use a separate government-charge model. Do not imply all fees are known when only GST/HST or a border-tariff statement is available.
5. Run scheduled monitors on the deployment platform with persisted last-success records, alerting, schema checks, immutable snapshots and rollback. A workflow file alone is not an operating update service.
6. Publish coverage and freshness by jurisdiction and domain. Unknown, unavailable, not applicable and verified zero must remain distinct.

## Evidence collected

The saved catalogue and ArcGIS JSON were fetched directly from official endpoints. The two GeoJSON extracts were successfully queried and inspected for record count and period. Candidate BC and New Brunswick endpoints were located through official metadata but not fully imported or schema-tested. Carrier documents and indexes were inspected through the web tool. No new amount has been promoted to an app quote.
