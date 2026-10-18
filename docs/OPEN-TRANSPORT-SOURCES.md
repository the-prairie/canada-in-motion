# Open infrastructure and transport references

Checked October 17, 2026 in America/Edmonton. Direct HTTP acquisitions ran after midnight UTC on October 18.

## Usable open alternatives

The [NRCan CanVec Resource Management catalogue](https://open.canada.ca/data/en/dataset/92dbea79-f644-4a62-b25e-8eb993ca0264) explicitly licenses its data under the Open Government Licence Canada. The national 1:250,000 ZIP is 1,624,084 bytes. Its HTTP last-modified timestamp is July 24, 2019. The normalized `assets/historical-infrastructure.geojson` contains 1,253 pipeline geometries and 21 refinery points. Pipeline record date ranges end no later than 2002. Refineries carry 2016 dates. These dates are preserved per feature. Catalogue modification in December 2025 does not update those underlying observations.

This layer can legally replace restricted geometry for historical geographic context. It does not resolve current pipeline inventory coverage, current operating status, current ownership, or a route's applicability to a carrier price. No restricted CER map coordinates were used. The script converts the source CRS to WGS84 and verifies finite coordinates, unique source IDs, and valid line geometry. It uses the project's existing pyshp and pyproj dependencies.

The [CER pipeline attributes catalogue](https://open.canada.ca/data/en/dataset/16282d1a-383f-4b9e-b703-a3ee21e59dc5) also carries OGL Canada. `assets/pipeline-attributes.json` contains all 26 downloaded records. Source HTTP last-modified is January 23, 2026. The table includes commodities, descriptive capacity, route descriptions, lengths, and regulator links. It covers major federal systems. The map URLs in this table do not license the linked map geometry.

The [CER benchmark toll catalogue](https://open.canada.ca/data/en/dataset/e00172b8-35c2-4651-a8c5-13ab30bd7236) provides 25 English system CSVs and a dictionary under OGL Canada. `assets/benchmark-tolls.json` retains the latest observed date in each downloaded system on or before the explicit snapshot date. Every row preserves the raw date, operator, pipeline, path, product, service, toll, unit, tariff identifiers, and regulator evidence URLs. The schema sets `eligibleForQuote` to false and `currentValidity` to `not-verified`. These are source-backed references, not current prices or total shipping costs.

The completed acquisition contains 1,395,571 raw history rows and 430,318,424 raw bytes across all 25 systems. It produces 216 snapshot rows. Latest per-system observation dates range from June 30, 2016 to July 1, 2026, so each row group needs its source date visible. The CSV histories require substantial downloads. Express alone is 146,656,151 bytes. The normalized reference snapshot is small. The acquisition script limits each response to 200 MB and retains hashes and source URLs. Source dates are authoritative for the observations. Retrieval timestamps do not establish current validity.

## Actual source defects handled

TC Mainline includes ten January 2027 records. A latest-date calculation without an as-of restriction would present future rows. The script excludes rows after `--as-of`, which defaults to the current UTC acquisition date, and reports `excludedFutureRows`.

Vector contains three rows without dates. The script excludes these from dated snapshots and reports `excludedUndatedRows`. It does not guess dates from adjacent rows. A malformed non-empty date or changed CSV schema fails acquisition. The original full CSV remains linked for inspection.

## Trans Mountain monitor repair

The [official tariff 123 PDF](https://docs.transmountain.com/Tolls-and-Tariffs/Interim-Tariff-No.-123.pdf) downloaded successfully. It is 399,372 bytes, last modified April 7, 2026. The [operator index](https://www.transmountain.com/tolls-tariffs) failed with a TLS protocol error in the local Python runtime and returned a Cloudflare403 in modern Node. No challenge or access control was bypassed.

`monitor-replacements.json` replaces the failing index monitor with the accessible document and adds the [CER toll proceeding](https://www.rec-cer.gc.ca/en/applications-hearings/view-applications-projects/trans-mountain-application-interim-tolls/) plus the open benchmark catalogue. A hash of tariff123 cannot detect a differently named successor by itself. The paired monitors preserve that limitation and never auto-promote prices. The existing index remains a source link for a person to inspect.

CER records settlement approval on September 28, 2026. The [July operator settlement announcement](https://www.transmountain.com/news/trans-mountain-reaches-settlement-agreement-with-shippers) had proposed a possible January 1, 2027 effective date. That proposed date is insufficient to establish final settlement applicability. The filed decision endpoint returned502 during this research. Preserve the app's dated quote restriction until the final decision and implementing tariff are checked.

## Other carrier schedules

The [TC Mainline approved toll schedule](https://www.tccustomerexpress.com/docs/ml_regulatory_tariff/List%20of%20Approved%20Tolls%20%282022%20to%202026%29%20Abandonment%20Surcharges%20%282026%29%20and%20Rate%20Riders%20%282026%29.pdf) is accessible and identifies base tolls through December31,2026 plus separate2026 abandonment surcharges and rate riders. It distinguishes monthly contract-demand charges from daily equivalents. Delivery pressure and Dawn receipt charges apply to particular points. This is enough for a linked dated reference. A complete quote needs service, capacity, fuel, receipt and delivery selections, and contract eligibility. The source warns that filed CER documents govern conflicts.

The Enbridge October2026 carrier schedule remains a separate applicability review. Its direct PDF could not be fetched by the web tool in this pass. The CER Mainline CSV is a legitimate open alternative for dated benchmarks, with a May29,2026 latest observation. It cannot establish October2026 all-in charges. Do not replace an international joint rate with a Canadian local segment amount.

## Remaining dependencies

Historical pipelines and refinery context, major federal pipeline attributes, and dated benchmark references need no additional permission beyond OGL attribution. The new assets do not require a map-provider account or API key.

Current, complete national geometry still requires a current openly licensed inventory or an explicit scope change to historical context. Current facility operation and capacity require facility-level regulator or operator evidence. Actual all-goods contracted prices remain unavailable from these sources. A user's own rates can be imported only with their permission to publish them.

Production publication review and integration remain the parent task's responsibility. No production files were changed here. No external messages were sent.

## Verification choices

The Model the Domain principle led to separate historical geometry and dated benchmark structures. The benchmark assets have explicit eligibility flags and retain source units. Parent integration must keep them out of quote calculations. Prove It Works required real ZIP and CSV downloads, counts, raw schema inspection, and byte hashes. The source's future and undated records were discovered through actual payload validation.
