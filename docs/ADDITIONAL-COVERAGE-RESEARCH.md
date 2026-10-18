# Remaining coverage investigation — October 18, 2026

## Reusable improvement: British Columbia permitted infrastructure

Actual complete acquisitions produced **6,144 pipeline segment permit records and 11,717 facility permit records** from the BC Energy Regulator. The latter include **13 records whose source type is LNG Facility**. This is useful provincial infrastructure coverage, not a complete inventory of operating assets. Both official catalogue descriptions limit scope to approved locations collected on or after July 11, 2016 and state that the datasets update nightly.

Exact official items:

- [Pipeline Segments (Permitted)](https://www.arcgis.com/home/item.html?id=359b7e14fafa4abc84ff873bc55015fb)
- [Facility Locations (Permitted)](https://www.arcgis.com/home/item.html?id=5ace26f614b9435492d679d766430143)
- [Orphan Pipeline](https://www.arcgis.com/home/item.html?id=dadf68fc98054d758900b61742964d2c)

Each item's `licenseInfo` explicitly links the [BCER Open Data Licence](https://www.bc-er.ca/files/gis/BCER-Open-Data-Licence.pdf). It permits adaptation and redistribution with attribution, subject to exclusions. The acquisition checks the official owner, exact source URL and licence link rather than assuming every public ArcGIS layer is open. Attribution: “Contains information licensed under the BC Energy Regulator Open Data Licence.” Do not imply regulator endorsement.

`bc-permitted-infrastructure.geojson` is the full normalized WGS84 download: 17,861 features, 18,462,290 bytes. Project number plus segment number is unique for all pipeline records; facility ID is unique for all facility records. Original ArcGIS object IDs are also preserved but are not the stable business key. All features have finite valid WGS84 geometry. Independent `returnIdsOnly` and `returnCountOnly` queries agree with fetched records. No records were excluded. `BCER-ACQUISITION.json` and `BCER-VERIFIED.json` preserve source URLs, counts, hashes, acquisition dates and distributions.

`sourceStatus` preserves the source's activity status verbatim. `operatingStatus` is null, because the source metadata describes activity/approval status and the acquisition does not independently establish operations. Pipeline states include Active 4,164, New 1,023, Abandoned 562, Deactivated 355, Removed 23 and Out of Jurisdiction 17. Facility states include Active 5,961, Removed 3,239, Inactive 1,056, Suspended 973, Permit Approved 378, Under Construction 102, Construction Complete seven and COR one. None of these totals means operating capacity or a current number of independently inspected sites.

`bc-orphan-pipeline-sites.json` preserves **27 separate table rows**: 21 Reclaimed and six Inactive. No geometry is supplied. These rows are not joined to the permit geometry, and non-membership does not establish non-orphan status. The table's Reclaimed definition includes both surface reclamation and completion of restoration; it must not be converted into a claim that every row has a restoration certificate.

## Display geometry and performance

`bc-permitted-map.geojson` is a separate optional display asset, **6,269,717 bytes** uncompressed. It preserves every feature and business ID, source status, source ID, approval date and null operational status. Source names and licence details resolve through `metadata.sources[sourceId]` instead of duplicating long text 17,861 times.

Pipeline geometry uses Douglas–Peucker simplification with a **10 metre tolerance in EPSG:3005 (BC Albers)**. It retains original endpoints and six-decimal WGS84 vertex coordinates. Every removed vertex was checked against its retained segment in the projected metre grid; the measured maximum deviation is 9.999034793 metres. Pipeline vertices decrease from 374,924 to 63,051. Facility point geometry is unchanged. The full normalized download remains available for source inspection. This is not an engineering, survey or navigation product.

The layer should be lazy-loaded on explicit selection and use Canvas rendering for its many features. Even after conservative simplification, retaining the requested metadata keeps it above a five-megabyte uncompressed target. Do not silently discard features to reach a size goal.

Reproduce from this directory:

```sh
python acquire_bcer.py
python normalize_bcer.py
python generalize_bcer.py
python -m unittest discover -p test_bcer.py
```

`generalize_bcer.py` needs the existing `pyproj` dependency. Three offline behavioral checks pass: complete identity/semantic preservation, unchanged points and segment endpoints, conservative simplification around a deliberate bend, and isolation of the orphan table. The acquisition validates all source IDs and counts separately.

## Remaining provincial well gaps

The earlier detailed audit was read before this investigation. A second primary-source search did not establish a new open current petroleum inventory for Québec, Newfoundland and Labrador, New Brunswick, Prince Edward Island or Nova Scotia. Their earlier permissions requirements remain specific, not generic warnings.

- **Québec:** the official [well-security page](https://www.quebec.ca/agriculture-environnement-et-ressources-naturelles/energie/production-approvisionnement-distribution/puits-hydrocarbures/securisation) still identifies 907 wells/boreholes, including 779 inactive. It links the existing restricted SIGPEG map, not an open replacement export. Contact remains `demandes.hydrocarbures@economie.gouv.qc.ca`. Ask for explicit redistribution of point records, normalization, downloads and periodic snapshots under public hosting.
- **Newfoundland and Labrador:** the federal catalogue's exact “BASIN Database” search returns the already-integrated Nova Scotia offshore record, not an openly licensed Newfoundland well inventory. Public access to BASIN or C-NLOER downloads does not override the identified source copyright restrictions. Separate provincial onshore and C-NLOER offshore permission/inventory requests remain necessary.
- **New Brunswick:** the [ONG viewer description](https://www.gnb.ca/en/campaign/geonb/applications/oil-gas.html) confirms live departmental data but contains no redistribution grant. The [New Brunswick open licence](https://www.gnb.ca/en/campaign/geonb/open-government-license.html) defines covered information as information offered under that licence; its existence does not itself attach it to the ONG feed. Request confirmation for the specific complete petroleum export, not a general statement that GeoNB has open data.
- **Prince Edward Island:** the existing current-inventory and redistribution requests remain unresolved. No water-well substitution was made.
- **Nova Scotia:** the [official onshore atlas page](https://novascotia.ca/onshore-atlas/) allows exploration/download through its viewer and says the government openly provides science. Its current 143-record feed still lacks a verified explicit licence for normalized public bulk redistribution. The catalogue continues to identify the separately open onshore dataset as observations through February 1, 2016. Later catalogue modification dates do not make that inventory current. Request that the current feed be attached to the Nova Scotia OGL or supplied with explicit publication permission.

No external messages have been sent. The existing production `docs/DATA-ACCESS-REQUESTS.md` contains the request text and authority contacts. A person acting for the project must send or authorize those requests, or provide the resulting permission and datasets. Approving a public beta does not license excluded third-party data.

## National rates and federal attributes

The previously integrated 26-system CER attributes table and 25-system benchmark toll snapshot remain the usable federal references. A benchmark's observation date is not a tariff validity interval or proof of an all-in shipment price. No new current carrier rate was promoted in this investigation. Full national transport estimates still require defined commodity, service, receipt/delivery points, tariff effective interval, mandatory surcharges and applicable government charges. Contract rates require the carrier's or shipper's publication rights.

## Production handoff

All new files are in `work/remaining-coverage/`; no production code or public data was edited. The parent can integrate the BCER optional layer after release validation and UI testing. Keep the national infrastructure completeness marker partial, retain the post-July-2016 scope prominently, and do not include permit counts in the well-record total.

## Additional national reference: NPRI refinery-classified facilities

A verified open alternative adds **18 refinery-classified facilities whose latest report is 2024**, across Alberta, BC, Saskatchewan, Ontario, Québec and New Brunswick. The [ECCC facility-location catalogue](https://open.canada.ca/data/en/dataset/3b7dd693-52dc-4e55-828f-37c8172f009b) explicitly uses OGL Canada. The actual 13,651,974-byte CSV contains 24,552 last-report facility rows. Filtering its NAICS 324110 yields 19 rows: 18 latest-report 2024 and one historical 1994 row, which is excluded by the declared year selection. The source includes processing and diluent-recovery facilities within its refinery classification; these are not automatically 18 crude refineries currently operating.

`npri-refinery-reporters-2024.geojson` is a small optional evidence asset. CSV identity, source year and province match exactly to the official 2024 NPRI ArcGIS geometry, acquired as WGS84. Raw CSV coordinates are NAD83, so they were not silently relabelled WGS84. Every feature keeps its latest report year and null operating status. `normalize_npri.py` reconstructs the asset from saved actual source evidence. This supplementary asset is not yet wired into the production refresh module; the BCER integration is the priority for this launch.

Two upstream defects matter before broader NPRI integration:

1. The catalogue's old direct `.csv` URL returns an HTML app shell with HTTP 200. The official ECCC catalogue's current `/api/file?path=` download mechanism returns the actual CSV. Save and validate content/schema, not only response status.
2. The official ArcGIS `NAICS__Code_SCIAN` field gives 84110 for the same 18 records whose authoritative CSV says 324110. A naive ArcGIS query for NAICS 324110 returns zero and would falsely imply no refineries. The candidate uses CSV classification, exact NPRI ID joins and explicit provenance. The discrepancy must be revisited in a future NPRI adapter; no numerical repair rule was guessed.

This resolves a usable, more recent national refinery reference, not the demand for complete current operating/refinery/LNG coverage. The [NPRI search](https://pollution-waste.canada.ca/national-release-inventory/) also warns that 2025 data are preliminary as of the investigated release. The candidate does not promote those preliminary records.

## Portable production refresh verified

The final reusable modules are `production/bcer_acquire.py`, `bcer_normalize.py`, `bcer_generalize.py`, and `refresh_bcer.py`, with six passing tests in `test_bcer_refresh.py`. The wrapper stages one whole output group, validates exact expected filenames, checksums, source/licence identity, source/asset counts, stable display/full identities, null operational claims and the oldest acquisition date. A source-count decline above 5% fails before replacement. Acquisition or validation failure retains the previous group. Seven-day reuse verifies the prior bytes and preserves their actual source acquisition dates.

A second complete fresh acquisition succeeded, and a repeat execution reused the validated group without changing its source timestamp. Ready output root:

`work/remaining-coverage/refresh-proof/data/bc-infrastructure/`

It contains exactly `map.geojson`, `full.geojson`, `orphan-pipelines.json`, and `manifest.json`. The metadata lookup description was corrected after the acquisition from the research filename to the portable `full.geojson` filename; the map hash and build timestamp were rebuilt, while acquisition timestamps remained unchanged. The generator includes the same correction for future refreshes. The actual oldest source acquisition time is `2026-10-18T07:01:33.845292+00:00`.

Run after copying the modules to the repository's `pipeline/` directory:

```sh
python pipeline/refresh_bcer.py
python -m unittest discover -s pipeline -p test_bcer_refresh.py
```

The default root is the parent of the module directory. `--root /path/to/repository` overrides it; `--force` requests a fresh acquisition even within seven days. Schedule this with the existing data workflow and persist the complete `data/bc-infrastructure/` group between runs. Do not restore only its manifest.
