# Eastern provincial well sources

Research date is October 17, 2026 in America/Edmonton. This report describes source evidence and acquisition findings. It does not certify current national completeness.

Throughput checkpoint is not applicable to this read-only investigation. The work searched primary catalogues, tested actual endpoints, validated full small datasets, and prepared two integration configs. No external messages were sent.

## Nova Scotia has two reusable historical inventories

The parent can integrate 125 onshore well records and 211 offshore well records under explicit open licences. These are source records, including re-entries, not a count of unique physical sites. The two sets have no shared exact well names or coincident geometry. Their nearest coordinate pair is approximately 0.429 degrees apart.

### Onshore inventory

[Nova Scotia's source metadata](https://data.novascotia.ca/api/views/5q4c-27fh.json) identifies the Nova Scotia Open Government Licence and says the observations run through February 1, 2016. [The federal catalogue](https://open.canada.ca/data/en/dataset/542f8d90-56ad-e0c4-d602-e6495d74553b) confirms the licence and historical coverage. Its later catalogue timestamps do not change that observation date.

The [official shapefile export](https://data.novascotia.ca/api/geospatial/5q4c-27fh?method=export&format=Shapefile) downloads successfully. The archive has WGS84 point geometry and lowercase field names. Its basename includes a generated identifier, so select the sole `.shp` suffix rather than a fixed filename.

The export contains 131 features. Six are empty placeholders. They have source object IDs 126 through 131, null identity and descriptive fields, zero easting and northing, and geometry latitude zero. Their longitude is approximately -67.4887438825. This coordinate is consistent with a zero projected coordinate transformed to WGS84, not a well in Nova Scotia. `ns-onshore-placeholders.json` preserves every original property and geometry for these six rows. Shapefile readers convert null character fields into empty strings, so the exclusion predicate must accept either representation.

Exactly 125 records remain. Their `well_id` values are unique. The source reports 115 as Plugged and Abandoned and 10 as Suspended. Preserve those historical statuses and the observation date. Orphan designation and reclamation remain unknown. The current separate viewer has 143 records, so this open historical export cannot certify current coverage.

`acquisition-config.json` contains the exact source, identity, field mapping, date, and reviewed exclusion predicate. The production release must record 131 acquired source features, 125 normalized records, and six quarantined placeholders. Any other missing or malformed record must fail validation instead of disappearing.

### Offshore inventory

[Federal dataset 6278d435-fdd6-4889-a3fb-7f31134cf8eb](https://open.canada.ca/data/en/dataset/6278d435-fdd6-4889-a3fb-7f31134cf8eb) explicitly uses the Open Government Licence Canada. Its publisher supplies the [NRCan ArcGIS layer](https://maps-cartes.services.geo.ca/server_serveur/rest/services/NRCan/Nova_Scotia_Offshore_Petroleum_en/MapServer/0). Full ID enumeration and feature acquisition both return exactly 211 records. All report `Well_1` as `P&A`.

The directory includes re-entries. `D__` is not a safe unique key because two records have zero. Name plus well number is also insufficient. Two Evangeline H-98 records have different spud dates and drilling rigs. The composite of `Well_Name`, `Well_Nam_1`, and `Spud_Date` is nonempty and unique across all 211 records. The parent can hash a canonical representation of these three values for stable source-record identity.

The catalogue says the directory was last updated in January 2020. The service layer title says 2022. The catalogue's dataset modification date is January 9, 2024 and its metadata modification date is September 4, 2025. These dates describe different things. Preserve the conflicting directory labels as source-date detail and mark current completeness unresolved. Do not turn the 2024 or 2025 catalogue date into a well observation date. The catalogue separately reports that all active projects were abandoned and decommissioned by November 2020.

Spud and termination dates are drilling events. Neither is an abandonment date. Original numeric latitude and longitude attributes use the source datum. Acquire geometry through `outSR=4326` and preserve the raw coordinate strings for provenance.

The same open dataset includes [offshore pipeline layer 3](https://maps-cartes.services.geo.ca/server_serveur/rest/services/NRCan/Nova_Scotia_Offshore_Petroleum_en/MapServer/3). The catalogue says these lines were all flushed and abandoned by October 2021. This is a reusable historical abandoned-pipeline source, not current operating transport capacity.

## Quebec remains a permission gap

Actual Donnees Quebec CKAN queries returned 17 results for `hydrocarbures` and seven for `puits`. Their full responses are in `qc-hydro.json` and `qc-puits.json`. None supplies a petroleum well inventory. The openly licensed SIH and RSESQ datasets concern groundwater and observation wells. Substituting them would change the subject of the map.

The existing SIGPEG inventory remains subject to its [source-specific licence](https://sigpeg.mrn.gouv.qc.ca/gpg/hydrocarbures/Licence_utilisation.pdf). No independently open petroleum inventory was found in this bounded search. The [official well-security page](https://www.quebec.ca/agriculture-environnement-et-ressources-naturelles/energie/production-approvisionnement-distribution/puits-hydrocarbures/securisation) provides `demandes.hydrocarbures@economie.gouv.qc.ca`.

The needed request is written permission to publish and redistribute the current point inventory, normalized attributes, downloadable records, and archived snapshots in a free noncommercial public atlas, with attribution. Request the current status and responsibility fields, their code definitions, the authoritative count, and the update endpoint. Permission for a screenshot or internal GIS use would not cover this product.

## Newfoundland and Labrador has no verified open replacement yet

The onshore source's restriction remains unresolved. The offshore regulator has an actual downloadable shapefile hub. Its [official hub page](https://home-cnlopb.hub.arcgis.com/pages/shapefiles) links separate exploration, delineation, development, dual-classified, and abandoned-wellhead datasets. Exact item metadata was acquired for four source items and saved as `nl-item-*.json`.

Those item licence fields state an as-is disclaimer and prohibit implying regulator endorsement. They do not explicitly grant redistribution. The regulator's [general copyright notice](https://www.cnloer.ca/disclaimer/) prohibits unauthorized reproduction. Public downloads and a completed confidentiality period do not establish an open redistribution licence.

The request must cover both the provincial onshore owner and C-NLOER offshore records. Ask for permission to normalize and publicly redistribute coordinates, source IDs, names, statuses, dates, and future releases, including downloadable copies. Ask C-NLOER whether the item-specific shapefile terms authorize this use. Ask for a machine-readable current schedule of wells with stable IDs and classification definitions. The [regulator's guideline page](https://www.cnlopb.ca/legislation/guidelines/) lists `information@cnlopb.ca`. Its copyright notice lists the Information and Privacy Coordinator at 709-778-1467.

NRCan's [BASIN database](https://basin.marine-geo.canada.ca/index_e.php) contains historical northern and eastern exploration-well information. Its [disclaimer](https://basin.marine-geo.canada.ca/disclaimer_e.php) explains confidentiality periods and says no privileged information is included. That is not dataset-specific open-licence evidence, and the database includes industry and regulator sources. It was not promoted as an alternative with assumed rights or current completeness.

## New Brunswick needs the petroleum inventory and its terms

The [official ONG viewer description](https://www.gnb.ca/en/campaign/geonb/applications/oil-gas.html) says wells and rights data come directly from the responsible energy department. The earlier verified 49-point viewer layer is not a complete historical inventory. The public [ERD OpenData directory](https://gis-erd-der.gnb.ca/server/rest/services/OpenData) was inspected successfully. Its `NBGS_Exploration_Drillholes` service describes mineral exploration drilling reported to the mining recorder. It is not an oil and gas well inventory. The complete service metadata is preserved in `nb-drill-service.json`.

The generic [New Brunswick Open Government Licence](https://www.gnb.ca/en/campaign/geonb/open-government-license.html) exists. This investigation did not establish that it licenses the ONG source layer or the full petroleum borehole database. The GeoNB catalogue returned HTTP 403 in direct probes, and no access workaround was attempted.

The needed response is an authoritative export of all petroleum well records, with stable IDs, coordinates, current closure and orphan definitions, record dates, a refresh endpoint, and written confirmation that the specific data is available under the New Brunswick OGL or equivalent public redistribution permission. Direct the request through the Department of Natural Resources' petroleum data service linked by the [official oil and natural gas page](https://www2.gnb.ca/content/gnb/en/departments/erd/energy/content/minerals/content/Oil_Gas.html).

## Prince Edward Island needs an updated inventory and publication permission

The existing 2007 publication remains historical evidence. No current openly licensed petroleum inventory was found. The open-government catalogue contains `OD0040 Water Well Records` under a PEI open licence, but those records concern groundwater. They cannot substitute for petroleum records.

PEI provides an [official copyright permission request](https://www.princeedwardisland.ca/en/service/request-use-of-wordmark-or-copyrighted-material), with `creativeservices@gov.pe.ca` as the listed contact. Request normalized public map and download rights to the petroleum inventory and later revisions. Separately request the current source inventory, locations, status dates, and distinctions among re-entries, onshore, and offshore wells. A general permission for government images would not establish permission for this data use.

## Proof and integration artifacts

`acquisition-config.json` contains both source configs. `NS-onshore-open.zip` is the official unmodified source download. `ns-onshore-data.json` preserves the parallel official GeoJSON export. `ns-offshore-wells.json` preserves all offshore records, and `ns-offshore-ids.json` preserves independent ID enumeration. The source licence metadata is saved in `ns-onshore-meta.json` and `ns-offshore.json`.

Run `python3 work/launch-followup/eastern/verify_sources.py` from the workspace root. It validates the actual files and writes `ACQUISITION-PROOF.json`. That proof includes counts, excluded source object IDs, source-file hashes, unique identities, and the cross-source geometry comparison.

The Prove It Works principle changed the result materially. Full-record validation rejected the inherited 131-well claim and found six empty equatorial placeholders. The same validation rejected two tempting offshore identity fields before they could merge separate records.
